#!/usr/bin/env node
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formatAgentName, getDefaultRoot, supportedAgents } from "./core/agents.js";
import { cleanDuplicateExports } from "./core/clean.js";
import { findSessionById } from "./core/discovery.js";
import { exportSession } from "./core/exporting.js";
import { sameOrSubpath, samePath, walk } from "./core/files.js";
import { resolveInstallPlan } from "./core/install.js";
import { readLineageMetadata } from "./core/lineage.js";
import { getExportCapability, inferDefaultExportFormat, routeAliases } from "./core/routing.js";
import { searchSessions } from "./core/search.js";
import { SessionMetadataCache, readSessionSummary } from "./core/session-cache.js";
import { compactSessionText } from "./core/session-labels.js";
import { buildClaudeResumeCommand, buildCodexResumeCommand, buildQoderResumeCommand } from "./core/resume-commands.js";
import { startServeCommand } from "./serve/index.js";

const shorthandAgents = ["c", "x", "q", "qw"];
const supportedRouteAliasList = Object.keys(routeAliases).join(", ");
const removedAgentNames = new Set(["qoder"]);
const agentUsage = "claude|codex|qodercli|qoderwork";

const helpText = `Usage:
  kage update
  kage doctor [--json]
  kage sessions [--agent ${agentUsage}] [--since 90d] [--until 2026-05-25] [--limit 120] [--include-subdirs] [--json]
  kage search [query] [--agent ${agentUsage}] [--since 7d] [--until 2026-05-25] [--project <path>] [--include-subdirs] [--limit 50] [--json]
  kage actions [--since 90d] [--until 2026-05-25] [--limit 120] [--include-subdirs] [--json]
  kage run-action <id> [--include-subdirs] [--json]
  kage serve [--port 9876] [--host 0.0.0.0] [--password <pin>] [--read-only]
  kage clean [--confirm] [--older-than 7d] [--json]
  kage completions bash|zsh|fish
  kage <agent>
  kage <source> <target> [options]
  kage <route-alias> [options]

Route aliases:
  x2x   codex -> codex
  x2c   codex -> claude
  x2q   codex -> qodercli
  x2v   codex -> visualize
  c2c   claude -> claude
  c2x   claude -> codex
  c2q   claude -> qodercli
  c2v   claude -> visualize
  q2q   qodercli -> qodercli
  q2x   qodercli -> codex
  q2c   qodercli -> claude
  q2v   qodercli -> visualize

QoderWork sessions are supported as a source via qoderwork/qw. Use explicit routes such as:
  kage qoderwork codex --session <path>
  kage qw claude --session <path>

Agent shorthands:
  x     codex
  c     claude
  q     qodercli
  qw    qoderwork

Options:
  --agent <agent>
  --target <agent>
  --session <path>
  --session-id <id>
  --out <path>
  --output-dir <dir>
  --export codex-session|claude-session|qoder-session|session-story-html
  --split-recent <n>
  --fork <prompt>
  --fork-file <path>
  --preview
  --run
  --older-than <duration>
  --since <date|duration>
  --until <date|duration>
  --limit <n>
  --project <path>
  --include-subdirs
  --port <number>
  --host <address>
  --password <pin>
  --read-only
  --allow-send
  --stdout
  --json
  --version
  --help`;

const completionCommands = [
  "update",
  "doctor",
  "sessions",
  "search",
  "actions",
  "run-action",
  "serve",
  "clean",
  "completions",
  ...supportedAgents,
  ...shorthandAgents,
  ...Object.keys(routeAliases),
];
const completionOptions = [
  "--agent",
  "--target",
  "--session",
  "--session-id",
  "--out",
  "--output-dir",
  "--export",
  "--split-recent",
  "--fork",
  "--fork-file",
  "--preview",
  "--run",
  "--older-than",
  "--since",
  "--until",
  "--limit",
  "--project",
  "--include-subdirs",
  "--port",
  "--host",
  "--password",
  "--read-only",
  "--allow-send",
  "--stdout",
  "--json",
  "--confirm",
  "--version",
  "--help",
];

function parsePositiveInteger(value, option) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${option} requires a positive integer, got: ${value ?? "(missing)"}`);
  }
  return parsed;
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

function readOptionValue(argv, index, option, { allowOptionValue = false } = {}) {
  const value = argv[index + 1];
  if (value === undefined || (!allowOptionValue && value.startsWith("--"))) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function applyPreset(args, preset) {
  return {
    ...args,
    agent: args.agent ?? preset.agent,
    target: args.target ?? preset.target,
  };
}

function parseArgs(argv) {
  const args = {
    update: false,
    doctor: false,
    sessions: false,
    search: false,
    searchQuery: null,
    desktopState: false,
    since: null,
    until: null,
    limit: null,
    project: null,
    includeSubdirs: false,
    actions: false,
    runActionId: null,
    serve: false,
    servePort: null,
    serveHost: null,
    servePassword: null,
    serveReadOnly: false,
    serveAllowSend: false,
    clean: false,
    cleanConfirm: false,
    cleanOlderThan: null,
    completions: null,
    version: false,
    listAgent: null,
    agent: null,
    root: null,
    session: null,
    sessionId: null,
    out: null,
    outputDir: null,
    target: null,
    routeAlias: null,
    exportFormat: null,
    splitRecent: null,
    forkPrompt: null,
    forkFile: null,
    preview: false,
    run: false,
    json: false,
    stdout: false,
    help: false,
    error: null,
  };
  const positional = [];

  if (argv.length === 0) {
    return { ...args, help: true };
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    try {
      if (arg === "--agent") {
        args.agent = readOptionValue(argv, i, arg);
        i += 1;
      } else if (arg === "--root") {
        args.root = readOptionValue(argv, i, arg);
        i += 1;
      } else if (arg === "--session") {
        args.session = readOptionValue(argv, i, arg);
        i += 1;
      } else if (arg === "--session-id") {
        args.sessionId = readOptionValue(argv, i, arg);
        i += 1;
      } else if (arg === "--out") {
        args.out = readOptionValue(argv, i, arg);
        i += 1;
      } else if (arg === "--output-dir") {
        args.outputDir = readOptionValue(argv, i, arg);
        i += 1;
      } else if (arg === "--target") {
        args.target = readOptionValue(argv, i, arg);
        i += 1;
      } else if (arg === "--export") {
        args.exportFormat = readOptionValue(argv, i, arg);
        i += 1;
      } else if (arg === "--split-recent") {
        args.splitRecent = parsePositiveInteger(readOptionValue(argv, i, arg), arg);
        i += 1;
      } else if (arg === "--fork") {
        args.forkPrompt = readOptionValue(argv, i, arg, { allowOptionValue: true });
        i += 1;
      } else if (arg === "--fork-file") {
        args.forkFile = readOptionValue(argv, i, arg);
        i += 1;
      } else if (arg === "--preview") {
        args.preview = true;
      } else if (arg === "--run") {
        args.run = true;
      } else if (arg === "--confirm") {
        args.cleanConfirm = true;
      } else if (arg === "--older-than") {
        args.cleanOlderThan = readOptionValue(argv, i, arg);
        i += 1;
      } else if (arg === "--since") {
        args.since = readOptionValue(argv, i, arg);
        i += 1;
      } else if (arg === "--until") {
        args.until = readOptionValue(argv, i, arg);
        i += 1;
      } else if (arg === "--limit") {
        args.limit = parsePositiveInteger(readOptionValue(argv, i, arg), arg);
        i += 1;
      } else if (arg === "--project") {
        args.project = readOptionValue(argv, i, arg);
        i += 1;
      } else if (arg === "--include-subdirs") {
        args.includeSubdirs = true;
      } else if (arg === "--port") {
        args.servePort = parsePositiveInteger(readOptionValue(argv, i, arg), arg);
        i += 1;
      } else if (arg === "--host") {
        args.serveHost = readOptionValue(argv, i, arg);
        i += 1;
      } else if (arg === "--password") {
        args.servePassword = readOptionValue(argv, i, arg, { allowOptionValue: true });
        i += 1;
      } else if (arg === "--allow-send") {
        args.serveAllowSend = true;
      } else if (arg === "--read-only") {
        args.serveReadOnly = true;
      } else if (arg === "--stdout") {
        args.stdout = true;
      } else if (arg === "--json") {
        args.json = true;
      } else if (arg === "--version" || arg === "-V") {
        args.version = true;
      } else if (arg === "--help" || arg === "-h") {
        args.help = true;
      } else if (arg.startsWith("-")) {
        args.error = `Unknown option: ${arg}\nRun 'kage --help' for usage information.`;
      } else {
        positional.push(arg);
      }
    } catch (error) {
      args.error = error.message;
    }

    if (args.error) {
      break;
    }
  }

  const [first, second] = positional;
  if ((args.cleanConfirm || args.cleanOlderThan) && first !== "clean") {
    return { ...args, error: "--confirm and --older-than are only supported with kage clean" };
  }
  if (
    (args.servePort || args.serveHost || args.servePassword || args.serveAllowSend || args.serveReadOnly) &&
    first !== "serve"
  ) {
    return {
      ...args,
      error: "--port, --host, --password, --read-only, and --allow-send are only supported with kage serve",
    };
  }
  if ((args.since || args.until || args.limit) && !["sessions", "search", "actions", "desktop-state"].includes(first)) {
    return {
      ...args,
      error: "--since, --until, and --limit are only supported with kage sessions, search, actions, and desktop-state",
    };
  }
  if (args.project && first !== "search") {
    return { ...args, error: "--project is only supported with kage search" };
  }
  if ([args.agent, args.target].some((value) => removedAgentNames.has(value))) {
    return { ...args, error: "Unsupported agent: qoder. Use qodercli instead." };
  }
  if (first === "update" && !second) {
    return { ...args, update: true };
  }
  if (first === "doctor") {
    if (second) {
      return { ...args, error: "Usage: kage doctor [--json]" };
    }
    return { ...args, doctor: true };
  }
  if (first === "sessions") {
    if (second) {
      return {
        ...args,
        error:
          `Usage: kage sessions [--agent ${agentUsage}] [--since 90d] [--until 2026-05-25] [--limit 120] [--include-subdirs] [--json]`,
      };
    }
    return { ...args, sessions: true };
  }
  if (first === "search") {
    if (positional.length > 2) {
      return {
        ...args,
        error:
          `Usage: kage search [query] [--agent ${agentUsage}] [--since 7d] [--until 2026-05-25] [--project <path>] [--include-subdirs] [--limit 50] [--json]`,
      };
    }
    return { ...args, search: true, searchQuery: second ?? null };
  }
  if (first === "actions") {
    if (second) {
      return {
        ...args,
        error: "Usage: kage actions [--since 90d] [--until 2026-05-25] [--limit 120] [--include-subdirs] [--json]",
      };
    }
    return { ...args, actions: true };
  }
  if (first === "desktop-state") {
    if (second) {
      return {
        ...args,
        error: "Usage: kage desktop-state [--since 90d] [--until 2026-05-25] [--limit 120] [--include-subdirs] [--json]",
      };
    }
    return { ...args, desktopState: true, json: true };
  }
  if (first === "run-action") {
    if (!second || positional.length > 2) {
      return { ...args, error: "Usage: kage run-action <id> [--include-subdirs] [--json]" };
    }
    return { ...args, runActionId: second };
  }
  if (first === "serve") {
    if (second) {
      return { ...args, error: "Usage: kage serve [--port 9876] [--host 0.0.0.0] [--password <pin>] [--read-only]" };
    }
    if (args.serveAllowSend && args.serveReadOnly) {
      return { ...args, error: "--allow-send and --read-only are mutually exclusive" };
    }
    return { ...args, serve: true };
  }
  if (first === "clean") {
    if (second) {
      return { ...args, error: "Usage: kage clean [--confirm] [--older-than 7d] [--json]" };
    }
    return { ...args, clean: true };
  }
  if (first === "completions") {
    if (!second || positional.length > 2) {
      return { ...args, error: "Usage: kage completions bash|zsh|fish" };
    }
    return { ...args, completions: second };
  }
  if (positional.some((value) => removedAgentNames.has(value))) {
    return { ...args, error: "Unsupported agent: qoder. Use qodercli instead." };
  }
  if (first && !second && (supportedAgents.includes(first) || shorthandAgents.includes(first))) {
    return { ...args, listAgent: first };
  }
  if (first && routeAliases[first]) {
    return inferDefaultExportFormat({
      ...applyPreset(args, routeAliases[first]),
      routeAlias: first,
    });
  }
  if (first && !second && /^[a-z]2[a-z]$/u.test(first)) {
    return {
      ...args,
      error: `Unknown route alias: ${first}. Supported aliases: ${supportedRouteAliasList}\nRun: kage update`,
    };
  }
  if (
    first &&
    second &&
    (supportedAgents.includes(first) || shorthandAgents.includes(first)) &&
    (supportedAgents.includes(second) || shorthandAgents.includes(second))
  ) {
    return inferDefaultExportFormat(applyPreset(args, { agent: first, target: second }));
  }

  return inferDefaultExportFormat(args);
}

async function resolveForkPrompt(args) {
  if (args.forkPrompt && args.forkFile) {
    throw new Error("Use either --fork or --fork-file, not both");
  }

  if (args.forkFile) {
    const content = await fs.readFile(args.forkFile, "utf8");
    return content.trim();
  }

  return args.forkPrompt;
}

export async function runUpdateCommand({
  command = process.env.KAGE_UPDATE_COMMAND ?? "curl -fsSL https://raw.githubusercontent.com/farmcan/kage/main/install.sh | bash",
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const shell = process.env.SHELL || "sh";
  await new Promise((resolve, reject) => {
    const child = spawn(shell, ["-lc", command], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    child.stdout.on("data", (chunk) => {
      stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Update failed with exit code ${code}`));
    });
  });
}

export async function runResumeCommand({
  command,
  commandOverride = process.env.KAGE_RUN_COMMAND,
  capture = false,
} = {}) {
  const shell = process.env.SHELL || "sh";
  const commandToRun = commandOverride ?? command;
  if (!commandToRun) {
    throw new Error("--run requires a resume command");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(shell, ["-lc", commandToRun], {
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`Run failed with exit code ${code}`));
    });
  });
}

async function runCliCommand(args, { capture = false } = {}) {
  const cliPath = fileURLToPath(import.meta.url);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`Action failed with exit code ${code}`));
    });
  });
}

async function getCliVersion() {
  const packagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const packageJson = JSON.parse(await fs.readFile(packagePath, "utf8"));
  return packageJson.version;
}

function commandForAgent(agent) {
  if (agent === "claude") {
    return "claude";
  }
  if (agent === "codex") {
    return "codex";
  }
  if (agent === "qodercli") {
    return "qodercli";
  }
  if (agent === "qoderwork") {
    return null;
  }
  return agent;
}

function nativeResumeExample(agent) {
  if (agent === "claude") {
    return "cd <cwd> && claude --resume <session-id>";
  }
  if (agent === "codex") {
    return "codex resume <session-id>";
  }
  if (agent === "qodercli") {
    return "qodercli --cwd <working-dir> --resume <session-id>";
  }
  return null;
}

function nativeForkExample(agent) {
  if (agent === "claude") {
    return "cd <cwd> && claude --resume <session-id> --fork-session";
  }
  if (agent === "codex") {
    return "codex fork <session-id>";
  }
  return null;
}

function commandTimeoutMs() {
  const configured = Number(process.env.KAGE_COMMAND_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return 2500;
}

async function captureCommand(command, args = ["--version"], { timeoutMs = commandTimeoutMs() } = {}) {
  if (!command) {
    return { ok: true, exists: true, version: null, optional: true, error: null };
  }
  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      resolve({ ok: false, error: "timed out" });
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
      resolve({ exists: false, ok: false, error: error.code === "ENOENT" ? "not found" : error.message });
    });
    child.on("exit", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const output = `${stdout}\n${stderr}`
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean);
      resolve({
        exists: true,
        ok: code === 0,
        code,
        version: output ?? null,
        ...(code === 0 ? {} : { error: output ?? `exit code ${code}` }),
      });
    });
  });
}

async function inspectSessionRoot(rootDir) {
  const result = {
    path: rootDir,
    exists: false,
    readable: false,
    writable: false,
  };

  try {
    await fs.access(rootDir, fsConstants.F_OK);
    result.exists = true;
  } catch {
    return result;
  }

  try {
    await fs.access(rootDir, fsConstants.R_OK);
    result.readable = true;
  } catch {
    result.readable = false;
  }

  try {
    await fs.access(rootDir, fsConstants.W_OK);
    result.writable = true;
  } catch {
    result.writable = false;
  }

  return result;
}

function generateCompletion(shell) {
  const commands = completionCommands.join(" ");
  const options = completionOptions.join(" ");
  const agents = supportedAgents.join(" ");
  const shells = "bash zsh fish";
  const exportFormats = "codex-session claude-session qoder-session session-story-html";

  if (shell === "bash") {
    return `_kage_completions() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  case "$prev" in
    --agent|--target)
      COMPREPLY=($(compgen -W "${agents}" -- "$cur"))
      return 0
      ;;
    --export)
      COMPREPLY=($(compgen -W "${exportFormats}" -- "$cur"))
      return 0
      ;;
    completions)
      COMPREPLY=($(compgen -W "${shells}" -- "$cur"))
      return 0
      ;;
  esac

  COMPREPLY=($(compgen -W "${commands} ${options}" -- "$cur"))
}
complete -F _kage_completions kage
`;
  }

  if (shell === "zsh") {
    return `#compdef kage

_kage() {
  local -a commands options agents exports shells
  commands=(${commands})
  options=(${options})
  agents=(${agents})
  exports=(${exportFormats})
  shells=(${shells})

  case "$words[CURRENT-1]" in
    --agent|--target)
      _describe 'agent' agents
      ;;
    --export)
      _describe 'export format' exports
      ;;
    completions)
      _describe 'shell' shells
      ;;
    *)
      _describe 'command' commands
      _describe 'option' options
      ;;
  esac
}

_kage "$@"
`;
  }

  if (shell === "fish") {
    return `complete -c kage -f -a "${commands}"
complete -c kage -l agent -x -a "${agents}"
complete -c kage -l target -x -a "${agents}"
complete -c kage -l export -x -a "${exportFormats}"
complete -c kage -l session -r
complete -c kage -l session-id -r
complete -c kage -l out -r
complete -c kage -l output-dir -r
complete -c kage -l split-recent -r
complete -c kage -l fork -r
complete -c kage -l fork-file -r
complete -c kage -l since -r
complete -c kage -l until -r
complete -c kage -l project -r
complete -c kage -l include-subdirs
complete -c kage -l port -r
complete -c kage -l host -r
complete -c kage -l password -r
complete -c kage -l allow-send
complete -c kage -l read-only
complete -c kage -l preview
complete -c kage -l run
complete -c kage -l older-than -r
complete -c kage -l stdout
complete -c kage -l json
complete -c kage -l confirm
complete -c kage -l version
complete -c kage -l help
`;
  }

  throw new Error(`Unsupported completion shell: ${shell}. Use bash, zsh, or fish.`);
}

function emitResult(payload, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (Array.isArray(payload.paths)) {
    process.stdout.write(`${payload.paths.join("\n")}\n`);
  }

  if (payload.resumeCommand) {
    process.stdout.write(`Run:\n${payload.resumeCommand}\n`);
  }

  if (Array.isArray(payload.hints) && payload.hints.length > 0) {
    process.stdout.write(`Hint:\n${payload.hints.join("\n")}\n`);
  }
}

function compactPreviewText(text, maxLength = 120) {
  const normalized = String(text ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function formatExportPreview({ exported, installPlan, hints = [] }) {
  const lines = [
    "Export preview",
    `Source: ${exported.sourceAgent}`,
    `Target: ${exported.targetAgent}`,
    `Format: ${exported.mode}`,
    `Session: ${exported.sessionId}`,
    `Source file: ${exported.sessionPath}`,
    `Messages: ${exported.session.messages.length}`,
    "Output files:",
  ];

  for (const file of installPlan.files) {
    lines.push(`- ${file.path}`);
  }

  if (installPlan.resumeCommand) {
    lines.push("Resume command:");
    lines.push(installPlan.resumeCommand);
  }

  if (hints.length > 0) {
    lines.push("Hints:");
    lines.push(...hints);
  }

  lines.push("Message preview:");
  for (const [index, message] of exported.session.messages.entries()) {
    lines.push(`${index + 1}. ${message.role}: ${compactPreviewText(message.text)}`);
  }

  return `${lines.join("\n")}\n`;
}

function buildNativeForkHints({ exported }) {
  if (exported.sourceAgent === "claude" && exported.targetAgent === "claude") {
    return [
      `Claude Code supports native forks now: ${buildClaudeResumeCommand(exported.session.sessionId, exported.session.cwd, ["--fork-session"])}`,
      "Inside Claude Code, use /branch; /fork is an alias.",
    ];
  }

  if (exported.sourceAgent === "codex" && exported.targetAgent === "codex") {
    return [
      `Codex supports native forks now: codex fork ${exported.session.sessionId}`,
      "Use codex fork --last to fork the most recent session.",
    ];
  }

  return [];
}

function formatCleanResult(result, asJson) {
  if (asJson) {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const lines = [
    result.dryRun ? "Dry run. Use --confirm to delete duplicate session exports." : "Deleted duplicate session exports.",
    `Scanned: ${result.scannedFiles} session files`,
  ];

  if (result.deleteCandidates.length === 0) {
    lines.push("No duplicate or stale session exports found.");
    return `${lines.join("\n")}\n`;
  }

  lines.push(`Freed: ${formatBytes(result.freedBytes)}`);

  if (result.duplicateGroups.length > 0) {
    lines.push("Duplicate exports:");
    for (const group of result.duplicateGroups) {
      lines.push(`- ${formatSessionLabel(group.agent)} ${group.sessionId}`);
      lines.push(`  Keep: ${group.keep.path}`);
      for (const file of group.remove) {
        lines.push(`  Remove: ${file.path}`);
      }
    }
  }

  if (result.staleCandidates.length > 0) {
    lines.push("Stale exports:");
    for (const file of result.staleCandidates) {
      lines.push(`- ${file.path}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function buildDoctorResult(args = {}) {
  const version = await getCliVersion();
  const agents = await Promise.all(
    supportedAgents.map(async (agent) => {
      const command = commandForAgent(agent);
      const commandStatus = await captureCommand(command);
      const sessionRoot = await inspectSessionRoot(getDefaultRoot(agent));
      const installed = commandStatus.exists ?? commandStatus.ok;
      return {
        agent,
        label: formatSessionLabel(agent),
        command,
        installed,
        version: commandStatus.version ?? null,
        commandRequired: !commandStatus.optional,
        commandError: installed && commandStatus.ok ? null : commandStatus.error,
        sessionRoot,
        sessionRootRequired: command !== null,
        resumeCommand: nativeResumeExample(agent),
        forkCommand: nativeForkExample(agent),
      };
    }),
  );

  return {
    mode: "doctor",
    ok: agents.every(
      (agent) =>
        (!agent.commandRequired || agent.installed) &&
        (!agent.sessionRootRequired || (agent.sessionRoot.exists && agent.sessionRoot.readable)),
    ),
    cwd: process.cwd(),
    kageVersion: version,
    agents,
  };
}

function formatDoctorResult(result, asJson) {
  if (asJson) {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const lines = [`KAGE doctor: ${result.ok ? "ready" : "attention needed"}`, `Version: ${result.kageVersion}`, `CWD: ${result.cwd}`];
  for (const agent of result.agents) {
    const commandStatus =
      agent.command == null
        ? "not required"
        : agent.installed
          ? agent.version ?? "installed"
          : `missing (${agent.commandError})`;
    const rootStatus = agent.sessionRoot.exists
      ? `${agent.sessionRoot.readable ? "readable" : "not readable"}, ${agent.sessionRoot.writable ? "writable" : "not writable"}`
      : agent.sessionRootRequired
        ? "missing"
        : "missing, optional";
    lines.push("");
    lines.push(`${agent.label}`);
    lines.push(agent.command == null ? "  Command: not required (desktop app source)" : `  Command: ${agent.command} (${commandStatus})`);
    lines.push(`  Session root: ${agent.sessionRoot.path} (${rootStatus})`);
    if (agent.resumeCommand) {
      lines.push(`  Resume: ${agent.resumeCommand}`);
    }
    if (agent.forkCommand) {
      lines.push(`  Fork: ${agent.forkCommand}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function formatBytes(value) {
  const bytes = Number(value ?? 0);
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kib = bytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(1)} KiB`;
  }
  return `${(kib / 1024).toFixed(1)} MiB`;
}

function formatSessionTitle(title, maxLength = Number.POSITIVE_INFINITY) {
  return compactSessionText(title, { maxLength });
}

function formatSessionCandidate(candidate, index) {
  const title = formatSessionTitle(candidate.title);
  const updatedAt = candidate.updatedAt ?? "unknown time";
  const recentMessages = Array.isArray(candidate.recentUserMessages) ? candidate.recentUserMessages : [];
  const recentSection =
    recentMessages.length > 0
      ? `\n    Recent user messages:\n${recentMessages.map((message) => `    - ${message}`).join("\n")}`
      : "";
  return [
    `[${index + 1}] ${title}`,
    `    Updated: ${updatedAt}`,
    `    Session: ${candidate.sessionId}`,
    `    Path: ${candidate.sessionPath}${recentSection}`,
  ].join("\n");
}

function formatSessionCandidates(candidates) {
  return candidates.map(formatSessionCandidate).join("\n\n\n");
}

function emitSelectedSession(output, candidate) {
  output.write(`${formatSessionCandidate(candidate, 0)}\n`);
  output.write(`Selected: ${candidate.sessionId}\n`);
}

export async function chooseSessionPath(
  agentLabel,
  candidates,
  {
    isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
    output = process.stderr,
    prompt = null,
  } = {},
) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error(`No ${agentLabel} session candidates available`);
  }

  if (candidates.length === 1) {
    emitSelectedSession(output, candidates[0]);
    return candidates[0].sessionPath;
  }

  if (!isInteractive) {
    const options = formatSessionCandidates(candidates);
    throw new Error(
      `Multiple ${agentLabel} sessions match the current directory.\n${options}\nUse --session-id to choose one explicitly.`,
    );
  }

  output.write(`Multiple ${agentLabel} sessions match the current directory:\n`);
  output.write(`\n${formatSessionCandidates(candidates)}\n`);

  const ask = prompt ?? (async () => {
    output.write(`Select a session [1-${candidates.length}]: `);
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
      if (String(chunk).includes("\n")) {
        break;
      }
    }
    return chunks.join("").trim();
  });

  while (true) {
    const answer = String(await ask()).trim();
    const selectedIndex = Number(answer);
    if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= candidates.length) {
      return candidates[selectedIndex - 1].sessionPath;
    }
    output.write(`Invalid selection. Choose a number between 1 and ${candidates.length}.\n`);
  }
}

export async function chooseClaudeSessionPath(candidates, options = {}) {
  return chooseSessionPath("Claude", candidates, options);
}

function formatSessionLabel(agent) {
  const value = formatAgentName(agent);
  if (value === "qodercli") {
    return "QoderCLI";
  }
  if (value === "qoderwork") {
    return "QoderWork";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function saveSessionCache(cache) {
  try {
    await cache?.save();
  } catch {
    // Cache writes are an optimization; session discovery should stay best-effort.
  }
}

async function matchesCurrentCwd(sessionCwd, cwd, { includeSubdirs = false } = {}) {
  if (!sessionCwd) {
    return false;
  }
  return includeSubdirs ? sameOrSubpath(sessionCwd, cwd) : samePath(sessionCwd, cwd);
}

async function buildSessionCandidates(args, options = {}) {
  const rootDir = args.root ?? getDefaultRoot(args.agent ?? "codex");
  const resolvedAgent = formatAgentName(args.agent ?? "codex");
  const sinceDate = parseDateFilter(args.since, { option: "--since" });
  const untilDate = parseDateFilter(args.until, { option: "--until", boundary: "end" });
  const cwd = process.cwd();
  const cache = options.sessionCache ?? (await SessionMetadataCache.load());
  const ownsCache = !options.sessionCache;
  const candidates = [];

  try {
    const files = await walk(rootDir);
    if (files.length === 0) {
      throw new Error(`No session files found in ${rootDir}`);
    }

    const orderedFiles = files.sort().reverse();
    for (const sessionPath of orderedFiles) {
      const summary = await readSessionSummary(sessionPath, resolvedAgent, cache);
      if (!(await matchesCurrentCwd(summary.cwd, cwd, { includeSubdirs: args.includeSubdirs }))) {
        continue;
      }
      if (!isWithinDateRange(summary.updatedAt, sinceDate, untilDate)) {
        continue;
      }

      const summaryPath = summary.sessionPath ?? sessionPath;
      candidates.push({
        agent: resolvedAgent,
        agentLabel: formatSessionLabel(resolvedAgent),
        sessionPath: summaryPath,
        sessionId: summary.sessionId,
        cwd: summary.cwd,
        updatedAt: summary.updatedAt,
        title: summary.title,
        shortTitle: summary.shortTitle,
        recentUserMessages: summary.recentUserMessages ?? [],
        lineage: await readLineageMetadata(summaryPath),
      });

      if (args.limit && candidates.length >= args.limit) {
        break;
      }
    }
  } finally {
    if (ownsCache) {
      await saveSessionCache(cache);
    }
  }

  return candidates.sort((left, right) => Date.parse(right.updatedAt ?? 0) - Date.parse(left.updatedAt ?? 0));
}

function toSessionPayload(candidate) {
  return {
    agent: candidate.agent,
    agentLabel: candidate.agentLabel,
    sessionId: candidate.sessionId,
    title: candidate.title,
    shortTitle: candidate.shortTitle,
    updatedAt: candidate.updatedAt ?? null,
    cwd: candidate.cwd,
    path: candidate.sessionPath,
    recentUserMessages: candidate.recentUserMessages,
    lineage: candidate.lineage ?? null,
  };
}

async function buildSessionInventory(args = {}) {
  const agents = args.agent ? [formatAgentName(args.agent)] : supportedAgents;
  if (args.root && agents.length !== 1) {
    throw new Error("--root requires --agent with kage sessions or kage actions");
  }

  const groups = [];
  const errors = [];
  const sessionCache = await SessionMetadataCache.load();
  try {
    for (const agent of agents) {
      try {
        const root = args.root ?? getDefaultRoot(agent);
        const candidates = await buildSessionCandidates({ ...args, agent, root }, { sessionCache });
        groups.push({
          agent,
          agentLabel: formatSessionLabel(agent),
          root,
          sessions: candidates.map(toSessionPayload),
        });
      } catch (error) {
        errors.push({
          agent,
          agentLabel: formatSessionLabel(agent),
          root: args.root ?? getDefaultRoot(agent),
          error: error.message,
        });
      }
    }
  } finally {
    await saveSessionCache(sessionCache);
  }

  if (args.limit) {
    const selectedPaths = new Set(
      groups
        .flatMap((group) => group.sessions)
        .sort((left, right) => Date.parse(right.updatedAt ?? 0) - Date.parse(left.updatedAt ?? 0))
        .slice(0, args.limit)
        .map((session) => session.path),
    );
    for (const group of groups) {
      group.sessions = group.sessions.filter((session) => selectedPaths.has(session.path));
    }
  }

  return {
    mode: "sessions",
    cwd: process.cwd(),
    includeSubdirs: Boolean(args.includeSubdirs),
    filters: {
      since: parseDateFilter(args.since, { option: "--since" })?.toISOString() ?? null,
      until: parseDateFilter(args.until, { option: "--until", boundary: "end" })?.toISOString() ?? null,
      limit: args.limit ?? null,
    },
    sessions: groups.flatMap((group) => group.sessions),
    agents: groups,
    errors,
  };
}

function formatSessionsResult(result, asJson) {
  if (asJson) {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const scope = result.includeSubdirs ? `${result.cwd} and subdirectories` : result.cwd;
  const lines = [`Matching sessions for ${scope}:`];
  for (const group of result.agents) {
    lines.push("");
    lines.push(`${group.agentLabel}`);
    if (group.sessions.length === 0) {
      lines.push("  No matching sessions.");
      continue;
    }
    for (const [index, session] of group.sessions.entries()) {
      lines.push(`  [${index + 1}] ${session.shortTitle ?? formatSessionTitle(session.title, 60)}`);
      lines.push(`      Updated: ${session.updatedAt ?? "unknown time"}`);
      lines.push(`      Session: ${session.sessionId}`);
      lines.push(`      Path: ${session.path}`);
      if (session.recentUserMessages.length > 0) {
        lines.push("      Recent user messages:");
        for (const message of session.recentUserMessages) {
          lines.push(`      - ${message}`);
        }
      }
    }
  }

  for (const error of result.errors) {
    lines.push("");
    lines.push(`${error.agentLabel}: ${error.error}`);
  }

  return `${lines.join("\n")}\n`;
}

function formatSearchResult(result, asJson) {
  if (asJson) {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const title = result.query ? `Search results for "${result.query}"` : "Search results";
  const lines = [`${title}:`];
  if (result.results.length === 0) {
    lines.push("No matching sessions found.");
  }

  for (const [index, session] of result.results.entries()) {
    lines.push("");
    lines.push(`[${index + 1}] ${session.agentLabel} ${session.shortTitle ?? formatSessionTitle(session.title, 60)}`);
    lines.push(`    Updated: ${session.updatedAt ?? "unknown time"}`);
    lines.push(`    Session: ${session.sessionId}`);
    lines.push(`    Project: ${session.cwd}`);
    lines.push(`    Path: ${session.path}`);
    if (session.match) {
      lines.push(`    Match: ${session.match.field}: ${session.match.text}`);
    }
    if (session.recentUserMessages.length > 0) {
      lines.push("    Recent user messages:");
      for (const message of session.recentUserMessages) {
        lines.push(`    - ${message}`);
      }
    }
  }

  const errors = result.agents.filter((agent) => agent.error);
  for (const error of errors) {
    lines.push("");
    lines.push(`${formatSessionLabel(error.agent)}: ${error.error}`);
  }

  return `${lines.join("\n")}\n`;
}

function routeAliasForAgent(agent, suffix) {
  if (agent === "qoderwork") {
    return null;
  }
  const prefix = agent === "claude" ? "c" : agent === "codex" ? "x" : "q";
  return `${prefix}2${suffix}`;
}

function routeSuffixForAgent(agent) {
  if (agent === "claude") {
    return "c";
  }
  if (agent === "codex") {
    return "x";
  }
  return "q";
}

function routeAliasBetweenAgents(sourceAgent, targetAgent) {
  return routeAliasForAgent(sourceAgent, routeSuffixForAgent(targetAgent));
}

function buildResumeCommandForSession(session) {
  if (session.agent === "claude") {
    return buildClaudeResumeCommand(session.sessionId, session.cwd);
  }
  if (session.agent === "codex") {
    return buildCodexResumeCommand(session.sessionId);
  }
  if (session.agent === "qodercli") {
    return buildQoderResumeCommand(session.sessionId, session.cwd);
  }
  return null;
}

function buildActionList(inventory) {
  const actions = [];

  for (const group of inventory.agents) {
    for (const [index, session] of group.sessions.entries()) {
      const isLatest = index === 0;
      const sessionTitle = session.shortTitle ?? formatSessionTitle(session.title, 60);
      const resumeCommand = buildResumeCommandForSession(session);
      if (resumeCommand) {
        actions.push({
          id: `resume:${session.agent}:${session.sessionId}`,
          type: "resume",
          label: isLatest
            ? `Resume latest ${formatSessionLabel(session.agent)} session`
            : `Resume ${formatSessionLabel(session.agent)} session: ${sessionTitle}`,
          agent: session.agent,
          sessionId: session.sessionId,
          sessionPath: session.path,
          command: resumeCommand,
          isLatest,
        });
      }

      const forkAlias = routeAliasBetweenAgents(session.agent, session.agent);
      if (forkAlias && getExportCapability(session.agent, session.agent)?.fork) {
        actions.push({
          id: `fork:${forkAlias}:${session.sessionId}`,
          type: "fork",
          label: isLatest
            ? `Fork latest ${formatSessionLabel(session.agent)} session into a new session`
            : `Fork ${formatSessionLabel(session.agent)} session into a new session: ${sessionTitle}`,
          agent: session.agent,
          targetAgent: session.agent,
          sessionId: session.sessionId,
          sessionPath: session.path,
          routeAlias: forkAlias,
          cliArgs: [forkAlias, "--session", session.path],
          isLatest,
        });
      }

      const replayAlias = routeAliasForAgent(session.agent, "v");
      const replayCliArgs = replayAlias
        ? [replayAlias, "--session", session.path]
        : [session.agent, session.agent, "--export", "session-story-html", "--session", session.path];
      actions.push({
        id: `replay:${replayAlias ?? session.agent}:${session.sessionId}`,
        type: "replay",
        label: isLatest
          ? `Open replay story for latest ${formatSessionLabel(session.agent)} session`
          : `Open replay story for ${formatSessionLabel(session.agent)} session: ${sessionTitle}`,
        agent: session.agent,
        sessionId: session.sessionId,
        sessionPath: session.path,
        routeAlias: replayAlias,
        cliArgs: replayCliArgs,
        isLatest,
      });

      for (const targetAgent of supportedAgents.filter((agent) => agent !== session.agent && getExportCapability(session.agent, agent))) {
        const routeAlias = routeAliasBetweenAgents(session.agent, targetAgent);
        const bridgeCliArgs = routeAlias
          ? [routeAlias, "--session", session.path]
          : [session.agent, targetAgent, "--session", session.path];
        actions.push({
          id: `bridge:${routeAlias ?? `${session.agent}:${targetAgent}`}:${session.sessionId}`,
          type: "bridge",
          label: isLatest
            ? `Bridge latest ${formatSessionLabel(session.agent)} session to ${formatSessionLabel(targetAgent)}`
            : `Bridge ${formatSessionLabel(session.agent)} session to ${formatSessionLabel(targetAgent)}: ${sessionTitle}`,
          agent: session.agent,
          targetAgent,
          sessionId: session.sessionId,
          sessionPath: session.path,
          routeAlias,
          cliArgs: bridgeCliArgs,
          isLatest,
        });
      }
    }
  }

  return actions;
}

async function buildActionsResult(args = {}) {
  const inventory = await buildSessionInventory(args);
  return {
    mode: "actions",
    cwd: inventory.cwd,
    actions: buildActionList(inventory),
    errors: inventory.errors,
  };
}

async function buildDesktopStateResult(args = {}) {
  const inventory = await buildSessionInventory(args);
  return {
    mode: "desktop-state",
    cwd: inventory.cwd,
    sessions: inventory.sessions,
    agents: inventory.agents,
    actions: buildActionList(inventory),
    errors: inventory.errors,
  };
}

function formatActionsResult(result, asJson) {
  if (asJson) {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const lines = [`KAGE actions for ${result.cwd}:`];
  if (result.actions.length === 0) {
    lines.push("No actions available for this project.");
  }
  for (const action of result.actions) {
    lines.push(`- ${action.id}`);
    lines.push(`  ${action.label}`);
    if (action.command) {
      lines.push(`  ${action.command}`);
    }
  }
  for (const error of result.errors) {
    lines.push(`- ${error.agentLabel}: ${error.error}`);
  }
  return `${lines.join("\n")}\n`;
}

function parseDelegatedJson(stdout) {
  const text = stdout.trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function runAction(args) {
  const result = await buildActionsResult(args);
  const action = result.actions.find((candidate) => candidate.id === args.runActionId);
  if (!action) {
    throw new Error(`Unknown action id: ${args.runActionId}`);
  }

  let output = { stdout: "", stderr: "" };
  let delegatedResult = null;
  if (action.type === "resume") {
    output = await runResumeCommand({ command: action.command, capture: args.json });
  } else if (Array.isArray(action.cliArgs)) {
    const cliArgs = args.json ? [...action.cliArgs, "--json"] : action.cliArgs;
    output = await runCliCommand(cliArgs, { capture: args.json });
    if (args.json) {
      delegatedResult = parseDelegatedJson(output.stdout);
    }
  } else {
    throw new Error(`Unsupported action type: ${action.type}`);
  }

  if (args.json) {
    const resumeCommand = delegatedResult?.resumeCommand ?? (action.type === "resume" ? action.command : null);
    const outputPath = delegatedResult?.outputPath ?? null;
    const sidecarPath = delegatedResult?.sidecarPath ?? null;
    const lineagePath = delegatedResult?.lineagePath ?? null;
    const paths = delegatedResult?.paths ?? [];
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: "run-action",
          cwd: result.cwd,
          actionId: action.id,
          action,
          executed: true,
          ok: true,
          sourceAgent: delegatedResult?.sourceAgent ?? action.agent,
          targetAgent: delegatedResult?.targetAgent ?? action.targetAgent ?? action.agent,
          sessionId: delegatedResult?.sessionId ?? action.sessionId ?? null,
          sessionPath: delegatedResult?.sessionPath ?? action.sessionPath ?? null,
          ...(resumeCommand ? { resumeCommand } : {}),
          ...(outputPath ? { outputPath } : {}),
          ...(sidecarPath ? { sidecarPath } : {}),
          ...(lineagePath ? { lineagePath } : {}),
          paths,
          ...(delegatedResult ? { result: delegatedResult } : {}),
          stdout: output.stdout,
          stderr: output.stderr,
        },
        null,
        2,
      )}\n`,
    );
  }
}

async function resolveSessionPath(args) {
  const rootDir = args.root ?? getDefaultRoot(args.agent ?? "codex");
  if (args.session) {
    return args.session;
  }
  if (args.sessionId) {
    return findSessionById(rootDir, {
      sessionId: args.sessionId,
      agent: args.agent ?? "codex",
    });
  }

  const candidates = await buildSessionCandidates(args);
  if (candidates.length > 0) {
    return chooseSessionPath(formatSessionLabel(args.agent ?? "codex"), candidates);
  }

  throw new Error(
    `No ${formatSessionLabel(args.agent ?? "codex")} sessions match the current directory: ${process.cwd()}\nUse --session or --session-id to specify a session explicitly.`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    throw new Error(args.error);
  }
  if (args.version) {
    process.stdout.write(`kage ${await getCliVersion()}\n`);
    return;
  }
  if (args.help) {
    process.stdout.write(`${helpText}\n`);
    return;
  }
  if (args.update) {
    await runUpdateCommand();
    return;
  }
  if (args.doctor) {
    const result = await buildDoctorResult(args);
    process.stdout.write(formatDoctorResult(result, args.json));
    return;
  }
  if (args.sessions) {
    const result = await buildSessionInventory(args);
    process.stdout.write(formatSessionsResult(result, args.json));
    return;
  }
  if (args.search) {
    const result = await searchSessions({
      query: args.searchQuery,
      agent: args.agent,
      root: args.root,
      since: args.since,
      until: args.until,
      project: args.project,
      includeSubdirs: args.includeSubdirs,
      limit: args.limit ?? undefined,
    });
    process.stdout.write(formatSearchResult(result, args.json));
    return;
  }
  if (args.actions) {
    const result = await buildActionsResult(args);
    process.stdout.write(formatActionsResult(result, args.json));
    return;
  }
  if (args.desktopState) {
    const result = await buildDesktopStateResult(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (args.runActionId) {
    await runAction(args);
    return;
  }
  if (args.serve) {
    await startServeCommand({
      port: args.servePort ?? undefined,
      host: args.serveHost ?? undefined,
      password: args.servePassword,
      allowSend: !args.serveReadOnly,
    });
    return;
  }
  if (args.clean) {
    const result = await cleanDuplicateExports({ confirm: args.cleanConfirm, olderThan: args.cleanOlderThan });
    process.stdout.write(formatCleanResult(result, args.json));
    return;
  }
  if (args.completions) {
    process.stdout.write(generateCompletion(args.completions));
    return;
  }
  if (args.listAgent) {
    const resolvedAgent = formatAgentName(args.listAgent);
    const candidates = await buildSessionCandidates({ ...args, agent: resolvedAgent });
    if (candidates.length === 0) {
      throw new Error(`No ${formatSessionLabel(resolvedAgent)} sessions match the current directory`);
    }
    process.stdout.write(`Matching ${formatSessionLabel(resolvedAgent)} sessions for ${process.cwd()}:\n\n`);
    process.stdout.write(`${formatSessionCandidates(candidates)}\n`);
    return;
  }
  if (!args.agent || !args.target || !args.exportFormat) {
    throw new Error("Provide a supported source/target pair or route alias");
  }
  if (args.preview && args.stdout) {
    throw new Error("Use either --preview or --stdout, not both");
  }
  if (args.run && (args.preview || args.stdout)) {
    throw new Error("--run requires a written export with a resume command");
  }

  args.forkPrompt = await resolveForkPrompt(args);
  const sessionPath = await resolveSessionPath(args);
  const exported = await exportSession({
    sessionPath,
    sourceAgent: args.agent,
    targetAgent: args.target,
    format: args.exportFormat,
    splitRecent: args.splitRecent,
    forkPrompt: args.forkPrompt,
  });

  if (args.stdout) {
    if (args.json) {
      emitResult(
        {
          mode: exported.mode,
          output: "stdout",
          sourceAgent: exported.sourceAgent,
          targetAgent: exported.targetAgent,
          sessionId: exported.sessionId,
          sessionPath,
          ...(exported.files[0] ? { fileName: exported.files[0].fileName } : {}),
        },
        true,
      );
      return;
    }
    process.stdout.write(exported.files[0]?.content ?? "");
    return;
  }

  const installPlan = resolveInstallPlan({
    args,
    exported,
    targetAgent: args.target,
  });
  const hints = buildNativeForkHints({ exported });

  if (args.preview) {
    process.stdout.write(formatExportPreview({ exported, installPlan, hints }));
    return;
  }

  if (args.run && !installPlan.resumeCommand) {
    throw new Error("--run requires a default install with a resume command");
  }

  for (const file of installPlan.files) {
    await fs.mkdir(path.dirname(file.path), { recursive: true });
    await fs.writeFile(file.path, file.content, "utf8");
  }

  const mainFile = installPlan.files.find((file) => file.key === "main") ?? installPlan.files[0];
  const sidecarFile = installPlan.files.find((file) => file.key === "sidecar");
  const lineageFile = installPlan.files.find((file) => file.key === "lineage");
  emitResult(
    {
      mode: exported.mode,
      sourceAgent: exported.sourceAgent,
      targetAgent: exported.targetAgent,
      sessionId: exported.sessionId,
      sessionPath,
      ...(mainFile ? { fileName: mainFile.fileName } : {}),
      ...(mainFile ? { outputPath: mainFile.path } : {}),
      ...(sidecarFile ? { sidecarPath: sidecarFile.path } : {}),
      ...(lineageFile ? { lineagePath: lineageFile.path } : {}),
      ...(installPlan.resumeCommand ? { resumeCommand: installPlan.resumeCommand } : {}),
      ...(hints.length > 0 ? { hints } : {}),
      paths: installPlan.files.map((file) => file.path),
    },
    args.json,
  );

  if (args.run) {
    await runResumeCommand({ command: installPlan.resumeCommand });
  }
}

const invokedCliPath = process.argv[1]
  ? await fs.realpath(process.argv[1]).catch(() => path.resolve(process.argv[1]))
  : null;
const moduleCliPath = await fs.realpath(fileURLToPath(import.meta.url)).catch(() => fileURLToPath(import.meta.url));

if (invokedCliPath && invokedCliPath === moduleCliPath) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
