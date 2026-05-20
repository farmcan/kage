#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseSession } from "./adapters/sources/index.js";
import { formatAgentName, getDefaultRoot, supportedAgents } from "./core/agents.js";
import { cleanDuplicateExports } from "./core/clean.js";
import { findMatchingSessions, findSessionById } from "./core/discovery.js";
import { exportSession } from "./core/exporting.js";
import { resolveInstallPlan } from "./core/install.js";
import { inferDefaultExportFormat, routeAliases } from "./core/routing.js";

const shorthandAgents = ["c", "x", "q"];
const supportedRouteAliasList = Object.keys(routeAliases).join(", ");
const removedRouteAliases = new Set(["x2r", "c2r", "q2r", "r2x", "r2c", "r2q"]);
const removedAgentNames = new Set(["qoder"]);
const removedOptions = new Set(["--handoff", "--copy", "--cursor"]);

const helpText = `Usage:
  kage update
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

Agent shorthands:
  x     codex
  c     claude
  q     qodercli

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
  --stdout
  --json
  --version
  --help`;

const completionCommands = ["update", "clean", "completions", ...supportedAgents, ...shorthandAgents, ...Object.keys(routeAliases)];
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
      if (removedOptions.has(arg)) {
        args.error = `Unsupported option: ${arg}`;
      } else if (arg === "--agent") {
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
  if ([args.agent, args.target].some((value) => removedAgentNames.has(value))) {
    return { ...args, error: "Unsupported agent: qoder. Use qodercli instead." };
  }
  if (first === "update" && !second) {
    return { ...args, update: true };
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
  if (first && removedRouteAliases.has(first)) {
    return { ...args, error: `Unsupported route alias: ${first}` };
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
} = {}) {
  const shell = process.env.SHELL || "sh";
  const commandToRun = commandOverride ?? command;
  if (!commandToRun) {
    throw new Error("--run requires a resume command");
  }

  await new Promise((resolve, reject) => {
    const child = spawn(shell, ["-lc", commandToRun], {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Run failed with exit code ${code}`));
    });
  });
}

async function getCliVersion() {
  const packagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const packageJson = JSON.parse(await fs.readFile(packagePath, "utf8"));
  return packageJson.version;
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

function formatExportPreview({ exported, installPlan }) {
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

  lines.push("Message preview:");
  for (const [index, message] of exported.session.messages.entries()) {
    lines.push(`${index + 1}. ${message.role}: ${compactPreviewText(message.text)}`);
  }

  return `${lines.join("\n")}\n`;
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
  const normalized = String(title ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  if (!normalized) {
    return "(untitled)";
  }
  if (!Number.isFinite(maxLength) || normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function isIgnorableSessionTitleMessage(text) {
  const normalized = String(text ?? "").trimStart();
  return normalized.startsWith("<environment_context>") || normalized.startsWith("<turn_aborted>");
}

function getRealUserMessages(session) {
  return session.messages.filter(
    (message) => message.role === "user" && message.text.trim() && !isIgnorableSessionTitleMessage(message.text),
  );
}

function getSessionTitle(session) {
  if (session.title) {
    return formatSessionTitle(session.title);
  }
  const firstUserMessage = getRealUserMessages(session)[0];
  return formatSessionTitle(firstUserMessage?.text);
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
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function buildSessionCandidates(args) {
  const rootDir = args.root ?? getDefaultRoot(args.agent ?? "codex");
  const resolvedAgent = formatAgentName(args.agent ?? "codex");
  const matches = await findMatchingSessions(rootDir, {
    cwd: process.cwd(),
    agent: resolvedAgent,
  });
  return Promise.all(
    matches
      .sort()
      .reverse()
      .map(async (sessionPath) => {
        const session = await parseSession({ sessionPath, agent: resolvedAgent });
        return {
          sessionPath,
          sessionId: session.sessionId,
          updatedAt: session.updatedAt,
          title: getSessionTitle(session),
          recentUserMessages: getRealUserMessages(session)
            .slice(-3)
            .reverse()
            .map((message) => formatSessionTitle(message.text)),
        };
      }),
  );
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

  if (args.preview) {
    process.stdout.write(formatExportPreview({ exported, installPlan }));
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
      ...(installPlan.resumeCommand ? { resumeCommand: installPlan.resumeCommand } : {}),
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
