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
  Maximize2,
  Minimize2,
  Moon,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Sun,
  Terminal,
  UserRound,
  X,
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
const forceMockMobile = query.has("mobile") || query.has("mock-mobile") || query.get("v") === "mobile";
const MOBILE_QUERY = "(max-width: 900px)";
const TOAST_DURATION_MS = 4500;
const THEME_STORAGE_KEY = "kageServeTheme.v2";
const PASSWORD_STORAGE_KEY = "kageServePassword";
const INSTALL_PROMPT_STORAGE_KEY = "kageServeInstallPromptDismissed";
const SERVER_ORIGIN_STORAGE_KEY = "kageServeServerOrigin";
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

function removeStorageValue(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Local storage can be unavailable in some browser contexts.
  }
}

function matchMediaMatches(query) {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}

function useMobileLayout() {
  const [isMobileLayout, setIsMobileLayout] = useState(() => forceMockMobile || matchMediaMatches(MOBILE_QUERY));

  useEffect(() => {
    if (forceMockMobile || !window.matchMedia) return;
    const media = window.matchMedia(MOBILE_QUERY);
    const onChange = (event) => {
      setIsMobileLayout(event.matches);
    };

    if (media.addEventListener) {
      media.addEventListener("change", onChange);
    } else {
      media.addListener(onChange);
    }
    setIsMobileLayout(media.matches);

    return () => {
      if (media.removeEventListener) {
        media.removeEventListener("change", onChange);
      } else {
        media.removeListener(onChange);
      }
    };
  }, []);

  return isMobileLayout;
}

function isStandalonePwa() {
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone);
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
const TASK_COLUMNS = [
  { value: "queued", label: "Queued", progress: 0 },
  { value: "running", label: "Running", progress: 45 },
  { value: "needs_review", label: "Needs Review", progress: 90 },
  { value: "completed", label: "Completed", progress: 100 },
  { value: "failed", label: "Failed", progress: 100 },
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

function uniqueNormalizedWorkspaces(items = []) {
  return Array.from(new Set(items.map(normalizeWorkspace).filter(Boolean))).sort((left, right) => left.localeCompare(right));
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
      <path className="kage-logo-prompt" d="M195 198l45 36-45 36" fill="none" stroke="#f2b84b" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
      <path className="kage-logo-cursor" d="M267 267h72" fill="none" stroke="#f7f2e6" strokeWidth="24" strokeLinecap="round" />
      <circle className="kage-logo-dot kage-logo-dot-blue" cx="164" cy="360" r="24" fill="#3b82f6" />
      <circle className="kage-logo-dot kage-logo-dot-green" cx="256" cy="376" r="24" fill="#15a074" />
      <circle className="kage-logo-dot kage-logo-dot-warm" cx="348" cy="360" r="24" fill="#cf7654" />
      <path d="M183 363c44 33 119 34 164 0" fill="none" stroke="#f7f2e6" strokeWidth="16" strokeLinecap="round" opacity="0.56" />
    </svg>
  );
}

function initialPassword() {
  if (!config.passwordRequired) return "";
  const fromQuery = query.get("password")?.trim();
  if (fromQuery) {
    writeStorageValue(PASSWORD_STORAGE_KEY, fromQuery);
    return fromQuery;
  }
  const existing = readStorageValue(PASSWORD_STORAGE_KEY);
  if (existing) return existing;
  return "";
}

const useStore = create((set, get) => ({
  password: initialPassword(),
  theme: normalizeTheme(readStorageValue(THEME_STORAGE_KEY, DEFAULT_THEME)),
  sessions: [],
  agents: [],
  projects: [],
  workspaces: [],
  selectedWorkspace: initialWorkspaceFromQuery(),
  viewMode: "sessions",
  selectedAgent: "all",
  search: "",
  tasks: [],
  selectedTaskId: null,
  selectedPath: null,
  selectedSession: null,
  transcript: null,
  pendingTranscriptMessages: [],
  messageFilter: "all",
  live: false,
  activityUpdatedAt: 0,
  loading: false,
  loadingMessage: "",
  stream: null,
  detailOpen: false,
  conversationFullscreen: false,
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
  setViewMode(viewMode) {
    set({ viewMode });
  },
  setTasks(tasks) {
    set({ tasks });
  },
  upsertTask(task) {
    if (!task?.id) return;
    const tasks = get().tasks || [];
    const existingIndex = tasks.findIndex((item) => item.id === task.id);
    const nextTasks = existingIndex >= 0
      ? tasks.map((item) => (item.id === task.id ? task : item))
      : [task, ...tasks];
    set({ tasks: nextTasks });
  },
  removeTask(taskId) {
    set({ tasks: (get().tasks || []).filter((task) => task.id !== taskId) });
  },
  setSelectedTaskId(selectedTaskId) {
    set({ selectedTaskId });
  },
  setSelectedPath(selectedPath) {
    set({ selectedPath: selectedPath || null });
  },
  setConversationFullscreen(conversationFullscreen) {
    set({ conversationFullscreen });
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
    const toastTimer = setTimeout(() => set({ toast: "" }), TOAST_DURATION_MS);
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
    if (response.status === 401 && config.passwordRequired) {
      removeStorageValue(PASSWORD_STORAGE_KEY);
      useStore.setState({ password: "", error: "" });
    }
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
    const directoryChoicePaths = Array.isArray(data.directoryChoices) ? data.directoryChoices.map((choice) => choice?.path) : [];
    const projects = uniqueNormalizedWorkspaces([...(Array.isArray(data.workspaces) ? data.workspaces : []), ...directoryChoicePaths]);
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

async function loadTasks({ silent = false } = {}) {
  try {
    const data = await api("/api/tasks");
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    useStore.getState().setTasks(tasks);
    return tasks;
  } catch (error) {
    if (!silent) {
      useStore.getState().showToast(error.message);
    }
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
    _pendingContent: content,
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
    pendingTranscriptMessages: [...(state.pendingTranscriptMessages || []), pendingMessage],
    activityUpdatedAt: Date.now(),
  });
  return pendingMessage.id;
}

function blockText(block) {
  if (!block) return "";
  if (typeof block === "string") return block;
  if (typeof block.content === "string") return block.content;
  if (typeof block.text === "string") return block.text;
  if (typeof block.input === "string") return block.input;
  return "";
}

function messageText(message) {
  return (message?.blocks || []).map(blockText).filter(Boolean).join("\n");
}

function transcriptContainsText(transcript, content) {
  const needle = String(content ?? "").trim();
  if (!needle) return true;
  return (transcript?.messages || []).some((message) => messageText(message).includes(needle));
}

function withPendingTranscriptMessages(transcript) {
  const state = useStore.getState();
  const pending = state.pendingTranscriptMessages || [];
  if (!transcript || pending.length === 0) {
    return { transcript, pendingTranscriptMessages: pending };
  }
  const remainingPending = pending.filter((message) => !transcriptContainsText(transcript, message._pendingContent || messageText(message)));
  if (remainingPending.length === 0) {
    return { transcript, pendingTranscriptMessages: [] };
  }
  return {
    transcript: {
      ...transcript,
      messages: [...(transcript.messages || []), ...remainingPending],
    },
    pendingTranscriptMessages: remainingPending,
  };
}

function appendLocalTranscriptMessage({ role = "assistant", content, idPrefix = "local-send-output" }) {
  const text = String(content ?? "").trim();
  if (!text) return;
  const state = useStore.getState();
  if (!state.transcript) return;
  useStore.setState({
    transcript: {
      ...state.transcript,
      messages: [
        ...(state.transcript.messages || []),
        {
          id: `${idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          role,
          blocks: [{ type: "text", content: text }],
          _localSendOutput: true,
        },
      ],
    },
    activityUpdatedAt: Date.now(),
  });
}

function clearLocalSendErrors() {
  const state = useStore.getState();
  if (!state.transcript) return;
  const messages = (state.transcript.messages || []).filter((message) => !message?._localSendError);
  if (messages.length === (state.transcript.messages || []).length) return;
  useStore.setState({
    transcript: {
      ...state.transcript,
      messages,
    },
  });
}

function dropPendingMessage(messageId, { withError = false } = {}) {
  const state = useStore.getState();
  if (!state.transcript || !messageId) {
    return;
  }
  const messages = (state.transcript.messages || []).filter((message) => message?.id !== messageId);
  const pendingTranscriptMessages = (state.pendingTranscriptMessages || []).filter((message) => message?.id !== messageId);
  const finalMessages = withError
    ? [
        ...messages,
        {
          id: `pending-error-${messageId}`,
          role: "system",
          blocks: [{ type: "text", content: "Previous send did not complete; please retry." }],
          _localSendError: true,
        },
      ]
    : messages;
  useStore.setState({
    transcript: {
      ...state.transcript,
      messages: finalMessages,
    },
    pendingTranscriptMessages,
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

function formatRelativeTime(value, now = Date.now()) {
  const timestamp = Date.parse(value || 0);
  if (Number.isNaN(timestamp)) return "unknown";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return compactDate(value);
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

const LOGO_ACTIVE_TASK_STATUSES = new Set(["queued", "running", "needs_review"]);
const LOGO_ACTIVITY_TEXT_RE = /\b(running|tool|thinking|processing|working|executing|queued)\b/i;

function transcriptSuggestsLogoActivity({ transcript, live, activityUpdatedAt, now }) {
  if (!live || !transcript || !activityUpdatedAt || now - activityUpdatedAt >= ACTIVITY_IDLE_AFTER_MS) {
    return false;
  }
  const latest = latestMessageBlock(transcript.messages || []);
  const block = latest?.block;
  if (!block) return Boolean(latest?.message?._pending);
  if (latest?.message?._pending || block.type === "tool_use" || block.type === "tool_result" || block.type === "thinking") {
    return true;
  }
  const activityText = [block.type, block.name, blockText(block)].filter(Boolean).join(" ");
  return LOGO_ACTIVITY_TEXT_RE.test(activityText);
}

function hasLogoActivity({ sendState, tasks, transcript, live, activityUpdatedAt, now }) {
  return (
    sendState === "sending"
    || (tasks || []).some((task) => LOGO_ACTIVE_TASK_STATUSES.has(task?.status))
    || transcriptSuggestsLogoActivity({ transcript, live, activityUpdatedAt, now })
  );
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
  const parts = trimmed.split("/").filter(Boolean);
  const tail = parts[parts.length - 1];
  return tail || trimmed;
}

function workspaceOptionLabel(workspacePath) {
  const label = groupLabelForWorkspace(workspacePath);
  return label === workspacePath ? label : `${label} - ${workspacePath}`;
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
    const validProjects = uniqueNormalizedWorkspaces(availableWorkspaces);
    const selectedWorkspace = normalizeWorkspace(data.selectedWorkspace || previousState.selectedWorkspace || data.cwd);
    const mergedProjects = uniqueNormalizedWorkspaces([
      ...(previousState.projects || []),
      ...validProjects,
      selectedWorkspace,
    ]);
    const preferredPath = sessionPathFromQuery() || previousState.selectedPath || "";
    const restoredSession = preferredPath ? sessions.find((session) => session.path === preferredPath) : null;
    const preservedSession = preserveSelection && previousState.selectedPath
      ? sessions.find((session) => session.path === previousState.selectedPath) || null
      : null;
    const selectedSession = restoredSession || preservedSession;
    const selectedPath = selectedSession ? selectedSession.path : null;
    const keepCurrentStream = Boolean(
      selectedSession
      && preserveSelection
      && previousState.selectedPath === selectedSession.path
      && previousState.stream,
    );
    useStore.setState({
      sessions,
      agents: data.agents || [],
      cwd: data.cwd,
      workspaces: validProjects,
      projects: mergedProjects,
      selectedWorkspace,
      selectedPath: selectedPath,
      selectedSession: selectedSession || null,
      transcript: keepCurrentStream ? previousState.transcript : null,
      loading: false,
      loadingMessage: "",
      error: "",
    });

    if (selectedSession && !keepCurrentStream) {
      await selectSession(selectedSession, { openDetail: false });
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
    projects: uniqueNormalizedWorkspaces([...(useStore.getState().projects || []), workspace]),
    selectedPath: null,
    selectedSession: null,
    transcript: null,
    pendingTranscriptMessages: [],
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
    pendingTranscriptMessages: [],
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
    let transcript;
    try {
      transcript = JSON.parse(event.data);
    } catch {
      useStore.setState({ error: "Could not decode transcript update; keeping the current view.", loadingMessage: "" });
      return;
    }
    const firstTranscript = !seenFirstTranscript;
    seenFirstTranscript = true;
    const updatedAtMs = Date.parse(transcript.updatedAt || session.updatedAt || 0);
    const merged = withPendingTranscriptMessages(transcript);
    useStore.setState({
      transcript: merged.transcript,
      pendingTranscriptMessages: merged.pendingTranscriptMessages,
      live: true,
      activityUpdatedAt: firstTranscript && !Number.isNaN(updatedAtMs) ? updatedAtMs : Date.now(),
      loadingMessage: "",
    });
  });
  stream.addEventListener("error", async () => {
    try {
      const transcript = await api(`/api/transcript?path=${encodeURIComponent(session.path)}&agent=${encodeURIComponent(session.agent)}`);
      const merged = withPendingTranscriptMessages(transcript);
      useStore.setState({ transcript: merged.transcript, pendingTranscriptMessages: merged.pendingTranscriptMessages, live: false, activityUpdatedAt: Date.now(), loadingMessage: "" });
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
  const password = useStore((state) => state.password);
  const detailOpen = useStore((state) => state.detailOpen);
  const viewMode = useStore((state) => state.viewMode);
  const conversationFullscreen = useStore((state) => state.conversationFullscreen);
  const isMobileLayout = useMobileLayout();
  const needsPassword = config.passwordRequired && !password;
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    if (needsPassword) return undefined;
    const boot = async () => {
      await loadProjects();
      await loadTasks({ silent: true });
      await loadSessions();
    };
    void boot();
    return () => useStore.getState().stream?.close();
  }, [needsPassword]);
  useEffect(() => {
    if (needsPassword) return undefined;
    const timer = window.setInterval(() => {
      void loadTasks({ silent: true });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [needsPassword]);
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  useEffect(() => {
    writeStorageValue(SERVER_ORIGIN_STORAGE_KEY, window.location.origin);
  }, []);

  if (needsPassword) {
    return <PasswordGate />;
  }

  return (
    <Tooltip.Provider delayDuration={220}>
      <div className={cls("app-shell", isMobileLayout && "mock-mobile")}>
        <TopBar />
        <main className={cls("workspace", detailOpen && "detail-open", conversationFullscreen && "conversation-fullscreen", viewMode === "board" && "board-mode")}>
          <WorkspaceContent />
        </main>
        <Toast />
        <PwaInstallPrompt isMobileLayout={isMobileLayout} />
      </div>
    </Tooltip.Provider>
  );
}

function PasswordGate() {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    const password = draft.trim();
    if (!password) {
      setError("Enter the KAGE password.");
      return;
    }
    writeStorageValue(PASSWORD_STORAGE_KEY, password);
    useStore.setState({ password, error: "" });
  }

  return (
    <main className="password-shell">
      <form className="password-card" onSubmit={submit}>
        <div className="password-logo">
          <KageLogoIcon />
        </div>
        <div>
          <h1>KAGE Dispatch</h1>
          <p>Enter the local serve password to open this session monitor.</p>
        </div>
        <label>
          <span>Password</span>
          <input
            autoFocus
            type="password"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
            }}
            placeholder="KAGE password"
          />
        </label>
        {error && <small className="password-error">{error}</small>}
        <button type="submit">
          <Lock size={16} />
          Unlock
        </button>
      </form>
    </main>
  );
}

function WorkspaceContent() {
  const viewMode = useStore((state) => state.viewMode);
  if (viewMode === "board") {
    return <TaskBoardPanel />;
  }
  return (
    <>
      <Sidebar />
      <Conversation />
      <DispatchPanel />
    </>
  );
}

function TopBar() {
  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);
  const viewMode = useStore((state) => state.viewMode);
  const setViewMode = useStore((state) => state.setViewMode);
  const sessions = useStore((state) => state.sessions);
  const tasks = useStore((state) => state.tasks);
  const transcript = useStore((state) => state.transcript);
  const live = useStore((state) => state.live);
  const sendState = useStore((state) => state.sendState);
  const activityUpdatedAt = useStore((state) => state.activityUpdatedAt);
  const projects = useStore((state) => state.projects);
  const workspaces = useStore((state) => state.workspaces);
  const loading = useStore((state) => state.loading);
  const loadingMessage = useStore((state) => state.loadingMessage);
  const selectedWorkspace = useStore((state) => state.selectedWorkspace);
  const workspaceOptions = useMemo(
    () => uniqueNormalizedWorkspaces([...(projects || []), ...(workspaces || []), selectedWorkspace]),
    [projects, workspaces, selectedWorkspace],
  );
  const selectedWorkspaceValue = normalizeWorkspace(selectedWorkspace) || "";
  const workspaceSummary = isAllWorkspaces(selectedWorkspace)
    ? "All workspaces"
    : selectedWorkspace
      ? groupLabelForWorkspace(selectedWorkspace)
      : "Current workspace";
  const subtitle = sessions.length
    ? `${sessions.length} sessions${workspaceSummary ? ` · ${workspaceSummary}` : ""}`
    : "No sessions loaded yet";
  const [customWorkspace, setCustomWorkspace] = useState(isAllWorkspaces(selectedWorkspace) ? "" : selectedWorkspace || "");
  const now = useIntervalNow(Boolean(live && activityUpdatedAt), 1000);
  const logoActive = hasLogoActivity({ sendState, tasks, transcript, live, activityUpdatedAt, now });

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
        <div className={cls("logo-mark", logoActive && "active")}>
          <KageLogoIcon />
        </div>
        <div className="brand-copy">
          <h1>KAGE Dispatch</h1>
          <span title={loading ? loadingMessage || subtitle : subtitle}>
            {loading ? loadingMessage || "Refreshing session index..." : subtitle}
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
              {workspaceOptionLabel(workspacePath)}
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
              <option key={workspacePath} value={workspacePath} label={workspaceOptionLabel(workspacePath)} />
            ))}
          </datalist>
          <button type="button" className="icon-button" onClick={applyWorkspaceFilter}>
            Open Path
          </button>
        </div>
      </label>
      <div className="view-switch" role="tablist" aria-label="Switch KAGE view">
        <button type="button" className={cls(viewMode === "sessions" && "active")} onClick={() => setViewMode("sessions")}>
          Sessions
        </button>
        <button type="button" className={cls(viewMode === "board" && "active")} onClick={() => setViewMode("board")}>
          Board
        </button>
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

function PwaInstallPrompt({ isMobileLayout }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(() =>
    isMobileLayout && !isStandalonePwa() && readStorageValue(INSTALL_PROMPT_STORAGE_KEY) !== "1",
  );

  useEffect(() => {
    if (!isMobileLayout || isStandalonePwa() || readStorageValue(INSTALL_PROMPT_STORAGE_KEY) === "1") {
      setVisible(false);
      return undefined;
    }
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    setVisible(true);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, [isMobileLayout]);

  if (!visible) return null;

  const dismiss = () => {
    writeStorageValue(INSTALL_PROMPT_STORAGE_KEY, "1");
    setVisible(false);
  };
  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => null);
      setDeferredPrompt(null);
      if (choice?.outcome === "accepted") {
        dismiss();
      }
      return;
    }
    setShowIosHint(true);
  };

  return (
    <aside className="install-banner" role="status">
      <div className="install-banner-icon">
        <KageLogoIcon />
      </div>
      <div>
        <strong>Add KAGE to your home screen</strong>
        <span>{showIosHint ? "Use Share, then Add to Home Screen." : "Open this monitor faster from your phone."}</span>
      </div>
      <button type="button" onClick={showIosHint ? dismiss : install}>
        {showIosHint ? "OK" : "Install"}
      </button>
      <button type="button" className="install-dismiss" onClick={dismiss} aria-label="Dismiss install prompt">
        <X size={15} />
      </button>
    </aside>
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

const SessionListItem = memo(function SessionListItem({ session, isActive, isStreaming, activityLabel, now = Date.now(), onSelectSession }) {
  const updates = formatRelativeTime(session?.updatedAt, now);
  const turnCount = Array.isArray(session?.recentUserMessages) ? session.recentUserMessages.length : 0;
  const turnText = turnCount === 1 ? "1 turn" : `${turnCount} turns`;
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
      <small className="session-meta-line" title={`${turnText} · updated ${updates}`}>
        <span>{turnText}</span>
        <span>Updated {updates}</span>
      </small>
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
            now={now}
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
  const selectedAgent = useStore((state) => state.selectedAgent);
  const search = useStore((state) => state.search);
  const live = useStore((state) => state.live);
  const activityUpdatedAt = useStore((state) => state.activityUpdatedAt);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [visibleGroupSizes, setVisibleGroupSizes] = useState(new Map());
  const now = useIntervalNow(Boolean(selectedPath && live) || sessions.length > 0, 60_000);
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

  const hasSearch = search.trim().length > 0;
  if (!sessions.length) {
    if (hasSearch || selectedAgent !== "all") {
      return (
        <SessionListEmptyState
          title="No sessions match the current filters"
          detail="Try clearing search text or switching to All agents."
          onClearFilters={() => {
            useStore.getState().setSearch("");
            useStore.getState().setSelectedAgent("all");
          }}
        />
      );
    }
    return (
      <SessionListEmptyState
        title="No local sessions found"
        detail="Start a new prompt in Dispatch Console and a local agent will create the first session here."
      />
    );
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
            now={now}
          />
        );
      })}
    </div>
  );
}

function SessionListEmptyState({ title, detail, onClearFilters }) {
  return (
    <div className="empty-state process-state session-empty-state">
      <Send size={18} className="spin" />
      <strong>{title}</strong>
      <span>{detail}</span>
      {onClearFilters && (
        <button
          type="button"
          className="secondary"
          onClick={() => onClearFilters()}
        >
          Clear filters
        </button>
      )}
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
  const conversationFullscreen = useStore((state) => state.conversationFullscreen);
  const setConversationFullscreen = useStore((state) => state.setConversationFullscreen);
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
        <IconButton
          label={conversationFullscreen ? "Exit fullscreen conversation" : "Fullscreen conversation"}
          onClick={() => setConversationFullscreen(!conversationFullscreen)}
        >
          {conversationFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </IconButton>
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

function TaskBoardPanel() {
  const tasks = useStore((state) => state.tasks);
  const selectedTaskId = useStore((state) => state.selectedTaskId);
  const setSelectedTaskId = useStore((state) => state.setSelectedTaskId);
  const selectedWorkspace = useStore((state) => state.selectedWorkspace);
  const cwd = useStore((state) => state.cwd);
  const dispatchWorkspace = isAllWorkspaces(selectedWorkspace) ? cwd : selectedWorkspace || cwd || "";
  const now = useIntervalNow(tasks.some((task) => task.status === "running" || task.status === "queued"), 1000);
  const [agentFilter, setAgentFilter] = useState("all");
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;
  const filteredTasks = useMemo(
    () => (agentFilter === "all" ? tasks : tasks.filter((task) => task.agent === agentFilter)),
    [tasks, agentFilter],
  );
  const taskCounts = useMemo(() => {
    const counts = new Map([["all", tasks.length]]);
    for (const agent of sendAgents) {
      counts.set(agent, tasks.filter((task) => task.agent === agent).length);
    }
    return counts;
  }, [tasks]);

  return (
    <section className="task-board-panel">
      <div className="task-board-head">
        <div>
          <div className="panel-kicker">
            <Braces size={14} />
            Task Board
          </div>
          <strong>Dispatch and track local agent tasks</strong>
          <span>{filteredTasks.length ? `${filteredTasks.length} tasks in this board` : "Create a local one-shot task to start tracking agent work."}</span>
        </div>
        <div className="board-agent-tabs" role="tablist" aria-label="Filter tasks by agent">
          {["all", ...sendAgents].map((agent) => (
            <button
              key={agent}
              type="button"
              className={cls(agentFilter === agent && "active")}
              style={agent === "all" ? undefined : agentColorStyle(agent)}
              onClick={() => setAgentFilter(agent)}
            >
              {agent === "all" ? "All" : agentMeta[agent]?.short || agent}
              <span>{taskCounts.get(agent) || 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="task-board-columns" aria-label="Agent task board">
        {TASK_COLUMNS.map((column) => {
          const columnTasks = filteredTasks.filter((task) => task.status === column.value);
          return (
            <section key={column.value} className={cls("task-column", column.value)}>
              <div className="task-column-head">
                <strong>{column.label}</strong>
                <span>{columnTasks.length}</span>
              </div>
              <div className="task-column-body">
                {columnTasks.length ? (
                  columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      now={now}
                      active={selectedTaskId === task.id}
                      onSelect={() => setSelectedTaskId(task.id)}
                    />
                  ))
                ) : (
                  <div className="task-empty">No tasks</div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {selectedTask && (
        <TaskDetailPanel task={selectedTask} now={now} onClose={() => setSelectedTaskId(null)} />
      )}

      <TaskDispatchBar workspace={dispatchWorkspace} />
    </section>
  );
}

function TaskCard({ task, now, active, onSelect }) {
  const verb = useRotatingVerb(task.status === "running");
  const age = elapsedLabel(Date.parse(task.createdAt || 0), now);
  const lastLog = task.logs?.[task.logs.length - 1] || task.error || task.stdout || "Waiting for activity.";
  return (
    <button type="button" className={cls("task-card", task.status, active && "active")} style={agentColorStyle(task.agent)} onClick={onSelect}>
      <div className="task-card-top">
        <AgentBadge agent={task.agent} label={task.agentLabel} />
        <span>{age || compactDate(task.createdAt)}</span>
      </div>
      <strong>{task.title || "Untitled task"}</strong>
      <p>{lastLog}</p>
      <div className="task-progress" aria-label={`Progress ${task.progress || 0}%`}>
        <span style={{ width: `${Math.max(0, Math.min(100, task.progress || 0))}%` }} />
      </div>
      <div className="task-card-foot">
        <code>{task.project || task.cwd || "project"}</code>
        <span>{task.status === "running" ? `${verb}...` : taskStatusLabel(task.status)}</span>
      </div>
    </button>
  );
}

function TaskDispatchBar({ workspace }) {
  const [agent, setAgent] = useState("codex");
  const [cwd, setCwd] = useState(workspace || "");
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCwd(workspace || "");
  }, [workspace]);

  async function submit(event) {
    event.preventDefault();
    const message = draft.trim();
    const targetCwd = (cwd.trim() || workspace || ".").trim();
    if (!message || submitting) return;
    const payload = { agent, cwd: targetCwd, message };
    if (!config.sendEnabled) {
      await copyText(sendCommand(payload), "Dispatch command copied");
      return;
    }
    setSubmitting(true);
    const optimisticTask = {
      id: `local-task-${Date.now()}`,
      agent,
      agentLabel: agentMeta[agent]?.label || agent,
      cwd: targetCwd,
      project: groupLabelForWorkspace(targetCwd),
      title: taskTitleFromPrompt(message),
      message,
      status: "queued",
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      logs: ["Queued locally."],
    };
    useStore.getState().upsertTask(optimisticTask);
    setDraft("");
    try {
      const data = await api("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (data.task) {
        useStore.getState().removeTask(optimisticTask.id);
        useStore.getState().upsertTask(data.task);
      }
      useStore.getState().showToast("Task dispatched");
      void loadTasks({ silent: true });
    } catch (error) {
      useStore.getState().showToast(error.message);
      useStore.getState().upsertTask({
        ...optimisticTask,
        status: "failed",
        progress: 100,
        updatedAt: new Date().toISOString(),
        error: error.message,
        logs: [...optimisticTask.logs, error.message],
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="task-dispatch-bar" onSubmit={submit} style={agentColorStyle(agent)}>
      <label>
        <span>Agent</span>
        <select value={agent} onChange={(event) => setAgent(event.target.value)}>
          {sendAgents.map((item) => (
            <option key={item} value={item}>{agentMeta[item]?.label || item}</option>
          ))}
        </select>
      </label>
      <label className="task-dispatch-cwd">
        <span>Workspace</span>
        <input value={cwd} onChange={(event) => setCwd(event.target.value)} placeholder="/path/to/project" />
      </label>
      <label className="task-dispatch-prompt">
        <span>Task</span>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Describe a task to dispatch..." />
      </label>
      <button type="submit" disabled={!draft.trim() || submitting}>
        {submitting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
        {config.sendEnabled ? "Dispatch" : "Copy"}
      </button>
    </form>
  );
}

function TaskDetailPanel({ task, now, onClose }) {
  const [acting, setActing] = useState("");
  async function completeTask() {
    if (acting) return;
    setActing("complete");
    try {
      const data = await api(`/api/tasks/${encodeURIComponent(task.id)}/complete`, { method: "POST" });
      if (data.task) {
        useStore.getState().upsertTask(data.task);
      }
      useStore.getState().showToast("Task completed");
      void loadTasks({ silent: true });
    } catch (error) {
      useStore.getState().showToast(error.message);
    } finally {
      setActing("");
    }
  }
  async function retryTask() {
    if (acting) return;
    setActing("retry");
    try {
      const data = await api(`/api/tasks/${encodeURIComponent(task.id)}/retry`, { method: "POST" });
      if (data.task) {
        useStore.getState().upsertTask(data.task);
        useStore.getState().setSelectedTaskId(data.task.id);
      }
      useStore.getState().showToast("Task retried");
      void loadTasks({ silent: true });
    } catch (error) {
      useStore.getState().showToast(error.message);
    } finally {
      setActing("");
    }
  }

  return (
    <aside className="task-detail-panel" style={agentColorStyle(task.agent)}>
      <div className="task-detail-head">
        <AgentBadge agent={task.agent} label={task.agentLabel} />
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close task detail">
          <X size={16} />
        </button>
      </div>
      <strong>{task.title}</strong>
      <span>{taskStatusLabel(task.status)} / {elapsedLabel(Date.parse(task.createdAt || 0), now) || compactDate(task.createdAt)}</span>
      <div className="task-progress large">
        <span style={{ width: `${Math.max(0, Math.min(100, task.progress || 0))}%` }} />
      </div>
      {(task.status === "needs_review" || task.status === "failed") && (
        <div className="task-detail-actions">
          {task.status === "needs_review" && (
            <button type="button" onClick={completeTask} disabled={Boolean(acting)}>
              {acting === "complete" ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
              Approve & Complete
            </button>
          )}
          <button type="button" className="secondary" onClick={retryTask} disabled={Boolean(acting)}>
            {acting === "retry" ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            Retry
          </button>
        </div>
      )}
      <dl className="task-meta">
        <div><dt>Project</dt><dd>{task.cwd || "current project"}</dd></div>
        <div><dt>Created</dt><dd>{new Date(task.createdAt || Date.now()).toLocaleString()}</dd></div>
        {task.pid && <div><dt>PID</dt><dd>{task.pid}</dd></div>}
      </dl>
      <div className="task-log">
        <strong>Activity</strong>
        {(task.logs || []).map((entry, index) => (
          <code key={`${task.id}-${index}`}>{entry}</code>
        ))}
        {task.stdout && <code>{task.stdout}</code>}
        {task.stderr && <code>{task.stderr}</code>}
        {task.error && <code>{task.error}</code>}
      </div>
    </aside>
  );
}

function taskTitleFromPrompt(prompt) {
  const text = String(prompt || "").trim().replace(/\s+/g, " ");
  if (!text) return "Untitled task";
  return text.length > 96 ? `${text.slice(0, 93)}...` : text;
}

function taskStatusLabel(status) {
  if (status === "needs_review") return "Needs review";
  return status ? status.replace(/_/g, " ") : "queued";
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
  const isNearTail = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [windowStart, setWindowStart] = useState(() =>
    Math.max(filteredMessageIndexes.length - MESSAGE_WINDOW_SIZE, 0),
  );
  const hasHiddenHistory = windowStart > 0;
  const visibleMessageIndexes = useMemo(
    () => filteredMessageIndexes.slice(windowStart),
    [filteredMessageIndexes, windowStart],
  );
  const tailSignature = useMemo(() => {
    const messageIndex = visibleMessageIndexes[visibleMessageIndexes.length - 1];
    const message = messages[messageIndex];
    if (!message) return "empty";
    const blockSignature = (message.blocks || [])
      .map((block) => `${block?.type || "block"}:${blockText(block).length}`)
      .join("|");
    return `${message.id || messageIndex}:${message.role || "message"}:${blockSignature}`;
  }, [messages, visibleMessageIndexes]);
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

  const scrollToLatest = useCallback(() => {
    if (visibleMessageIndexes.length === 0) return;
    virtualizer.scrollToIndex(visibleMessageIndexes.length - 1, { align: "end" });
    isNearTail.current = true;
    setShowJumpToLatest(false);
  }, [virtualizer, visibleMessageIndexes.length]);

  useEffect(() => {
    const element = parentRef.current;
    if (!element) return undefined;
    const updateNearTail = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      const nearTail = distance < 120;
      isNearTail.current = nearTail;
      if (nearTail) {
        setShowJumpToLatest(false);
      }
    };
    updateNearTail();
    element.addEventListener("scroll", updateNearTail, { passive: true });
    return () => element.removeEventListener("scroll", updateNearTail);
  }, []);

  useEffect(() => {
    if (visibleMessageIndexes.length === 0) return;
    if (shouldAutoScroll.current || isNearTail.current) {
      window.requestAnimationFrame(scrollToLatest);
      shouldAutoScroll.current = false;
      return;
    }
    setShowJumpToLatest(true);
  }, [tailSignature, visibleMessageIndexes.length, windowStart, scrollToLatest]);

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
                  {message._pending && <span className="message-pending-label">Waiting for transcript</span>}
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
      {showJumpToLatest && (
        <button type="button" className="jump-latest-button" onClick={scrollToLatest}>
          Jump to latest
        </button>
      )}
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

function formatBytes(byteCount) {
  const value = Number(byteCount) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function textBytes(content) {
  const text = String(content ?? "");
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text).length;
  }
  return text.length;
}

function estimatedBase64Bytes(value) {
  const clean = String(value ?? "").replace(/\s+/g, "");
  if (!clean) return 0;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

function looksLikeBase64Blob(value) {
  const clean = String(value ?? "").replace(/\s+/g, "");
  if (clean.length < 240) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/u.test(clean);
}

function previewText(value, maxLength = 420) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n...` : text;
}

function summarizeDisclosureContent(content) {
  const text = String(content ?? "");
  const trimmed = text.trim();
  const dataUrlMatch = trimmed.match(/^data:([^;,]+)?(?:;[^,]*)?;base64,([\s\S]+)$/iu);
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1] || "data";
    const bytes = estimatedBase64Bytes(dataUrlMatch[2]);
    return {
      collapsed: true,
      badge: "binary",
      label: mimeType.startsWith("image/") ? "Image payload collapsed" : "Base64 payload collapsed",
      detail: `${mimeType} · ${formatBytes(bytes)}`,
      preview: previewText(trimmed, 160),
    };
  }
  if (looksLikeBase64Blob(trimmed)) {
    return {
      collapsed: true,
      badge: "base64",
      label: "Base64-like payload collapsed",
      detail: formatBytes(estimatedBase64Bytes(trimmed)),
      preview: previewText(trimmed, 180),
    };
  }
  if (text.length > 24_000 || lineCount(text) > 700) {
    return {
      collapsed: true,
      badge: "large",
      label: "Large output preview",
      detail: `${formatBytes(textBytes(text))} · ${lineCount(text)} lines`,
      preview: previewText(text, 4_000),
    };
  }
  return {
    collapsed: false,
    badge: "",
    label: "",
    detail: "",
    preview: text,
  };
}

function DisclosureBlock({ icon, title, content, tone = "", defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [showRaw, setShowRaw] = useState(false);
  const lines = lineCount(content);
  const summary = summarizeDisclosureContent(content);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className={cls("disclosure", tone)}>
      <Collapsible.Trigger className="disclosure-trigger">
        <span>
          {icon}
          {title}
        </span>
        <small>{summary.badge || (lines > 5 ? `${lines} lines` : open ? "Open" : "Preview")}</small>
        <ChevronDown size={16} className={cls(open && "rotate")} />
      </Collapsible.Trigger>
      <Collapsible.Content className="disclosure-content">
        {summary.collapsed && (
          <div className="disclosure-summary">
            <strong>{summary.label}</strong>
            <span>{summary.detail}</span>
            <button type="button" className="raw-toggle" onClick={() => setShowRaw((value) => !value)}>
              {showRaw ? "Show preview" : "Show raw"}
            </button>
          </div>
        )}
        <pre>{summary.collapsed && !showRaw ? summary.preview : content}</pre>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function Composer({ session, compact = false }) {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("new");
  const [replySessionPath, setReplySessionPath] = useState(null);
  const [targetAgent, setTargetAgent] = useState("codex");
  const [targetCwd, setTargetCwd] = useState("");
  const submittingRef = useRef(false);
  const sendState = useStore((state) => state.sendState);
  const rootCwd = useStore((state) => state.cwd);
  const sessions = useStore((state) => state.sessions);
  const selectedPath = useStore((state) => state.selectedPath);
  const canReply = Boolean(session && sendAgents.includes(session.agent));
  const effectiveMode = mode === "reply" && canReply && replySessionPath === session?.path ? "reply" : "new";
  const effectiveAgent = effectiveMode === "reply" ? session.agent : targetAgent;
  const effectiveCwd = (targetCwd.trim() || session?.cwd || rootCwd || ".").trim();
  const sessionId = effectiveMode === "reply" ? session?.sessionId : undefined;
  const disabled = sendState === "sending" || !effectiveAgent || (effectiveMode === "reply" && !canReply);
  const sendEnabled = config.sendEnabled;

  useEffect(() => {
    const nextCwd = session?.cwd || rootCwd || "";
    setTargetCwd(nextCwd);
    if (!session?.agent || !sendAgents.includes(session.agent)) {
      setTargetAgent("codex");
      setMode("new");
      setReplySessionPath(null);
    }
  }, [session?.path, session?.agent, session?.cwd, rootCwd]);

  function chooseMode(nextMode) {
    if (nextMode === "reply") {
      if (!canReply) return;
      setMode("reply");
      setReplySessionPath(session.path);
      setTargetAgent(session.agent);
      setTargetCwd(session.cwd || rootCwd || "");
      return;
    }
    setMode("new");
    setReplySessionPath(null);
  }

  function selectNewTarget(agent) {
    setMode("new");
    setReplySessionPath(null);
    setTargetAgent(agent);
    setTargetCwd(targetCwd.trim() || rootCwd || session?.cwd || "");
  }

  async function selectReplyTarget(nextSession) {
    setMode("reply");
    setReplySessionPath(nextSession.path);
    setTargetAgent(nextSession.agent);
    setTargetCwd(nextSession.cwd || rootCwd || "");
    await selectSession(nextSession, { openDetail: true });
  }

  async function submit(event) {
    event.preventDefault();
    const message = draft.trim();
    if (
      !message
      || disabled
      || submittingRef.current
      || useStore.getState().sendState === "sending"
    ) {
      return;
    }
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
    submittingRef.current = true;
    useStore.setState({ sendState: "sending", activityUpdatedAt: Date.now() });
    setDraft("");
    const pendingId = effectiveMode === "reply" && sessionId ? addPendingTranscriptMessage(payload.message) : null;
    (async () => {
      try {
        const result = await api("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        clearLocalSendErrors();
        if (result.task) {
          useStore.getState().upsertTask(result.task);
          useStore.getState().showToast(effectiveMode === "reply" ? "Reply queued" : "New session queued");
        } else {
          useStore.getState().showToast(effectiveMode === "reply" ? "Prompt sent" : "New session prompt sent");
        }
        void loadSessions({
          preserveSelection: true,
          silentLoading: true,
        }).catch((error) => {
          useStore.getState().showToast(error.message);
        });
        void loadTasks({ silent: true });
      } catch (error) {
        if (pendingId) {
          dropPendingMessage(pendingId, { withError: true });
        }
        useStore.getState().showToast(error.message);
      } finally {
        submittingRef.current = false;
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
        <Tabs.Root value={effectiveMode} onValueChange={chooseMode}>
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
