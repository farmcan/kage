# Contributing to KAGE

KAGE is a local-first session layer for AI coding agents. Contributions are most useful when they help developers find, resume, fork, bridge, replay, or safely clean up local sessions.

## Good First Contributions

- Improve README examples and screenshots.
- Add small desktop polish that makes session choice clearer.
- Add fixtures for real-world transcript shapes.
- Improve error messages for unsupported or malformed sessions.
- Add docs for a specific workflow, such as Claude Code to Codex.

## Product Rules

- Keep transcript parsing, route logic, and export behavior in the CLI/core layer.
- Keep the native app as a thin shell over the JSON contract.
- Keep transcripts local by default.
- Do not auto-launch live agents after bridge/export without explicit user action.
- Prefer preview-first behavior for cleanup or destructive operations.

## Local Development

```bash
npm install
npm test
swift build --package-path app
swift run --package-path app kage-contract-smoke
(cd app && ./bundle.sh)
open app/.build/release/KAGE.app
```

## Useful Documents

- [Product strategy](docs/product-strategy-2026-05-28.md)
- [Architecture review](docs/architecture-review-2026-05-28.md)
- [Growth plan](docs/growth-plan-2026-05-28.md)
- [Release and launch checklist](docs/release-launch-checklist.md)
