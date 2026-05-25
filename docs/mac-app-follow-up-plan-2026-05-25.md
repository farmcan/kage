# macOS App Follow-Up Plan

Date: 2026-05-25

Context: issue #23 shipped the first native SwiftPM menu bar app scaffold. This plan covers the next practical work after the scaffold, with one small commit per finished slice.

## Product Boundary

KAGE remains CLI-first. The macOS app should stay a thin native surface that consumes the JSON contract and triggers existing KAGE actions.

Do not move transcript parsing, route logic, export logic, or agent-specific file knowledge into Swift. If the app needs new data, add it to the CLI JSON contract first.

## References Checked

- Apple `MenuBarExtra`: persistent menu bar utility surface.
- MeetingBar: polling external state, compact menu status, native notifications.
- SwiftBar: native shell around command/script output.

The useful pattern is the combination of MeetingBar's polling/notification model with SwiftBar's command-output boundary.

## Step 1: Distribution Scaffold

Goal: make local builds easy to hand to another Mac user.

Implement:

- [x] keep `bundle.sh` focused on `.app`
- [x] add a separate packaging script for `.dmg`
- [x] support unsigned local DMGs by default
- [x] support optional codesign/notarize paths only when Apple credentials are provided

Non-goals:

- no fake signing
- no fake notarization
- no Sparkle updater until real release artifacts exist

## Step 2: CLI Location Reliability

Goal: reduce the classic macOS GUI app problem where `$PATH` differs from an interactive terminal.

Implement lookup order:

1. [x] `KAGE_PATH` environment override
2. [x] app bundle `Contents/Resources/kage` placeholder path
3. [x] common Homebrew/npm/local paths
4. [x] login shell `command -v kage`

The app still treats KAGE CLI as the source of truth.

## Step 3: Contract Tests

Goal: catch App/CLI JSON drift early.

Implement Swift tests that decode representative JSON for:

- `doctor --json`
- `sessions --json`
- `actions --json`

This does not replace Node CLI tests. It verifies the Swift app's Codable contract layer.

## Later, Only If Needed

- multi-directory watching
- richer search UI
- DMG design polish
- Developer ID signing
- notarization
- Sparkle auto-update

Those are real product/distribution tasks, but they should follow the basic build/package/test foundation.
