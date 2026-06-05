export function renderServeUi({ passwordRequired = false } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>KAGE Sessions</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f7f7f4;
      --panel: #ffffff;
      --text: #1f2428;
      --muted: #6d747b;
      --line: #e2e2dc;
      --codex: #3a86ff;
      --claude: #d97757;
      --qoder: #10a37f;
      --shadow: 0 10px 30px rgba(24, 28, 31, 0.08);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #121416;
        --panel: #1a1d20;
        --text: #eef1f3;
        --muted: #9aa3aa;
        --line: #2c3135;
        --shadow: none;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 2;
      background: color-mix(in srgb, var(--bg) 88%, transparent);
      backdrop-filter: blur(18px);
      border-bottom: 1px solid var(--line);
      padding: 14px 16px;
    }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      max-width: 1120px;
      margin: 0 auto;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      letter-spacing: 0;
    }
    button, input, select {
      font: inherit;
    }
    button {
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--text);
      border-radius: 8px;
      padding: 8px 10px;
    }
    button.primary {
      border-color: transparent;
      background: var(--codex);
      color: white;
    }
    main {
      max-width: 1120px;
      margin: 0 auto;
      padding: 16px;
      display: grid;
      grid-template-columns: 360px minmax(0, 1fr);
      gap: 16px;
    }
    aside, section {
      min-width: 0;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    .filters {
      padding: 12px;
      display: grid;
      gap: 10px;
    }
    .tabs {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4px;
    }
    .tabs button {
      min-width: 0;
      font-size: 14px;
      white-space: nowrap;
      padding-inline: 4px;
    }
    .tabs button.active {
      background: #23272a;
      color: white;
      border-color: #23272a;
    }
    input[type="search"] {
      width: 100%;
      border: 1px solid var(--line);
      background: var(--bg);
      color: var(--text);
      border-radius: 8px;
      padding: 10px 11px;
    }
    .sessions {
      border-top: 1px solid var(--line);
      max-height: calc(100vh - 190px);
      overflow: auto;
    }
    .session {
      width: 100%;
      text-align: left;
      border: 0;
      border-radius: 0;
      border-bottom: 1px solid var(--line);
      background: transparent;
      display: grid;
      gap: 6px;
      padding: 12px;
    }
    .session.active {
      background: color-mix(in srgb, var(--codex) 11%, transparent);
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
      font-weight: 700;
      background: color-mix(in srgb, currentColor 14%, transparent);
    }
    .claude { color: var(--claude); }
    .codex { color: var(--codex); }
    .qodercli, .qoderwork { color: var(--qoder); }
    .conversation {
      min-height: calc(100vh - 110px);
      padding: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }
    .conversation-head {
      border-bottom: 1px solid var(--line);
      padding: 14px;
      display: grid;
      gap: 6px;
    }
    .live {
      color: var(--qoder);
      font-size: 12px;
      font-weight: 700;
    }
    .messages {
      padding: 14px;
      overflow: auto;
      max-height: calc(100vh - 190px);
      display: grid;
      gap: 12px;
    }
    .message {
      max-width: 82ch;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: var(--bg);
    }
    .message.user {
      margin-left: auto;
      background: color-mix(in srgb, var(--codex) 12%, var(--panel));
    }
    .role {
      font-size: 12px;
      font-weight: 800;
      color: var(--muted);
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
      margin: 8px 0 0;
    }
    details {
      margin-top: 8px;
      border-top: 1px solid var(--line);
      padding-top: 8px;
    }
    .empty {
      color: var(--muted);
      padding: 24px;
      text-align: center;
    }
    @media (max-width: 820px) {
      main {
        grid-template-columns: 1fr;
      }
      .sessions, .messages {
        max-height: none;
      }
      .conversation {
        min-height: auto;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="top">
      <h1>KAGE Sessions</h1>
      <button id="refresh" class="primary">Refresh</button>
    </div>
  </header>
  <main>
    <aside class="panel">
      <div class="filters">
        <div class="tabs" id="tabs"></div>
        <input id="search" type="search" placeholder="Search sessions">
      </div>
      <div class="sessions" id="sessions"></div>
    </aside>
    <section class="panel conversation">
      <div class="conversation-head" id="conversationHead">
        <span class="meta">Select a session</span>
      </div>
      <div class="messages" id="messages">
        <div class="empty">Sessions from Claude, Codex, and QoderCLI will appear here.</div>
      </div>
    </section>
  </main>
  <script>
    const passwordRequired = ${JSON.stringify(passwordRequired)};
    const authKey = "kageServePassword";
    let password = passwordRequired ? localStorage.getItem(authKey) : "";
    if (passwordRequired && !password) {
      password = prompt("KAGE password") || "";
      localStorage.setItem(authKey, password);
    }
    const state = { sessions: [], agents: [], selectedAgent: "all", selectedPath: null, stream: null };
    const tabs = document.getElementById("tabs");
    const sessionsEl = document.getElementById("sessions");
    const messagesEl = document.getElementById("messages");
    const headEl = document.getElementById("conversationHead");
    const searchEl = document.getElementById("search");

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
      return agentLabel(agent);
    }

    function filteredSessions() {
      const query = searchEl.value.trim().toLowerCase();
      return state.sessions.filter((session) => {
        if (state.selectedAgent !== "all" && session.agent !== state.selectedAgent) return false;
        if (!query) return true;
        return [session.agentLabel, session.title, session.shortTitle, session.cwd, session.path]
          .filter(Boolean)
          .join("\\n")
          .toLowerCase()
          .includes(query);
      });
    }

    function renderTabs() {
      const counts = new Map(state.agents.map((agent) => [agent.agent, agent.sessions.length]));
      const agents = ["all", ...state.agents.map((agent) => agent.agent)];
      tabs.innerHTML = "";
      for (const agent of agents) {
        const button = document.createElement("button");
        button.textContent = agent === "all" ? "All" : agentTabLabel(agent) + " " + (counts.get(agent) || 0);
        button.className = state.selectedAgent === agent ? "active" : "";
        button.onclick = () => {
          state.selectedAgent = agent;
          render();
        };
        tabs.append(button);
      }
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
        button.className = "session" + (state.selectedPath === session.path ? " active" : "");
        button.innerHTML = '<span class="badge ' + agentClass(session.agent) + '">' + session.agentLabel + '</span>' +
          '<strong>' + escapeHtml(session.shortTitle || session.title || "(untitled)") + '</strong>' +
          '<span class="meta">' + escapeHtml(session.cwd || "") + '</span>';
        button.onclick = () => selectSession(session);
        sessionsEl.append(button);
      }
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    }

    function blockHtml(block) {
      if (block.type === "text") return '<p>' + escapeHtml(block.content).replace(/\\n/g, "<br>") + '</p>';
      if (block.type === "thinking") return '<details><summary>Thinking</summary><pre>' + escapeHtml(block.content) + '</pre></details>';
      if (block.type === "tool_use") return '<details><summary>Tool: ' + escapeHtml(block.name) + '</summary><pre>' + escapeHtml(JSON.stringify(block.input, null, 2)) + '</pre></details>';
      if (block.type === "tool_result") return '<details><summary>Tool result</summary><pre>' + escapeHtml(block.content) + '</pre></details>';
      return '<details><summary>' + escapeHtml(block.type) + '</summary><pre>' + escapeHtml(block.content || "") + '</pre></details>';
    }

    function renderTranscript(transcript, live = false) {
      headEl.innerHTML = '<span class="badge ' + agentClass(transcript.agent) + '">' + agentLabel(transcript.agent) + '</span>' +
        '<strong>' + escapeHtml(transcript.title || transcript.sessionId || "Session") + '</strong>' +
        '<span class="meta">' + escapeHtml(transcript.cwd || "") + '</span>' +
        (live ? '<span class="live">Live</span>' : "");
      messagesEl.innerHTML = "";
      for (const message of transcript.messages || []) {
        const article = document.createElement("article");
        article.className = "message " + (message.role || "");
        article.innerHTML = '<div class="role">' + escapeHtml(message.role || "message") + '</div>' +
          (message.blocks || []).map(blockHtml).join("");
        messagesEl.append(article);
      }
      if (!messagesEl.children.length) {
        messagesEl.innerHTML = '<div class="empty">No transcript messages yet.</div>';
      }
    }

    async function selectSession(session) {
      state.selectedPath = session.path;
      renderSessions();
      if (state.stream) state.stream.close();
      const path = '/api/stream?path=' + encodeURIComponent(session.path) + '&agent=' + encodeURIComponent(session.agent);
      state.stream = new EventSource(authUrl(path));
      state.stream.addEventListener("transcript", (event) => renderTranscript(JSON.parse(event.data), true));
      state.stream.addEventListener("error", async () => {
        const transcript = await api('/api/transcript?path=' + encodeURIComponent(session.path) + '&agent=' + encodeURIComponent(session.agent));
        renderTranscript(transcript, false);
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
      if (!state.selectedPath && state.sessions[0]) await selectSession(state.sessions[0]);
      render();
    }

    document.getElementById("refresh").onclick = load;
    searchEl.oninput = renderSessions;
    load().catch((error) => {
      sessionsEl.innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>';
    });
  </script>
</body>
</html>`;
}
