import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function kageDataDir() {
  return process.env.KAGE_DATA_DIR || path.join(os.homedir(), ".kage");
}

function encodePathToken(value) {
  return Buffer.from(String(value ?? ""), "utf8").toString("base64url");
}

async function optionalStat(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function sha256File(filePath) {
  const content = await fs.readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function moveFile(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.rename(source, target);
  } catch (error) {
    if (error?.code !== "EXDEV") {
      throw error;
    }
    await fs.copyFile(source, target);
    await fs.unlink(source);
  }
}

async function existingSessionFiles(sessionPath) {
  const candidates = [
    { key: "main", path: sessionPath },
    { key: "sidecar", path: sessionPath.replace(/\.jsonl$/u, "-session.json") },
    { key: "lineage", path: `${sessionPath}.kage-lineage.json` },
  ];
  const files = [];
  for (const candidate of candidates) {
    const stat = await optionalStat(candidate.path);
    if (stat?.isFile()) {
      files.push({ ...candidate, size: stat.size, sha256: await sha256File(candidate.path) });
    }
  }
  return files;
}

export async function buildSessionArchivePlan(session, { dataDir = kageDataDir() } = {}) {
  if (!session?.sessionPath) {
    throw new Error("Session path is required for archive.");
  }
  const files = await existingSessionFiles(session.sessionPath);
  if (files.length === 0) {
    throw new Error(`Session file not found: ${session.sessionPath}`);
  }

  const archiveId = randomUUID();
  const archiveRoot = path.join(dataDir, "archive");
  const encodedParent = encodePathToken(path.dirname(session.sessionPath));
  const archiveDir = path.join(archiveRoot, session.agent || "unknown", encodedParent, archiveId);
  const archivedFiles = files.map((file) => ({
    ...file,
    originalPath: file.path,
    archivedPath: path.join(archiveDir, path.basename(file.path)),
  }));
  const mainFile = archivedFiles.find((file) => file.key === "main") ?? archivedFiles[0];

  return {
    archiveId,
    archivedAt: new Date().toISOString(),
    agent: session.agent ?? "unknown",
    agentLabel: session.agentLabel ?? session.agent ?? "unknown",
    sessionId: session.sessionId ?? null,
    title: session.title ?? session.shortTitle ?? null,
    shortTitle: session.shortTitle ?? null,
    updatedAt: session.updatedAt ?? null,
    cwd: session.cwd ?? null,
    originalPath: mainFile.originalPath,
    archivedPath: mainFile.archivedPath,
    size: mainFile.size,
    sha256: mainFile.sha256,
    files: archivedFiles.map((file) => ({
      key: file.key,
      originalPath: file.originalPath,
      archivedPath: file.archivedPath,
      size: file.size,
      sha256: file.sha256,
    })),
    manifestPath: path.join(archiveRoot, "manifest.jsonl"),
  };
}

export async function archiveSessionWithPlan(plan) {
  for (const file of plan.files) {
    await moveFile(file.originalPath, file.archivedPath);
  }
  await fs.mkdir(path.dirname(plan.manifestPath), { recursive: true });
  await fs.appendFile(plan.manifestPath, `${JSON.stringify(plan)}\n`, "utf8");
  return plan;
}
