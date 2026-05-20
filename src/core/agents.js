import os from "node:os";
import path from "node:path";

export const supportedAgents = ["claude", "codex", "qodercli"];

const agentRoots = {
  claude: path.join(os.homedir(), ".claude", "projects"),
  codex: path.join(os.homedir(), ".codex", "sessions"),
  qodercli: path.join(os.homedir(), ".qoder", "projects"),
};

const agentAliases = {
  c: "claude",
  x: "codex",
  q: "qodercli",
};

export function normalizeAgent(agent) {
  if (!agent) {
    return null;
  }
  const normalized = agent.toLowerCase();
  return agentAliases[normalized] ?? normalized;
}

export function formatAgentName(agent) {
  return normalizeAgent(agent) ?? agent ?? "unknown";
}

export function detectAgent(sessionPath) {
  const value = sessionPath.toLowerCase();
  if (value.includes("/.claude/")) {
    return "claude";
  }
  if (value.includes("/.codex/")) {
    return "codex";
  }
  if (value.includes("/.qoder/")) {
    return "qodercli";
  }
  return null;
}

export function getDefaultRoot(agent = "codex") {
  const resolvedAgent = normalizeAgent(agent);
  if (!resolvedAgent || !agentRoots[resolvedAgent]) {
    throw new Error(`Unsupported agent: ${agent ?? "unknown"}`);
  }
  return agentRoots[resolvedAgent];
}

export function listAgentRoots() {
  return { ...agentRoots };
}
