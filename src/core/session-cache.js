import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseSession } from "../adapters/sources/index.js";
import { getRealUserMessages, getRecentUserMessages, getSessionTitle, getShortSessionTitle } from "./session-labels.js";

const CACHE_VERSION = 2;

function defaultCacheDir() {
  if (process.env.KAGE_CACHE_DIR) {
    return process.env.KAGE_CACHE_DIR;
  }
  if (process.env.XDG_CACHE_HOME) {
    return path.join(process.env.XDG_CACHE_HOME, "kage");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "KAGE");
  }
  return path.join(os.homedir(), ".cache", "kage");
}

export function defaultSessionCachePath() {
  return process.env.KAGE_SESSION_CACHE_PATH ?? path.join(defaultCacheDir(), "session-metadata-v2.json");
}

function cacheKey(agent, sessionPath) {
  return `${agent}:${sessionPath}`;
}

function summarizeSession(session) {
  return {
    agent: session.agent,
    sessionPath: session.sessionPath,
    sessionId: session.sessionId,
    cwd: session.cwd,
    updatedAt: session.updatedAt ?? null,
    title: getSessionTitle(session),
    shortTitle: getShortSessionTitle(session),
    turnCount: getRealUserMessages(session).length,
    recentUserMessages: getRecentUserMessages(session),
  };
}

export class SessionMetadataCache {
  constructor({ cachePath = defaultSessionCachePath(), disabled = process.env.KAGE_DISABLE_SESSION_CACHE === "1" } = {}) {
    this.cachePath = cachePath;
    this.disabled = disabled;
    this.entries = new Map();
    this.dirty = false;
  }

  static async load(options = {}) {
    const cache = new SessionMetadataCache(options);
    if (cache.disabled) {
      return cache;
    }

    try {
      const raw = await fs.readFile(cache.cachePath, "utf8");
      const payload = JSON.parse(raw);
      if (payload.version !== CACHE_VERSION || !payload.entries || typeof payload.entries !== "object") {
        return cache;
      }
      cache.entries = new Map(Object.entries(payload.entries));
    } catch {
      // A missing or stale cache should never prevent session discovery.
    }
    return cache;
  }

  get(agent, sessionPath, stats) {
    if (this.disabled) {
      return null;
    }
    const entry = this.entries.get(cacheKey(agent, sessionPath));
    if (!entry || entry.size !== stats.size || entry.mtimeMs !== stats.mtimeMs) {
      return null;
    }
    return entry.summary ?? null;
  }

  set(agent, sessionPath, stats, summary) {
    if (this.disabled) {
      return;
    }
    this.entries.set(cacheKey(agent, sessionPath), {
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      cachedAt: new Date().toISOString(),
      summary,
    });
    this.dirty = true;
  }

  async save() {
    if (this.disabled || !this.dirty) {
      return;
    }
    const payload = {
      version: CACHE_VERSION,
      entries: Object.fromEntries(this.entries),
    };
    await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
    await fs.writeFile(this.cachePath, `${JSON.stringify(payload)}\n`, "utf8");
    this.dirty = false;
  }
}

export async function readSessionSummary(sessionPath, agent, cache) {
  const stats = await fs.stat(sessionPath);
  const cached = cache?.get(agent, sessionPath, stats);
  if (cached) {
    return cached;
  }

  const session = await parseSession({ sessionPath, agent });
  const summary = summarizeSession(session);
  cache?.set(agent, sessionPath, stats, summary);
  return summary;
}
