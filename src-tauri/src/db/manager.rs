use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

use parking_lot::RwLock;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::db::driver::{Driver, ExecResult};
use crate::db::postgres::PostgresDriver;
use crate::db::sqlite::SqliteDriver;
use crate::db::types::{
    ConnectRequest, ConnectionConfig, ConnectionInfo, Dialect, PendingWrite, QueryColumn,
    QueryPage, RunQueryRequest, SchemaNode, TableDescription, is_mutating_sql,
    split_sql_statements,
};
use crate::error::{AppError, AppResult, is_connection_lost};
use crate::secrets::SecretStore;

struct LiveConnection {
    #[allow(dead_code)]
    config: ConnectionConfig,
    driver: Arc<dyn Driver>,
}

#[derive(Clone)]
pub struct StoredQuery {
    #[allow(dead_code)]
    pub id: Uuid,
    #[allow(dead_code)]
    pub conn_id: Uuid,
    pub sql: String,
    pub columns: Vec<QueryColumn>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub affected_rows: Option<u64>,
    pub truncated: bool,
    pub duration_ms: u64,
}

pub struct ConnectionManager {
    data_dir: PathBuf,
    connections: RwLock<HashMap<Uuid, LiveConnection>>,
    configs: RwLock<Vec<ConnectionConfig>>,
    queries: RwLock<HashMap<Uuid, StoredQuery>>,
    cancel_tokens: RwLock<HashMap<Uuid, CancellationToken>>,
    /// Staged writes awaiting human-in-the-loop approval.
    pending_writes: RwLock<HashMap<Uuid, PendingWrite>>,
    secrets: SecretStore,
}

impl ConnectionManager {
    pub fn new(data_dir: PathBuf) -> Self {
        let secrets = SecretStore::new("dev.prompton.desktop");
        let configs = Self::load_configs(&data_dir).unwrap_or_default();
        Self {
            data_dir,
            connections: RwLock::new(HashMap::new()),
            configs: RwLock::new(configs),
            queries: RwLock::new(HashMap::new()),
            cancel_tokens: RwLock::new(HashMap::new()),
            pending_writes: RwLock::new(HashMap::new()),
            secrets,
        }
    }

    fn configs_path(data_dir: &PathBuf) -> PathBuf {
        data_dir.join("connections.json")
    }

    fn load_configs(data_dir: &PathBuf) -> AppResult<Vec<ConnectionConfig>> {
        let path = Self::configs_path(data_dir);
        if !path.exists() {
            return Ok(vec![]);
        }
        let raw = std::fs::read_to_string(path)?;
        Ok(serde_json::from_str(&raw)?)
    }

    fn persist_configs(&self) -> AppResult<()> {
        std::fs::create_dir_all(&self.data_dir)?;
        let configs = self.configs.read().clone();
        let raw = serde_json::to_string_pretty(&configs)?;
        std::fs::write(Self::configs_path(&self.data_dir), raw)?;
        Ok(())
    }

    pub fn list(&self) -> Vec<ConnectionInfo> {
        let configs = self.configs.read().clone();
        let live = self.connections.read();
        configs
            .into_iter()
            .map(|c| {
                let connected = live.contains_key(&c.id);
                let summary = match c.dialect {
                    Dialect::Postgres => format!(
                        "{}:{}/{}",
                        c.host.as_deref().unwrap_or("localhost"),
                        c.port.unwrap_or(5432),
                        c.database.as_deref().unwrap_or("")
                    ),
                    Dialect::Sqlite => c.file_path.clone().unwrap_or_default(),
                };
                ConnectionInfo {
                    id: c.id,
                    name: c.name,
                    dialect: c.dialect,
                    color: c.color,
                    connected,
                    summary,
                    is_production: c.is_production,
                    admin_writes_unlocked: c.admin_writes_unlocked,
                }
            })
            .collect()
    }

    pub async fn connect(&self, req: ConnectRequest) -> AppResult<ConnectionInfo> {
        if req.dialect == Dialect::Sqlite {
            let path = req.file_path.as_deref().unwrap_or("").trim();
            if path.is_empty() {
                return Err(AppError::msg(
                    "SQLite file path is required (or use Open demo SQLite)",
                ));
            }
        }

        let id = Uuid::new_v4();
        let is_production = req.is_production.unwrap_or(match req.dialect {
            Dialect::Postgres => true,
            Dialect::Sqlite => false,
        });
        let config = ConnectionConfig {
            id,
            name: req.name,
            dialect: req.dialect,
            host: req.host,
            port: req.port,
            database: req.database,
            username: req.username,
            file_path: req.file_path,
            color: req.color.unwrap_or_else(|| {
                if req.dialect == Dialect::Sqlite {
                    "oklch(0.55 0 0)".into()
                } else {
                    "oklch(0.72 0 0)".into()
                }
            }),
            ssl_mode: req.ssl_mode,
            is_production,
            admin_writes_unlocked: false,
        };

        if let Some(password) = &req.password {
            self.secrets.set_password(&id, password)?;
        }

        let driver: Arc<dyn Driver> = match config.dialect {
            Dialect::Postgres => {
                let password = req
                    .password
                    .clone()
                    .or_else(|| self.secrets.get_password(&id).ok().flatten())
                    .unwrap_or_default();
                Arc::new(PostgresDriver::connect(&config, &password).await?)
            }
            Dialect::Sqlite => Arc::new(SqliteDriver::connect(&config).await?),
        };

        driver.ping().await?;

        {
            let mut configs = self.configs.write();
            configs.retain(|c| c.id != id);
            configs.push(config.clone());
        }
        self.persist_configs()?;

        self.connections.write().insert(
            id,
            LiveConnection {
                config: config.clone(),
                driver,
            },
        );

        Ok(ConnectionInfo {
            id,
            name: config.name,
            dialect: config.dialect,
            color: config.color,
            connected: true,
            summary: match config.dialect {
                Dialect::Postgres => format!(
                    "{}:{}/{}",
                    config.host.as_deref().unwrap_or("localhost"),
                    config.port.unwrap_or(5432),
                    config.database.as_deref().unwrap_or("")
                ),
                Dialect::Sqlite => config.file_path.unwrap_or_default(),
            },
            is_production: config.is_production,
            admin_writes_unlocked: config.admin_writes_unlocked,
        })
    }

    pub async fn reconnect(&self, id: Uuid) -> AppResult<ConnectionInfo> {
        let config = self
            .configs
            .read()
            .iter()
            .find(|c| c.id == id)
            .cloned()
            .ok_or_else(|| AppError::msg("Connection not found"))?;

        let driver: Arc<dyn Driver> = match config.dialect {
            Dialect::Postgres => {
                let password = self
                    .secrets
                    .get_password(&id)?
                    .unwrap_or_default();
                Arc::new(PostgresDriver::connect(&config, &password).await?)
            }
            Dialect::Sqlite => Arc::new(SqliteDriver::connect(&config).await?),
        };
        driver.ping().await?;
        self.connections.write().insert(
            id,
            LiveConnection {
                config: config.clone(),
                driver,
            },
        );
        Ok(self
            .list()
            .into_iter()
            .find(|c| c.id == id)
            .ok_or_else(|| AppError::msg("Connection missing after reconnect"))?)
    }

    pub fn disconnect(&self, id: Uuid) -> AppResult<()> {
        self.connections.write().remove(&id);
        Ok(())
    }

    pub fn remove(&self, id: Uuid) -> AppResult<()> {
        self.connections.write().remove(&id);
        self.configs.write().retain(|c| c.id != id);
        let _ = self.secrets.delete_password(&id);
        self.persist_configs()?;
        Ok(())
    }

    fn driver(&self, id: Uuid) -> AppResult<Arc<dyn Driver>> {
        self.connections
            .read()
            .get(&id)
            .map(|c| c.driver.clone())
            .ok_or_else(|| AppError::msg("Connection is not active. Connect first."))
    }

    /// Drop a live pool when transport dies so the UI can show Offline.
    fn note_driver_error(&self, id: Uuid, err: AppError) -> AppError {
        if is_connection_lost(&err) {
            self.connections.write().remove(&id);
            AppError::msg(format!("Connection lost ({err}). Reconnect to continue."))
        } else {
            err
        }
    }

    pub async fn ping(&self, id: Uuid) -> AppResult<()> {
        let driver = self.driver(id)?;
        match driver.ping().await {
            Ok(()) => Ok(()),
            Err(e) => Err(self.note_driver_error(id, e)),
        }
    }

    pub async fn list_schemas(&self, id: Uuid) -> AppResult<Vec<SchemaNode>> {
        let driver = self.driver(id)?;
        match driver.list_schemas().await {
            Ok(v) => Ok(v),
            Err(e) => Err(self.note_driver_error(id, e)),
        }
    }

    pub async fn describe_table(
        &self,
        id: Uuid,
        schema: String,
        table: String,
    ) -> AppResult<TableDescription> {
        let driver = self.driver(id)?;
        match driver.describe_table(&schema, &table).await {
            Ok(v) => Ok(v),
            Err(e) => Err(self.note_driver_error(id, e)),
        }
    }

    pub async fn sample_rows(
        &self,
        id: Uuid,
        schema: String,
        table: String,
        limit: usize,
    ) -> AppResult<QueryPage> {
        let started = Instant::now();
        let driver = self.driver(id)?;
        let result = match driver.sample_rows(&schema, &table, limit).await {
            Ok(v) => v,
            Err(e) => return Err(self.note_driver_error(id, e)),
        };
        let query_id = Uuid::new_v4();
        let page = QueryPage {
            query_id,
            columns: result
                .columns
                .iter()
                .map(|(n, t)| QueryColumn {
                    name: n.clone(),
                    data_type: t.clone(),
                })
                .collect(),
            rows: result.rows.clone(),
            offset: 0,
            limit,
            total_rows: result.rows.len(),
            truncated: result.truncated,
            affected_rows: result.affected_rows,
            duration_ms: started.elapsed().as_millis() as u64,
            sql: format!("SAMPLE {schema}.{table}"),
        };
        self.queries.write().insert(
            query_id,
            StoredQuery {
                id: query_id,
                conn_id: id,
                sql: page.sql.clone(),
                columns: page.columns.clone(),
                rows: result.rows,
                affected_rows: result.affected_rows,
                truncated: result.truncated,
                duration_ms: page.duration_ms,
            },
        );
        Ok(page)
    }

    pub async fn run_query(
        &self,
        req: RunQueryRequest,
        _allow_mutating: bool,
    ) -> AppResult<QueryPage> {
        if is_mutating_sql(&req.sql) {
            let is_production = self.is_production(req.conn_id).unwrap_or(true);
            let msg = if is_production {
                "Production database is read-only until human-in-the-loop approval. \
                 Use request_write_approval, then confirm_write."
            } else {
                "Mutating SQL requires human-in-the-loop confirmation before execution. \
                 Use request_write_approval, then confirm_write."
            };
            return Err(AppError::msg(msg));
        }

        self.execute_query(req).await
    }

    /// Stage a mutating statement for HITL. Does not execute.
    pub fn request_write_approval(
        &self,
        conn_id: Uuid,
        sql: String,
        session_id: Option<Uuid>,
    ) -> AppResult<PendingWrite> {
        if !is_mutating_sql(&sql) {
            return Err(AppError::msg(
                "Only mutating SQL (INSERT/UPDATE/DELETE/DDL) can be staged for approval",
            ));
        }
        // Ensure connection exists (config or live).
        let cfg = self
            .configs
            .read()
            .iter()
            .find(|c| c.id == conn_id)
            .cloned()
            .ok_or_else(|| AppError::msg("Connection not found"))?;
        let is_production = cfg.is_production;
        let admin_writes_unlocked = cfg.admin_writes_unlocked;
        let reason = if is_production && !admin_writes_unlocked {
            "PRODUCTION is locked read-only. Approve this write (HITL), or an admin can unlock writes on the connection."
                .into()
        } else if is_production {
            "PRODUCTION write with admin unlock enabled. Human-in-the-loop approval is still required."
                .into()
        } else {
            "Mutating SQL requires human-in-the-loop confirmation before it can run.".into()
        };
        let pending = PendingWrite {
            confirmation_id: Uuid::new_v4(),
            conn_id,
            sql,
            reason,
            is_production,
            session_id,
            admin_writes_unlocked,
        };
        self.pending_writes
            .write()
            .insert(pending.confirmation_id, pending.clone());
        Ok(pending)
    }

    /// Approve or reject a staged write. On approval, executes exactly once.
    pub async fn confirm_write(
        &self,
        confirmation_id: Uuid,
        approved: bool,
        query_id: Option<Uuid>,
    ) -> AppResult<Option<QueryPage>> {
        let pending = self
            .pending_writes
            .write()
            .remove(&confirmation_id)
            .ok_or_else(|| AppError::msg("Write confirmation not found or already resolved"))?;

        if !approved {
            return Ok(None);
        }

        Ok(Some(
            self.execute_query(RunQueryRequest {
                conn_id: pending.conn_id,
                sql: pending.sql,
                page_size: 500,
                query_id,
            })
            .await?,
        ))
    }

    pub fn is_production(&self, conn_id: Uuid) -> AppResult<bool> {
        self.configs
            .read()
            .iter()
            .find(|c| c.id == conn_id)
            .map(|c| c.is_production)
            .ok_or_else(|| AppError::msg("Connection not found"))
    }

    #[allow(dead_code)]
    pub fn admin_writes_unlocked(&self, conn_id: Uuid) -> AppResult<bool> {
        self.configs
            .read()
            .iter()
            .find(|c| c.id == conn_id)
            .map(|c| c.admin_writes_unlocked)
            .ok_or_else(|| AppError::msg("Connection not found"))
    }

    /// True when the agent should treat the connection as hard read-only
    /// (production and admin has not unlocked writes).
    pub fn is_hard_readonly(&self, conn_id: Uuid) -> AppResult<bool> {
        let cfg = self
            .configs
            .read()
            .iter()
            .find(|c| c.id == conn_id)
            .cloned()
            .ok_or_else(|| AppError::msg("Connection not found"))?;
        Ok(cfg.is_production && !cfg.admin_writes_unlocked)
    }

    pub fn set_production(&self, conn_id: Uuid, is_production: bool) -> AppResult<ConnectionInfo> {
        {
            let mut configs = self.configs.write();
            let cfg = configs
                .iter_mut()
                .find(|c| c.id == conn_id)
                .ok_or_else(|| AppError::msg("Connection not found"))?;
            cfg.is_production = is_production;
            // Demoting from production clears the admin unlock flag.
            if !is_production {
                cfg.admin_writes_unlocked = false;
            }
            if let Some(live) = self.connections.write().get_mut(&conn_id) {
                live.config.is_production = is_production;
                if !is_production {
                    live.config.admin_writes_unlocked = false;
                }
            }
        }
        self.persist_configs()?;
        self.list()
            .into_iter()
            .find(|c| c.id == conn_id)
            .ok_or_else(|| AppError::msg("Connection missing after update"))
    }

    /// Admin override: unlock (or re-lock) writes on a production connection.
    /// Even when unlocked, each mutating statement still requires HITL confirm.
    pub fn set_admin_writes_unlocked(
        &self,
        conn_id: Uuid,
        unlocked: bool,
    ) -> AppResult<ConnectionInfo> {
        {
            let mut configs = self.configs.write();
            let cfg = configs
                .iter_mut()
                .find(|c| c.id == conn_id)
                .ok_or_else(|| AppError::msg("Connection not found"))?;
            if unlocked && !cfg.is_production {
                return Err(AppError::msg(
                    "Admin write unlock only applies to production connections. \
                     Mark the connection as production first, or run writes with HITL on non-prod.",
                ));
            }
            cfg.admin_writes_unlocked = unlocked;
            if let Some(live) = self.connections.write().get_mut(&conn_id) {
                live.config.admin_writes_unlocked = unlocked;
            }
        }
        self.persist_configs()?;
        self.list()
            .into_iter()
            .find(|c| c.id == conn_id)
            .ok_or_else(|| AppError::msg("Connection missing after update"))
    }

    /// Internal path for trusted app operations (demo seed). Bypasses HITL.
    pub async fn run_query_trusted(&self, req: RunQueryRequest) -> AppResult<QueryPage> {
        self.execute_query(req).await
    }

    async fn execute_query(&self, req: RunQueryRequest) -> AppResult<QueryPage> {
        let query_id = req.query_id.unwrap_or_else(Uuid::new_v4);
        let token = CancellationToken::new();
        self.cancel_tokens.write().insert(query_id, token.clone());

        let driver = self.driver(req.conn_id)?;
        let statements = split_sql_statements(&req.sql);
        if statements.is_empty() {
            self.cancel_tokens.write().remove(&query_id);
            return Err(AppError::msg("Empty SQL"));
        }

        // Fetch a large window into memory; UI pages through it via fetch_page.
        let max_rows = 50_000;
        let page_size = req.page_size.max(1).min(5_000);
        let started = Instant::now();

        // Run statements sequentially so `SELECT …; DELETE …` cannot hide behind
        // a single-protocol execute, and cancel can land between statements.
        let mut last_rows: Option<ExecResult> = None;
        let mut affected_total: u64 = 0;
        let mut saw_affected = false;
        let mut truncated = false;

        for stmt in &statements {
            if token.is_cancelled() {
                self.cancel_tokens.write().remove(&query_id);
                return Err(AppError::msg("Query cancelled"));
            }
            let result = tokio::select! {
                biased;
                _ = token.cancelled() => {
                    self.cancel_tokens.write().remove(&query_id);
                    return Err(AppError::msg("Query cancelled"));
                }
                res = driver.execute(stmt, max_rows) => res,
            };
            let result = match result {
                Ok(v) => v,
                Err(e) => {
                    self.cancel_tokens.write().remove(&query_id);
                    return Err(self.note_driver_error(req.conn_id, e));
                }
            };
            truncated = truncated || result.truncated;
            if let Some(n) = result.affected_rows {
                affected_total = affected_total.saturating_add(n);
                saw_affected = true;
            }
            if !result.columns.is_empty() || !result.rows.is_empty() {
                last_rows = Some(result);
            } else if last_rows.is_none() {
                last_rows = Some(result);
            }
        }

        self.cancel_tokens.write().remove(&query_id);
        let result = last_rows.unwrap_or(ExecResult {
            columns: vec![],
            rows: vec![],
            affected_rows: if saw_affected {
                Some(affected_total)
            } else {
                None
            },
            truncated: false,
        });
        let affected_rows = if saw_affected {
            Some(affected_total)
        } else {
            result.affected_rows
        };

        let duration_ms = started.elapsed().as_millis() as u64;
        let total_rows = result.rows.len();
        let page_limit = page_size.min(total_rows.max(1));
        let page_rows = result.rows.iter().take(page_limit).cloned().collect();

        let page = QueryPage {
            query_id,
            columns: result
                .columns
                .iter()
                .map(|(n, t)| QueryColumn {
                    name: n.clone(),
                    data_type: t.clone(),
                })
                .collect(),
            rows: page_rows,
            offset: 0,
            limit: page_limit,
            total_rows,
            truncated: truncated || result.truncated,
            affected_rows,
            duration_ms,
            sql: req.sql.clone(),
        };

        self.queries.write().insert(
            query_id,
            StoredQuery {
                id: query_id,
                conn_id: req.conn_id,
                sql: req.sql,
                columns: page.columns.clone(),
                rows: result.rows,
                affected_rows,
                truncated: page.truncated,
                duration_ms,
            },
        );

        Ok(page)
    }

    pub fn cancel_query(&self, query_id: Uuid) -> AppResult<()> {
        if let Some(token) = self.cancel_tokens.write().remove(&query_id) {
            token.cancel();
        }
        Ok(())
    }

    pub fn query_conn_id(&self, query_id: Uuid) -> Option<Uuid> {
        self.queries.read().get(&query_id).map(|q| q.conn_id)
    }

    pub fn fetch_page(&self, query_id: Uuid, offset: usize, limit: usize) -> AppResult<QueryPage> {
        let q = self
            .queries
            .read()
            .get(&query_id)
            .cloned()
            .ok_or_else(|| AppError::msg("Query result not found"))?;
        let limit = limit.max(1).min(5000);
        let rows = q
            .rows
            .iter()
            .skip(offset)
            .take(limit)
            .cloned()
            .collect::<Vec<_>>();
        Ok(QueryPage {
            query_id,
            columns: q.columns,
            rows,
            offset,
            limit,
            total_rows: q.rows.len(),
            truncated: q.truncated,
            affected_rows: q.affected_rows,
            duration_ms: q.duration_ms,
            sql: q.sql,
        })
    }

    pub async fn explain(&self, conn_id: Uuid, sql: String) -> AppResult<String> {
        let driver = self.driver(conn_id)?;
        match driver.explain(&sql).await {
            Ok(v) => Ok(v),
            Err(e) => Err(self.note_driver_error(conn_id, e)),
        }
    }

    #[allow(dead_code)]
    pub fn get_config(&self, id: Uuid) -> Option<ConnectionConfig> {
        self.configs.read().iter().find(|c| c.id == id).cloned()
    }

    /// Create/replace `demo.db` under the app data dir with a large sample
    /// dataset sized for browsing/virtualization demos, then connect.
    pub async fn open_demo_sqlite(&self) -> AppResult<(ConnectionInfo, QueryPage)> {
        std::fs::create_dir_all(&self.data_dir)?;
        let path = self.data_dir.join("demo.db");
        let path_str = path.display().to_string();

        // Drop any existing live demo connection to the same path.
        let existing_ids: Vec<Uuid> = self
            .configs
            .read()
            .iter()
            .filter(|c| {
                c.dialect == Dialect::Sqlite && c.file_path.as_deref() == Some(path_str.as_str())
            })
            .map(|c| c.id)
            .collect();
        for id in existing_ids {
            let _ = self.remove(id);
        }

        // Remove old file so seed is deterministic.
        let _ = std::fs::remove_file(&path);

        let info = self
            .connect(ConnectRequest {
                name: "Demo SQLite".into(),
                dialect: Dialect::Sqlite,
                host: None,
                port: None,
                database: None,
                username: None,
                password: None,
                file_path: Some(path_str),
                color: Some("oklch(0.55 0 0)".into()),
                ssl_mode: None,
                is_production: Some(false),
            })
            .await?;

        let statements = [
            // Faster bulk load for local demo generation.
            "PRAGMA journal_mode = WAL",
            "PRAGMA synchronous = OFF",
            "PRAGMA temp_store = MEMORY",
            "PRAGMA cache_size = -64000",
            "DROP TABLE IF EXISTS order_items",
            "DROP TABLE IF EXISTS orders",
            "DROP TABLE IF EXISTS products",
            "DROP TABLE IF EXISTS categories",
            "DROP TABLE IF EXISTS users",
            "CREATE TABLE categories (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE
            )",
            "CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                city TEXT NOT NULL,
                country TEXT NOT NULL,
                plan TEXT NOT NULL,
                created_at TEXT NOT NULL
            )",
            "CREATE TABLE products (
                id INTEGER PRIMARY KEY,
                category_id INTEGER NOT NULL REFERENCES categories(id),
                sku TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                price_cents INTEGER NOT NULL,
                active INTEGER NOT NULL DEFAULT 1
            )",
            "CREATE TABLE orders (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                status TEXT NOT NULL,
                total_cents INTEGER NOT NULL,
                placed_at TEXT NOT NULL
            )",
            "CREATE TABLE order_items (
                id INTEGER PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES orders(id),
                product_id INTEGER NOT NULL REFERENCES products(id),
                quantity INTEGER NOT NULL,
                unit_price_cents INTEGER NOT NULL
            )",
            "BEGIN IMMEDIATE",
            // 12 categories
            "INSERT INTO categories (id, name) VALUES
                (1, 'Electronics'), (2, 'Books'), (3, 'Clothing'), (4, 'Home'),
                (5, 'Sports'), (6, 'Toys'), (7, 'Grocery'), (8, 'Beauty'),
                (9, 'Automotive'), (10, 'Garden'), (11, 'Office'), (12, 'Music')",
            // 12_000 users
            "INSERT INTO users (id, name, email, city, country, plan, created_at)
             WITH RECURSIVE seq(i) AS (
               SELECT 1 UNION ALL SELECT i + 1 FROM seq WHERE i < 12000
             )
             SELECT
               i,
               'User ' || printf('%05d', i),
               'user' || i || '@example.com',
               CASE (i % 10)
                 WHEN 0 THEN 'San Francisco' WHEN 1 THEN 'Austin' WHEN 2 THEN 'Seattle'
                 WHEN 3 THEN 'New York' WHEN 4 THEN 'Chicago' WHEN 5 THEN 'Denver'
                 WHEN 6 THEN 'Toronto' WHEN 7 THEN 'London' WHEN 8 THEN 'Berlin'
                 ELSE 'Tokyo' END,
               CASE (i % 5)
                 WHEN 0 THEN 'US' WHEN 1 THEN 'CA' WHEN 2 THEN 'UK'
                 WHEN 3 THEN 'DE' ELSE 'JP' END,
               CASE (i % 4)
                 WHEN 0 THEN 'free' WHEN 1 THEN 'pro'
                 WHEN 2 THEN 'team' ELSE 'enterprise' END,
               datetime('2021-01-01', '+' || ((i * 17) % 1800) || ' days',
                        '+' || ((i * 13) % 86400) || ' seconds')
             FROM seq",
            // 2_000 products
            "INSERT INTO products (id, category_id, sku, name, price_cents, active)
             WITH RECURSIVE seq(i) AS (
               SELECT 1 UNION ALL SELECT i + 1 FROM seq WHERE i < 2000
             )
             SELECT
               i,
               ((i - 1) % 12) + 1,
               'SKU-' || printf('%05d', i),
               'Product ' || printf('%05d', i),
               499 + ((i * 37) % 99000),
               CASE WHEN (i % 17) = 0 THEN 0 ELSE 1 END
             FROM seq",
            // 45_000 orders
            "INSERT INTO orders (id, user_id, status, total_cents, placed_at)
             WITH RECURSIVE seq(i) AS (
               SELECT 1 UNION ALL SELECT i + 1 FROM seq WHERE i < 45000
             )
             SELECT
               i,
               ((i * 47) % 12000) + 1,
               CASE (i % 7)
                 WHEN 0 THEN 'pending' WHEN 1 THEN 'paid' WHEN 2 THEN 'paid'
                 WHEN 3 THEN 'shipped' WHEN 4 THEN 'paid' WHEN 5 THEN 'refunded'
                 ELSE 'cancelled' END,
               800 + ((i * 91) % 250000),
               datetime('2022-01-01', '+' || ((i * 11) % 1400) || ' days',
                        '+' || ((i * 29) % 86400) || ' seconds')
             FROM seq",
            // 90_000 order_items (2 lines per order)
            "INSERT INTO order_items (id, order_id, product_id, quantity, unit_price_cents)
             WITH RECURSIVE seq(i) AS (
               SELECT 1 UNION ALL SELECT i + 1 FROM seq WHERE i < 90000
             )
             SELECT
               i,
               ((i - 1) / 2) + 1,
               ((i * 53) % 2000) + 1,
               1 + (i % 5),
               499 + ((i * 41) % 99000)
             FROM seq",
            "COMMIT",
            "CREATE INDEX idx_users_plan ON users(plan)",
            "CREATE INDEX idx_users_country ON users(country)",
            "CREATE INDEX idx_products_category ON products(category_id)",
            "CREATE INDEX idx_orders_user ON orders(user_id)",
            "CREATE INDEX idx_orders_status ON orders(status)",
            "CREATE INDEX idx_orders_placed ON orders(placed_at)",
            "CREATE INDEX idx_order_items_order ON order_items(order_id)",
            "CREATE INDEX idx_order_items_product ON order_items(product_id)",
            "ANALYZE",
            "PRAGMA synchronous = NORMAL",
        ];

        for sql in statements {
            self.run_query_trusted(RunQueryRequest {
                conn_id: info.id,
                sql: sql.into(),
                page_size: 50,
                query_id: None,

            })
            .await?;
        }

        // Preview a wide result set for the virtualized grid.
        let page = self
            .run_query(
                RunQueryRequest {
                    conn_id: info.id,
                    sql: "SELECT id, user_id, status, total_cents, placed_at
                          FROM orders
                          ORDER BY id"
                        .into(),
                    page_size: 500,
                    query_id: None,

                },
                false,
            )
            .await?;

        Ok((info, page))
    }
}
