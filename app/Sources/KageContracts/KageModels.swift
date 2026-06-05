import Foundation

public struct SessionsResponse: Decodable, Sendable {
  public let mode: String
  public let cwd: String
  public let sessions: [AgentSession]
  public let agents: [AgentGroup]
  public let errors: [AgentError]

  public init(
    mode: String,
    cwd: String,
    sessions: [AgentSession],
    agents: [AgentGroup],
    errors: [AgentError]
  ) {
    self.mode = mode
    self.cwd = cwd
    self.sessions = sessions
    self.agents = agents
    self.errors = errors
  }
}

public struct SessionLineage: Decodable, Hashable, Sendable {
  public let forkType: String?
  public let forkTimestamp: String?
  public let parentAgent: String?
  public let parentSessionId: String?
  public let parentSessionPath: String?
  public let parentTitle: String?
  public let childAgent: String?
  public let childSessionId: String?
  public let childSessionPath: String?

  public init(
    forkType: String?,
    forkTimestamp: String?,
    parentAgent: String?,
    parentSessionId: String?,
    parentSessionPath: String?,
    parentTitle: String?,
    childAgent: String?,
    childSessionId: String?,
    childSessionPath: String?
  ) {
    self.forkType = forkType
    self.forkTimestamp = forkTimestamp
    self.parentAgent = parentAgent
    self.parentSessionId = parentSessionId
    self.parentSessionPath = parentSessionPath
    self.parentTitle = parentTitle
    self.childAgent = childAgent
    self.childSessionId = childSessionId
    self.childSessionPath = childSessionPath
  }
}

public struct AgentSession: Decodable, Identifiable, Hashable, Sendable {
  public let agent: String
  public let agentLabel: String
  public let sessionId: String
  public let title: String
  public let shortTitle: String?
  public let updatedAt: String?
  public let cwd: String
  public let path: String
  public let recentUserMessages: [String]
  public let lineage: SessionLineage?

  public init(
    agent: String,
    agentLabel: String,
    sessionId: String,
    title: String,
    shortTitle: String?,
    updatedAt: String?,
    cwd: String,
    path: String,
    recentUserMessages: [String],
    lineage: SessionLineage? = nil
  ) {
    self.agent = agent
    self.agentLabel = agentLabel
    self.sessionId = sessionId
    self.title = title
    self.shortTitle = shortTitle
    self.updatedAt = updatedAt
    self.cwd = cwd
    self.path = path
    self.recentUserMessages = recentUserMessages
    self.lineage = lineage
  }

  public var displayTitle: String {
    shortTitle ?? title
  }

  public var id: String {
    "\(agent):\(sessionId)"
  }
}

public struct AgentGroup: Decodable, Identifiable, Sendable {
  public let agent: String
  public let agentLabel: String
  public let root: String
  public let sessions: [AgentSession]

  public init(agent: String, agentLabel: String, root: String, sessions: [AgentSession]) {
    self.agent = agent
    self.agentLabel = agentLabel
    self.root = root
    self.sessions = sessions
  }

  public var id: String {
    agent
  }
}

public struct AgentError: Decodable, Identifiable, Sendable {
  public let agent: String
  public let agentLabel: String?
  public let error: String

  public init(agent: String, agentLabel: String?, error: String) {
    self.agent = agent
    self.agentLabel = agentLabel
    self.error = error
  }

  public var id: String {
    "\(agent):\(error)"
  }
}

public struct DoctorResult: Decodable, Sendable {
  public let mode: String
  public let ok: Bool
  public let cwd: String
  public let kageVersion: String
  public let agents: [DoctorAgent]
}

public struct DoctorAgent: Decodable, Identifiable, Sendable {
  public let agent: String
  public let label: String
  public let command: String?
  public let installed: Bool
  public let version: String?
  public let commandRequired: Bool?
  public let commandError: String?
  public let sessionRoot: SessionRoot
  public let sessionRootRequired: Bool?
  public let resumeCommand: String?
  public let forkCommand: String?

  public var id: String {
    agent
  }

  public var isReady: Bool {
    (!isCommandRequired || installed) && (!isSessionRootRequired || sessionRoot.isHealthy)
  }

  public var isCommandRequired: Bool {
    commandRequired ?? true
  }

  public var isSessionRootRequired: Bool {
    sessionRootRequired ?? true
  }
}

public struct SessionRoot: Decodable, Sendable {
  public let path: String
  public let exists: Bool
  public let readable: Bool
  public let writable: Bool

  public var isHealthy: Bool {
    exists && readable && writable
  }
}

public struct ActionsResponse: Decodable, Sendable {
  public let mode: String
  public let cwd: String
  public let actions: [KageAction]
  public let errors: [AgentError]

  public init(mode: String, cwd: String, actions: [KageAction], errors: [AgentError]) {
    self.mode = mode
    self.cwd = cwd
    self.actions = actions
    self.errors = errors
  }
}

public struct DesktopStateResponse: Decodable, Sendable {
  public let mode: String
  public let cwd: String
  public let sessions: [AgentSession]
  public let agents: [AgentGroup]
  public let actions: [KageAction]
  public let errors: [AgentError]

  public var sessionsResponse: SessionsResponse {
    SessionsResponse(
      mode: "sessions",
      cwd: cwd,
      sessions: sessions,
      agents: agents,
      errors: errors
    )
  }

  public var actionsResponse: ActionsResponse {
    ActionsResponse(
      mode: "actions",
      cwd: cwd,
      actions: actions,
      errors: errors
    )
  }
}

public struct SearchResponse: Decodable, Sendable {
  public let mode: String
  public let query: String?
  public let filters: SearchFilters
  public let results: [SearchSessionResult]
  public let agents: [SearchAgentSummary]

  public init(
    mode: String,
    query: String?,
    filters: SearchFilters,
    results: [SearchSessionResult],
    agents: [SearchAgentSummary]
  ) {
    self.mode = mode
    self.query = query
    self.filters = filters
    self.results = results
    self.agents = agents
  }
}

public struct SearchFilters: Decodable, Sendable {
  public let agent: String?
  public let since: String?
  public let until: String?
  public let project: String?
  public let includeSubdirs: Bool
  public let limit: Int

  public init(agent: String?, since: String?, until: String?, project: String?, includeSubdirs: Bool, limit: Int) {
    self.agent = agent
    self.since = since
    self.until = until
    self.project = project
    self.includeSubdirs = includeSubdirs
    self.limit = limit
  }
}

public struct SearchAgentSummary: Decodable, Identifiable, Sendable {
  public let agent: String
  public let root: String
  public let resultCount: Int
  public let error: String?

  public init(agent: String, root: String, resultCount: Int, error: String?) {
    self.agent = agent
    self.root = root
    self.resultCount = resultCount
    self.error = error
  }

  public var id: String {
    agent
  }
}

public struct SearchSessionResult: Decodable, Identifiable, Hashable, Sendable {
  public let agent: String
  public let agentLabel: String
  public let sessionId: String
  public let title: String
  public let shortTitle: String?
  public let updatedAt: String?
  public let cwd: String
  public let path: String
  public let recentUserMessages: [String]
  public let match: SearchMatch?

  public init(
    agent: String,
    agentLabel: String,
    sessionId: String,
    title: String,
    shortTitle: String?,
    updatedAt: String?,
    cwd: String,
    path: String,
    recentUserMessages: [String],
    match: SearchMatch?
  ) {
    self.agent = agent
    self.agentLabel = agentLabel
    self.sessionId = sessionId
    self.title = title
    self.shortTitle = shortTitle
    self.updatedAt = updatedAt
    self.cwd = cwd
    self.path = path
    self.recentUserMessages = recentUserMessages
    self.match = match
  }

  public var displayTitle: String {
    shortTitle ?? title
  }

  public var id: String {
    "\(agent):\(sessionId)"
  }

  public var agentSession: AgentSession {
    AgentSession(
      agent: agent,
      agentLabel: agentLabel,
      sessionId: sessionId,
      title: title,
      shortTitle: shortTitle,
      updatedAt: updatedAt,
      cwd: cwd,
      path: path,
      recentUserMessages: recentUserMessages
    )
  }
}

public struct SearchMatch: Decodable, Hashable, Sendable {
  public let field: String
  public let text: String

  public init(field: String, text: String) {
    self.field = field
    self.text = text
  }
}

public struct KageAction: Decodable, Identifiable, Hashable, Sendable {
  public let id: String
  public let type: String
  public let label: String
  public let agent: String
  public let targetAgent: String?
  public let sessionId: String?
  public let sessionPath: String?
  public let command: String?
  public let routeAlias: String?
  public let cliArgs: [String]?
  public let isLatest: Bool?

  public init(
    id: String,
    type: String,
    label: String,
    agent: String,
    targetAgent: String? = nil,
    sessionId: String? = nil,
    sessionPath: String? = nil,
    command: String? = nil,
    routeAlias: String? = nil,
    cliArgs: [String]? = nil,
    isLatest: Bool? = nil
  ) {
    self.id = id
    self.type = type
    self.label = label
    self.agent = agent
    self.targetAgent = targetAgent
    self.sessionId = sessionId
    self.sessionPath = sessionPath
    self.command = command
    self.routeAlias = routeAlias
    self.cliArgs = cliArgs
    self.isLatest = isLatest
  }
}

public struct RunActionResponse: Decodable, Sendable {
  public let mode: String?
  public let actionId: String?
  public let ok: Bool?
  public let action: KageAction?
  public let sourceAgent: String?
  public let targetAgent: String?
  public let sessionId: String?
  public let sessionPath: String?
  public let resumeCommand: String?
  public let outputPath: String?
  public let sidecarPath: String?
  public let paths: [String]?
  public let stdout: String?
  public let stderr: String?

  public init(
    mode: String? = nil,
    actionId: String? = nil,
    ok: Bool? = nil,
    action: KageAction? = nil,
    sourceAgent: String? = nil,
    targetAgent: String? = nil,
    sessionId: String? = nil,
    sessionPath: String? = nil,
    resumeCommand: String? = nil,
    outputPath: String? = nil,
    sidecarPath: String? = nil,
    paths: [String]? = nil,
    stdout: String? = nil,
    stderr: String? = nil
  ) {
    self.mode = mode
    self.actionId = actionId
    self.ok = ok
    self.action = action
    self.sourceAgent = sourceAgent
    self.targetAgent = targetAgent
    self.sessionId = sessionId
    self.sessionPath = sessionPath
    self.resumeCommand = resumeCommand
    self.outputPath = outputPath
    self.sidecarPath = sidecarPath
    self.paths = paths
    self.stdout = stdout
    self.stderr = stderr
  }
}
