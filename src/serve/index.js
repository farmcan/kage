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

async function buildProjectsInventory() {
  const roots = localAgentRoots();
  const agentRoots = await Promise.all(Object.entries(roots).map(([agent, root]) => collectAgentWorkspaces(agent, root)));

  return {
    workspaces: uniqueWorkspaces(agentRoots.flatMap((group) => group.workspaces)),
    agents: agentRoots,
  };
}

async function buildProjectsPayload({ workspace, includeSubdirs = true } = {}, options = {}) {
  const inventory = await buildProjectsInventory();
  const normalizedWorkspace = workspace ? await canonicalizeWorkspacePath(workspace) : null;

  let workspaceValidation = null;
  if (normalizedWorkspace) {
    let valid = false;
    for (const candidate of inventory.workspaces) {
      if (includeSubdirs ? isSubpath(candidate, normalizedWorkspace) : candidate === normalizedWorkspace) {
        valid = true;
        break;
      }
    }
    workspaceValidation = {
      requested: normalizedWorkspace,
      valid,
      includeSubdirs,
      ...(valid ? {} : { reason: "The requested workspace does not match any known project." }),
    };
  }

  return {
    mode: "projects",
    cwd: options.cwd || null,
    workspaces: inventory.workspaces,
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
