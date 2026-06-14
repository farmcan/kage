import { createHash, randomUUID } from "node:crypto";

import { formatAgentName, normalizeAgent } from "./agents.js";
import { forkSession, splitSession } from "./session-transforms.js";
import { parseSession } from "../adapters/sources/index.js";
import { renderExport } from "../adapters/targets/index.js";

function applySessionTransforms(session, options) {
  let nextSession = session;
  if (options.splitRecent) {
    nextSession = splitSession(nextSession, { recentUserTurns: options.splitRecent });
  }
  if (options.forkPrompt) {
    nextSession = forkSession(nextSession, { prompt: options.forkPrompt });
  }
  return nextSession;
}

function isQoderAgent(agent) {
  return normalizeAgent(agent) === "qodercli";
}

function deterministicUuid(value) {
  const bytes = createHash("sha256").update(value).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function buildCodexBridgeSessionId({ sourceAgent, sourceSessionId, sessionPath, cwd, splitRecent }) {
  return deterministicUuid(JSON.stringify({
    namespace: "kage.codex-session.v1",
    sourceAgent,
    sourceSessionId,
    sessionPath,
    cwd,
    splitRecent,
  }));
}

export async function exportSession({
  sessionPath,
  sourceAgent,
  targetAgent,
  format,
  splitRecent = null,
  forkPrompt = null,
  sessionId = undefined,
}) {
  const parsedSession = await parseSession({ sessionPath, agent: sourceAgent });
  const session = applySessionTransforms(parsedSession, { splitRecent, forkPrompt });
  const sourceKey = normalizeAgent(sourceAgent ?? parsedSession.agent);
  const targetKey = normalizeAgent(targetAgent);
  const normalizedSource = formatAgentName(sourceAgent ?? parsedSession.agent);
  const normalizedTarget = formatAgentName(targetAgent);
  const shouldGenerateCodexForkSessionId =
    format === "codex-session" &&
    targetKey === "codex" &&
    (sourceKey === "codex" || Boolean(forkPrompt));
  const shouldGenerateCodexBridgeSessionId =
    format === "codex-session" &&
    targetKey === "codex" &&
    sourceKey !== "codex";
  const shouldGenerateClaudeForkSessionId =
    format === "claude-session" &&
    sourceKey === "claude" &&
    targetKey === "claude";
  const shouldGenerateQoderForkSessionId =
    format === "qoder-session" &&
    isQoderAgent(sourceKey) &&
    isQoderAgent(targetKey);
  let generatedSessionId;
  if (shouldGenerateCodexForkSessionId || shouldGenerateClaudeForkSessionId || shouldGenerateQoderForkSessionId) {
    generatedSessionId = randomUUID();
  } else if (shouldGenerateCodexBridgeSessionId) {
    generatedSessionId = buildCodexBridgeSessionId({
      sourceAgent: sourceKey,
      sourceSessionId: parsedSession.sessionId,
      sessionPath,
      cwd: parsedSession.cwd,
      splitRecent,
    });
  }
  const exportedSessionId = sessionId ?? generatedSessionId;
  const exported = renderExport(format, {
    sessionPath,
    sourceAgent,
    targetAgent,
    session,
    sessionId: exportedSessionId,
  });

  return {
    ...exported,
    sourceAgent: normalizedSource,
    targetAgent: normalizedTarget,
    sessionPath,
    sessionId: exported.sessionId,
    session,
  };
}

export { forkSession, splitSession };
