use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillMeta {
    pub name: String,
    pub description: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillContent {
    pub name: String,
    pub description: String,
    pub body: String,
    pub path: String,
}

pub struct SkillStore {
    dir: PathBuf,
}

impl SkillStore {
    pub fn new(data_dir: PathBuf) -> Self {
        let dir = data_dir.join("skills");
        let _ = std::fs::create_dir_all(&dir);
        Self { dir }
    }

    pub fn ensure_defaults(&self, bundled: &PathBuf) -> AppResult<()> {
        if !bundled.exists() {
            return Ok(());
        }
        for entry in std::fs::read_dir(bundled)? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let name = entry.file_name();
            let dest = self.dir.join(&name);
            if dest.exists() {
                continue;
            }
            copy_dir_recursive(&entry.path(), &dest)?;
        }
        Ok(())
    }

    pub fn list(&self) -> AppResult<Vec<SkillMeta>> {
        let mut out = Vec::new();
        if !self.dir.exists() {
            return Ok(out);
        }
        for entry in std::fs::read_dir(&self.dir)? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let skill_md = entry.path().join("SKILL.md");
            if !skill_md.exists() {
                continue;
            }
            let raw = std::fs::read_to_string(&skill_md)?;
            let (name, description, _) = parse_skill_md(&raw);
            out.push(SkillMeta {
                name,
                description,
                path: skill_md.display().to_string(),
            });
        }
        out.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(out)
    }

    pub fn get(&self, name: &str) -> AppResult<SkillContent> {
        let safe = sanitize_name(name);
        if safe.is_empty() {
            return Err(AppError::msg("Invalid skill name"));
        }
        let skill_md = self.dir.join(&safe).join("SKILL.md");
        let base = std::fs::canonicalize(&self.dir).unwrap_or_else(|_| self.dir.clone());
        let path = match std::fs::canonicalize(&skill_md) {
            Ok(p) => p,
            Err(_) => return Err(AppError::msg(format!("Skill not found: {safe}"))),
        };
        if !path.starts_with(&base) {
            return Err(AppError::msg("Skill not found"));
        }
        let raw = std::fs::read_to_string(&path)?;
        let (name, description, body) = parse_skill_md(&raw);
        Ok(SkillContent {
            name,
            description,
            body,
            path: path.display().to_string(),
        })
    }

    pub fn save(&self, name: &str, description: &str, body: &str) -> AppResult<SkillContent> {
        let safe = sanitize_name(name);
        let dir = self.dir.join(&safe);
        std::fs::create_dir_all(&dir)?;
        let content = format!(
            "---\nname: {safe}\ndescription: {}\n---\n\n{}\n",
            description.replace('\n', " "),
            body.trim()
        );
        let path = dir.join("SKILL.md");
        std::fs::write(&path, content)?;
        self.get(&safe)
    }
}

fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_lowercase()
}

fn parse_skill_md(raw: &str) -> (String, String, String) {
    let mut name = "unnamed".to_string();
    let mut description = String::new();
    let body;
    if raw.starts_with("---") {
        if let Some(end) = raw[3..].find("---") {
            let front = &raw[3..3 + end];
            for line in front.lines() {
                if let Some(v) = line.strip_prefix("name:") {
                    name = v.trim().to_string();
                } else if let Some(v) = line.strip_prefix("description:") {
                    description = v.trim().to_string();
                }
            }
            body = raw[3 + end + 3..].trim().to_string();
        } else {
            body = raw.to_string();
        }
    } else {
        body = raw.to_string();
    }
    (name, description, body)
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> AppResult<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let dest = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&entry.path(), &dest)?;
        } else {
            std::fs::copy(entry.path(), dest)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod skill_path_tests {
    use super::*;

    #[test]
    fn get_rejects_path_traversal_names() {
        let dir = std::env::temp_dir().join(format!("prompton-skills-{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&dir);
        let store = SkillStore::new(dir.clone());
        store
            .save("safe-skill", "desc", "body")
            .expect("save");

        let err = store.get("../../../etc").expect_err("must reject");
        assert!(err.public_message().contains("not found") || err.public_message().contains("Invalid"));

        let ok = store.get("safe-skill").expect("safe get");
        assert_eq!(ok.name, "safe-skill");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sanitize_strips_separators() {
        assert_eq!(sanitize_name("../Evil Skill"), "evil-skill");
        assert_eq!(sanitize_name("///"), "");
    }
}
