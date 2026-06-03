import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

const palette = {
  codex: { css: "#10a37f", swift: "0x10A37F" },
  qoder: { css: "#8b5cf6", swift: "0x8B5CF6" },
  claude: { css: "#d97757", swift: "0xD97757" },
};

async function readRepoFile(...parts) {
  return fs.readFile(path.join(repoRoot, ...parts), "utf8");
}

test("agent colors stay in sync across desktop app and public assets", async () => {
  const dashboard = await readRepoFile("app", "Sources", "KageMenuBar", "Views", "DesktopDashboardView.swift");
  const homepage = await readRepoFile("docs", "index.html");
  const logo = await readRepoFile("docs", "assets", "kage-logo.svg");
  const desktopPreview = await readRepoFile("docs", "assets", "screenshots", "kage-desktop-preview.svg");
  const demoFlow = await readRepoFile("docs", "assets", "screenshots", "kage-demo-flow.svg");

  assert.match(dashboard, /case "codex":\s*return AgentPalette\.codex/u);
  assert.match(dashboard, /case "qodercli", "qoderwork":\s*return AgentPalette\.qoder/u);
  assert.match(dashboard, /case "claude":\s*return AgentPalette\.claude/u);

  assert.match(dashboard, new RegExp(`static let codex = Color\\(hex: ${palette.codex.swift}\\)`, "u"));
  assert.match(dashboard, new RegExp(`static let qoder = Color\\(hex: ${palette.qoder.swift}\\)`, "u"));
  assert.match(dashboard, new RegExp(`static let claude = Color\\(hex: ${palette.claude.swift}\\)`, "u"));

  assert.match(homepage, new RegExp(`--green: ${palette.codex.css};`, "u"));
  assert.match(homepage, new RegExp(`--violet: ${palette.qoder.css};`, "u"));
  assert.match(homepage, new RegExp(`--orange: ${palette.claude.css};`, "u"));

  assert.match(logo, /Agent dots, left to right: Codex, QoderCLI\/QoderWork, Claude/u);
  assert.match(logo, new RegExp(`fill="${palette.codex.css}"`, "u"));
  assert.match(logo, new RegExp(`fill="${palette.qoder.css}"`, "u"));
  assert.match(logo, new RegExp(`fill="${palette.claude.css}"`, "u"));

  for (const asset of [desktopPreview, demoFlow]) {
    assert.match(asset, new RegExp(`fill="${palette.codex.css}"`, "u"));
    assert.match(asset, new RegExp(`fill="${palette.qoder.css}"`, "u"));
    assert.match(asset, new RegExp(`fill="${palette.claude.css}"`, "u"));
  }
});
