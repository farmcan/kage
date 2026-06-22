import fs from "node:fs/promises";
import path from "node:path";

import { parseSession } from "../adapters/sources/index.js";
import { joinBlocks } from "../adapters/sources/shared.js";
import { detectAgent, formatAgentName, normalizeAgent } from "./agents.js";

function agentDisplayName(agent) {
  const normalized = normalizeAgent(agent);
  if (normalized === "claude") {
    return "Claude";
  }
  if (normalized === "codex") {
    return "Codex";
  }
  if (normalized === "qodercli") {
    return "QoderCLI";
  }
  if (normalized === "qoderwork") {
    return "QoderWork";
  }
  return formatAgentName(agent);
}

function nestedKindLabel(agent) {
  const normalized = normalizeAgent(agent);
  if (normalized === "claude") {
    return "Subagent";
  }
  if (normalized === "qodercli" || normalized === "qoderwork") {
    return "Sidechain";
  }
  return "Nested Transcript";
}

function unsupportedNestedTranscriptError(agent) {
  return new Error(
    `${agentDisplayName(agent)} sessions do not currently expose supported nested transcript metadata. Default exports stay linear.`,
  );
}

function subagentDirectoryForSession(sessionPath, sessionId) {
  return path.join(path.dirname(sessionPath), sessionId, "subagents");
}

function subagentIdFromPath(filePath) {
  return path.basename(filePath, ".jsonl");
}

async function readClaudeSubagentFile(filePath) {
  const session = await parseSession({ sessionPath: filePath, agent: "claude" });
  const stat = await fs.stat(filePath);
  return {
    id: subagentIdFromPath(filePath),
    sourceAgent: "claude",
    kind: "subagent",
    path: filePath,
    pathSelectable: true,
    selector: subagentIdFromPath(filePath),
    sessionId: session.sessionId,
    cwd: session.cwd,
    updatedAt: session.updatedAt ?? stat.mtime.toISOString(),
    messageCount: session.messages.length,
    session,
  };
}

async function listClaudeNestedTranscripts(sessionPath) {
  const parentSession = await parseSession({ sessionPath, agent: "claude" });
  const location = subagentDirectoryForSession(sessionPath, parentSession.sessionId);
  let entries;
  try {
    entries = await fs.readdir(location, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return { parentSession, location, nestedTranscripts: [] };
    }
    throw error;
  }

  const nestedTranscripts = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
      continue;
    }
    nestedTranscripts.push(await readClaudeSubagentFile(path.join(location, entry.name)));
  }
  nestedTranscripts.sort((left, right) => left.id.localeCompare(right.id));
  return { parentSession, location, nestedTranscripts };
}

function qoderSidechainId(item, fallbackIndex) {
  if (typeof item.agentId === "string" && item.agentId.trim()) {
    return item.agentId.trim();
  }
  if (typeof item.taskId === "string" && item.taskId.trim()) {
    return item.taskId.trim();
  }
  if (typeof item.parentUuid === "string" && item.parentUuid.trim()) {
    return `parent-${item.parentUuid.trim()}`;
  }
  return `sidechain-${fallbackIndex + 1}`;
}

function qoderMessageFromItem(item) {
  const text = joinBlocks(item.message?.content);
  if (!text) {
    return null;
  }
  return {
    role: item.message?.role ?? item.type ?? "unknown",
    text,
    timestamp: item.timestamp ?? null,
  };
}

function listQoderNestedTranscriptsFromSession(parentSession, sessionPath, agent) {
  const grouped = new Map();
  for (const item of parentSession.rawItems ?? []) {
    if (item?.isSidechain !== true || item.isMeta) {
      continue;
    }
    const id = qoderSidechainId(item, grouped.size);
    const existing = grouped.get(id) ?? [];
    existing.push(item);
    grouped.set(id, existing);
  }

  const nestedTranscripts = [...grouped.entries()]
    .map(([id, items]) => {
      const messages = items.map(qoderMessageFromItem).filter(Boolean);
      const updatedAt = [...items].reverse().find((item) => item.timestamp)?.timestamp ?? parentSession.updatedAt;
      return {
        id,
        sourceAgent: normalizeAgent(agent),
        kind: "sidechain",
        path: sessionPath,
        pathSelectable: false,
        selector: id,
        sessionId: items.find((item) => item.sessionId)?.sessionId ?? parentSession.sessionId,
        cwd: parentSession.cwd,
        updatedAt,
        messageCount: messages.length,
        session: {
          ...parentSession,
          sessionId: `${parentSession.sessionId}:${id}`,
          title: `${parentSession.title ?? parentSession.sessionId} ${id}`,
          updatedAt,
          messages,
        },
      };
    })
    .filter((nestedTranscript) => nestedTranscript.messageCount > 0);

  nestedTranscripts.sort((left, right) => left.id.localeCompare(right.id));
  return nestedTranscripts;
}

async function listQoderNestedTranscripts(sessionPath, agent) {
  const parentSession = await parseSession({ sessionPath, agent });
  return {
    parentSession,
    location: sessionPath,
    nestedTranscripts: listQoderNestedTranscriptsFromSession(parentSession, sessionPath, agent),
  };
}

export async function listNestedTranscripts(sessionPath, { agent } = {}) {
  const sourceAgent = normalizeAgent(agent) ?? detectAgent(sessionPath);
  if (sourceAgent === "claude") {
    return {
      sourceAgent,
      displayName: agentDisplayName(sourceAgent),
      kindLabel: nestedKindLabel(sourceAgent),
      ...(await listClaudeNestedTranscripts(sessionPath)),
    };
  }
  if (sourceAgent === "qodercli" || sourceAgent === "qoderwork") {
    return {
      sourceAgent,
      displayName: agentDisplayName(sourceAgent),
      kindLabel: nestedKindLabel(sourceAgent),
      ...(await listQoderNestedTranscripts(sessionPath, sourceAgent)),
    };
  }
  throw unsupportedNestedTranscriptError(sourceAgent);
}

function matchesNestedTranscriptSelector(nestedTranscript, selector) {
  const value = String(selector ?? "");
  const resolved = path.resolve(value);
  return (
    nestedTranscript.id === value ||
    nestedTranscript.selector === value ||
    (nestedTranscript.pathSelectable !== false && path.basename(nestedTranscript.path ?? "") === value) ||
    (nestedTranscript.pathSelectable !== false && path.resolve(nestedTranscript.path ?? "") === resolved) ||
    (nestedTranscript.pathSelectable !== false && nestedTranscript.path === value)
  );
}

function formatNestedTranscript(nestedTranscript) {
  const label = `${agentDisplayName(nestedTranscript.sourceAgent)} ${nestedKindLabel(nestedTranscript.sourceAgent)}`;
  const lines = [`[${label}: ${nestedTranscript.id}]`];
  for (const message of nestedTranscript.session.messages) {
    const role = message.role === "assistant" ? "Assistant" : "User";
    lines.push(`${role}: ${message.text}`);
  }
  lines.push(`[/${label}: ${nestedTranscript.id}]`);
  return lines.join("\n");
}

export async function appendNestedTranscriptMessages(
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

  const { nestedTranscripts } = await listNestedTranscripts(sessionPath, { agent: session.agent });
  const selected = includeSubagents
    ? nestedTranscripts
    : selectors.map((selector) => {
        const match = nestedTranscripts.find((nestedTranscript) => matchesNestedTranscriptSelector(nestedTranscript, selector));
        if (!match) {
          const available = nestedTranscripts.map((nestedTranscript) => nestedTranscript.id).join(", ") || "none";
          throw new Error(`Unknown nested transcript: ${selector}. Available nested transcripts: ${available}`);
        }
        return match;
      });
  const uniqueSelected = [...new Map(selected.map((nestedTranscript) => [`${nestedTranscript.sourceAgent}:${nestedTranscript.id}:${nestedTranscript.path}`, nestedTranscript])).values()];
  const nestedMessages = uniqueSelected.map((nestedTranscript) => ({
    role: "user",
    text: formatNestedTranscript(nestedTranscript),
    timestamp: nestedTranscript.updatedAt,
  }));

  return {
    session: {
      ...session,
      messages: [...session.messages, ...nestedMessages],
    },
    includedSubagents: uniqueSelected.map((nestedTranscript) => ({
      id: nestedTranscript.id,
      kind: nestedTranscript.kind,
      sourceAgent: nestedTranscript.sourceAgent,
      path: nestedTranscript.path,
      sessionId: nestedTranscript.sessionId,
      messageCount: nestedTranscript.messageCount,
      updatedAt: nestedTranscript.updatedAt,
    })),
  };
}
