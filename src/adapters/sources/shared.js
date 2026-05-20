import path from "node:path";

import { readJson } from "../../core/files.js";

export function cleanText(text) {
  return text
    .replace(/^<user_query>\s*/u, "")
    .replace(/\s*<\/user_query>$/u, "")
    .trim();
}

function blockText(block) {
  if (typeof block === "string") {
    return block;
  }
  if (!block || typeof block !== "object") {
    return "";
  }
  if (typeof block.text === "string") {
    return block.text;
  }
  if (typeof block.content === "string") {
    return block.content;
  }
  return "";
}

export function joinBlocks(blocks = []) {
  if (typeof blocks === "string") {
    return blocks.trim();
  }
  if (!Array.isArray(blocks)) {
    return "";
  }

  return blocks
    .map(blockText)
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function extractClaudeText(content) {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter((block) => block?.type === "text")
    .map((block) => block.text)
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function readQoderSidecar(filePath) {
  const sidecarPath = filePath.replace(/\.jsonl$/u, "-session.json");
  try {
    return await readJson(sidecarPath);
  } catch {
    return null;
  }
}

export function knownCwd(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text !== "unknown" ? text : null;
}

export function cwdFromProjectPath(sessionPath) {
  const projectKey = path.basename(path.dirname(sessionPath));
  if (!projectKey.startsWith("-") || projectKey.length < 2) {
    return null;
  }
  const decoded = projectKey
    .slice(1)
    .split("-")
    .filter(Boolean)
    .join(path.sep);
  return decoded ? `${path.sep}${decoded}` : null;
}
