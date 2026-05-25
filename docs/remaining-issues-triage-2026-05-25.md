# Remaining Issues Triage

Date: 2026-05-25

Scope: Open GitHub issues after the QoderCLI support, app contract, docs/homepage, and search work.

## Decision

Only #22 was worth implementing immediately in this pass.

`kage search` directly improves the core KAGE workflow: finding old context across Claude, Codex, and QoderCLI sessions. It also creates a useful base for any future menu-bar or app surface, because those surfaces need searchable session inventory before they need dashboards or batch actions.

## Implemented Now

### #22 Feature: Session Search and Filter

Status: shipped in `9c5da28`.

Implemented:

- `kage search [query]`
- `--agent claude|codex|qodercli`
- `--since <date|duration>` and `--until <date|duration>`
- `--project <path>`
- `--json`
- match context and recent user messages in results
- regression coverage for query, agent, project, date range, and invalid empty search

Notes:

- Date-only `--until` values include the whole day, so `--until 2026-05-20` includes sessions updated on that date.
- Claude subagent transcripts are ignored during search, matching the cleanup behavior.

## Not Implemented Now

### #18 Code Quality: cli.js Weight, Discovery Performance, Hardcoded Versions

Recommendation: do, but as a focused refactor/performance pass.

This issue is meaningful, but it is too broad to close opportunistically. It mixes:

- CLI module extraction
- discovery performance
- real agent version detection
- differentiated exit codes
- overwrite safety
- path decoding caveats

The highest-value next slice is discovery performance plus a small module extraction around search/session inventory. That would reduce user-visible latency and make future app integration cleaner. The version strings and exit-code taxonomy are lower urgency until an integration depends on them.

### #19 Feature: Session Statistics Dashboard

Recommendation: defer.

This is not core enough yet. Search and session inventory should be stable before adding aggregate analytics. A dashboard risks becoming decorative unless users first show that they need reporting over sessions.

### #20 Feature: Session Diff / Comparison View

Recommendation: defer.

Potentially useful for advanced workflows, but not a first-order bridge problem. It should wait until there is a clear user story, such as comparing two forks before resume, reviewing a split, or deciding which context to keep.

### #21 Feature: Batch Bridge Operations

Recommendation: defer.

Batch export could create many files and confusing resume targets. KAGE should first have stronger overwrite protection and clearer exit codes before offering high-volume write operations.

### #3 Mobile App: Manage And Switch Multiple Computers' Sessions

Recommendation: keep as long-term product direction.

The architecture plan already lives in `docs/mobile-multi-device-sessions-plan-2026-05-20.md`. It is still valuable, but it needs a daemon/sync/backend surface and should not be mixed into CLI issue cleanup.

## Next Useful Work

1. Split #18 into smaller implementation tasks.
2. Start with discovery performance, because it affects current CLI users and future app surfaces.
3. Add overwrite safety before any batch operation.
4. Revisit dashboards, diffs, and batch operations only after search usage makes those needs visible.
