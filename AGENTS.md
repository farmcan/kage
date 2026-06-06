# AGENTS.md

This is the short handoff guide for AI coding agents working in KAGE. Keep it focused on rules that prevent bad work.

## Read First

- `README.md` for user-facing behavior and supported workflows.
- `CONTRIBUTING.md` for product boundaries.
- `app/README.md` before touching the macOS app.
- `docs/release-launch-checklist.md` before release work.

## Core Rules

- KAGE is local-first session memory. Do not add hosted indexing, transcript upload, remote sync, telemetry, or cloud behavior without an explicit product decision.
- Keep parsing, routing, transforms, exports, cleanup, and action behavior in CLI/core code: `src/cli.js`, `src/core/`, `src/adapters/`, `src/serve/`.
- Keep the macOS app as a thin shell over CLI JSON. Do not duplicate transcript parsing, routing, or export logic in Swift.
- Do not auto-launch live agents after bridge/export without explicit user action.
- Cleanup and destructive operations must be preview-first and show affected paths clearly.
- Demo mode, tests, and fixtures must stay sanitized. Do not commit private transcript data, `tmp/`, `app/.build/`, logs, or local handoff files.

## Engineering Judgment

- Do not reinvent wheels. Check existing helpers, local patterns, mature libraries, and official docs before adding parser, adapter, packaging, installer, or UI behavior.
- Research first when behavior depends on an external tool, platform, file format, packaging rule, security expectation, or agent transcript shape. Prefer primary sources.
- Make the feature run end to end first. A working user path with clear output is more valuable than narrow tests around unfinished behavior.
- Prefer end-to-end and contract tests for meaningful KAGE flows: discovery, search, bridge/fork/export, cleanup preview, serve dispatch, CLI JSON, and desktop compatibility.
- Avoid low-value tests that only assert constants, thin wrappers, trivial path helpers, or mocked implementation details.
- Error messages are product behavior. They should explain what happened and what the user can do next.

## When Changing Things

- New source agent support: update source adapters, agent metadata, fixtures, tests, README support tables, and release notes when user-facing.
- New target/export support: update target adapters, routing, resume hints, fixtures, tests, README examples, and release notes when user-facing.
- Serve UI changes: edit `src/serve/ui/app/`, then rebuild `src/serve/ui/dist/index.html` with `npm run build:serve-ui`; do not hand-edit dist HTML.
- CLI JSON changes: update `app/Sources/KageContracts/` and Swift contract smoke expectations together.
- Release/version changes: keep `package.json`, README release links, app README DMG references, release notes, and package names in sync.

## Validation

- Use targeted checks during feature work: `npm test`, `npm run build:serve-ui`, `swift build --package-path app`, `swift run --package-path app kage-contract-smoke`.
- Use `npm run check:all` for release-level confidence; it is intentionally broad and slow.

## Style

- Use JavaScript ESM for CLI/core code.
- Prefer additive JSON fields over renames or shape changes.
- Use existing dependencies before adding new ones.
- Commit messages must be English, short, and action-oriented, for example `Add Codex resume hint`.
