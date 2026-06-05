import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readTranscript } from "./transcript.js";
import { renderServeManifest, renderServeServiceWorker, renderServeUi } from "./ui/index.js";

const defaultPort = 9876;
const defaultHost = "0.0.0.0";

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
  if (url.pathname === "/api/sessions") {
    jsonResponse(response, 200, await runKageJson(["sessions", ...kageScopeArgs(url)], { cwd: options.cwd }));
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
  jsonResponse(response, 404, { error: "Not found" });
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
    pollIntervalMs: options.pollIntervalMs ?? 2000,
  };

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    try {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        textResponse(response, 200, renderServeUi({ passwordRequired: Boolean(serverOptions.password) }), "text/html; charset=utf-8");
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
  cwd = process.cwd(),
  stdout = process.stdout,
} = {}) {
  const server = createKageServeServer({ cwd, password });
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
  return server;
}
