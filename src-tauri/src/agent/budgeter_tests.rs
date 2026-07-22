use crate::agent::budgeter::{ContextBudget, ContextBudgeter, ContextSlice};

#[test]
fn budget_truncates() {
    let b = ContextBudgeter::new(ContextBudget {
        max_chars: 100,
        ..Default::default()
    });
    let report = b.assemble(vec![
        ContextSlice {
            label: "a".into(),
            content: "x".repeat(80),
            chars: 80,
        },
        ContextSlice {
            label: "b".into(),
            content: "y".repeat(80),
            chars: 80,
        },
    ]);
    assert!(report.truncated);
    assert!(report.total_chars <= 100);
}
