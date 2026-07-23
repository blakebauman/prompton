# Product

## Register
product

## Users & Purpose
Prompton is a native desktop database client for engineers who query Postgres, MySQL, and SQLite. The primary job on any screen is: connect → ask or write SQL → inspect results/schema safely. The Prompton assistant is the hub (the agent is the product); the artifact pane holds Results, Chart, SQL, Schema, Explain, and agent context. Shell chrome uses the tagline “Desktop database client”; the wordmark leads on the assistant. The mark is a database cylinder with a prompt caret (in-app SVG + Dock icons from `app-icon.svg`). Production databases stay read-only until human-in-the-loop approval (or an admin unlock).

## Brand Personality
Careful, precise, calm. Feels like a trustworthy power tool (TablePlus / Linear density), not a marketing dashboard.

## Anti-references
Not a purple SaaS landing page, not a card-heavy admin template, not neon “AI chat” chrome. Avoid badge spam and nested toolbars that waste vertical space.

## UI patterns
Desktop IA: list+detail, soft muted selection, ListPane edge fade, underline artifact tabs, SettingRow, activity rail. Charts use shadcn + recharts with monochrome series tokens.
**Color:** shadcn default monochrome only. No gold accents, no purple gradients. Production safety uses `--prod` red; everything else stays neutral primary/muted/accent.

## Accessibility
Keyboard focus must remain visible. Prefer reduced-motion friendly fades. Prod/danger states use token colors plus icons, not color alone.
