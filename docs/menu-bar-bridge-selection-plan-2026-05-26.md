# Menu Bar Bridge Selection Plan

Date: 2026-05-26

## Problem

The macOS menu bar app currently exposes only latest-session bridge actions. That makes bridge fragile: if the latest session is not the intended one, the user has no way to choose another session before exporting.

There is also a JSON contract bug: `kage run-action <id> --json` prints the run-action JSON and then lets the delegated CLI command append human-readable output. The command can succeed while the app still reports a decode error.

## Product Direction

Keep KAGE CLI as the action authority. The app should not build bridge commands from Swift-only knowledge.

## Implementation Steps

- [x] Make `run-action --json` produce strict JSON by capturing delegated command output.
- [x] Extend `actions --json` to expose actions per matching session, not only latest sessions.
- [x] Include QoderCLI bridge targets in menu-bar actions through existing `c2q`, `x2q`, `q2c`, and `q2x` aliases.
- [x] Mark latest actions so the menu footer can keep a compact quick-action area.
- [x] Add per-session action menus in the app so the user can choose the exact session before bridge.
- [x] Add CLI and Swift contract regression coverage.

## Non-Goals

- No Swift-side transcript parsing.
- No new persistent action database.
- No destructive session edits.
