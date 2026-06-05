import fs from "node:fs/promises";
import path from "node:path";

const lineageMode = "kage-lineage";
const lineageVersion = 1;
const sessionExportModes = new Set(["claude-session", "codex-session", "qoder-session"]);

export function lineageSidecarPath(sessionPath) {
  return `${sessionPath}.kage-lineage.json`;
}

function compactTitle(session) {
  const title = session?.shortTitle ?? session?.title;
  return title ? String(title) : null;
}

export function buildLineageMetadata({ exported, outputPath, timestamp = new Date().toISOString() }) {
  if (!exported || !sessionExportModes.has(exported.mode) || !outputPath) {
    return null;
  }

  const parentSession = exported.session ?? {};
  const forkType = exported.sourceAgent === exported.targetAgent ? "fork" : "bridge";
  return {
    mode: lineageMode,
    version: lineageVersion,
    forkType,
    forkTimestamp: timestamp,
    parentAgent: exported.sourceAgent,
    parentSessionId: parentSession.sessionId ?? null,
    parentSessionPath: exported.sessionPath ?? null,
    parentTitle: compactTitle(parentSession),
    childAgent: exported.targetAgent,
    childSessionId: exported.sessionId ?? null,
    childSessionPath: outputPath,
  };
}

export function buildLineageFile({ exported, outputPath }) {
  const metadata = buildLineageMetadata({ exported, outputPath });
  if (!metadata) {
    return null;
  }

  const filePath = lineageSidecarPath(outputPath);
  return {
    key: "lineage",
    fileName: path.basename(filePath),
    path: filePath,
    content: `${JSON.stringify(metadata, null, 2)}\n`,
  };
}

export async function readLineageMetadata(sessionPath) {
  try {
    const raw = await fs.readFile(lineageSidecarPath(sessionPath), "utf8");
    const payload = JSON.parse(raw);
    if (payload?.mode !== lineageMode || payload?.version !== lineageVersion) {
      return null;
    }
    return {
      forkType: payload.forkType ?? null,
      forkTimestamp: payload.forkTimestamp ?? null,
      parentAgent: payload.parentAgent ?? null,
      parentSessionId: payload.parentSessionId ?? null,
      parentSessionPath: payload.parentSessionPath ?? null,
      parentTitle: payload.parentTitle ?? null,
      childAgent: payload.childAgent ?? null,
      childSessionId: payload.childSessionId ?? null,
      childSessionPath: payload.childSessionPath ?? null,
    };
  } catch {
    return null;
  }
}
