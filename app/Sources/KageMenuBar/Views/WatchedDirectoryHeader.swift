import SwiftUI

struct WatchedDirectoryHeader: View {
  @EnvironmentObject private var appState: AppState
  @EnvironmentObject private var poller: SessionPoller
  @EnvironmentObject private var notifications: NotificationManager

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        Image(systemName: "scope")
          .foregroundStyle(.secondary)
        DirectoryPathSummary(
          path: appState.watchedDirectory,
          nameFont: .callout,
          pathFont: .caption2
        )
        Spacer()
        Button {
          appState.chooseWatchedDirectory()
          Task {
            await poller.refresh(appState: appState, notifications: notifications)
          }
        } label: {
          Label("Choose", systemImage: "folder")
        }
        .buttonStyle(.borderless)
      }

      if let lastRefresh = poller.lastRefresh {
        Text("Updated \(lastRefresh.formatted(date: .omitted, time: .shortened))")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }

      Text(appState.includeSubdirectories ? "Including subdirectories" : "Exact directory")
        .font(.caption2)
        .foregroundStyle(.secondary)
    }
  }
}
