import os from "node:os";
import path from "node:path";

export const supportedAgents = ["claude", "codex", "qodercli", "qoderwork"];

const agentAliases = {
  c: "claude",
  x: "codex",
  q: "qodercli",
  qw: "qoderwork",
};

function agentRoots() {
  const home = os.homedir();
  return {
    claude: path.join(home, ".claude", "projects"),
    codex: path.join(home, ".codex", "sessions"),
    qodercli: path.join(home, ".qoder", "projects"),
    qoderwork: path.join(home, ".qoderwork", "projects"),
  };
}

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
  if (value.includes("/.qoderwork/")) {
    return "qoderwork";
  }
  if (value.includes("/.qoder/")) {
    return "qodercli";
  }
  return null;
}

export function getDefaultRoot(agent = "codex") {
  const resolvedAgent = normalizeAgent(agent);
  const roots = agentRoots();
  if (!resolvedAgent || !roots[resolvedAgent]) {
    throw new Error(`Unsupported agent: ${agent ?? "unknown"}`);
  }
  return roots[resolvedAgent];
}

export function listAgentRoots() {
  return agentRoots();
}
