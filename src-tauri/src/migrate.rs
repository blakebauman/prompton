use std::fs;
use std::path::{Path, PathBuf};

use crate::error::AppResult;

const LEGACY_DIR_NAME: &str = "dev.prompton.app";
const MARKER_NAME: &str = ".migrated-from-dev.prompton.app";

const FLAT_FILES: &[&str] = &[
    "connections.json",
    "history.json",
    "prompts.json",
    "agent_settings.json",
    "demo.db",
    "demo.db-wal",
    "demo.db-shm",
];

/// One-time copy from the previous bundle id app-data dir into `data_dir`.
/// Safe to call on every launch: no-ops after the marker file exists.
/// Returns `true` the first time migration runs against a legacy directory.
pub fn migrate_legacy_app_data(data_dir: &Path) -> AppResult<bool> {
    let marker = data_dir.join(MARKER_NAME);
    if marker.exists() {
        return Ok(false);
    }

    let Some(legacy) = legacy_dir_for(data_dir) else {
        return Ok(false);
    };
    if !legacy.is_dir() || legacy == data_dir {
        // Nothing to migrate; still write marker so we don't keep probing.
        let _ = fs::create_dir_all(data_dir);
        let _ = fs::write(&marker, b"none\n");
        return Ok(false);
    }

    fs::create_dir_all(data_dir)?;

    let mut copied_any = false;
    for name in FLAT_FILES {
        if copy_if_absent(&legacy.join(name), &data_dir.join(name))? {
            copied_any = true;
        }
    }

    let legacy_skills = legacy.join("skills");
    let dest_skills = data_dir.join("skills");
    if legacy_skills.is_dir() {
        if merge_skill_dirs(&legacy_skills, &dest_skills)? {
            copied_any = true;
        }
    }

    fs::write(
        &marker,
        format!(
            "from={}\ncopied={copied_any}\n",
            legacy.display()
        ),
    )?;

    Ok(true)
}

fn legacy_dir_for(data_dir: &Path) -> Option<PathBuf> {
    data_dir
        .parent()
        .map(|parent| parent.join(LEGACY_DIR_NAME))
}

fn copy_if_absent(src: &Path, dest: &Path) -> AppResult<bool> {
    if !src.is_file() || dest.exists() {
        return Ok(false);
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(src, dest)?;
    Ok(true)
}

fn merge_skill_dirs(src: &Path, dest: &Path) -> AppResult<bool> {
    fs::create_dir_all(dest)?;
    let mut copied_any = false;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let to = dest.join(&name);
        if to.exists() {
            continue;
        }
        copy_dir_recursive(&entry.path(), &to)?;
        copied_any = true;
    }
    Ok(copied_any)
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> AppResult<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dest.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn migrates_flat_files_and_skills_once() {
        let root = std::env::temp_dir().join(format!("prompton-mig-{}", Uuid::new_v4()));
        let legacy = root.join(LEGACY_DIR_NAME);
        let next = root.join("dev.prompton.desktop");
        fs::create_dir_all(legacy.join("skills/explore-schema")).unwrap();
        fs::write(legacy.join("connections.json"), b"[]").unwrap();
        fs::write(legacy.join("history.json"), b"[]").unwrap();
        fs::write(
            legacy.join("skills/explore-schema/SKILL.md"),
            b"---\nname: explore-schema\ndescription: x\n---\n\nbody\n",
        )
        .unwrap();

        assert!(migrate_legacy_app_data(&next).unwrap());
        assert!(next.join("connections.json").is_file());
        assert!(next.join("history.json").is_file());
        assert!(next.join("skills/explore-schema/SKILL.md").is_file());
        assert!(next.join(MARKER_NAME).is_file());

        // Second run is a no-op even if legacy gains new files.
        fs::write(legacy.join("prompts.json"), b"[]").unwrap();
        assert!(!migrate_legacy_app_data(&next).unwrap());
        assert!(!next.join("prompts.json").exists());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn does_not_overwrite_existing_dest_files() {
        let root = std::env::temp_dir().join(format!("prompton-mig2-{}", Uuid::new_v4()));
        let legacy = root.join(LEGACY_DIR_NAME);
        let next = root.join("dev.prompton.desktop");
        fs::create_dir_all(&legacy).unwrap();
        fs::create_dir_all(&next).unwrap();
        fs::write(legacy.join("connections.json"), b"[legacy]").unwrap();
        fs::write(next.join("connections.json"), b"[keep]").unwrap();

        assert!(migrate_legacy_app_data(&next).unwrap());
        let kept = fs::read_to_string(next.join("connections.json")).unwrap();
        assert_eq!(kept, "[keep]");

        let _ = fs::remove_dir_all(&root);
    }
}
