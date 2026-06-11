import { spawn } from "node:child_process";
import fs from "node:fs";

const supportedSendAgents = new Set(["claude", "codex", "qodercli"]);
const maxCapturedOutputBytes = 512 * 1024;
const codexUnattendedArgs = ["--dangerously-bypass-approvals-and-sandbox"];

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

function agentLabel(agent) {
  if (agent === "qodercli") return "QoderCLI";
  if (agent === "codex") return "Codex";
  if (agent === "claude") return "Claude";
  return agent;
}

export function validateAgentSendInput(input = {}) {
  const normalizedAgent = requireText(input.agent, "agent");
  if (!supportedSendAgents.has(normalizedAgent)) {
    throw new Error(normalizedAgent === "qoderwork" ? "QoderWork is read-only in kage serve" : `Unsupported send agent: ${normalizedAgent}`);
  }

  const normalizedSessionId = optionalText(input.sessionId);
  const normalizedMessage = requireText(input.message, "message");
  if (normalizedAgent === "qodercli" && normalizedSessionId === "later") {
    throw new Error(`${agentLabel(normalizedAgent)} reply requires a real session id; "${normalizedSessionId}" looks like a placeholder. Use New to start from cwd or choose a resumable session.`);
  }

  return { normalizedAgent, normalizedSessionId, normalizedMessage };
}

function existingCwd(cwd, fallback) {
  const candidate = cwd || fallback;
  try {
    return candidate && fs.statSync(candidate).isDirectory() ? candidate : fallback;
  } catch {
    return fallback;
  }
}

function appendBounded(current, chunk, maxBytes = maxCapturedOutputBytes) {
  const next = `${current}${chunk}`;
  if (Buffer.byteLength(next, "utf8") <= maxBytes) {
    return { text: next, truncated: false };
  }
  const buffer = Buffer.from(next, "utf8");
  return {
    text: buffer.subarray(buffer.length - maxBytes).toString("utf8"),
    truncated: true,
  };
}

function sendErrorMessage(commandPlan, { code, signal, stdout, stderr, timedOut, timeoutMs }) {
  const detail = stderr.trim() || stdout.trim();
  if (timedOut) {
    return `${commandPlan.command} did not finish within ${Math.round(timeoutMs / 1000)}s${detail ? `: ${detail}` : ""}`;
  }
  if (signal) {
    return `${commandPlan.command} exited after signal ${signal}${detail ? `: ${detail}` : ""}`;
  }
  return `${commandPlan.command} exited with ${code}${detail ? `: ${detail}` : ""}`;
}

export function buildAgentSendCommand({ agent, sessionId, cwd, message, fallbackCwd = process.cwd() } = {}) {
  const { normalizedAgent, normalizedSessionId, normalizedMessage } = validateAgentSendInput({ agent, sessionId, message });
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
      args: normalizedSessionId ? ["exec", ...codexUnattendedArgs, "resume", normalizedSessionId, "-"] : ["exec", ...codexUnattendedArgs, "-"],
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
    let timedOut = false;
    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;
    const startedAt = Date.now();
    let hardKillTimer = null;
    const child = spawn(commandPlan.command, commandPlan.args, {
      cwd: commandPlan.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      timedOut = true;
      child.kill("SIGTERM");
      hardKillTimer = setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, 2500);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const next = appendBounded(stdout, chunk);
      stdout = next.text;
      stdoutTruncated = stdoutTruncated || next.truncated;
    });
    child.stderr.on("data", (chunk) => {
      const next = appendBounded(stderr, chunk);
      stderr = next.text;
      stderrTruncated = stderrTruncated || next.truncated;
    });
    child.stdin.on("error", () => {
      // The child may exit quickly after accepting the prompt; the serve UI has
      // already handed the task off, so avoid surfacing an incidental pipe error.
    });
    child.on("spawn", () => {
      if (settled) {
        return;
      }
      if (commandPlan.stdin !== null) {
        child.stdin.end(commandPlan.stdin);
      } else {
        child.stdin.end();
      }
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      clearTimeout(hardKillTimer);
      reject(new Error(error.code === "ENOENT" ? `${commandPlan.command} command not found` : error.message));
    });
    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      clearTimeout(hardKillTimer);
      const result = {
        ok: code === 0 && !signal && !timedOut,
        command: commandPlan.command,
        target: commandPlan.target,
        cwd: commandPlan.cwd,
        pid: child.pid,
        status: code === 0 && !signal && !timedOut ? "completed" : "failed",
        code,
        signal,
        durationMs: Date.now() - startedAt,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        stdoutTruncated,
        stderrTruncated,
      };
      if (result.ok) {
        resolve(result);
        return;
      }
      const error = new Error(sendErrorMessage(commandPlan, { code, signal, stdout, stderr, timedOut, timeoutMs }));
      error.result = result;
      reject(error);
    });
  });
}
