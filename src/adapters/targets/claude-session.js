import { randomUUID } from "node:crypto";
import path from "node:path";

function toClaudeProjectKey(cwd) {
  return `-${path
    .resolve(cwd)
    .split(path.sep)
    .filter(Boolean)
    .join("-")}`;
}

function toClaudeMessageContent(message) {
  if (message.role === "assistant") {
    return [{ type: "text", text: message.text }];
  }
  return message.text;
}

function timestampWithOffset(timestamp, index) {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return timestamp;
  }
  return new Date(parsed + index * 1000).toISOString();
}

function messageTimestamp(message, exportedTimestamp, index) {
  return message.timestamp ?? timestampWithOffset(exportedTimestamp, index);
}

export function renderClaudeSessionExport({
  session,
  sessionId,
  timestamp,
  version = "2.1.79",
}) {
  const exportedSessionId = sessionId ?? session.sessionId;
  const exportedTimestamp = timestamp ?? session.updatedAt ?? new Date().toISOString();
  const permissionMode = "bypassPermissions";
  const projectKey = toClaudeProjectKey(session.cwd);
  const fileName = `${exportedSessionId}.jsonl`;
  let previousUuid = null;
  const baseRows = session.messages.map((message, index) => {
    const uuid = randomUUID();
    const parentUuid = previousUuid;
    previousUuid = uuid;
    if (message.role === "assistant") {
      return {
        parentUuid,
        isSidechain: false,
        message: {
          id: uuid,
          role: "assistant",
          type: "message",
          content: toClaudeMessageContent(message),
        },
        type: "assistant",
        uuid,
        timestamp: messageTimestamp(message, exportedTimestamp, index),
        cwd: session.cwd,
        sessionId: exportedSessionId,
        version,
      };
    }

    return {
      parentUuid,
      isSidechain: false,
      type: "user",
      message: {
        role: "user",
        content: toClaudeMessageContent(message),
      },
      uuid,
      timestamp: messageTimestamp(message, exportedTimestamp, index),
      cwd: session.cwd,
      sessionId: exportedSessionId,
      version,
      promptId: randomUUID(),
      permissionMode,
    };
  });

  const firstUserRow = baseRows.find((row) => row.type === "user");
  const rows = [
    {
      type: "mode",
      mode: "normal",
      sessionId: exportedSessionId,
    },
    {
      type: "permission-mode",
      permissionMode,
      sessionId: exportedSessionId,
    },
  ];
  if (firstUserRow) {
    rows.push({
      type: "file-history-snapshot",
      messageId: firstUserRow.uuid,
      snapshot: {
        messageId: firstUserRow.uuid,
        trackedFileBackups: {},
        timestamp: firstUserRow.timestamp,
      },
      isSnapshotUpdate: false,
    });
  }
  rows.push(...baseRows);

  return {
    mode: "claude-session",
    sessionId: exportedSessionId,
    projectKey,
    fileName,
    files: [{ key: "main", fileName, content: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` }],
  };
}
