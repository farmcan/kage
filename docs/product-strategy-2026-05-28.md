# KAGE Product Strategy

Date: 2026-05-28

## Positioning

KAGE is the local-first session layer for AI coding agents.

It is not trying to become another coding agent, terminal, IDE, or cloud task runner. Its job is to make the work that already happened inside Claude Code, Codex, QoderCLI, and adjacent tools findable, resumable, forkable, portable, and reviewable.

The short public pitch:

> A local-first desktop app and CLI for finding, resuming, and moving AI coding sessions across Claude Code, Codex, and QoderCLI.

## Why This Exists

AI coding tools create useful memory, but that memory is scattered across local transcript stores and product-specific resume flows. Developers remember that an important plan, bug hunt, or implementation attempt happened, but not which agent, which directory, or which raw session file holds it.

KAGE turns those transcripts into local project assets:

- Find the session where useful context already exists.
- Resume or fork it in the original agent.
- Bridge it into another agent when the next step fits a different tool.
- Replay or inspect the transcript without opening raw JSONL.
- Clean and manage old sessions without guessing what is safe.

## Adjacent Product Learnings

### Warp

Warp's agent value is centered on the live terminal: natural-language input, environment-aware command guidance, interactive PTY control, approvals, and handoff/takeover inside a running process.

KAGE should not compete there. KAGE should integrate with terminal launch targets, including Warp, but avoid becoming a terminal emulator or live PTY controller. That keeps the product smaller and lets Warp stay the place where live command work happens.

KAGE can learn from Warp's interaction model:

- Make permissions and side effects explicit.
- Prefer "open in terminal" over surprising auto-launch behavior.
- Treat agent work as something the human supervises and can take over.
- Keep local privacy and data boundaries visible.

### Codex CLI and Codex Desktop

Codex is moving toward shared sessions across CLI, desktop, IDE, and cloud surfaces. That validates the core user need: a session should not be trapped in the surface where it started.

KAGE's opportunity is broader than Codex alone:

- It can span multiple agents.
- It can normalize different local session stores.
- It can provide cross-agent search and bridge actions.
- It can expose one desktop workspace without owning the agent runtime.

Known user pain in the Codex ecosystem also maps directly to KAGE:

- resume pickers become hard to scan as sessions grow
- users want named, searchable, reviewable sessions
- old sessions need safe cleanup workflows
- CLI and app session continuity matters
- large transcript files need bounded, responsive inspection

### Codex Session Browsers

Codex-specific tools such as codlogs show that users want local session search, export, transcript browsing, title editing, sanitization, and large-file safety. KAGE should borrow the good product primitives while keeping its differentiator:

- multi-agent inventory
- bridge/fork/resume across agents
- one CLI contract consumed by native app surfaces

## Product Boundary

### KAGE Should Do

- Discover local sessions for supported agents.
- Search across titles, cwd, session ids, recent prompts, and transcript text.
- Show enough context to confidently choose a session.
- Launch native resume commands in a terminal.
- Bridge sessions between supported agents through explicit user actions.
- Generate replay/export artifacts.
- Manage local session clutter with preview-first cleanup.
- Stay local-first by default.

### KAGE Should Not Do Yet

- Run its own coding agent.
- Become a terminal emulator.
- Attach to live PTYs.
- Upload full transcripts by default.
- Auto-launch agents after bridge without user confirmation.
- Mutate source session files except for deliberate future features like user-approved title metadata.
- Replace Codex, Claude Code, QoderCLI, Warp, or an IDE.

## Core Interaction Model

### Desktop Workspace

The desktop app is the main product surface.

Primary layout:

- Sidebar: watched directory, include-subdirs toggle, agent filter, search, session list.
- Detail pane: title, agent, cwd, updated time, session id, source file, recent user messages, search match snippet.
- Action rail: resume, bridge, replay, show in Finder, copy ids/commands.
- Result card: after bridge/export, show exact resume command with Copy, Open in Terminal, Show in Finder.

Search behavior:

- Empty search shows project-scoped inventory.
- Non-empty search should use the CLI's transcript-aware `kage search`, not only UI filtering.
- Results should remain actionable by matching returned sessions to available actions.

### Menu Bar Surface

The menu bar is a status and quick-action companion, not the main product.

It should show:

- current watched directory
- latest sessions by agent
- quick resume/bridge for recent sessions
- warnings from doctor
- open desktop workspace

### CLI Surface

The CLI remains the durable automation and integration layer.

It should provide:

- `kage sessions --json`
- `kage search --json`
- `kage actions --json`
- `kage run-action --json`
- `kage clean --json`
- bridge aliases for power users and scripts

### Mobile Companion

Mobile should be a later companion, not a first implementation target.

Best shape:

- PWA first
- pair with a local daemon
- show devices, runtimes, sessions, online/stale/offline state
- default to metadata and summaries
- require explicit opt-in for full transcript upload
- treat file mutation and agent launch as high-risk actions requiring approval

## Value Proposition

For individual developers:

- Stop losing context across many AI coding sessions.
- Resume the right thread faster.
- Move work between agents without pasted transcripts.
- Review previous attempts before starting over.

For power users:

- Automate session discovery and bridge flows.
- Keep local transcript control.
- Use Warp, Terminal, iTerm, or agent-native CLIs as launch targets.

For future teams:

- Share sanitized session artifacts.
- Audit which agent context produced a change.
- Build project-level agent memory without centralizing raw transcripts by default.

## Implementation Roadmap

### Phase 1: Make The Current Desktop App Useful

- Replace title-only local filtering with transcript-aware `kage search`.
- Add search match snippets to session details.
- Add empty/loading/error states that explain what the app is doing.
- Add screenshot/GIF assets to README and homepage.
- Ship unsigned GitHub Release DMG.

### Phase 2: Make Session Choice Trustworthy

- Add bounded transcript preview in desktop detail.
- Add file-size and partial-analysis states for large sessions.
- Add session labels/tags stored in a KAGE sidecar, not source transcripts.
- Add project grouping and recent directory switching in the desktop window.

### Phase 3: Make Actions Safer And More Useful

- Add terminal launch target setting: Terminal, iTerm, Warp, WarpPreview.
- Add preview-before-bridge in desktop.
- Add export manifest so KAGE can explain and clean what it wrote.
- Add safer cleanup UI for stale/duplicate sessions.

### Phase 4: Mobile And Multi-Device

- Extract a reusable inventory cache.
- Add `kage daemon start/status`.
- Add local pairing and heartbeat.
- Build a mobile web companion for metadata-first session monitoring.

## Adoption Plan

The GitHub project needs a faster first impression:

- README hero screenshot or GIF of desktop search -> bridge -> resume.
- "Try it in 60 seconds" section.
- GitHub Release with DMG artifact.
- Clear "Why KAGE?" pain bullets.
- Short demo post aimed at developers already using multiple agents.
- Issue templates for bugs, product requests, and growth tasks.
- A release and launch checklist that keeps screenshots, DMGs, and launch copy from being forgotten.

The strongest public message:

> Your AI coding agents already have memory. KAGE makes it searchable, portable, and local.
