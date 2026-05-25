# KAGE macOS Menu Bar App Plan

Date: 2026-05-20

## Product Goal

The Mac app should not be a decorative wrapper around the CLI. It should make KAGE visible every day as a session radar:

- show whether Claude Code, Codex, QoderCLI, and KAGE are ready
- list recent sessions for the current project
- copy or launch native resume commands
- bridge sessions through the existing CLI
- open session replay HTML
- surface `doctor` failures before a user tries a route

## Common Distribution Patterns

### Option A: Native SwiftUI menu bar app

Use Apple's `MenuBarExtra` API for a menu-bar-only utility. Apple documents it as a persistent control in the system menu bar, with `LSUIElement` hiding the Dock icon for utility-style apps.

Pros:

- best macOS fit and smallest runtime
- easiest to feel trustworthy as a background utility
- clean path to Sparkle updates
- can call the bundled `kage` CLI as a subprocess

Cons:

- macOS-only codebase
- requires Swift/AppKit comfort for richer popovers
- packaging/signing/notarization still must be handled

### Option B: Tauri shell

Tauri can bundle macOS `.app` and `.dmg` outputs, include external binaries and resources, and provide updater artifacts.

Pros:

- lighter than Electron
- web UI skills can build richer panels quickly
- has built-in bundle support for `.app` and `.dmg`

Cons:

- Rust/Tauri app lifecycle overhead
- GUI apps do not inherit shell `$PATH`, so CLI discovery needs careful handling
- menu bar integration may still need native plugin work

### Option C: Electron tray app

Electron has a `Tray` API and mature builder/updater tooling.

Pros:

- fastest if the app becomes a full visual desktop UI
- mature packaging ecosystem
- easy reuse of HTML session replay components

Cons:

- heavy runtime for a small always-on utility
- less ideal for trust-sensitive developer tooling
- signing and auto-update still require care on macOS

## Recommended Path

Start with native SwiftUI/AppKit.

KAGE's first app is a small, always-on Mac utility, not a cross-platform IDE shell. A native app keeps the footprint small and lets the CLI remain the source of truth. The Mac app should call stable JSON commands rather than parse session files itself.

## CLI Contract Needed First

Before creating the app project, add stable JSON commands:

- `kage doctor --json` implemented in phase 1
- `kage sessions --json` implemented in phase 1
- `kage actions --json` implemented in phase 1
- `kage run-action <id> --json` implemented in phase 1
- `kage replay <session-id> --json`

This keeps the app thin and avoids duplicating adapter logic.

## MVP Menu

```text
KAGE
Status: Ready

Current Project
  Claude Code
    Resume: docs plan
    Bridge to Codex
  Codex
    Resume: qodercli fix
  QoderCLI
    Resume: c2q test

Actions
  Find session...
  Replay latest session
  Run doctor

Settings
  Launch at login
  Open homepage
  Quit
```

## Packaging Plan

1. Build a signed `.app` bundle.
2. Produce a `.dmg` for direct download.
3. Notarize before public distribution so macOS Gatekeeper does not block first launch.
4. Add Sparkle for auto-updates once there are real users.
5. Keep Homebrew install as the CLI-first path.

## Logo Direction

Do not copy an existing anime or game mark. Use an original KAGE mark with:

- a leaf/shadow silhouette
- a command prompt shape
- a session-path curve
- strong monochrome readability for a menu bar icon

The app icon can use the richer color version. The menu bar icon should have a separate template variant.

## Sources Checked

- Apple `MenuBarExtra`: https://developer.apple.com/documentation/swiftui/menubarextra
- Tauri macOS bundling: https://v2.tauri.app/distribute/macos-application-bundle/
- Tauri v1 macOS `.app` / `.dmg` notes: https://v1.tauri.app/v1/guides/building/macos/
- Electron Tray API: https://www.electronjs.org/docs/api/tray/
- Electron auto updater: https://www.electronjs.org/docs/latest/api/auto-updater
- Sparkle update framework: https://sparkle-project.github.io/documentation/

## Update: Native SwiftPM App Scaffold

Date: 2026-05-25

Issue: https://github.com/farmcan/kage/issues/23

Implemented the first native app scaffold under `app/`:

- SwiftPM executable target `kage-menubar`.
- SwiftUI `MenuBarExtra` scene with `.window` presentation.
- `KageCLI` actor that locates `kage`, sets `Process.currentDirectoryURL`, and decodes JSON contract output.
- `SessionPoller` for sessions, doctor, actions, refresh interval, and new-session notification diffing.
- `AppState` for watched directory, history, refresh interval, notifications, and launch-at-login preference.
- Menu views for watched directory, agent tabs, session list, actions, footer warnings, and settings.
- `bundle.sh` for a minimal `.app` bundle with `LSUIElement = true`.
- `package.sh` for local unsigned DMGs plus optional Developer ID signing and notarization when credentials are provided.

Additional UI references checked while implementing:

- MeetingBar: https://github.com/leits/MeetingBar
- SwiftBar: https://github.com/swiftbar/SwiftBar
- SwiftBar product pattern: https://ameba.co/swiftbar/

The architectural boundary remains unchanged: the app is a renderer and action trigger for the CLI contract. Transcript parsing stays in the Node.js CLI.
