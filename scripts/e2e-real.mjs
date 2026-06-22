#!/usr/bin/env node
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
const version = packageJson.version;
const appName = "KAGE.app";
const defaultDmgPath = path.join(repoRoot, "app", ".build", "release", `KAGE-${version}.dmg`);
const dmgPath = path.resolve(process.argv[2] ?? process.env.KAGE_E2E_DMG ?? defaultDmgPath);
const shouldInstallApp = process.env.KAGE_E2E_INSTALL_APP === "1";
const shouldKeepTmp = process.env.KAGE_E2E_KEEP_TMP === "1";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kage-e2e-real-"));
const mountDir = path.join(tmpRoot, "dmg");
const tmpHome = path.join(tmpRoot, "home");
const projectDir = path.join(tmpRoot, "project");
const sidechainDir = path.join(tmpRoot, "sidechain-project");
const token = `KAGE_E2E_${Date.now()}`;
const codexId = `${token.toLowerCase()}-codex`;
const claudeId = `${token.toLowerCase()}-claude`;
const qoderId = `${token.toLowerCase()}-qoder`;
const qoderSidechainAlphaId = `${token.toLowerCase()}-qoder-task-alpha`;
const qoderSidechainBetaId = `${token.toLowerCase()}-qoder-task-beta`;
const now = new Date().toISOString();
const summary = [];
let mounted = false;

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });
  if (result.status !== 0) {
    const detail = [
      `$ ${[command, ...args].join(" ")}`,
      result.stdout?.trim(),
      result.stderr?.trim(),
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(detail);
  }
  return result.stdout;
}

function runJson(command, args, options = {}) {
  const stdout = run(command, args, options);
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${command} ${args.join(" ")}:\n${stdout}\n${error.message}`);
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function projectKey(cwd) {
  return `-${path
    .resolve(cwd)
    .split(path.sep)
    .filter(Boolean)
    .join("-")}`;
}

async function writeJsonl(filePath, rows) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

async function createFixtures() {
  await fs.mkdir(projectDir, { recursive: true });
  await fs.mkdir(sidechainDir, { recursive: true });
  await fs.writeFile(path.join(projectDir, "README.md"), `# KAGE real E2E\n\n${token}\n`, "utf8");
  await fs.writeFile(path.join(sidechainDir, "README.md"), `# KAGE sidechain-only cwd\n\n${token}\n`, "utf8");

  const key = projectKey(projectDir);
  const codexPath = path.join(tmpHome, ".codex", "sessions", "2026", "06", "03", `${codexId}.jsonl`);
  const claudePath = path.join(tmpHome, ".claude", "projects", key, `${claudeId}.jsonl`);
  const qoderPath = path.join(tmpHome, ".qoder", "projects", key, `${qoderId}.jsonl`);
  const qoderSidecarPath = qoderPath.replace(/\.jsonl$/u, "-session.json");

  await writeJsonl(codexPath, [
    {
      timestamp: now,
      type: "session_meta",
      payload: { id: codexId, cwd: projectDir, originator: "codex_cli_rs" },
    },
    {
      timestamp: now,
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: `${token} codex source asks for a real bridge test.` }],
      },
    },
    {
      timestamp: now,
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Codex fixture response for KAGE real E2E." }],
      },
    },
  ]);

  await writeJsonl(claudePath, [
    {
      type: "user",
      message: { role: "user", content: `${token} claude source asks for search coverage.` },
      timestamp: now,
      cwd: projectDir,
      sessionId: claudeId,
      uuid: `${claudeId}-u1`,
    },
    {
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: "Claude fixture response for KAGE real E2E." }] },
      timestamp: now,
      cwd: projectDir,
      sessionId: claudeId,
      uuid: `${claudeId}-a1`,
    },
  ]);

  await writeJsonl(qoderPath, [
    {
      type: "user",
      cwd: sidechainDir,
      sessionId: qoderId,
      timestamp: now,
      message: { role: "user", content: [{ type: "text", text: `${token} sidechain cwd must not select this session.` }] },
      isSidechain: true,
      isMeta: false,
      agentId: "qoder-worker-reused",
      taskId: qoderSidechainAlphaId,
      parentUuid: `${qoderId}-main-parent`,
      uuid: `${qoderSidechainAlphaId}-user`,
    },
    {
      type: "user",
      cwd: projectDir,
      sessionId: qoderId,
      timestamp: now,
      message: { role: "user", content: [{ type: "text", text: `${token} qoder source asks for action coverage.` }] },
      isMeta: false,
    },
    {
      type: "assistant",
      cwd: projectDir,
      sessionId: qoderId,
      timestamp: now,
      message: { role: "assistant", content: [{ type: "text", text: "Qoder fixture response for KAGE real E2E." }] },
      isMeta: false,
    },
    {
      type: "user",
      cwd: projectDir,
      sessionId: qoderId,
      timestamp: now,
      message: { role: "user", content: [{ type: "text", text: `${token} alpha sidechain context should require explicit opt-in.` }] },
      isSidechain: true,
      isMeta: false,
      agentId: "qoder-worker-reused",
      taskId: qoderSidechainAlphaId,
      parentUuid: `${qoderId}-main-parent`,
      uuid: `${qoderSidechainAlphaId}-user-2`,
    },
    {
      type: "user",
      cwd: projectDir,
      sessionId: qoderId,
      timestamp: now,
      message: { role: "user", content: [{ type: "text", text: `${token} beta sidechain context should remain separate.` }] },
      isSidechain: true,
      isMeta: false,
      agentId: "qoder-worker-reused",
      taskId: qoderSidechainBetaId,
      parentUuid: `${qoderId}-main-parent`,
      uuid: `${qoderSidechainBetaId}-user`,
    },
  ]);
  await fs.writeFile(
    qoderSidecarPath,
    `${JSON.stringify(
      {
        id: qoderId,
        title: `${token} qoder sidecar title`,
        working_dir: projectDir,
        updated_at: now,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { codexPath, claudePath, qoderPath };
}

function e2eEnv() {
  return { ...process.env, HOME: tmpHome };
}

try {
  requireCondition(process.platform === "darwin", "Real E2E packaging test requires macOS.");
  requireCondition(await exists(dmgPath), `DMG not found: ${dmgPath}. Run (cd app && ./package.sh) first.`);

  await fs.mkdir(mountDir, { recursive: true });
  run("hdiutil", ["attach", dmgPath, "-nobrowse", "-readonly", "-mountpoint", mountDir]);
  mounted = true;
  summary.push(`mounted ${path.basename(dmgPath)}`);

  const mountedAppPath = path.join(mountDir, appName);
  requireCondition(await exists(mountedAppPath), `Mounted DMG does not contain ${appName}.`);
  const appPath = shouldInstallApp ? path.join("/Applications", appName) : mountedAppPath;
  if (shouldInstallApp) {
    run("ditto", [mountedAppPath, appPath]);
    summary.push(`installed ${appPath}`);
  }

  const kageBin = path.join(appPath, "Contents", "Resources", "kage");
  const appIconPath = path.join(appPath, "Contents", "Resources", "AppIcon.icns");
  const menuBarIconPath = path.join(appPath, "Contents", "Resources", "MenuBarIconTemplate.png");
  const appVersion = run("defaults", ["read", path.join(appPath, "Contents", "Info"), "CFBundleShortVersionString"]).trim();
  const appIconName = run("defaults", ["read", path.join(appPath, "Contents", "Info"), "CFBundleIconFile"]).trim();
  const cliVersion = run(kageBin, ["--version"]).trim();
  requireCondition(appVersion === version, `Expected app version ${version}, got ${appVersion}.`);
  requireCondition(appIconName === "AppIcon", `Expected CFBundleIconFile AppIcon, got ${appIconName}.`);
  requireCondition(await exists(appIconPath), `Packaged app icon not found: ${appIconPath}.`);
  requireCondition(await exists(menuBarIconPath), `Packaged menu bar icon not found: ${menuBarIconPath}.`);
  requireCondition(cliVersion === `kage ${version}`, `Expected CLI version kage ${version}, got ${cliVersion}.`);
  summary.push(`verified app icon, menu bar icon, and bundled CLI version ${version}`);

  const fixtures = await createFixtures();
  summary.push(`created real session roots under ${tmpHome}`);

  const doctor = runJson(kageBin, ["doctor", "--json"], { cwd: projectDir, env: e2eEnv() });
  requireCondition(doctor.kageVersion === version, `doctor should report KAGE ${version}.`);
  for (const agentName of ["claude", "codex", "qodercli"]) {
    const agent = doctor.agents.find((candidate) => candidate.agent === agentName);
    requireCondition(agent, `doctor should include ${agentName}.`);
    requireCondition(agent.sessionRoot.exists, `doctor should see ${agentName} session root.`);
    requireCondition(agent.sessionRoot.readable, `doctor should read ${agentName} session root.`);
    requireCondition(agent.sessionRoot.writable, `doctor should write ${agentName} session root.`);
  }
  requireCondition(doctor.agents.some((agent) => agent.agent === "qoderwork" && agent.commandRequired === false), "doctor should include optional QoderWork source.");
  if (!doctor.ok) {
    const details = doctor.agents
      .filter((agent) => agent.commandError)
      .map((agent) => `${agent.label}: ${agent.commandError}`)
      .join(", ");
    summary.push(`verified doctor roots; overall doctor ok=false under temp HOME${details ? ` (${details})` : ""}`);
  } else {
    summary.push("verified doctor readiness");
  }

  const sessions = runJson(kageBin, ["sessions", "--json", "--since", "1d", "--include-subdirs", "--limit", "20"], {
    cwd: projectDir,
    env: e2eEnv(),
  });
  const expectedSessions = new Map([
    [codexId, "codex"],
    [claudeId, "claude"],
    [qoderId, "qodercli"],
  ]);
  for (const [id, agentName] of expectedSessions) {
    const session = sessions.sessions.find((candidate) => candidate.sessionId === id);
    requireCondition(session, `sessions --json did not include ${id}.`);
    requireCondition(session.agent === agentName, `sessions --json detected ${id} as ${session.agent}, expected ${agentName}.`);
    requireCondition(session.cwd === projectDir, `sessions --json detected ${id} in ${session.cwd}, expected ${projectDir}.`);
  }
  for (const [id, agentName] of expectedSessions) {
    const agentGroup = sessions.agents.find((candidate) => candidate.agent === agentName);
    requireCondition(agentGroup?.sessions.some((session) => session.sessionId === id), `sessions agent group ${agentName} did not include ${id}.`);
  }
  summary.push("verified sessions detection across Codex, Claude, and QoderCLI");

  const qoderPicker = run(kageBin, ["q", "--root", path.join(tmpHome, ".qoder", "projects")], {
    cwd: projectDir,
    env: e2eEnv(),
  });
  requireCondition(qoderPicker.includes(`${token} qoder source asks for action coverage.`), "q picker should show the main Qoder transcript.");
  requireCondition(!qoderPicker.includes("sidechain cwd must not select this session"), "q picker should not show sidechain-only content.");

  const sidechainPicker = childProcess.spawnSync(kageBin, ["q", "--root", path.join(tmpHome, ".qoder", "projects")], {
    cwd: sidechainDir,
    env: e2eEnv(),
    encoding: "utf8",
    stdio: "pipe",
  });
  requireCondition(sidechainPicker.status !== 0, "q picker should not match a session from sidechain-only cwd.");
  requireCondition(
    sidechainPicker.stderr.includes("No QoderCLI sessions match the current directory"),
    `Expected sidechain-only cwd rejection, got: ${sidechainPicker.stderr}`,
  );
  summary.push("verified QoderCLI session picker ignores sidechain-only cwd matches");

  const search = runJson(kageBin, ["search", token, "--json", "--include-subdirs", "--limit", "20"], {
    cwd: projectDir,
    env: e2eEnv(),
  });
  requireCondition(search.results.length >= 3, `Expected at least 3 search results for ${token}, got ${search.results.length}.`);
  summary.push("verified transcript search over real JSONL fixtures");

  const qoderDefaultBridge = run(kageBin, ["q2x", "--session", fixtures.qoderPath, "--stdout"], {
    cwd: projectDir,
    env: e2eEnv(),
  });
  requireCondition(qoderDefaultBridge.includes(`${token} qoder source asks for action coverage.`), "Default q2x should include main Qoder content.");
  requireCondition(!qoderDefaultBridge.includes("alpha sidechain context"), "Default q2x should exclude alpha sidechain content.");
  requireCondition(!qoderDefaultBridge.includes("beta sidechain context"), "Default q2x should exclude beta sidechain content.");

  const qoderSidechainList = run(kageBin, ["q2x", "--session", fixtures.qoderPath, "--list-subagents"], {
    cwd: projectDir,
    env: e2eEnv(),
  });
  requireCondition(qoderSidechainList.includes(qoderSidechainAlphaId), "Qoder sidechain list should include alpha task selector.");
  requireCondition(qoderSidechainList.includes(qoderSidechainBetaId), "Qoder sidechain list should include beta task selector.");
  requireCondition(!qoderSidechainList.includes("Selector: qoder-worker-reused"), "Qoder sidechain list should not collapse reused worker agentId.");

  const qoderSidechainOutPath = path.join(tmpRoot, "qoder-sidechain.codex.jsonl");
  const qoderSidechainBridge = runJson(
    kageBin,
    ["q2x", "--session", fixtures.qoderPath, "--include-subagent", qoderSidechainBetaId, "--out", qoderSidechainOutPath, "--json"],
    {
      cwd: projectDir,
      env: e2eEnv(),
    },
  );
  requireCondition(qoderSidechainBridge.outputPath === qoderSidechainOutPath, "Qoder sidechain bridge should use requested output path.");
  requireCondition(qoderSidechainBridge.includedSubagents?.some((item) => item.id === qoderSidechainBetaId), "Qoder sidechain bridge should report included beta task.");
  const qoderSidechainContent = await fs.readFile(qoderSidechainOutPath, "utf8");
  requireCondition(qoderSidechainContent.includes(`[QoderCLI Sidechain: ${qoderSidechainBetaId}]`), "Qoder sidechain export should label beta task.");
  requireCondition(qoderSidechainContent.includes("beta sidechain context should remain separate"), "Qoder sidechain export should include beta task content.");
  requireCondition(!qoderSidechainContent.includes("alpha sidechain context should require explicit opt-in"), "Qoder sidechain export should exclude alpha task content.");
  summary.push("verified packaged q2x sidechain list/include/default exclusion end to end");

  const actions = runJson(kageBin, ["actions", "--json", "--include-subdirs", "--since", "1d", "--limit", "20"], {
    cwd: projectDir,
    env: e2eEnv(),
  });
  const bridgeActionId = `bridge:x2c:${codexId}`;
  requireCondition(actions.actions.some((action) => action.id === bridgeActionId), `Missing bridge action ${bridgeActionId}.`);

  const bridge = runJson(kageBin, ["run-action", bridgeActionId, "--include-subdirs", "--json"], {
    cwd: projectDir,
    env: e2eEnv(),
  });
  requireCondition(bridge.ok === true, "run-action bridge should report ok.");
  requireCondition(bridge.targetAgent === "claude", `Expected bridge target claude, got ${bridge.targetAgent}.`);
  requireCondition(bridge.outputPath && (await exists(bridge.outputPath)), "Bridge output path should exist.");
  const bridgeContent = await fs.readFile(bridge.outputPath, "utf8");
  requireCondition(bridgeContent.includes(token), "Bridge output should preserve transcript token.");
  summary.push("verified real bridge action writes a Claude-native transcript");

  const storyPath = path.join(tmpRoot, "story.html");
  const story = runJson(kageBin, ["x2v", "--session", fixtures.codexPath, "--out", storyPath, "--json"], {
    cwd: projectDir,
    env: e2eEnv(),
  });
  requireCondition(story.outputPath === storyPath, "Story export should use requested output path.");
  const storyContent = await fs.readFile(storyPath, "utf8");
  requireCondition(storyContent.includes(token), "Story HTML should preserve transcript token.");
  summary.push("verified real story HTML export");

  console.log(`KAGE real E2E passed for v${version}`);
  for (const item of summary) {
    console.log(`- ${item}`);
  }
} finally {
  if (mounted) {
    try {
      run("hdiutil", ["detach", mountDir, "-quiet"]);
    } catch {
      run("hdiutil", ["detach", mountDir, "-force", "-quiet"]);
    }
  }
  if (shouldKeepTmp) {
    console.log(`Kept E2E temp directory: ${tmpRoot}`);
  } else {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
}
