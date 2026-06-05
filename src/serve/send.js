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

function outputTail(text, maxLength = 12_000) {
  const value = String(text ?? "").trim();
  return value.length <= maxLength ? value : value.slice(value.length - maxLength);
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

  const normalizedSessionId = requireText(sessionId, "sessionId");
  const normalizedMessage = requireText(message, "message");
  const workingDirectory = existingCwd(cwd, fallbackCwd);

  if (normalizedAgent === "claude") {
    return {
      command: "claude",
      args: ["--resume", normalizedSessionId, "--print", normalizedMessage],
      cwd: workingDirectory,
      stdin: null,
    };
  }

  if (normalizedAgent === "codex") {
    return {
      command: "codex",
      args: ["exec", "resume", normalizedSessionId, "-"],
      cwd: workingDirectory,
      stdin: normalizedMessage,
    };
  }

  return {
    command: "qodercli",
    args: ["--cwd", workingDirectory, "--resume", normalizedSessionId, "--print", normalizedMessage],
    cwd: workingDirectory,
    stdin: null,
  };
}

export function runAgentSend(input, { timeoutMs = Number(process.env.KAGE_SEND_TIMEOUT_MS) || 20 * 60 * 1000 } = {}) {
  const commandPlan = buildAgentSendCommand(input);
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const child = spawn(commandPlan.command, commandPlan.args, {
      cwd: commandPlan.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`Send timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(new Error(error.code === "ENOENT" ? `${commandPlan.command} command not found` : error.message));
    });
    child.on("exit", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({
          ok: true,
          command: commandPlan.command,
          cwd: commandPlan.cwd,
          stdout: outputTail(stdout),
          stderr: outputTail(stderr),
        });
        return;
      }
      reject(new Error(outputTail(stderr) || outputTail(stdout) || `${commandPlan.command} exited with ${code}`));
    });

    if (commandPlan.stdin !== null) {
      child.stdin.end(commandPlan.stdin);
    } else {
      child.stdin.end();
    }
  });
}
