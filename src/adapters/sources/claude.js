import fs from "node:fs";
import path from "node:path";

import { cwdFromProjectPath, extractClaudeText, knownCwd } from "./shared.js";

export function readSessionCwd(items, sessionPath) {
  return items.map((item) => knownCwd(item.cwd)).find(Boolean) ?? cwdFromProjectPath(sessionPath);
}

export function parse(items, sessionPath, agent) {
  const first = items.find((item) => item.sessionId) ?? {};
  const cwd = knownCwd(first.cwd) ?? readSessionCwd(items, sessionPath) ?? process.cwd();
  const latestTimestamp = items
    .map((item) => item.timestamp)
    .filter(Boolean)
    .at(-1);
  const messages = items
    .map((item) => {
      if (item.type !== "user" && item.type !== "assistant") {
        return null;
      }

      const role = item.message?.role ?? item.type;
      const text = extractClaudeText(item.message?.content);
      if (!text) {
        return null;
      }

      return { role, text };
    })
    .filter(Boolean);

  return {
    agent,
    sessionPath,
    sessionId: first.sessionId ?? path.basename(sessionPath, ".jsonl"),
    cwd,
    title: null,
    updatedAt: latestTimestamp ?? fs.statSync(sessionPath).mtime.toISOString(),
    rawItems: items,
    messages,
  };
}
