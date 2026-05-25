# KAGE Menu Bar App

This is the native macOS menu bar client for KAGE.

The app is intentionally a thin UI shell. It does not parse Claude Code, Codex, or QoderCLI transcripts. It calls the stable KAGE JSON contract instead:

- `kage doctor --json`
- `kage sessions --json`
- `kage actions --json`
- `kage run-action <id> --json`

## Build

```bash
cd app
swift build
./bundle.sh
open .build/release/KAGE.app
```

Package a local DMG:

```bash
cd app
./package.sh
open .build/release/KAGE-0.1.0.dmg
```

`package.sh` creates an unsigned DMG by default. Set `KAGE_CODESIGN_IDENTITY` to sign the `.app` and `.dmg`, and set `KAGE_NOTARY_PROFILE` to submit the DMG through `xcrun notarytool`.

## Architecture

```text
KAGE CLI JSON
  -> Services/KageCLI.swift
  -> Services/SessionPoller.swift
  -> AppState.swift
  -> Views/*
```

- `KageCLI` is the only process boundary.
- `SessionPoller` owns refresh, doctor/action loading, and new-session detection.
- `AppState` owns watched-directory settings and persistence.
- `Views` render state and trigger commands, but do not know transcript formats.

Every CLI call sets `Process.currentDirectoryURL` from the watched directory. This is required because KAGE scopes sessions and actions by cwd.

## UI References

- Apple `MenuBarExtra`: https://developer.apple.com/documentation/swiftui/menubarextra
- MeetingBar: https://github.com/leits/MeetingBar
- SwiftBar: https://github.com/swiftbar/SwiftBar
- SwiftBar product pattern: https://ameba.co/swiftbar/

The product shape follows MeetingBar's low-noise status item with a richer expanded menu, and SwiftBar's principle that external command output can be safely rendered by a thin native shell.
