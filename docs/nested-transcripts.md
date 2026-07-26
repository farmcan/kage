# Nested Transcript Support

KAGE keeps bridge exports linear by default. Child-task, sidechain, delegated-agent, or subagent-like content is only listed or exported after an explicit opt-in flag.

## Current Findings

| Agent | Local structure | KAGE support |
| --- | --- | --- |
| Claude Code | Parent transcript plus `<session-id>/subagents/*.jsonl` child transcripts. | Supported as Claude subagents. |
| QoderCLI / QoderWork | Sidechain rows can appear inside the same JSONL with `isSidechain: true`; `agentId` is used as the stable selector when present. | Supported as Qoder sidechains. |
| Codex | MultiAgent V2 child rollouts are ordinary session JSONL files whose `session_meta` uses `thread_source: "subagent"` and/or `source.subagent`, with a parent thread id when available. | Detected as inspection-only child sessions and excluded from native resume selection; opt-in child-content import is not exposed yet. |

## Commands

The public flags retain the existing `subagent` wording for compatibility, but internally KAGE treats these as nested transcripts:

```bash
kage c2q --list-subagents
kage c2q --include-subagents
kage c2q --include-subagent agent-alpha

kage q2x --list-subagents
kage q2x --include-subagents
kage q2x --include-subagent worker-alpha
```

Codex child rollouts can be searched or exported when selected explicitly, but they cannot accept direct user input in current Codex MultiAgent V2. `kage x` excludes them from resume choices, and an explicit native-resume attempt names the parent thread when the rollout records one. The `--list-subagents` / `--include-subagent` bridge controls still apply only to Claude and Qoder nested-content import.

## Export Boundaries

Included content is wrapped before it is appended to the target context:

```text
[Claude Subagent: agent-alpha]
User: ...
Assistant: ...
[/Claude Subagent: agent-alpha]

[QoderCLI Sidechain: worker-alpha]
User: ...
Assistant: ...
[/QoderCLI Sidechain: worker-alpha]
```

This visible boundary is intentional: nested context should never look like ordinary linear conversation history.
