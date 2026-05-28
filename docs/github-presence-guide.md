# GitHub Presence Guide

KAGE's GitHub page is the main product surface until the desktop app has signed releases and a broader website. Treat the repo page as a landing page, support desk, roadmap, and launch archive.

## Repository About

Keep these fields aligned after every positioning change:

- Description: `Local-first desktop and CLI session manager for Claude Code, Codex, and QoderCLI.`
- Website: `https://farmcan.github.io/kage/`
- Topics: `ai-coding`, `claude-code`, `codex`, `qodercli`, `session-management`, `desktop-app`, `macos`

Do not add topics that imply shipped capabilities before they exist, such as `ios`, `sync`, `daemon`, or `terminal-emulator`.

## README Design

The README should convert a first-time visitor in this order:

1. One-line category: local-first desktop and CLI session manager.
2. Pain line: useful agent memory is scattered across local transcripts.
3. Proof: screenshot or GIF of desktop search and bridge flow.
4. Fast path: install, doctor, sessions, search, bridge.
5. Product boundary: local-first, not a terminal or coding agent.
6. Support matrix: Claude Code, Codex, QoderCLI routes.
7. Contribution path: issue templates, contributing guide, current docs.

Keep the top third short. Move deep route tables and implementation details below the quick-start path.

## GitHub Pages Homepage

The Pages site should be lighter than the README:

- strong one-screen product pitch
- one terminal demo
- one visual app screenshot or GIF once available
- two CTAs: GitHub repo and releases
- current workflows, not historical implementation plans

Do not duplicate the entire README. The site should help someone decide whether to click GitHub.

## Releases

Every public release should include:

- a short user-facing headline
- unsigned DMG artifact once packaging is ready
- CLI install command
- screenshot or GIF
- known limitations
- link to the release checklist

Release notes should explain what workflow improved, not only which files changed.

## Issues

Keep issue templates focused:

- Bug report: repro, agent, OS, sanitized output.
- Feature request: workflow problem, proposal, product-boundary checks.
- Growth task: screenshots, launch assets, release packaging, docs.

Use labels to make the public roadmap legible:

- `area:desktop`
- `area:cli`
- `area:docs`
- `area:mobile`
- `area:release`
- `area:search`
- `growth`
- `privacy`

## Social Preview And Screenshots

Highest priority asset:

- 15-25 second GIF: open desktop app -> search transcript -> select matched session -> bridge -> show copy/open/show result actions.

Use fixtures or a sanitized demo repo. Never show private user transcripts in launch assets.

Once the GIF exists:

- place it above "Try It In 60 Seconds" in README
- place it in the Pages hero or immediately below the hero
- attach it to the first public GitHub Release

## Maintenance Cadence

Before each release:

- verify repo About and topics
- verify README quick-start still works
- verify Pages headline matches README headline
- verify templates point to current docs
- close or update stale roadmap issues

After each launch:

- convert repeated questions into README FAQ entries
- turn repeated feature requests into labeled issues
- update the growth plan only when the positioning changes
