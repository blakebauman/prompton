use std::path::PathBuf;

use crate::db::types::{ConnectRequest, Dialect, RunQueryRequest};
use crate::db::ConnectionManager;

#[tokio::test]
async fn sqlite_connect_and_query() {
    let dir = std::env::temp_dir().join(format!("prompton-test-{}", uuid::Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&dir);
    let db_path = dir.join("t.db");
    let mgr = ConnectionManager::new(PathBuf::from(&dir));

    let info = mgr
        .connect(ConnectRequest {
            name: "t".into(),
            dialect: Dialect::Sqlite,
            host: None,
            port: None,
            database: None,
            username: None,
            password: None,
            file_path: Some(db_path.display().to_string()),
            color: Some("#000".into()),
            ssl_mode: None,
            is_production: Some(false),
        })
        .await
        .expect("connect");

    mgr.run_query_trusted(RunQueryRequest {
        conn_id: info.id,
        sql: "CREATE TABLE IF NOT EXISTS t(id INTEGER)".into(),
        page_size: 10,
        query_id: None,

    })
    .await
    .unwrap();
    mgr.run_query_trusted(RunQueryRequest {
        conn_id: info.id,
        sql: "INSERT INTO t VALUES (1),(2)".into(),
        page_size: 10,
        query_id: None,

    })
    .await
    .unwrap();
    let result = mgr
        .run_query(
            RunQueryRequest {
                conn_id: info.id,
                sql: "SELECT * FROM t".into(),
                page_size: 10,
                query_id: None,

            },
            false,
        )
        .await
        .unwrap();
    assert_eq!(result.total_rows, 2);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn open_demo_sqlite_has_rows() {
    let dir = std::env::temp_dir().join(format!("prompton-demo-{}", uuid::Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&dir);
    let mgr = ConnectionManager::new(PathBuf::from(&dir));
    let (info, page) = mgr.open_demo_sqlite().await.expect("demo");
    assert_eq!(info.name, "Demo SQLite");
    assert_eq!(page.total_rows, 45_000);
    let schemas = mgr.list_schemas(info.id).await.unwrap();
    let tables: Vec<_> = schemas
        .iter()
        .flat_map(|s| s.children.iter().map(|c| c.name.as_str()))
        .collect();
    for expected in ["users", "orders", "products", "categories", "order_items"] {
        assert!(tables.contains(&expected), "missing table {expected}");
    }
    let counts = mgr
        .run_query(
            RunQueryRequest {
                conn_id: info.id,
                sql: "SELECT
                        (SELECT COUNT(*) FROM users) AS users,
                        (SELECT COUNT(*) FROM products) AS products,
                        (SELECT COUNT(*) FROM orders) AS orders,
                        (SELECT COUNT(*) FROM order_items) AS order_items"
                    .into(),
                page_size: 10,
                query_id: None,

            },
            false,
        )
        .await
        .expect("counts");
    assert_eq!(counts.rows[0][0], serde_json::json!(12_000));
    assert_eq!(counts.rows[0][1], serde_json::json!(2_000));
    assert_eq!(counts.rows[0][2], serde_json::json!(45_000));
    assert_eq!(counts.rows[0][3], serde_json::json!(90_000));
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn production_writes_require_hitl() {
    let dir = std::env::temp_dir().join(format!("prompton-hitl-{}", uuid::Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&dir);
    let db_path = dir.join("prod.db");
    let mgr = ConnectionManager::new(PathBuf::from(&dir));

    let info = mgr
        .connect(ConnectRequest {
            name: "prod".into(),
            dialect: Dialect::Sqlite,
            host: None,
            port: None,
            database: None,
            username: None,
            password: None,
            file_path: Some(db_path.display().to_string()),
            color: Some("#b91c1c".into()),
            ssl_mode: None,
            is_production: Some(true),
        })
        .await
        .expect("connect");

    assert!(info.is_production);

    mgr.run_query_trusted(RunQueryRequest {
        conn_id: info.id,
        sql: "CREATE TABLE t(id INTEGER)".into(),
        page_size: 10,
        query_id: None,

    })
    .await
    .unwrap();

    // Direct mutate is blocked even with allow_mutating flag.
    let blocked = mgr
        .run_query(
            RunQueryRequest {
                conn_id: info.id,
                sql: "INSERT INTO t VALUES (1)".into(),
                page_size: 10,
                query_id: None,

            },
            true,
        )
        .await;
    assert!(blocked.is_err());

    let pending = mgr
        .request_write_approval(info.id, "INSERT INTO t VALUES (42)".into(), None)
        .expect("stage");
    assert!(pending.is_production);

    let rejected = mgr
        .confirm_write(pending.confirmation_id, false, None)
        .await
        .unwrap();
    assert!(rejected.is_none());

    let pending2 = mgr
        .request_write_approval(info.id, "INSERT INTO t VALUES (7)".into(), None)
        .unwrap();
    let page = mgr
        .confirm_write(pending2.confirmation_id, true, None)
        .await
        .unwrap()
        .expect("approved write");
    assert!(page.affected_rows.unwrap_or(0) >= 1);

    let rows = mgr
        .run_query(
            RunQueryRequest {
                conn_id: info.id,
                sql: "SELECT id FROM t".into(),
                page_size: 10,
                query_id: None,

            },
            false,
        )
        .await
        .unwrap();
    assert_eq!(rows.total_rows, 1);
    assert_eq!(rows.rows[0][0], serde_json::json!(7));

    // Admin can unlock writes while staying production.
    let unlocked = mgr.set_admin_writes_unlocked(info.id, true).unwrap();
    assert!(unlocked.is_production);
    assert!(unlocked.admin_writes_unlocked);
    assert!(!mgr.is_hard_readonly(info.id).unwrap());

    let pending3 = mgr
        .request_write_approval(info.id, "INSERT INTO t VALUES (9)".into(), None)
        .unwrap();
    assert!(pending3.admin_writes_unlocked);
    mgr.confirm_write(pending3.confirmation_id, true, None)
        .await
        .unwrap();

    // Admin can demote from production entirely.
    let demoted = mgr.set_production(info.id, false).unwrap();
    assert!(!demoted.is_production);
    assert!(!demoted.admin_writes_unlocked);

    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn cancel_inflight_query_by_client_id() {
    let dir = std::env::temp_dir().join(format!("prompton-cancel-{}", uuid::Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&dir);
    let db_path = dir.join("t.db");
    let mgr = std::sync::Arc::new(ConnectionManager::new(PathBuf::from(&dir)));

    let info = mgr
        .connect(ConnectRequest {
            name: "t".into(),
            dialect: Dialect::Sqlite,
            host: None,
            port: None,
            database: None,
            username: None,
            password: None,
            file_path: Some(db_path.display().to_string()),
            color: Some("#000".into()),
            ssl_mode: None,
            is_production: Some(false),
        })
        .await
        .expect("connect");

    let query_id = uuid::Uuid::new_v4();
    let mgr2 = mgr.clone();
    let handle = tokio::spawn(async move {
        mgr2.run_query(
            RunQueryRequest {
                conn_id: info.id,
                sql: "WITH RECURSIVE r(i) AS (
                        SELECT 1
                        UNION ALL
                        SELECT i + 1 FROM r WHERE i < 5000000
                      )
                      SELECT COUNT(*) FROM r"
                    .into(),
                page_size: 10,
                query_id: Some(query_id),
            },
            false,
        )
        .await
    });

    // Let the query start, then cancel by the client-supplied id.
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    mgr.cancel_query(query_id).unwrap();
    let err = handle.await.expect("join").expect_err("should cancel");
    assert!(
        err.to_string().to_ascii_lowercase().contains("cancel"),
        "unexpected error: {err}"
    );

    let _ = std::fs::remove_dir_all(&dir);
}
