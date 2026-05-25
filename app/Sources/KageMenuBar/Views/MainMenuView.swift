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

      SessionListView(sessions: visibleSessions)
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

      let actions = poller.actionsResponse?.actions ?? []
      if actions.isEmpty {
        Text("No actions available for this directory.")
          .font(.caption)
          .foregroundStyle(.secondary)
      } else {
        VStack(alignment: .leading, spacing: 4) {
          ForEach(actions) { action in
            Button {
              Task {
                await poller.runAction(action, appState: appState, notifications: notifications)
              }
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
}
