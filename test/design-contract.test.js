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

async function readRepoBytes(...parts) {
  return fs.readFile(path.join(repoRoot, ...parts));
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
