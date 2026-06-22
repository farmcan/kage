import path from "node:path";

import { cwdFromProjectPath, joinBlocks, knownCwd, readQoderSidecar } from "./shared.js";

export function readSessionCwd(items, sessionPath) {
  return items.map((item) => knownCwd(item.cwd)).find(Boolean) ?? cwdFromProjectPath(sessionPath);
}

export async function parse(items, sessionPath, agent) {
  const sidecar = await readQoderSidecar(sessionPath);
  const first = items.find((item) => !item.isMeta && item.isSidechain !== true) ?? items.find((item) => !item.isMeta) ?? items[0] ?? {};
  const cwd = knownCwd(sidecar?.working_dir) ?? knownCwd(first.cwd) ?? readSessionCwd(items, sessionPath) ?? process.cwd();
  const messages = items
    .filter((item) => !item.isMeta && item.isSidechain !== true)
    .map((item) => {
      const text = joinBlocks(item.message?.content);
      if (!text) {
        return null;
      }

      return {
        role: item.message?.role ?? item.type ?? "unknown",
        text,
      };
    })
    .filter(Boolean);

  return {
    agent,
    sessionPath,
    sessionId: sidecar?.id ?? first.sessionId ?? path.basename(sessionPath, ".jsonl"),
    cwd,
    title: sidecar?.title ?? null,
    updatedAt: sidecar?.updated_at ? new Date(sidecar.updated_at).toISOString() : null,
    rawItems: items,
    messages,
  };
}
