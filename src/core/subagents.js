import fs from "node:fs/promises";
import path from "node:path";

import { parseSession } from "../adapters/sources/index.js";

function subagentDirectoryForSession(sessionPath, sessionId) {
  return path.join(path.dirname(sessionPath), sessionId, "subagents");
}

function subagentIdFromPath(filePath) {
  return path.basename(filePath, ".jsonl");
}

async function readSubagentFile(filePath) {
  const session = await parseSession({ sessionPath: filePath, agent: "claude" });
  const stat = await fs.stat(filePath);
  return {
    id: subagentIdFromPath(filePath),
    path: filePath,
    sessionId: session.sessionId,
    cwd: session.cwd,
    updatedAt: session.updatedAt ?? stat.mtime.toISOString(),
    messageCount: session.messages.length,
    session,
  };
}

export async function listClaudeSubagents(sessionPath) {
  const parentSession = await parseSession({ sessionPath, agent: "claude" });
  const subagentDir = subagentDirectoryForSession(sessionPath, parentSession.sessionId);
  let entries;
  try {
    entries = await fs.readdir(subagentDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return { parentSession, subagentDir, subagents: [] };
    }
    throw error;
  }

  const subagents = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
      continue;
    }
    subagents.push(await readSubagentFile(path.join(subagentDir, entry.name)));
  }
  subagents.sort((left, right) => left.id.localeCompare(right.id));
  return { parentSession, subagentDir, subagents };
}

function matchesSubagentSelector(subagent, selector) {
  const value = String(selector ?? "");
  const resolved = path.resolve(value);
  return (
    subagent.id === value ||
    path.basename(subagent.path) === value ||
    path.resolve(subagent.path) === resolved ||
    subagent.path === value
  );
}

function formatSubagentTranscript(subagent) {
  const lines = [`[Claude Subagent: ${subagent.id}]`];
  for (const message of subagent.session.messages) {
    const role = message.role === "assistant" ? "Assistant" : "User";
    lines.push(`${role}: ${message.text}`);
  }
  lines.push(`[/Claude Subagent: ${subagent.id}]`);
  return lines.join("\n");
}

export async function appendClaudeSubagentMessages(
  session,
  {
    sessionPath,
    includeSubagents = false,
    includeSubagent = [],
  } = {},
) {
  const selectors = (Array.isArray(includeSubagent) ? includeSubagent : [includeSubagent])
    .map((selector) => String(selector ?? "").trim())
    .filter(Boolean);
  if (!includeSubagents && selectors.length === 0) {
    return { session, includedSubagents: [] };
  }

  if (session.agent !== "claude") {
    throw new Error("Claude subagent options are only supported for Claude source sessions");
  }

  const { subagents } = await listClaudeSubagents(sessionPath);
  const selected = includeSubagents
    ? subagents
    : selectors.map((selector) => {
        const match = subagents.find((subagent) => matchesSubagentSelector(subagent, selector));
        if (!match) {
          const available = subagents.map((subagent) => subagent.id).join(", ") || "none";
          throw new Error(`Unknown Claude subagent: ${selector}. Available subagents: ${available}`);
        }
        return match;
      });
  const uniqueSelected = [...new Map(selected.map((subagent) => [subagent.path, subagent])).values()];
  const subagentMessages = uniqueSelected.map((subagent) => ({
    role: "user",
    text: formatSubagentTranscript(subagent),
    timestamp: subagent.updatedAt,
  }));

  return {
    session: {
      ...session,
      messages: [...session.messages, ...subagentMessages],
    },
    includedSubagents: uniqueSelected.map((subagent) => ({
      id: subagent.id,
      path: subagent.path,
      sessionId: subagent.sessionId,
      messageCount: subagent.messageCount,
      updatedAt: subagent.updatedAt,
    })),
  };
}
