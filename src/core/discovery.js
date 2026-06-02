import { detectAgent, getDefaultRoot, normalizeAgent } from "./agents.js";
import { sameOrSubpath, samePath, walk } from "./files.js";
import { parseSession, readSessionCwd } from "../adapters/sources/index.js";
import path from "node:path";

function fileLooksLikeSessionId(filePath, sessionId) {
  const baseName = path.basename(filePath, ".jsonl");
  if (baseName === sessionId) {
    return true;
  }
  return baseName.endsWith(`-${sessionId}`);
}

async function matchesCwd(sessionCwd, cwd, { includeSubdirs = false } = {}) {
  if (!sessionCwd) {
    return false;
  }
  return includeSubdirs ? sameOrSubpath(sessionCwd, cwd) : samePath(sessionCwd, cwd);
}

export async function findLatestSession(rootDir = getDefaultRoot("codex"), options = {}) {
  const files = await walk(rootDir);
  if (files.length === 0) {
    throw new Error(`No session files found in ${rootDir}`);
  }

  const sortedFiles = files.sort();
  const cwd = options.cwd ?? null;
  const agent = normalizeAgent(options.agent) ?? detectAgent(rootDir) ?? detectAgent(sortedFiles[0]);

  if (!cwd || !agent) {
    return sortedFiles.at(-1);
  }

  for (const filePath of [...sortedFiles].reverse()) {
    const sessionCwd = await readSessionCwd(filePath, agent);
    if (await matchesCwd(sessionCwd, cwd, options)) {
      return filePath;
    }
  }

  return sortedFiles.at(-1);
}

export async function findMatchingSessions(rootDir = getDefaultRoot("codex"), options = {}) {
  const files = await walk(rootDir);
  if (files.length === 0) {
    throw new Error(`No session files found in ${rootDir}`);
  }

  const sortedFiles = files.sort();
  const orderedFiles = options.newestFirst ? [...sortedFiles].reverse() : sortedFiles;
  const cwd = options.cwd ?? null;
  const agent = normalizeAgent(options.agent) ?? detectAgent(rootDir) ?? detectAgent(orderedFiles[0]);

  if (!cwd || !agent) {
    return options.limit ? orderedFiles.slice(0, options.limit) : orderedFiles;
  }

  const matches = [];
  for (const filePath of orderedFiles) {
    const sessionCwd = await readSessionCwd(filePath, agent);
    if (await matchesCwd(sessionCwd, cwd, options)) {
      matches.push(filePath);
      if (options.limit && matches.length >= options.limit) {
        break;
      }
    }
  }

  return matches;
}

export async function findSessionById(rootDir = getDefaultRoot("codex"), options = {}) {
  const { sessionId } = options;
  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const files = await walk(rootDir);
  if (files.length === 0) {
    throw new Error(`No session files found in ${rootDir}`);
  }

  const agent = normalizeAgent(options.agent) ?? detectAgent(rootDir) ?? detectAgent(files[0]);
  for (const filePath of files.sort()) {
    if (fileLooksLikeSessionId(filePath, sessionId)) {
      return filePath;
    }
  }

  for (const filePath of files.sort()) {
    const session = await parseSession({ sessionPath: filePath, agent });
    if (session.sessionId === sessionId) {
      return filePath;
    }
  }

  throw new Error(`Session not found: ${sessionId}`);
}
