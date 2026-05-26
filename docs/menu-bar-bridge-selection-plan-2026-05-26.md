# Menu Bar Bridge Selection Plan

Date: 2026-05-26

## Problem

The macOS menu bar app currently exposes only latest-session bridge actions. That makes bridge fragile: if the latest session is not the intended one, the user has no way to choose another session before exporting.

There is also a JSON contract bug: `kage run-action <id> --json` prints the run-action JSON and then lets the delegated CLI command append human-readable output. The command can succeed while the app still reports a decode error.

## Product Direction

Keep KAGE CLI as the action authority. The app should not build bridge commands from Swift-only knowledge.

After a bridge completes, the app should not leave the user holding a command-line hint as the only next step. The bridge result is a newly created target-agent session, so the UI should show a completion card with direct next actions:

- `Open in Terminal`: launch the target agent resume command in Terminal.
- `Copy command`: copy the exact resume command for manual use.
- `Show session file`: reveal the generated session file in Finder.

Do not auto-open the target agent immediately after bridge. Opening a live AI CLI is a meaningful side effect, and the user should choose it.

## Implementation Steps

- [x] Make `run-action --json` produce strict JSON by capturing delegated command output.
- [x] Extend `actions --json` to expose actions per matching session, not only latest sessions.
- [x] Include QoderCLI bridge targets in menu-bar actions through existing `c2q`, `x2q`, `q2c`, and `q2x` aliases.
- [x] Mark latest actions so the menu footer can keep a compact quick-action area.
- [x] Add per-session action menus in the app so the user can choose the exact session before bridge.
- [x] Collapse bridge UI to one visible `Bridge` entry that opens session selection before target selection.
- [x] Add CLI and Swift contract regression coverage.
- [x] Return structured bridge results from `run-action --json`.
- [x] Show a post-bridge result card in the menu bar app.
- [x] Provide one-click Terminal launch, command copy, and Finder reveal actions.

## Non-Goals

- No Swift-side transcript parsing.
- No new persistent action database.
- No destructive session edits.
