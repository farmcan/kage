# Release And Launch Checklist

Use this when preparing a public KAGE release or demo push.

## Release Goal

Every release should answer one question:

> What new local agent-memory workflow can a developer do now?

Avoid release notes that only list implementation files.

## Before Cutting A Release

- [ ] `npm run check:all`
- [ ] `npm test`
- [ ] `npm run test:e2e:real` after `(cd app && ./package.sh)`
- [ ] `swift build --package-path app`
- [ ] `swift run --package-path app kage-contract-smoke`
- [ ] `(cd app && ./bundle.sh)`
- [ ] `(cd app && ./package.sh)` for unsigned DMG
- [ ] Open the generated `KAGE.app`
- [ ] Verify desktop search against a real session
- [ ] Verify `Continue in KAGE terminal` starts an embedded session terminal
- [ ] Verify one bridge flow ends with Copy, Open in Terminal, and Show in Finder options
- [ ] Check README install instructions
- [ ] Check homepage copy

## Release Artifacts

- [ ] Source tag
- [ ] GitHub Release notes
- [ ] Unsigned DMG
- [ ] Screenshot or GIF
- [ ] CLI install command
- [ ] Known terminal limitations
- [ ] Known limitations

Suggested release title:

```text
KAGE v0.1.x: Local desktop search for AI coding sessions
```

Suggested release description shape:

```text
KAGE is a local-first desktop app and CLI for finding, resuming, and moving AI coding sessions across Claude Code, Codex, and QoderCLI.

This release focuses on:
- desktop session browsing
- transcript-aware search
- embedded resume terminal for selected sessions
- explicit bridge result actions
- local-first CLI JSON contract

Try:
curl -fsSL https://raw.githubusercontent.com/farmcan/kage/main/install.sh | bash
kage doctor
kage search "auth"
```

## Screenshot/GIF Checklist

The best first GIF is 15-25 seconds:

1. Open KAGE desktop app.
2. Show Claude, Codex, and QoderCLI sessions in the sidebar.
3. Search for a real term.
4. Select a matched session and show the match snippet.
5. Bridge it to another agent.
6. Show Copy / Open in Terminal / Show in Finder result actions.

Avoid showing private transcript content. Use fixtures or a demo repo if possible.

## Launch Copy

### Short

```text
I built KAGE, a local-first desktop app and CLI for finding, resuming, and moving AI coding sessions across Claude Code, Codex, and QoderCLI.

Your agents already have memory. KAGE makes it searchable, portable, and local.
```

### Show HN

```text
Show HN: KAGE, a local-first desktop app for AI coding session history

I built KAGE because I kept losing useful context across Claude Code, Codex, and QoderCLI sessions.

KAGE scans local session stores, gives you a desktop workspace for browsing and transcript search, and can bridge a useful session into another agent's native resume format. It also has a CLI for scripts and power users.

The core idea: your AI coding agents already have memory; KAGE makes it searchable, portable, and local.
```

### Reddit / Community

```text
I made a small local-first macOS app for people who use multiple AI coding agents.

KAGE lets you browse and search local Claude Code, Codex, and QoderCLI sessions, then resume, replay, or bridge a session into another agent without copy-pasting transcripts.

It is early, but the CLI and desktop app are both open source.
```

## Channels

- [ ] GitHub Release
- [ ] X / Bluesky
- [ ] Hacker News Show HN
- [ ] r/commandline
- [ ] r/macapps
- [ ] Codex / Claude Code communities where allowed
- [ ] Warp community only when terminal launch target support exists

## After Launch

- [ ] Watch issues for install failures
- [ ] Label bugs by area
- [ ] Convert repeated questions into README FAQ
- [ ] Create small follow-up issues from feedback
- [ ] Keep scope disciplined: session layer, not terminal replacement
