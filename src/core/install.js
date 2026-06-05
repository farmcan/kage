import path from "node:path";

import { getDefaultRoot, normalizeAgent } from "./agents.js";
import { buildLineageFile } from "./lineage.js";
import { buildClaudeResumeCommand, buildCodexResumeCommand, buildQoderResumeCommand } from "./resume-commands.js";

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

function withLineage(plan, exported) {
  const mainFile = plan.files.find((file) => file.key === "main") ?? plan.files[0];
  const lineageFile = buildLineageFile({ exported, outputPath: mainFile?.path });
  if (!lineageFile) {
    return plan;
  }
  return {
    ...plan,
    files: [...plan.files, lineageFile],
  };
}

export function resolveInstallPlan({ args, exported, targetAgent }) {
  if (args.out) {
    if (exported.mode === "qoder-session") {
      return withLineage({
        files: [
          withPath(exported.files[0], args.out),
          withPath(exported.files[1], replaceExtension(args.out, /\.jsonl$/u, "-session.json", "-session.json")),
        ],
        resumeCommand: null,
      }, exported);
    }

    return withLineage({ files: [withPath(exported.files[0], args.out)], resumeCommand: null }, exported);
  }

  if (args.outputDir) {
    const files = exported.files.map((file) => withPath(file, path.join(args.outputDir, file.fileName)));
    return withLineage({
      files,
      resumeCommand: null,
    }, exported);
  }

  if (exported.mode === "codex-session" && normalizeAgent(targetAgent) === "codex") {
    const outputPath = resolveCodexInstallPath(exported.files[0].fileName, exported.timestamp);
    return withLineage({
      files: [withPath(exported.files[0], outputPath)],
      resumeCommand: buildCodexResumeCommand(exported.sessionId),
    }, exported);
  }

  if (exported.mode === "claude-session" && normalizeAgent(targetAgent) === "claude") {
    const outputPath = resolveClaudeInstallPath(exported.projectKey, exported.files[0].fileName);
    return withLineage({
      files: [withPath(exported.files[0], outputPath)],
      resumeCommand: buildClaudeResumeCommand(exported.sessionId, exported.session?.cwd),
    }, exported);
  }

  if (exported.mode === "qoder-session" && normalizeAgent(targetAgent) === "qodercli") {
    return withLineage({
      files: exported.files.map((file) => withPath(file, resolveQoderInstallPath(exported.projectKey, file.fileName))),
      resumeCommand: buildQoderResumeCommand(exported.sessionId, exported.workingDir),
    }, exported);
  }

  return withLineage({
    files: exported.files.map((file) => withPath(file, resolveDefaultTmpPath(file.fileName))),
    resumeCommand: null,
  }, exported);
}
