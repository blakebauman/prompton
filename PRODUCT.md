# Product

## Register
product

## Users & Purpose
Prompton is a native desktop database client for engineers who query Postgres and SQLite locally. The primary job on any screen is: connect → ask or write SQL → inspect results/schema safely. Chat is the hub; the artifact pane holds Results, SQL, Schema, Explain, and agent context. Production databases stay read-only until human-in-the-loop approval (or an admin unlock).

## Brand Personality
Careful, precise, calm. Feels like a trustworthy power tool (TablePlus / Linear density), not a marketing dashboard.

## Anti-references
Not a purple SaaS landing page, not a card-heavy admin template, not neon “AI chat” chrome. Avoid badge spam and nested toolbars that waste vertical space.

## UI references
IA and chrome borrow from Voicebox desktop (list+detail, soft muted selection, ListPane edge fade, underline tabs, SettingRow, activity rail).
**Color:** shadcn default monochrome only. No Voicebox gold, no purple gradients. Production safety uses `--prod` red; everything else stays neutral primary/muted/accent.

## Accessibility
Keyboard focus must remain visible. Prefer reduced-motion friendly fades. Prod/danger states use token colors plus icons, not color alone.
