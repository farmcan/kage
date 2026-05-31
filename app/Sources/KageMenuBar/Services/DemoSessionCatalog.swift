import Foundation
import KageContracts

enum DemoSessionCatalog {
  static let root = "kage-demo://sessions"
  static let displayRoot = "/Users/demo/wrksp"
  static let defaultProjectPath = "/Users/demo/wrksp/kage"

  static var sessionsResponse: SessionsResponse {
    let sessions = demoSessions
    let grouped = Dictionary(grouping: sessions, by: \.agent)
    let agents = agentOrder.compactMap { agent -> AgentGroup? in
      guard let sessions = grouped[agent] else {
        return nil
      }
      return AgentGroup(
        agent: agent,
        agentLabel: agentLabel(agent),
        root: "\(root)/\(agent)",
        sessions: sessions.sorted(by: isNewer)
      )
    }

    return SessionsResponse(
      mode: "demo-sessions",
      cwd: defaultProjectPath,
      sessions: sessions.sorted(by: isNewer),
      agents: agents,
      errors: []
    )
  }

  static var actionsResponse: ActionsResponse {
    ActionsResponse(
      mode: "demo-actions",
      cwd: defaultProjectPath,
      actions: demoSessions.flatMap(actions),
      errors: []
    )
  }

  static func searchResponse(query: String, selectedAgent: String, includeSubdirectories: Bool) -> SearchResponse {
    let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
    let agentFilter = selectedAgent == "all" ? nil : selectedAgent
    let filteredSessions = demoSessions.filter { session in
      guard agentFilter == nil || session.agent == agentFilter else {
        return false
      }
      return includeSubdirectories || session.cwd == defaultProjectPath
    }
    let results = filteredSessions.compactMap { session -> SearchSessionResult? in
      guard let match = match(for: session, query: trimmedQuery) else {
        return nil
      }
      return SearchSessionResult(
        agent: session.agent,
        agentLabel: session.agentLabel,
        sessionId: session.sessionId,
        title: session.title,
        shortTitle: session.shortTitle,
        updatedAt: session.updatedAt,
        cwd: session.cwd,
        path: session.path,
        recentUserMessages: session.recentUserMessages,
        match: match
      )
    }

    let groupedResults = Dictionary(grouping: results, by: \.agent)
    let summaries = agentOrder.compactMap { agent -> SearchAgentSummary? in
      guard agentFilter == nil || agentFilter == agent else {
        return nil
      }
      return SearchAgentSummary(
        agent: agent,
        root: "\(root)/\(agent)",
        resultCount: groupedResults[agent]?.count ?? 0,
        error: nil
      )
    }

    return SearchResponse(
      mode: "demo-search",
      query: trimmedQuery,
      filters: SearchFilters(
        agent: agentFilter,
        since: nil,
        until: nil,
        project: defaultProjectPath,
        includeSubdirs: includeSubdirectories,
        limit: 50
      ),
      results: results.sorted { lhs, rhs in
        let lhsDate = parseDemoDate(lhs.updatedAt) ?? .distantPast
        let rhsDate = parseDemoDate(rhs.updatedAt) ?? .distantPast
        return lhsDate > rhsDate
      },
      agents: summaries
    )
  }

  static func result(for action: KageAction) -> RunActionResponse {
    let targetAgent = action.targetAgent ?? action.agent
    let resumeCommand = previewResumeCommand(for: action)
    return RunActionResponse(
      mode: "demo-run-action",
      actionId: action.id,
      ok: true,
      action: action,
      sourceAgent: action.agent,
      targetAgent: targetAgent,
      sessionId: action.sessionId,
      sessionPath: action.sessionPath,
      resumeCommand: action.type == "replay" ? nil : resumeCommand,
      outputPath: nil,
      sidecarPath: nil,
      paths: nil,
      stdout: "KAGE demo mode: no local transcript files were read or written.",
      stderr: ""
    )
  }

  static func terminalCommand(for action: KageAction) -> String {
    let lines = [
      "KAGE demo mode",
      "This is a safe preview. No real agent, transcript, or project file is touched.",
      "Real workflow would run: \(previewResumeCommand(for: action))",
      "Try KAGE on your own sessions with: kage sessions --include-subdirs",
    ]
    return lines.map { "echo \(shellQuoted($0))" }.joined(separator: "\n")
  }

  static func terminalCommand(for result: RunActionResponse) -> String? {
    guard let action = result.action else {
      return nil
    }
    return terminalCommand(for: action)
  }

  static func isDemoPath(_ path: String?) -> Bool {
    path?.hasPrefix(root) == true
  }

  static func isDemoAction(_ action: KageAction) -> Bool {
    isDemoPath(action.sessionPath) || action.id.hasPrefix("demo:")
  }

  private static let agentOrder = ["codex", "claude", "qodercli"]

  private static let demoSessions = [
    AgentSession(
      agent: "codex",
      agentLabel: "Codex",
      sessionId: "demo-codex-terminal-layout",
      title: "Make the embedded terminal feel like the main workspace",
      shortTitle: "Embedded terminal workspace",
      updatedAt: "2026-05-31T13:18:00.000Z",
      cwd: defaultProjectPath,
      path: "\(root)/codex/demo-codex-terminal-layout.jsonl",
      recentUserMessages: [
        "Make the embedded terminal large enough for real Codex work, not a tiny preview.",
        "Keep bridge and fork behind an actions menu so the main screen stays focused."
      ]
    ),
    AgentSession(
      agent: "claude",
      agentLabel: "Claude Code",
      sessionId: "demo-claude-product-positioning",
      title: "Review KAGE positioning and README launch copy",
      shortTitle: "README and launch copy",
      updatedAt: "2026-05-31T12:42:00.000Z",
      cwd: defaultProjectPath,
      path: "\(root)/claude/demo-claude-product-positioning.jsonl",
      recentUserMessages: [
        "Explain why KAGE is useful for developers who switch between Codex and Claude Code.",
        "Turn the README into something a first-time GitHub visitor can understand quickly."
      ]
    ),
    AgentSession(
      agent: "qodercli",
      agentLabel: "QoderCLI",
      sessionId: "demo-qoder-inventory-audit",
      title: "Audit cross-agent inventory for a mobile companion plan",
      shortTitle: "Inventory audit",
      updatedAt: "2026-05-31T11:55:00.000Z",
      cwd: "\(displayRoot)/agent-memory-lab",
      path: "\(root)/qodercli/demo-qoder-inventory-audit.jsonl",
      recentUserMessages: [
        "Group sessions by project directory first, then make agent identity obvious inside each group.",
        "Sketch the smallest mobile companion that can observe sessions without uploading full transcripts."
      ]
    ),
  ]

  private static func actions(for session: AgentSession) -> [KageAction] {
    let targets = agentOrder.filter { $0 != session.agent }
    var actions = [
      KageAction(
        id: "demo:resume:\(session.agent):\(session.sessionId)",
        type: "resume",
        label: "Preview continuing in \(session.agentLabel)",
        agent: session.agent,
        targetAgent: session.agent,
        sessionId: session.sessionId,
        sessionPath: session.path,
        command: previewResumeCommand(agent: session.agent, sessionId: session.sessionId),
        isLatest: true
      ),
      KageAction(
        id: "demo:fork:\(session.agent):\(session.sessionId)",
        type: "fork",
        label: "Preview forking into a new \(session.agentLabel) session",
        agent: session.agent,
        targetAgent: session.agent,
        sessionId: session.sessionId,
        sessionPath: session.path,
        routeAlias: "\(aliasPrefix(session.agent))2\(aliasPrefix(session.agent))",
        cliArgs: ["demo"],
        isLatest: true
      ),
      KageAction(
        id: "demo:replay:\(session.agent):\(session.sessionId)",
        type: "replay",
        label: "Preview replay story export",
        agent: session.agent,
        sessionId: session.sessionId,
        sessionPath: session.path,
        routeAlias: "\(aliasPrefix(session.agent))2v",
        cliArgs: ["demo"],
        isLatest: true
      ),
    ]

    actions.append(contentsOf: targets.map { target in
      KageAction(
        id: "demo:bridge:\(session.agent):\(target):\(session.sessionId)",
        type: "bridge",
        label: "Preview bridge to \(agentLabel(target))",
        agent: session.agent,
        targetAgent: target,
        sessionId: session.sessionId,
        sessionPath: session.path,
        routeAlias: "\(aliasPrefix(session.agent))2\(aliasPrefix(target))",
        cliArgs: ["demo"],
        isLatest: false
      )
    })
    return actions
  }

  private static func match(for session: AgentSession, query: String) -> SearchMatch? {
    guard !query.isEmpty else {
      return nil
    }
    let fields = [
      ("title", session.displayTitle),
      ("cwd", session.cwd),
    ] + session.recentUserMessages.enumerated().map { index, message in
      ("message:user:\(index + 1)", message)
    }

    return fields.compactMap { field, text -> SearchMatch? in
      guard text.localizedCaseInsensitiveContains(query) else {
        return nil
      }
      return SearchMatch(field: field, text: text)
    }.first
  }

  private static func previewResumeCommand(for action: KageAction) -> String {
    previewResumeCommand(agent: action.targetAgent ?? action.agent, sessionId: action.sessionId ?? "demo-session")
  }

  private static func previewResumeCommand(agent: String, sessionId: String) -> String {
    switch agent {
    case "claude":
      return "claude --resume \(sessionId)"
    case "codex":
      return "codex resume \(sessionId)"
    case "qodercli":
      return "qodercli resume \(sessionId)"
    default:
      return "\(agent) resume \(sessionId)"
    }
  }

  private static func aliasPrefix(_ agent: String) -> String {
    switch agent {
    case "claude":
      return "c"
    case "codex":
      return "x"
    case "qodercli":
      return "q"
    default:
      return agent.prefix(1).lowercased()
    }
  }

  private static func agentLabel(_ agent: String) -> String {
    switch agent {
    case "claude":
      return "Claude Code"
    case "codex":
      return "Codex"
    case "qodercli":
      return "QoderCLI"
    default:
      return agent
    }
  }

  private static func isNewer(_ lhs: AgentSession, _ rhs: AgentSession) -> Bool {
    let lhsDate = parseDemoDate(lhs.updatedAt) ?? .distantPast
    let rhsDate = parseDemoDate(rhs.updatedAt) ?? .distantPast
    return lhsDate > rhsDate
  }

  private static func parseDemoDate(_ value: String?) -> Date? {
    guard let value else {
      return nil
    }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: value)
  }

  private static func shellQuoted(_ value: String) -> String {
    "'\(value.replacingOccurrences(of: "'", with: "'\\''"))'"
  }
}
