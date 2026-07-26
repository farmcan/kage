import path from "node:path";

import { joinBlocks, knownCwd } from "./shared.js";

function isCodexBootstrapMessage(role, text) {
  return role === "user" && text.trimStart().startsWith("# AGENTS.md instructions for ");
}

export function readSessionCwd(items) {
  return readSessionInfo(items).cwd;
}

function readThreadClassification(meta) {
  const subagentSource = meta.source?.subagent;
  const isSubagent = meta.thread_source === "subagent" || Boolean(subagentSource);
  const parentSessionId = isSubagent
    ? (meta.parent_thread_id ??
      subagentSource?.thread_spawn?.parent_thread_id ??
      meta.session_id ??
      null)
    : null;

  return {
    sessionKind: isSubagent ? "subagent" : "root",
    resumable: !isSubagent,
    parentSessionId,
  };
}

export function readSessionInfo(items) {
  const meta = items.find((item) => item.type === "session_meta")?.payload ?? {};
  return {
    cwd: knownCwd(meta.cwd),
    ...readThreadClassification(meta),
  };
}

export function parse(items, sessionPath, agent) {
  const metaItem = items.find((item) => item.type === "session_meta") ?? {};
  const meta = metaItem.payload ?? {};
  const cwd = knownCwd(meta.cwd) ?? process.cwd();
  const messages = items
    .map((item) => {
      if (item.type === "event_msg" && item.payload?.type === "agent_message") {
        return null;
      }

      if (item.type !== "response_item" || item.payload?.type !== "message") {
        return null;
      }

      if (item.payload.role === "developer" || item.payload.role === "system") {
        return null;
      }

      const text = joinBlocks(item.payload.content);
      if (!text || isCodexBootstrapMessage(item.payload.role, text)) {
        return null;
      }

      return {
        role: item.payload.role ?? "unknown",
        text,
      };
    })
    .filter(Boolean);

  return {
    agent,
    sessionPath,
    sessionId: meta.id ?? path.basename(sessionPath, ".jsonl"),
    cwd,
    title: null,
    updatedAt: meta.timestamp ?? metaItem.timestamp ?? null,
    ...readThreadClassification(meta),
    rawItems: items,
    messages,
  };
}
