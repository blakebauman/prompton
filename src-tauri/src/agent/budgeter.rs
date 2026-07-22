use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextBudget {
    pub max_chars: usize,
    pub max_sample_rows: usize,
    pub max_result_rows: usize,
    pub max_schema_tables: usize,
}

impl Default for ContextBudget {
    fn default() -> Self {
        Self {
            max_chars: 24_000,
            max_sample_rows: 5,
            max_result_rows: 30,
            max_schema_tables: 40,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContextSlice {
    pub label: String,
    pub content: String,
    pub chars: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BudgetReport {
    pub slices: Vec<ContextSlice>,
    pub total_chars: usize,
    pub truncated: bool,
}

pub struct ContextBudgeter {
    budget: ContextBudget,
}

impl ContextBudgeter {
    pub fn new(budget: ContextBudget) -> Self {
        Self { budget }
    }

    pub fn budget(&self) -> &ContextBudget {
        &self.budget
    }

    pub fn truncate_text(&self, label: &str, content: impl Into<String>) -> ContextSlice {
        let mut content = content.into();
        let mut truncated = false;
        if content.len() > self.budget.max_chars / 4 {
            content = content.chars().take(self.budget.max_chars / 4).collect();
            content.push_str("\n…[truncated]");
            truncated = true;
        }
        let chars = content.len();
        let _ = truncated;
        ContextSlice {
            label: label.into(),
            content,
            chars,
        }
    }

    pub fn assemble(&self, slices: Vec<ContextSlice>) -> BudgetReport {
        let mut out = Vec::new();
        let mut total = 0usize;
        let mut truncated = false;
        for slice in slices {
            if total + slice.chars > self.budget.max_chars {
                let remaining = self.budget.max_chars.saturating_sub(total);
                if remaining < 64 {
                    truncated = true;
                    break;
                }
                let clipped: String = slice.content.chars().take(remaining).collect();
                total += clipped.len();
                out.push(ContextSlice {
                    label: slice.label,
                    content: format!("{clipped}\n…[budget truncated]"),
                    chars: clipped.len(),
                });
                truncated = true;
                break;
            }
            total += slice.chars;
            out.push(slice);
        }
        BudgetReport {
            slices: out,
            total_chars: total,
            truncated,
        }
    }

    pub fn summarize_rows(
        &self,
        columns: &[String],
        rows: &[Vec<serde_json::Value>],
        max_rows: usize,
    ) -> String {
        let take = max_rows.min(self.budget.max_result_rows);
        let mut lines = vec![format!("columns: {}", columns.join(", "))];
        for (i, row) in rows.iter().take(take).enumerate() {
            let cells: Vec<String> = row
                .iter()
                .map(|v| match v {
                    serde_json::Value::String(s) if s.len() > 80 => {
                        format!("{}…", &s[..80])
                    }
                    other => other.to_string(),
                })
                .collect();
            lines.push(format!("{i}: {}", cells.join(" | ")));
        }
        if rows.len() > take {
            lines.push(format!("… {} more rows omitted", rows.len() - take));
        }
        lines.join("\n")
    }
}
