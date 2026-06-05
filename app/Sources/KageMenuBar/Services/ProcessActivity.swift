import Foundation
import KageContracts

enum SpinnerVerbCatalog {
  static let defaults = [
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
    "Architecting"
  ]

  static func verb(at date: Date, interval: TimeInterval = 3.2) -> String {
    let tick = max(0, Int(date.timeIntervalSinceReferenceDate / interval))
    return defaults[tick % defaults.count]
  }
}

struct ProcessActivity: Equatable {
  enum Kind: Equatable {
    case idle
    case refreshing
    case searching
    case checkingHealth
    case runningAction
    case completed
    case failed
  }

  let kind: Kind
  let label: String
  let detail: String?
  let symbolName: String
  let isActive: Bool
  let rotatingLabels: [String]

  var isVisible: Bool {
    kind != .idle
  }

  static let idle = ProcessActivity(
    kind: .idle,
    label: "",
    detail: nil,
    symbolName: "circle",
    isActive: false,
    rotatingLabels: []
  )

  static func scanning(directory: String, includeSubdirectories: Bool, fullHistory: Bool) -> ProcessActivity {
    let scope = includeSubdirectories ? "including subdirectories" : "current directory only"
    let history = fullHistory ? "full history" : "recent history"
    return ProcessActivity(
      kind: .refreshing,
      label: "Scanning local sessions...",
      detail: "\(history), \(scope) in \(directory)",
      symbolName: "arrow.triangle.2.circlepath",
      isActive: true,
      rotatingLabels: [
        "Scanning Claude projects...",
        "Discovering Codex sessions...",
        "Checking QoderCLI transcripts...",
        "Reading QoderWork projects..."
      ]
    )
  }

  static func found(count: Int) -> ProcessActivity {
    ProcessActivity(
      kind: .completed,
      label: "Found \(count) session\(count == 1 ? "" : "s")",
      detail: "Session index is up to date.",
      symbolName: "checkmark.circle",
      isActive: false,
      rotatingLabels: []
    )
  }

  static func checkingHealth() -> ProcessActivity {
    ProcessActivity(
      kind: .checkingHealth,
      label: "Checking KAGE health...",
      detail: "Validating agent commands and session roots.",
      symbolName: "stethoscope",
      isActive: true,
      rotatingLabels: [
        "Checking CLI health...",
        "Validating session roots...",
        "Reading agent versions..."
      ]
    )
  }

  static func searching(query: String) -> ProcessActivity {
    ProcessActivity(
      kind: .searching,
      label: "Searching transcripts...",
      detail: "Looking for \"\(query)\" in the selected project.",
      symbolName: "magnifyingglass",
      isActive: true,
      rotatingLabels: [
        "Searching transcript text...",
        "Matching recent messages...",
        "Ranking sessions..."
      ]
    )
  }

  static func searchComplete(count: Int) -> ProcessActivity {
    ProcessActivity(
      kind: .completed,
      label: "Found \(count) match\(count == 1 ? "" : "es")",
      detail: "Transcript search is up to date.",
      symbolName: "checkmark.circle",
      isActive: false,
      rotatingLabels: []
    )
  }

  static func running(action: KageAction) -> ProcessActivity {
    ProcessActivity(
      kind: .runningAction,
      label: "\(action.label)...",
      detail: actionDetail(action),
      symbolName: actionSymbol(action),
      isActive: true,
      rotatingLabels: actionLabels(action)
    )
  }

  static func completedAction(_ action: KageAction) -> ProcessActivity {
    ProcessActivity(
      kind: .completed,
      label: "Completed \(action.label)",
      detail: nil,
      symbolName: "checkmark.circle",
      isActive: false,
      rotatingLabels: []
    )
  }

  static func failed(_ message: String) -> ProcessActivity {
    ProcessActivity(
      kind: .failed,
      label: "Process failed",
      detail: message,
      symbolName: "exclamationmark.triangle",
      isActive: false,
      rotatingLabels: []
    )
  }

  func displayLabel(at date: Date) -> String {
    guard isActive, !rotatingLabels.isEmpty else {
      return label
    }
    let tick = max(0, Int(date.timeIntervalSinceReferenceDate / 3.2))
    return rotatingLabels[tick % rotatingLabels.count]
  }

  private static func actionLabels(_ action: KageAction) -> [String] {
    switch action.type {
    case "resume":
      return ["Preparing resume command...", "Opening embedded terminal...", "Attaching session context..."]
    case "fork":
      return ["Forking session...", "Preparing new context...", "Waiting for CLI result..."]
    case "bridge":
      return ["Creating bridge request...", "Preparing target agent...", "Waiting for CLI result..."]
    case "replay":
      return ["Rendering replay story...", "Collecting transcript frames...", "Writing local HTML export..."]
    default:
      return ["Running \(action.label)...", "Waiting for CLI result...", "Refreshing session index..."]
    }
  }

  private static func actionDetail(_ action: KageAction) -> String? {
    if action.type == "bridge", let targetAgent = action.targetAgent {
      return "Sending context to \(agentLabel(targetAgent))."
    }
    if action.type == "fork", let targetAgent = action.targetAgent {
      return "Creating a new \(agentLabel(targetAgent)) session from this transcript."
    }
    if action.type == "replay" {
      return "Exporting a local story view from the selected transcript."
    }
    return action.command
  }

  private static func actionSymbol(_ action: KageAction) -> String {
    switch action.type {
    case "resume":
      return "play.circle"
    case "fork":
      return "square.on.square"
    case "bridge":
      return "arrow.left.arrow.right"
    case "replay":
      return "film"
    default:
      return "terminal"
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
    case "qoderwork":
      return "QoderWork"
    default:
      return agent
    }
  }
}
