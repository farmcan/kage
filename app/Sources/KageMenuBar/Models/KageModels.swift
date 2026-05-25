import Foundation

struct SessionsResponse: Decodable {
  let mode: String
  let cwd: String
  let sessions: [AgentSession]
  let agents: [AgentGroup]
  let errors: [AgentError]
}

struct AgentSession: Decodable, Identifiable, Hashable {
  let agent: String
  let agentLabel: String
  let sessionId: String
  let title: String
  let updatedAt: String?
  let cwd: String
  let path: String
  let recentUserMessages: [String]

  var id: String {
    "\(agent):\(sessionId)"
  }
}

struct AgentGroup: Decodable, Identifiable {
  let agent: String
  let agentLabel: String
  let root: String
  let sessions: [AgentSession]

  var id: String {
    agent
  }
}

struct AgentError: Decodable, Identifiable {
  let agent: String
  let agentLabel: String?
  let error: String

  var id: String {
    "\(agent):\(error)"
  }
}

struct DoctorResult: Decodable {
  let mode: String
  let ok: Bool
  let cwd: String
  let kageVersion: String
  let agents: [DoctorAgent]
}

struct DoctorAgent: Decodable, Identifiable {
  let agent: String
  let label: String
  let command: String
  let installed: Bool
  let version: String?
  let commandError: String?
  let sessionRoot: SessionRoot
  let resumeCommand: String?
  let forkCommand: String?

  var id: String {
    agent
  }
}

struct SessionRoot: Decodable {
  let path: String
  let exists: Bool
  let readable: Bool
  let writable: Bool

  var isHealthy: Bool {
    exists && readable && writable
  }
}

struct ActionsResponse: Decodable {
  let mode: String
  let cwd: String
  let actions: [KageAction]
  let errors: [AgentError]
}

struct KageAction: Decodable, Identifiable, Hashable {
  let id: String
  let type: String
  let label: String
  let agent: String
  let targetAgent: String?
  let sessionId: String?
  let sessionPath: String?
  let command: String?
  let routeAlias: String?
  let cliArgs: [String]?
}

struct RunActionResponse: Decodable {
  let mode: String?
  let actionId: String?
  let ok: Bool?
}
