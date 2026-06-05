export function renderServeManifest() {
  return `${JSON.stringify(
    {
      name: "KAGE Sessions",
      short_name: "KAGE",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#101316",
      theme_color: "#101316",
      description: "Local KAGE session viewer for Claude Code, Codex, QoderCLI, and QoderWork.",
      icons: [
        {
          src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Crect width='128' height='128' rx='28' fill='%23101316'/%3E%3Cpath d='M34 35h60L72 64l22 29H34l22-29L34 35Z' fill='%233a86ff'/%3E%3Cpath d='M48 46h32L64 64l16 18H48l16-18-16-18Z' fill='%2310a37f'/%3E%3C/svg%3E",
          sizes: "128x128",
          type: "image/svg+xml",
        },
      ],
    },
    null,
    2,
  )}\n`;
}

export function renderServeServiceWorker() {
  return `self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
`;
}

export function renderServeUi({ passwordRequired = false } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#101316">
  <link rel="manifest" href="/manifest.webmanifest">
  <title>KAGE Sessions</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #101316;
      --bg-soft: #15191d;
      --panel: #1b2025;
      --panel-strong: #222930;
      --text: #f1f4f6;
      --muted: #a3adb6;
      --dim: #737f89;
      --line: #303840;
      --line-soft: #252c33;
      --codex: #3a86ff;
      --claude: #d97757;
      --qoder: #10a37f;
      --ok: #3bd671;
      --warn: #e8b450;
      --shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
    }
    :root[data-theme="light"] {
      color-scheme: light;
      --bg: #f5f6f2;
      --bg-soft: #eceee8;
      --panel: #ffffff;
      --panel-strong: #f6f7f4;
      --text: #1f2428;
      --muted: #66717b;
      --dim: #7b858e;
      --line: #dfe2dc;
      --line-soft: #eceee9;
      --shadow: 0 18px 42px rgba(31, 36, 40, 0.08);
    }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at top left, color-mix(in srgb, var(--codex) 18%, transparent), transparent 34rem),
        linear-gradient(135deg, var(--bg), color-mix(in srgb, var(--bg) 88%, var(--qoder)));
      color: var(--text);
      font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    button, input, textarea {
      font: inherit;
    }
    button {
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--text);
      border-radius: 8px;
      padding: 9px 11px;
      min-height: 38px;
      cursor: pointer;
    }
    button:hover { background: var(--panel-strong); }
    button:disabled {
      color: var(--dim);
      cursor: default;
      opacity: 0.7;
    }
    button.primary {
      border-color: transparent;
      background: var(--codex);
      color: white;
    }
    .app {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }
    header {
      position: sticky;
      top: 0;
      z-index: 5;
      background: color-mix(in srgb, var(--bg) 82%, transparent);
      backdrop-filter: blur(18px);
      border-bottom: 1px solid var(--line);
      padding: max(12px, env(safe-area-inset-top)) 16px 12px;
    }
    .top {
      max-width: 1220px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
    }
    .brand {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .mark {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background:
        linear-gradient(135deg, var(--codex), var(--qoder));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, white 22%, transparent);
    }
    h1 {
      margin: 0;
      font-size: 18px;
      letter-spacing: 0;
      line-height: 1.1;
    }
    .subtle {
      color: var(--muted);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .top-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .layout {
      width: min(1220px, 100%);
      margin: 0 auto;
      padding: 16px;
      display: grid;
      grid-template-columns: minmax(300px, 388px) minmax(0, 1fr);
      gap: 16px;
      min-height: 0;
    }
    .panel {
      min-width: 0;
      background: color-mix(in srgb, var(--panel) 94%, transparent);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .sidebar {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      min-height: calc(100vh - 96px);
    }
    .filters {
      padding: 12px;
      display: grid;
      gap: 10px;
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--panel-strong) 64%, transparent);
    }
    .tabs {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 5px;
    }
    .tabs button {
      min-width: 0;
      padding-inline: 6px;
      font-size: 13px;
      white-space: nowrap;
    }
    .tabs button.active {
      background: var(--text);
      color: var(--bg);
      border-color: var(--text);
    }
    .search-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
    }
    input[type="search"], textarea {
      width: 100%;
      border: 1px solid var(--line);
      background: var(--bg-soft);
      color: var(--text);
      border-radius: 8px;
      padding: 10px 11px;
      outline: none;
    }
    input[type="search"]:focus, textarea:focus {
      border-color: color-mix(in srgb, var(--codex) 72%, var(--line));
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--codex) 18%, transparent);
    }
    .sessions {
      overflow: auto;
    }
    .session {
      width: 100%;
      text-align: left;
      border: 0;
      border-radius: 0;
      border-bottom: 1px solid var(--line-soft);
      background: transparent;
      display: grid;
      gap: 7px;
      padding: 13px 14px;
      min-height: 94px;
    }
    .session:hover { background: color-mix(in srgb, var(--panel-strong) 55%, transparent); }
    .session.active {
      background: color-mix(in srgb, var(--codex) 16%, var(--panel));
      box-shadow: inset 3px 0 0 var(--codex);
    }
    .session-title {
      font-size: 15px;
      line-height: 1.25;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .meta {
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      width: max-content;
      gap: 6px;
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 12px;
      font-weight: 750;
      background: color-mix(in srgb, currentColor 16%, transparent);
    }
    .badge::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
    }
    .claude { color: var(--claude); }
    .codex { color: var(--codex); }
    .qodercli, .qoderwork { color: var(--qoder); }
    .conversation {
      min-height: calc(100vh - 96px);
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
    }
    .conversation-head {
      border-bottom: 1px solid var(--line);
      padding: 14px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      background: color-mix(in srgb, var(--panel-strong) 68%, transparent);
    }
    .back {
      display: none;
    }
    .session-head-text {
      min-width: 0;
      display: grid;
      gap: 4px;
    }
    .live {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 750;
    }
    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--dim);
    }
    .live.active {
      color: var(--ok);
    }
    .live.active .live-dot {
      background: var(--ok);
      animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(0.8); opacity: 0.6; }
      50% { transform: scale(1.2); opacity: 1; }
    }
    .messages {
      overflow: auto;
      padding: 16px;
      display: grid;
      align-content: start;
      gap: 14px;
      background: color-mix(in srgb, var(--bg) 76%, transparent);
    }
    .message {
      width: min(760px, 100%);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: var(--panel);
      display: grid;
      gap: 10px;
    }
    .message.user {
      margin-left: auto;
      background: color-mix(in srgb, var(--codex) 14%, var(--panel));
      border-color: color-mix(in srgb, var(--codex) 34%, var(--line));
    }
    .message.tool {
      background: color-mix(in srgb, var(--qoder) 10%, var(--panel));
    }
    .role {
      font-size: 11px;
      font-weight: 850;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .text-block p {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .block {
      border: 1px solid var(--line-soft);
      border-radius: 8px;
      background: color-mix(in srgb, var(--bg-soft) 72%, transparent);
      overflow: hidden;
    }
    .block summary {
      min-height: 42px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 9px 11px;
      cursor: pointer;
      color: var(--muted);
      font-weight: 750;
    }
    .block pre {
      margin: 0;
      padding: 11px;
      border-top: 1px solid var(--line-soft);
      color: var(--text);
      background: color-mix(in srgb, black 10%, transparent);
    }
    .thinking pre {
      color: var(--muted);
      font-style: italic;
    }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font: 12.5px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .composer {
      border-top: 1px solid var(--line);
      padding: 12px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      background: color-mix(in srgb, var(--panel-strong) 72%, transparent);
    }
    textarea {
      min-height: 44px;
      max-height: 140px;
      resize: vertical;
    }
    .composer-actions {
      display: grid;
      gap: 8px;
      align-content: start;
    }
    .toast {
      position: fixed;
      left: 50%;
      bottom: 18px;
      transform: translateX(-50%);
      background: var(--text);
      color: var(--bg);
      padding: 9px 12px;
      border-radius: 8px;
      box-shadow: var(--shadow);
      opacity: 0;
      pointer-events: none;
      transition: opacity 160ms ease;
      z-index: 20;
    }
    .toast.show { opacity: 1; }
    .history-bar {
      width: min(760px, 100%);
      margin: 0 auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: color-mix(in srgb, var(--panel) 86%, transparent);
      padding: 9px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: var(--muted);
      font-size: 12px;
    }
    .empty {
      color: var(--muted);
      padding: 28px;
      text-align: center;
      align-self: center;
    }
    @media (max-width: 840px) {
      header {
        padding-inline: 12px;
      }
      .layout {
        padding: 10px;
        grid-template-columns: 1fr;
      }
      .sidebar, .conversation {
        min-height: calc(100vh - 82px);
      }
      .layout.detail-open .sidebar {
        display: none;
      }
      .layout:not(.detail-open) .conversation {
        display: none;
      }
      .back {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .conversation-head {
        grid-template-columns: auto auto minmax(0, 1fr) auto;
      }
      .live {
        justify-self: end;
      }
      .composer {
        grid-template-columns: 1fr;
        padding-bottom: max(12px, env(safe-area-inset-bottom));
      }
      .composer-actions {
        grid-template-columns: 1fr 1fr;
      }
      .history-bar {
        flex-direction: column;
        align-items: stretch;
      }
      button {
        min-height: 44px;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <header>
      <div class="top">
        <div class="brand">
          <div class="mark" aria-hidden="true"></div>
          <div>
            <h1>KAGE Sessions</h1>
            <div class="subtle" id="scope">Local-first agent memory</div>
          </div>
        </div>
        <div class="top-actions">
          <button id="themeToggle" type="button">Theme</button>
          <button id="refresh" type="button" class="primary">Refresh</button>
        </div>
      </div>
    </header>
    <main class="layout" id="layout">
      <aside class="panel sidebar">
        <div class="filters">
          <div class="tabs" id="tabs"></div>
          <div class="search-row">
            <input id="search" type="search" placeholder="Search sessions" autocomplete="off">
            <button id="clearSearch" type="button">Clear</button>
          </div>
        </div>
        <div class="sessions" id="sessions"></div>
      </aside>
      <section class="panel conversation" id="conversation">
        <div class="conversation-head" id="conversationHead">
          <button class="back" id="back" type="button">Back</button>
          <span class="meta">Select a session</span>
        </div>
        <div class="messages" id="messages">
          <div class="empty">Sessions from Claude, Codex, QoderCLI, and QoderWork will appear here.</div>
        </div>
        <form class="composer" id="composer">
          <textarea id="draft" placeholder="Draft message" rows="2"></textarea>
          <div class="composer-actions">
            <button type="submit" class="primary" id="copyCommand">Copy Command</button>
            <button type="button" id="copyResume">Copy Resume</button>
          </div>
        </form>
      </section>
    </main>
  </div>
  <div class="toast" id="toast"></div>
  <script>
    const passwordRequired = ${JSON.stringify(passwordRequired)};
    const authKey = "kageServePassword";
    const themeKey = "kageServeTheme";
    let password = passwordRequired ? localStorage.getItem(authKey) : "";
    if (passwordRequired && !password) {
      password = prompt("KAGE password") || "";
      localStorage.setItem(authKey, password);
    }

    const state = {
      sessions: [],
      agents: [],
      selectedAgent: "all",
      selectedPath: null,
      selectedSession: null,
      transcript: null,
      visibleCount: 180,
      stream: null,
      live: false,
    };
    const initialVisibleMessages = 180;
    const visibleMessageStep = 180;

    const layout = document.getElementById("layout");
    const tabs = document.getElementById("tabs");
    const sessionsEl = document.getElementById("sessions");
    const messagesEl = document.getElementById("messages");
    const headEl = document.getElementById("conversationHead");
    const searchEl = document.getElementById("search");
    const draftEl = document.getElementById("draft");
    const scopeEl = document.getElementById("scope");
    const toastEl = document.getElementById("toast");

    function setTheme(theme) {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem(themeKey, theme);
    }

    const initialTheme = localStorage.getItem(themeKey) || "dark";
    setTheme(initialTheme);

    function authUrl(path) {
      const url = new URL(path, location.origin);
      if (password) url.searchParams.set("password", password);
      return url;
    }

    async function api(path) {
      const res = await fetch(authUrl(path));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }

    function showToast(message) {
      toastEl.textContent = message;
      toastEl.classList.add("show");
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 1400);
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    }

    function shellQuote(value) {
      const text = String(value ?? "");
      return /^[A-Za-z0-9_./:@%+=,-]+$/.test(text) ? text : "'" + text.replace(/'/g, "'\\\\''") + "'";
    }

    function agentClass(agent) {
      return agent === "claude" ? "claude" : agent === "codex" ? "codex" : "qodercli";
    }

    function agentLabel(agent) {
      if (agent === "claude") return "Claude";
      if (agent === "codex") return "Codex";
      if (agent === "qodercli") return "QoderCLI";
      if (agent === "qoderwork") return "QoderWork";
      return agent || "Agent";
    }

    function agentTabLabel(agent) {
      if (agent === "qodercli") return "Qoder";
      if (agent === "qoderwork") return "QWork";
      return agentLabel(agent);
    }

    function resumeCommand(session) {
      if (!session) return "";
      const cd = session.cwd ? "cd " + shellQuote(session.cwd) + " && " : "";
      if (session.agent === "claude") return cd + "claude --resume " + shellQuote(session.sessionId);
      if (session.agent === "codex") return cd + "codex resume " + shellQuote(session.sessionId);
      if (session.agent === "qodercli") return "qodercli --cwd " + shellQuote(session.cwd || ".") + " --resume " + shellQuote(session.sessionId);
      return cd + "kage " + shellQuote(session.agent) + " --session " + shellQuote(session.path);
    }

    function commandWithDraft(session, draft) {
      const command = resumeCommand(session);
      const text = draft.trim();
      if (!text) return command;
      if (session?.agent === "claude") return command + " " + shellQuote(text);
      return command + "\\n\\n# Draft to paste after the session resumes:\\n" + text.split("\\n").map((line) => "# " + line).join("\\n");
    }

    async function copyText(text, label) {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.append(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      showToast(label);
    }

    function sessionSearchText(session) {
      return [
        session.agentLabel,
        session.title,
        session.shortTitle,
        session.cwd,
        session.path,
        session.lineage?.parentTitle,
        session.lineage?.parentSessionId,
        ...(session.recentUserMessages || []),
      ]
        .filter(Boolean)
        .join("\\n")
        .toLowerCase();
    }

    function filteredSessions() {
      const query = searchEl.value.trim().toLowerCase();
      return state.sessions.filter((session) => {
        if (state.selectedAgent !== "all" && session.agent !== state.selectedAgent) return false;
        return !query || sessionSearchText(session).includes(query);
      });
    }

    function renderTabs() {
      const counts = new Map(state.agents.map((agent) => [agent.agent, agent.sessions.length]));
      const agents = ["all", ...state.agents.map((agent) => agent.agent)];
      tabs.innerHTML = "";
      for (const agent of agents) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = agent === "all" ? "All" : agentTabLabel(agent) + " " + (counts.get(agent) || 0);
        button.className = state.selectedAgent === agent ? "active" : "";
        button.onclick = () => {
          state.selectedAgent = agent;
          render();
        };
        tabs.append(button);
      }
    }

    function lineageLabel(session) {
      const lineage = session.lineage;
      if (!lineage) return "";
      const kind = lineage.forkType === "bridge" ? "Bridged" : "Forked";
      const parent = lineage.parentTitle || lineage.parentSessionId || "parent session";
      return kind + " from " + parent;
    }

    function renderSessions() {
      const sessions = filteredSessions();
      if (sessions.length === 0) {
        sessionsEl.innerHTML = '<div class="empty">No sessions match this view.</div>';
        return;
      }
      sessionsEl.innerHTML = "";
      for (const session of sessions) {
        const button = document.createElement("button");
        const lineage = lineageLabel(session);
        button.type = "button";
        button.className = "session" + (state.selectedPath === session.path ? " active" : "");
        button.innerHTML =
          '<span class="badge ' + agentClass(session.agent) + '">' + escapeHtml(session.agentLabel) + '</span>' +
          '<strong class="session-title">' + escapeHtml(session.shortTitle || session.title || "(untitled)") + '</strong>' +
          '<span class="meta">' + escapeHtml(session.cwd || "") + '</span>' +
          (lineage ? '<span class="meta">' + escapeHtml(lineage) + '</span>' : "");
        button.onclick = () => selectSession(session);
        sessionsEl.append(button);
      }
    }

    function textBlockHtml(block) {
      return '<div class="text-block"><p>' + escapeHtml(block.content).replace(/\\n/g, "<br>") + '</p></div>';
    }

    function detailsBlockHtml(kind, label, content, options = {}) {
      const lines = String(content ?? "").split("\\n").length;
      const open = options.open || (kind === "tool-result" && lines <= 5) ? " open" : "";
      const hint = lines > 5 ? '<span class="meta">' + lines + ' lines</span>' : "";
      return '<details class="block ' + kind + '"' + open + '><summary><span>' + escapeHtml(label) + '</span>' + hint + '</summary><pre>' + escapeHtml(content) + '</pre></details>';
    }

    function blockHtml(block) {
      if (block.type === "text") return textBlockHtml(block);
      if (block.type === "thinking") return detailsBlockHtml("thinking", "Thinking", block.content);
      if (block.type === "tool_use") return detailsBlockHtml("tool-use", "Tool: " + (block.name || "tool"), JSON.stringify(block.input ?? {}, null, 2));
      if (block.type === "tool_result") return detailsBlockHtml("tool-result", "Tool result", block.content);
      return detailsBlockHtml("block", block.type || "Block", block.content || JSON.stringify(block, null, 2));
    }

    function renderMessageList({ stickToBottom = true, preserveTop = false } = {}) {
      const transcript = state.transcript;
      const allMessages = transcript?.messages || [];
      const hiddenCount = Math.max(0, allMessages.length - state.visibleCount);
      const messages = hiddenCount > 0 ? allMessages.slice(hiddenCount) : allMessages;
      const previousScrollHeight = messagesEl.scrollHeight;
      messagesEl.innerHTML = "";
      if (hiddenCount > 0) {
        const bar = document.createElement("div");
        bar.className = "history-bar";
        bar.innerHTML = '<span>Showing latest ' + messages.length + ' of ' + allMessages.length + ' messages</span><button type="button" id="showOlder">Show Older</button>';
        messagesEl.append(bar);
        bar.querySelector("button").onclick = () => {
          state.visibleCount += visibleMessageStep;
          renderMessageList({ stickToBottom: false, preserveTop: true });
        };
      }
      for (const message of messages) {
        const article = document.createElement("article");
        const role = message.role || "message";
        article.className = "message " + role;
        article.innerHTML = '<div class="role">' + escapeHtml(role) + '</div>' + (message.blocks || []).map(blockHtml).join("");
        messagesEl.append(article);
      }
      if (allMessages.length === 0) {
        messagesEl.innerHTML = '<div class="empty">No transcript messages yet.</div>';
        return;
      }
      requestAnimationFrame(() => {
        if (stickToBottom) {
          messagesEl.scrollTop = messagesEl.scrollHeight;
          return;
        }
        if (preserveTop) {
          messagesEl.scrollTop = messagesEl.scrollHeight - previousScrollHeight;
        }
      });
    }

    function renderTranscriptHead(transcript, live = false) {
      const sessionTitle = transcript.title || transcript.sessionId || "Session";
      headEl.innerHTML =
        '<button class="back" id="backInline" type="button">Back</button>' +
        '<span class="badge ' + agentClass(transcript.agent) + '">' + agentLabel(transcript.agent) + '</span>' +
        '<div class="session-head-text"><strong>' + escapeHtml(sessionTitle) + '</strong><span class="meta">' + escapeHtml(transcript.cwd || "") + '</span></div>' +
        '<span class="live ' + (live ? "active" : "") + '"><span class="live-dot"></span>' + (live ? "Live" : "Offline") + '</span>';
      document.getElementById("backInline").onclick = showList;
    }

    function renderTranscript(transcript, live = false) {
      state.live = live;
      state.transcript = transcript;
      renderTranscriptHead(transcript, live);
      renderMessageList();
    }

    function showDetail() {
      layout.classList.add("detail-open");
    }

    function showList() {
      layout.classList.remove("detail-open");
    }

    async function selectSession(session) {
      state.selectedPath = session.path;
      state.selectedSession = session;
      state.transcript = null;
      state.visibleCount = initialVisibleMessages;
      messagesEl.innerHTML = '<div class="empty">Loading transcript...</div>';
      renderSessions();
      showDetail();
      if (state.stream) state.stream.close();
      const path = '/api/stream?path=' + encodeURIComponent(session.path) + '&agent=' + encodeURIComponent(session.agent);
      state.stream = new EventSource(authUrl(path));
      state.stream.addEventListener("transcript", (event) => renderTranscript(JSON.parse(event.data), true));
      state.stream.addEventListener("error", async () => {
        try {
          const transcript = await api('/api/transcript?path=' + encodeURIComponent(session.path) + '&agent=' + encodeURIComponent(session.agent));
          renderTranscript(transcript, false);
        } catch (error) {
          messagesEl.innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>';
        }
      });
    }

    function render() {
      renderTabs();
      renderSessions();
    }

    async function load() {
      const data = await api("/api/sessions");
      state.sessions = data.sessions || [];
      state.agents = data.agents || [];
      scopeEl.textContent = (data.sessions?.length || 0) + " sessions in " + (data.cwd || "current project");
      if (!state.selectedPath && state.sessions[0]) {
        await selectSession(state.sessions[0]);
        if (matchMedia("(max-width: 840px)").matches) showList();
      }
      render();
    }

    document.getElementById("refresh").onclick = () => load().catch((error) => showToast(error.message));
    document.getElementById("themeToggle").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    document.getElementById("clearSearch").onclick = () => {
      searchEl.value = "";
      renderSessions();
    };
    document.getElementById("back").onclick = showList;
    document.getElementById("copyResume").onclick = () => copyText(resumeCommand(state.selectedSession), "Resume command copied");
    document.getElementById("composer").onsubmit = (event) => {
      event.preventDefault();
      copyText(commandWithDraft(state.selectedSession, draftEl.value), "Command copied");
    };
    searchEl.oninput = renderSessions;

    let touchStartX = null;
    document.getElementById("conversation").addEventListener("touchstart", (event) => {
      touchStartX = event.touches[0]?.clientX ?? null;
    }, { passive: true });
    document.getElementById("conversation").addEventListener("touchend", (event) => {
      if (touchStartX === null) return;
      const delta = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
      if (delta > 70) showList();
      touchStartX = null;
    }, { passive: true });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    load().catch((error) => {
      sessionsEl.innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>';
    });
  </script>
</body>
</html>`;
}
