import Foundation

struct LaunchableAgent: Identifiable, Hashable {
  let id: String
  let label: String
  let iconName: String
}

enum AgentLaunchCommand {
  static let agents = [
    LaunchableAgent(id: "codex", label: "Codex", iconName: "terminal"),
    LaunchableAgent(id: "claude", label: "Claude Code", iconName: "sparkles"),
    LaunchableAgent(id: "qodercli", label: "QoderCLI", iconName: "q.square"),
  ]

  static func command(for agent: String, cwd: String) -> String {
    switch agent {
    case "codex":
      return "codex"
    case "claude":
      return "claude"
    case "qodercli":
      return "qodercli --cwd \(shellQuote(cwd))"
    default:
      return agent
    }
  }

  static func label(for agent: String) -> String {
    agents.first { $0.id == agent }?.label ?? agent
  }

  static func iconName(for agent: String) -> String {
    agents.first { $0.id == agent }?.iconName ?? "terminal"
  }

  private static func shellQuote(_ value: String) -> String {
    "'\(value.replacingOccurrences(of: "'", with: "'\"'\"'"))'"
  }
}
