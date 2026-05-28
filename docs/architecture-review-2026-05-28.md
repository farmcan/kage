# KAGE Architecture Review

Date: 2026-05-28

## Executive Summary

KAGE should be a local-first session layer for AI coding agents.

The most reasonable architecture is:

```text
Agent transcript stores
  -> source adapters
  -> normalized session model
  -> core session services
  -> CLI JSON contract
  -> desktop / menu bar / future daemon / future mobile surfaces
```

The important choice is that the CLI/core layer remains the authority for transcript parsing, route logic, search, export, cleanup, and action execution. The macOS app and any future mobile surface should consume stable JSON commands instead of learning agent-specific file formats.

This keeps KAGE valuable without turning it into another general terminal, IDE, cloud agent, or coding model runtime. The desktop app can host a bounded terminal pane for explicit resume actions, but that pane should remain tied to KAGE sessions rather than becoming a general shell workspace.

## What KAGE Is

KAGE is a local control surface for agent session memory.

It helps users answer:

- Where is the session that already contains useful context?
- Can I resume or fork it safely?
- Can I move this context from one agent to another?
- Can I inspect or replay what happened without reading raw JSONL?
- Can I clean local session clutter without deleting something useful?

## What KAGE Is Not

KAGE should not become:

- a coding agent
- a general-purpose terminal emulator
- a general-purpose live PTY controller
- an IDE
- a hosted session cloud
- a transcript-sync service by default
- a replacement for Claude Code, Codex, QoderCLI, Warp, Terminal, or iTerm

KAGE can integrate with those tools, but it should not compete with their core execution surfaces. The macOS app may embed a terminal only for explicit, session-scoped resume flows where the user is clearly continuing an existing Claude Code, Codex, or QoderCLI session from inside KAGE.

## Current Architecture

### Source Adapters

Location: `src/adapters/sources/*`

Responsibilities:

- Parse one agent's native session files.
- Normalize Codex, Claude Code, and QoderCLI transcript shapes into KAGE's internal session model.
- Preserve raw items only when a downstream feature needs them, such as story replay.

Rules:

- Source adapters are the only place that should know private transcript row shapes.
- Malformed rows should not break global discovery when a safe fallback exists.
- Adding a new agent starts here.

### Target Adapters

Location: `src/adapters/targets/*`

Responsibilities:

- Render KAGE's normalized session model into an agent-native output format.
- Own target-specific resume file layout and sidecar behavior.
- Keep bridge/export output deterministic where possible.

Rules:

- Target adapters should not scan source roots.
- Target adapters should receive a normalized session and render output.
- Adding a new export format starts here.

### Core Services

Location: `src/core/*`

Responsibilities:

- Agent registry and default roots.
- Session discovery and cwd matching.
- Search and date/project filtering.
- Routing and default export inference.
- Session transforms such as fork and split.
- Clean/export/install helpers.
- Story event modeling.

Rules:

- Core services should be importable and testable without invoking the CLI binary.
- Cross-agent logic belongs here, not in Swift.
- Core should return structured data; formatting belongs at the CLI boundary.

### CLI Boundary

Location: `src/cli.js`

Responsibilities today:

- Argument parsing.
- Human-readable command output.
- JSON command contract for app surfaces.
- Action id generation and run-action delegation.
- Doctor checks and shell command capture.

Current risk:

- `src/cli.js` is doing too much. It is both command parser, app contract builder, doctor service, action service, formatting layer, and command runner.

Recommended next refactor:

```text
src/core/inventory.js      sessions/actions data builders
src/core/doctor.js         readiness checks
src/core/actions.js        action list + run-action orchestration
src/cli/formatting.js      human-readable output
src/cli/args.js            argument parsing
src/cli.js                 thin command dispatcher
```

Do this incrementally. Do not refactor while changing behavior unless the behavior is covered by focused tests.

### Swift Contracts

Location: `app/Sources/KageContracts/*`

Responsibilities:

- Decode CLI JSON payloads.
- Provide small computed properties for display identity.
- Stay dumb and stable.

Rules:

- Codable models mirror the CLI JSON contract.
- They should not infer transcript semantics.
- Contract changes require `kage-contract-smoke` updates.

### macOS App

Location: `app/Sources/KageMenuBar/*`

Responsibilities:

- Render desktop and menu bar surfaces.
- Persist watched directory, refresh cadence, notifications, and selected agent.
- Call `kage` subprocess commands through `KageCLI`.
- Show explicit action results and user-controlled launch/copy/reveal options.
- Host an embedded PTY for explicit resume actions, using commands produced by the CLI contract.

Rules:

- The app should not parse transcript files.
- The app should not build bridge commands from Swift-only knowledge.
- If the app needs new data, add it to CLI JSON first.
- Live agent launch should remain an explicit user action.
- Embedded terminal sessions should be tied to one selected session and should not become a general terminal tab system.

## Target Architecture

```text
┌────────────────────────────────────────────────────────────┐
│ Agent session stores                                      │
│ ~/.codex/sessions  ~/.claude/projects  ~/.qoder/projects  │
└───────────────┬────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────┐
│ Source adapters             │
│ parse native transcript     │
└───────────────┬─────────────┘
                ▼
┌─────────────────────────────┐
│ Normalized session model    │
│ agent, id, cwd, messages    │
└───────────────┬─────────────┘
                ▼
┌─────────────────────────────┐
│ Core services               │
│ discovery/search/actions    │
│ routing/export/cleanup      │
└───────────────┬─────────────┘
                ▼
┌─────────────────────────────┐
│ CLI JSON contract           │
│ doctor/sessions/search      │
│ actions/run-action/clean    │
└──────┬────────┬─────────────┘
       │        │
       ▼        ▼
┌───────────┐ ┌────────────────┐
│ macOS app │ │ future daemon  │
│ desktop + │ │ mobile bridge  │
│ menu bar  │ │ cache + auth   │
└───────────┘ └────────────────┘
```

## Product Meaning

The meaning of KAGE is not "convert JSONL files."

The meaning is:

> AI coding agents already create useful local memory. KAGE turns that memory into a searchable, resumable, portable, and reviewable project asset.

This matters because agent work is becoming fragmented:

- Different agents are better at different stages.
- Long-running sessions become hard to identify.
- Resume pickers become noisy.
- Valuable decisions disappear into local transcript folders.
- Users do not want to upload every transcript just to find their own work.

KAGE's wedge is local-first memory control across multiple agents.

## Do

- Keep transcript parsing local and adapter-based.
- Keep app surfaces thin over the CLI JSON contract.
- Make side effects explicit and user-triggered.
- Add preview-first workflows before destructive cleanup.
- Add bounded transcript preview and large-file safety before deep desktop inspection.
- Add terminal launch targets and the embedded resume pane as integrations, not as a terminal replacement.
- Use GitHub issues and release artifacts to make the roadmap public.

## Do Not

- Do not parse agent transcripts in Swift.
- Do not write directly into agent stores from mobile.
- Do not auto-run live agents after bridge by default.
- Do not build a hosted transcript sync service before local trust is strong.
- Do not make dashboards before search, preview, labels, and cleanup are genuinely useful.
- Do not add a new agent by special-casing it in the CLI dispatcher.

## Near-Term Implementation Plan

### 1. Stabilize The Contract

- Keep `doctor`, `sessions`, `search`, `actions`, and `run-action` as the app contract.
- Add `clean --json` to the app contract before exposing cleanup in UI.
- Keep Swift contract smoke tests updated for every new JSON shape.

### 2. Extract CLI Services

Recommended order:

1. Extract `buildSessionInventory` and `buildActionList` into `src/core/inventory.js` and `src/core/actions.js`.
2. Extract doctor checks into `src/core/doctor.js`.
3. Extract output formatting into `src/cli/formatting.js`.
4. Leave `src/cli.js` as parser and dispatcher.

This reduces risk before adding daemon/mobile surfaces.

### 3. Make Desktop Session Choice Trustworthy

- Add bounded transcript preview in the detail pane.
- Add file-size and partial-analysis state.
- Add local KAGE sidecar labels/tags instead of mutating source transcripts.
- Add result affordances for copy/open/reveal everywhere actions produce files or commands.

### 4. Prepare For Release

- Add screenshot/GIF assets.
- Ship unsigned DMG through GitHub Releases.
- Keep README, Pages, About, topics, issue templates, and release notes aligned.

### 5. Defer Mobile Until The Local Layer Is Solid

Mobile should wait until:

- inventory/search contract is stable
- app actions are safe and explicit
- there is an inventory cache or daemon boundary
- transcript privacy defaults are documented and enforced

## Architectural Tests And Checks

Use these checks to keep architecture honest:

- If a feature needs transcript data in Swift, first ask whether the CLI JSON contract is missing a field.
- If a feature runs a command, make sure the result can be represented as JSON.
- If a feature writes or deletes files, provide preview and explicit confirmation.
- If a feature adds a new agent, it should add source/target adapters and routing, not one-off CLI branches.
- If a feature needs remote/mobile behavior, design the daemon/auth boundary before exposing control actions.

## Decision

Adopt the local-first session-layer architecture.

KAGE's durable value is not owning the live coding surface. Its durable value is owning the local memory and portability layer that sits underneath many coding-agent surfaces.
