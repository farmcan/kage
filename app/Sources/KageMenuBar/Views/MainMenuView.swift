import AppKit
import KageContracts
import SwiftUI

struct MainMenuView: View {
  @Environment(\.openSettings) private var openSettings
  @EnvironmentObject private var appState: AppState
  @EnvironmentObject private var poller: SessionPoller
  @EnvironmentObject private var notifications: NotificationManager

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      WatchedDirectoryHeader()

      if let launchAtLoginError = appState.launchAtLoginError {
        WarningBanner(message: "Launch at login: \(launchAtLoginError)")
      }

      AgentTabBar(agents: poller.sessionsResponse?.agents ?? [])

      Divider()

      SessionListView(
        sessions: visibleSessions,
        actionsBySession: nonBridgeActionsBySession,
        onRunAction: runAction
      )
        .frame(maxHeight: .infinity)

      Divider()

      actionsSection

      FooterView()
    }
    .padding(14)
    .onAppear {
      Task {
        await poller.refresh(appState: appState, notifications: notifications)
      }
    }
  }

  private var visibleSessions: [AgentSession] {
    let sessions = poller.sessionsResponse?.sessions ?? []
    guard appState.selectedAgent != "all" else {
      return sessions
    }
    return sessions.filter { $0.agent == appState.selectedAgent }
  }

  private var actionsBySession: [String: [KageAction]] {
    Dictionary(
      grouping: poller.actionsResponse?.actions.filter { $0.sessionId != nil } ?? [],
      by: { action in "\(action.agent):\(action.sessionId ?? "")" }
    )
  }

  private var nonBridgeActionsBySession: [String: [KageAction]] {
    Dictionary(
      uniqueKeysWithValues: actionsBySession.map { key, actions in
        (key, actions.filter { $0.type != "bridge" })
      }
    )
  }

  private var bridgeActionsBySession: [String: [KageAction]] {
    Dictionary(
      uniqueKeysWithValues: actionsBySession.map { key, actions in
        (key, actions.filter { $0.type == "bridge" })
      }
    )
  }

  private var actionsSection: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("Actions")
          .font(.headline)
        Spacer()
        Button {
          Task {
            await poller.refresh(appState: appState, notifications: notifications)
          }
        } label: {
          Label("Refresh", systemImage: "arrow.clockwise")
        }
        .buttonStyle(.borderless)
        .disabled(poller.isRefreshing)

        Button {
          let popoverWindow = NSApp.keyWindow
          openSettings()
          NSApp.activate(ignoringOtherApps: true)
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            popoverWindow?.close()
            NSApp.activate(ignoringOtherApps: true)
          }
        } label: {
          Label("Settings", systemImage: "gearshape")
        }
      }

      if let actionResult = poller.actionResult, shouldShowResultCard(actionResult) {
        ActionResultCard(
          result: actionResult,
          cwd: appState.watchedDirectory,
          onDismiss: {
            poller.clearActionResult()
          }
        )
      }

      let actions = quickActions
      if actions.isEmpty && !hasBridgeActions {
        Text("No actions available for this directory.")
          .font(.caption)
          .foregroundStyle(.secondary)
      } else {
        VStack(alignment: .leading, spacing: 4) {
          if hasBridgeActions {
            Menu {
              ForEach(visibleSessionsWithBridgeActions) { session in
                Menu(sessionMenuLabel(session)) {
                  ForEach(bridgeActionsBySession[session.id] ?? []) { action in
                    Button {
                      runAction(action)
                    } label: {
                      Label("To \(agentLabel(action.targetAgent))", systemImage: actionIcon(action))
                    }
                  }
                }
              }
            } label: {
              Label("Bridge", systemImage: "arrow.left.arrow.right")
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.borderless)
          }

          ForEach(actions) { action in
            Button {
              runAction(action)
            } label: {
              Label(action.label, systemImage: actionIcon(action))
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.borderless)
          }
        }
      }

      if let actionMessage = poller.actionMessage {
        Text(actionMessage)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
    }
  }

  private var quickActions: [KageAction] {
    (poller.actionsResponse?.actions ?? []).filter { action in
      action.type != "bridge" && (action.isLatest ?? true)
    }
  }

  private var hasBridgeActions: Bool {
    !visibleSessionsWithBridgeActions.isEmpty
  }

  private var visibleSessionsWithBridgeActions: [AgentSession] {
    visibleSessions.filter { !(bridgeActionsBySession[$0.id] ?? []).isEmpty }
  }

  private func runAction(_ action: KageAction) {
    Task {
      await poller.runAction(action, appState: appState, notifications: notifications)
    }
  }

  private func actionIcon(_ action: KageAction) -> String {
    switch action.type {
    case "resume":
      return "play.circle"
    case "bridge":
      return "arrow.left.arrow.right"
    case "replay":
      return "film"
    default:
      return "terminal"
    }
  }

  private func sessionMenuLabel(_ session: AgentSession) -> String {
    "\(session.agentLabel) · \(session.displayTitle)"
  }

  private func agentLabel(_ agent: String?) -> String {
    switch agent {
    case "claude":
      return "Claude Code"
    case "codex":
      return "Codex"
    case "qodercli":
      return "QoderCLI"
    default:
      return agent ?? "Target"
    }
  }

  private func shouldShowResultCard(_ result: RunActionResponse) -> Bool {
    result.ok == true && (result.resumeCommand != nil || result.outputPath != nil || result.paths?.isEmpty == false)
  }
}

private struct WarningBanner: View {
  let message: String

  var body: some View {
    Label(message, systemImage: "exclamationmark.triangle")
      .font(.caption)
      .foregroundStyle(.orange)
      .lineLimit(3)
      .padding(8)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        RoundedRectangle(cornerRadius: 6)
          .fill(Color.orange.opacity(0.08))
      )
  }
}

private struct ActionResultCard: View {
  let result: RunActionResponse
  let cwd: String
  let onDismiss: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline) {
        Label(title, systemImage: "checkmark.circle")
          .font(.caption)
          .fontWeight(.medium)
          .foregroundStyle(.green)
        Spacer()
        Button {
          onDismiss()
        } label: {
          Image(systemName: "xmark")
            .imageScale(.small)
            .accessibilityLabel("Dismiss")
        }
        .buttonStyle(.borderless)
      }

      if let resumeCommand = result.resumeCommand {
        Text(resumeCommand)
          .font(.caption2.monospaced())
          .foregroundStyle(.secondary)
          .lineLimit(2)
          .truncationMode(.middle)
          .textSelection(.enabled)
      }

      HStack(spacing: 8) {
        if result.resumeCommand != nil {
          Button {
            copyResumeCommand()
          } label: {
            Label("Copy", systemImage: "doc.on.doc")
          }
          .controlSize(.small)

          Button {
            openResumeCommand()
          } label: {
            Label("Open", systemImage: "terminal")
          }
          .controlSize(.small)
        }

        if let filePath = revealPath {
          Button {
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: filePath)])
          } label: {
            Label("Show", systemImage: "folder")
          }
          .controlSize(.small)
        }
      }
    }
    .padding(10)
    .background(
      RoundedRectangle(cornerRadius: 6)
        .fill(Color.green.opacity(0.08))
    )
  }

  private var title: String {
    if result.action?.type == "bridge" {
      return "Created \(agentLabel(result.targetAgent)) session"
    }
    if result.action?.type == "resume" {
      return "Ready to resume \(agentLabel(result.targetAgent ?? result.sourceAgent))"
    }
    return "Action completed"
  }

  private var revealPath: String? {
    result.outputPath ?? result.paths?.first
  }

  private func copyResumeCommand() {
    guard let resumeCommand = result.resumeCommand else {
      return
    }
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(resumeCommand, forType: .string)
  }

  private func openResumeCommand() {
    guard let resumeCommand = result.resumeCommand else {
      return
    }
    do {
      let scriptPath = try writeTerminalCommand(resumeCommand)
      NSWorkspace.shared.open(scriptPath)
    } catch {
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(resumeCommand, forType: .string)
    }
  }

  private func writeTerminalCommand(_ resumeCommand: String) throws -> URL {
    cleanupOldTerminalCommands()
    let fileName = "kage-resume-\(UUID().uuidString).command"
    let fileURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(fileName)
    let script = """
    #!/bin/zsh
    cd \(shellQuote(cwd))
    \(resumeCommand)
    rm -f \(shellQuote(fileURL.path))

    """
    try script.write(to: fileURL, atomically: true, encoding: .utf8)
    try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: fileURL.path)
    return fileURL
  }

  private func cleanupOldTerminalCommands() {
    let tempURL = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
    guard let files = try? FileManager.default.contentsOfDirectory(
      at: tempURL,
      includingPropertiesForKeys: [.contentModificationDateKey],
      options: [.skipsHiddenFiles]
    ) else {
      return
    }

    let cutoff = Date().addingTimeInterval(-24 * 60 * 60)
    for file in files where file.lastPathComponent.hasPrefix("kage-resume-") && file.pathExtension == "command" {
      let modifiedAt = (try? file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
      if modifiedAt < cutoff {
        try? FileManager.default.removeItem(at: file)
      }
    }
  }

  private func shellQuote(_ value: String) -> String {
    "'\(value.replacingOccurrences(of: "'", with: "'\"'\"'"))'"
  }

  private func agentLabel(_ agent: String?) -> String {
    switch agent {
    case "claude":
      return "Claude Code"
    case "codex":
      return "Codex"
    case "qodercli":
      return "QoderCLI"
    default:
      return agent ?? "target"
    }
  }
}
