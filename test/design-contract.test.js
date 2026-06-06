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

test("serve agent marks use bundled SVG brand artwork", async () => {
  const serveMain = await readRepoFile("src", "serve", "ui", "app", "src", "main.jsx");

  assert.match(serveMain, /const AGENT_ICONS = \{/u);
  assert.match(serveMain, /claude:\s*\{[\s\S]*?<svg viewBox="0 0 100 100"[\s\S]*?\n\s*\},\n\s*codex:/u);
  assert.match(serveMain, /codex:\s*\{[\s\S]*?<svg viewBox="0 0 20 20"[\s\S]*?\n\s*\},\n\s*qodercli:/u);
  assert.match(serveMain, /qodercli:\s*\{[\s\S]*?<svg viewBox="0 0 24 24"[\s\S]*?\n\s*\},\n\s*\};/u);
  assert.doesNotMatch(serveMain, /https?:\/\/[^"']+\.(?:svg|png|webp)/u);
  assert.doesNotMatch(serveMain, /<span>[CQX]<\/span>/u);
});

test("serve session list exposes sorting and date grouping controls", async () => {
  const serveMain = await readRepoFile("src", "serve", "ui", "app", "src", "main.jsx");
  const serveStyles = await readRepoFile("src", "serve", "ui", "app", "src", "styles.css");

  assert.match(serveMain, /const sessionSortOptions = \[[\s\S]*?recent[\s\S]*?agent[\s\S]*?turns[\s\S]*?title/u);
  assert.match(serveMain, /const sessionGroupOptions = \[[\s\S]*?workspace[\s\S]*?date[\s\S]*?agent/u);
  assert.match(serveMain, /function dateGroupForSession\(session, now = Date\.now\(\)\)/u);
  assert.match(serveMain, /Today[\s\S]*?Yesterday[\s\S]*?This week[\s\S]*?Older/u);
  assert.match(serveMain, /<span>Group<\/span>[\s\S]*?<select value=\{sessionGroupBy\}/u);
  assert.match(serveMain, /<span>Sort<\/span>[\s\S]*?<select value=\{sessionSort\}/u);
  assert.match(serveStyles, /\.session-list-controls/u);
});

test("serve mobile dispatch is a collapsed bottom sheet", async () => {
  const serveMain = await readRepoFile("src", "serve", "ui", "app", "src", "main.jsx");
  const serveStyles = await readRepoFile("src", "serve", "ui", "app", "src", "styles.css");

  assert.match(serveMain, /mobileDispatchOpen/u);
  assert.match(serveMain, /className="mobile-dispatch-fab"/u);
  assert.match(serveMain, /className="mobile-dispatch-backdrop"/u);
  assert.match(serveMain, /<DispatchPanel mobileOpen=\{mobileDispatchOpen\}/u);
  assert.match(serveStyles, /\.mobile-dispatch-fab/u);
  assert.match(serveStyles, /\.dispatch-panel\.mobile-open/u);
  assert.doesNotMatch(serveStyles, /@media \(max-width: 900px\)[\s\S]*?\.dispatch-panel\s*\{\s*order:\s*1;/u);
  assert.doesNotMatch(serveStyles, /\.app-shell\.mock-mobile \.dispatch-panel\s*\{\s*order:\s*1;/u);
});

test("serve grouped session cards receive the current clock value", async () => {
  const serveMain = await readRepoFile("src", "serve", "ui", "app", "src", "main.jsx");

  assert.match(serveMain, /const SessionListGroup = memo\(function SessionListGroup\(\{[\s\S]*?\bnow,\s*[\s\S]*?\}\)/u);
  assert.match(serveMain, /<SessionListItem[\s\S]*?\bnow=\{now\}/u);
});

test("serve empty states guide first-time and filtered users", async () => {
  const serveMain = await readRepoFile("src", "serve", "ui", "app", "src", "main.jsx");
  const serveStyles = await readRepoFile("src", "serve", "ui", "app", "src", "styles.css");

  assert.match(serveMain, /No sessions matching your query/u);
  assert.match(serveMain, /No \$\{agentLabel\} sessions found/u);
  assert.match(serveMain, /KAGE finds local AI coding sessions/u);
  assert.match(serveMain, /commandHint="kage doctor"/u);
  assert.match(serveMain, /New task/u);
  assert.match(serveStyles, /\.session-empty-illustration/u);
  assert.match(serveStyles, /\.session-empty-actions/u);
});

test("serve session list supports keyboard focus and multi-select affordances", async () => {
  const serveMain = await readRepoFile("src", "serve", "ui", "app", "src", "main.jsx");
  const serveStyles = await readRepoFile("src", "serve", "ui", "app", "src", "styles.css");

  assert.match(serveMain, /import \{ nextSessionFocus, selectSessionRange, toggleSessionSelection \}/u);
  assert.match(serveMain, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"/u);
  assert.match(serveMain, /event\.key === "Enter"/u);
  assert.match(serveMain, /event\.key === "Escape"/u);
  assert.match(serveMain, /event\.key === "\/" \|\| \(\(event\.metaKey \|\| event\.ctrlKey\) && event\.key\.toLowerCase\(\) === "k"\)/u);
  assert.match(serveMain, /aria-multiselectable="true"/u);
  assert.match(serveMain, /session-selection-bar/u);
  assert.match(serveStyles, /\.session-card\.focused/u);
  assert.match(serveStyles, /\.session-card\.selected/u);
});

test("serve conversation supports focus mode for wide transcript reading", async () => {
  const serveMain = await readRepoFile("src", "serve", "ui", "app", "src", "main.jsx");
  const serveStyles = await readRepoFile("src", "serve", "ui", "app", "src", "styles.css");

  assert.match(serveMain, /conversationFullscreen/u);
  assert.match(serveMain, /Fullscreen conversation/u);
  assert.match(serveMain, /Exit fullscreen conversation/u);
  assert.match(serveStyles, /\.workspace\.conversation-fullscreen/u);
  assert.match(serveStyles, /\.workspace\.conversation-fullscreen \.sidebar[\s\S]*?display:\s*none/u);
  assert.match(serveStyles, /\.workspace\.conversation-fullscreen \.conversation-panel/u);
});

test("docs position kage serve as a mobile agent monitor", async () => {
  const readme = await readRepoFile("README.md");
  const homepage = await readRepoFile("docs", "index.html");

  assert.match(readme, /Mobile agent monitor/u);
  assert.match(readme, /see what your agents are doing/u);
  assert.match(readme, /Serve the mobile agent monitor over your LAN/u);
  assert.match(homepage, /Mobile agent monitor/u);
  assert.match(homepage, /See what local agents are doing from phone or tablet/u);
  assert.match(homepage, /See what your agents are doing from your phone/u);
});

test("serve surfaces live monitoring as a primary state", async () => {
  const serveMain = await readRepoFile("src", "serve", "ui", "app", "src", "main.jsx");
  const serveStyles = await readRepoFile("src", "serve", "ui", "app", "src", "styles.css");

  assert.match(serveMain, /KAGE Monitor/u);
  assert.match(serveMain, /Monitoring live session/u);
  assert.match(serveMain, /className="status-pill monitor"/u);
  assert.match(serveMain, /className="active-now-card"/u);
  assert.match(serveMain, />Active now</u);
  assert.match(serveStyles, /\.status-pill\.monitor/u);
  assert.match(serveStyles, /\.active-now-card/u);
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
