import SwiftUI

struct SettingsView: View {
  @EnvironmentObject private var appState: AppState
  @EnvironmentObject private var poller: SessionPoller
  @EnvironmentObject private var notifications: NotificationManager

  var body: some View {
    Form {
      Section("Directory") {
        HStack {
          Text(appState.watchedDirectory)
            .font(.system(.body, design: .monospaced))
            .lineLimit(1)
            .truncationMode(.middle)
          Spacer()
          Button("Choose...") {
            appState.chooseWatchedDirectory()
            Task {
              await poller.refresh(appState: appState, notifications: notifications)
            }
          }
          Button("Home") {
            appState.useHomeDirectory()
            Task {
              await poller.refresh(appState: appState, notifications: notifications)
            }
          }
        }

        Picker("Recent", selection: $appState.watchedDirectory) {
          ForEach(appState.watchedDirectoryHistory, id: \.self) { directory in
            Text(directory).tag(directory)
          }
        }
      }

      Section("Refresh") {
        Stepper(value: $appState.refreshIntervalSec, in: 30...3600, step: 30) {
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
          Text(launchAtLoginError)
            .font(.caption)
            .foregroundStyle(.orange)
        }
        if let notificationError = notifications.lastError {
          Text(notificationError)
            .font(.caption)
            .foregroundStyle(.orange)
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
                .lineLimit(1)
                .truncationMode(.middle)
              Text("exists \(flag(agent.sessionRoot.exists))  readable \(flag(agent.sessionRoot.readable))  writable \(flag(agent.sessionRoot.writable))")
                .font(.caption2)
                .foregroundStyle(.secondary)
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
}
