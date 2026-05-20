# May 20 CLI Issues Implementation Plan

Date: 2026-05-20

Scope: GitHub issues created on 2026-05-20 for `farmcan/kage`, with QoderCLI-only support preserved.

## Non-Negotiable Product Boundary

KAGE now supports `qodercli`, not the legacy `qoder` agent name.

- `q` remains a shorthand for `qodercli`.
- `qoder` as an explicit agent should fail with `Use qodercli instead`.
- QoderCLI exports must continue to install into `~/.qoder/projects/<project-key>/...`.
- QoderCLI resume hints must continue to use `qodercli --cwd <working-dir> --resume <session-id>`.

## Issue Inventory

### Already Planned Separately

- #3 Mobile multi-device session management
  - Status: product/architecture plan already recorded in `docs/mobile-multi-device-sessions-plan-2026-05-20.md`.
  - Not part of this CLI batch because it needs daemon/backend/mobile surfaces.

### This Batch: CLI Fixes And Usability

- #4 `kage update` fails with `EEXIST` when upgrading from older install.
- #5 Export falls back to an unrelated global latest session when no current-directory match exists.
- #6 Repeated exports create duplicate session files.
- #7 `--split-recent` accepts non-numeric values.
- #8 `--version` is missing.
- #9 No-args invocation gives an unhelpful error.
- #10 Claude session chooser shows `Updated: unknown time`.
- #11 `--run` should launch the target agent after export.
- #12 Unknown flags are silently ignored.
- #13 `kage clean` should remove duplicate/stale exports.
- #14 `--preview` / diff should show a human-readable export preview before writing.
- #15 Shell completions for bash/zsh/fish.

## Product Research Notes

- QoderCLI official docs list current install paths through cURL, Homebrew, and npm, plus `qodercli update` and forced cURL upgrade. KAGE should keep linking users to those official flows instead of inventing a custom downloader.
- QoderCLI official command docs expose resume as a first-class session workflow. KAGE should keep the generated hint in native form: `qodercli --cwd <working-dir> --resume <session-id>`.
- GitHub CLI uses `gh completion -s <shell>` to emit shell-specific completion scripts. KAGE follows that mature CLI pattern with `kage completions bash|zsh|fish`.
- npm documents `--force` as a way to force fresh remote fetch/install behavior. KAGE limits `npm install -g --force` to `install.sh`, not normal runtime commands.

References:

- https://docs.qoder.com/cli/quick-start
- https://docs.qoder.com/en/cli/user-guide/command
- https://cli.github.com/manual/gh_completion
- https://docs.npmjs.com/cli/v8/commands/npm-install/

## Implementation Order

### Phase 1: Safety And Correctness

- [x] #12 Reject unknown `--` options.
- [x] #7 Validate `--split-recent` as a positive integer.
- [x] #8 Add `--version` / `-V`.
- [x] #9 Show help for no-argument invocation.
- [x] #5 Remove silent fallback for export mode when no cwd match exists.
- [x] #10 Extract Claude `updatedAt` from the latest timestamp, with file mtime fallback where needed.

These are low-level CLI correctness changes. They reduce the chance that later feature flags behave ambiguously.

### Phase 2: Install And Export Hygiene

- [x] #4 Make `install.sh` upgrade older `agent-session-bridge` installs and use forced global install only in the installer context.
- [x] #6 Deduplicate default installed exports by using stable output paths for non-fork installs where the target supports it.
- [x] Keep explicit `--out` and `--output-dir` behavior unchanged.

Stable default exports should preserve resume commands and avoid polluting Codex/Claude/QoderCLI session directories during repeated bridge tests.

### Phase 3: User-Facing Flow Improvements

- [x] #14 Add `--preview` for human-readable export previews.
- [x] #11 Add `--run` to execute the generated resume command after writing files.
- [x] #13 Add `kage clean` with dry-run default, `--confirm` for deletion, and optional `--older-than <duration>`.
- [x] #15 Add `kage completions bash|zsh|fish`.

These features are larger but independent once parsing and install behavior are stable.

## Design Choices

### No Global Latest Fallback For Exports

If no session matches the current working directory, export mode should fail with:

```text
No <Agent> sessions match the current directory: <cwd>
Use --session or --session-id to specify a session explicitly.
```

Explicit `--session` and `--session-id` remain supported.

### Stable Export Paths

For default installs, repeated non-fork exports should write to a stable session-id-based path:

- Codex: keep the target under the dated sessions directory but make the filename stable for the source session id.
- Claude: use `<session-id>.jsonl` under the project key, which is already stable.
- QoderCLI: use `<session-id>.jsonl` plus `<session-id>-session.json`, which is already stable.

Fork exports still generate a fresh UUID and therefore remain distinct by design.

### Preview Before Writing

`--preview` should:

- parse and transform the source session
- show source/target, session id, message count, output paths, and resume command
- print a compact message list
- write no files

It should work with `--split-recent` and `--fork`.

### Run After Export

`--run` should:

- require an install plan with a resume command
- write files first
- then spawn the generated resume command through the user's shell
- reject combinations that do not produce a resume command, such as `--stdout` or explicit `--out`

### Clean

`kage clean` should be conservative:

- dry-run by default
- scan Codex, Claude, and QoderCLI roots
- group duplicate export files by session id
- keep newest by mtime
- optionally include stale files with `--older-than 7d`
- delete only with `--confirm`

### Completions

`kage completions <shell>` should support:

- `bash`
- `zsh`
- `fish`

The generated completions must list current QoderCLI-only agents:

- `claude`
- `codex`
- `qodercli`

## Verification Checklist

- [x] `npm test`
- [x] `git diff --check`
- [x] Manual `kage --version`
- [x] Manual `kage`
- [x] Manual unknown flag rejection
- [x] Manual QoderCLI route still exports and resumes via `qodercli --cwd ... --resume ...`

## Follow-Up

After this batch lands, close or comment on #4 through #15 with the matching commit id and any remaining caveats.

## Update: Issue #16 Fork Project Directory

Discovered after the first batch landed.

- #16 Same-agent fork operations (`c2c`, `x2x`, `q2q`) can write sessions under an `unknown` project directory.

### Root Cause

Some source sessions do not put `cwd` on the first row that contains `sessionId`. The source parsers used that first row directly, so `session.cwd` could become the literal string `unknown`. Target exporters then turned `unknown` into project keys such as:

```text
-Users-levi-wrksp-kage-unknown
```

### Fix Plan

- [x] Treat `unknown` as a missing cwd in source parsers.
- [x] For Claude and QoderCLI, fall back to decoding the project key from the source path when transcript rows or sidecars omit cwd.
- [x] For explicit Codex sessions with missing cwd, fall back to the current working directory at parse time.
- [x] Add regression tests for Claude, Codex, and QoderCLI same-agent forks preserving project cwd.
- [x] Re-run `npm test`.
- [x] Re-run `git diff --check`.
