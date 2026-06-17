# GitHub Presence Guide

KAGE's GitHub page is the main product surface until the desktop app has signed releases and a broader website. Treat the repo page as a landing page, support desk, roadmap, and launch archive.

## Repository About

Keep these fields aligned after every positioning change:

- Description: `Local memory for AI coding agents. Find, replay, fork, bridge, and dispatch Claude Code, Codex, and Qoder sessions.`
- Website: `https://farmcan.github.io/kage/`
- Topics: `ai-coding`, `coding-agents`, `claude-code`, `codex`, `qodercli`, `qoderwork`, `session-management`, `agent-memory`, `local-first`, `desktop-app`, `macos`, `cli`

Do not add topics that imply shipped capabilities before they exist, such as `ios`, `sync`, `remote-control`, `daemon`, or `terminal-emulator`.

## README Design

The README should convert a first-time visitor in this order:

1. One-line category: local memory layer for AI coding agents.
2. Pain line: useful agent work is scattered across local transcripts.
3. Fit check: who should use KAGE and who should skip it for now.
4. Proof: fast path commands and concrete workflows that a visitor can try.
5. Fast path: install, doctor, sessions, search, bridge.
6. Product boundary: local-first, not a terminal or coding agent.
7. Support matrix: Claude Code, Codex, QoderCLI, and QoderWork routes.
8. Contribution path: issue templates, contributing guide, current docs.

Keep the top third short. Move deep route tables and implementation details below the quick-start path. Do not lead with mobile remote-control language; KAGE's stronger open-source differentiation is reusable local agent memory.

The README should also include a plain comparison against nearby alternatives:

- native Codex / Claude resume pickers
- Claude Remote Control, Codex mobile remote, MuxAgent-style remote control
- Warp or a normal terminal
- raw transcript scripts
- hosted knowledge tools

## GitHub Pages Homepage

The Pages site should be lighter than the README:

- strong one-screen product pitch
- one terminal demo
- no product screenshot until the real UI is polished enough to improve trust
- two CTAs: GitHub repo and releases
- one "why star" section that explains the memory-layer advantage
- current workflows, not historical implementation plans
- a clear boundary that `kage serve` is local/LAN-first while hosted Remote Link is only a future optional direction

Do not duplicate the entire README. The site should help someone decide whether to click GitHub.

Maintain the homepage as the product changes:

- When a feature ships, update the hero proof chips and the workflow section before adding roadmap copy.
- When a release ships, update the DMG link, latest-version chip, project-status copy, and release CTA together.
- When the UI becomes strong enough for public visuals, add one carefully reviewed real capture; otherwise keep the page text-and-command first.
- When remote access changes, keep the copy explicit about local/LAN-first behavior versus optional relay behavior.
- When a capability is only planned, phrase it as a direction in Project status, not as a shipped workflow.
- After each homepage edit, open the page locally and verify the install path, CTAs, and responsive layout are not clipped.

## Releases

Every public release should include:

- a short user-facing headline
- unsigned DMG artifact once packaging is ready
- CLI install command
- a real UI screenshot/GIF only if it improves the release; otherwise use the CLI install path and workflow summary
- known limitations
- link to the release checklist

Release notes should explain what workflow improved, not only which files changed.

## Issues

Keep issue templates focused:

- Bug report: repro, agent, OS, sanitized output.
- Feature request: workflow problem, proposal, product-boundary checks.
- Growth task: launch copy, release packaging, docs, and only polished real visuals.

Use labels to make the public roadmap legible:

- `area:desktop`
- `area:cli`
- `area:docs`
- `area:mobile`
- `area:release`
- `area:search`
- `growth`
- `privacy`

## Social Preview And Visuals

Only add product visuals when they look better than no image. A stiff, cropped, or confusing capture should not appear in README, Pages, or Releases.

Best future asset:

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

## Churn Audit

Run a five-round churn audit before public launches:

1. First 10 seconds: can a stranger describe what KAGE does?
2. Fit check: can they tell whether KAGE is for them?
3. Install friction: do unsigned app, prerequisites, or empty state risks block them?
4. First success: is the search -> bridge -> resume workflow obvious?
5. Star decision: is there enough proof that the project is alive and worth remembering?

Archived audit: [Five-round user churn audit](archive/2026-05/user-churn-audit-2026-05-31.md).
