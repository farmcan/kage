import fs from "node:fs";
import path from "node:path";

function resolveQoderWorkingDir(cwd) {
  const resolved = path.resolve(cwd);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function toQoderProjectKey(cwd) {
  return `-${path
    .resolve(cwd)
    .split(path.sep)
    .filter(Boolean)
    .join("-")}`;
}

function toQoderMessageContent(message) {
  return [{ type: "text", text: message.text }];
}

export function renderQoderSessionExport({
  session,
  sessionId,
  timestamp,
  version = "1.0.0",
}) {
  const exportedSessionId = sessionId ?? session.sessionId;
  const exportedTimestamp = timestamp ?? session.updatedAt ?? new Date().toISOString();
  const workingDir = resolveQoderWorkingDir(session.cwd);
  const projectKey = toQoderProjectKey(workingDir);
  const jsonlFileName = `${exportedSessionId}.jsonl`;
  const sidecarFileName = `${exportedSessionId}-session.json`;

  const rows = session.messages.map((message, index) => ({
    uuid: `m${index + 1}`,
    parentUuid: index === 0 ? "" : `m${index}`,
    isSidechain: false,
    userType: "external",
    cwd: workingDir,
    sessionId: exportedSessionId,
    version,
    agentId: "kage",
    type: message.role === "assistant" ? "assistant" : "user",
    timestamp: exportedTimestamp,
    message: {
      role: message.role === "assistant" ? "assistant" : "user",
      content: toQoderMessageContent(message),
      id: `mid-${index + 1}`,
    },
    isMeta: false,
  }));

  const sidecar = {
    id: exportedSessionId,
    parent_session_id: "",
    title: session.title ?? `Imported ${session.agent} session`,
    message_count: session.messages.length,
    prompt_tokens: 0,
    completion_tokens: 0,
    cost: 0,
    created_at: Date.parse(exportedTimestamp),
    updated_at: Date.parse(exportedTimestamp),
    working_dir: workingDir,
    quest: false,
    total_prompt_tokens: 0,
    total_completed_tokens: 0,
    total_cached_tokens: 0,
    total_model_call_times: Math.max(session.messages.filter((message) => message.role === "assistant").length, 1),
    total_tool_call_times: 0,
    context_usage_ratio: 0,
  };

  return {
    mode: "qoder-session",
    sessionId: exportedSessionId,
    projectKey,
    workingDir,
    fileName: jsonlFileName,
    files: [
      { key: "main", fileName: jsonlFileName, content: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` },
      { key: "sidecar", fileName: sidecarFileName, content: `${JSON.stringify(sidecar)}\n` },
    ],
  };
}
