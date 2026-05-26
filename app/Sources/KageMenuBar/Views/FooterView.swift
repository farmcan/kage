import AppKit
import KageContracts
import SwiftUI

struct FooterView: View {
  @Environment(\.openSettings) private var openSettings
  @EnvironmentObject private var poller: SessionPoller

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      if let errorMessage = poller.errorMessage {
        Label(errorMessage, systemImage: "exclamationmark.triangle")
          .font(.caption)
          .foregroundStyle(.orange)
          .lineLimit(3)
      }

      ForEach(rootWarnings) { warning in
        Label(warning.message, systemImage: "exclamationmark.triangle")
          .font(.caption)
          .foregroundStyle(.orange)
          .lineLimit(2)
      }

      if let cwd = poller.sessionsResponse?.cwd {
        Text(cwd)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(1)
          .truncationMode(.middle)
      }

      HStack(spacing: 10) {
        Button {
          openSettings()
        } label: {
          Label("Settings", systemImage: "gearshape")
        }
        Button {
          NSApp.orderFrontStandardAboutPanel(nil)
          NSApp.activate(ignoringOtherApps: true)
        } label: {
          Label("About", systemImage: "info.circle")
        }
        Spacer()
        Button {
          NSApp.terminate(nil)
        } label: {
          Label("Quit", systemImage: "power")
        }
      }
      .buttonStyle(.borderless)
      .controlSize(.small)
    }
  }

  private var rootWarnings: [FooterWarning] {
    let doctorWarnings = poller.doctorResult?.agents.compactMap { agent -> FooterWarning? in
      guard !agent.sessionRoot.isHealthy else {
        return nil
      }
      return FooterWarning(message: "\(agent.label) session root needs attention: \(agent.sessionRoot.path)")
    } ?? []

    let sessionErrors = poller.sessionsResponse?.errors.map {
      FooterWarning(message: "\($0.agentLabel ?? $0.agent): \($0.error)")
    } ?? []

    return doctorWarnings + sessionErrors
  }
}

private struct FooterWarning: Identifiable {
  let id = UUID()
  let message: String
}
