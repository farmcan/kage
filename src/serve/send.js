import { spawn } from "node:child_process";
import fs from "node:fs";

const supportedSendAgents = new Set(["claude", "codex", "qodercli"]);

function requireText(value, name) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`${name} is required`);
  }
  return text;
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function existingCwd(cwd, fallback) {
  const candidate = cwd || fallback;
  try {
    return candidate && fs.statSync(candidate).isDirectory() ? candidate : fallback;
  } catch {
    return fallback;
  }
}

export function buildAgentSendCommand({ agent, sessionId, cwd, message, fallbackCwd = process.cwd() } = {}) {
  const normalizedAgent = requireText(agent, "agent");
  if (!supportedSendAgents.has(normalizedAgent)) {
    throw new Error(normalizedAgent === "qoderwork" ? "QoderWork is read-only in kage serve" : `Unsupported send agent: ${normalizedAgent}`);
  }

  const normalizedSessionId = optionalText(sessionId);
  const normalizedMessage = requireText(message, "message");
  const workingDirectory = existingCwd(cwd, fallbackCwd);
  const target = normalizedSessionId ? "session" : "new";

  if (normalizedAgent === "claude") {
    return {
      command: "claude",
      args: [...(normalizedSessionId ? ["-r", normalizedSessionId] : []), "-p", normalizedMessage],
      cwd: workingDirectory,
      stdin: null,
      target,
    };
  }

  if (normalizedAgent === "codex") {
    return {
      command: "codex",
      args: normalizedSessionId ? ["exec", "resume", normalizedSessionId, "-"] : ["exec", "-"],
      cwd: workingDirectory,
      stdin: normalizedMessage,
      target,
    };
  }

  return {
    command: "qodercli",
    args: ["-w", workingDirectory, ...(normalizedSessionId ? ["-r", normalizedSessionId] : []), "-p", normalizedMessage],
    cwd: workingDirectory,
    stdin: null,
    target,
  };
}

export function runAgentSend(input, { timeoutMs = Number(process.env.KAGE_SEND_TIMEOUT_MS) || 20 * 60 * 1000 } = {}) {
  const commandPlan = buildAgentSendCommand(input);
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(commandPlan.command, commandPlan.args, {
      cwd: commandPlan.cwd,
      env: process.env,
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
    });

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`${commandPlan.command} did not start within ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdin.on("error", () => {
      // The child may exit quickly after accepting the prompt; the serve UI has
      // already handed the task off, so avoid surfacing an incidental pipe error.
    });
    child.on("spawn", () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (commandPlan.stdin !== null) {
        child.stdin.end(commandPlan.stdin);
      } else {
        child.stdin.end();
      }
      child.unref();
      resolve({
        ok: true,
        command: commandPlan.command,
        target: commandPlan.target,
        cwd: commandPlan.cwd,
        pid: child.pid,
        status: "started",
      });
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(new Error(error.code === "ENOENT" ? `${commandPlan.command} command not found` : error.message));
    });
  });
}
