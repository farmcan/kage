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
  const homepageSource = await readRepoFile("site", "src", "main.jsx");
  const homepageStyles = await readRepoFile("site", "src", "styles.css");
  const readme = await readRepoFile("README.md");
  const logo = await readRepoFile("docs", "assets", "kage-logo.svg");

  assert.match(dashboard, /case "codex":\s*return AgentPalette\.codex/u);
  assert.match(dashboard, /case "qodercli", "qoderwork":\s*return AgentPalette\.qoder/u);
  assert.match(dashboard, /case "claude":\s*return AgentPalette\.claude/u);

  assert.match(dashboard, new RegExp(`static let codex = Color\\(hex: ${palette.codex.swift}\\)`, "u"));
  assert.match(dashboard, new RegExp(`static let qoder = Color\\(hex: ${palette.qoder.swift}\\)`, "u"));
  assert.match(dashboard, new RegExp(`static let claude = Color\\(hex: ${palette.claude.swift}\\)`, "u"));

  assert.match(homepageStyles, new RegExp(`--agent-codex: ${palette.codex.css};`, "u"));
  assert.match(homepageStyles, new RegExp(`--agent-qoder: ${palette.qoder.css};`, "u"));
  assert.match(homepageStyles, new RegExp(`--agent-claude: ${palette.claude.css};`, "u"));
  assert.doesNotMatch(homepageSource, /assets\/screenshots|hero-screenshot|preview-duo/u);
  assert.doesNotMatch(readme, /## Screenshots|assets\/screenshots/u);
  assert.match(homepage, /<html lang="zh-CN">/u);
  assert.match(homepage, /\/kage\/site-assets\/app\.css/u);
  assert.match(homepage, /\/kage\/site-assets\/app\.js/u);
  assert.match(homepageSource, /import PrimerBrand from "@primer\/react-brand"/u);
  assert.match(homepageSource, /Hero,[\s\S]*?Pillar,[\s\S]*?River,[\s\S]*?Section/u);
  assert.match(homepageSource, /localStorage\.getItem\("kage-locale"\) === "en" \? "en" : "zh-CN"/u);
  assert.match(homepageSource, /localStorage\.getItem\("kage-theme"\) === "dark" \? "dark" : "light"/u);
  assert.match(homepageSource, /<ThemeProvider colorMode=\{colorMode\}/u);
  assert.match(homepageSource, /switchToDark: "切换到黑色主题"[\s\S]*?switchToLight: "切换到白色主题"/u);
  assert.match(homepageSource, /installCopied: "安装命令已复制"[\s\S]*?installCopied: "Install command copied"/u);
  assert.match(homepageSource, /<Hero\.PrimaryAction href="#install-kage">/u);
  assert.match(homepageSource, /<Section id="install-kage" className="cta-section"/u);
  assert.match(homepageSource, /onClick=\{\(\) => copyInstallCommand\(INSTALL_COMMAND\)\}[\s\S]*?installCopied \? t\.start\.installCopied : t\.cta\.install/u);
  assert.match(homepageStyles, /:root \{[\s\S]*?color-scheme: light;[\s\S]*?--kage-bg: #ffffff;/u);
  assert.match(homepageStyles, /:root\[data-theme="dark"\] \{[\s\S]*?color-scheme: dark;[\s\S]*?--kage-bg: #07090d;/u);
  assert.match(homepageSource, /heading: "别让 Agent\\n从零开始。"/u);
  assert.match(homepageSource, /找回旧工作[\s\S]*?Codex \/ Claude \/ QoderCLI 都能分身[\s\S]*?跨 Agent 带上下文接力[\s\S]*?全程本地/u);
  assert.match(homepageSource, /id="x2x"[\s\S]*?<ParallelVisual t=\{t\}/u);
  assert.match(homepageSource, /不只 Codex。每个 Agent 都能再开一条工作线。/u);
  assert.match(homepageSource, /kage x2x[\s\S]*?kage c2c[\s\S]*?kage q2q/u);
  assert.match(homepageSource, /示例 · 当前 Codex[\s\S]*?示例 · Codex 分身/u);
  assert.match(homepageSource, /id="c2x"[\s\S]*?<BridgeVisual t=\{t\}/u);
  assert.match(homepageSource, /Claude、Codex、QoderCLI，换着做也不用重讲。/u);
  assert.match(homepageSource, /kage c2x[\s\S]*?kage q2x[\s\S]*?kage x2q/u);
  assert.match(homepageSource, /也支持 x2c · c2q · q2c/u);
  assert.match(homepageStyles, /\.route-agent-qoder b/u);
  assert.match(homepageSource, /HTML 回放（x2v \/ c2v \/ q2v）[\s\S]*?导出清理（kage clean）[\s\S]*?QoderWork 也能作为搜索、回放和接力来源/u);
  assert.match(homepageSource, /手机查看和调度 Agent[\s\S]*?按需启动新的本地任务/u);
  assert.match(homepageSource, /const SUPPORT_QR_IMAGE = "\/kage\/assets\/support-alipay-qr\.jpg"/u);
  assert.match(homepageSource, /完全自愿 · 不影响任何功能[\s\S]*?KAGE 会继续免费开源/u);
  assert.match(homepageSource, /Optional · No features are gated[\s\S]*?KAGE will stay free and open source/u);
  assert.match(homepageSource, /aria-haspopup="dialog"[\s\S]*?aria-label=\{t\.nav\.support\}/u);
  assert.match(homepageSource, /supportOpen && <SupportDialog/u);
  assert.match(homepageStyles, /\.support-dialog::backdrop/u);
  assert.match(homepageStyles, /\.support-qr-frame img/u);

  assert.match(logo, /Agent dots, left to right: Codex, QoderCLI\/QoderWork, Claude/u);
  assert.match(logo, new RegExp(`<circle cx="164" cy="360" r="24" fill="${palette.codex.css}"/>`, "u"));
  assert.match(logo, new RegExp(`<circle cx="256" cy="376" r="24" fill="${palette.qoder.css}"/>`, "u"));
  assert.match(logo, new RegExp(`<circle cx="348" cy="360" r="24" fill="${palette.claude.css}"/>`, "u"));
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
  assert.match(serveMain, /className=\{cls\("app-shell", isMobileLayout && "mock-mobile"\)\}/u);
  assert.match(serveStyles, /\.mobile-dispatch-fab/u);
  assert.match(serveStyles, /\.dispatch-panel\.mobile-open/u);
  assert.match(serveStyles, /\.app-shell\.mock-mobile \.topbar/u);
  assert.match(serveStyles, /Final mobile task launcher placement[\s\S]*?\.mobile-dispatch-fab[\s\S]*?bottom:\s*max\(14px, env\(safe-area-inset-bottom\)\)/u);
  assert.match(serveStyles, /Final mobile task launcher placement[\s\S]*?\.dispatch-panel\.mobile-open[\s\S]*?bottom:\s*max\(10px, env\(safe-area-inset-bottom\)\)/u);
  assert.doesNotMatch(serveStyles, /@media \(max-width: (?:900|520)px\)/u);
  assert.doesNotMatch(serveStyles, /@media \(max-width: 900px\)[\s\S]*?\.dispatch-panel\s*\{\s*order:\s*1;/u);
  assert.doesNotMatch(serveStyles, /\.app-shell\.mock-mobile \.dispatch-panel\s*\{\s*order:\s*1;/u);
});

test("serve dispatch path prioritizes new-task flow on mobile sheet", async () => {
  const serveMain = await readRepoFile("src", "serve", "ui", "app", "src", "main.jsx");

  assert.match(serveMain, /<button type="button" className="mobile-dispatch-fab" onClick=\{\(\) => setMobileDispatchOpen\(true\)\}>[\s\S]*?New Task/u);
  assert.match(serveMain, /className="dispatch-console-title"[\s\S]*?New Task/u);
  assert.match(serveMain, /<Composer session=\{selectedSession\} allowReply=\{false\} \/>/u);
  assert.match(serveMain, /<Composer session=\{selectedSession\} compact allowReply \/>/u);
  assert.match(serveMain, /"Direct send starts a new local session\."/u);
  assert.match(serveMain, /codex exec --dangerously-bypass-approvals-and-sandbox/u);
});

test("serve task board presents readable results before raw diagnostics", async () => {
  const serveMain = await readRepoFile("src", "serve", "ui", "app", "src", "main.jsx");
  const serveStyles = await readRepoFile("src", "serve", "ui", "app", "src", "styles.css");

  assert.match(serveMain, /function TaskResultPanel\(\{ task \}\)/u);
  assert.match(serveMain, /function taskFailureText\(task\)/u);
  assert.match(serveMain, /repeated Codex setup warning/u);
  assert.match(serveMain, /function presentableTaskOutput\(value, options = \{\}\)/u);
  assert.match(serveMain, /function taskTextLooksMarkdown\(value\)/u);
  assert.match(serveMain, /function shouldRenderTaskSectionAsMarkdown\(section\)/u);
  assert.match(serveMain, /function TaskResultSectionText\(\{ section \}\)/u);
  assert.match(serveMain, /title: "Final Output"[\s\S]*format: "markdown"/u);
  assert.match(serveMain, /title: "Failure"[\s\S]*format: "auto"/u);
  assert.match(serveMain, /title: "Activity"[\s\S]*format: "auto"/u);
  assert.match(serveMain, /section\.format === "auto" && taskTextLooksMarkdown\(section\.text\)/u);
  assert.match(serveMain, /<MarkdownText content=\{section\.text\} \/>/u);
  assert.match(serveMain, /<details key=\{section\.key\} className=\{cls\("task-result-section", section\.tone\)\}[\s\S]*?<TaskResultSectionText section=\{section\} \/>/u);
  assert.match(serveStyles, /\.task-result-panel/u);
  assert.match(serveStyles, /\.task-result-markdown/u);
  assert.match(serveStyles, /\.task-result-section\.diagnostics/u);
  assert.match(serveStyles, /\.task-result-section pre/u);
});

test("serve task board reveals current output when review is needed", async () => {
  const serveMain = await readRepoFile("src", "serve", "ui", "app", "src", "main.jsx");

  assert.match(serveMain, /function revealTaskOnBoard\(taskId\)/u);
  assert.match(serveMain, /state\.setViewMode\("board"\)/u);
  assert.match(serveMain, /state\.setSelectedTaskId\(taskId\)/u);
  assert.match(serveMain, /const reviewTaskToReveal = tasks\.find/u);
  assert.match(serveMain, /task\.status === "needs_review" && previousStatus !== "needs_review"/u);
  assert.match(serveMain, /if \(reviewTaskToReveal\) \{[\s\S]*?revealTaskOnBoard\(reviewTaskToReveal\.id\)/u);
  assert.match(serveMain, /useStore\.getState\(\)\.setSelectedTaskId\(optimisticTask\.id\)/u);
  assert.match(serveMain, /useStore\.getState\(\)\.setSelectedTaskId\(data\.task\.id\)/u);
  assert.match(serveMain, /if \(task\.status === "needs_review"\) \{[\s\S]*?revealTaskOnBoard\(task\.id\)/u);
  assert.match(serveMain, /if \(result\.task\) \{[\s\S]*?setSelectedTaskId\(result\.task\.id\)/u);
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
  assert.match(serveMain, /role="list"/u);
  assert.doesNotMatch(serveMain, /role="listbox"/u);
  assert.doesNotMatch(serveMain, /aria-multiselectable="true"/u);
  assert.match(serveMain, /session-selection-bar/u);
  assert.match(serveStyles, /\.session-card\.focused/u);
  assert.match(serveStyles, /\.session-card\.selected/u);
});

test("serve mobile interaction fixes stay wired", async () => {
  const serveMain = await readRepoFile("src", "serve", "ui", "app", "src", "main.jsx");
  const serveStyles = await readRepoFile("src", "serve", "ui", "app", "src", "styles.css");

  assert.match(serveStyles, /--accent:\s*var\(--codex\)/u);
  assert.match(serveMain, /function autoGrowTextarea\(textarea\)/u);
  assert.match(serveMain, /ref=\{textareaRef\}/u);
  assert.match(serveStyles, /\.composer textarea[\s\S]*?height:\s*auto[\s\S]*?resize:\s*none[\s\S]*?overflow-y:\s*auto/u);
  assert.match(serveMain, /TRANSCRIPT_RECONNECT_BASE_MS/u);
  assert.match(serveMain, /class ErrorBoundary extends React\.Component/u);
  assert.match(serveMain, /<ErrorBoundary>[\s\S]*?<App \/>[\s\S]*?<\/ErrorBoundary>/u);
  assert.match(serveMain, /aria-keyshortcuts="\/ Meta\+K Control\+K"/u);
  assert.match(serveMain, /aria-keyshortcuts="Meta\+Enter Control\+Enter"/u);
  assert.match(serveMain, /Cmd\+Enter/u);
  assert.match(serveMain, /TASK_POLL_INTERVAL_MS = 10000/u);
  assert.match(serveMain, /document\.visibilityState === "visible"/u);
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

test("docs position kage serve as a mobile agent monitor and dispatcher", async () => {
  const readme = await readRepoFile("README.md");
  const homepageSource = await readRepoFile("site", "src", "main.jsx");

  assert.match(readme, /Mobile agent monitor/u);
  assert.match(readme, /see what your agents are doing/u);
  assert.match(readme, /Serve the mobile agent monitor over your LAN/u);
  assert.match(homepageSource, /Monitor and dispatch from your phone/u);
  assert.match(homepageSource, /Watch progress and start new local tasks over a trusted LAN/u);
  assert.match(homepageSource, /手机查看和调度 Agent/u);
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
