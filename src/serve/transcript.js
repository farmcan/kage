import fs from "node:fs/promises";
import path from "node:path";
import { parseSession } from "../adapters/sources/index.js";
import { joinBlocks } from "../adapters/sources/shared.js";

const SUPPORTED_TRANSCRIPT_EXTENSIONS = new Set([".jsonl", ".json"]);

function ensureReadableTranscriptPath(sessionPath) {
  const text = String(sessionPath ?? "").trim();
  if (!text) {
    throw new Error("Missing transcript path");
  }
  if (text.includes("\0")) {
    throw new Error("Invalid transcript path");
  }
  return text;
}

function validateTranscriptExtension(resolvedPath) {
  const dotIndex = resolvedPath.lastIndexOf(".");
  const extension = dotIndex >= 0 ? resolvedPath.slice(dotIndex).toLowerCase() : "";
  if (!SUPPORTED_TRANSCRIPT_EXTENSIONS.has(extension)) {
    throw new Error("Invalid transcript format");
  }
}

function textValue(value) {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(textValue).filter(Boolean).join("\n");
  }
  if (value && typeof value === "object") {
    const nested = value.text ?? value.content ?? value.output;
    return nested === undefined ? JSON.stringify(value) : textValue(nested);
  }
  return "";
}

function normalizeBlock(block) {
  if (typeof block === "string") {
    return { type: "text", content: block };
  }
  if (!block || typeof block !== "object") {
    return null;
  }

  const type = block.type ?? "text";
  if (type === "text" || type === "output_text" || type === "input_text") {
    return { type: "text", content: textValue(block.text ?? block.content ?? "") };
  }
  if (type === "thinking") {
    return { type: "thinking", content: textValue(block.thinking ?? block.text ?? block.content ?? "") };
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
      content: textValue(block.content ?? block.text ?? ""),
    };
  }

  return {
    type,
    content: textValue(block.text ?? block.content ?? block),
  };
}

function textToBlocks(text) {
  const content = String(text ?? "").trim();
  return content ? [{ type: "text", content }] : [];
}

function contentToBlocks(content) {
  if (typeof content === "string") {
    return textToBlocks(content);
  }
  if (!Array.isArray(content)) {
    return [normalizeBlock(content)].filter(Boolean);
  }
  return content.map(normalizeBlock).filter(Boolean);
}

function isCodexBootstrapMessage(role, blocks) {
  const text = blocks
    .filter((block) => block.type === "text")
    .map((block) => block.content)
    .join("\n")
    .trimStart();
  return role === "user" && text.startsWith("# AGENTS.md instructions for ");
}

function customToolInput(payload) {
  if (payload.input) {
    return payload.input;
  }
  if (payload.arguments) {
    try {
      return JSON.parse(payload.arguments);
    } catch {
      return payload.arguments;
    }
  }
  return payload;
}

function codexPayloadBlocks(payload) {
  if (payload?.type === "message") {
    return contentToBlocks(payload.content);
  }
  if (payload?.type === "function_call" || payload?.type === "custom_tool_call" || payload?.type === "tool_call") {
    return [
      {
        type: "tool_use",
        id: payload.call_id ?? payload.id ?? null,
        name: payload.name ?? payload.tool_name ?? payload.type,
        input: customToolInput(payload),
      },
    ];
  }
  if (payload?.type === "function_call_output" || payload?.type === "tool_result") {
    return [
      {
        type: "tool_result",
        toolUseId: payload.call_id ?? payload.tool_use_id ?? null,
        content: textValue(payload.output ?? payload.content ?? ""),
      },
    ];
  }
  return [];
}

function structuredFromRawItems(session) {
  const items = Array.isArray(session.rawItems) ? session.rawItems : [];
  if (session.agent === "claude") {
    return items
      .map((item) => {
        if (item.type !== "user" && item.type !== "assistant") {
          return null;
        }
        const role = item.message?.role ?? item.type;
        const blocks = contentToBlocks(item.message?.content);
        return blocks.length > 0 ? { role, blocks } : null;
      })
      .filter(Boolean);
  }

  if (session.agent === "codex") {
    return items
      .map((item) => {
        if (item.type === "event_msg" && item.payload?.type === "agent_message") {
          return null;
        }
        if (item.type !== "response_item") {
          return null;
        }
        const payload = item.payload ?? {};
        const role = payload.role ?? (payload.type === "function_call_output" ? "tool" : "assistant");
        if (role === "developer" || role === "system") {
          return null;
        }
        const blocks = codexPayloadBlocks(payload);
        if (blocks.length === 0 || isCodexBootstrapMessage(role, blocks)) {
          return null;
        }
        return { role, blocks };
      })
      .filter(Boolean);
  }

  if (session.agent === "qodercli" || session.agent === "qoderwork") {
    return items
      .filter((item) => !item.isMeta)
      .map((item) => {
        const role = item.message?.role ?? item.type ?? "unknown";
        const blocks = contentToBlocks(item.message?.content);
        return blocks.length > 0 ? { role, blocks } : null;
      })
      .filter(Boolean);
  }

  return [];
}

function groupConsecutiveMessages(messages) {
  return messages.reduce((groups, message) => {
    const previous = groups.at(-1);
    if (previous && previous.role === message.role) {
      previous.blocks.push(...message.blocks);
      return groups;
    }
    groups.push({ role: message.role, blocks: [...message.blocks] });
    return groups;
  }, []);
}

function structuredFromParsedMessages(session) {
  return session.messages
    .map((message) => {
      const blocks = Array.isArray(message.blocks) ? message.blocks.map(normalizeBlock).filter(Boolean) : textToBlocks(message.text ?? joinBlocks(message.content));
      return blocks.length > 0 ? { role: message.role ?? "unknown", blocks } : null;
    })
    .filter(Boolean);
}

export function toStructuredMessages(session) {
  const rawMessages = structuredFromRawItems(session);
  const messages = rawMessages.length > 0 ? rawMessages : structuredFromParsedMessages(session);
  return groupConsecutiveMessages(messages);
}

export async function resolveTranscriptPath(sessionPath) {
  const normalizedSessionPath = ensureReadableTranscriptPath(sessionPath);
  const resolvedSessionPath = path.resolve(normalizedSessionPath);
  const realSessionPath = await fs.realpath(resolvedSessionPath).catch(() => resolvedSessionPath);

  const stats = await fs.stat(realSessionPath);
  if (!stats.isFile()) {
    throw new Error("Transcript path must point to a file");
  }
  validateTranscriptExtension(realSessionPath);

  return realSessionPath;
}

export async function readTranscript({ sessionPath, agent }) {
  const realSessionPath = await resolveTranscriptPath(sessionPath);
  const session = await parseSession({ sessionPath: realSessionPath, agent });
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
