import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readSessionCwd } from "../adapters/sources/index.js";
import { walk } from "../core/files.js";
import { readTranscript } from "./transcript.js";
import { runAgentSend } from "./send.js";
import { renderServeManifest, renderServeServiceWorker, renderServeUi } from "./ui/index.js";

const defaultPort = 9876;
const defaultHost = "0.0.0.0";
const ALL_WORKSPACES_VALUE = "__all_workspaces__";
const maxTaskHistory = 100;
const dispatchAgents = new Set(["claude", "codex", "qodercli"]);

function cliPath() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cli.js");
}

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function textResponse(response, statusCode, text, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  response.end(text);
}

function runKageJson(args, { cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath(), ...args], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `kage exited with ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Could not decode kage output: ${error.message}`));
      }
    });
  });
}

function workspaceFromSearch(url) {
  const candidate = url.searchParams.get("workspace") || url.searchParams.get("cwd");
  if (!candidate) {
    return null;
  }
  const value = candidate.trim();
  return value.length > 0 ? value : null;
}

function uniqueWorkspaces(items = []) {
  const values = new Set();
  for (const item of items) {
    if (item) {
      values.add(item);
    }
  }
  return [...values].sort();
}

function isAllWorkspaces(value) {
  return String(value ?? "").trim() === ALL_WORKSPACES_VALUE;
}

function localAgentRoots() {
  const home = os.homedir();
  return {
    claude: path.join(home, ".claude", "projects"),
    codex: path.join(home, ".codex", "sessions"),
    qodercli: path.join(home, ".qoder", "projects"),
    qoderwork: path.join(home, ".qoderwork", "projects"),
  };
}

function commonWorkspaceRoots(home = os.homedir()) {
  return ["wrksp", "workspace", "workspaces", "Projects", "projects", "Developer", "dev", "code"].map((entry) =>
    path.join(home, entry),
  );
}

async function canonicalizeWorkspacePath(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  const resolved = path.resolve(text);
  try {
    return await fs.promises.realpath(resolved);
  } catch {
    return resolved;
  }
}

function isSubpath(candidate, ancestor) {
  const relativePath = path.relative(ancestor, candidate);
  return !relativePath || (relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath));
}

async function isDirectory(candidate) {
  try {
    return (await fs.promises.stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function listFirstLevelDirectories(rootDir, { maxEntries = 1000 } = {}) {
  let entries;
  try {
    entries = await fs.promises.readdir(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const dirs = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (dirs.length >= maxEntries) {
      break;
    }
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }
    const candidate = path.join(rootDir, entry.name);
    if (await isDirectory(candidate)) {
      dirs.push(candidate);
    }
  }
  return dirs;
}

function directoryChoiceLabel(directoryPath, home = os.homedir()) {
  const relativeHome = path.relative(home, directoryPath);
  if (relativeHome && relativeHome !== ".." && !relativeHome.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeHome)) {
    return `~/${relativeHome}`;
  }
  return directoryPath;
}

async function collectLocalDirectoryChoices(cwd = process.cwd()) {
  const home = os.homedir();
  const currentCwd = await canonicalizeWorkspacePath(cwd);
  const roots = new Map();

  if (currentCwd && (await isDirectory(currentCwd))) {
    const parent = path.dirname(currentCwd);
    if (parent && parent !== currentCwd) {
      roots.set(parent, "cwd-parent");
    }
  }

  for (const root of commonWorkspaceRoots(home)) {
    if (await isDirectory(root)) {
      roots.set(await canonicalizeWorkspacePath(root), "common-root");
    }
  }

  const choices = new Map();
  const addChoice = async (directoryPath, source, root = null) => {
    if (!(await isDirectory(directoryPath))) {
      return;
    }
    const canonicalPath = await canonicalizeWorkspacePath(directoryPath);
    if (choices.has(canonicalPath)) {
      return;
    }
    choices.set(canonicalPath, {
      path: canonicalPath,
      name: path.basename(canonicalPath) || canonicalPath,
      label: directoryChoiceLabel(canonicalPath, home),
      source,
      root,
      current: canonicalPath === currentCwd,
      selectable: true,
    });
  };

  if (currentCwd) {
    await addChoice(currentCwd, "current");
  }

  for (const [root, source] of roots) {
    const canonicalRoot = await canonicalizeWorkspacePath(root);
    if (source === "common-root") {
      await addChoice(canonicalRoot, source);
    }
    for (const child of await listFirstLevelDirectories(canonicalRoot)) {
      await addChoice(child, source === "cwd-parent" ? "cwd-parent-child" : "common-root-child", canonicalRoot);
    }
  }

  return [...choices.values()].sort((left, right) => left.label.localeCompare(right.label));
}

async function collectAgentWorkspaces(agent, rootDir) {
  try {
    const files = await walk(rootDir);
    const workspaces = new Set();

    for (const sessionPath of files) {
      try {
        const workspace = await readSessionCwd(sessionPath, agent);
        if (!workspace) {
          continue;
        }
        workspaces.add(await canonicalizeWorkspacePath(workspace));
      } catch {
        // Ignore malformed or unreadable session entries.
      }
    }

    return { agent, root: rootDir, workspaces: [...workspaces], error: null };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { agent, root: rootDir, workspaces: [], error: null };
    }
    return { agent, root: rootDir, workspaces: [], error: error.message ?? String(error) };
  }
}

async function buildProjectsInventory({ cwd = process.cwd() } = {}) {
  const roots = localAgentRoots();
  const [agentRoots, directoryChoices] = await Promise.all([
    Promise.all(Object.entries(roots).map(([agent, root]) => collectAgentWorkspaces(agent, root))),
    collectLocalDirectoryChoices(cwd),
  ]);
  const transcriptWorkspaces = uniqueWorkspaces(agentRoots.flatMap((group) => group.workspaces));
  const localWorkspaces = directoryChoices.map((choice) => choice.path);

  return {
    workspaces: uniqueWorkspaces([...transcriptWorkspaces, ...localWorkspaces]),
    transcriptWorkspaces,
    directoryChoices,
    agents: agentRoots,
  };
}

async function buildProjectsPayload({ workspace, includeSubdirs = true } = {}, options = {}) {
  const inventory = await buildProjectsInventory({ cwd: options.cwd });
  const normalizedWorkspace = workspace ? await canonicalizeWorkspacePath(workspace) : null;
  const requestedWorkspaceExists = normalizedWorkspace ? await isDirectory(normalizedWorkspace) : false;

  let workspaceValidation = null;
  if (normalizedWorkspace) {
    let knownWorkspace = false;
    if (requestedWorkspaceExists) {
      knownWorkspace = true;
    } else {
      for (const candidate of inventory.workspaces) {
        if (includeSubdirs ? isSubpath(candidate, normalizedWorkspace) : candidate === normalizedWorkspace) {
          knownWorkspace = true;
          break;
        }
      }
    }
    workspaceValidation = {
      requested: normalizedWorkspace,
      valid: knownWorkspace,
      includeSubdirs,
      ...(knownWorkspace ? {} : { reason: "The requested workspace does not exist or does not match any known project." }),
    };
  }

  const workspaces = uniqueWorkspaces([
    ...inventory.workspaces,
    ...(requestedWorkspaceExists ? [normalizedWorkspace] : []),
  ]);

  return {
    mode: "projects",
    cwd: options.cwd || null,
    workspaces,
    transcriptWorkspaces: inventory.transcriptWorkspaces,
    directoryChoices: inventory.directoryChoices,
    selectedWorkspace: normalizedWorkspace,
    workspaceValidation,
    errors: inventory.agents.filter((entry) => entry.error).map((entry) => ({
      agent: entry.agent,
      root: entry.root,
      error: entry.error,
    })),
  };
}

function readJsonBody(request, { maxBytes = 64 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message}`));
      }
    });
    request.on("error", reject);
  });
}

function requireAuth(request, serverOptions) {
  if (!serverOptions.password) {
    return true;
  }
  const url = new URL(request.url, "http://localhost");
  const bearer = request.headers.authorization?.replace(/^Bearer\s+/iu, "");
  return bearer === serverOptions.password || url.searchParams.get("password") === serverOptions.password;
}

function boundedQuery(url, name, fallback) {
  const value = url.searchParams.get(name);
  return value === null || value === "" ? fallback : value;
}

function kageScopeArgs(url, { includeJson = true } = {}) {
  const args = [];
  if (includeJson) {
    args.push("--json");
  }
  if (url.searchParams.get("includeSubdirs") !== "false") {
    args.push("--include-subdirs");
  }
  const since = boundedQuery(url, "since", "90d");
  if (since) {
    args.push("--since", since);
  }
  const limit = boundedQuery(url, "limit", "120");
  if (limit) {
    args.push("--limit", limit);
  }
  const agent = url.searchParams.get("agent");
  if (agent && agent !== "all") {
    args.push("--agent", agent);
  }
  return args;
}

function sendTargetKey(body, fallbackCwd) {
  const agent = String(body.agent ?? "").trim() || "unknown";
  const sessionId = String(body.sessionId ?? "").trim();
  if (sessionId) {
    return `${agent}:session:${sessionId}`;
  }
  const cwd = String(body.cwd ?? fallbackCwd ?? "").trim() || ".";
  return `${agent}:new:${cwd}`;
}

function taskTitleFromMessage(message) {
  const text = String(message ?? "").trim().replace(/\s+/g, " ");
  if (!text) {
    return "Untitled task";
  }
  return text.length > 96 ? `${text.slice(0, 93)}...` : text;
}

function taskProjectName(cwd) {
  const value = String(cwd ?? "").trim();
  if (!value) {
    return "current project";
  }
  return path.basename(value) || value;
}

function agentLabel(agent) {
  switch (agent) {
    case "claude":
      return "Claude";
    case "codex":
      return "Codex";
    case "qodercli":
      return "QoderCLI";
    case "qoderwork":
      return "QoderWork";
    default:
      return agent || "Agent";
  }
}

function publicTask(task) {
  return {
    id: task.id,
    agent: task.agent,
    agentLabel: task.agentLabel,
    cwd: task.cwd,
    project: task.project,
    title: task.title,
    message: task.message,
    status: task.status,
    progress: task.progress,
    targetKey: task.targetKey,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    startedAt: task.startedAt,
    reviewAt: task.reviewAt,
    completedAt: task.completedAt,
    durationMs: task.durationMs,
    pid: task.pid,
    stdout: task.stdout,
    stderr: task.stderr,
    error: task.error,
    logs: task.logs,
  };
}

function trimTaskHistory(tasks) {
  const values = Array.from(tasks.values()).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  for (const task of values.slice(maxTaskHistory)) {
    if (task.status !== "running" && task.status !== "queued") {
      tasks.delete(task.id);
    }
  }
}

function createTask(body, options, targetKey) {
  const now = new Date().toISOString();
  const cwd = String(body.cwd ?? options.cwd ?? "").trim() || options.cwd || process.cwd();
  const agent = String(body.agent ?? "").trim();
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    agent,
    agentLabel: agentLabel(agent),
    cwd,
    project: taskProjectName(cwd),
    title: taskTitleFromMessage(body.message),
    message: String(body.message ?? ""),
    status: "queued",
    progress: 0,
    targetKey,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    reviewAt: null,
    completedAt: null,
    durationMs: null,
    pid: null,
    stdout: "",
    stderr: "",
    error: "",
    logs: ["Queued for local dispatch."],
  };
}

async function runDispatchTask(task, body, options) {
  task.status = "running";
  task.progress = 35;
  task.startedAt = new Date().toISOString();
  task.updatedAt = task.startedAt;
  task.logs = [...task.logs, `Starting ${task.agentLabel} in ${task.project}.`];
  try {
    const result = await options.sendRunner({
      agent: body.agent,
      sessionId: body.sessionId,
      cwd: body.cwd,
      message: body.message,
      fallbackCwd: options.cwd,
    });
    const completedAt = new Date().toISOString();
    task.status = "needs_review";
    task.progress = 90;
    task.reviewAt = completedAt;
    task.updatedAt = completedAt;
    task.durationMs = result.durationMs ?? null;
    task.pid = result.pid ?? null;
    task.stdout = result.stdout || "";
    task.stderr = result.stderr || "";
    task.logs = [
      ...task.logs,
      result.stdout ? "Agent returned output; review before completing." : "Agent process finished; review before completing.",
      ...(result.stderr ? ["stderr captured; open task details for context."] : []),
    ];
  } catch (error) {
    const completedAt = new Date().toISOString();
    task.status = "failed";
    task.progress = 100;
    task.completedAt = completedAt;
    task.updatedAt = completedAt;
    task.durationMs = error.result?.durationMs ?? null;
    task.pid = error.result?.pid ?? null;
    task.stdout = error.result?.stdout || "";
    task.stderr = error.result?.stderr || "";
    task.error = error.message;
    task.logs = [...task.logs, error.message];
  } finally {
    options.sendInflight.delete(task.targetKey);
  }
}

function markTaskCompleted(task) {
  const now = new Date().toISOString();
  task.status = "completed";
  task.progress = 100;
  task.completedAt = now;
  task.updatedAt = now;
  task.logs = [...(task.logs || []), "Marked complete after review."];
  return task;
}

function applyWorkspaceContext(payload, workspace, options = {}) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  if (payload.mode !== "sessions") {
    return payload;
  }

  const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  return {
    ...payload,
    selectedWorkspace: workspace || payload.cwd,
    workspaces: uniqueWorkspaces(sessions.map((session) => session.cwd)),
    cwd: options.cwdOverride ?? (payload.cwd || workspace || null),
  };
}

function localNetworkUrls(port) {
  const urls = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        urls.push(`http://${address.address}:${port}`);
      }
    }
  }
  return urls;
}

function canAcceptLanConnections(host) {
  return host === "0.0.0.0" || host === "::";
}

async function handleApi(request, response, url, options) {
  if (url.pathname === "/api/doctor") {
    jsonResponse(response, 200, await runKageJson(["doctor", "--json"], { cwd: options.cwd }));
    return;
  }
  if (url.pathname === "/api/projects") {
    const includeSubdirs = url.searchParams.get("includeSubdirs") !== "false";
    const workspace = workspaceFromSearch(url);
    jsonResponse(response, 200, await buildProjectsPayload({ workspace, includeSubdirs }, options));
    return;
  }
  if (url.pathname === "/api/sessions") {
    const allWorkspaces = url.searchParams.get("all") === "1" || isAllWorkspaces(url.searchParams.get("workspace"));
    const requestedWorkspace = workspaceFromSearch(url);
    const workspace = allWorkspaces ? null : requestedWorkspace ?? options.cwd;
    const sessionsScope = kageScopeArgs(url);
    if (allWorkspaces && !sessionsScope.includes("--include-subdirs")) {
      sessionsScope.push("--include-subdirs");
    }
    const sessionsPayload = await runKageJson(["sessions", ...sessionsScope], {
      cwd: allWorkspaces ? "/" : workspace,
    });
    jsonResponse(
      response,
      200,
      applyWorkspaceContext(sessionsPayload, allWorkspaces ? ALL_WORKSPACES_VALUE : workspace, {
        cwdOverride: allWorkspaces ? os.homedir() : null,
      }),
    );
    return;
  }
  if (url.pathname === "/api/actions") {
    jsonResponse(response, 200, await runKageJson(["actions", ...kageScopeArgs(url)], { cwd: options.cwd }));
    return;
  }
  if (url.pathname === "/api/desktop-state") {
    jsonResponse(response, 200, await runKageJson(["desktop-state", ...kageScopeArgs(url)], { cwd: options.cwd }));
    return;
  }
  const taskActionMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/(complete|retry)$/);
  if (taskActionMatch) {
    await handleTaskAction(request, response, options, {
      taskId: decodeURIComponent(taskActionMatch[1]),
      action: taskActionMatch[2],
    });
    return;
  }
  if (url.pathname === "/api/tasks") {
    await handleTasks(request, response, options);
    return;
  }
  if (url.pathname === "/api/dispatch") {
    await handleDispatch(request, response, options);
    return;
  }
  if (url.pathname === "/api/transcript") {
    jsonResponse(
      response,
      200,
      await readTranscript({
        sessionPath: url.searchParams.get("path"),
        agent: url.searchParams.get("agent"),
      }),
    );
    return;
  }
  if (url.pathname === "/api/stream") {
    await handleStream(response, url, options);
    return;
  }
  if (url.pathname === "/api/send") {
    await handleSend(request, response, options);
    return;
  }
  jsonResponse(response, 404, { error: "Not found" });
}

async function handleTasks(request, response, options) {
  if (request.method !== "GET") {
    jsonResponse(response, 405, { error: "Use GET" });
    return;
  }
  const tasks = Array.from(options.tasks.values())
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .map(publicTask);
  jsonResponse(response, 200, { mode: "tasks", tasks });
}

async function handleTaskAction(request, response, options, { taskId, action }) {
  if (request.method !== "POST") {
    jsonResponse(response, 405, { error: "Use POST" });
    return;
  }
  const task = options.tasks.get(taskId);
  if (!task) {
    jsonResponse(response, 404, { error: "Task not found" });
    return;
  }
  if (action === "complete") {
    if (task.status !== "needs_review" && task.status !== "completed") {
      jsonResponse(response, 409, { error: "Only tasks that need review can be completed." });
      return;
    }
    jsonResponse(response, 200, { mode: "task", task: publicTask(markTaskCompleted(task)) });
    return;
  }
  if (action === "retry") {
    if (!options.allowSend) {
      jsonResponse(response, 403, { error: "Task dispatch is disabled. Restart without --read-only to retry local agents." });
      return;
    }
    if (task.status === "running" || task.status === "queued") {
      jsonResponse(response, 409, { error: "This task is already running." });
      return;
    }
    const body = { agent: task.agent, cwd: task.cwd, message: task.message };
    const targetKey = sendTargetKey(body, options.cwd);
    if (options.sendInflight.has(targetKey)) {
      jsonResponse(response, 409, {
        mode: "dispatch",
        status: "busy",
        error: "A task is already running for this target. Wait for it to finish before retrying.",
        targetKey,
      });
      return;
    }
    const nextTask = createTask(body, options, targetKey);
    nextTask.logs = [`Retrying ${task.id}.`];
    options.tasks.set(nextTask.id, nextTask);
    options.sendInflight.set(targetKey, { startedAt: Date.now(), taskId: nextTask.id });
    task.logs = [...(task.logs || []), `Retry dispatched as ${nextTask.id}.`];
    task.updatedAt = new Date().toISOString();
    trimTaskHistory(options.tasks);
    setTimeout(() => {
      void runDispatchTask(nextTask, body, options);
    }, 0);
    jsonResponse(response, 202, { mode: "dispatch", task: publicTask(nextTask) });
    return;
  }
  jsonResponse(response, 404, { error: "Task action not found" });
}

async function handleDispatch(request, response, options) {
  if (request.method !== "POST") {
    jsonResponse(response, 405, { error: "Use POST" });
    return;
  }
  if (!options.allowSend) {
    jsonResponse(response, 403, { error: "Task dispatch is disabled. Restart without --read-only to dispatch local agents." });
    return;
  }
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    jsonResponse(response, 400, { error: error.message });
    return;
  }
  const agent = String(body.agent ?? "").trim();
  if (!dispatchAgents.has(agent)) {
    jsonResponse(response, 400, { error: "Choose a supported dispatch agent: claude, codex, or qodercli." });
    return;
  }
  if (!String(body.message ?? "").trim()) {
    jsonResponse(response, 400, { error: "Message is required." });
    return;
  }
  if (String(body.message ?? "").length > 16_000) {
    jsonResponse(response, 400, { error: "Message is too long; keep it under 16000 characters." });
    return;
  }
  const targetKey = sendTargetKey(body, options.cwd);
  if (options.sendInflight.has(targetKey)) {
    jsonResponse(response, 409, {
      mode: "dispatch",
      status: "busy",
      error: "A task is already running for this target. Wait for it to finish before dispatching another prompt.",
      targetKey,
    });
    return;
  }
  try {
    const task = createTask(body, options, targetKey);
    options.tasks.set(task.id, task);
    options.sendInflight.set(targetKey, { startedAt: Date.now(), taskId: task.id });
    trimTaskHistory(options.tasks);
    setTimeout(() => {
      void runDispatchTask(task, body, options);
    }, 0);
    jsonResponse(response, 202, { mode: "dispatch", task: publicTask(task) });
  } catch (error) {
    jsonResponse(response, 500, { mode: "dispatch", status: "failed", error: error.message, targetKey });
  }
}

async function handleSend(request, response, options) {
  if (request.method !== "POST") {
    jsonResponse(response, 405, { error: "Use POST" });
    return;
  }
  if (!options.allowSend) {
    jsonResponse(response, 403, { error: "Message sending is disabled. Restart without --read-only to allow sending prompts." });
    return;
  }
  const body = await readJsonBody(request);
  if (String(body.message ?? "").length > 16_000) {
    jsonResponse(response, 400, { error: "Message is too long; keep it under 16000 characters." });
    return;
  }
  const targetKey = sendTargetKey(body, options.cwd);
  if (options.sendInflight.has(targetKey)) {
    jsonResponse(response, 409, {
      mode: "send",
      status: "busy",
      error: "A send is already running for this target. Wait for it to finish before sending another prompt.",
      targetKey,
    });
    return;
  }
  options.sendInflight.set(targetKey, { startedAt: Date.now() });
  try {
    const result = await options.sendRunner({
      agent: body.agent,
      sessionId: body.sessionId,
      cwd: body.cwd,
      message: body.message,
      fallbackCwd: options.cwd,
    });
    jsonResponse(response, 200, { mode: "send", targetKey, ...result });
  } catch (error) {
    jsonResponse(response, 500, {
      mode: "send",
      status: "failed",
      error: error.message,
      targetKey,
      ...(error.result ? { result: error.result } : {}),
    });
  } finally {
    options.sendInflight.delete(targetKey);
  }
}

async function handleStream(response, url, options) {
  const sessionPath = url.searchParams.get("path");
  const agent = url.searchParams.get("agent");
  if (!sessionPath) {
    jsonResponse(response, 400, { error: "Missing transcript path" });
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    "Connection": "keep-alive",
  });

  let closed = false;
  let lastMtimeMs = 0;
  let watchClose = null;

  const sendTranscript = async () => {
    if (closed) {
      return;
    }
    try {
      const stat = await fs.promises.stat(sessionPath);
      lastMtimeMs = stat.mtimeMs;
      const transcript = await readTranscript({ sessionPath, agent });
      response.write(`event: transcript\n`);
      response.write(`data: ${JSON.stringify(transcript)}\n\n`);
    } catch (error) {
      response.write(`event: error\n`);
      response.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    }
  };

  await sendTranscript();

  try {
    const watcher = fs.watch(sessionPath, { persistent: false }, sendTranscript);
    watchClose = () => watcher.close();
  } catch {
    watchClose = null;
  }

  const poller = setInterval(async () => {
    try {
      const stat = await fs.promises.stat(sessionPath);
      if (stat.mtimeMs !== lastMtimeMs) {
        lastMtimeMs = stat.mtimeMs;
        await sendTranscript();
      }
    } catch {
      // The stream reports parse/read errors through the transcript send path.
    }
  }, options.pollIntervalMs);

  response.on("close", () => {
    closed = true;
    clearInterval(poller);
    watchClose?.();
  });
}

export function createKageServeServer(options = {}) {
  const serverOptions = {
    cwd: options.cwd ?? process.cwd(),
    password: options.password ?? null,
    allowSend: options.allowSend !== false,
    sendRunner: options.sendRunner ?? runAgentSend,
    sendInflight: new Map(),
    tasks: new Map(),
    pollIntervalMs: options.pollIntervalMs ?? 2000,
  };

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    try {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        textResponse(
          response,
          200,
          renderServeUi({
            passwordRequired: Boolean(serverOptions.password),
            sendEnabled: serverOptions.allowSend,
          }),
          "text/html; charset=utf-8",
        );
        return;
      }
      if (url.pathname === "/manifest.webmanifest") {
        textResponse(response, 200, renderServeManifest(), "application/manifest+json; charset=utf-8");
        return;
      }
      if (url.pathname === "/sw.js") {
        textResponse(response, 200, renderServeServiceWorker(), "text/javascript; charset=utf-8");
        return;
      }
      if (!requireAuth(request, serverOptions)) {
        jsonResponse(response, 401, { error: "Unauthorized" });
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, url, serverOptions);
        return;
      }
      jsonResponse(response, 404, { error: "Not found" });
    } catch (error) {
      jsonResponse(response, 500, { error: error.message });
    }
  });
}

export async function startServeCommand({
  port = defaultPort,
  host = defaultHost,
  password = null,
  allowSend = true,
  cwd = process.cwd(),
  stdout = process.stdout,
} = {}) {
  const server = createKageServeServer({ cwd, password, allowSend });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const urls = canAcceptLanConnections(host) ? localNetworkUrls(actualPort) : [];
  stdout.write("KAGE web viewer running:\n");
  stdout.write(`  Local:  http://localhost:${actualPort}\n`);
  if (urls.length > 0) {
    stdout.write(`  Phone:  ${urls[0]}\n`);
  }
  if (password) {
    stdout.write("  Auth:   password enabled\n");
  } else if (urls.length > 0) {
    stdout.write("  Auth:   none; use --password <pin> on shared networks\n");
  }
  stdout.write(`  Send:   ${allowSend ? "enabled" : "disabled; use --read-only to disable"}\n`);
  return server;
}
