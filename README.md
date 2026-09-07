# DevControl

Local-first development portfolio console for `DaoLife`, `BISRE`, `CrossAlpha`, and `Tidebound`.

GitHub remains the control/audit plane. Self-hosted runners remain the authority for heavy qualification, research, release qualification, and local promotion.

The first MVP provides:

- one-page portfolio status for four repositories
- lightweight CI vs self-hosted authority shown separately
- open PR and Automation Dashboard visibility
- self-hosted runner visibility when permitted
- blocker / next-action / safety-boundary display
- 15-second refresh
- server-side GitHub token handling
- reversible `rerun failed jobs` control only

High-risk actions such as auto-merge, Steam publishing, BISRE Micro-Live, real-capital trading, frozen-data mutation, and production-writer switchover are intentionally excluded.
