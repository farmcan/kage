import path from "node:path";

import { getDefaultRoot, normalizeAgent } from "./agents.js";

function datePartsFromTimestamp(timestamp) {
  const date = new Date(timestamp ?? Date.now());
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = String(safeDate.getUTCFullYear());
  const month = String(safeDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(safeDate.getUTCDate()).padStart(2, "0");
  return { year, month, day };
}

function resolveCodexInstallPath(fileName, timestamp) {
  const legacyMatch = fileName.match(/^rollout-(\d{4})-(\d{2})-(\d{2})T/u);
  if (legacyMatch) {
    const [, year, month, day] = legacyMatch;
    return path.join(getDefaultRoot("codex"), year, month, day, fileName);
  }

  const { year, month, day } = datePartsFromTimestamp(timestamp);
  return path.join(getDefaultRoot("codex"), year, month, day, fileName);
}

function resolveClaudeInstallPath(projectKey, fileName) {
  return path.join(getDefaultRoot("claude"), projectKey, fileName);
}

function resolveQoderInstallPath(projectKey, fileName) {
  return path.join(getDefaultRoot("qodercli"), projectKey, fileName);
}

function resolveDefaultTmpPath(fileName) {
  return path.join(process.cwd(), "tmp", "kage", fileName);
}

function withPath(file, filePath) {
  return { ...file, path: filePath };
}

function replaceExtension(filePath, pattern, replacement, fallbackSuffix) {
  if (pattern.test(filePath)) {
    return filePath.replace(pattern, replacement);
  }
  return `${filePath}${fallbackSuffix}`;
}

function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:@%+=,-]+$/u.test(text)) {
    return text;
  }
  return `'${text.replace(/'/gu, "'\\''")}'`;
}

export function resolveInstallPlan({ args, exported, targetAgent }) {
  if (args.out) {
    if (exported.mode === "qoder-session") {
      return {
        files: [
          withPath(exported.files[0], args.out),
          withPath(exported.files[1], replaceExtension(args.out, /\.jsonl$/u, "-session.json", "-session.json")),
        ],
        resumeCommand: null,
      };
    }

    return { files: [withPath(exported.files[0], args.out)], resumeCommand: null };
  }

  if (args.outputDir) {
    const files = exported.files.map((file) => withPath(file, path.join(args.outputDir, file.fileName)));
    return {
      files,
      resumeCommand: null,
    };
  }

  if (exported.mode === "codex-session" && normalizeAgent(targetAgent) === "codex") {
    const outputPath = resolveCodexInstallPath(exported.files[0].fileName, exported.timestamp);
    return {
      files: [withPath(exported.files[0], outputPath)],
      resumeCommand: `codex resume ${exported.sessionId}`,
    };
  }

  if (exported.mode === "claude-session" && normalizeAgent(targetAgent) === "claude") {
    const outputPath = resolveClaudeInstallPath(exported.projectKey, exported.files[0].fileName);
    return {
      files: [withPath(exported.files[0], outputPath)],
      resumeCommand: `claude --resume ${exported.sessionId}`,
    };
  }

  if (exported.mode === "qoder-session" && normalizeAgent(targetAgent) === "qodercli") {
    return {
      files: exported.files.map((file) => withPath(file, resolveQoderInstallPath(exported.projectKey, file.fileName))),
      resumeCommand: `qodercli --cwd ${shellQuote(exported.workingDir)} --resume ${exported.sessionId}`,
    };
  }

  return {
    files: exported.files.map((file) => withPath(file, resolveDefaultTmpPath(file.fileName))),
    resumeCommand: null,
  };
}
