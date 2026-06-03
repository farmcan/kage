import os from "node:os";
import path from "node:path";

import { formatAgentName, listAgentRoots, supportedAgents } from "./agents.js";
import { sameOrSubpath, samePath, walk } from "./files.js";
import { getRecentUserMessages, getSessionTitle, getShortSessionTitle } from "./session-labels.js";
import { parseSession } from "../adapters/sources/index.js";

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function agentLabel(agent) {
  const value = formatAgentName(agent);
  if (value === "qodercli") {
    return "QoderCLI";
  }
  if (value === "qoderwork") {
    return "QoderWork";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function parseDateFilter(value, { now = Date.now(), option = "date", boundary = "start" } = {}) {
  if (!value) {
    return null;
  }

  const duration = String(value).match(/^(\d+)([dhm])$/u);
  if (duration) {
    const [, amountText, unit] = duration;
    const amount = Number(amountText);
    const multipliers = {
      d: 24 * 60 * 60 * 1000,
      h: 60 * 60 * 1000,
      m: 60 * 1000,
    };
    return new Date(now - amount * multipliers[unit]);
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`${option} requires a date or duration like 2026-05-25 or 7d`);
  }
  if (boundary === "end" && /^\d{4}-\d{2}-\d{2}$/u.test(String(value))) {
    return new Date(timestamp + 24 * 60 * 60 * 1000 - 1);
  }
  return new Date(timestamp);
}

function expandHome(filePath) {
  const text = String(filePath ?? "");
  if (text === "~") {
    return os.homedir();
  }
  if (text.startsWith("~/")) {
    return path.join(os.homedir(), text.slice(2));
  }
  return text;
}

function isSearchableSessionFile(agent, filePath) {
  if (agent !== "claude") {
    return true;
  }
  return !path.normalize(filePath).split(path.sep).includes("subagents");
}

function findMatchContext(session, title, query) {
  if (!query) {
    return null;
  }

  const needle = normalizeText(query);
  const fields = [
    { field: "title", text: title },
    { field: "cwd", text: session.cwd },
    { field: "sessionId", text: session.sessionId },
    ...session.messages.map((message, index) => ({
      field: `message:${message.role}:${index + 1}`,
      text: message.text,
    })),
  ];

  for (const field of fields) {
    const rawText = String(field.text ?? "").replace(/\s+/gu, " ").trim();
    const haystack = normalizeText(rawText);
    const index = haystack.indexOf(needle);
    if (index === -1) {
      continue;
    }
    const start = Math.max(0, index - 40);
    const end = Math.min(rawText.length, index + query.length + 80);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < rawText.length ? "..." : "";
    return {
      field: field.field,
      text: `${prefix}${rawText.slice(start, end)}${suffix}`,
    };
  }

  return null;
}

async function matchesProject(sessionCwd, projectPath, { includeSubdirs = false } = {}) {
  if (!projectPath) {
    return true;
  }
  if (!sessionCwd) {
    return false;
  }
  return includeSubdirs ? sameOrSubpath(sessionCwd, projectPath) : samePath(sessionCwd, projectPath);
}

function isWithinDateRange(updatedAt, sinceDate, untilDate) {
  if (!sinceDate && !untilDate) {
    return true;
  }
  if (!updatedAt) {
    return false;
  }

  const timestamp = Date.parse(updatedAt);
  if (Number.isNaN(timestamp)) {
    return false;
  }
  if (sinceDate && timestamp < sinceDate.getTime()) {
    return false;
  }
  if (untilDate && timestamp > untilDate.getTime()) {
    return false;
  }
  return true;
}

function sessionMatchesQuery(session, title, query) {
  if (!query) {
    return true;
  }

  const haystack = [
    title,
    session.sessionId,
    session.cwd,
    ...session.messages.map((message) => message.text),
  ]
    .map(normalizeText)
    .join("\n");
  return haystack.includes(normalizeText(query));
}

async function searchAgent(agent, rootDir, filters) {
  let files = [];
  try {
    files = await walk(rootDir);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    return { agent, root: rootDir, results: [], error: `No session files found in ${rootDir}` };
  }

  const results = [];
  for (const sessionPath of files.filter((filePath) => isSearchableSessionFile(agent, filePath))) {
    try {
      const session = await parseSession({ sessionPath, agent });
      const title = getSessionTitle(session);
      if (!(await matchesProject(session.cwd, filters.projectPath, filters))) {
        continue;
      }
      if (!isWithinDateRange(session.updatedAt, filters.sinceDate, filters.untilDate)) {
        continue;
      }
      if (!sessionMatchesQuery(session, title, filters.query)) {
        continue;
      }

      results.push({
        agent,
        agentLabel: agentLabel(agent),
        sessionId: session.sessionId,
        title,
        shortTitle: getShortSessionTitle(session),
        updatedAt: session.updatedAt ?? null,
        cwd: session.cwd,
        path: sessionPath,
        recentUserMessages: getRecentUserMessages(session),
        match: findMatchContext(session, title, filters.query),
      });
    } catch {
      // Ignore malformed or incompatible session files during search.
    }
  }

  return { agent, root: rootDir, results, error: null };
}

export async function searchSessions({
  query = null,
  agent = null,
  root = null,
  since = null,
  until = null,
  project = null,
  includeSubdirs = false,
  limit = 50,
  now = Date.now(),
} = {}) {
  if (!query && !agent && !since && !until && !project) {
    throw new Error("kage search requires a query or at least one filter");
  }
  const agents = agent ? [formatAgentName(agent)] : supportedAgents;
  for (const currentAgent of agents) {
    if (!supportedAgents.includes(currentAgent)) {
      throw new Error(`Unsupported agent: ${agent}`);
    }
  }
  if (root && agents.length !== 1) {
    throw new Error("--root requires --agent with kage search");
  }

  const filters = {
    query: query ? String(query) : null,
    sinceDate: parseDateFilter(since, { now, option: "--since" }),
    untilDate: parseDateFilter(until, { now, option: "--until", boundary: "end" }),
    projectPath: project ? path.resolve(expandHome(project)) : null,
    includeSubdirs,
  };
  const roots = listAgentRoots();
  const groups = [];

  for (const currentAgent of agents) {
    groups.push(await searchAgent(currentAgent, root ?? roots[currentAgent], filters));
  }

  const results = groups
    .flatMap((group) => group.results)
    .sort((left, right) => Date.parse(right.updatedAt ?? 0) - Date.parse(left.updatedAt ?? 0))
    .slice(0, limit);

  return {
    mode: "search",
    query: filters.query,
    filters: {
      agent: agent ? formatAgentName(agent) : null,
      since: filters.sinceDate?.toISOString() ?? null,
      until: filters.untilDate?.toISOString() ?? null,
      project: filters.projectPath,
      includeSubdirs: filters.includeSubdirs,
      limit,
    },
    results,
    agents: groups.map((group) => ({
      agent: group.agent,
      root: group.root,
      resultCount: group.results.length,
      error: group.error,
    })),
  };
}
