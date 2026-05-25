# App CLI Contract Implementation Plan

Date: 2026-05-20

## Goal

Build the first stable CLI contract that a future macOS menu bar app can consume.

The app should not parse Claude Code, Codex, or QoderCLI transcript files directly. The app should call KAGE JSON commands and render the result.

## Phase 1 Scope

- [x] `kage doctor`
- [x] `kage doctor --json`
- [x] `kage sessions`
- [x] `kage sessions --json`
- [x] `kage actions`
- [x] `kage actions --json`
- [x] `kage run-action <id>`
- [x] `kage run-action <id> --json`
- [x] README usage notes
- [x] Regression tests

## Contract Shape

### Doctor

Checks local readiness:

- KAGE version
- current working directory
- each supported agent command
- best-effort version output
- session root existence and write access
- known native resume/fork commands

Doctor should not crash just because an agent is not installed. It should return structured status that the menu bar app can display.

### Sessions

Lists current-project sessions across all supported agents by default.

Each session should include:

- agent
- title
- session id
- path
- updated time
- recent user messages

### Actions

Builds an action list from the current project sessions:

- resume each matching session
- replay each matching session
- bridge each matching session to every supported different target agent
- include `isLatest` so app surfaces can keep compact quick actions while still offering per-session choices

Bridge targets include Claude Code, Codex, and QoderCLI through the existing route aliases such as `c2x`, `c2q`, `x2c`, `x2q`, `q2c`, and `q2x`.

The action id must be stable enough for a local menu bar refresh cycle, but it does not need to be a permanent database id yet.

### Run Action

Executes an action by id.

For phase 1, `run-action` delegates to the existing KAGE CLI command surface instead of adding a new execution engine. When called with `--json`, delegated command output must be captured inside the JSON payload so GUI consumers can decode the response reliably.

## Non-Goals

- native Swift app project
- DMG packaging
- background daemon
- persistent export manifest
- destructive actions

Global text search was intentionally left out of phase 1, then implemented separately as `kage search` once the session inventory contract was stable.

## Implementation Order

1. Extend CLI parsing and help output.
2. Add doctor helpers.
3. Generalize session listing across agents.
4. Generate action payloads from session results.
5. Execute action ids through existing route aliases.
6. Add tests and docs.

## Verification

- [x] `npm test`
- [x] `git diff --check`
- [x] Manual `kage doctor --json`
- [x] Manual `kage sessions --json`
- [x] Manual `kage actions --json`
