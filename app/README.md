# KAGE Desktop App

This is the native macOS desktop client for KAGE. It includes a normal desktop
window for browsing sessions plus a compact menu bar surface for quick actions.

The app is intentionally a thin UI shell. It does not parse Claude Code, Codex, QoderCLI, or QoderWork transcripts. It calls the stable KAGE JSON contract instead:

- `kage doctor --json`
- `kage sessions --json`
- `kage search --json`
- `kage actions --json`
- `kage run-action <id> --json`

## Build

Download the latest unsigned DMG:

```text
https://github.com/farmcan/kage/releases/download/v0.1.14/KAGE-0.1.14.dmg
```

If macOS blocks the first launch, right-click `KAGE.app`, choose `Open`, then confirm.

From the repository root:

```bash
swift build --package-path app
swift run --package-path app kage-contract-smoke
(cd app && ./bundle.sh)
open app/.build/release/KAGE.app
```

The main window opens to a session workspace with a sidebar, search, agent
filters, session details, and per-session continue / fork / bridge / replay story actions. To keep
large local histories responsive, the desktop workspace loads a recent 90-day / 120-session window
by default; use `Load Full History` in the sidebar footer when you want to browse older sessions.
Use `New Session` to start a fresh Codex, Claude Code, or QoderCLI session in the watched directory.
The menu bar item remains available for lightweight status checks and quick opens.

The embedded terminal launches commands through `/bin/zsh -lc` with a Homebrew/npm-friendly PATH.
Use the `Terminal.app` button when a high-volume interactive session feels better in the native
macOS terminal.

If the selected directory has no sessions yet, click `Explore Demo` in the empty state. Demo mode uses built-in sanitized sessions and safe preview actions, so it does not read, write, or upload private transcripts.

Package a local DMG:

```bash
(cd app && ./package.sh)
open app/.build/release/KAGE-0.1.14.dmg
```

`package.sh` creates an unsigned DMG by default. Set `KAGE_CODESIGN_IDENTITY` to sign the `.app` and `.dmg`, and set `KAGE_NOTARY_PROFILE` to submit the DMG through `xcrun notarytool`.

`bundle.sh` copies `Resources/AppIcon.icns` into the app bundle and sets `CFBundleIconFile`, so the DMG, Finder, Dock, Cmd-Tab, and Launchpad show the branded KAGE icon.

If the GUI app cannot find the CLI because macOS did not inherit your terminal PATH, set `KAGE_PATH` before launching it during local testing:

```bash
KAGE_PATH="$(command -v kage)" open app/.build/release/KAGE.app
```

## Architecture

```text
KAGE CLI JSON
  -> Services/KageCLI.swift
  -> Services/SessionPoller.swift
  -> AppState.swift
  -> Views/*
```

- `KageContracts` is the shared Swift module for Codable CLI JSON payloads.
- `KageCLI` is the only process boundary.
- `SessionPoller` owns refresh, doctor/action loading, and new-session detection.
- `AppState` owns watched-directory settings and persistence.
- `Views` render state and trigger commands, but do not know transcript formats.

Every CLI call sets `Process.currentDirectoryURL` from the watched directory. This is required because KAGE scopes sessions and actions by cwd.

For the broader product boundary, see [KAGE Architecture Review](../docs/architecture-review-2026-05-28.md).

## UI References

- Apple `MenuBarExtra`: https://developer.apple.com/documentation/swiftui/menubarextra
- MeetingBar: https://github.com/leits/MeetingBar
- SwiftBar: https://github.com/swiftbar/SwiftBar
- SwiftBar product pattern: https://ameba.co/swiftbar/

The product shape follows MeetingBar's low-noise status item with a richer expanded menu, and SwiftBar's principle that external command output can be safely rendered by a thin native shell.
