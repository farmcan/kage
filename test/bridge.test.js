import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";

import { chooseClaudeSessionPath, chooseSessionPath } from "../src/cli.js";
import { joinBlocks } from "../src/adapters/sources/shared.js";
import { exportSession } from "../src/core/exporting.js";
import { buildClaudeResumeCommand } from "../src/core/resume-commands.js";
import { getExportCapability, inferDefaultExportFormat } from "../src/core/routing.js";
import { createKageServeServer } from "../src/serve/index.js";
import { buildAgentSendCommand, runAgentSend } from "../src/serve/send.js";
import {
  buildStoryPayload,
  detectAgent,
  findMatchingSessions,
  findLatestSession,
  findSessionById,
  forkSession,
  parseSession,
  renderClaudeResumeExport,
  renderCodexResumeExport,
  splitSession,
  supportedAgents,
} from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function makeTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
}

async function writeExecutable(filePath, content) {
  await fs.writeFile(filePath, content, "utf8");
  await fs.chmod(filePath, 0o755);
}

async function canonicalPath(filePath) {
  try {
    return await fs.realpath(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function toProjectKey(cwd) {
  return `-${path
    .resolve(cwd)
    .split(path.sep)
    .filter(Boolean)
    .join("-")}`;
}

function spawnCli(args, options = {}) {
  const cliPath = path.join(__dirname, "..", "src", "cli.js");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
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
      resolve({ code, stdout, stderr });
    });
  });
}

test("joinBlocks handles native transcript content variants", () => {
  assert.equal(joinBlocks("plain string"), "plain string");
  assert.equal(joinBlocks({ text: "single text block" }), "single text block");
  assert.equal(joinBlocks({ content: "single content block" }), "single content block");
  assert.equal(joinBlocks(["one", { text: "two" }, { content: "three" }, null]), "one\ntwo\nthree");
  assert.equal(joinBlocks(undefined), "");
  assert.equal(joinBlocks({ nested: true }), "");
});

test("buildClaudeResumeCommand scopes resume to cwd and shell-quotes values", () => {
  assert.equal(buildClaudeResumeCommand("session-1", "/tmp/project"), "cd /tmp/project && claude --resume session-1");
  assert.equal(
    buildClaudeResumeCommand("session with space", "/tmp/project with space"),
    "cd '/tmp/project with space' && claude --resume 'session with space'",
  );
  assert.equal(
    buildClaudeResumeCommand("session-1", "/tmp/can't"),
    "cd '/tmp/can'\\''t' && claude --resume session-1",
  );
});

test("supportedAgents exposes the native-export adapter set", () => {
  assert.deepEqual(supportedAgents.sort(), ["claude", "codex", "qodercli", "qoderwork"].sort());
});

test("detectAgent recognizes Codex, Claude, QoderCLI, and QoderWork paths", () => {
  assert.equal(detectAgent("/tmp/.codex/sessions/2026/03/demo.jsonl"), "codex");
  assert.equal(detectAgent("/tmp/.claude/projects/foo.jsonl"), "claude");
  assert.equal(detectAgent("/tmp/.qoderwork/projects/demo/session.jsonl"), "qoderwork");
  assert.equal(detectAgent("/tmp/.qoder/projects/demo.jsonl"), "qodercli");
  assert.equal(detectAgent("/tmp/.qoder/bin/qodercli/demo.jsonl"), "qodercli");
});

test("inferDefaultExportFormat prefers native exports for supported aliases", () => {
  assert.equal(inferDefaultExportFormat({ routeAlias: "x2c", exportFormat: null }).exportFormat, "claude-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "c2x", exportFormat: null }).exportFormat, "codex-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "c2c", exportFormat: null }).exportFormat, "claude-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "x2x", exportFormat: null }).exportFormat, "codex-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "q2q", exportFormat: null }).exportFormat, "qoder-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "q2x", exportFormat: null }).exportFormat, "codex-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "q2c", exportFormat: null }).exportFormat, "claude-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "x2q", exportFormat: null }).exportFormat, "qoder-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "c2q", exportFormat: null }).exportFormat, "qoder-session");
  assert.equal(inferDefaultExportFormat({ routeAlias: "c2v", exportFormat: null }).exportFormat, "session-story-html");
  assert.equal(inferDefaultExportFormat({ routeAlias: "x2v", exportFormat: null }).exportFormat, "session-story-html");
  assert.equal(inferDefaultExportFormat({ routeAlias: "q2v", exportFormat: null }).exportFormat, "session-story-html");
});

test("getExportCapability exposes qodercli export pairs", () => {
  assert.equal(getExportCapability("claude", "claude")?.format, "claude-session");
  assert.equal(getExportCapability("qoder", "qodercli"), null);
  assert.equal(getExportCapability("qodercli", "qoder"), null);
  assert.equal(getExportCapability("qodercli", "qodercli")?.fork, true);
  assert.equal(getExportCapability("qodercli", "codex")?.format, "codex-session");
  assert.equal(getExportCapability("qodercli", "claude")?.format, "claude-session");
  assert.equal(getExportCapability("qoderwork", "qoderwork"), null);
  assert.equal(getExportCapability("qoderwork", "codex")?.format, "codex-session");
  assert.equal(getExportCapability("qoderwork", "claude")?.format, "claude-session");
  assert.equal(getExportCapability("qoderwork", "qodercli")?.format, "qoder-session");
  assert.equal(getExportCapability("codex", "qodercli")?.format, "qoder-session");
  assert.equal(getExportCapability("codex", "qodercli")?.resumable, true);
  assert.equal(getExportCapability("claude", "qodercli")?.format, "qoder-session");
});

test("parseSession reads Codex sessions", async () => {
  const session = await parseSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl"),
    agent: "codex",
  });

  assert.equal(session.agent, "codex");
  assert.equal(session.sessionId, "sample-session");
  assert.equal(session.cwd, "/tmp/demo");
  assert.equal(session.messages.length, 2);
});

test("parseSession filters Codex developer, system, and bootstrap messages", async () => {
  const tempDir = await makeTempDir("codex-filter");
  const sessionPath = path.join(tempDir, "rollout-demo.jsonl");
  await fs.writeFile(
    sessionPath,
    [
      '{"timestamp":"2026-03-20T10:00:00.000Z","type":"session_meta","payload":{"id":"demo","cwd":"/tmp/demo"}}',
      '{"timestamp":"2026-03-20T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"developer","content":[{"type":"input_text","text":"developer note"}]}}',
      '{"timestamp":"2026-03-20T10:00:02.000Z","type":"response_item","payload":{"type":"message","role":"system","content":[{"type":"input_text","text":"system note"}]}}',
      '{"timestamp":"2026-03-20T10:00:03.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"# AGENTS.md instructions for /tmp/demo"}]}}',
      '{"timestamp":"2026-03-20T10:00:04.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"real user request"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const session = await parseSession({ sessionPath, agent: "codex" });
  assert.deepEqual(session.messages, [{ role: "user", text: "real user request" }]);
});

test("parseSession reads Codex string and object message content", async () => {
  const tempDir = await makeTempDir("codex-content-shapes");
  const sessionPath = path.join(tempDir, "rollout-content-shapes.jsonl");
  await fs.writeFile(
    sessionPath,
    [
      '{"timestamp":"2026-03-20T10:00:00.000Z","type":"session_meta","payload":{"id":"content-shapes","cwd":"/tmp/demo"}}',
      '{"timestamp":"2026-03-20T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":"plain string user"}}',
      '{"timestamp":"2026-03-20T10:00:02.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":{"text":"object assistant"}}}',
      '{"timestamp":"2026-03-20T10:00:03.000Z","type":"response_item","payload":{"type":"message","role":"user","content":{"content":"object content user"}}}',
      '{"timestamp":"2026-03-20T10:00:04.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":{"unexpected":true}}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const session = await parseSession({ sessionPath, agent: "codex" });

  assert.deepEqual(session.messages, [
    { role: "user", text: "plain string user" },
    { role: "assistant", text: "object assistant" },
    { role: "user", text: "object content user" },
  ]);
});

test("parseSession reads QoderCLI sessions and drops meta rows", async () => {
  const session = await parseSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl"),
    agent: "qodercli",
  });

  assert.equal(session.agent, "qodercli");
  assert.equal(session.sessionId, "qoder-session");
  assert.equal(session.title, "Demo Qoder Session");
  assert.equal(session.messages.length, 2);
  assert.equal(session.messages[0].text, "你好");
});

test("parseSession reads QoderWork sessions with the Qoder layout", async () => {
  const session = await parseSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl"),
    agent: "qoderwork",
  });

  assert.equal(session.agent, "qoderwork");
  assert.equal(session.sessionId, "qoder-session");
  assert.equal(session.cwd, "/workspace/demo");
  assert.equal(session.messages[0].text, "你好");
});

test("parseSession reads QoderCLI string content and skips missing content", async () => {
  const tempDir = await makeTempDir("qoder-string-content");
  const sessionPath = path.join(tempDir, "session.jsonl");
  await fs.writeFile(
    sessionPath,
    [
      '{"type":"user","cwd":"/tmp/demo","sessionId":"qoder-string","message":{"role":"user","content":"plain string content"}}',
      '{"type":"assistant","cwd":"/tmp/demo","sessionId":"qoder-string","message":{"role":"assistant","content":[{"type":"text","text":"array content"}]}}',
      '{"type":"user","cwd":"/tmp/demo","sessionId":"qoder-string","message":{"role":"user"}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const session = await parseSession({ sessionPath, agent: "qodercli" });

  assert.deepEqual(session.messages, [
    { role: "user", text: "plain string content" },
    { role: "assistant", text: "array content" },
  ]);
});

test("cli q lists QoderCLI sessions with string and missing content", async () => {
  const currentDir = await makeTempDir("qoder-list-string-workspace");
  const sessionsRoot = await makeTempDir("qoder-list-string-root");
  const projectDir = path.join(sessionsRoot, "-workspace");
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(
    path.join(projectDir, "session.jsonl"),
    [
      `{"type":"user","cwd":"${currentDir}","sessionId":"qoder-string","message":{"role":"user","content":"plain string list title"}}`,
      `{"type":"assistant","cwd":"${currentDir}","sessionId":"qoder-string","message":{"role":"assistant","content":[{"type":"text","text":"array reply"}]}}`,
      `{"type":"user","cwd":"${currentDir}","sessionId":"qoder-string","message":{"role":"user"}}`,
    ].join("\n") + "\n",
    "utf8",
  );

  const result = await spawnCli(["q", "--root", sessionsRoot], { cwd: currentDir });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Matching QoderCLI sessions/);
  assert.match(result.stdout, /plain string list title/);
  assert.doesNotMatch(result.stderr, /blocks\.map/);
});

test("parseSession reads Claude sessions", async () => {
  const session = await parseSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    agent: "claude",
  });

  assert.equal(session.agent, "claude");
  assert.equal(session.sessionId, "claude-session");
  assert.equal(session.cwd, "/workspace/claude-demo");
  assert.equal(session.messages.length, 3);
});

test("parseSession reads Claude updatedAt from the latest timestamp", async () => {
  const tempDir = await makeTempDir("claude-updated-at");
  const sessionPath = path.join(tempDir, "session.jsonl");
  await fs.writeFile(
    sessionPath,
    [
      '{"type":"user","message":{"role":"user","content":"hi"},"cwd":"/tmp/demo","sessionId":"aaa"}',
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hello"}]},"timestamp":"2026-03-20T11:00:00.000Z","cwd":"/tmp/demo","sessionId":"aaa"}',
    ].join("\n") + "\n",
    "utf8",
  );

  const session = await parseSession({ sessionPath, agent: "claude" });
  assert.equal(session.updatedAt, "2026-03-20T11:00:00.000Z");
});

test("parseSession preserves raw items for story exports", async () => {
  const session = await parseSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    agent: "claude",
  });

  assert.ok(Array.isArray(session.rawItems));
  assert.equal(session.rawItems.length, 6);
});

test("renderCodexResumeExport converts a Claude transcript", async () => {
  const exported = await renderCodexResumeExport({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    agent: "claude",
    sessionId: "11111111-2222-4333-8444-555555555555",
    timestamp: "2026-03-20T09:16:47.246Z",
  });

  assert.equal(exported.sessionId, "11111111-2222-4333-8444-555555555555");
  assert.match(exported.fileName, /^rollout-/);
  const lines = exported.content.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines[0].type, "session_meta");
  assert.equal(lines[1].type, "response_item");
});

test("renderClaudeResumeExport converts a Codex transcript", async () => {
  const exported = await renderClaudeResumeExport({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl"),
    agent: "codex",
    sessionId: "11111111-2222-4333-8444-555555555555",
    timestamp: "2026-03-20T09:16:47.246Z",
  });

  assert.equal(exported.sessionId, "11111111-2222-4333-8444-555555555555");
  assert.equal(exported.fileName, "11111111-2222-4333-8444-555555555555.jsonl");
  const lines = exported.content.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines[0].type, "file-history-snapshot");
  assert.equal(lines[1].type, "user");
});

test("exportSession renders qodercli -> codex", async () => {
  const exported = await exportSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl"),
    sourceAgent: "qodercli",
    targetAgent: "codex",
    format: "codex-session",
  });

  assert.equal(exported.mode, "codex-session");
  assert.equal(exported.sessionId, "qoder-session");
  assert.match(exported.files[0].content, /"type":"session_meta"/);
});

test("exportSession renders qodercli -> claude", async () => {
  const exported = await exportSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl"),
    sourceAgent: "qodercli",
    targetAgent: "claude",
    format: "claude-session",
  });

  assert.equal(exported.mode, "claude-session");
  assert.match(exported.files[0].content, /"type":"user"/);
});

test("exportSession renders codex -> qodercli", async () => {
  const exported = await exportSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl"),
    sourceAgent: "codex",
    targetAgent: "qodercli",
    format: "qoder-session",
  });

  assert.equal(exported.mode, "qoder-session");
  assert.equal(exported.files.length, 2);
  assert.match(exported.files[1].fileName, /-session\.json$/);
});

test("exportSession renders claude -> qodercli", async () => {
  const exported = await exportSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    sourceAgent: "claude",
    targetAgent: "qodercli",
    format: "qoder-session",
  });

  assert.equal(exported.mode, "qoder-session");
  assert.equal(exported.files.length, 2);
});

test("exportSession renders a standalone session story html", async () => {
  const exported = await exportSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    sourceAgent: "claude",
    targetAgent: "codex",
    format: "session-story-html",
  });

  assert.equal(exported.mode, "session-story-html");
  assert.equal(exported.files.length, 1);
  assert.match(exported.files[0].fileName, /\.html$/);
  assert.match(exported.files[0].content, /phaser/i);
  assert.match(exported.files[0].content, /phaser-stage/i);
  assert.doesNotMatch(exported.files[0].content, /renderer:\s*DOM \+ PixiJS loaded/i);
  assert.match(exported.files[0].content, /anime/i);
  assert.match(exported.files[0].content, /requestAnimationFrame/i);
  assert.match(exported.files[0].content, /schedulePlayback\(\)/);
  assert.match(exported.files[0].content, /replay-button/);
  assert.match(exported.files[0].content, />0\.5x</);
  assert.match(exported.files[0].content, />3x</);
  assert.match(exported.files[0].content, /Briefing Hall/);
  assert.match(exported.files[0].content, /Reasoning Core/);
  assert.match(exported.files[0].content, /Room/);
  assert.match(exported.files[0].content, /"type":"user"/);
  assert.match(exported.files[0].content, /"type":"tool_result"/);
  assert.match(exported.files[0].content, /"type":"assistant"/);
});

test("story html groups tools into category wings", async () => {
  const tempDir = await makeTempDir("story-wings");
  const sessionPath = path.join(tempDir, "story-tools.jsonl");
  await fs.writeFile(
    sessionPath,
    [
      '{"timestamp":"2026-03-20T10:00:00.000Z","type":"session_meta","payload":{"id":"story-tools","cwd":"/tmp/demo"}}',
      '{"timestamp":"2026-03-20T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"inspect and run"}]}}',
      '{"timestamp":"2026-03-20T10:00:02.000Z","type":"response_item","payload":{"type":"function_call","name":"read_file","arguments":"{\\"path\\":\\"README.md\\"}"}}',
      '{"timestamp":"2026-03-20T10:00:03.000Z","type":"response_item","payload":{"type":"function_call_output","name":"read_file","output":"file content"}}',
      '{"timestamp":"2026-03-20T10:00:04.000Z","type":"response_item","payload":{"type":"function_call","name":"exec_command","arguments":"{\\"cmd\\":\\"npm test\\"}"}}',
      '{"timestamp":"2026-03-20T10:00:05.000Z","type":"response_item","payload":{"type":"function_call_output","name":"exec_command","output":"tests pass"}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const exported = await exportSession({
    sessionPath,
    sourceAgent: "codex",
    targetAgent: "codex",
    format: "session-story-html",
  });

  assert.match(exported.files[0].content, /Filesystem Wing/);
  assert.match(exported.files[0].content, /Terminal Wing/);
  assert.match(exported.files[0].content, /Read File Room/);
  assert.match(exported.files[0].content, /Exec Command Room/);
});

test("buildStoryPayload groups adjacent events into playback beats", async () => {
  const tempDir = await makeTempDir("story-beats");
  const sessionPath = path.join(tempDir, "story-beats.jsonl");
  await fs.writeFile(
    sessionPath,
    [
      '{"timestamp":"2026-03-20T10:00:00.000Z","type":"session_meta","payload":{"id":"story-beats","cwd":"/tmp/demo"}}',
      '{"timestamp":"2026-03-20T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"inspect repo"}]}}',
      '{"timestamp":"2026-03-20T10:00:02.000Z","type":"event_msg","payload":{"type":"agent_message","message":"I will inspect the repository structure."}}',
      '{"timestamp":"2026-03-20T10:00:03.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"I will inspect the repository structure."}]}}',
      '{"timestamp":"2026-03-20T10:00:04.000Z","type":"response_item","payload":{"type":"function_call","name":"exec_command","arguments":"{\\"cmd\\":\\"ls\\"}"}}',
      '{"timestamp":"2026-03-20T10:00:05.000Z","type":"response_item","payload":{"type":"function_call_output","name":"exec_command","output":"README.md\\nsrc"}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const session = await parseSession({ sessionPath, agent: "codex" });
  const payload = buildStoryPayload(session, { sourceAgent: "codex", targetAgent: "codex" });

  assert.equal(payload.events.length, 5);
  assert.equal(payload.beats.length, 4);
  assert.equal(payload.beats[0].roomId, "human-hall");
  assert.equal(payload.beats[1].roomId, "llm-core");
  assert.equal(payload.beats[2].roomId, "human-hall");
  assert.equal(payload.beats[3].roomId, "tool-exec-command");
  assert.equal(payload.beats[3].events.length, 2);
});

test("story html exports QoderCLI string content without crashing", async () => {
  const tempDir = await makeTempDir("qoder-story-string");
  const sessionPath = path.join(tempDir, "session.jsonl");
  await fs.writeFile(
    sessionPath,
    [
      '{"type":"user","cwd":"/tmp/demo","sessionId":"qoder-story","message":{"role":"user","content":"plain story string"}}',
      '{"type":"assistant","cwd":"/tmp/demo","sessionId":"qoder-story","message":{"role":"assistant","content":{"text":"object story reply"}}}',
      '{"type":"user","cwd":"/tmp/demo","sessionId":"qoder-story","message":{"role":"user"}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const exported = await exportSession({
    sessionPath,
    sourceAgent: "qodercli",
    targetAgent: "qodercli",
    format: "session-story-html",
  });

  assert.equal(exported.mode, "session-story-html");
  assert.match(exported.files[0].content, /plain story string/);
  assert.match(exported.files[0].content, /object story reply/);
});

test("splitSession keeps only the most recent user turn and following messages", async () => {
  const session = await parseSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    agent: "claude",
  });

  const split = splitSession(session, { recentUserTurns: 1 });
  assert.equal(split.messages[0].role, "user");
  assert.match(split.messages[0].text, /帮我总结当前目录/);
});

test("forkSession appends a user message", async () => {
  const session = await parseSession({
    sessionPath: path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    agent: "claude",
  });

  const forked = forkSession(session, { prompt: "另外开一个分支，去做 session split" });
  assert.equal(forked.messages.at(-1)?.text, "另外开一个分支，去做 session split");
});

test("findLatestSession prefers Codex cwd matches", async () => {
  const currentDir = await makeTempDir("codex-workspace-a");
  const otherDir = await makeTempDir("codex-workspace-b");
  const sessionsRoot = await makeTempDir("codex-sessions");
  await fs.mkdir(path.join(sessionsRoot, "2026", "03"), { recursive: true });
  await fs.writeFile(
    path.join(sessionsRoot, "2026", "03", "aaa.jsonl"),
    `{"timestamp":"2026-03-19T10:00:00.000Z","type":"session_meta","payload":{"id":"workspace-b","cwd":"${otherDir}"}}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(sessionsRoot, "2026", "03", "bbb.jsonl"),
    `{"timestamp":"2026-03-19T11:00:00.000Z","type":"session_meta","payload":{"id":"workspace-a","cwd":"${currentDir}"}}\n`,
    "utf8",
  );

  const latest = await findLatestSession(sessionsRoot, { cwd: currentDir, agent: "codex" });
  assert.equal(path.basename(latest), "bbb.jsonl");
});

test("findMatchingSessions returns Claude cwd matches", async () => {
  const currentDir = await makeTempDir("claude-match-workspace");
  const otherDir = await makeTempDir("claude-other-workspace");
  const sessionsRoot = await makeTempDir("claude-match-projects");
  const targetDir = path.join(sessionsRoot, "-workspace");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "aaa.jsonl"),
    `{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-03-20T10:00:00.000Z","cwd":"${currentDir}","sessionId":"aaa"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "bbb.jsonl"),
    `{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-03-20T11:00:00.000Z","cwd":"${currentDir}","sessionId":"bbb"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "ccc.jsonl"),
    `{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-03-20T12:00:00.000Z","cwd":"${otherDir}","sessionId":"ccc"}\n`,
    "utf8",
  );

  const matches = await findMatchingSessions(sessionsRoot, { cwd: currentDir, agent: "claude" });
  assert.deepEqual(matches.map((filePath) => path.basename(filePath)), ["aaa.jsonl", "bbb.jsonl"]);
});

test("findMatchingSessions can include subdirectory cwd matches", async () => {
  const currentDir = await makeTempDir("claude-subdir-workspace");
  const childDir = path.join(currentDir, "packages", "web");
  const siblingDir = await makeTempDir("claude-subdir-sibling");
  const sessionsRoot = await makeTempDir("claude-subdir-projects");
  const targetDir = path.join(sessionsRoot, "-workspace");
  await fs.mkdir(childDir, { recursive: true });
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "aaa.jsonl"),
    `{"type":"user","message":{"role":"user","content":"root"},"timestamp":"2026-03-20T10:00:00.000Z","cwd":"${currentDir}","sessionId":"aaa"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "bbb.jsonl"),
    `{"type":"user","message":{"role":"user","content":"child"},"timestamp":"2026-03-20T11:00:00.000Z","cwd":"${childDir}","sessionId":"bbb"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "ccc.jsonl"),
    `{"type":"user","message":{"role":"user","content":"sibling"},"timestamp":"2026-03-20T12:00:00.000Z","cwd":"${siblingDir}","sessionId":"ccc"}\n`,
    "utf8",
  );

  const strictMatches = await findMatchingSessions(sessionsRoot, { cwd: currentDir, agent: "claude" });
  const subtreeMatches = await findMatchingSessions(sessionsRoot, {
    cwd: currentDir,
    agent: "claude",
    includeSubdirs: true,
  });

  assert.deepEqual(strictMatches.map((filePath) => path.basename(filePath)), ["aaa.jsonl"]);
  assert.deepEqual(subtreeMatches.map((filePath) => path.basename(filePath)), ["aaa.jsonl", "bbb.jsonl"]);
});

test("findMatchingSessions skips unreadable Claude jsonl rows and keeps scanning", async () => {
  const currentDir = await makeTempDir("claude-corrupt-match-workspace");
  const sessionsRoot = await makeTempDir("claude-corrupt-projects");
  const targetDir = path.join(sessionsRoot, "-workspace");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "aaa.jsonl"),
    `{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-03-20T10:00:00.000Z","cwd":"${currentDir}","sessionId":"aaa"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "broken.jsonl"),
    `${String.fromCharCode(0, 0, 0)}{"type":"user","message":{"role":"user","content":"broken"},"timestamp":"2026-03-20T10:30:00.000Z","cwd":"${currentDir}","sessionId":"broken"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "bbb.jsonl"),
    `{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-03-20T11:00:00.000Z","cwd":"${currentDir}","sessionId":"bbb"}\n`,
    "utf8",
  );

  const matches = await findMatchingSessions(sessionsRoot, { cwd: currentDir, agent: "claude" });
  assert.deepEqual(matches.map((filePath) => path.basename(filePath)), ["aaa.jsonl", "bbb.jsonl"]);
});

test("findSessionById finds a Codex session by id", async () => {
  const sessionsRoot = path.join(__dirname, "..", "fixtures", "sessions");
  const found = await findSessionById(sessionsRoot, { agent: "codex", sessionId: "later" });
  assert.match(found, /later/);
});

test("chooseSessionPath fails clearly in non-interactive mode", async () => {
  await assert.rejects(
    chooseClaudeSessionPath(
      [
        {
          sessionPath: "/tmp/a.jsonl",
          sessionId: "aaa",
          updatedAt: "2026-03-21T10:00:00.000Z",
          title: "修一下登录页的 loading 状态",
        },
        {
          sessionPath: "/tmp/b.jsonl",
          sessionId: "bbb",
          updatedAt: "2026-03-21T11:00:00.000Z",
          title: "把 session bridge 做成可 resume",
        },
      ],
      { isInteractive: false },
    ),
    /Multiple Claude sessions match the current directory/,
  );
});

test("chooseSessionPath keeps full session titles in non-interactive errors", async () => {
  const longTitle = [
    "需要完整显示的超长 session 标题",
    "用于区分两个非常相似",
    "但关键结尾不同的候选记录",
    "并且不能被截断",
    "A",
  ].join(" ");

  await assert.rejects(
    chooseSessionPath(
      "Codex",
      [
        {
          sessionPath: "/tmp/a.jsonl",
          sessionId: "aaa",
          updatedAt: "2026-03-21T10:00:00.000Z",
          title: longTitle,
        },
        {
          sessionPath: "/tmp/b.jsonl",
          sessionId: "bbb",
          updatedAt: "2026-03-21T11:00:00.000Z",
          title: `${longTitle} B`,
        },
      ],
      { isInteractive: false },
    ),
    (error) => {
      assert.match(error.message, new RegExp(longTitle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
      assert.match(
        error.message,
        /需要完整显示的超长 session 标题 用于区分两个非常相似 但关键结尾不同的候选记录 并且不能被截断 A B/u,
      );
      assert.doesNotMatch(error.message, /\.\.\./);
      return true;
    },
  );
});

test("chooseSessionPath renders candidates as spaced cards with recent user messages", async () => {
  await assert.rejects(
    chooseSessionPath(
      "Codex",
      [
        {
          sessionPath: "/tmp/a.jsonl",
          sessionId: "aaa",
          updatedAt: "2026-03-21T10:00:00.000Z",
          title: "做一下 Claude export",
          recentUserMessages: ["做一下 Claude export", "顺手检查 qoder export", "这个报错要不要一起修"],
        },
        {
          sessionPath: "/tmp/b.jsonl",
          sessionId: "bbb",
          updatedAt: "2026-03-21T11:00:00.000Z",
          title: "总结一下你的上下文",
          recentUserMessages: ["总结一下你的上下文", "先不要改代码"],
        },
      ],
      { isInteractive: false },
    ),
    (error) => {
      assert.match(error.message, /\[1\] 做一下 Claude export/);
      assert.match(error.message, /Recent user messages:\n    - 做一下 Claude export\n    - 顺手检查 qoder export\n    - 这个报错要不要一起修/);
      assert.match(error.message, /\n\n\n\[2\] 总结一下你的上下文/);
      assert.match(error.message, /Path: \/tmp\/a\.jsonl/);
      return true;
    },
  );
});

test("chooseSessionPath returns interactive selection", async () => {
  const writes = [];
  const selected = await chooseSessionPath(
    "Codex",
    [
      {
        sessionPath: "/tmp/a.jsonl",
        sessionId: "aaa",
        updatedAt: "2026-03-21T10:00:00.000Z",
        title: "修一下登录页的 loading 状态",
      },
      {
        sessionPath: "/tmp/b.jsonl",
        sessionId: "bbb",
        updatedAt: "2026-03-21T11:00:00.000Z",
        title: "把 session bridge 做成可 resume",
      },
    ],
    {
      isInteractive: true,
      output: { write: (chunk) => writes.push(chunk) },
      prompt: async () => "2",
    },
  );

  assert.equal(selected, "/tmp/b.jsonl");
  assert.match(writes.join(""), /Multiple Codex sessions match the current directory/);
});

test("chooseSessionPath shows the selected card even when there is only one candidate", async () => {
  const writes = [];
  const selected = await chooseSessionPath(
    "Claude",
    [
      {
        sessionPath: "/tmp/only.jsonl",
        sessionId: "only",
        updatedAt: "2026-03-21T10:00:00.000Z",
        title: "唯一候选",
        recentUserMessages: ["最后一条用户消息"],
      },
    ],
    {
      isInteractive: false,
      output: { write: (chunk) => writes.push(chunk) },
    },
  );

  assert.equal(selected, "/tmp/only.jsonl");
  assert.match(writes.join(""), /\[1\] 唯一候选/);
  assert.match(writes.join(""), /Selected: only/);
});

test("cli --help only documents native export commands", async () => {
  const result = await spawnCli(["--help"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /kage <source> <target> \[options\]/);
  assert.match(result.stdout, /kage doctor \[--json\]/);
  assert.match(result.stdout, /kage sessions \[--agent claude\|codex\|qodercli\|qoderwork\] \[--since 90d\]/);
  assert.match(result.stdout, /kage search \[query\]/);
  assert.match(result.stdout, /kage actions \[--since 90d\]/);
  assert.match(result.stdout, /kage run-action <id> \[--include-subdirs\] \[--json\]/);
  assert.match(result.stdout, /kage serve \[--port 9876\]/);
  assert.match(result.stdout, /kage clean \[--confirm\] \[--older-than 7d\] \[--json\]/);
  assert.match(result.stdout, /kage completions bash\|zsh\|fish/);
  assert.match(result.stdout, /kage <route-alias> \[options\]/);
  assert.match(result.stdout, /c2v\s+claude -> visualize/);
  assert.match(result.stdout, /x2v\s+codex -> visualize/);
  assert.match(result.stdout, /q2v\s+qodercli -> visualize/);
  assert.match(result.stdout, /--preview/);
  assert.match(result.stdout, /--run/);
  assert.match(result.stdout, /--include-subdirs/);
  assert.match(result.stdout, /--port <number>/);
  assert.match(result.stdout, /--read-only/);
  assert.match(result.stdout, /--limit <n>/);
  assert.match(result.stdout, /--version/);
});

test("serve send command builder uses native non-interactive resume commands", () => {
  assert.deepEqual(
    buildAgentSendCommand({
      agent: "claude",
      sessionId: "claude-session",
      cwd: __dirname,
      message: "hello claude",
    }),
    {
      command: "claude",
      args: ["-r", "claude-session", "-p", "hello claude"],
      cwd: __dirname,
      stdin: null,
      target: "session",
    },
  );

  assert.deepEqual(
    buildAgentSendCommand({
      agent: "claude",
      cwd: __dirname,
      message: "new claude",
    }),
    {
      command: "claude",
      args: ["-p", "new claude"],
      cwd: __dirname,
      stdin: null,
      target: "new",
    },
  );

  assert.deepEqual(
    buildAgentSendCommand({
      agent: "codex",
      sessionId: "codex-session",
      cwd: __dirname,
      message: "hello codex",
    }),
    {
      command: "codex",
      args: ["exec", "resume", "codex-session", "-"],
      cwd: __dirname,
      stdin: "hello codex",
      target: "session",
    },
  );

  assert.deepEqual(
    buildAgentSendCommand({
      agent: "codex",
      cwd: __dirname,
      message: "new codex",
    }),
    {
      command: "codex",
      args: ["exec", "-"],
      cwd: __dirname,
      stdin: "new codex",
      target: "new",
    },
  );

  assert.deepEqual(
    buildAgentSendCommand({
      agent: "qodercli",
      sessionId: "qoder-session",
      cwd: __dirname,
      message: "hello qoder",
    }),
    {
      command: "qodercli",
      args: ["-w", __dirname, "-r", "qoder-session", "-p", "hello qoder"],
      cwd: __dirname,
      stdin: null,
      target: "session",
    },
  );

  assert.deepEqual(
    buildAgentSendCommand({
      agent: "qodercli",
      cwd: __dirname,
      message: "new qoder",
    }),
    {
      command: "qodercli",
      args: ["-w", __dirname, "-p", "new qoder"],
      cwd: __dirname,
      stdin: null,
      target: "new",
    },
  );

  assert.throws(() => buildAgentSendCommand({ agent: "qoderwork", sessionId: "id", cwd: __dirname, message: "hello" }), /read-only/);
});

test("runAgentSend waits for CLI completion and captures output", async () => {
  const binDir = await makeTempDir("kage-send-bin");
  const marker = path.join(binDir, "marker.txt");
  const codexPath = path.join(binDir, "codex");
  await writeExecutable(
    codexPath,
    `#!/bin/sh
input=$(cat)
printf "%s" "$input" > "$KAGE_SEND_MARKER"
printf "agent response: %s" "$input"
`,
  );

  const oldPath = process.env.PATH;
  const oldMarker = process.env.KAGE_SEND_MARKER;
  process.env.PATH = `${binDir}${path.delimiter}${oldPath || ""}`;
  process.env.KAGE_SEND_MARKER = marker;
  let result;

  try {
    const startedAt = Date.now();
    result = await runAgentSend({ agent: "codex", cwd: binDir, message: "background dispatch" }, { timeoutMs: 2_000 });
    assert.equal(result.status, "completed");
    assert.equal(result.command, "codex");
    assert.equal(result.target, "new");
    assert.equal(result.cwd, binDir);
    assert.equal(typeof result.pid, "number");
    assert.ok(Date.now() - startedAt < 1_500, "send should complete promptly after the fake CLI exits");
    assert.equal(result.stdout, "agent response: background dispatch");
    assert.equal(result.stderr, "");

    const markerText = await fs.readFile(marker, "utf8");
    assert.equal(markerText, "background dispatch");
  } finally {
    if (oldPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = oldPath;
    }
    if (oldMarker === undefined) {
      delete process.env.KAGE_SEND_MARKER;
    } else {
      process.env.KAGE_SEND_MARKER = oldMarker;
    }
  }
});

test("runAgentSend reports CLI failures and timeout cleanup", async () => {
  const failBinDir = await makeTempDir("kage-send-fail-bin");
  await writeExecutable(
    path.join(failBinDir, "codex"),
    `#!/bin/sh
cat >/dev/null
printf "rate limit reached" >&2
exit 7
`,
  );

  const oldPath = process.env.PATH;
  process.env.PATH = `${failBinDir}${path.delimiter}${oldPath || ""}`;
  try {
    await assert.rejects(
      () => runAgentSend({ agent: "codex", cwd: failBinDir, message: "will fail" }, { timeoutMs: 2_000 }),
      (error) => {
        assert.match(error.message, /rate limit reached/);
        assert.equal(error.result.status, "failed");
        assert.equal(error.result.code, 7);
        assert.equal(error.result.stderr, "rate limit reached");
        return true;
      },
    );
  } finally {
    if (oldPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = oldPath;
    }
  }

  const slowBinDir = await makeTempDir("kage-send-slow-bin");
  await writeExecutable(
    path.join(slowBinDir, "codex"),
    `#!/bin/sh
cat >/dev/null
sleep 5
`,
  );

  process.env.PATH = `${slowBinDir}${path.delimiter}${oldPath || ""}`;
  try {
    await assert.rejects(
      () => runAgentSend({ agent: "codex", cwd: slowBinDir, message: "will timeout" }, { timeoutMs: 100 }),
      /did not finish within/,
    );
  } finally {
    if (oldPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = oldPath;
    }
  }
});

test("serve API returns structured transcript blocks", async () => {
  const server = createKageServeServer({ cwd: __dirname });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
    const { port } = server.address();
    const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
    const url = new URL(`http://127.0.0.1:${port}/api/transcript`);
    url.searchParams.set("path", sessionPath);
    url.searchParams.set("agent", "codex");
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.mode, "transcript");
    assert.equal(payload.agent, "codex");
    assert.equal(payload.messages[0].blocks[0].type, "text");
    assert.equal(typeof payload.messages[0].blocks[0].content, "string");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("serve API preserves native thinking and tool result blocks", async () => {
  const server = createKageServeServer({ cwd: __dirname });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
    const { port } = server.address();
    const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
    const url = new URL(`http://127.0.0.1:${port}/api/transcript`);
    url.searchParams.set("path", sessionPath);
    url.searchParams.set("agent", "claude");
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const payload = await response.json();
    const assistant = payload.messages.find((message) => message.role === "assistant");
    assert.deepEqual(assistant.blocks.map((block) => block.type), ["thinking", "text"]);
    assert.ok(payload.messages.find((message) => message.blocks.some((block) => block.type === "tool_result")));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("serve root exposes installable PWA assets", async () => {
  const server = createKageServeServer({ cwd: __dirname });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
    const { port } = server.address();
    const root = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(root.status, 200);
    const html = await root.text();
    assert.match(html, /rel="manifest"/);
    assert.match(html, /serviceWorker/);
    assert.match(html, /window\.__KAGE_CONFIG__ = \{"passwordRequired":false,"sendEnabled":true\};/);

    const manifest = await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`);
    assert.equal(manifest.status, 200);
    assert.equal((await manifest.json()).display, "standalone");

    const serviceWorker = await fetch(`http://127.0.0.1:${port}/sw.js`);
    assert.equal(serviceWorker.status, 200);
    assert.match(await serviceWorker.text(), /skipWaiting/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("serve sessions API accepts workspace query and returns workspace context", async () => {
  const fakeHome = await makeTempDir("serve-sessions-workspace-home");
  const cwdA = await makeTempDir("serve-sessions-cwd-a");
  const cwdB = await makeTempDir("serve-sessions-cwd-b");
  const codexRootA = path.join(fakeHome, ".codex", "sessions", "2026", "06");
  const codexRootB = path.join(fakeHome, ".codex", "sessions", "2026", "07");
  await fs.mkdir(codexRootA, { recursive: true });
  await fs.mkdir(codexRootB, { recursive: true });

  await fs.writeFile(
    path.join(codexRootA, "session-a.jsonl"),
    [
      `{"timestamp":"2026-06-05T10:00:00.000Z","type":"session_meta","payload":{"id":"session-a","cwd":"${cwdA}","timestamp":"2026-06-05T10:00:00.000Z"}}\n`,
      `{"timestamp":"2026-06-05T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"work from a"}]}}\n`,
    ].join(""),
    "utf8",
  );

  await fs.writeFile(
    path.join(codexRootB, "session-b.jsonl"),
    [
      `{"timestamp":"2026-06-05T11:00:00.000Z","type":"session_meta","payload":{"id":"session-b","cwd":"${cwdB}","timestamp":"2026-06-05T11:00:00.000Z"}}\n`,
      `{"timestamp":"2026-06-05T11:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"work from b"}]}}\n`,
    ].join(""),
    "utf8",
  );

  const oldHome = process.env.HOME;
  process.env.HOME = fakeHome;
  const server = createKageServeServer({ cwd: cwdA });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
  const { port } = server.address();
  const canonicalA = await canonicalPath(cwdA);
  const canonicalB = await canonicalPath(cwdB);

    const defaultUrl = new URL(`http://127.0.0.1:${port}/api/sessions`);
    const defaultResponse = await fetch(defaultUrl);
    assert.equal(defaultResponse.status, 200);
    const defaultPayload = await defaultResponse.json();
    assert.equal(defaultPayload.mode, "sessions");
    assert.equal(await canonicalPath(defaultPayload.cwd), canonicalA);
    assert.equal(await canonicalPath(defaultPayload.selectedWorkspace), canonicalA);
    assert.equal(await canonicalPath(defaultPayload.sessions[0]?.cwd), canonicalA);

    const workspaceBUrl = new URL(`http://127.0.0.1:${port}/api/sessions`);
    workspaceBUrl.searchParams.set("workspace", cwdB);
    const workspaceBResponse = await fetch(workspaceBUrl);
    assert.equal(workspaceBResponse.status, 200);
    const workspaceBPayload = await workspaceBResponse.json();
    assert.equal(await canonicalPath(workspaceBPayload.cwd), canonicalB);
    assert.equal(await canonicalPath(workspaceBPayload.selectedWorkspace), canonicalB);
    assert.equal(workspaceBPayload.sessions.length, 1);
    assert.equal(await canonicalPath(workspaceBPayload.sessions[0].cwd), canonicalB);
    assert.equal(workspaceBPayload.workspaces.length, 1);
    assert.equal(await canonicalPath(workspaceBPayload.workspaces[0]), canonicalB);
    assert.deepEqual(await Promise.all((workspaceBPayload.workspaces || []).map((value) => canonicalPath(value))), [canonicalB]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (oldHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = oldHome;
    }
  }
});

test("serve sessions API supports all-workspaces mode", async () => {
  const fakeHome = await makeTempDir("serve-sessions-all-home");
  const workspaceA = await makeTempDir("serve-sessions-all-workspace-a");
  const workspaceB = await makeTempDir("serve-sessions-all-workspace-b");
  const codexRootA = path.join(fakeHome, ".codex", "sessions", "2026", "06");
  const codexRootB = path.join(fakeHome, ".codex", "sessions", "2026", "07");
  await fs.mkdir(codexRootA, { recursive: true });
  await fs.mkdir(codexRootB, { recursive: true });

  await fs.writeFile(
    path.join(codexRootA, "session-a.jsonl"),
    [
      `{"timestamp":"2026-06-05T09:00:00.000Z","type":"session_meta","payload":{"id":"session-a","cwd":"${workspaceA}","timestamp":"2026-06-05T09:00:00.000Z"}}\n`,
      `{"timestamp":"2026-06-05T09:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"from workspace A"}]}}\n`,
    ].join(""),
    "utf8",
  );

  await fs.writeFile(
    path.join(codexRootB, "session-b.jsonl"),
    [
      `{"timestamp":"2026-06-05T09:30:00.000Z","type":"session_meta","payload":{"id":"session-b","cwd":"${workspaceB}","timestamp":"2026-06-05T09:30:00.000Z"}}\n`,
      `{"timestamp":"2026-06-05T09:30:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"from workspace B"}]}}\n`,
    ].join(""),
    "utf8",
  );

  const oldHome = process.env.HOME;
  process.env.HOME = fakeHome;
  const server = createKageServeServer({ cwd: workspaceA });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
    const { port } = server.address();
    const url = new URL(`http://127.0.0.1:${port}/api/sessions`);
    url.searchParams.set("all", "1");
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.mode, "sessions");
    assert.equal(payload.selectedWorkspace, "__all_workspaces__");
    assert.equal(payload.sessions.length, 2);
    assert.equal(await canonicalPath(payload.cwd), await canonicalPath(fakeHome));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (oldHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = oldHome;
    }
  }
});

test("serve sessions API accepts cwd alias and returns matching workspace", async () => {
  const fakeHome = await makeTempDir("serve-sessions-cwd-alias-home");
  const cwdAlias = await makeTempDir("serve-sessions-cwd-alias");
  const codexProject = path.join(fakeHome, ".codex", "sessions", "2026", "06");
  await fs.mkdir(codexProject, { recursive: true });
  await fs.writeFile(
    path.join(codexProject, "session-cwd-alias.jsonl"),
    [
      `{"timestamp":"2026-06-05T12:00:00.000Z","type":"session_meta","payload":{"id":"session-cwd-alias","cwd":"${cwdAlias}","timestamp":"2026-06-05T12:00:00.000Z"}}\n`,
      `{"timestamp":"2026-06-05T12:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"from cwd alias"}]}}\n`,
    ].join(""),
    "utf8",
  );

  const oldHome = process.env.HOME;
  process.env.HOME = fakeHome;
  const server = createKageServeServer({ cwd: cwdAlias });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
    const { port } = server.address();
    const canonicalAlias = await canonicalPath(cwdAlias);

    const url = new URL(`http://127.0.0.1:${port}/api/sessions`);
    url.searchParams.set("cwd", cwdAlias);
    const response = await fetch(url);
    assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "sessions");
  assert.equal(await canonicalPath(payload.cwd), canonicalAlias);
  assert.equal(await canonicalPath(payload.selectedWorkspace), canonicalAlias);
  assert.equal(await canonicalPath(payload.sessions[0]?.cwd), canonicalAlias);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (oldHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = oldHome;
    }
  }
});

test("serve projects API aggregates workspaces across local agent roots", async () => {
  const fakeHome = await makeTempDir("serve-projects-home");
  const workspaceA = await makeTempDir("serve-projects-workspace-a");
  const workspaceB = await makeTempDir("serve-projects-workspace-b");
  const codexProject = path.join(fakeHome, ".codex", "sessions", "2026", "06");
  const claudeProject = path.join(fakeHome, ".claude", "projects", "-workspace-a");
  const qoderProject = path.join(fakeHome, ".qoder", "projects", "-workspace-a");
  const qoderWorkProject = path.join(fakeHome, ".qoderwork", "projects", "-workspace-a");

  await fs.mkdir(codexProject, { recursive: true });
  await fs.mkdir(claudeProject, { recursive: true });
  await fs.mkdir(qoderProject, { recursive: true });
  await fs.mkdir(qoderWorkProject, { recursive: true });

  await fs.writeFile(
    path.join(codexProject, "session-codex.jsonl"),
    `{"timestamp":"2026-06-05T10:00:00.000Z","type":"session_meta","payload":{"id":"codex","cwd":"${workspaceA}","timestamp":"2026-06-05T10:00:00.000Z"}}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(claudeProject, "session-claude.jsonl"),
    `{"type":"user","message":{"role":"user","content":"work from claude"},"timestamp":"2026-06-05T11:00:00.000Z","cwd":"${workspaceB}","sessionId":"claude"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(qoderProject, "session-qoder.jsonl"),
    `{"type":"user","message":{"role":"user","content":"work from qoder"},"timestamp":"2026-06-05T12:00:00.000Z","cwd":"${workspaceA}","sessionId":"qoder"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(qoderWorkProject, "session-qoderwork.jsonl"),
    `{"type":"user","message":{"role":"user","content":"work from qoderwork"},"timestamp":"2026-06-05T13:00:00.000Z","cwd":"${workspaceA}","sessionId":"qoderwork"}\n`,
    "utf8",
  );

  const oldHome = process.env.HOME;
  process.env.HOME = fakeHome;
  const server = createKageServeServer({ cwd: __dirname });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
    const { port } = server.address();
    const url = new URL(`http://127.0.0.1:${port}/api/projects`);
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.mode, "projects");
    assert.equal(Array.isArray(payload.workspaces), true);
    const resolvedWorkspaces = await Promise.all((payload.workspaces || []).map((entry) => canonicalPath(entry)));
    const expected = await Promise.all([workspaceA, workspaceB].map((entry) => canonicalPath(entry)));
    assert.deepEqual(Array.isArray(payload.errors) ? payload.errors : null, []);
    assert.deepEqual(resolvedWorkspaces.sort(), expected.sort());
    assert.equal(payload.selectedWorkspace, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (oldHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = oldHome;
    }
  }
});

test("serve projects API validates workspace query and includeSubdirs flag", async () => {
  const fakeHome = await makeTempDir("serve-projects-validation-home");
  const workspaceRoot = await makeTempDir("serve-projects-validation-root");
  const workspaceChild = path.join(workspaceRoot, "child");
  await fs.mkdir(workspaceChild, { recursive: true });
  const codexProject = path.join(fakeHome, ".codex", "sessions", "2026", "06");
  await fs.mkdir(codexProject, { recursive: true });
  await fs.writeFile(
    path.join(codexProject, "session-validation.jsonl"),
    `{"timestamp":"2026-06-05T14:00:00.000Z","type":"session_meta","payload":{"id":"validation","cwd":"${workspaceChild}","timestamp":"2026-06-05T14:00:00.000Z"}}\n`,
    "utf8",
  );

  const oldHome = process.env.HOME;
  process.env.HOME = fakeHome;
  const server = createKageServeServer({ cwd: __dirname });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
    const { port } = server.address();

    const includeSubdirsUrl = new URL(`http://127.0.0.1:${port}/api/projects`);
    includeSubdirsUrl.searchParams.set("workspace", workspaceRoot);
    const includeSubdirsResponse = await fetch(includeSubdirsUrl);
    assert.equal(includeSubdirsResponse.status, 200);
    const includeSubdirsPayload = await includeSubdirsResponse.json();
    assert.equal(includeSubdirsPayload.workspaceValidation.valid, true);
    assert.equal(includeSubdirsPayload.workspaceValidation.includeSubdirs, true);

    const strictUrl = new URL(`http://127.0.0.1:${port}/api/projects`);
    strictUrl.searchParams.set("workspace", workspaceRoot);
    strictUrl.searchParams.set("includeSubdirs", "false");
    const strictPayload = await (await fetch(strictUrl)).json();
    assert.equal(strictPayload.workspaceValidation.valid, false);
    assert.equal(strictPayload.workspaceValidation.includeSubdirs, false);
    assert.equal(strictPayload.workspaceValidation.reason, "The requested workspace does not match any known project.");

    const aliasUrl = new URL(`http://127.0.0.1:${port}/api/projects`);
    aliasUrl.searchParams.set("cwd", workspaceChild);
    const aliasPayload = await (await fetch(aliasUrl)).json();
    assert.equal(aliasPayload.workspaceValidation.valid, true);
    assert.equal(aliasPayload.workspaceValidation.includeSubdirs, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (oldHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = oldHome;
    }
  }
});

test("serve password mode loads the page and protects APIs", async () => {
  const server = createKageServeServer({ cwd: __dirname, password: "1234" });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
    const { port } = server.address();
    const root = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(root.status, 200);
    assert.match(await root.text(), /window\.__KAGE_CONFIG__ = \{"passwordRequired":true,"sendEnabled":true\};/);

    const unauthorized = await fetch(`http://127.0.0.1:${port}/api/doctor`);
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(`http://127.0.0.1:${port}/api/doctor`, {
      headers: { Authorization: "Bearer 1234" },
    });
    assert.equal(authorized.status, 200);
    assert.equal((await authorized.json()).mode, "doctor");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("serve send API is disabled in read-only mode", async () => {
  const server = createKageServeServer({ cwd: __dirname, allowSend: false });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "claude", sessionId: "id", message: "hello" }),
    });
    assert.equal(response.status, 403);
  assert.match((await response.json()).error, /--read-only/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("serve send API is enabled by default", async () => {
  const calls = [];
  const server = createKageServeServer({
    cwd: __dirname,
    sendRunner: async (payload) => {
      calls.push(payload);
      return { ok: true, target: payload.sessionId ? "session" : "new", command: "fake", cwd: payload.cwd, stdout: "sent", stderr: "" };
    },
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "codex", cwd: __dirname, message: "new arbitrary prompt" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.mode, "send");
    assert.equal(body.target, "new");
    assert.deepEqual(calls, [
      {
        agent: "codex",
        sessionId: undefined,
        cwd: __dirname,
        message: "new arbitrary prompt",
        fallbackCwd: __dirname,
      },
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("serve send API rejects concurrent sends to the same target", async () => {
  let releaseSend;
  let firstSendStartedResolve;
  const firstSendStarted = new Promise((resolve) => {
    firstSendStartedResolve = resolve;
  });

  const server = createKageServeServer({
    cwd: __dirname,
    sendRunner: async (payload) => {
      firstSendStartedResolve(payload);
      await new Promise((release) => {
        releaseSend = release;
      });
      return { ok: true, target: "session", command: "fake", cwd: payload.cwd, status: "completed" };
    },
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
    const { port } = server.address();
    const firstResponsePromise = fetch(`http://127.0.0.1:${port}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "claude", sessionId: "same-session", cwd: __dirname, message: "first" }),
    });
    const firstPayload = await firstSendStarted;
    assert.equal(firstPayload.message, "first");

    const secondResponse = await fetch(`http://127.0.0.1:${port}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "claude", sessionId: "same-session", cwd: __dirname, message: "second" }),
    });
    assert.equal(secondResponse.status, 409);
    assert.match((await secondResponse.json()).error, /already running/);

    releaseSend();
    const firstResponse = await firstResponsePromise;
    assert.equal(firstResponse.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("serve dispatch API tracks in-memory task lifecycle", async () => {
  let releaseSend;
  let sendStartedResolve;
  const sendStarted = new Promise((resolve) => {
    sendStartedResolve = resolve;
  });
  const server = createKageServeServer({
    cwd: __dirname,
    sendRunner: async (payload) => {
      sendStartedResolve(payload);
      await new Promise((release) => {
        releaseSend = release;
      });
      return {
        ok: true,
        target: "new",
        command: "fake",
        cwd: payload.cwd,
        status: "completed",
        stdout: "task done",
        stderr: "",
        durationMs: 42,
      };
    },
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
    const { port } = server.address();
    const dispatchResponse = await fetch(`http://127.0.0.1:${port}/api/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "codex", cwd: __dirname, message: "Build the board" }),
    });
    assert.equal(dispatchResponse.status, 202);
    const dispatchBody = await dispatchResponse.json();
    assert.equal(dispatchBody.mode, "dispatch");
    assert.equal(dispatchBody.task.status, "queued");
    assert.equal(dispatchBody.task.title, "Build the board");

    const payload = await sendStarted;
    assert.equal(payload.message, "Build the board");

    const duplicateResponse = await fetch(`http://127.0.0.1:${port}/api/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "codex", cwd: __dirname, message: "Build it again" }),
    });
    assert.equal(duplicateResponse.status, 409);

    const runningTasks = await (await fetch(`http://127.0.0.1:${port}/api/tasks`)).json();
    assert.equal(runningTasks.mode, "tasks");
    assert.equal(runningTasks.tasks[0].status, "running");

    releaseSend();
    let reviewTask;
    for (let index = 0; index < 20; index += 1) {
      const tasksBody = await (await fetch(`http://127.0.0.1:${port}/api/tasks`)).json();
      reviewTask = tasksBody.tasks.find((task) => task.id === dispatchBody.task.id);
      if (reviewTask?.status === "needs_review") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(reviewTask.status, "needs_review");
    assert.equal(reviewTask.progress, 90);
    assert.equal(reviewTask.stdout, "task done");
    assert.ok(reviewTask.logs.some((line) => /review|returned output/i.test(line)));

    const completeResponse = await fetch(`http://127.0.0.1:${port}/api/tasks/${encodeURIComponent(dispatchBody.task.id)}/complete`, {
      method: "POST",
    });
    assert.equal(completeResponse.status, 200);
    const completeBody = await completeResponse.json();
    assert.equal(completeBody.task.status, "completed");
    assert.equal(completeBody.task.progress, 100);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("serve dispatch API validates requests before launching an agent", async () => {
  const readOnlyServer = createKageServeServer({ cwd: __dirname, allowSend: false });
  await new Promise((resolve, reject) => {
    readOnlyServer.once("error", reject);
    readOnlyServer.listen(0, "127.0.0.1", () => {
      readOnlyServer.off("error", reject);
      resolve();
    });
  });
  try {
    const { port } = readOnlyServer.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "codex", cwd: __dirname, message: "blocked" }),
    });
    assert.equal(response.status, 403);
  } finally {
    await new Promise((resolve) => readOnlyServer.close(resolve));
  }

  const server = createKageServeServer({ cwd: __dirname });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  try {
    const { port } = server.address();
    const invalidJson = await fetch(`http://127.0.0.1:${port}/api/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(invalidJson.status, 400);
    assert.match((await invalidJson.json()).error, /Invalid JSON/);

    const missingMessage = await fetch(`http://127.0.0.1:${port}/api/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "codex", cwd: __dirname, message: "" }),
    });
    assert.equal(missingMessage.status, 400);
    assert.match((await missingMessage.json()).error, /Message is required/);

    const unsupportedAgent = await fetch(`http://127.0.0.1:${port}/api/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "qoderwork", cwd: __dirname, message: "run" }),
    });
    assert.equal(unsupportedAgent.status, 400);
    assert.match((await unsupportedAgent.json()).error, /supported dispatch agent/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("serve dispatch API retries failed tasks", async () => {
  let calls = 0;
  const server = createKageServeServer({
    cwd: __dirname,
    sendRunner: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("agent failed");
        error.result = { stdout: "", stderr: "boom", durationMs: 12 };
        throw error;
      }
      return {
        ok: true,
        target: "new",
        command: "fake",
        cwd: __dirname,
        status: "completed",
        stdout: "retry done",
        stderr: "",
        durationMs: 24,
      };
    },
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
    const { port } = server.address();
    const dispatchResponse = await fetch(`http://127.0.0.1:${port}/api/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "codex", cwd: __dirname, message: "Retry me" }),
    });
    assert.equal(dispatchResponse.status, 202);
    const dispatchBody = await dispatchResponse.json();

    let failedTask;
    for (let index = 0; index < 20; index += 1) {
      const tasksBody = await (await fetch(`http://127.0.0.1:${port}/api/tasks`)).json();
      failedTask = tasksBody.tasks.find((task) => task.id === dispatchBody.task.id);
      if (failedTask?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(failedTask.status, "failed");
    assert.equal(failedTask.stderr, "boom");

    const retryResponse = await fetch(`http://127.0.0.1:${port}/api/tasks/${encodeURIComponent(failedTask.id)}/retry`, {
      method: "POST",
    });
    assert.equal(retryResponse.status, 202);
    const retryBody = await retryResponse.json();
    assert.notEqual(retryBody.task.id, failedTask.id);

    let reviewTask;
    for (let index = 0; index < 20; index += 1) {
      const tasksBody = await (await fetch(`http://127.0.0.1:${port}/api/tasks`)).json();
      reviewTask = tasksBody.tasks.find((task) => task.id === retryBody.task.id);
      if (reviewTask?.status === "needs_review") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(reviewTask.status, "needs_review");
    assert.equal(reviewTask.stdout, "retry done");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("cli shows help with no arguments", async () => {
  const result = await spawnCli([]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage:/);
  assert.doesNotMatch(result.stderr, /Provide a supported source/);
});

test("cli supports --version", async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(__dirname, "..", "package.json"), "utf8"));
  const result = await spawnCli(["--version"]);

  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), `kage ${packageJson.version}`);
});

test("package.json exposes KAGE bin", async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(__dirname, "..", "package.json"), "utf8"));
  assert.deepEqual(Object.keys(packageJson.bin), ["kage"]);
  assert.equal(packageJson.bin.kage, "./src/cli.js");
});

test("cli rejects unknown flags", async () => {
  const result = await spawnCli(["x2c", "--wat"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown option: --wat/);
  assert.match(result.stderr, /kage --help/);
});

test("cli validates --split-recent as a positive integer", async () => {
  const result = await spawnCli([
    "claude",
    "qodercli",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    "--split-recent",
    "soon",
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /--split-recent requires a positive integer, got: soon/);
});

test("cli reports supported aliases for unknown route aliases", async () => {
  const result = await spawnCli(["z2z"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown route alias: z2z/);
  assert.match(result.stderr, /Supported aliases: x2x, x2c, x2q, x2v, c2c, c2x, c2q, c2v, q2q, q2x, q2c, q2v/);
  assert.match(result.stderr, /Run: kage update/);
});

test("cli rejects the legacy qoder agent name", async () => {
  const positional = await spawnCli(["qoder", "codex"]);
  const option = await spawnCli(["--agent", "qoder", "--target", "codex"]);

  assert.equal(positional.code, 1);
  assert.match(positional.stderr, /Unsupported agent: qoder\. Use qodercli instead\./);
  assert.equal(option.code, 1);
  assert.match(option.stderr, /Unsupported agent: qoder\. Use qodercli instead\./);
});

test("cli formats the QoderCLI label consistently", async () => {
  const currentDir = await makeTempDir("qodercli-label-workspace");
  const otherDir = await makeTempDir("qodercli-label-other");
  const sessionsRoot = await makeTempDir("qodercli-label-sessions");
  await fs.writeFile(
    path.join(sessionsRoot, "session.jsonl"),
    `{"type":"user","cwd":"${otherDir}","sessionId":"qodercli-other","message":{"role":"user","content":[{"type":"text","text":"not this workspace"}]}}\n`,
    "utf8",
  );

  const result = await spawnCli(["q", "--root", sessionsRoot], { cwd: currentDir });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /No QoderCLI sessions match the current directory/);
});

test("cli supports update command", async () => {
  const result = await spawnCli(["update"], {
    env: { ...process.env, KAGE_UPDATE_COMMAND: "printf 'Updated KAGE\\n'" },
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Updated KAGE/);
});

test("cli doctor emits machine-readable readiness checks", async () => {
  const fakeHome = await makeTempDir("doctor-home");
  const binDir = await makeTempDir("doctor-bin");
  await fs.mkdir(path.join(fakeHome, ".claude", "projects"), { recursive: true });
  await fs.mkdir(path.join(fakeHome, ".codex", "sessions"), { recursive: true });
  await fs.mkdir(path.join(fakeHome, ".qoder", "projects"), { recursive: true });
  await fs.mkdir(path.join(fakeHome, ".qoderwork", "projects"), { recursive: true });
  await writeExecutable(path.join(binDir, "claude"), "#!/bin/sh\necho 'claude 2.1.98'\n");
  await writeExecutable(path.join(binDir, "codex"), "#!/bin/sh\necho 'codex-cli 0.130.0'\n");
  await writeExecutable(path.join(binDir, "qodercli"), "#!/bin/sh\necho 'Qoder CLI v1.0.0'\n");

  const result = await spawnCli(["doctor", "--json"], {
    env: { ...process.env, HOME: fakeHome, PATH: binDir, KAGE_COMMAND_TIMEOUT_MS: "10000" },
  });
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.mode, "doctor");
  assert.equal(payload.ok, true);
  assert.equal(payload.agents.length, 4);
  assert.equal(payload.agents.find((agent) => agent.agent === "claude").version, "claude 2.1.98");
  assert.equal(payload.agents.find((agent) => agent.agent === "claude").resumeCommand, "cd <cwd> && claude --resume <session-id>");
  assert.equal(payload.agents.find((agent) => agent.agent === "codex").resumeCommand, "codex resume <session-id>");
  assert.equal(payload.agents.find((agent) => agent.agent === "qodercli").sessionRoot.exists, true);
  assert.equal(payload.agents.find((agent) => agent.agent === "qoderwork").commandRequired, false);
  assert.equal(payload.agents.find((agent) => agent.agent === "qoderwork").sessionRootRequired, false);
  assert.equal(payload.agents.find((agent) => agent.agent === "qoderwork").sessionRoot.exists, true);
});

test("cli doctor treats missing QoderWork storage as optional", async () => {
  const fakeHome = await makeTempDir("doctor-qoderwork-optional-home");
  const binDir = await makeTempDir("doctor-qoderwork-optional-bin");
  await fs.mkdir(path.join(fakeHome, ".claude", "projects"), { recursive: true });
  await fs.mkdir(path.join(fakeHome, ".codex", "sessions"), { recursive: true });
  await fs.mkdir(path.join(fakeHome, ".qoder", "projects"), { recursive: true });
  await writeExecutable(path.join(binDir, "claude"), "#!/bin/sh\necho 'claude 2.1.98'\n");
  await writeExecutable(path.join(binDir, "codex"), "#!/bin/sh\necho 'codex-cli 0.130.0'\n");
  await writeExecutable(path.join(binDir, "qodercli"), "#!/bin/sh\necho 'Qoder CLI v1.0.0'\n");

  const result = await spawnCli(["doctor", "--json"], {
    env: { ...process.env, HOME: fakeHome, PATH: binDir, KAGE_COMMAND_TIMEOUT_MS: "10000" },
  });
  const payload = JSON.parse(result.stdout);
  const qoderWork = payload.agents.find((agent) => agent.agent === "qoderwork");

  assert.equal(result.code, 0);
  assert.equal(payload.ok, true);
  assert.equal(qoderWork.commandRequired, false);
  assert.equal(qoderWork.sessionRootRequired, false);
  assert.equal(qoderWork.sessionRoot.exists, false);
});

test("cli sessions lists current-project sessions across agents as json", async () => {
  const fakeHome = await makeTempDir("sessions-home");
  const currentDir = await makeTempDir("sessions-workspace");
  const childDir = path.join(currentDir, "packages", "app");
  const claudeProject = path.join(fakeHome, ".claude", "projects", "-workspace");
  const codexProject = path.join(fakeHome, ".codex", "sessions", "2026", "05", "20");
  const qoderProject = path.join(fakeHome, ".qoder", "projects", "-workspace");
  const qoderWorkProject = path.join(fakeHome, ".qoderwork", "projects", "-workspace");
  await fs.mkdir(childDir, { recursive: true });
  await fs.mkdir(claudeProject, { recursive: true });
  await fs.mkdir(codexProject, { recursive: true });
  await fs.mkdir(qoderProject, { recursive: true });
  await fs.mkdir(qoderWorkProject, { recursive: true });
  await fs.writeFile(
    path.join(claudeProject, "claude-one.jsonl"),
    `{"type":"user","message":{"role":"user","content":"claude plan"},"timestamp":"2026-05-20T10:00:00.000Z","cwd":"${currentDir}","sessionId":"claude-one"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(codexProject, "rollout-codex-one.jsonl"),
    [
      `{"timestamp":"2026-05-20T10:00:00.000Z","type":"session_meta","payload":{"id":"codex-one","cwd":"${currentDir}"}}`,
      '{"timestamp":"2026-05-20T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"codex plan"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(codexProject, "rollout-codex-child.jsonl"),
    [
      `{"timestamp":"2026-05-20T10:05:00.000Z","type":"session_meta","payload":{"id":"codex-child","cwd":"${childDir}"}}`,
      '{"timestamp":"2026-05-20T10:05:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"child plan"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(qoderProject, "qoder-one.jsonl"),
    `{"type":"user","cwd":"${currentDir}","sessionId":"qoder-one","message":{"role":"user","content":[{"type":"text","text":"qoder plan"}]}}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(qoderWorkProject, "qoderwork-one.jsonl"),
    `{"type":"user","cwd":"${currentDir}","sessionId":"qoderwork-one","message":{"role":"user","content":[{"type":"text","text":"qoderwork plan"}]}}\n`,
    "utf8",
  );

  const result = await spawnCli(["sessions", "--json"], {
    cwd: currentDir,
    env: { ...process.env, HOME: fakeHome },
  });
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.mode, "sessions");
  assert.deepEqual(
    payload.sessions.map((session) => session.sessionId).sort(),
    ["claude-one", "codex-one", "qoder-one", "qoderwork-one"].sort(),
  );
  assert.equal(payload.sessions.find((session) => session.sessionId === "qoder-one").agent, "qodercli");
  assert.equal(payload.sessions.find((session) => session.sessionId === "qoderwork-one").agent, "qoderwork");

  const subtreeResult = await spawnCli(["sessions", "--include-subdirs", "--json"], {
    cwd: currentDir,
    env: { ...process.env, HOME: fakeHome },
  });
  const subtreePayload = JSON.parse(subtreeResult.stdout);
  assert.equal(subtreeResult.code, 0);
  assert.equal(subtreePayload.includeSubdirs, true);
  assert.deepEqual(
    subtreePayload.sessions.map((session) => session.sessionId).sort(),
    ["claude-one", "codex-child", "codex-one", "qoder-one", "qoderwork-one"].sort(),
  );

  const limitedResult = await spawnCli(["sessions", "--include-subdirs", "--limit", "2", "--json"], {
    cwd: currentDir,
    env: { ...process.env, HOME: fakeHome },
  });
  const limitedPayload = JSON.parse(limitedResult.stdout);
  assert.equal(limitedResult.code, 0);
  assert.equal(limitedPayload.filters.limit, 2);
  assert.equal(limitedPayload.sessions.length, 2);

  const sinceResult = await spawnCli(["sessions", "--include-subdirs", "--agent", "codex", "--since", "2026-05-20", "--json"], {
    cwd: currentDir,
    env: { ...process.env, HOME: fakeHome },
  });
  const sincePayload = JSON.parse(sinceResult.stdout);
  assert.equal(sinceResult.code, 0);
  assert.deepEqual(
    sincePayload.sessions.map((session) => session.sessionId).sort(),
    ["codex-child", "codex-one"].sort(),
  );
});

test("cli sessions applies --until before --limit", async () => {
  const fakeHome = await makeTempDir("sessions-until-home");
  const currentDir = await makeTempDir("sessions-until-workspace");
  const codexProject = path.join(fakeHome, ".codex", "sessions", "2026", "05", "20");
  await fs.mkdir(codexProject, { recursive: true });
  await fs.writeFile(
    path.join(codexProject, "rollout-z-new.jsonl"),
    [
      `{"timestamp":"2026-05-21T10:00:00.000Z","type":"session_meta","payload":{"id":"codex-new","cwd":"${currentDir}","timestamp":"2026-05-21T10:00:00.000Z"}}`,
      '{"timestamp":"2026-05-21T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"new plan"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(codexProject, "rollout-a-old.jsonl"),
    [
      `{"timestamp":"2026-05-19T10:00:00.000Z","type":"session_meta","payload":{"id":"codex-old","cwd":"${currentDir}","timestamp":"2026-05-19T10:00:00.000Z"}}`,
      '{"timestamp":"2026-05-19T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"old plan"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const result = await spawnCli(["sessions", "--agent", "codex", "--until", "2026-05-20", "--limit", "1", "--json"], {
    cwd: currentDir,
    env: { ...process.env, HOME: fakeHome },
  });
  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.deepEqual(payload.sessions.map((session) => session.sessionId), ["codex-old"]);
});

test("cli desktop-state returns sessions and actions from one inventory", async () => {
  const fakeHome = await makeTempDir("desktop-state-home");
  const currentDir = await makeTempDir("desktop-state-workspace");
  const codexProject = path.join(fakeHome, ".codex", "sessions", "2026", "06", "03");
  await fs.mkdir(codexProject, { recursive: true });
  await fs.writeFile(
    path.join(codexProject, "rollout-codex-desktop.jsonl"),
    [
      `{"timestamp":"2026-06-03T10:00:00.000Z","type":"session_meta","payload":{"id":"codex-desktop","cwd":"${currentDir}"}}`,
      '{"timestamp":"2026-06-03T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"desktop state plan"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const result = await spawnCli(["desktop-state", "--since", "90d", "--limit", "120", "--json"], {
    cwd: currentDir,
    env: { ...process.env, HOME: fakeHome },
  });
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.mode, "desktop-state");
  assert.equal(await canonicalPath(payload.cwd), await canonicalPath(currentDir));
  assert.deepEqual(payload.sessions.map((session) => session.sessionId), ["codex-desktop"]);
  assert.ok(payload.actions.find((action) => action.id === "resume:codex:codex-desktop"));
  assert.ok(payload.actions.find((action) => action.id === "fork:x2x:codex-desktop"));
  assert.ok(payload.actions.find((action) => action.id === "bridge:x2c:codex-desktop"));
});

test("cli sessions persists and reuses session metadata cache", async () => {
  const fakeHome = await makeTempDir("session-cache-home");
  const currentDir = await makeTempDir("session-cache-workspace");
  const cacheDir = await makeTempDir("session-cache-store");
  const cachePath = path.join(cacheDir, "session-metadata.json");
  const codexProject = path.join(fakeHome, ".codex", "sessions", "2026", "06", "03");
  const sessionFile = path.join(codexProject, "rollout-codex-cache.jsonl");
  await fs.mkdir(codexProject, { recursive: true });
  await fs.writeFile(
    sessionFile,
    [
      `{"timestamp":"2026-06-03T10:00:00.000Z","type":"session_meta","payload":{"id":"codex-cache","cwd":"${currentDir}"}}`,
      '{"timestamp":"2026-06-03T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"cache me"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const env = { ...process.env, HOME: fakeHome, KAGE_SESSION_CACHE_PATH: cachePath };
  const firstResult = await spawnCli(["sessions", "--agent", "codex", "--json"], {
    cwd: currentDir,
    env,
  });
  const firstPayload = JSON.parse(firstResult.stdout);
  assert.equal(firstResult.code, 0);
  assert.deepEqual(firstPayload.sessions.map((session) => session.sessionId), ["codex-cache"]);

  const firstCache = JSON.parse(await fs.readFile(cachePath, "utf8"));
  const cacheEntry = firstCache.entries[`codex:${sessionFile}`];
  assert.equal(firstCache.version, 1);
  assert.equal(cacheEntry.summary.sessionId, "codex-cache");
  assert.deepEqual(cacheEntry.summary.recentUserMessages, ["cache me"]);

  const secondResult = await spawnCli(["sessions", "--agent", "codex", "--json"], {
    cwd: currentDir,
    env,
  });
  const secondPayload = JSON.parse(secondResult.stdout);
  const secondCache = JSON.parse(await fs.readFile(cachePath, "utf8"));
  assert.equal(secondResult.code, 0);
  assert.deepEqual(secondPayload.sessions, firstPayload.sessions);
  assert.equal(secondCache.entries[`codex:${sessionFile}`].cachedAt, cacheEntry.cachedAt);
});

test("cli search finds sessions by query, agent, project, and date filters", async () => {
  const fakeHome = await makeTempDir("search-home");
  const currentDir = await makeTempDir("search-current");
  const childDir = path.join(currentDir, "packages", "ui");
  const otherDir = await makeTempDir("search-other");
  const claudeProject = path.join(fakeHome, ".claude", "projects", "-current");
  const codexProject = path.join(fakeHome, ".codex", "sessions", "2026", "05", "20");
  await fs.mkdir(childDir, { recursive: true });
  await fs.mkdir(claudeProject, { recursive: true });
  await fs.mkdir(codexProject, { recursive: true });
  await fs.mkdir(path.join(fakeHome, ".qoder", "projects"), { recursive: true });
  await fs.writeFile(
    path.join(claudeProject, "claude-auth.jsonl"),
    `{"type":"user","message":{"role":"user","content":"fix auth login"},"timestamp":"2026-05-20T10:00:00.000Z","cwd":"${currentDir}","sessionId":"claude-auth"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(codexProject, "rollout-codex-auth.jsonl"),
    [
      `{"timestamp":"2026-05-20T11:00:00.000Z","type":"session_meta","payload":{"id":"codex-auth","cwd":"${otherDir}","timestamp":"2026-05-20T11:00:00.000Z"}}`,
      '{"timestamp":"2026-05-20T11:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"billing auth check"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(codexProject, "rollout-codex-child.jsonl"),
    [
      `{"timestamp":"2026-05-20T12:00:00.000Z","type":"session_meta","payload":{"id":"codex-child","cwd":"${childDir}","timestamp":"2026-05-20T12:00:00.000Z"}}`,
      '{"timestamp":"2026-05-20T12:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"child auth check"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const allResult = await spawnCli(["search", "auth", "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });
  const allPayload = JSON.parse(allResult.stdout);
  assert.equal(allResult.code, 0);
  assert.deepEqual(
    allPayload.results.map((session) => session.sessionId).sort(),
    ["claude-auth", "codex-auth", "codex-child"].sort(),
  );

  const limitedResult = await spawnCli(["search", "auth", "--limit", "1", "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });
  const limitedPayload = JSON.parse(limitedResult.stdout);
  assert.equal(limitedResult.code, 0);
  assert.equal(limitedPayload.filters.limit, 1);
  assert.equal(limitedPayload.results.length, 1);

  const filteredResult = await spawnCli(
    [
      "search",
      "auth",
      "--agent",
      "claude",
      "--project",
      currentDir,
      "--since",
      "2026-05-19",
      "--until",
      "2026-05-20",
      "--json",
    ],
    {
      env: { ...process.env, HOME: fakeHome },
    },
  );
  const filteredPayload = JSON.parse(filteredResult.stdout);
  assert.equal(filteredResult.code, 0);
  assert.deepEqual(filteredPayload.results.map((session) => session.sessionId), ["claude-auth"]);
  assert.equal(filteredPayload.results[0].match.field, "title");

  const strictChildResult = await spawnCli(["search", "child", "--project", currentDir, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });
  const strictChildPayload = JSON.parse(strictChildResult.stdout);
  assert.equal(strictChildResult.code, 0);
  assert.deepEqual(strictChildPayload.results, []);

  const subtreeChildResult = await spawnCli(
    ["search", "child", "--project", currentDir, "--include-subdirs", "--json"],
    {
      env: { ...process.env, HOME: fakeHome },
    },
  );
  const subtreeChildPayload = JSON.parse(subtreeChildResult.stdout);
  assert.equal(subtreeChildResult.code, 0);
  assert.equal(subtreeChildPayload.filters.includeSubdirs, true);
  assert.deepEqual(subtreeChildPayload.results.map((session) => session.sessionId), ["codex-child"]);

  const emptyResult = await spawnCli(["search", "--agent", "claude", "--since", "2099-01-01", "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });
  const emptyPayload = JSON.parse(emptyResult.stdout);
  assert.equal(emptyResult.code, 0);
  assert.deepEqual(emptyPayload.results, []);

  const invalidResult = await spawnCli(["search", "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });
  assert.equal(invalidResult.code, 1);
  assert.match(invalidResult.stderr, /requires a query or at least one filter/);
});

test("cli actions and run-action expose menu-bar friendly operations", async () => {
  const fakeHome = await makeTempDir("actions-home");
  const currentDir = await makeTempDir("actions-workspace");
  const claudeProject = path.join(fakeHome, ".claude", "projects", "-workspace");
  const subagentDir = path.join(claudeProject, "sub-parent-session", "subagents");
  await fs.mkdir(claudeProject, { recursive: true });
  await fs.mkdir(subagentDir, { recursive: true });
  await fs.writeFile(
    path.join(claudeProject, "claude-older.jsonl"),
    `{"type":"user","message":{"role":"user","content":"older bridge candidate"},"timestamp":"2026-05-20T09:00:00.000Z","cwd":"${currentDir}","sessionId":"claude-older"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(claudeProject, "zz-claude-action.jsonl"),
    `{"type":"user","message":{"role":"user","content":"ship the app contract"},"timestamp":"2026-05-20T10:00:00.000Z","cwd":"${currentDir}","sessionId":"claude-action"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(subagentDir, "agent-a84b9e0573383693e.jsonl"),
    `{"type":"user","message":{"role":"user","content":"subagent should not resume"},"timestamp":"2026-05-20T11:00:00.000Z","cwd":"${currentDir}","sessionId":"sub-parent-session"}\n`,
    "utf8",
  );

  const actionsResult = await spawnCli(["actions", "--agent", "claude", "--json"], {
    cwd: currentDir,
    env: { ...process.env, HOME: fakeHome },
  });
  const payload = JSON.parse(actionsResult.stdout);
  const resumeAction = payload.actions.find((action) => action.type === "resume");

  assert.equal(actionsResult.code, 0);
  assert.equal(payload.mode, "actions");
  assert.equal(resumeAction.id, "resume:claude:claude-action");
  assert.equal(resumeAction.command, `cd ${currentDir} && claude --resume claude-action`);
  assert.equal(resumeAction.isLatest, true);
  assert.ok(payload.actions.find((action) => action.id === "resume:claude:claude-older"));
  assert.ok(payload.actions.find((action) => action.id === "fork:c2c:claude-action"));
  assert.ok(payload.actions.find((action) => action.id === "bridge:c2x:claude-action"));
  assert.ok(payload.actions.find((action) => action.id === "bridge:c2q:claude-action"));
  assert.ok(!payload.actions.find((action) => action.sessionPath?.includes("/subagents/")));
  assert.ok(!payload.actions.find((action) => action.id === "resume:claude:sub-parent-session"));
  assert.equal(payload.actions.find((action) => action.id === "bridge:c2x:claude-older").isLatest, false);

  const runResult = await spawnCli(["run-action", resumeAction.id, "--agent", "claude", "--json"], {
    cwd: currentDir,
    env: { ...process.env, HOME: fakeHome, KAGE_RUN_COMMAND: "printf 'ACTION_OK\\n'" },
  });

  assert.equal(runResult.code, 0);
  const runPayload = JSON.parse(runResult.stdout);
  assert.equal(runPayload.mode, "run-action");
  assert.equal(runPayload.ok, true);
  assert.equal(runPayload.resumeCommand, `cd ${currentDir} && claude --resume claude-action`);
  assert.match(runPayload.stdout, /ACTION_OK/);

  const bridgeAction = payload.actions.find((action) => action.id === "bridge:c2x:claude-action");
  const bridgeResult = await spawnCli(["run-action", bridgeAction.id, "--agent", "claude", "--json"], {
    cwd: currentDir,
    env: { ...process.env, HOME: fakeHome },
  });
  const bridgePayload = JSON.parse(bridgeResult.stdout);

  assert.equal(bridgeResult.code, 0);
  assert.equal(bridgePayload.mode, "run-action");
  assert.equal(bridgePayload.action.id, bridgeAction.id);
  assert.equal(bridgePayload.targetAgent, "codex");
  assert.equal(bridgePayload.resumeCommand, "codex resume claude-action");
  assert.match(bridgePayload.outputPath, /rollout-claude-action\.jsonl$/);
  assert.ok(Array.isArray(bridgePayload.paths));
  assert.equal(bridgePayload.result.resumeCommand, "codex resume claude-action");

  const forkAction = payload.actions.find((action) => action.id === "fork:c2c:claude-action");
  const forkResult = await spawnCli(["run-action", forkAction.id, "--agent", "claude", "--json"], {
    cwd: currentDir,
    env: { ...process.env, HOME: fakeHome },
  });
  const forkPayload = JSON.parse(forkResult.stdout);

  assert.equal(forkResult.code, 0);
  assert.equal(forkPayload.mode, "run-action");
  assert.equal(forkPayload.action.type, "fork");
  assert.equal(forkPayload.targetAgent, "claude");
  assert.match(forkPayload.resumeCommand, new RegExp(`^cd ${currentDir} && claude --resume [0-9a-f-]{36}$`, "u"));
  assert.match(forkPayload.outputPath, /\.claude\/projects\/.*\/[0-9a-f-]{36}\.jsonl$/u);

  const refreshedSessions = await spawnCli(["sessions", "--agent", "claude", "--json"], {
    cwd: currentDir,
    env: { ...process.env, HOME: fakeHome },
  });
  const refreshedPayload = JSON.parse(refreshedSessions.stdout);
  const forkedSession = refreshedPayload.sessions.find((session) => session.path === forkPayload.outputPath);
  assert.equal(forkedSession.lineage.forkType, "fork");
  assert.equal(forkedSession.lineage.parentAgent, "claude");
  assert.equal(forkedSession.lineage.parentSessionId, "claude-action");
});

test("cli actions expose QoderWork as replay and bridge source only", async () => {
  const fakeHome = await makeTempDir("qoderwork-actions-home");
  const currentDir = await makeTempDir("qoderwork-actions-workspace");
  const qoderWorkProject = path.join(fakeHome, ".qoderwork", "projects", "-workspace");
  await fs.mkdir(qoderWorkProject, { recursive: true });
  await fs.writeFile(
    path.join(qoderWorkProject, "qoderwork-action.jsonl"),
    `{"type":"user","cwd":"${currentDir}","sessionId":"qoderwork-action","message":{"role":"user","content":[{"type":"text","text":"ship qoderwork support"}]}}\n`,
    "utf8",
  );

  const actionsResult = await spawnCli(["actions", "--agent", "qoderwork", "--json"], {
    cwd: currentDir,
    env: { ...process.env, HOME: fakeHome },
  });
  const payload = JSON.parse(actionsResult.stdout);

  assert.equal(actionsResult.code, 0);
  assert.ok(!payload.actions.find((action) => action.type === "resume"));
  assert.ok(!payload.actions.find((action) => action.type === "fork"));
  assert.ok(payload.actions.find((action) => action.id === "replay:qoderwork:qoderwork-action"));
  assert.ok(payload.actions.find((action) => action.id === "bridge:qoderwork:codex:qoderwork-action"));
  assert.ok(payload.actions.find((action) => action.id === "bridge:qoderwork:claude:qoderwork-action"));
  assert.ok(payload.actions.find((action) => action.id === "bridge:qoderwork:qodercli:qoderwork-action"));

  const bridgeAction = payload.actions.find((action) => action.id === "bridge:qoderwork:codex:qoderwork-action");
  const bridgeResult = await spawnCli(["run-action", bridgeAction.id, "--agent", "qoderwork", "--json"], {
    cwd: currentDir,
    env: { ...process.env, HOME: fakeHome },
  });
  const bridgePayload = JSON.parse(bridgeResult.stdout);

  assert.equal(bridgeResult.code, 0);
  assert.equal(bridgePayload.action.id, bridgeAction.id);
  assert.equal(bridgePayload.sourceAgent, "qoderwork");
  assert.equal(bridgePayload.targetAgent, "codex");
  assert.equal(bridgePayload.resumeCommand, "codex resume qoderwork-action");
});

test("cli shows the selected session card when only one match exists", async () => {
  const currentDir = await makeTempDir("qoder-single-workspace");
  const sessionsRoot = await makeTempDir("qoder-single-sessions");
  const projectDir = path.join(sessionsRoot, "demo");
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(
    path.join(projectDir, "session.jsonl"),
    [
      `{"type":"user","cwd":"${currentDir}","sessionId":"qoder-one","message":{"role":"user","content":[{"type":"text","text":"先看一下 qodercli session"}]}}`,
      `{"type":"assistant","cwd":"${currentDir}","sessionId":"qoder-one","message":{"role":"assistant","content":[{"type":"text","text":"好的"}]}}`,
    ].join("\n") + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(projectDir, "session-session.json"),
    JSON.stringify({
      id: "qoder-one",
      title: "QoderCLI Only Session",
      working_dir: currentDir,
      updated_at: Date.parse("2026-03-21T10:00:00.000Z"),
    }),
    "utf8",
  );

  const fakeHome = await makeTempDir("q2c-home");
  const result = await spawnCli(["q2c", "--root", sessionsRoot], {
    cwd: currentDir,
    env: { ...process.env, HOME: fakeHome },
  });

  assert.equal(result.code, 0);
  assert.match(result.stderr, /\[1\] QoderCLI Only Session/);
  assert.match(result.stderr, /Selected: qoder-one/);
  assert.match(result.stdout, new RegExp(`cd ${currentDir} && claude --resume qoder-one`, "u"));
});

test("cli supports single-agent list mode", async () => {
  const currentDir = await makeTempDir("claude-list-workspace");
  const sessionsRoot = await makeTempDir("claude-list-sessions");
  const projectDir = path.join(sessionsRoot, "-workspace");
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(
    path.join(projectDir, "aaa.jsonl"),
    `{"type":"user","message":{"role":"user","content":"先看 issue"},"timestamp":"2026-03-20T10:00:00.000Z","cwd":"${currentDir}","sessionId":"aaa"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(projectDir, "bbb.jsonl"),
    `{"type":"user","message":{"role":"user","content":"总结一下上下文"},"timestamp":"2026-03-20T11:00:00.000Z","cwd":"${currentDir}","sessionId":"bbb"}\n`,
    "utf8",
  );

  const result = await spawnCli(["c", "--root", sessionsRoot], { cwd: currentDir });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Matching Claude sessions for/);
  assert.match(result.stdout, /\[1\]/);
  assert.match(result.stdout, /\[2\]/);
  assert.match(result.stdout, /总结一下上下文/);
  assert.doesNotMatch(result.stdout, /Run:/);
});

test("cli supports shorthand positional source and target agents", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const result = await spawnCli(["c", "x", "--session", sessionPath, "--stdout"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /"type":"session_meta"/);
});

test("cli supports x2c as a Claude session export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const fakeHome = await makeTempDir("x2c-home");
  const result = await spawnCli(["x2c", "--session", sessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(payload.mode, "claude-session");
  assert.equal(payload.resumeCommand, "cd /tmp/demo && claude --resume sample-session");
});

test("cli supports c2x as a Codex session export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const fakeHome = await makeTempDir("c2x-home");
  const result = await spawnCli(["c2x", "--session", sessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(payload.mode, "codex-session");
  assert.equal(payload.resumeCommand, "codex resume claude-session");
});

test("cli supports c2c as a Claude fork export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const fakeHome = await makeTempDir("c2c-home");
  const result = await spawnCli(["c2c", "--session", sessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(payload.mode, "claude-session");
  assert.match(payload.sessionId, /^[0-9a-f-]{36}$/);
  assert.notEqual(payload.sessionId, "claude-session");
  assert.equal(payload.resumeCommand, `cd /workspace/claude-demo && claude --resume ${payload.sessionId}`);
  assert.equal(payload.lineagePath, `${payload.outputPath}.kage-lineage.json`);
  const lineage = JSON.parse(await fs.readFile(payload.lineagePath, "utf8"));
  assert.equal(lineage.forkType, "fork");
  assert.equal(lineage.parentAgent, "claude");
  assert.equal(lineage.parentSessionId, "claude-session");
  assert.equal(lineage.parentSessionPath, sessionPath);
  assert.equal(lineage.childAgent, "claude");
  assert.equal(lineage.childSessionId, payload.sessionId);
  assert.equal(lineage.childSessionPath, payload.outputPath);
  assert.deepEqual(payload.hints, [
    "Claude Code supports native forks now: cd /workspace/claude-demo && claude --resume claude-session --fork-session",
    "Inside Claude Code, use /branch; /fork is an alias.",
  ]);
});

test("cli prints native Claude fork guidance for c2c", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const fakeHome = await makeTempDir("c2c-hint-home");
  const result = await spawnCli(["c2c", "--session", sessionPath], {
    env: { ...process.env, HOME: fakeHome },
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Run:\ncd \/workspace\/claude-demo && claude --resume [0-9a-f-]{36}/);
  assert.match(result.stdout, /Hint:\nClaude Code supports native forks now: cd \/workspace\/claude-demo && claude --resume claude-session --fork-session/);
  assert.match(result.stdout, /Inside Claude Code, use \/branch; \/fork is an alias\./);
});

test("cli supports x2x as a Codex fork export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const fakeHome = await makeTempDir("x2x-home");
  const result = await spawnCli(["x2x", "--session", sessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(payload.mode, "codex-session");
  assert.match(payload.sessionId, /^[0-9a-f-]{36}$/);
  assert.notEqual(payload.sessionId, "sample-session");
  assert.deepEqual(payload.hints, [
    "Codex supports native forks now: codex fork sample-session",
    "Use codex fork --last to fork the most recent session.",
  ]);
});

test("cli supports q2x and q2c", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl");
  const fakeHome = await makeTempDir("qoder-home");

  const q2x = await spawnCli(["q2x", "--session", sessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });
  const q2c = await spawnCli(["q2c", "--session", sessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });

  assert.equal(JSON.parse(q2x.stdout).mode, "codex-session");
  assert.equal(JSON.parse(q2c.stdout).mode, "claude-session");
});

test("cli supports q2q as a qodercli fork export", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl");
  const fakeHome = await makeTempDir("q2q-home");
  const workingDir = await canonicalPath("/workspace/demo");
  const projectKey = toProjectKey(workingDir);
  const result = await spawnCli(["q2q", "--session", sessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(payload.mode, "qoder-session");
  assert.match(payload.sessionId, /^[0-9a-f-]{36}$/);
  assert.notEqual(payload.sessionId, "qoder-session");
  assert.equal(payload.outputPath, path.join(fakeHome, ".qoder", "projects", projectKey, `${payload.sessionId}.jsonl`));
  assert.equal(payload.sidecarPath, path.join(fakeHome, ".qoder", "projects", projectKey, `${payload.sessionId}-session.json`));
  assert.equal(payload.resumeCommand, `qodercli --cwd ${workingDir} --resume ${payload.sessionId}`);
});

test("cli supports explicit qodercli self forks", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl");
  const fakeHome = await makeTempDir("qodercli-fork-home");
  const qodercliResult = await spawnCli(["qodercli", "qodercli", "--session", sessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });

  const qodercliPayload = JSON.parse(qodercliResult.stdout);
  assert.equal(qodercliPayload.mode, "qoder-session");
  assert.match(qodercliPayload.sessionId, /^[0-9a-f-]{36}$/);
  assert.notEqual(qodercliPayload.sessionId, "qoder-session");
  assert.match(qodercliPayload.resumeCommand, /^qodercli --cwd .* --resume [0-9a-f-]{36}$/u);
});

test("cli keeps Claude same-agent forks in the source project directory", async () => {
  const sourceRoot = await makeTempDir("claude-fork-source-root");
  const sourceProject = path.join(sourceRoot, "-Users-levi-wrksp-kage");
  const sourcePath = path.join(sourceProject, "source.jsonl");
  const fakeHome = await makeTempDir("claude-fork-target-home");
  await fs.mkdir(sourceProject, { recursive: true });
  await fs.writeFile(
    sourcePath,
    [
      '{"type":"user","message":{"role":"user","content":"fork me"},"sessionId":"source-session"}',
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"ok"}]},"timestamp":"2026-05-20T10:00:00.000Z","sessionId":"source-session"}',
    ].join("\n") + "\n",
    "utf8",
  );

  const result = await spawnCli(["c2c", "--session", sourcePath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.match(payload.sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(path.dirname(payload.outputPath), path.join(fakeHome, ".claude", "projects", "-Users-levi-wrksp-kage"));
  assert.doesNotMatch(payload.outputPath, /unknown/);
});

test("cli keeps QoderCLI same-agent forks in the source project directory", async () => {
  const sourceRoot = await makeTempDir("qoder-fork-source-root");
  const sourceProject = path.join(sourceRoot, "-Users-levi-wrksp-kage");
  const sourcePath = path.join(sourceProject, "source.jsonl");
  const fakeHome = await makeTempDir("qoder-fork-target-home");
  await fs.mkdir(sourceProject, { recursive: true });
  await fs.writeFile(
    sourcePath,
    [
      '{"type":"user","sessionId":"qoder-source","message":{"role":"user","content":[{"type":"text","text":"fork me"}]}}',
      '{"type":"assistant","sessionId":"qoder-source","message":{"role":"assistant","content":[{"type":"text","text":"ok"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const result = await spawnCli(["q2q", "--session", sourcePath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.match(payload.sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(path.dirname(payload.outputPath), path.join(fakeHome, ".qoder", "projects", "-Users-levi-wrksp-kage"));
  assert.doesNotMatch(payload.outputPath, /unknown/);
});

test("cli uses the current project cwd for Codex same-agent forks with missing cwd", async () => {
  const currentDir = await makeTempDir("codex-fork-current");
  const outDir = await makeTempDir("codex-fork-out");
  const sourcePath = path.join(outDir, "source.jsonl");
  const exportPath = path.join(outDir, "fork.jsonl");
  await fs.writeFile(
    sourcePath,
    [
      '{"timestamp":"2026-05-20T10:00:00.000Z","type":"session_meta","payload":{"id":"codex-source"}}',
      '{"timestamp":"2026-05-20T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"fork me"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const result = await spawnCli(["x2x", "--session", sourcePath, "--out", exportPath, "--json"], {
    cwd: currentDir,
  });
  const content = await fs.readFile(exportPath, "utf8");
  const expectedCwd = await canonicalPath(currentDir);

  assert.equal(result.code, 0);
  assert.match(content, new RegExp(`"cwd":"${expectedCwd.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}"`, "u"));
  assert.doesNotMatch(content, /"cwd":"unknown"/);
});

test("cli supports x2q and c2q", async () => {
  const codexSessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const claudeSessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const fakeHome = await makeTempDir("to-qoder-home");
  const codexWorkingDir = await canonicalPath("/tmp/demo");
  const claudeWorkingDir = await canonicalPath("/workspace/claude-demo");

  const x2q = await spawnCli(["x2q", "--session", codexSessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });
  const c2q = await spawnCli(["c2q", "--session", claudeSessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });

  const x2qPayload = JSON.parse(x2q.stdout);
  const c2qPayload = JSON.parse(c2q.stdout);
  assert.equal(x2qPayload.mode, "qoder-session");
  assert.equal(x2qPayload.resumeCommand, `qodercli --cwd ${codexWorkingDir} --resume sample-session`);
  assert.equal(c2qPayload.mode, "qoder-session");
  assert.equal(c2qPayload.resumeCommand, `qodercli --cwd ${claudeWorkingDir} --resume claude-session`);
});

test("cli supports c2v, x2v, and q2v as story exports", async () => {
  const claudeSessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const codexSessionPath = path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl");
  const qoderSessionPath = path.join(__dirname, "..", "fixtures", "sample-qoder-session.jsonl");

  const c2v = await spawnCli(["c2v", "--session", claudeSessionPath, "--json"]);
  const x2v = await spawnCli(["x2v", "--session", codexSessionPath, "--json"]);
  const q2v = await spawnCli(["q2v", "--session", qoderSessionPath, "--json"]);

  assert.equal(JSON.parse(c2v.stdout).mode, "session-story-html");
  assert.equal(JSON.parse(x2v.stdout).mode, "session-story-html");
  assert.equal(JSON.parse(q2v.stdout).mode, "session-story-html");
});

test("cli runs correctly when invoked through a symlinked entrypoint", async () => {
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");
  const realCliPath = path.join(__dirname, "..", "src", "cli.js");
  const tempDir = await makeTempDir("cli-symlink");
  const symlinkPath = path.join(tempDir, "kage");
  await fs.symlink(realCliPath, symlinkPath);

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [symlinkPath, "claude", "codex", "--session", sessionPath], {
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
      resolve({ code, stdout, stderr });
    });
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /codex resume claude-session/);
});

test("cli fails clearly for ambiguous Claude sessions in non-interactive mode", async () => {
  const currentDir = await makeTempDir("claude-cli-match-workspace");
  const sessionsRoot = await makeTempDir("claude-cli-projects");
  const targetDir = path.join(sessionsRoot, "-workspace");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "aaa.jsonl"),
    `{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-03-20T10:00:00.000Z","cwd":"${currentDir}","sessionId":"aaa"}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "bbb.jsonl"),
    `{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-03-20T11:00:00.000Z","cwd":"${currentDir}","sessionId":"bbb"}\n`,
    "utf8",
  );

  const result = await spawnCli(["claude", "codex", "--root", sessionsRoot], { cwd: currentDir });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Multiple Claude sessions match the current directory/);
});

test("cli fails clearly for ambiguous Codex sessions in non-interactive mode", async () => {
  const currentDir = await makeTempDir("codex-cli-match-workspace");
  const sessionsRoot = await makeTempDir("codex-cli-sessions");
  const targetDir = path.join(sessionsRoot, "2026", "03", "21");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "rollout-2026-03-21T10-00-00-aaa.jsonl"),
    [
      `{"timestamp":"2026-03-21T10:00:00.000Z","type":"session_meta","payload":{"id":"aaa","cwd":"${currentDir}"}}`,
      '{"timestamp":"2026-03-21T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"先修一下 README"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "rollout-2026-03-21T11-00-00-bbb.jsonl"),
    [
      `{"timestamp":"2026-03-21T11:00:00.000Z","type":"session_meta","payload":{"id":"bbb","cwd":"${currentDir}"}}`,
      '{"timestamp":"2026-03-21T11:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"做一下 Claude export"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const result = await spawnCli(["codex", "claude", "--root", sessionsRoot], { cwd: currentDir });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Multiple Codex sessions match the current directory/);
});

test("cli does not fall back to an unrelated latest session", async () => {
  const currentDir = await makeTempDir("codex-no-fallback-current");
  const otherDir = await makeTempDir("codex-no-fallback-other");
  const sessionsRoot = await makeTempDir("codex-no-fallback-sessions");
  const targetDir = path.join(sessionsRoot, "2026", "03", "22");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "rollout-2026-03-22T11-00-00-other.jsonl"),
    [
      `{"timestamp":"2026-03-22T11:00:00.000Z","type":"session_meta","payload":{"id":"other","cwd":"${otherDir}"}}`,
      '{"timestamp":"2026-03-22T11:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"not this workspace"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const result = await spawnCli(["codex", "claude", "--root", sessionsRoot], { cwd: currentDir });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /No Codex sessions match the current directory:/);
  assert.match(result.stderr, /Use --session or --session-id to specify a session explicitly\./);
  assert.doesNotMatch(result.stdout, /claude --resume other/);
});

test("cli shows the first real user prompt instead of Codex environment context in session choices", async () => {
  const currentDir = await makeTempDir("codex-cli-title-workspace");
  const sessionsRoot = await makeTempDir("codex-cli-title-sessions");
  const targetDir = path.join(sessionsRoot, "2026", "03", "22");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "rollout-2026-03-22T10-00-00-aaa.jsonl"),
    [
      `{"timestamp":"2026-03-22T10:00:00.000Z","type":"session_meta","payload":{"id":"aaa","cwd":"${currentDir}"}}`,
      '{"timestamp":"2026-03-22T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<environment_context>\\n  <cwd>/tmp/demo</cwd>\\n</environment_context>"}]}}',
      '{"timestamp":"2026-03-22T10:00:02.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"总结一下你的上下文"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "rollout-2026-03-22T11-00-00-bbb.jsonl"),
    [
      `{"timestamp":"2026-03-22T11:00:00.000Z","type":"session_meta","payload":{"id":"bbb","cwd":"${currentDir}"}}`,
      '{"timestamp":"2026-03-22T11:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<environment_context>\\n  <cwd>/tmp/demo</cwd>\\n</environment_context>"}]}}',
      '{"timestamp":"2026-03-22T11:00:02.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<turn_aborted>"}]}}',
      '{"timestamp":"2026-03-22T11:00:03.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"做一下 Claude export"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const result = await spawnCli(["codex", "claude", "--root", sessionsRoot], { cwd: currentDir });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /总结一下你的上下文/);
  assert.match(result.stderr, /做一下 Claude export/);
  assert.doesNotMatch(result.stderr, /<environment_context>/);
  assert.doesNotMatch(result.stderr, /<turn_aborted>/);
});

test("cli shows recent real user messages in session choices", async () => {
  const currentDir = await makeTempDir("codex-cli-recent-workspace");
  const sessionsRoot = await makeTempDir("codex-cli-recent-sessions");
  const targetDir = path.join(sessionsRoot, "2026", "03", "22");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "rollout-2026-03-22T10-00-00-aaa.jsonl"),
    [
      `{"timestamp":"2026-03-22T10:00:00.000Z","type":"session_meta","payload":{"id":"aaa","cwd":"${currentDir}"}}`,
      '{"timestamp":"2026-03-22T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<environment_context>\\n  <cwd>/tmp/demo</cwd>\\n</environment_context>"}]}}',
      '{"timestamp":"2026-03-22T10:00:02.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"先看一下 issue"}]}}',
      '{"timestamp":"2026-03-22T10:00:03.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"好的"}]}}',
      '{"timestamp":"2026-03-22T10:00:04.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"总结一下你的上下文"}]}}',
      '{"timestamp":"2026-03-22T10:00:05.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"最后再看一下测试"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(targetDir, "rollout-2026-03-22T11-00-00-bbb.jsonl"),
    [
      `{"timestamp":"2026-03-22T11:00:00.000Z","type":"session_meta","payload":{"id":"bbb","cwd":"${currentDir}"}}`,
      '{"timestamp":"2026-03-22T11:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"做一下 Claude export"}]}}',
      '{"timestamp":"2026-03-22T11:00:02.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<turn_aborted>"}]}}',
      '{"timestamp":"2026-03-22T11:00:03.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"顺手检查 qoder export"}]}}',
    ].join("\n") + "\n",
    "utf8",
  );

  const result = await spawnCli(["codex", "claude", "--root", sessionsRoot], { cwd: currentDir });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Recent user messages:/);
  assert.match(result.stderr, /- 最后再看一下测试/);
  assert.match(result.stderr, /- 总结一下你的上下文/);
  assert.match(result.stderr, /- 先看一下 issue/);
  assert.match(result.stderr, /- 顺手检查 qoder export/);
  assert.doesNotMatch(result.stderr, /<environment_context>/);
  assert.doesNotMatch(result.stderr, /<turn_aborted>/);
});

test("cli sessions emits bounded titles and sanitized recent user messages", async () => {
  const currentDir = await makeTempDir("codex-cli-bounded-title-workspace");
  const sessionsRoot = await makeTempDir("codex-cli-bounded-title-sessions");
  const targetDir = path.join(sessionsRoot, "2026", "03", "22");
  const longPrompt = [
    "实现一个足够长的 session 标题，用来验证菜单栏不会被撑坏。",
    "这里插入工具输出标签",
    "<local-command-stdout>hidden tool output</local-command-stdout>",
    "然后继续补充很多很多上下文。",
    "更多细节 ".repeat(80),
  ].join(" ");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "rollout-2026-03-22T12-00-00-bounded.jsonl"),
    [
      JSON.stringify({
        timestamp: "2026-03-22T12:00:00.000Z",
        type: "session_meta",
        payload: { id: "bounded", cwd: currentDir },
      }),
      JSON.stringify({
        timestamp: "2026-03-22T12:00:01.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "<task-notification>hidden notification</task-notification>" }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-22T12:00:02.000Z",
        type: "response_item",
        payload: { type: "message", role: "user", content: [{ type: "input_text", text: longPrompt }] },
      }),
      JSON.stringify({
        timestamp: "2026-03-22T12:00:03.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "kage c2q\n<local-command-caveat>hidden caveat</local-command-caveat>\n继续排查 qodercli resume",
            },
          ],
        },
      }),
    ].join("\n") + "\n",
    "utf8",
  );

  const result = await spawnCli(["sessions", "--agent", "codex", "--root", sessionsRoot, "--json"], {
    cwd: currentDir,
  });
  const payload = JSON.parse(result.stdout);
  const session = payload.sessions[0];
  const serialized = JSON.stringify(session);

  assert.equal(result.code, 0);
  assert.equal(session.sessionId, "bounded");
  assert.ok(session.title.length <= 240);
  assert.ok(session.shortTitle.length <= 60);
  assert.match(session.shortTitle, /\.\.\.$/u);
  assert.ok(session.recentUserMessages.every((message) => message.length <= 160));
  assert.match(session.recentUserMessages[0], /kage c2q/);
  assert.match(session.recentUserMessages[0], /继续排查 qodercli resume/);
  assert.doesNotMatch(serialized, /hidden/);
  assert.doesNotMatch(serialized, /<local-command-stdout>/);
  assert.doesNotMatch(serialized, /<task-notification>/);
});

test("cli installs default Codex exports into the real Codex session directory", async () => {
  const fakeHome = await makeTempDir("codex-home");
  const result = await spawnCli(
    ["claude", "codex", "--session", path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"), "--json"],
    { env: { ...process.env, HOME: fakeHome } },
  );

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(
    payload.outputPath,
    path.join(fakeHome, ".codex", "sessions", "2026", "03", "20", payload.fileName),
  );
  assert.equal(payload.lineagePath, `${payload.outputPath}.kage-lineage.json`);
  const lineage = JSON.parse(await fs.readFile(payload.lineagePath, "utf8"));
  assert.equal(lineage.forkType, "bridge");
  assert.equal(lineage.parentAgent, "claude");
  assert.equal(lineage.childAgent, "codex");
});

test("cli overwrites default Codex exports for the same source session", async () => {
  const fakeHome = await makeTempDir("codex-dedupe-home");
  const sessionPath = path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl");

  const first = await spawnCli(["c2x", "--session", sessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });
  const second = await spawnCli(["c2x", "--session", sessionPath, "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });

  const firstPayload = JSON.parse(first.stdout);
  const secondPayload = JSON.parse(second.stdout);
  assert.equal(firstPayload.outputPath, secondPayload.outputPath);
  assert.equal(firstPayload.fileName, "rollout-claude-session.jsonl");
  assert.equal((await fs.readdir(path.dirname(firstPayload.outputPath))).length, 2);
});

test("cli installs default Claude exports into the real Claude session directory", async () => {
  const fakeHome = await makeTempDir("claude-home");
  const result = await spawnCli(
    ["codex", "claude", "--session", path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl"), "--json"],
    { env: { ...process.env, HOME: fakeHome } },
  );

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(
    payload.outputPath,
    path.join(fakeHome, ".claude", "projects", "-tmp-demo", "sample-session.jsonl"),
  );
});

test("cli can emit machine-readable json for codex and claude session exports", async () => {
  const codexOutDir = await makeTempDir("json-codex-export");
  const claudeOutDir = await makeTempDir("json-claude-export");
  const codexPath = path.join(codexOutDir, "codex-session.jsonl");
  const claudePath = path.join(claudeOutDir, "sample-session.jsonl");

  const codexResult = await spawnCli([
    "c2x",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    "--out",
    codexPath,
    "--json",
  ]);
  const claudeResult = await spawnCli([
    "x2c",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl"),
    "--out",
    claudePath,
    "--json",
  ]);

  assert.equal(JSON.parse(codexResult.stdout).outputPath, codexPath);
  assert.equal(JSON.parse(claudeResult.stdout).outputPath, claudePath);
});

test("cli can emit machine-readable json for qodercli session exports", async () => {
  const outDir = await makeTempDir("json-qoder-export");
  const exportPath = path.join(outDir, "sample-session.jsonl");

  const result = await spawnCli([
    "x2q",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl"),
    "--out",
    exportPath,
    "--json",
  ]);

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(payload.mode, "qoder-session");
  assert.equal(payload.outputPath, exportPath);
  assert.match(payload.sidecarPath, /-session\.json$/);
  assert.equal(payload.lineagePath, `${exportPath}.kage-lineage.json`);
});

test("cli auto-creates missing output directories for exports", async () => {
  const baseDir = await makeTempDir("missing-output-dir");
  const outDir = path.join(baseDir, "nested", "exports");

  const result = await spawnCli([
    "c2x",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    "--output-dir",
    outDir,
    "--json",
  ]);

  const payload = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(path.dirname(payload.outputPath), outDir);
  assert.equal(await fs.readFile(payload.outputPath, "utf8").then(Boolean), true);
  assert.equal(await fs.readFile(payload.lineagePath, "utf8").then(Boolean), true);
});

test("cli can resolve a session by session id", async () => {
  const result = await spawnCli([
    "--agent",
    "codex",
    "--target",
    "claude",
    "--session-id",
    "later",
    "--root",
    path.join(__dirname, "..", "fixtures", "sessions"),
    "--json",
  ]);

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.sessionId, "later");
  assert.equal(payload.mode, "claude-session");
});

test("cli can split a session before export", async () => {
  const outDir = await makeTempDir("split-export");
  const exportPath = path.join(outDir, "split.jsonl");
  const result = await spawnCli([
    "claude",
    "qodercli",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    "--split-recent",
    "1",
    "--out",
    exportPath,
    "--json",
  ]);

  const content = await fs.readFile(exportPath, "utf8");
  assert.equal(result.code, 0);
  assert.match(content, /帮我总结当前目录/);
  assert.doesNotMatch(content, /你好！有什么我可以帮你的吗？/);
});

test("cli can fork a session before export", async () => {
  const outDir = await makeTempDir("fork-export");
  const exportPath = path.join(outDir, "fork.jsonl");
  const result = await spawnCli([
    "claude",
    "qodercli",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    "--fork",
    "另外开一个分支，去做 session split",
    "--out",
    exportPath,
    "--json",
  ]);

  const content = await fs.readFile(exportPath, "utf8");
  assert.equal(result.code, 0);
  assert.match(content, /另外开一个分支，去做 session split/);
});

test("cli can export a session story html", async () => {
  const outDir = await makeTempDir("story-export");
  const exportPath = path.join(outDir, "story.html");
  const result = await spawnCli([
    "claude",
    "codex",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    "--export",
    "session-story-html",
    "--out",
    exportPath,
    "--json",
  ]);

  const content = await fs.readFile(exportPath, "utf8");
  assert.equal(result.code, 0);
  assert.match(content, /Session Story/);
  assert.match(content, /phaser/i);
  assert.match(content, /phaser-stage/i);
  assert.match(content, /anime/i);
  assert.match(content, /requestAnimationFrame/i);
});

test("cli fails clearly when both --fork and --fork-file are provided", async () => {
  const promptFile = path.join(await makeTempDir("fork-file"), "fork.txt");
  await fs.writeFile(promptFile, "fork me", "utf8");

  const result = await spawnCli([
    "claude",
    "qodercli",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    "--fork",
    "fork me",
    "--fork-file",
    promptFile,
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Use either --fork or --fork-file/);
});

test("cli previews exports without writing files", async () => {
  const fakeHome = await makeTempDir("preview-home");
  const result = await spawnCli([
    "x2q",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-codex-session.jsonl"),
    "--preview",
  ], {
    env: { ...process.env, HOME: fakeHome },
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Export preview/);
  assert.match(result.stdout, /Target: qodercli/);
  assert.match(result.stdout, /qodercli --cwd .* --resume sample-session/);
  await assert.rejects(fs.access(path.join(fakeHome, ".qoder")), /ENOENT/);
});

test("cli can run the generated resume command after export", async () => {
  const fakeHome = await makeTempDir("run-home");
  const result = await spawnCli(
    ["c2x", "--session", path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"), "--run"],
    {
      env: { ...process.env, HOME: fakeHome, KAGE_RUN_COMMAND: "printf 'RUN_OK\\n'" },
    },
  );

  assert.equal(result.code, 0);
  assert.match(result.stdout, /codex resume claude-session/);
  assert.match(result.stdout, /RUN_OK/);
});

test("cli rejects --run when no resume command is produced", async () => {
  const outDir = await makeTempDir("run-out");
  const result = await spawnCli([
    "c2x",
    "--session",
    path.join(__dirname, "..", "fixtures", "sample-claude-session.jsonl"),
    "--out",
    path.join(outDir, "session.jsonl"),
    "--run",
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /--run requires a default install with a resume command/);
});

test("cli generates shell completions with QoderCLI aliases", async () => {
  const result = await spawnCli(["completions", "bash"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /complete -F _kage_completions kage/);
  assert.match(result.stdout, /qodercli/);
  assert.match(result.stdout, /qoderwork/);
  assert.match(result.stdout, /qw/);
  assert.match(result.stdout, /q2x/);
});

test("cli clean previews and confirms duplicate export deletion", async () => {
  const fakeHome = await makeTempDir("clean-home");
  const codexDir = path.join(fakeHome, ".codex", "sessions", "2026", "03", "22");
  const firstPath = path.join(codexDir, "rollout-old-same.jsonl");
  const secondPath = path.join(codexDir, "rollout-same.jsonl");
  await fs.mkdir(codexDir, { recursive: true });
  await fs.writeFile(
    firstPath,
    `{"timestamp":"2026-03-22T10:00:00.000Z","type":"session_meta","payload":{"id":"same","cwd":"/tmp/demo"}}\n`,
    "utf8",
  );
  await fs.writeFile(
    secondPath,
    `{"timestamp":"2026-03-22T11:00:00.000Z","type":"session_meta","payload":{"id":"same","cwd":"/tmp/demo"}}\n`,
    "utf8",
  );
  await fs.utimes(firstPath, new Date("2026-03-22T10:00:00.000Z"), new Date("2026-03-22T10:00:00.000Z"));
  await fs.utimes(secondPath, new Date("2026-03-22T11:00:00.000Z"), new Date("2026-03-22T11:00:00.000Z"));

  const dryRun = await spawnCli(["clean", "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });
  const dryRunPayload = JSON.parse(dryRun.stdout);
  assert.equal(dryRun.code, 0);
  assert.equal(dryRunPayload.dryRun, true);
  assert.equal(dryRunPayload.deleteCandidates.length, 1);
  await fs.access(firstPath);

  const confirmed = await spawnCli(["clean", "--confirm", "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });
  const confirmedPayload = JSON.parse(confirmed.stdout);
  assert.equal(confirmed.code, 0);
  assert.equal(confirmedPayload.dryRun, false);
  assert.deepEqual(confirmedPayload.deleted, [firstPath]);
  await assert.rejects(fs.access(firstPath), /ENOENT/);
  await fs.access(secondPath);
});

test("cli clean ignores Claude subagent transcripts", async () => {
  const fakeHome = await makeTempDir("clean-subagents-home");
  const subagentsDir = path.join(fakeHome, ".claude", "projects", "-tmp-demo", "subagents");
  const firstPath = path.join(subagentsDir, "agent-alpha.jsonl");
  const secondPath = path.join(subagentsDir, "agent-beta.jsonl");
  await fs.mkdir(subagentsDir, { recursive: true });
  await fs.writeFile(
    firstPath,
    JSON.stringify({
      type: "user",
      message: { role: "user", content: "subagent alpha" },
      timestamp: "2026-05-20T10:00:00.000Z",
      cwd: "/tmp/demo",
      sessionId: "same-parent-session",
      agentId: "alpha",
    }) + "\n",
    "utf8",
  );
  await fs.writeFile(
    secondPath,
    JSON.stringify({
      type: "user",
      message: { role: "user", content: "subagent beta" },
      timestamp: "2026-05-20T10:01:00.000Z",
      cwd: "/tmp/demo",
      sessionId: "same-parent-session",
      agentId: "beta",
    }) + "\n",
    "utf8",
  );
  await fs.utimes(firstPath, new Date("2020-01-01T00:00:00.000Z"), new Date("2020-01-01T00:00:00.000Z"));
  await fs.utimes(secondPath, new Date("2020-01-02T00:00:00.000Z"), new Date("2020-01-02T00:00:00.000Z"));

  const result = await spawnCli(["clean", "--older-than", "1d", "--confirm", "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.deleteCandidates.length, 0);
  assert.deepEqual(payload.deleted, []);
  await fs.access(firstPath);
  await fs.access(secondPath);
});

test("cli clean supports older-than stale cleanup", async () => {
  const fakeHome = await makeTempDir("clean-stale-home");
  const codexDir = path.join(fakeHome, ".codex", "sessions", "2026", "03", "01");
  const stalePath = path.join(codexDir, "rollout-stale.jsonl");
  await fs.mkdir(codexDir, { recursive: true });
  await fs.writeFile(
    stalePath,
    `{"timestamp":"2026-03-01T10:00:00.000Z","type":"session_meta","payload":{"id":"stale","cwd":"/tmp/demo"}}\n`,
    "utf8",
  );
  await fs.utimes(stalePath, new Date("2020-01-01T00:00:00.000Z"), new Date("2020-01-01T00:00:00.000Z"));

  const result = await spawnCli(["clean", "--older-than", "1d", "--json"], {
    env: { ...process.env, HOME: fakeHome },
  });
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.staleCandidates.length, 1);
  assert.equal(payload.deleteCandidates[0].path, stalePath);
  await fs.access(stalePath);
});
