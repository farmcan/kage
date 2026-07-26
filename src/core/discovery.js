import { detectAgent, getDefaultRoot, normalizeAgent } from "./agents.js";
import { sameOrSubpath, samePath, walk } from "./files.js";
import { parseSession, readSessionInfo } from "../adapters/sources/index.js";
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

function isDiscoverableSession(session, { includeNonResumable = false } = {}) {
  return includeNonResumable || session.resumable !== false;
}

export async function findLatestSession(rootDir = getDefaultRoot("codex"), options = {}) {
  const files = await walk(rootDir);
  if (files.length === 0) {
    throw new Error(`No session files found in ${rootDir}`);
  }

  const sortedFiles = files.sort();
  const cwd = options.cwd ?? null;
  const agent = normalizeAgent(options.agent) ?? detectAgent(rootDir) ?? detectAgent(sortedFiles[0]);

  if (!agent) {
    return sortedFiles.at(-1);
  }

  let latestDiscoverable = null;
  for (const filePath of [...sortedFiles].reverse()) {
    const session = await readSessionInfo(filePath, agent);
    if (!isDiscoverableSession(session, options)) {
      continue;
    }
    latestDiscoverable ??= filePath;
    if (!cwd || (await matchesCwd(session.cwd, cwd, options))) {
      return filePath;
    }
  }

  if (latestDiscoverable) {
    return latestDiscoverable;
  }
  throw new Error(`No resumable session files found in ${rootDir}`);
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

  if (!agent) {
    return options.limit ? orderedFiles.slice(0, options.limit) : orderedFiles;
  }

  const matches = [];
  for (const filePath of orderedFiles) {
    const session = await readSessionInfo(filePath, agent);
    if (!isDiscoverableSession(session, options)) {
      continue;
    }
    if (!cwd || (await matchesCwd(session.cwd, cwd, options))) {
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
