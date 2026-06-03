import KageContracts
import SwiftUI

struct SettingsView: View {
  @Environment(\.openURL) private var openURL
  @EnvironmentObject private var appState: AppState
  @EnvironmentObject private var poller: SessionPoller
  @EnvironmentObject private var notifications: NotificationManager
  @State private var updateStatus: UpdateCheckStatus = .idle

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

      Section("Updates") {
        VStack(alignment: .leading, spacing: 10) {
          HStack(spacing: 10) {
            Text("KAGE \(currentKageVersion)")
              .font(.headline)
            Spacer()
            Button {
              checkForUpdates()
            } label: {
              Label(
                updateStatus.isChecking ? "Checking..." : "Check for Updates",
                systemImage: updateStatus.isChecking ? "arrow.triangle.2.circlepath" : "arrow.down.circle"
              )
            }
            .disabled(updateStatus.isChecking)
          }

          updateStatusView
        }
      }

      Section("Doctor") {
        if let doctor = poller.doctorResult {
          Text("KAGE \(doctor.kageVersion)")
          ForEach(doctor.agents) { agent in
            VStack(alignment: .leading, spacing: 4) {
              HStack {
                Image(systemName: agent.isReady ? "checkmark.circle" : "exclamationmark.triangle")
                  .foregroundStyle(agent.isReady ? .green : .orange)
                Text(agent.label)
                  .fontWeight(.medium)
                Spacer()
                Text(agent.version ?? (agent.command == nil ? "source only" : "not installed"))
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

  private var currentKageVersion: String {
    if let doctorVersion = poller.doctorResult?.kageVersion, !doctorVersion.isEmpty {
      return doctorVersion
    }
    if let bundleVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
       !bundleVersion.isEmpty {
      return bundleVersion
    }
    return "0.0.0"
  }

  @ViewBuilder
  private var updateStatusView: some View {
    switch updateStatus {
    case .idle:
      Text("Check GitHub Releases for a newer DMG.")
        .font(.caption)
        .foregroundStyle(.secondary)
    case .checking:
      Text("Contacting GitHub Releases...")
        .font(.caption)
        .foregroundStyle(.secondary)
    case .upToDate(let latestVersion):
      Text("You are up to date. Latest release is \(latestVersion).")
        .font(.caption)
        .foregroundStyle(.secondary)
    case .available(let latestVersion, let releaseURL):
      HStack(spacing: 10) {
        Text("KAGE \(latestVersion) is available.")
          .font(.caption)
          .foregroundStyle(.orange)
        Button {
          openURL(releaseURL)
        } label: {
          Label("Open Release", systemImage: "arrow.up.right.square")
        }
        .controlSize(.small)
      }
    case .failed(let message):
      SettingsWarningText(message)
    }
  }

  private func checkForUpdates() {
    updateStatus = .checking
    let currentVersion = currentKageVersion
    Task { @MainActor in
      do {
        let result = try await GitHubReleaseUpdateChecker().check(currentVersion: currentVersion)
        updateStatus = result.isUpdateAvailable
          ? .available(version: result.latestVersion, releaseURL: result.releaseURL)
          : .upToDate(version: result.latestVersion)
      } catch {
        updateStatus = .failed(error.localizedDescription)
      }
    }
  }

  private func refresh() {
    Task {
      await poller.refresh(appState: appState, notifications: notifications)
    }
  }
}

private enum UpdateCheckStatus: Equatable {
  case idle
  case checking
  case upToDate(version: String)
  case available(version: String, releaseURL: URL)
  case failed(String)

  var isChecking: Bool {
    if case .checking = self {
      return true
    }
    return false
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
