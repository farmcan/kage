# Remote Issues Fix Plan

Date: 2026-05-27

Scope: open GitHub issues #24 through #30 in `farmcan/kage`.

## Order

1. #24 Swift 6 build failure: add the UserNotifications preconcurrency import and verify `swift build`.
2. #25 App bundle CLI: make `bundle.sh` ship a self-contained KAGE CLI package under `Contents/Resources`.
3. #26 README build snippet: make root and app build commands copy-paste safe.
4. #27 Recent directory switching: remove silent Picker switching and make path identity clearer.
5. #28 Subdirectory aggregation: add `--include-subdirs` to CLI session/action/search inventory and expose it in the app.
6. #29 Session title noise: add bounded `shortTitle` plus shared filtering for tool/system pseudo-user messages.
7. #30 Menu bar polish: implement the high-impact small UX fixes; leave lower-value distribution polish documented if it needs asset/signing work.

## Commit Policy

Use one focused commit and push per issue where practical, then close the issue with the commit reference after verification.
