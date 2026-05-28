# KAGE Desktop Release Plan

Date: 2026-05-29

## Current Screenshot Review

Screenshot captured from the release app:

```text
/tmp/kage-current-review.png
```

Findings:

- The main window opens reliably, and directory grouping is visible in the sidebar.
- The product shape is now closer to Codex Desktop: select a session, inspect it, then continue from the same surface.
- The right pane still reads too much like a metadata inspector before the terminal starts.
- The old action grid made resume/replay/bridge actions compete visually, which made the primary workflow less clear.
- Agent filtering exists, but the primary information architecture should be directory first, agent second.

## Product Boundary

KAGE should be:

- A local-first session workspace for AI coding agents.
- A project/directory memory layer over Claude Code, Codex, and QoderCLI sessions.
- A place to find, search, inspect, continue, bridge, replay, and clean session memory.
- A thin native desktop shell over the CLI JSON contract.

KAGE should not be:

- A general terminal replacement.
- An IDE.
- A hosted transcript sync product by default.
- A new coding agent.

The embedded terminal is useful only when it is session-scoped. It should run resume commands produced by KAGE actions, not become a generic terminal tab system.

## Interaction Model

Near-term desktop layout:

```text
Directory sidebar
  -> sessions grouped by cwd
  -> agent chips as filters
  -> transcript search

Session workspace
  -> identity and cwd
  -> primary Continue in KAGE terminal
  -> embedded terminal when running
  -> compact actions: bridge, replay, reveal
  -> search match, recent messages, metadata
```

Click behavior:

- Single click selects and inspects a session.
- Double click resumes the session in the embedded KAGE terminal.
- Bridge actions create a target-agent session and show copy/reveal/open options.
- Cleanup and destructive actions must remain preview-first.

## Architecture Decision

Keep the current layered architecture:

```text
agent transcript stores
  -> JS source adapters
  -> normalized session model
  -> JS core services
  -> CLI JSON contract
  -> Swift desktop/menu bar
```

The macOS app can embed SwiftTerm, but Swift should not parse transcript files or invent route logic. If the UI needs new information, add it to the JSON contract and smoke-test it.

## Release Path

First public desktop release should ship as `v0.1.0` or `v0.1.1` with:

- npm CLI install path.
- Unsigned macOS DMG from `app/package.sh`.
- Screenshot or short GIF using non-private demo sessions.
- Release notes focused on a workflow, not implementation files.
- Known limitations: unsigned app, local-only, macOS-only desktop app, embedded terminal is early.

Recommended GitHub Release flow:

```bash
npm test
swift build --package-path app
swift run --package-path app kage-contract-smoke
(cd app && ./package.sh)
gh release create v0.1.0 app/.build/release/KAGE-0.1.0.dmg \
  --title "KAGE v0.1.0: Local desktop workspace for AI coding sessions" \
  --notes-file docs/release-notes/v0.1.0.md
```

## Pre-Launch Work

Highest leverage tasks:

- Replace README screenshot placeholder with a real screenshot/GIF.
- Add release notes for the first desktop DMG.
- Add a GitHub Actions workflow that packages unsigned DMG artifacts on tags.
- Add a demo fixture project or sanitized sessions for screenshots.
- Make desktop actions visually compact and make the embedded terminal the obvious continuation surface.

