import path from "node:path";

import { joinBlocks, knownCwd } from "./shared.js";

function isCodexBootstrapMessage(role, text) {
  return role === "user" && text.trimStart().startsWith("# AGENTS.md instructions for ");
}

export function readSessionCwd(items) {
  return knownCwd(items.find((item) => item.type === "session_meta")?.payload?.cwd);
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
    rawItems: items,
    messages,
  };
}
