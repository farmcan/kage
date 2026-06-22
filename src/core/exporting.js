import { createHash, randomUUID } from "node:crypto";

import { formatAgentName, normalizeAgent } from "./agents.js";
import { forkSession, splitSession } from "./session-transforms.js";
import { appendClaudeSubagentMessages } from "./subagents.js";
import { parseSession } from "../adapters/sources/index.js";
import { renderExport } from "../adapters/targets/index.js";

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

function targetNativeSessionMode(format, targetAgent) {
  if (format === "codex-session" && targetAgent === "codex") {
    return true;
  }
  if (format === "claude-session" && targetAgent === "claude") {
    return true;
  }
  if (format === "qoder-session" && targetAgent === "qodercli") {
    return true;
  }
  return false;
}

function buildBridgeSessionId({ sourceAgent, targetAgent, sourceSessionId, sessionPath, cwd, splitRecent }) {
  return deterministicUuid(JSON.stringify({
    namespace: "kage.native-session.v1",
    sourceAgent,
    targetAgent,
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
  includeSubagents = false,
  includeSubagent = [],
  sessionId = undefined,
}) {
  const parsedSession = await parseSession({ sessionPath, agent: sourceAgent });
  let session = parsedSession;
  if (splitRecent) {
    session = splitSession(session, { recentUserTurns: splitRecent });
  }
  const subagentResult = await appendClaudeSubagentMessages(session, {
    sessionPath,
    includeSubagents,
    includeSubagent,
  });
  session = subagentResult.session;
  if (forkPrompt) {
    session = forkSession(session, { prompt: forkPrompt });
  }
  const sourceKey = normalizeAgent(sourceAgent ?? parsedSession.agent);
  const targetKey = normalizeAgent(targetAgent);
  const normalizedSource = formatAgentName(sourceAgent ?? parsedSession.agent);
  const normalizedTarget = formatAgentName(targetAgent);
  const shouldGenerateNativeSessionId = targetNativeSessionMode(format, targetKey);
  const shouldGenerateNativeForkSessionId =
    shouldGenerateNativeSessionId &&
    (sourceKey === targetKey || Boolean(forkPrompt));
  const shouldGenerateNativeBridgeSessionId =
    shouldGenerateNativeSessionId &&
    sourceKey !== targetKey;
  let generatedSessionId;
  if (shouldGenerateNativeForkSessionId) {
    generatedSessionId = randomUUID();
  } else if (shouldGenerateNativeBridgeSessionId) {
    generatedSessionId = buildBridgeSessionId({
      sourceAgent: sourceKey,
      targetAgent: targetKey,
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
    includedSubagents: subagentResult.includedSubagents,
  };
}

export { forkSession, splitSession };
