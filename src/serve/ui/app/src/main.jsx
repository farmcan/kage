import * as Collapsible from "@radix-ui/react-collapsible";
import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Activity,
  ArrowLeft,
  Bot,
  Brain,
  Braces,
  Check,
  ChevronDown,
  Copy,
  Hammer,
  Loader2,
  Lock,
  Moon,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Sun,
  Terminal,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";

import "./styles.css";

const config = {
  passwordRequired: false,
  sendEnabled: false,
  ...(window.__KAGE_CONFIG__ || {}),
};

const agentMeta = {
  claude: { label: "Claude", short: "Claude", color: "var(--claude)" },
  codex: { label: "Codex", short: "Codex", color: "var(--codex)" },
  qodercli: { label: "QoderCLI", short: "Qoder", color: "var(--qoder)" },
  qoderwork: { label: "QoderWork", short: "QWork", color: "var(--qoder)" },
};
const sendAgents = ["claude", "codex", "qodercli"];

function initialPassword() {
  if (!config.passwordRequired) return "";
  const existing = localStorage.getItem("kageServePassword");
  if (existing) return existing;
  const entered = prompt("KAGE password") || "";
  localStorage.setItem("kageServePassword", entered);
  return entered;
}

const useStore = create((set, get) => ({
  password: initialPassword(),
  theme: localStorage.getItem("kageServeTheme") || "dark",
  sessions: [],
  agents: [],
  selectedAgent: "all",
  search: "",
  selectedPath: null,
  selectedSession: null,
  transcript: null,
  live: false,
  loading: false,
  stream: null,
  detailOpen: false,
  toast: "",
  sendState: "idle",
  error: "",
  setTheme(theme) {
    localStorage.setItem("kageServeTheme", theme);
    set({ theme });
  },
  setSearch(search) {
    set({ search });
  },
  setSelectedAgent(selectedAgent) {
    set({ selectedAgent });
  },
  showToast(toast) {
    set({ toast });
    clearTimeout(get().toastTimer);
    const toastTimer = setTimeout(() => set({ toast: "" }), 1800);
    set({ toastTimer });
  },
}));

function authUrl(path) {
  const { password } = useStore.getState();
  const url = new URL(path, window.location.origin);
  if (password) url.searchParams.set("password", password);
  return url;
}

async function api(path, options = {}) {
  const response = await fetch(authUrl(path), options);
  if (!response.ok) {
    let message = await response.text();
    try {
      message = JSON.parse(message).error || message;
    } catch {
      // Keep the plain text response.
    }
    throw new Error(message);
  }
  return response.json();
}

function cls(...parts) {
  return parts.filter(Boolean).join(" ");
}

function shellQuote(value) {
  const text = String(value ?? "");
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`;
}

function resumeCommand(session) {
  if (!session) return "";
  const cd = session.cwd ? `cd ${shellQuote(session.cwd)} && ` : "";
  if (session.agent === "claude") return `${cd}claude --resume ${shellQuote(session.sessionId)}`;
  if (session.agent === "codex") return `${cd}codex resume ${shellQuote(session.sessionId)}`;
  if (session.agent === "qodercli") return `qodercli --cwd ${shellQuote(session.cwd || ".")} --resume ${shellQuote(session.sessionId)}`;
  return `${cd}kage ${shellQuote(session.agent)} --session ${shellQuote(session.path)}`;
}

function sendCommand({ agent, sessionId, cwd, message }) {
  const cd = cwd ? `cd ${shellQuote(cwd)} && ` : "";
  if (agent === "claude") {
    return `${cd}claude ${sessionId ? `--resume ${shellQuote(sessionId)} ` : ""}--print ${shellQuote(message)}`;
  }
  if (agent === "codex") {
    return `${cd}printf %s ${shellQuote(message)} | codex exec ${sessionId ? `resume ${shellQuote(sessionId)} ` : ""}-`;
  }
  if (agent === "qodercli") {
    return `qodercli --cwd ${shellQuote(cwd || ".")} ${sessionId ? `--resume ${shellQuote(sessionId)} ` : ""}--print ${shellQuote(message)}`;
  }
  return "";
}

async function copyText(text, label = "Copied") {
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
  useStore.getState().showToast(label);
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
    .join("\n")
    .toLowerCase();
}

function lineageLabel(session) {
  const lineage = session.lineage;
  if (!lineage) return "";
  const kind = lineage.forkType === "bridge" ? "Bridged" : "Forked";
  return `${kind} from ${lineage.parentTitle || lineage.parentSessionId || "parent session"}`;
}

async function loadSessions() {
  useStore.setState({ loading: true, error: "" });
  try {
    const data = await api("/api/sessions");
    useStore.setState({ sessions: data.sessions || [], agents: data.agents || [], cwd: data.cwd, loading: false });
    if (!useStore.getState().selectedPath && data.sessions?.[0]) {
      await selectSession(data.sessions[0], { openDetail: false });
    }
  } catch (error) {
    useStore.setState({ loading: false, error: error.message });
  }
}

async function selectSession(session, { openDetail = true } = {}) {
  const current = useStore.getState();
  current.stream?.close();
  useStore.setState({
    selectedPath: session.path,
    selectedSession: session,
    transcript: null,
    live: false,
    detailOpen: openDetail,
    error: "",
  });

  const streamPath = `/api/stream?path=${encodeURIComponent(session.path)}&agent=${encodeURIComponent(session.agent)}`;
  const stream = new EventSource(authUrl(streamPath));
  useStore.setState({ stream });
  stream.addEventListener("transcript", (event) => {
    useStore.setState({ transcript: JSON.parse(event.data), live: true });
  });
  stream.addEventListener("error", async () => {
    try {
      const transcript = await api(`/api/transcript?path=${encodeURIComponent(session.path)}&agent=${encodeURIComponent(session.agent)}`);
      useStore.setState({ transcript, live: false });
    } catch (error) {
      useStore.setState({ error: error.message, live: false });
    }
  });
}

function useFilteredSessions() {
  const sessions = useStore((state) => state.sessions);
  const selectedAgent = useStore((state) => state.selectedAgent);
  const search = useStore((state) => state.search);
  return useMemo(() => {
    const query = search.trim().toLowerCase();
    return sessions.filter((session) => {
      if (selectedAgent !== "all" && session.agent !== selectedAgent) return false;
      return !query || sessionSearchText(session).includes(query);
    });
  }, [sessions, selectedAgent, search]);
}

function useTranscriptStats(transcript) {
  return useMemo(() => {
    const counts = {};
    for (const message of transcript?.messages || []) {
      for (const block of message.blocks || []) {
        counts[block.type] = (counts[block.type] || 0) + 1;
      }
    }
    return counts;
  }, [transcript]);
}

function App() {
  const theme = useStore((state) => state.theme);
  const detailOpen = useStore((state) => state.detailOpen);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    loadSessions();
    return () => useStore.getState().stream?.close();
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <Tooltip.Provider delayDuration={220}>
      <div className="app-shell">
        <TopBar />
        <main className={cls("workspace", detailOpen && "detail-open")}>
          <Sidebar />
          <Conversation />
        </main>
        <Toast />
      </div>
    </Tooltip.Provider>
  );
}

function TopBar() {
  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);
  const sessions = useStore((state) => state.sessions);
  const cwd = useStore((state) => state.cwd);
  const loading = useStore((state) => state.loading);
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="logo-mark">
          <Sparkles size={17} />
        </div>
        <div className="brand-copy">
          <h1>KAGE Sessions</h1>
          <span>{sessions.length ? `${sessions.length} sessions in ${cwd || "current project"}` : "Local-first agent memory"}</span>
        </div>
      </div>
      <div className="top-actions">
        <StatusPill />
        <IconButton label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </IconButton>
        <button className="primary-button" type="button" onClick={loadSessions} disabled={loading}>
          {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          Refresh
        </button>
      </div>
    </header>
  );
}

function StatusPill() {
  return (
    <div className={cls("status-pill", config.sendEnabled ? "enabled" : "readonly")}>
      {config.sendEnabled ? <Terminal size={14} /> : <Lock size={14} />}
      {config.sendEnabled ? "Send enabled" : "Read only"}
    </div>
  );
}

function IconButton({ label, children, onClick, disabled = false }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button className="icon-button" type="button" aria-label={label} onClick={onClick} disabled={disabled}>
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={8}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function Sidebar() {
  const agents = useStore((state) => state.agents);
  const selectedAgent = useStore((state) => state.selectedAgent);
  const setSelectedAgent = useStore((state) => state.setSelectedAgent);
  const search = useStore((state) => state.search);
  const setSearch = useStore((state) => state.setSearch);
  const filteredSessions = useFilteredSessions();
  const counts = useMemo(() => new Map(agents.map((agent) => [agent.agent, agent.sessions.length])), [agents]);
  const tabAgents = ["all", ...agents.map((agent) => agent.agent)];

  return (
    <aside className="sidebar">
      <div className="side-controls">
        <Tabs.Root value={selectedAgent} onValueChange={setSelectedAgent}>
          <Tabs.List className="agent-tabs" aria-label="Filter sessions by agent">
            {tabAgents.map((agent) => (
              <Tabs.Trigger key={agent} className="agent-tab" value={agent}>
                {agent === "all" ? "All" : agentMeta[agent]?.short || agent}
                {agent !== "all" && <span>{counts.get(agent) || 0}</span>}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs.Root>
        <div className="search-box">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sessions, cwd, lineage" />
          {search && (
            <button type="button" onClick={() => setSearch("")}>
              Clear
            </button>
          )}
        </div>
      </div>
      <SessionList sessions={filteredSessions} />
    </aside>
  );
}

function SessionList({ sessions }) {
  const selectedPath = useStore((state) => state.selectedPath);
  if (sessions.length === 0) {
    return <div className="empty-state">No sessions match this view.</div>;
  }
  return (
    <div className="session-list">
      {sessions.map((session) => (
        <button
          key={`${session.agent}:${session.path}`}
          className={cls("session-card", selectedPath === session.path && "active")}
          type="button"
          onClick={() => selectSession(session)}
        >
          <AgentBadge agent={session.agent} label={session.agentLabel} />
          <strong>{session.shortTitle || session.title || "(untitled)"}</strong>
          <span>{session.cwd || ""}</span>
          {lineageLabel(session) && <small>{lineageLabel(session)}</small>}
        </button>
      ))}
    </div>
  );
}

function AgentBadge({ agent, label }) {
  const meta = agentMeta[agent] || { label: label || agent, color: "var(--muted)" };
  return (
    <span className="agent-badge" style={{ "--agent-color": meta.color }}>
      <span />
      {label || meta.label}
    </span>
  );
}

function Conversation() {
  const selectedSession = useStore((state) => state.selectedSession);
  const transcript = useStore((state) => state.transcript);
  const live = useStore((state) => state.live);
  const error = useStore((state) => state.error);
  const stats = useTranscriptStats(transcript);

  return (
    <section className="conversation-panel">
      <div className="conversation-head">
        <button className="back-button" type="button" onClick={() => useStore.setState({ detailOpen: false })}>
          <ArrowLeft size={17} />
          Back
        </button>
        {selectedSession ? (
          <>
            <AgentBadge agent={selectedSession.agent} label={selectedSession.agentLabel} />
            <div className="conversation-title">
              <strong>{transcript?.title || selectedSession.title || selectedSession.sessionId || "Session"}</strong>
              <span>{selectedSession.cwd || transcript?.cwd || ""}</span>
            </div>
            <div className={cls("live-pill", live && "active")}>
              <Activity size={14} />
              {live ? "Live" : "Offline"}
            </div>
          </>
        ) : (
          <div className="conversation-title">
            <strong>Select a session</strong>
            <span>Claude, Codex, QoderCLI, and QoderWork sessions appear here.</span>
          </div>
        )}
      </div>

      {selectedSession && (
        <div className="stat-strip">
          <span>{transcript?.messages?.length || 0} turns</span>
          <span>{stats.tool_use || 0} tool calls</span>
          <span>{stats.tool_result || 0} tool results</span>
          <span>{stats.thinking || 0} thinking blocks</span>
        </div>
      )}

      {error ? <div className="empty-state error">{error}</div> : <MessageViewport transcript={transcript} />}
      <Composer session={selectedSession} />
    </section>
  );
}

function MessageViewport({ transcript }) {
  const parentRef = useRef(null);
  const messages = transcript?.messages || [];
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180,
    overscan: 8,
  });

  useEffect(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    }
  }, [messages.length]);

  if (!transcript) {
    return <div className="empty-state">Loading transcript...</div>;
  }
  if (messages.length === 0) {
    return <div className="empty-state">No transcript messages yet.</div>;
  }

  return (
    <div className="message-viewport" ref={parentRef}>
      <div className="virtual-canvas" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const message = messages[virtualRow.index];
          return (
            <article
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className={cls("message-card", message.role)}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div className="message-role">
                {roleIcon(message.role)}
                {message.role || "message"}
              </div>
              <div className="message-blocks">{(message.blocks || []).map((block, index) => <BlockView key={index} block={block} />)}</div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function roleIcon(role) {
  if (role === "assistant") return <Bot size={14} />;
  if (role === "tool") return <Hammer size={14} />;
  return <Sparkles size={14} />;
}

function BlockView({ block }) {
  if (block.type === "text") {
    return <div className="text-block">{block.content}</div>;
  }
  if (block.type === "thinking") {
    return <DisclosureBlock icon={<Brain size={16} />} title="Thinking" tone="thinking" content={block.content} />;
  }
  if (block.type === "tool_use") {
    return <DisclosureBlock icon={<Hammer size={16} />} title={`Tool: ${block.name || "tool"}`} tone="tool-use" content={JSON.stringify(block.input ?? {}, null, 2)} />;
  }
  if (block.type === "tool_result") {
    return <DisclosureBlock icon={<Terminal size={16} />} title="Tool result" tone="tool-result" content={block.content} defaultOpen={lineCount(block.content) <= 5} />;
  }
  return <DisclosureBlock icon={<Braces size={16} />} title={block.type || "Block"} content={block.content || JSON.stringify(block, null, 2)} />;
}

function lineCount(content) {
  return String(content ?? "").split("\n").length;
}

function DisclosureBlock({ icon, title, content, tone = "", defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const lines = lineCount(content);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className={cls("disclosure", tone)}>
      <Collapsible.Trigger className="disclosure-trigger">
        <span>
          {icon}
          {title}
        </span>
        <small>{lines > 5 ? `${lines} lines` : open ? "Open" : "Preview"}</small>
        <ChevronDown size={16} className={cls(open && "rotate")} />
      </Collapsible.Trigger>
      <Collapsible.Content className="disclosure-content">
        <pre>{content}</pre>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function Composer({ session }) {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("new");
  const [targetAgent, setTargetAgent] = useState("codex");
  const [targetCwd, setTargetCwd] = useState("");
  const sendState = useStore((state) => state.sendState);
  const rootCwd = useStore((state) => state.cwd);
  const canReply = Boolean(session && sendAgents.includes(session.agent));
  const effectiveMode = mode === "reply" && canReply ? "reply" : "new";
  const effectiveAgent = effectiveMode === "reply" ? session.agent : targetAgent;
  const effectiveCwd = (targetCwd.trim() || session?.cwd || rootCwd || ".").trim();
  const sessionId = effectiveMode === "reply" ? session?.sessionId : undefined;
  const disabled = sendState === "sending" || !effectiveAgent || (effectiveMode === "reply" && !canReply);
  const canSend = config.sendEnabled && !disabled;

  useEffect(() => {
    const nextCwd = session?.cwd || rootCwd || "";
    setTargetCwd(nextCwd);
    if (session?.agent && sendAgents.includes(session.agent)) {
      setTargetAgent(session.agent);
      setMode("reply");
    } else {
      setTargetAgent("codex");
      setMode("new");
    }
  }, [session?.path, session?.agent, session?.cwd, rootCwd]);

  async function submit(event) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || disabled) return;
    const payload = {
      agent: effectiveAgent,
      cwd: effectiveCwd,
      message,
      ...(sessionId ? { sessionId } : {}),
    };
    if (!config.sendEnabled) {
      await copyText(sendCommand(payload), "Send command copied");
      return;
    }
    useStore.setState({ sendState: "sending" });
    try {
      await api("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setDraft("");
      useStore.getState().showToast(effectiveMode === "reply" ? "Message sent to session" : "New session prompt sent");
      await loadSessions();
    } catch (error) {
      useStore.getState().showToast(error.message);
    } finally {
      useStore.setState({ sendState: "idle" });
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-head">
        <div>
          <strong>Send a prompt</strong>
          <span>{effectiveMode === "reply" ? `Replying to ${agentMeta[effectiveAgent]?.label || effectiveAgent}` : "Start a new agent session"}</span>
        </div>
        <Tabs.Root value={effectiveMode} onValueChange={setMode}>
          <Tabs.List className="send-mode-tabs" aria-label="Choose send target">
            <Tabs.Trigger className="send-mode-tab" value="reply" disabled={!canReply}>
              Reply
            </Tabs.Trigger>
            <Tabs.Trigger className="send-mode-tab" value="new">
              New
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </div>
      <div className="target-panel">
        {effectiveMode === "reply" ? (
          <div className="target-summary">
            <AgentBadge agent={effectiveAgent} />
            <span>Session {session?.sessionId || "unknown"}</span>
          </div>
        ) : (
          <div className="agent-picker" role="group" aria-label="Choose agent for new prompt">
            {sendAgents.map((agent) => (
              <button
                key={agent}
                className={cls("agent-choice", targetAgent === agent && "active")}
                type="button"
                onClick={() => setTargetAgent(agent)}
                style={{ "--agent-color": agentMeta[agent].color }}
              >
                <span />
                {agentMeta[agent].label}
              </button>
            ))}
          </div>
        )}
        <label className="cwd-field">
          <span>cwd</span>
          <input value={targetCwd} onChange={(event) => setTargetCwd(event.target.value)} placeholder={rootCwd || "/path/to/project"} />
        </label>
      </div>
      <div className="composer-copy">
        {config.sendEnabled ? (
          <span>
            <Check size={14} />
            Direct send can reply or start a new local CLI session
          </span>
        ) : (
          <span>
            <Lock size={14} />
            Restart with <code>--allow-send</code> for direct send
          </span>
        )}
        <button type="button" onClick={() => copyText(resumeCommand(session), "Resume command copied")} disabled={!session}>
          <Copy size={15} />
          Copy resume
        </button>
      </div>
      <div className="composer-row">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write any prompt for the selected target" rows={2} />
        <button className="send-button" type="submit" disabled={!draft.trim() || disabled}>
          {sendState === "sending" ? <Loader2 size={18} className="spin" /> : canSend ? <Send size={18} /> : <Copy size={18} />}
          {canSend ? "Send" : "Copy"}
        </button>
      </div>
    </form>
  );
}

function Toast() {
  const toast = useStore((state) => state.toast);
  return <div className={cls("toast", toast && "show")}>{toast}</div>;
}

createRoot(document.getElementById("root")).render(<App />);
