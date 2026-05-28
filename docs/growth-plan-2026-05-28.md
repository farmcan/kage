# KAGE Growth Plan

Date: 2026-05-28

## Goal

Make KAGE easy to understand, easy to try, and easy to recommend.

The product goal is not "more commands." The product goal is that a developer who already uses two or more AI coding agents can see KAGE and immediately think:

> I have lost useful agent context before. This fixes that.

## Star Strategy

Stars usually follow a simple chain:

1. The project name and repo description make sense.
2. The README hero explains the pain in one screen.
3. A screenshot or GIF proves the product exists.
4. The user can try it in under a minute.
5. The roadmap suggests the project is alive.
6. The project gives people an obvious reason to share it.

KAGE currently has real technical value, but it needs stronger packaging around that chain.

## Audience

Primary audience:

- developers using Claude Code and Codex in the same week
- developers with many local agent sessions
- people who prefer local-first tooling
- power users who script agent workflows

Secondary audience:

- Warp users who run external coding agents
- maintainers who want to inspect or sanitize session history
- teams exploring agent auditability without uploading full transcripts

Not the audience yet:

- people who want a hosted AI coding platform
- people who only use one agent and never resume old sessions
- teams needing enterprise sync, RBAC, or cloud storage today

## Public Message

Main message:

> Your AI coding agents already have memory. KAGE makes it searchable, portable, and local.

Short repo description:

> Local-first desktop and CLI session manager for Claude Code, Codex, and QoderCLI.

Launch post angle:

> I built a local desktop app to search, resume, and move AI coding sessions across Claude Code, Codex, and QoderCLI.

## Product Proof Needed Before Promotion

Minimum before asking strangers to try it:

- Desktop app opens as a normal macOS app.
- Search uses transcript-aware `kage search`.
- Bridge result shows a resume command and safe open/copy actions.
- README has a screenshot or GIF.
- GitHub Release has an unsigned DMG.
- README has a 60-second path for CLI and desktop.
- Issues are organized into clear contribution lanes.

## Distribution Plan

### GitHub

- Keep repo description and topics aligned with the public message.
- Add screenshots/GIF above the fold.
- Use issue templates so bug reports include agent, OS, command, and transcript privacy boundaries.
- Keep labels focused:
  - `area:desktop`
  - `area:cli`
  - `area:docs`
  - `area:release`
  - `area:mobile`
  - `good first issue`
  - `help wanted`
  - `growth`

### Releases

Each release should include:

- CLI install command
- DMG download
- known macOS unsigned-app note
- one animated GIF or screenshot
- a short "what problem this release solves"

### Launch Channels

First launch after DMG and screenshot:

- GitHub release announcement
- X / Bluesky short video post
- Hacker News "Show HN"
- Reddit communities for command-line, macOS apps, Claude Code, Codex, and Warp

Do not lead with implementation internals. Lead with the problem:

- "I could not find the agent session where the useful plan happened."
- "I wanted to continue a Claude Code session in Codex."
- "I did not want to paste transcripts between tools."

## Roadmap For More Stars

### Stage 1: Make It Legible

- README hero screenshot/GIF.
- "Try it in 60 seconds."
- Product strategy linked from README.
- Release checklist and issue templates.

### Stage 2: Make It Trustworthy

- Unsigned DMG release.
- Clear local-first privacy statement.
- Transcript search in desktop.
- Large-session safety states.

### Stage 3: Make It Shareable

- Demo GIF: search -> bridge -> open resume command.
- Short demo video.
- Example workflows for Claude -> Codex, Codex -> Claude, QoderCLI -> Codex.
- Comparison section: KAGE vs agent-native resume pickers vs terminal agents.

### Stage 4: Make It Habitual

- Terminal launch target setting, including Warp.
- Session labels/tags.
- Cleanup review UI.
- Mobile companion plan once desktop retention is proven.

## Metrics

Useful project metrics:

- GitHub stars
- release downloads
- README install command clicks, if GitHub analytics are available through release/download counts
- issue quality and repeat reporters
- number of supported agent/session stores

Useful product metrics later:

- sessions discovered per user
- searches run
- bridge actions completed
- resume commands opened
- cleanup actions previewed vs confirmed

Keep telemetry out until there is a clear opt-in story. For now, use GitHub-native signals.
