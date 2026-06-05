import { parseSession } from "../adapters/sources/index.js";

function normalizeBlock(block) {
  if (typeof block === "string") {
    return { type: "text", content: block };
  }
  if (!block || typeof block !== "object") {
    return null;
  }

  const type = block.type ?? "text";
  if (type === "text" || type === "output_text" || type === "input_text") {
    return { type: "text", content: block.text ?? block.content ?? "" };
  }
  if (type === "thinking") {
    return { type: "thinking", content: block.text ?? block.content ?? "" };
  }
  if (type === "tool_use") {
    return {
      type: "tool_use",
      id: block.id ?? null,
      name: block.name ?? "tool",
      input: block.input ?? null,
    };
  }
  if (type === "tool_result") {
    return {
      type: "tool_result",
      toolUseId: block.tool_use_id ?? block.toolUseId ?? null,
      content: block.content ?? block.text ?? "",
    };
  }

  return {
    type,
    content: block.text ?? block.content ?? JSON.stringify(block),
  };
}

function textToBlocks(text) {
  const content = String(text ?? "").trim();
  return content ? [{ type: "text", content }] : [];
}

export function toStructuredMessages(session) {
  return session.messages
    .map((message) => {
      const blocks = Array.isArray(message.blocks)
        ? message.blocks.map(normalizeBlock).filter(Boolean)
        : textToBlocks(message.text);
      if (blocks.length === 0) {
        return null;
      }
      return {
        role: message.role ?? "unknown",
        blocks,
      };
    })
    .filter(Boolean);
}

export async function readTranscript({ sessionPath, agent }) {
  if (!sessionPath) {
    throw new Error("Missing transcript path");
  }
  const session = await parseSession({ sessionPath, agent });
  return {
    mode: "transcript",
    agent: session.agent,
    sessionId: session.sessionId,
    title: session.title,
    cwd: session.cwd,
    path: session.sessionPath,
    updatedAt: session.updatedAt,
    messages: toStructuredMessages(session),
  };
}
