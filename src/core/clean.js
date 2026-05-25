import fs from "node:fs/promises";
import path from "node:path";

import { listAgentRoots } from "./agents.js";
import { walk } from "./files.js";
import { parseSession } from "../adapters/sources/index.js";

async function statFile(filePath) {
  const stat = await fs.stat(filePath);
  return {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
  };
}

async function collectSessionFiles(roots) {
  const files = [];
  for (const [agent, rootDir] of Object.entries(roots)) {
    let paths = [];
    try {
      paths = await walk(rootDir);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }

    for (const sessionPath of paths.filter((filePath) => isCleanableSessionFile(agent, filePath))) {
      try {
        const [session, stat] = await Promise.all([
          parseSession({ sessionPath, agent }),
          statFile(sessionPath),
        ]);
        files.push({
          agent,
          sessionId: session.sessionId,
          path: sessionPath,
          mtimeMs: stat.mtimeMs,
          size: stat.size,
          updatedAt: session.updatedAt,
        });
      } catch {
        // Ignore files that cannot be parsed as the agent's native session shape.
      }
    }
  }
  return files;
}

function isCleanableSessionFile(agent, filePath) {
  if (agent !== "claude") {
    return true;
  }
  return !path.normalize(filePath).split(path.sep).includes("subagents");
}

function groupBySession(files) {
  const groups = new Map();
  for (const file of files) {
    const key = `${file.agent}:${file.sessionId}`;
    const group = groups.get(key) ?? [];
    group.push(file);
    groups.set(key, group);
  }
  return groups;
}

function parseDuration(value) {
  if (!value) {
    return null;
  }

  const match = String(value).match(/^(\d+)([dhm])$/u);
  if (!match) {
    throw new Error("--older-than requires a duration like 7d, 12h, or 30m");
  }

  const [, amountText, unit] = match;
  const amount = Number(amountText);
  if (amount < 1) {
    throw new Error("--older-than requires a positive duration");
  }
  const multipliers = {
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
  };
  return amount * multipliers[unit];
}

export async function planClean({ roots = listAgentRoots(), olderThan = null, now = Date.now() } = {}) {
  const files = await collectSessionFiles(roots);
  const duplicateGroups = [];
  const duplicateCandidates = [];
  const staleCandidates = [];
  const duplicatePaths = new Set();
  const durationMs = parseDuration(olderThan);
  const cutoffMs = durationMs ? now - durationMs : null;

  for (const group of groupBySession(files).values()) {
    if (group.length < 2) {
      continue;
    }

    const sorted = [...group].sort((left, right) => right.mtimeMs - left.mtimeMs);
    const [keep, ...remove] = sorted;
    duplicateGroups.push({
      agent: keep.agent,
      sessionId: keep.sessionId,
      keep,
      remove,
    });
    duplicateCandidates.push(...remove);
    for (const file of remove) {
      duplicatePaths.add(file.path);
    }
  }

  if (cutoffMs !== null) {
    for (const file of files) {
      if (file.mtimeMs < cutoffMs && !duplicatePaths.has(file.path)) {
        staleCandidates.push(file);
      }
    }
  }

  const deleteCandidates = [...duplicateCandidates, ...staleCandidates];

  return {
    scannedFiles: files.length,
    duplicateGroups,
    duplicateCandidates,
    staleCandidates,
    deleteCandidates,
    freedBytes: deleteCandidates.reduce((total, file) => total + (file.size ?? 0), 0),
  };
}

export async function cleanDuplicateExports({ confirm = false, roots = listAgentRoots(), olderThan = null } = {}) {
  const plan = await planClean({ roots, olderThan });
  const deleted = [];

  if (confirm) {
    for (const file of plan.deleteCandidates) {
      await fs.unlink(file.path);
      deleted.push(file.path);
    }
  }

  return {
    ...plan,
    dryRun: !confirm,
    deleted,
  };
}
