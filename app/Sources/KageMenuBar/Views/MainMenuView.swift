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
    "\(session.agentLabel) · \(session.title)"
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
}
