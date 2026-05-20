# Mobile Multi-Device Sessions Plan

Date: 2026-05-20

Issue: https://github.com/farmcan/kage/issues/3

Status: research and implementation plan only. No implementation has been started.

## Goal

Add a mobile-facing way to view and switch between agent sessions running on multiple authorized computers.

The user story from the issue:

- multiple computers, such as work and personal machines, have Codex / agent tooling installed
- one phone should show all authorized devices under the same account
- the phone should be able to switch between devices and observe or resume sessions
- each device should show online state and last active time
- insufficient permission should produce clear authorization / pairing guidance

## Current KAGE Baseline

KAGE is currently a local CLI session bridge:

- `README.md` defines the core behavior as exporting local Codex, Claude, and Qoder session files.
- `src/core/agents.js` only knows local agent roots such as `~/.codex/sessions` and `~/.claude/projects`.
- `src/core/discovery.js` scans local JSONL files and matches them to the current working directory.
- `src/adapters/sources/index.js` parses one local session path into the internal session model.

There is no daemon, account model, backend, mobile UI, device registry, heartbeat, remote control channel, or permission model today.

That means issue #3 should be treated as a new control-plane capability, not as a small CLI option.

## Product Research

### OpenAI Codex Mobile Remote Access

Reference: https://help.openai.com/en/articles/6825453-chatgpt-release-notes

OpenAI has shipped mobile Codex access through ChatGPT mobile. The important lessons:

- mobile can continue a thread, approve actions, and inspect terminal output, diffs, and test results
- remote access is connected to a host or cloud task, not just to a static transcript
- local remote access still depends on the Mac host being awake and online

Product implication for KAGE: session visibility alone is useful, but the model should leave room for an online runtime that can execute or resume work later.

### Claude Code Remote Control

Reference: https://code.claude.com/docs/en/remote-control

Claude Code Remote Control is close to the issue request:

- mobile / web can connect to local Claude Code sessions
- pairing is explicit, commonly QR-code driven
- users can view session state and interact remotely
- the local process remains an important trust and execution boundary

Product implication for KAGE: device pairing and a local daemon are a safer first abstraction than trying to write directly into every agent's private session files from a phone.

### GitHub Copilot Coding Agent / CLI Remote Control

References:

- https://docs.github.com/en/copilot/how-tos/agents/copilot-coding-agent/using-the-copilot-coding-agent-logs
- https://github.blog/changelog/2026-05-18-remote-control-for-copilot-cli-sessions-now-generally-available-on-mobile-web-and-vs-code/

GitHub's direction is to expose agent sessions through a central account-backed surface across web, VS Code, and mobile.

The useful pattern:

- sessions belong to a user / org identity
- agent runs emit logs and status into a central place
- UI can show sessions across repositories and devices
- auditability matters once control moves outside the local terminal

Product implication for KAGE: multi-device session management needs identity, permissions, and audit events early, even for an MVP.

### Multica Daemon / Runtime Model

Reference: https://multica.ai/docs/zh/daemon-runtimes

Multica's architecture maps especially well to this issue:

- local daemon discovers available AI CLIs
- each executable machine / agent endpoint is modeled as a runtime
- server stores `runtime_mode`, `daemon_id`, `status`, `last_seen_at`, version, and device info
- frontend groups local / remote / cloud machines and sorts by health

Product implication for KAGE: introduce `device` / `runtime` as first-class concepts before trying to make `session` the only top-level object.

## Recommended Direction

Build a minimal KAGE Hub control plane:

1. A local `kage daemon` process discovers local sessions and heartbeats device / runtime status.
2. A small backend stores devices, runtimes, session summaries, permissions, and audit events.
3. A mobile web / PWA surface lists devices and sessions.
4. Control actions are added only after read-only visibility and permission boundaries are stable.

Do not start with a native mobile app. A mobile web UI is enough to validate the hard parts: pairing, device status, session indexing, and permission semantics.

## Core Domain Model

### Account

Owns devices, sessions, permissions, and audit history.

Suggested fields:

- `id`
- `email` or provider identity
- `created_at`

### Device

Represents a physical or virtual computer.

Suggested fields:

- `id`
- `account_id`
- `display_name`
- `platform`
- `hostname`
- `device_fingerprint_hash`
- `created_at`
- `last_seen_at`
- `status`

### Runtime

Represents one executable agent endpoint on a device.

Suggested fields:

- `id`
- `device_id`
- `agent`
- `runtime_mode`: `local`, `remote`, or `cloud`
- `daemon_id`
- `agent_version`
- `kage_version`
- `status`
- `last_seen_at`
- `capabilities`

### Session

Represents one discovered agent session.

Suggested fields:

- `id`
- `runtime_id`
- `agent`
- `native_session_id`
- `cwd`
- `title`
- `last_user_message`
- `updated_at`
- `message_count`
- `source_path_hash`
- `visibility`

### Permission Grant

Controls who can see or operate a device / runtime / session.

Suggested fields:

- `id`
- `resource_type`: `device`, `runtime`, or `session`
- `resource_id`
- `subject_account_id`
- `mode`: `read_only` or `control`
- `created_by`
- `expires_at`

### Audit Event

Records pairing, viewing, sharing, and control actions.

Suggested fields:

- `id`
- `account_id`
- `actor_account_id`
- `resource_type`
- `resource_id`
- `action`
- `created_at`
- `metadata`

## MVP Scope

The MVP should include:

- multi-device list
- sessions grouped by device / runtime
- online, stale, offline status based on heartbeat
- last active time
- read-only session detail page
- device pairing through QR code or one-time code
- owner-only visibility by default
- explicit permission warning when a device or session is not authorized

The MVP should not include:

- arbitrary remote shell
- direct background execution from mobile
- multi-user write collaboration
- writing synthetic private session files for agents that do not officially support import / resume
- native mobile app packaging

## Online State Semantics

Use daemon heartbeat as the source of truth:

- `online`: heartbeat within 2 heartbeat intervals
- `stale`: heartbeat older than 2 intervals but younger than the offline threshold
- `offline`: heartbeat older than the offline threshold

Example defaults:

- heartbeat interval: 15 seconds
- stale after: 45 seconds
- offline after: 180 seconds

This avoids showing a device as hard-offline immediately after a laptop sleeps or a network switches.

## API Sketch

Read-side MVP:

- `POST /pairing-codes`
- `POST /devices/register`
- `POST /devices/:device_id/heartbeat`
- `POST /devices/:device_id/sessions/sync`
- `GET /devices`
- `GET /devices/:device_id/runtimes`
- `GET /runtimes/:runtime_id/sessions`
- `GET /sessions/:session_id`

Control-side later:

- `POST /sessions/:session_id/resume`
- `POST /sessions/:session_id/fork`
- `POST /sessions/:session_id/export`
- `POST /permissions/grants`
- `DELETE /permissions/grants/:grant_id`

## Step-by-Step Plan

### Phase 0: Product and Security Design

- [ ] Decide canonical terms: `device`, `runtime`, `session`, `daemon`.
- [ ] Define exact MVP permissions: owner-only, `read_only`, and `control`.
- [ ] Decide transcript privacy boundary: summary-only by default, full transcript only by opt-in.
- [ ] Write threat model for device pairing, token theft, stale devices, and shared sessions.
- [ ] Document failure states: offline device, unauthorized session, daemon version mismatch.

### Phase 1: Local Inventory Library

- [ ] Extract session discovery into a reusable inventory layer separate from CLI export flows.
- [ ] Return normalized session summaries without requiring export.
- [ ] Include `agent`, `session_id`, `cwd`, `title`, `updated_at`, `message_count`, and source metadata.
- [ ] Add tests using existing Codex / Claude / Qoder fixtures.

### Phase 2: Daemon MVP

- [ ] Add `kage daemon start`.
- [ ] Add `kage daemon status`.
- [ ] Add `kage daemon stop` if process management is local and reliable.
- [ ] Poll local inventory and maintain a local cache.
- [ ] Emit periodic heartbeat payloads.
- [ ] Keep daemon credentials outside session transcripts.

### Phase 3: Backend Registry

- [ ] Implement device registration.
- [ ] Implement runtime registration / update.
- [ ] Implement heartbeat ingestion.
- [ ] Implement session summary sync.
- [ ] Implement read APIs for devices, runtimes, and sessions.
- [ ] Add audit events for pair, heartbeat, sync, view, and permission changes.

### Phase 4: Pairing and Authorization

- [ ] Generate one-time pairing codes.
- [ ] Add QR-code pairing for mobile web.
- [ ] Store daemon auth tokens with rotation support.
- [ ] Default all resources to owner-only visibility.
- [ ] Add `read_only` grants before `control` grants.
- [ ] Add clear unauthorized and insufficient-permission responses.

### Phase 5: Mobile Web / PWA MVP

- [ ] Show device list grouped by status.
- [ ] Show runtime list per device.
- [ ] Show session list per runtime.
- [ ] Show last active time and health state.
- [ ] Add session detail page with summary metadata and recent user-message preview.
- [ ] Add empty states for no paired devices, offline devices, and unauthorized sessions.

### Phase 6: Safe Control Actions

- [ ] Add server-side command queue for daemon-bound actions.
- [ ] Start with low-risk actions: refresh inventory, export session, generate resume hint.
- [ ] Add explicit approval for any action that can mutate files or run agent commands.
- [ ] Record every control action in audit events.
- [ ] Keep `read_only` and `control` paths visually distinct in the UI.

### Phase 7: Agent-Specific Resume Paths

- [ ] For Codex, prefer official remote access / resume flows where available.
- [ ] For Claude, prefer Claude Code Remote Control semantics where available.
- [ ] For Qoder, keep export-only behavior until resume/import support is verified.
- [ ] Do not fabricate private native session files from mobile unless the target agent format is stable and tested.

## Acceptance Criteria for MVP

- [ ] A user can pair two computers to one account.
- [ ] The phone can see both devices.
- [ ] Each device shows online / stale / offline state and last active time.
- [ ] Sessions are grouped under the correct device and runtime.
- [ ] Session rows show agent, cwd, title, last active time, and recent user context.
- [ ] A user can open a read-only session detail page from the phone.
- [ ] Unauthorized devices or sessions show a clear permission / pairing explanation.
- [ ] When a daemon stops heartbeating, the phone state changes without manual refresh.
- [ ] No full transcript content is uploaded unless explicitly enabled.

## Key Risks

1. Security boundary drift.
   Remote viewing can quickly become remote execution. Keep the MVP read-only and audit every later control action.

2. Transcript privacy.
   Agent sessions may contain secrets, source snippets, credentials, or private user messages. Sync summaries first.

3. Agent private format instability.
   Codex, Claude, Cursor, and Qoder session formats can change. Treat native session writes as adapter-level capabilities, not as a universal platform assumption.

4. Device liveness ambiguity.
   Sleeping laptops and network changes can look like failures. Use stale state before offline state.

5. Product scope creep.
   A native app, collaboration, remote shell, cloud execution, and session editing are separate projects. The first useful product is a trustworthy multi-device session index.

## Recommended First PRs

1. Add this design doc and link it from issue #3.
2. Add a local inventory module that returns session summaries.
3. Add `kage daemon status` as a local-only proof of runtime identity and inventory.
4. Add a tiny heartbeat payload contract and tests.
5. Build a mock mobile web view against fixture JSON before adding a real backend.
