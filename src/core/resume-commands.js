export function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:@%+=,-]+$/u.test(text)) {
    return text;
  }
  return `'${text.replace(/'/gu, "'\\''")}'`;
}

export function buildClaudeResumeCommand(sessionId, cwd, extraArgs = []) {
  const command = ["claude", "--resume", shellQuote(sessionId), ...extraArgs.map(shellQuote)].join(" ");
  return cwd ? `cd ${shellQuote(cwd)} && ${command}` : command;
}

export function buildCodexResumeCommand(sessionId) {
  return `codex resume ${shellQuote(sessionId)}`;
}

export function buildQoderResumeCommand(sessionId, cwd) {
  return `qodercli --cwd ${shellQuote(cwd)} --resume ${shellQuote(sessionId)}`;
}
