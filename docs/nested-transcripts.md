# Nested Transcript Support

KAGE keeps bridge exports linear by default. Child-task, sidechain, delegated-agent, or subagent-like content is only listed or exported after an explicit opt-in flag.

## Current Findings

| Agent | Local structure | KAGE support |
| --- | --- | --- |
| Claude Code | Parent transcript plus `<session-id>/subagents/*.jsonl` child transcripts. | Supported as Claude subagents. |
| QoderCLI / QoderWork | Sidechain rows can appear inside the same JSONL with `isSidechain: true`; `agentId` is used as the stable selector when present. | Supported as Qoder sidechains. |
| Codex | Current KAGE fixtures and parser shape show `session_meta`, `response_item`, and `event_msg` rows without child transcript or sidechain metadata. | Unsupported until a stable nested transcript marker is found. |

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

Unsupported agents fail clearly. For example, `kage x2q --list-subagents` reports that Codex does not currently expose supported nested transcript metadata.

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
