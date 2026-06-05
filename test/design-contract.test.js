import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

const palette = {
  codex: { css: "#3b82f6", swift: "0x3B82F6" },
  qoder: { css: "#15a074", swift: "0x15A074" },
  claude: { css: "#cf7654", swift: "0xCF7654" },
};

async function readRepoFile(...parts) {
  return fs.readFile(path.join(repoRoot, ...parts), "utf8");
}

async function readRepoBytes(...parts) {
  return fs.readFile(path.join(repoRoot, ...parts));
}

test("agent colors stay in sync across desktop app and public assets", async () => {
  const dashboard = await readRepoFile("app", "Sources", "KageMenuBar", "Views", "DesktopDashboardView.swift");
  const homepage = await readRepoFile("docs", "index.html");
  const logo = await readRepoFile("docs", "assets", "kage-logo.svg");
  const desktopPreview = await readRepoFile("docs", "assets", "screenshots", "kage-desktop-preview.svg");
  const mobileBoardPreview = await readRepoFile("docs", "assets", "screenshots", "kage-mobile-board-preview.svg");
  const demoFlow = await readRepoFile("docs", "assets", "screenshots", "kage-demo-flow.svg");

  assert.match(dashboard, /case "codex":\s*return AgentPalette\.codex/u);
  assert.match(dashboard, /case "qodercli", "qoderwork":\s*return AgentPalette\.qoder/u);
  assert.match(dashboard, /case "claude":\s*return AgentPalette\.claude/u);

  assert.match(dashboard, new RegExp(`static let codex = Color\\(hex: ${palette.codex.swift}\\)`, "u"));
  assert.match(dashboard, new RegExp(`static let qoder = Color\\(hex: ${palette.qoder.swift}\\)`, "u"));
  assert.match(dashboard, new RegExp(`static let claude = Color\\(hex: ${palette.claude.swift}\\)`, "u"));

  assert.match(homepage, new RegExp(`--agent-codex: ${palette.codex.css};`, "u"));
  assert.match(homepage, new RegExp(`--agent-qoder: ${palette.qoder.css};`, "u"));
  assert.match(homepage, new RegExp(`--agent-claude: ${palette.claude.css};`, "u"));
  assert.match(homepage, /<img class="hero-screenshot" src="\.\/assets\/screenshots\/kage-desktop-preview\.svg" alt="">/u);
  assert.match(homepage, /kage-mobile-board-preview\.svg/u);

  assert.match(logo, /Agent dots, left to right: Codex, QoderCLI\/QoderWork, Claude/u);
  assert.match(logo, new RegExp(`<circle cx="164" cy="360" r="24" fill="${palette.codex.css}"/>`, "u"));
  assert.match(logo, new RegExp(`<circle cx="256" cy="376" r="24" fill="${palette.qoder.css}"/>`, "u"));
  assert.match(logo, new RegExp(`<circle cx="348" cy="360" r="24" fill="${palette.claude.css}"/>`, "u"));

  assert.match(desktopPreview, new RegExp(`fill="${palette.codex.css}">CODEX</text>`, "u"));
  assert.match(desktopPreview, new RegExp(`fill="${palette.qoder.css}">QODERCLI</text>`, "u"));
  assert.match(desktopPreview, new RegExp(`fill="${palette.claude.css}">CLAUDE</text>`, "u"));
  assert.match(desktopPreview, new RegExp(`fill="${palette.codex.css}">Codex</text>`, "u"));

  assert.match(mobileBoardPreview, new RegExp(`fill="${palette.codex.css}">CODEX</text>`, "u"));
  assert.match(mobileBoardPreview, new RegExp(`fill="${palette.claude.css}">CLAUDE</text>`, "u"));
  assert.match(mobileBoardPreview, new RegExp(`fill="${palette.qoder.css}">QODERCLI</text>`, "u"));

  assert.match(demoFlow, new RegExp(`fill="${palette.codex.css}">Codex</text>`, "u"));
  assert.match(demoFlow, new RegExp(`fill="${palette.codex.css}">RUNNING</text>`, "u"));
  assert.match(demoFlow, new RegExp(`fill="${palette.claude.css}">NEEDS REVIEW</text>`, "u"));
  assert.match(demoFlow, new RegExp(`fill="${palette.qoder.css}">COMPLETED</text>`, "u"));
});

test("macOS app icon is generated from the KAGE logo and bundled as AppIcon", async () => {
  const buildIconScript = await readRepoFile("app", "scripts", "build-app-icon.sh");
  const bundleScript = await readRepoFile("app", "bundle.sh");
  const appIcon = await readRepoBytes("app", "Resources", "AppIcon.icns");

  assert.match(buildIconScript, /SOURCE_SVG="\$\{1:-\$REPO_ROOT\/docs\/assets\/kage-logo\.svg\}"/u);
  assert.match(buildIconScript, /OUTPUT_ICON="\$RESOURCES_DIR\/AppIcon\.icns"/u);
  assert.match(buildIconScript, /sips -s format png -z 1024 1024 "\$SOURCE_SVG"/u);
  assert.match(buildIconScript, /iconutil -c icns "\$ICONSET_DIR" -o "\$OUTPUT_ICON"/u);

  assert.match(bundleScript, /ICON_NAME="AppIcon"/u);
  assert.match(bundleScript, /<key>CFBundleIconFile<\/key>\s*<string>\$ICON_NAME<\/string>/u);
  assert.match(bundleScript, /find "\$RESOURCE_SOURCE_DIR" -maxdepth 1 -type f -exec cp \{\} "\$RESOURCES_DIR\/" \\;/u);

  assert.equal(appIcon.subarray(0, 4).toString("ascii"), "icns");
  assert.ok(appIcon.length > 100_000, "AppIcon.icns should contain the full macOS iconset, not a tiny placeholder.");
});
