import * as Collapsible from "@radix-ui/react-collapsible";
import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Activity,
  ArrowLeft,
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
  UserRound,
} from "lucide-react";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { create } from "zustand";

import "./styles.css";

const config = {
  passwordRequired: false,
  sendEnabled: true,
  ...(window.__KAGE_CONFIG__ || {}),
};
const query = new URLSearchParams(window.location.search);
const isMockMobile = query.has("mobile") || query.has("mock-mobile") || query.get("v") === "mobile";
const THEME_STORAGE_KEY = "kageServeTheme.v2";
const PASSWORD_STORAGE_KEY = "kageServePassword";
const DEFAULT_THEME = "light";

const agentMeta = {
  claude: { label: "Claude", short: "Claude", color: "var(--claude)" },
  codex: { label: "Codex", short: "Codex", color: "var(--codex)" },
  qodercli: { label: "QoderCLI", short: "Qoder", color: "var(--qoder)" },
  qoderwork: { label: "QoderWork", short: "QWork", color: "var(--qoder)" },
};
const sendAgents = ["claude", "codex", "qodercli"];
const markdownPlugins = [remarkGfm, remarkBreaks];
const markdownComponents = {
  a({ node, ...props }) {
    return <a {...props} target="_blank" rel="noreferrer" />;
  },
  input({ node, ...props }) {
    return <input {...props} disabled />;
  },
};

function readStorageValue(key, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorageValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Local storage can be unavailable in some browser contexts.
  }
}

function normalizeTheme(value) {
  return value === "dark" ? "dark" : DEFAULT_THEME;
}

function applyTheme(theme) {
  const normalized = normalizeTheme(theme);
  document.documentElement.dataset.theme = normalized;
  const themeColor = normalized === "dark" ? "#101316" : "#f7f8fa";
  const meta = document.querySelector("meta[name='theme-color']");
  if (meta) meta.setAttribute("content", themeColor);
}

applyTheme(readStorageValue(THEME_STORAGE_KEY, DEFAULT_THEME));

const messageFilterOptions = [
  { value: "all", label: "turns", statKey: "messages" },
  { value: "tool_use", label: "tool calls", statKey: "tool_use" },
  { value: "tool_result", label: "tool results", statKey: "tool_result" },
  { value: "thinking", label: "thinking blocks", statKey: "thinking" },
];
const SESSION_GROUP_PAGE_SIZE = 80;
const SESSION_GROUP_INITIAL_SIZE = 80;
const MESSAGE_WINDOW_SIZE = 420;
const MESSAGE_WINDOW_STEP = 220;
const ALL_WORKSPACES_VALUE = "__all_workspaces__";
const workspaceQueryParams = ["workspace", "cwd"];
const sessionQueryParams = ["session", "path"];
const ALL_WORKSPACES_QUERY = "1";
const ACTIVITY_IDLE_AFTER_MS = 7000;
const ACTIVITY_VERB_INTERVAL_MS = 3200;
const SPINNER_VERBS = [
  "Thinking",
  "Pondering",
  "Considering",
  "Deliberating",
  "Contemplating",
  "Crafting",
  "Composing",
  "Generating",
  "Processing",
  "Working",
  "Mulling",
  "Forming",
  "Architecting",
];

function initialWorkspaceFromQuery() {
  if (query.get("all") === ALL_WORKSPACES_QUERY) {
    return ALL_WORKSPACES_VALUE;
  }
  for (const key of workspaceQueryParams) {
    const value = query.get(key)?.trim();
    if (value) return value;
  }
  return "";
}

function normalizeWorkspace(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : "";
}

function isAllWorkspaces(value) {
  return normalizeWorkspace(value) === ALL_WORKSPACES_VALUE;
}

function agentColor(agent) {
  return agentMeta[agent]?.color || "var(--muted)";
}

function agentColorStyle(agent, property = "--agent-color") {
  return { [property]: agentColor(agent) };
}

function KageLogoIcon() {
  return (
    <svg className="kage-logo-icon" viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="kage-logo-badge" x1="96" y1="72" x2="416" y2="440" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#182026" />
          <stop offset="1" stopColor="#0b1013" />
        </linearGradient>
        <linearGradient id="kage-logo-screen" x1="152" y1="140" x2="360" y2="310" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#202b32" />
          <stop offset="1" stopColor="#12191e" />
        </linearGradient>
      </defs>
      <rect x="56" y="56" width="400" height="400" rx="104" fill="url(#kage-logo-badge)" />
      <rect x="144" y="133" width="224" height="176" rx="36" fill="#f7f2e6" />
      <rect x="168" y="158" width="176" height="126" rx="19" fill="url(#kage-logo-screen)" />
      <path d="M195 198l45 36-45 36" fill="none" stroke="#f2b84b" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M267 267h72" fill="none" stroke="#f7f2e6" strokeWidth="24" strokeLinecap="round" />
      <circle cx="164" cy="360" r="24" fill="#3a86ff" />
      <circle cx="256" cy="376" r="24" fill="#10a37f" />
      <circle cx="348" cy="360" r="24" fill="#d97757" />
      <path d="M183 363c44 33 119 34 164 0" fill="none" stroke="#f7f2e6" strokeWidth="16" strokeLinecap="round" opacity="0.56" />
    </svg>
  );
}

function initialPassword() {
  if (!config.passwordRequired) return "";
  const existing = readStorageValue(PASSWORD_STORAGE_KEY);
  if (existing) return existing;
  const entered = prompt("KAGE password") || "";
  if (entered) {
    writeStorageValue(PASSWORD_STORAGE_KEY, entered);
  }
  return entered;
}

const useStore = create((set, get) => ({
  password: initialPassword(),
  theme: normalizeTheme(readStorageValue(THEME_STORAGE_KEY, DEFAULT_THEME)),
  sessions: [],
  agents: [],
  projects: [],
  workspaces: [],
  selectedWorkspace: initialWorkspaceFromQuery(),
  selectedAgent: "all",
  search: "",
  selectedPath: null,
  selectedSession: null,
  transcript: null,
  messageFilter: "all",
  live: false,
  activityUpdatedAt: 0,
  loading: false,
  loadingMessage: "",
  stream: null,
  detailOpen: false,
  toast: "",
  sendState: "idle",
  error: "",
  setTheme(theme) {
    const normalizedTheme = normalizeTheme(theme);
    applyTheme(normalizedTheme);
    writeStorageValue(THEME_STORAGE_KEY, normalizedTheme);
    set({ theme: normalizedTheme });
  },
  setSearch(search) {
    set({ search });
  },
  setSelectedPath(selectedPath) {
    set({ selectedPath: selectedPath || null });
  },
  setSelectedWorkspace(selectedWorkspace) {
    set({ selectedWorkspace: normalizeWorkspace(selectedWorkspace) || null });
  },
  setSelectedAgent(selectedAgent) {
    set({ selectedAgent });
  },
  setMessageFilter(messageFilter) {
    set({ messageFilter });
  },
  showToast(toast) {
    set({ toast });
    clearTimeout(get().toastTimer);
    const toastTimer = setTimeout(() => set({ toast: "" }), 1800);
    set({ toastTimer });
  },
  setProjects(projects) {
    set({ projects });
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

function syncWorkspaceToUrl(workspace) {
  const normalizedWorkspace = normalizeWorkspace(workspace);
  const url = new URL(window.location.href);
  if (normalizedWorkspace) {
    url.searchParams.set("workspace", normalizedWorkspace);
    if (isAllWorkspaces(normalizedWorkspace)) {
      url.searchParams.set("all", ALL_WORKSPACES_QUERY);
    } else {
      url.searchParams.delete("all");
    }
  } else {
    url.searchParams.delete("all");
    url.searchParams.delete("workspace");
  }
  history.replaceState({}, "", url);
}

function syncSessionToUrl(sessionPath) {
  const normalizedSessionPath = normalizeWorkspace(sessionPath);
  const url = new URL(window.location.href);
  if (normalizedSessionPath) {
    url.searchParams.set("session", normalizedSessionPath);
    sessionQueryParams.forEach((key) => {
      if (key !== "session") {
        url.searchParams.delete(key);
      }
    });
  } else {
    sessionQueryParams.forEach((key) => {
      url.searchParams.delete(key);
    });
  }
  history.replaceState({}, "", url);
}

function sessionApiUrl(workspace) {
  const normalizedWorkspace = normalizeWorkspace(workspace);
  const url = new URL("/api/sessions", window.location.origin);
  if (isAllWorkspaces(normalizedWorkspace)) {
    url.searchParams.set("all", ALL_WORKSPACES_QUERY);
  } else if (normalizedWorkspace) {
    url.searchParams.set("workspace", normalizedWorkspace);
  }
  return `${url.pathname}${url.search}`;
}

async function loadProjects() {
  try {
    useStore.setState({ loadingMessage: "Scanning local agent roots..." });
    const data = await api("/api/projects");
    const projects = Array.isArray(data.workspaces) ? data.workspaces.map(normalizeWorkspace).filter(Boolean) : [];
    useStore.setState({
      projects,
    });
    const storedState = useStore.getState();
    if (data.selectedWorkspace) {
      useStore.setState({
        selectedWorkspace: normalizeWorkspace(data.selectedWorkspace),
      });
    } else if (!storedState.selectedWorkspace) {
      useStore.setState({
        selectedWorkspace: null,
      });
    }
    return projects;
  } catch {
    return [];
  }
}

function addPendingTranscriptMessage(message) {
  const normalizedMessage = message && typeof message === "object" ? message : { text: String(message ?? "") };
  const content = typeof normalizedMessage.text === "string" ? normalizedMessage.text : JSON.stringify(normalizedMessage);
  const pendingMessage = {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role: "user",
    blocks: [{ type: "text", content }],
    _pending: true,
  };
  const state = useStore.getState();
  if (!state.transcript) {
    return null;
  }
  useStore.setState({
    transcript: {
      ...state.transcript,
      messages: [...(state.transcript.messages || []), pendingMessage],
    },
    activityUpdatedAt: Date.now(),
  });
  return pendingMessage.id;
}

function dropPendingMessage(messageId, { withError = false } = {}) {
  const state = useStore.getState();
  if (!state.transcript || !messageId) {
    return;
  }
  const messages = (state.transcript.messages || []).filter((message) => message?.id !== messageId);
  const finalMessages = withError
    ? [
        ...messages,
        {
          id: `pending-error-${messageId}`,
          role: "system",
          blocks: [{ type: "text", content: "Previous send did not complete; please retry." }],
        },
      ]
    : messages;
  useStore.setState({
    transcript: {
      ...state.transcript,
      messages: finalMessages,
    },
    error: withError ? "Send failed; your draft has not been sent." : state.error,
  });
  if (withError) {
    window.setTimeout(() => {
      useStore.setState({ error: "" });
    }, 3000);
  }
}

function sessionPathFromQuery() {
  for (const key of sessionQueryParams) {
    const value = new URL(window.location.href).searchParams.get(key)?.trim();
    if (value) return value;
  }
  return "";
}

function pickLatestSession(sessions = []) {
  return sessions.reduce((latest, session) => {
    if (!latest) return session;
    if ((session._updatedAtMs || 0) > (latest._updatedAtMs || 0)) return session;
    return latest;
  }, null);
}

function buildSessionSearchText(session) {
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

function normalizeSession(session) {
  const updatedAt = session?.updatedAt;
  const updatedAtMs = Number.isNaN(Date.parse(updatedAt || 0)) ? 0 : Date.parse(updatedAt || 0);
  return {
    ...session,
    _updatedAtMs: updatedAtMs,
    _groupKey: normalizeWorkspace(session?.cwd) || session?.path || "unassigned",
    _searchText: buildSessionSearchText(session),
  };
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
    return `${cd}claude ${sessionId ? `-r ${shellQuote(sessionId)} ` : ""}-p ${shellQuote(message)}`;
  }
  if (agent === "codex") {
    return `${cd}printf %s ${shellQuote(message)} | codex exec ${sessionId ? `resume ${shellQuote(sessionId)} ` : ""}-`;
  }
  if (agent === "qodercli") {
    return `qodercli -w ${shellQuote(cwd || ".")} ${sessionId ? `-r ${shellQuote(sessionId)} ` : ""}-p ${shellQuote(message)}`;
  }
  return "";
}

function sendPrimitiveLabel(agent) {
  if (agent === "claude") return "claude -p";
  if (agent === "codex") return "codex exec -";
  if (agent === "qodercli") return "qodercli -p";
  return agent;
}

function compactDate(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function elapsedLabel(startedAt, now = Date.now()) {
  if (!startedAt) return "";
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (seconds < 1) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 10) return `${minutes}m ${remainingSeconds}s`;
  return `${minutes}m`;
}

function toolInputPreview(input) {
  if (input == null) return "";
  if (typeof input === "string") return input;
  if (typeof input === "object") {
    const command = input.command || input.cmd || input.pattern || input.path || input.file_path;
    if (command) return String(command);
  }
  try {
    return JSON.stringify(input);
  } catch {
    return "";
  }
}

function latestMessageBlock(messages = []) {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    const blocks = message?.blocks || [];
    for (let blockIndex = blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const block = blocks[blockIndex];
      if (block) {
        return { message, block };
      }
    }
  }
  return null;
}

function deriveConversationActivity({ selectedSession, transcript, live, sendState, error, activityUpdatedAt, now, verb }) {
  if (!selectedSession) {
    return {
      tone: "idle",
      label: "Select a session",
      detail: "Pick a transcript to inspect local agent activity.",
      active: false,
    };
  }
  if (error) {
    return {
      tone: "error",
      label: "Transcript stream needs attention",
      detail: error,
      active: false,
    };
  }
  if (!transcript) {
    return {
      tone: "active",
      label: "Connecting to transcript stream...",
      detail: `Reading ${conversationAgentLabel(selectedSession.agent, selectedSession.agentLabel)} session file`,
      active: true,
      startedAt: activityUpdatedAt || now,
    };
  }
  if (sendState === "sending") {
    return {
      tone: "active",
      label: "Starting agent command...",
      detail: "Handing your prompt to the local CLI in the background.",
      active: true,
      startedAt: activityUpdatedAt || now,
    };
  }

  const messages = transcript.messages || [];
  const latest = latestMessageBlock(messages);
  const recent = live && activityUpdatedAt && now - activityUpdatedAt < ACTIVITY_IDLE_AFTER_MS;
  const block = latest?.block;
  const role = latest?.message?.role;

  if (recent && latest?.message?._pending) {
    return {
      tone: "active",
      label: "Sending prompt...",
      detail: "Waiting for the agent transcript to acknowledge the message.",
      active: true,
      startedAt: activityUpdatedAt,
    };
  }
  if (recent && block?.type === "tool_use") {
    const preview = toolInputPreview(block.input);
    return {
      tone: "tool",
      label: `Running: ${block.name || "tool"}...`,
      detail: preview ? preview.slice(0, 140) : "Tool call started from the latest transcript update.",
      active: true,
      startedAt: activityUpdatedAt,
    };
  }
  if (recent && block?.type === "tool_result") {
    return {
      tone: "tool",
      label: "Reviewing tool result...",
      detail: "The agent received command output and is deciding the next step.",
      active: true,
      startedAt: activityUpdatedAt,
    };
  }
  if (recent && block?.type === "thinking") {
    return {
      tone: "active",
      label: `${verb}...`,
      detail: "Reasoning block updated in the transcript.",
      active: true,
      startedAt: activityUpdatedAt,
    };
  }
  if (recent && block?.type === "text" && role === "assistant") {
    return {
      tone: "active",
      label: "Composing response...",
      detail: "New assistant text arrived from the session file.",
      active: true,
      startedAt: activityUpdatedAt,
    };
  }
  if (!live) {
    return {
      tone: "offline",
      label: "Stream offline",
      detail: "Showing the latest transcript snapshot from disk.",
      active: false,
    };
  }
  return {
    tone: "idle",
    label: "Waiting for input",
    detail: messages.length ? `${messages.length} transcript messages loaded.` : "No transcript messages yet.",
    active: false,
    startedAt: activityUpdatedAt,
  };
}

function useIntervalNow(enabled, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) {
      setNow(Date.now());
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs]);
  return now;
}

function useRotatingVerb(enabled) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = window.setInterval(() => {
      setIndex((current) => current + 1);
    }, ACTIVITY_VERB_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return SPINNER_VERBS[index % SPINNER_VERBS.length];
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

function normalizeGroupKey(session) {
  return normalizeWorkspace(session?.cwd) || session?.path || "unassigned";
}

function workspaceSummaryLabel(workspaceKey) {
  if (!workspaceKey || workspaceKey === "unassigned") return "";
  return normalizeWorkspace(workspaceKey) || "";
}

function groupLabelForWorkspace(workspaceKey) {
  if (!workspaceKey || workspaceKey === "unassigned") return "Unassigned";
  const trimmed = workspaceKey.endsWith("/") ? workspaceKey.slice(0, -1) : workspaceKey;
  const tail = trimmed.split("/").filter(Boolean).at(-1);
  return tail || trimmed;
}

function sessionDisplayTitle(session) {
  return session.shortTitle || session.title || "(untitled)";
}

function lineageLabel(session) {
  const lineage = session.lineage;
  if (!lineage) return "";
  const kind = lineage.forkType === "bridge" ? "Bridged" : "Forked";
  return `${kind} from ${lineage.parentTitle || lineage.parentSessionId || "parent session"}`;
}

async function loadSessions({ preserveSelection = false, silentLoading = false, workspaceOverride } = {}) {
  const previousState = useStore.getState();
  const requestWorkspace = normalizeWorkspace(workspaceOverride || previousState.selectedWorkspace);
  const scopeLabel = isAllWorkspaces(requestWorkspace)
    ? "all local workspaces"
    : requestWorkspace
      ? groupLabelForWorkspace(requestWorkspace)
      : "current workspace";
  if (!silentLoading) {
    useStore.setState({ loading: true, loadingMessage: `Scanning sessions in ${scopeLabel}...`, error: "" });
  }
  try {
    const data = await api(sessionApiUrl(requestWorkspace));
    const rawSessions = Array.isArray(data.sessions) ? data.sessions : [];
    const sessions = rawSessions
      .map((session) => normalizeSession(session))
      .sort((left, right) => right._updatedAtMs - left._updatedAtMs);
    const availableWorkspaces = Array.isArray(data.workspaces) ? data.workspaces : [];
    const validProjects = availableWorkspaces.map(normalizeWorkspace).filter(Boolean);
    const selectedWorkspace = normalizeWorkspace(data.selectedWorkspace || previousState.selectedWorkspace || data.cwd);
    const preferredPath = sessionPathFromQuery() || previousState.selectedPath || "";
    const restoredSession = preferredPath ? sessions.find((session) => session.path === preferredPath) : null;
    const preservedSession = preserveSelection && previousState.selectedPath
      ? sessions.find((session) => session.path === previousState.selectedPath) || null
      : null;
    const selectedSession = restoredSession || preservedSession;
    const selectedPath = selectedSession ? selectedSession.path : null;
    useStore.setState({
      sessions,
      agents: data.agents || [],
      cwd: data.cwd,
      workspaces: validProjects,
      projects: validProjects,
      selectedWorkspace,
      selectedPath: selectedPath,
      selectedSession: selectedSession || null,
      transcript: selectedSession && preservedSession ? previousState.transcript : null,
      loading: false,
      loadingMessage: "",
      error: "",
    });

    if (selectedSession) {
      await selectSession(selectedSession, { openDetail: false });
    } else {
      const latest = pickLatestSession(sessions);
      if (latest) {
        await selectSession(latest, { openDetail: false });
      }
    }
  } catch (error) {
    useStore.setState({ loading: false, loadingMessage: "", error: error.message });
  }
}

function switchWorkspace(nextWorkspace) {
  const workspace = normalizeWorkspace(nextWorkspace);
  syncWorkspaceToUrl(workspace);
  syncSessionToUrl("");
  useStore.getState().stream?.close();
  useStore.setState({
    selectedWorkspace: workspace || null,
    selectedPath: null,
    selectedSession: null,
    transcript: null,
    loadingMessage: "Switching workspace...",
    error: "",
  });
  return loadSessions({ preserveSelection: false });
}

async function selectSession(session, { openDetail = true } = {}) {
  const current = useStore.getState();
  syncSessionToUrl(session?.path || "");
  current.stream?.close();
  useStore.setState({
    selectedPath: session.path,
    selectedSession: session,
    transcript: null,
    messageFilter: "all",
    live: false,
    activityUpdatedAt: Date.now(),
    loadingMessage: `Connecting to ${session.agentLabel || session.agent} transcript...`,
    detailOpen: openDetail,
    error: "",
  });

  const streamPath = `/api/stream?path=${encodeURIComponent(session.path)}&agent=${encodeURIComponent(session.agent)}`;
  const stream = new EventSource(authUrl(streamPath));
  let seenFirstTranscript = false;
  useStore.setState({ stream });
  stream.addEventListener("transcript", (event) => {
    const transcript = JSON.parse(event.data);
    const firstTranscript = !seenFirstTranscript;
    seenFirstTranscript = true;
    const updatedAtMs = Date.parse(transcript.updatedAt || session.updatedAt || 0);
    useStore.setState({
      transcript,
      live: true,
      activityUpdatedAt: firstTranscript && !Number.isNaN(updatedAtMs) ? updatedAtMs : Date.now(),
      loadingMessage: "",
    });
  });
  stream.addEventListener("error", async () => {
    try {
      const transcript = await api(`/api/transcript?path=${encodeURIComponent(session.path)}&agent=${encodeURIComponent(session.agent)}`);
      useStore.setState({ transcript, live: false, activityUpdatedAt: Date.now(), loadingMessage: "" });
    } catch (error) {
      useStore.setState({ error: error.message, live: false, activityUpdatedAt: Date.now(), loadingMessage: "" });
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
      if (!query) return true;
      const searchText = session._searchText || buildSessionSearchText(session);
      return searchText.includes(query);
    });
  }, [sessions, selectedAgent, search]);
}

function useTranscriptIndex(transcript) {
  const messages = transcript?.messages || [];
  return useMemo(() => {
    const counts = {
      messages: messages.length,
      tool_use: 0,
      tool_result: 0,
      thinking: 0,
    };
    const filterIndexes = {
      all: [],
      tool_use: [],
      tool_result: [],
      thinking: [],
    };
    const messageHeights = new Array(messages.length);

    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index] || {};
      const blocks = message.blocks || [];
      filterIndexes.all.push(index);

      let isToolUse = false;
      let isToolResult = false;
      let isThinking = false;

      let textLines = 0;
      for (const block of blocks) {
        const blockType = block?.type;
        if (blockType === "tool_use") isToolUse = true;
        if (blockType === "tool_result") isToolResult = true;
        if (blockType === "thinking") isThinking = true;
        if (blockType === "text") {
          textLines += Math.max(1, lineCount(block?.content ?? ""));
        } else if (blockType === "thinking") {
          textLines += 2;
        } else {
          textLines += 6;
        }
      }

      if (isToolUse) {
        counts.tool_use += 1;
        filterIndexes.tool_use.push(index);
      }
      if (isToolResult) {
        counts.tool_result += 1;
        filterIndexes.tool_result.push(index);
      }
      if (isThinking) {
        counts.thinking += 1;
        filterIndexes.thinking.push(index);
      }

      messageHeights[index] = Math.min(Math.max(130 + textLines * 18 + blocks.length * 12, 110), 1100);
    }

    return {
      messages,
      counts,
      filterIndexes,
      messageHeights,
    };
  }, [messages]);
}

function conversationAgentLabel(agent, label) {
  if (agent === "claude") return "Claude";
  if (agent === "codex") return "Codex";
  if (agent === "qodercli" || agent === "qoderwork") return "Qoder";
  return label || agentMeta[agent]?.label || agent || "Assistant";
}

function roleLabel(role, agent, agentLabel) {
  if (role === "user") return "You";
  if (role === "assistant") return conversationAgentLabel(agent, agentLabel);
  if (role === "tool") return "Tool";
  return role || "Message";
}

function normalizedAgent(agent) {
  if (agent === "qoderwork") return "qodercli";
  return agent;
}

function AgentMark({ agent, size = 14 }) {
  const normalized = normalizedAgent(agent || "codex");
  const base = { width: size, height: size };

  if (normalized === "claude") {
    return (
      <span className="agent-mark agent-mark-claude" style={base}>
        <span>C</span>
      </span>
    );
  }

  if (normalized === "qodercli") {
    return (
      <span className="agent-mark agent-mark-qoder" style={base}>
        <span>Q{">"}</span>
      </span>
    );
  }

  return (
    <span className="agent-mark agent-mark-codex" style={base}>
      <span>&lt;/&gt;</span>
    </span>
  );
}

function App() {
  const theme = useStore((state) => state.theme);
  const detailOpen = useStore((state) => state.detailOpen);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    const boot = async () => {
      await loadProjects();
      await loadSessions();
    };
    void boot();
    return () => useStore.getState().stream?.close();
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <Tooltip.Provider delayDuration={220}>
      <div className={cls("app-shell", isMockMobile && "mock-mobile")}>
        <TopBar />
        <main className={cls("workspace", detailOpen && "detail-open")}>
          <Sidebar />
          <Conversation />
          <DispatchPanel />
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
  const projects = useStore((state) => state.projects);
  const workspaces = useStore((state) => state.workspaces);
  const loading = useStore((state) => state.loading);
  const loadingMessage = useStore((state) => state.loadingMessage);
  const selectedWorkspace = useStore((state) => state.selectedWorkspace);
  const workspaceOptions = useMemo(
    () =>
      Array.from(new Set([...(projects || []), ...(workspaces || [])]))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [projects, workspaces, selectedWorkspace],
  );
  const selectedWorkspaceValue = normalizeWorkspace(selectedWorkspace) || "";
  const workspaceSummary = isAllWorkspaces(selectedWorkspace)
    ? "All workspaces"
    : selectedWorkspace
      ? groupLabelForWorkspace(selectedWorkspace)
      : "Current workspace";
  const [customWorkspace, setCustomWorkspace] = useState(isAllWorkspaces(selectedWorkspace) ? "" : selectedWorkspace || "");

  useEffect(() => {
    setCustomWorkspace(isAllWorkspaces(selectedWorkspace) ? "" : selectedWorkspace || "");
  }, [selectedWorkspace]);

  const applyWorkspaceFilter = () => {
    const trimmed = normalizeWorkspace(customWorkspace);
    switchWorkspace(trimmed);
  };
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="logo-mark">
          <KageLogoIcon />
        </div>
        <div className="brand-copy">
          <h1>KAGE Dispatch</h1>
          <span>
            {loading ? loadingMessage || "Refreshing session index..." : sessions.length ? `${sessions.length} sessions in ${workspaceSummary}` : "Local agent command center"}
          </span>
        </div>
      </div>
      <label className="workspace-switcher">
        <span>Workspace</span>
        <select
          value={selectedWorkspaceValue}
          onChange={(event) => switchWorkspace(event.target.value)}
          title={selectedWorkspace || "Current workspace"}
        >
          <option value="">Current workspace</option>
          <option value={ALL_WORKSPACES_VALUE}>All workspaces</option>
          {workspaceOptions.map((workspacePath) => (
            <option key={workspacePath} value={workspacePath} title={workspacePath}>
              {groupLabelForWorkspace(workspacePath)}
            </option>
          ))}
        </select>
      </label>
      <label className="workspace-switcher">
        <span>Directory path</span>
        <div className="workspace-picker">
          <input
            list="kage-workspaces"
            value={customWorkspace}
            onChange={(event) => setCustomWorkspace(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyWorkspaceFilter();
              }
            }}
            placeholder="Type a directory path"
          />
          <datalist id="kage-workspaces">
            {workspaceOptions.map((workspacePath) => (
              <option key={workspacePath} value={workspacePath} />
            ))}
          </datalist>
          <button type="button" className="icon-button" onClick={applyWorkspaceFilter}>
            Open
          </button>
        </div>
      </label>
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
              <Tabs.Trigger key={agent} className="agent-tab" value={agent} style={agent === "all" ? undefined : agentColorStyle(agent)}>
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

const SessionListItem = memo(function SessionListItem({ session, isActive, isStreaming, activityLabel, onSelectSession }) {
  return (
    <button
      className={cls("session-card", isActive && "active", isStreaming && "streaming")}
      style={agentColorStyle(session.agent)}
      type="button"
      onClick={() => onSelectSession(session)}
    >
      <AgentBadge agent={session.agent} label={session.agentLabel} />
      <strong>{sessionDisplayTitle(session)}</strong>
      <span>{session.cwd || ""}</span>
      {isStreaming && (
        <small className="session-live-line">
          <span className="status-dot pulse" />
          Active — {activityLabel}
        </small>
      )}
      {lineageLabel(session) && <small>{lineageLabel(session)}</small>}
    </button>
  );
});

const SessionListGroup = memo(function SessionListGroup({
  group,
  isCollapsed,
  visibleCount,
  selectedPath,
  activePath,
  activityLabel,
  onToggleGroup,
  onLoadMore,
  onSelectSession,
}) {
  const visibleSessions = useMemo(() => group.sessions.slice(0, visibleCount), [group.sessions, visibleCount]);
  const hasMore = visibleCount < group.count;

  return (
      <section className="session-group">
        <button type="button" className="session-group-header" onClick={() => onToggleGroup(group.key)}>
          <div className="session-group-copy">
            <span className="session-group-title" title={group.key}>
              {group.label}
            </span>
            <small>{group.count} sessions</small>
            {group.path && (
              <small className="session-group-meta" title={group.path}>
                {group.path}
              </small>
            )}
          </div>
          <ChevronDown size={14} className={cls("session-group-chevron", isCollapsed && "collapsed")} />
        </button>
      {!isCollapsed &&
        visibleSessions.map((session) => (
          <SessionListItem
            key={`${session.agent}:${session.path}`}
            session={session}
            isActive={selectedPath === session.path}
            isStreaming={activePath === session.path}
            activityLabel={activityLabel}
            onSelectSession={onSelectSession}
          />
        ))}
      {!isCollapsed && hasMore && (
        <button type="button" className="load-more-sessions" onClick={() => onLoadMore(group.key, group.count)}>
          Load more sessions
        </button>
      )}
    </section>
  );
});

function SessionList({ sessions }) {
  const selectedPath = useStore((state) => state.selectedPath);
  const live = useStore((state) => state.live);
  const activityUpdatedAt = useStore((state) => state.activityUpdatedAt);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [visibleGroupSizes, setVisibleGroupSizes] = useState(new Map());
  const now = useIntervalNow(Boolean(selectedPath && live), 1000);
  const activePath = selectedPath && live && activityUpdatedAt && now - activityUpdatedAt < ACTIVITY_IDLE_AFTER_MS ? selectedPath : null;
  const groupedSessions = useMemo(() => {
    const groups = new Map();
    for (const session of sessions) {
      const key = session._groupKey || normalizeGroupKey(session);
      const list = groups.get(key);
      if (list) {
        list.push(session);
      } else {
        groups.set(key, [session]);
      }
    }
    return Array.from(groups.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([key, list]) => ({
        key,
        label: groupLabelForWorkspace(key),
        path: workspaceSummaryLabel(key),
        count: list.length,
        sessions: list,
      }));
  }, [sessions]);

  const selectSessionByPath = useCallback((session) => {
    syncSessionToUrl(session?.path || "");
    selectSession(session);
  }, []);

  const toggleGroup = useCallback((key) => {
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const loadMoreSessions = useCallback((key, totalCount) => {
    setVisibleGroupSizes((previous) => {
      const current = previous.get(key) || Math.min(totalCount, SESSION_GROUP_INITIAL_SIZE);
      const next = Math.min(totalCount, current + SESSION_GROUP_PAGE_SIZE);
      if (next === current) return previous;
      const updated = new Map(previous);
      updated.set(key, next);
      return updated;
    });
  }, []);

  useEffect(() => {
    setVisibleGroupSizes((previous) => {
      const next = new Map();
      for (const group of groupedSessions) {
        const previousSize = previous.get(group.key);
        if (previousSize) {
          next.set(group.key, Math.min(group.count, previousSize));
        } else {
          next.set(group.key, Math.min(group.count, SESSION_GROUP_INITIAL_SIZE));
        }
      }
      return next;
    });
  }, [groupedSessions]);

  if (sessions.length === 0) {
    return <div className="empty-state">No sessions match this view.</div>;
  }

  if (groupedSessions.length === 0) {
    return <div className="empty-state">No sessions match this view.</div>;
  }

  return (
    <div className="session-list">
      {groupedSessions.map((group) => {
        const isCollapsed = collapsedGroups.has(group.key);
        const visibleCount = visibleGroupSizes.get(group.key) || Math.min(group.count, SESSION_GROUP_INITIAL_SIZE);
        return (
          <SessionListGroup
            key={group.key}
            group={group}
            isCollapsed={isCollapsed}
            visibleCount={visibleCount}
            selectedPath={selectedPath}
            activePath={activePath}
            activityLabel={activePath ? elapsedLabel(activityUpdatedAt, now) : ""}
            onToggleGroup={toggleGroup}
            onLoadMore={loadMoreSessions}
            onSelectSession={selectSessionByPath}
          />
        );
      })}
    </div>
  );
}

function AgentBadge({ agent, label }) {
  const meta = agentMeta[agent] || { label: label || agent, color: "var(--muted)" };
  return (
    <span className="agent-badge" style={agentColorStyle(agent)}>
      <AgentMark agent={agent} />
      {label || meta.label}
    </span>
  );
}

function Conversation() {
  const selectedSession = useStore((state) => state.selectedSession);
  const transcript = useStore((state) => state.transcript);
  const messageFilter = useStore((state) => state.messageFilter);
  const setMessageFilter = useStore((state) => state.setMessageFilter);
  const live = useStore((state) => state.live);
  const error = useStore((state) => state.error);
  const sendState = useStore((state) => state.sendState);
  const activityUpdatedAt = useStore((state) => state.activityUpdatedAt);
  const now = useIntervalNow(Boolean(selectedSession), 1000);
  const verb = useRotatingVerb(Boolean(selectedSession && live));
  const activity = useMemo(
    () =>
      deriveConversationActivity({
        selectedSession,
        transcript,
        live,
        sendState,
        error,
        activityUpdatedAt,
        now,
        verb,
      }),
    [selectedSession, transcript, live, sendState, error, activityUpdatedAt, now, verb],
  );
  const transcriptIndex = useTranscriptIndex(transcript);
  const stats = transcriptIndex.counts;
  const statCounts = {
    messages: stats.messages || 0,
    tool_use: stats.tool_use || 0,
    tool_result: stats.tool_result || 0,
    thinking: stats.thinking || 0,
  };

  return (
    <section className="conversation-panel" style={agentColorStyle(selectedSession?.agent, "--session-color")}>
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
          {messageFilterOptions.map((option) => {
            const count = statCounts[option.statKey] || 0;
            const active = messageFilter === option.value;
            const disabled = option.value !== "all" && count === 0;
            return (
              <button
                key={option.value}
                className={cls("stat-chip", active && "active")}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                title={disabled ? `No ${option.label} in this session` : `Show ${option.label}`}
                onClick={() => setMessageFilter(option.value)}
              >
                {count} {option.label}
              </button>
            );
          })}
        </div>
      )}

      {selectedSession ? (
        error ? (
          <div className="empty-state error">{error}</div>
        ) : (
          <MessageViewport
            transcript={transcript}
            transcriptIndex={transcriptIndex}
            activity={activity}
            agent={selectedSession?.agent}
            agentLabel={selectedSession?.agentLabel}
            filter={messageFilter}
          />
        )
      ) : (
        <div className="empty-state">Select a session to view transcript messages.</div>
      )}
      {selectedSession && (
        <ConversationStatusBar activity={activity} now={now} />
      )}
      {selectedSession && (
        <div className="conversation-composer">
          <Composer session={selectedSession} compact />
        </div>
      )}
    </section>
  );
}

function DispatchPanel() {
  const selectedSession = useStore((state) => state.selectedSession);
  const sessions = useStore((state) => state.sessions);
  const cwd = useStore((state) => state.cwd);
  const selectedWorkspace = useStore((state) => state.selectedWorkspace);
  const runtimeWorkspace = selectedWorkspace || cwd || "current project";
  const sendableSessions = sessions.filter((session) => sendAgents.includes(session.agent)).length;
  const detectedAgents = new Set(sessions.map((session) => session.agent).filter((agent) => sendAgents.includes(agent))).size;

  return (
    <aside className="dispatch-panel">
      <div className="dispatch-console-head">
        <div className="panel-kicker">
          <Terminal size={14} />
          Dispatch Console
        </div>
        <strong>Assign prompts to local agents</strong>
          <span>{config.sendEnabled ? "Direct send is enabled for this local runtime." : "Read-only mode is active; restart without --read-only for direct send."}</span>
      </div>
      <div className="dispatch-metrics" aria-label="Dispatch runtime summary">
        <div>
          <span>Runtime</span>
          <strong>Local</strong>
        </div>
        <div>
          <span>Agents</span>
          <strong>{detectedAgents}/3</strong>
        </div>
        <div>
          <span>Targets</span>
          <strong>{sendableSessions}</strong>
        </div>
      </div>
      <div className="runtime-path">
        <span>workspace</span>
        <code title={runtimeWorkspace}>{runtimeWorkspace}</code>
      </div>
      <Composer session={selectedSession} />
    </aside>
  );
}

function ConversationStatusBar({ activity, now }) {
  const elapsed = activity?.startedAt ? elapsedLabel(activity.startedAt, now) : "";
  return (
    <div className={cls("conversation-status-bar", activity?.tone, activity?.active && "active")}>
      <span className={cls("status-dot", activity?.active && "pulse")} />
      <div className="conversation-status-copy">
        <strong>{activity?.label || "Waiting for input"}</strong>
        <span>{activity?.detail || "Ready for the next local agent event."}</span>
      </div>
      {elapsed && <time>{elapsed}</time>}
    </div>
  );
}

function ProcessEmptyState({ label, detail }) {
  return (
    <div className="empty-state process-state">
      <Loader2 size={18} className="spin" />
      <strong>{label}</strong>
      <span>{detail}</span>
    </div>
  );
}

function MessageViewport({ transcript, transcriptIndex, activity, agent, agentLabel, filter }) {
  const parentRef = useRef(null);
  const messages = transcriptIndex?.messages || [];
  const filterIndexes = transcriptIndex?.filterIndexes || {};
  const messageHeights = transcriptIndex?.messageHeights || [];
  const activeFilter = filter || "all";
  const filteredMessageIndexes = useMemo(
    () => filterIndexes[activeFilter] || filterIndexes.all || [],
    [filterIndexes, activeFilter],
  );
  const shouldAutoScroll = useRef(false);
  const [windowStart, setWindowStart] = useState(() =>
    Math.max(filteredMessageIndexes.length - MESSAGE_WINDOW_SIZE, 0),
  );
  const hasHiddenHistory = filteredMessageIndexes.length > windowStart;
  const visibleMessageIndexes = useMemo(
    () => filteredMessageIndexes.slice(windowStart),
    [filteredMessageIndexes, windowStart],
  );
  const loadMore = () => {
    setWindowStart((start) => Math.max(start - MESSAGE_WINDOW_STEP, 0));
  };

  useEffect(() => {
    const nextWindowStart = Math.max(filteredMessageIndexes.length - MESSAGE_WINDOW_SIZE, 0);
    setWindowStart(nextWindowStart);
    shouldAutoScroll.current = true;
  }, [filteredMessageIndexes.length, activeFilter]);

  const estimateMessageHeight = (index) => {
    const messageIndex = visibleMessageIndexes[index];
    if (messageIndex == null) return 130;
    return messageHeights[messageIndex] || 130;
  };

  const virtualizer = useVirtualizer({
    count: visibleMessageIndexes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: estimateMessageHeight,
    overscan: 8,
    getItemKey: (index) => {
      const messageIndex = visibleMessageIndexes[index];
      const message = messages[messageIndex];
      return message?.id || `${messageIndex}-${message?.role || "message"}`;
    },
  });

  useEffect(() => {
    if (!shouldAutoScroll.current || visibleMessageIndexes.length === 0) return;
    virtualizer.scrollToIndex(visibleMessageIndexes.length - 1, { align: "end" });
    shouldAutoScroll.current = false;
  }, [visibleMessageIndexes.length, windowStart]);

  if (transcript == null) {
    return (
      <ProcessEmptyState
        label={activity?.label || "Connecting to transcript stream..."}
        detail={activity?.detail || "Reading the latest session file from disk."}
      />
    );
  }
  if (messages.length === 0) {
    return <div className="empty-state">No transcript messages yet.</div>;
  }
  if (filteredMessageIndexes.length === 0) {
    return <div className="empty-state">No messages match this filter.</div>;
  }

  return (
    <div className={cls("message-viewport", `filter-${activeFilter}`)} ref={parentRef} style={agentColorStyle(agent, "--session-color")}>
      {hasHiddenHistory && (
        <div className="message-viewport-toolbar">
          <button type="button" className="load-history-button" onClick={loadMore}>
            Load older messages
          </button>
        </div>
      )}
      <div className="virtual-canvas" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const messageIndex = visibleMessageIndexes[virtualRow.index];
          const message = messages[messageIndex];
          if (!message) return null;
          const absoluteIndex = messageIndex + 1;
          return (
            <article
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className={cls("message-card message-bubble", message.role, message._pending && "pending")}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div className="message-bubble-head">
                <div className="message-meta">
                  {roleIcon(message.role, agent)}
                  <span className="message-sender">{roleLabel(message.role, agent, agentLabel)}</span>
                </div>
                <span className="message-index">#{absoluteIndex}</span>
              </div>
              <div className={cls("message-blocks", message.role === "user" && "message-blocks-user")}>
                {(message.blocks || []).map((block, index) => (
                  <BlockView key={index} block={block} />
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function roleIcon(role, agent) {
  if (role === "assistant") return <AgentMark agent={agent} size={14} />;
  if (role === "tool") return <Hammer size={14} />;
  if (role === "user") return <UserRound size={14} />;
  return <Sparkles size={14} />;
}

function BlockView({ block }) {
  if (block.type === "text") {
    return <MarkdownText content={block.content} />;
  }
  if (block.type === "thinking") {
    return <DisclosureBlock icon={<Brain size={16} />} title="Thinking" tone="thinking" content={block.content} />;
  }
  if (block.type === "tool_use") {
    return <DisclosureBlock icon={<Hammer size={16} />} title={`Tool: ${block.name || "tool"}`} tone="tool-use" content={JSON.stringify(block.input ?? {}, null, 2)} />;
  }
  if (block.type === "tool_result") {
    return <DisclosureBlock icon={<Terminal size={16} />} title="Tool result" tone="tool-result" content={block.content} />;
  }
  return <DisclosureBlock icon={<Braces size={16} />} title={block.type || "Block"} content={block.content || JSON.stringify(block, null, 2)} />;
}

function MarkdownText({ content }) {
  return (
    <div className="text-block markdown-body">
      <ReactMarkdown components={markdownComponents} remarkPlugins={markdownPlugins} skipHtml>
        {String(content ?? "")}
      </ReactMarkdown>
    </div>
  );
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

function Composer({ session, compact = false }) {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("new");
  const [targetAgent, setTargetAgent] = useState("codex");
  const [targetCwd, setTargetCwd] = useState("");
  const sendState = useStore((state) => state.sendState);
  const rootCwd = useStore((state) => state.cwd);
  const sessions = useStore((state) => state.sessions);
  const selectedPath = useStore((state) => state.selectedPath);
  const canReply = Boolean(session && sendAgents.includes(session.agent));
  const effectiveMode = mode === "reply" && canReply ? "reply" : "new";
  const effectiveAgent = effectiveMode === "reply" ? session.agent : targetAgent;
  const effectiveCwd = (targetCwd.trim() || session?.cwd || rootCwd || ".").trim();
  const sessionId = effectiveMode === "reply" ? session?.sessionId : undefined;
  const disabled = sendState === "sending" || !effectiveAgent || (effectiveMode === "reply" && !canReply);
  const sendEnabled = config.sendEnabled;

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

  function selectNewTarget(agent) {
    setMode("new");
    setTargetAgent(agent);
    setTargetCwd(targetCwd.trim() || rootCwd || session?.cwd || "");
  }

  async function selectReplyTarget(nextSession) {
    setMode("reply");
    setTargetAgent(nextSession.agent);
    setTargetCwd(nextSession.cwd || rootCwd || "");
    await selectSession(nextSession, { openDetail: true });
  }

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
    setDraft("");
    const pendingId = effectiveMode === "reply" && sessionId ? addPendingTranscriptMessage(payload.message) : null;
    useStore.setState({ sendState: "sending" });
    (async () => {
      try {
        await api("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (pendingId) {
          dropPendingMessage(pendingId);
        }
        useStore.getState().showToast(effectiveMode === "reply" ? "Message sent to session" : "New session prompt sent");
        useStore.setState({ sendState: "idle" });
        void loadSessions({
          preserveSelection: true,
          silentLoading: true,
        }).catch((error) => {
          useStore.getState().showToast(error.message);
        });
      } catch (error) {
        if (pendingId) {
          dropPendingMessage(pendingId, { withError: true });
        }
        useStore.getState().showToast(error.message);
      } finally {
        useStore.setState({ sendState: "idle" });
      }
    })().catch(() => {});
  }

  return (
    <form className={cls("composer", compact && "compact-composer")} style={agentColorStyle(effectiveAgent, "--composer-color")} onSubmit={submit}>
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
      {!compact && (
        <>
          <div className="target-panel board-target-panel">
            <DispatchBoard
              sessions={sessions}
              selectedPath={selectedPath}
              mode={effectiveMode}
              targetAgent={targetAgent}
              onNewTarget={selectNewTarget}
              onReplyTarget={selectReplyTarget}
            />
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
                  Restart without <code>--read-only</code> for direct send
                </span>
              )}
            <button type="button" onClick={() => copyText(resumeCommand(session), "Resume command copied")} disabled={!session}>
              <Copy size={15} />
              Copy resume
            </button>
          </div>
        </>
      )}
      <div className="composer-row">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write any prompt for the selected target" rows={2} />
        <button className="send-button" type="submit" disabled={!draft.trim() || disabled}>
          {sendState === "sending" ? <Loader2 size={18} className="spin" /> : sendEnabled ? <Send size={18} /> : <Copy size={18} />}
          {sendEnabled ? "Send" : "Copy"}
        </button>
      </div>
    </form>
  );
}

function DispatchBoard({ sessions, selectedPath, mode, targetAgent, onNewTarget, onReplyTarget }) {
  const groupedSessions = useMemo(
    () =>
      sendAgents.map((agent) => ({
        agent,
        sessions: sessions
          .filter((session) => session.agent === agent)
          .sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0))
          .slice(0, 1),
      })),
    [sessions],
  );

  return (
    <div className="dispatch-board" aria-label="Agent dispatch board">
      {groupedSessions.map(({ agent, sessions: agentSessions }) => {
        const meta = agentMeta[agent];
        return (
          <section key={agent} className="dispatch-column" style={{ "--agent-color": meta.color }}>
            <div className="dispatch-column-head">
              <AgentBadge agent={agent} />
              <code>{sendPrimitiveLabel(agent)}</code>
            </div>
            <button
              className={cls("dispatch-card", "new", mode === "new" && targetAgent === agent && "active")}
              type="button"
              aria-label={`New ${meta.label} session`}
              onClick={() => onNewTarget(agent)}
            >
              <strong>New session</strong>
              <span>Start from cwd</span>
            </button>
            {agentSessions.map((session) => (
              <button
                key={`${session.agent}:${session.path}`}
                className={cls("dispatch-card", selectedPath === session.path && mode === "reply" && "active")}
                type="button"
                aria-label={`Reply to ${meta.label} ${session.shortTitle || session.title || "session"}`}
                onClick={() => onReplyTarget(session)}
              >
                <strong>{session.shortTitle || session.title || "(untitled)"}</strong>
                <span>{session.cwd || ""}</span>
                <small>{compactDate(session.updatedAt)}</small>
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function Toast() {
  const toast = useStore((state) => state.toast);
  return <div className={cls("toast", toast && "show")}>{toast}</div>;
}

createRoot(document.getElementById("root")).render(<App />);
