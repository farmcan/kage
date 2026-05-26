import KageContracts
import SwiftUI

struct SettingsView: View {
  @EnvironmentObject private var appState: AppState
  @EnvironmentObject private var poller: SessionPoller
  @EnvironmentObject private var notifications: NotificationManager

  var body: some View {
    Form {
      Section("Directory") {
        HStack(alignment: .top, spacing: 12) {
          DirectoryPathSummary(path: appState.watchedDirectory)

          HStack(spacing: 8) {
            Button {
              appState.chooseWatchedDirectory()
              refresh()
            } label: {
              Label("Choose", systemImage: "folder")
            }
            Button {
              appState.useHomeDirectory()
              refresh()
            } label: {
              Label("Home", systemImage: "house")
            }
          }
          .controlSize(.small)
        }

        Toggle(
          "Include subdirectories",
          isOn: Binding(
            get: { appState.includeSubdirectories },
            set: { enabled in
              appState.includeSubdirectories = enabled
              refresh()
            }
          )
        )

        VStack(alignment: .leading, spacing: 8) {
          Text("Recent")
            .font(.caption)
            .foregroundStyle(.secondary)

          ForEach(appState.watchedDirectoryHistory, id: \.self) { directory in
            HStack(alignment: .center, spacing: 12) {
              DirectoryPathSummary(
                path: directory,
                nameFont: .caption,
                pathFont: .caption2
              )

              if isCurrentDirectory(directory) {
                Text("Current")
                  .font(.caption)
                  .foregroundStyle(.secondary)
              } else {
                Button {
                  appState.useWatchedDirectory(directory)
                  refresh()
                } label: {
                  Label("Use", systemImage: "arrow.turn.down.right")
                }
                .controlSize(.small)
              }
            }
          }
        }
      }

      Section("Refresh") {
        Stepper(value: $appState.refreshIntervalSec, in: 15...3600, step: 15) {
          Text("\(Int(appState.refreshIntervalSec)) seconds")
        }
        Toggle("Notifications", isOn: $appState.notificationsEnabled)
        Toggle(
          "Launch at login",
          isOn: Binding(
            get: { appState.launchAtLogin },
            set: { appState.setLaunchAtLogin($0) }
          )
        )
        if let launchAtLoginError = appState.launchAtLoginError {
          SettingsWarningText(launchAtLoginError)
        }
        if let notificationError = notifications.lastError {
          SettingsWarningText(notificationError)
        }
      }

      Section("Doctor") {
        if let doctor = poller.doctorResult {
          Text("KAGE \(doctor.kageVersion)")
          ForEach(doctor.agents) { agent in
            VStack(alignment: .leading, spacing: 4) {
              HStack {
                Image(systemName: agent.installed && agent.sessionRoot.isHealthy ? "checkmark.circle" : "exclamationmark.triangle")
                  .foregroundStyle(agent.installed && agent.sessionRoot.isHealthy ? .green : .orange)
                Text(agent.label)
                  .fontWeight(.medium)
                Spacer()
                Text(agent.version ?? "not installed")
                  .foregroundStyle(.secondary)
              }
              Text(agent.sessionRoot.path)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .truncationMode(.middle)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
              Text("exists \(flag(agent.sessionRoot.exists))  readable \(flag(agent.sessionRoot.readable))  writable \(flag(agent.sessionRoot.writable))")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            }
          }
        } else {
          Text("Doctor has not run yet.")
            .foregroundStyle(.secondary)
        }
      }
    }
    .padding()
  }

  private func flag(_ value: Bool) -> String {
    value ? "yes" : "no"
  }

  private func isCurrentDirectory(_ directory: String) -> Bool {
    DirectoryHistory.normalized(directory) == DirectoryHistory.normalized(appState.watchedDirectory)
  }

  private func refresh() {
    Task {
      await poller.refresh(appState: appState, notifications: notifications)
    }
  }
}

private struct SettingsWarningText: View {
  let message: String

  init(_ message: String) {
    self.message = message
  }

  var body: some View {
    Text(message)
      .font(.caption)
      .foregroundStyle(.orange)
      .lineLimit(3)
      .fixedSize(horizontal: false, vertical: true)
      .textSelection(.enabled)
  }
}
