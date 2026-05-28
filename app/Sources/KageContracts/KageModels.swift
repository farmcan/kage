import Foundation

public struct SessionsResponse: Decodable, Sendable {
  public let mode: String
  public let cwd: String
  public let sessions: [AgentSession]
  public let agents: [AgentGroup]
  public let errors: [AgentError]
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

  public init(
    agent: String,
    agentLabel: String,
    sessionId: String,
    title: String,
    shortTitle: String?,
    updatedAt: String?,
    cwd: String,
    path: String,
    recentUserMessages: [String]
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

  public var id: String {
    agent
  }
}

public struct AgentError: Decodable, Identifiable, Sendable {
  public let agent: String
  public let agentLabel: String?
  public let error: String

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
  public let command: String
  public let installed: Bool
  public let version: String?
  public let commandError: String?
  public let sessionRoot: SessionRoot
  public let resumeCommand: String?
  public let forkCommand: String?

  public var id: String {
    agent
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
}

public struct SearchResponse: Decodable, Sendable {
  public let mode: String
  public let query: String?
  public let filters: SearchFilters
  public let results: [SearchSessionResult]
  public let agents: [SearchAgentSummary]
}

public struct SearchFilters: Decodable, Sendable {
  public let agent: String?
  public let since: String?
  public let until: String?
  public let project: String?
  public let includeSubdirs: Bool
  public let limit: Int
}

public struct SearchAgentSummary: Decodable, Identifiable, Sendable {
  public let agent: String
  public let root: String
  public let resultCount: Int
  public let error: String?

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
}
