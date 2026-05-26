export const SESSION_TITLE_MAX_LENGTH = 240;
export const SHORT_TITLE_MAX_LENGTH = 60;
export const RECENT_USER_MESSAGE_MAX_LENGTH = 160;

const ignoredUserTagNames = [
  "environment_context",
  "turn_aborted",
  "task-notification",
  "local-command-caveat",
  "local-command-stdout",
  "local-command-stderr",
  "command-name",
  "command-message",
  "command-args",
];
const ignoredUserTagAlternatives = ignoredUserTagNames.join("|");
const ignoredTaggedBlockPattern = new RegExp(
  `<(${ignoredUserTagAlternatives})\\b[^>]*>[\\s\\S]*?<\\/\\1>`,
  "giu",
);
const ignoredTagPattern = new RegExp(`<\\/?(?:${ignoredUserTagAlternatives})\\b[^>]*>`, "giu");

export function sanitizeSessionText(value) {
  return String(value ?? "")
    .replace(ignoredTaggedBlockPattern, " ")
    .replace(ignoredTagPattern, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function compactSessionText(
  value,
  { maxLength = Number.POSITIVE_INFINITY, fallback = "(untitled)" } = {},
) {
  const normalized = sanitizeSessionText(value);
  if (!normalized) {
    return fallback;
  }
  if (!Number.isFinite(maxLength) || normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function isIgnorableUserMessage(text) {
  return sanitizeSessionText(text).length === 0;
}

export function getRealUserMessages(session) {
  return session.messages.filter(
    (message) => message.role === "user" && message.text.trim() && !isIgnorableUserMessage(message.text),
  );
}

export function getSessionTitle(session, { maxLength = SESSION_TITLE_MAX_LENGTH } = {}) {
  const explicitTitle = sanitizeSessionText(session.title);
  if (explicitTitle) {
    return compactSessionText(explicitTitle, { maxLength });
  }
  const firstUserMessage = getRealUserMessages(session)[0];
  return compactSessionText(firstUserMessage?.text, { maxLength });
}

export function getShortSessionTitle(session) {
  return getSessionTitle(session, { maxLength: SHORT_TITLE_MAX_LENGTH });
}

export function getRecentUserMessages(
  session,
  { count = 3, maxLength = RECENT_USER_MESSAGE_MAX_LENGTH } = {},
) {
  return getRealUserMessages(session)
    .slice(-count)
    .reverse()
    .map((message) => compactSessionText(message.text, { maxLength, fallback: "" }))
    .filter(Boolean);
}
