//! Discover recent local SQLite database files on disk.
//!
//! Scans the home directory (and mounted volumes on macOS) for files that look
//! like SQLite DBs, verify the file header, and rank by recent activity
//! (`mtime` of the DB or its `-wal`/`-shm` sidecars).

use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

const SQLITE_MAGIC: &[u8] = b"SQLite format 3\0";
const DEFAULT_MAX_AGE_DAYS: u32 = 30;
const DEFAULT_MAX_RESULTS: usize = 40;
const DEFAULT_MAX_DEPTH: u32 = 8;
const DEFAULT_MAX_VISITS: usize = 80_000;
const DEFAULT_TIME_BUDGET: Duration = Duration::from_secs(8);
const MIN_DB_BYTES: u64 = 100;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverLocalDatabasesRequest {
    /// Only include DBs with activity within this many days (default 30).
    pub max_age_days: Option<u32>,
    /// Cap returned hits (default 40).
    pub max_results: Option<usize>,
    /// Also scan `/Volumes/*` on macOS (default true).
    pub include_volumes: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDatabaseHit {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    /// Best-effort activity time (max of db / wal / shm mtimes), RFC3339.
    pub activity_at: String,
    pub modified_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverLocalDatabasesResult {
    pub hits: Vec<LocalDatabaseHit>,
    pub scanned_roots: Vec<String>,
    pub visited_files: usize,
    pub truncated: bool,
    pub duration_ms: u64,
}

pub fn discover_local_databases(
    req: DiscoverLocalDatabasesRequest,
) -> AppResult<DiscoverLocalDatabasesResult> {
    let max_age_days = req.max_age_days.unwrap_or(DEFAULT_MAX_AGE_DAYS).max(1);
    let max_results = req
        .max_results
        .unwrap_or(DEFAULT_MAX_RESULTS)
        .clamp(1, 200);
    let include_volumes = req.include_volumes.unwrap_or(true);

    let started = Instant::now();
    let cutoff = SystemTime::now()
        .checked_sub(Duration::from_secs(u64::from(max_age_days) * 24 * 60 * 60))
        .unwrap_or(SystemTime::UNIX_EPOCH);

    let roots = scan_roots(include_volumes);
    if roots.is_empty() {
        return Err(AppError::msg("No local folders available to scan"));
    }

    let scanned_roots: Vec<String> = roots
        .iter()
        .map(|p| p.display().to_string())
        .collect();

    let mut hits: Vec<LocalDatabaseHit> = Vec::new();
    let mut visited = 0usize;
    let mut truncated = false;

    for root in &roots {
        if truncated || hits.len() >= max_results * 4 {
            // gather extras then sort/truncate
            break;
        }
        let mut stack: Vec<(PathBuf, u32)> = vec![(root.clone(), 0)];
        while let Some((dir, depth)) = stack.pop() {
            if started.elapsed() > DEFAULT_TIME_BUDGET || visited >= DEFAULT_MAX_VISITS {
                truncated = true;
                break;
            }
            let entries = match fs::read_dir(&dir) {
                Ok(e) => e,
                Err(_) => continue,
            };
            for entry in entries.flatten() {
                if started.elapsed() > DEFAULT_TIME_BUDGET || visited >= DEFAULT_MAX_VISITS {
                    truncated = true;
                    break;
                }
                let path = entry.path();
                let file_type = match entry.file_type() {
                    Ok(t) => t,
                    Err(_) => continue,
                };
                if file_type.is_dir() {
                    if depth >= DEFAULT_MAX_DEPTH {
                        continue;
                    }
                    if should_skip_dir(&path) {
                        continue;
                    }
                    stack.push((path, depth + 1));
                    continue;
                }
                if !file_type.is_file() {
                    continue;
                }
                visited += 1;
                let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                    continue;
                };
                if !is_sqlite_candidate_name(name) {
                    continue;
                }
                // Sidecars are activity signals, not standalone DBs.
                if name.ends_with("-wal") || name.ends_with("-shm") || name.ends_with("-journal") {
                    continue;
                }
                let meta = match entry.metadata() {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                if meta.len() < MIN_DB_BYTES {
                    continue;
                }
                let activity = activity_time(&path, meta.modified().ok());
                let Some(activity) = activity else { continue };
                if activity < cutoff {
                    continue;
                }
                if !looks_like_sqlite(&path) {
                    continue;
                }
                let modified = meta.modified().unwrap_or(activity);
                hits.push(LocalDatabaseHit {
                    path: path.display().to_string(),
                    name: display_name(name),
                    size_bytes: meta.len(),
                    activity_at: system_time_to_rfc3339(activity),
                    modified_at: system_time_to_rfc3339(modified),
                });
            }
        }
    }

    hits.sort_by(|a, b| b.activity_at.cmp(&a.activity_at));
    hits.dedup_by(|a, b| a.path == b.path);
    if hits.len() > max_results {
        hits.truncate(max_results);
        truncated = true;
    }

    Ok(DiscoverLocalDatabasesResult {
        hits,
        scanned_roots,
        visited_files: visited,
        truncated,
        duration_ms: started.elapsed().as_millis() as u64,
    })
}

fn scan_roots(include_volumes: bool) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(home) = dirs::home_dir() {
        // Prefer high-signal folders first so recent project DBs surface quickly.
        for rel in [
            "Desktop",
            "Documents",
            "Downloads",
            "Projects",
            "Developer",
            "dev",
            "code",
            "src",
            "repos",
            "Library/Application Support",
        ] {
            let p = home.join(rel);
            if p.is_dir() {
                roots.push(p);
            }
        }
        roots.push(home);
    }

    if include_volumes && cfg!(target_os = "macos") {
        if let Ok(entries) = fs::read_dir("/Volumes") {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                // Skip the boot volume alias when present.
                let name = entry.file_name().to_string_lossy().to_string();
                if name.eq_ignore_ascii_case("Macintosh HD") {
                    continue;
                }
                roots.push(path);
            }
        }
    }

    roots.sort();
    roots.dedup();
    roots
}

fn should_skip_dir(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return true;
    };
    let lower = name.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "node_modules"
            | ".git"
            | ".svn"
            | ".hg"
            | ".jj"
            | "target"
            | "dist"
            | "build"
            | ".next"
            | ".nuxt"
            | ".turbo"
            | ".vercel"
            | ".cache"
            | "caches"
            | "__pycache__"
            | ".trash"
            | "deriveddata"
            | "pods"
            | ".pnpm-store"
            | ".npm"
            | ".yarn"
            | "vendor"
            | "venv"
            | ".venv"
            | "site-packages"
            | "tmp"
            | "temp"
            | "logs"
            | "log"
            | "cores"
            | "applications"
            | "library" // skip nested Library dirs; App Support is added as its own root
            | "photos library.photoslibrary"
            | "timemachine"
            | ".spotlight-v100"
            | ".fseventsd"
            | ".documentrevisons-v100"
            | ".temporaryitems"
    ) || lower.ends_with(".app")
        || lower.ends_with(".framework")
        || lower.ends_with(".bundle")
        || lower.ends_with(".photoslibrary")
}

fn is_sqlite_candidate_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".sqlite")
        || lower.ends_with(".sqlite3")
        || lower.ends_with(".db")
        || lower.ends_with(".db3")
}

fn display_name(file_name: &str) -> String {
    Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name)
        .to_string()
}

fn activity_time(path: &Path, db_mtime: Option<SystemTime>) -> Option<SystemTime> {
    let mut best = db_mtime;
    for suffix in ["-wal", "-shm", "-journal"] {
        let mut sidecar = path.as_os_str().to_owned();
        sidecar.push(suffix);
        let side = PathBuf::from(sidecar);
        if let Ok(meta) = fs::metadata(&side) {
            if let Ok(m) = meta.modified() {
                best = Some(match best {
                    Some(cur) => cur.max(m),
                    None => m,
                });
            }
        }
    }
    best
}

fn looks_like_sqlite(path: &Path) -> bool {
    let mut file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let mut buf = [0u8; 16];
    match file.read_exact(&mut buf) {
        Ok(()) => buf == SQLITE_MAGIC,
        Err(_) => false,
    }
}

fn system_time_to_rfc3339(t: SystemTime) -> String {
    let dt: DateTime<Utc> = t.into();
    dt.to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn candidate_extensions() {
        assert!(is_sqlite_candidate_name("orders.sqlite"));
        assert!(is_sqlite_candidate_name("app.DB"));
        assert!(is_sqlite_candidate_name("x.db3"));
        assert!(!is_sqlite_candidate_name("notes.txt"));
        assert!(!is_sqlite_candidate_name("foo.db-wal"));
    }

    #[test]
    fn skip_heavy_dirs() {
        assert!(should_skip_dir(Path::new("/tmp/node_modules")));
        assert!(should_skip_dir(Path::new("/tmp/.git")));
        assert!(should_skip_dir(Path::new("/Applications/Foo.app")));
        assert!(!should_skip_dir(Path::new("/tmp/Projects")));
    }

    #[test]
    fn magic_header_detection() {
        let dir = std::env::temp_dir().join(format!("prompton-discover-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let good = dir.join("good.sqlite");
        let bad = dir.join("bad.sqlite");
        {
            let mut f = File::create(&good).unwrap();
            f.write_all(SQLITE_MAGIC).unwrap();
            f.write_all(&[0u8; 200]).unwrap();
        }
        {
            let mut f = File::create(&bad).unwrap();
            f.write_all(b"not a database file!!!!").unwrap();
            f.write_all(&[0u8; 200]).unwrap();
        }
        assert!(looks_like_sqlite(&good));
        assert!(!looks_like_sqlite(&bad));
        let _ = fs::remove_dir_all(&dir);
    }
}
