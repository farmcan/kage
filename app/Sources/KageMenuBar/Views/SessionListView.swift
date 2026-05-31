import AppKit
import KageContracts
import SwiftUI

struct SessionListView: View {
  let sessions: [AgentSession]
  let actionsBySession: [String: [KageAction]]
  let onRunAction: (KageAction) -> Void

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 8) {
        if sessions.isEmpty {
          Text("No sessions for this directory yet.\nOpen KAGE to choose another project, enable subdirectories, or run an agent in this folder.")
            .font(.callout)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.vertical, 24)
        } else {
          ForEach(sessions) { session in
            SessionRowView(
              session: session,
              actions: actionsBySession[session.id] ?? [],
              onRunAction: onRunAction
            )
          }
        }
      }
    }
  }
}

private struct SessionRowView: View {
  let session: AgentSession
  let actions: [KageAction]
  let onRunAction: (KageAction) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack(alignment: .firstTextBaseline) {
        Text(session.agentLabel)
          .font(.caption)
          .foregroundStyle(.secondary)
          .frame(width: 70, alignment: .leading)
        Text(session.displayTitle)
          .font(.callout)
          .fontWeight(.medium)
          .lineLimit(1)
          .truncationMode(.tail)
        Spacer()
        if !actions.isEmpty {
          Menu {
            ForEach(actions) { action in
              Button {
                onRunAction(action)
              } label: {
                Label(actionMenuLabel(action), systemImage: actionIcon(action))
              }
            }
          } label: {
            Image(systemName: "ellipsis.circle")
              .imageScale(.medium)
              .accessibilityLabel("Session actions")
          }
          .menuStyle(.borderlessButton)
          .fixedSize()
        }
        Text(relativeUpdatedAt)
          .font(.caption2)
          .foregroundStyle(.secondary)
      }

      Text(session.cwd)
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
        .truncationMode(.middle)

      if let preview = session.recentUserMessages.first {
        Text(preview)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
    }
    .padding(8)
    .background(
      RoundedRectangle(cornerRadius: 6)
        .fill(Color.secondary.opacity(0.08))
    )
    .contextMenu {
      if !actions.isEmpty {
        ForEach(actions) { action in
          Button {
            onRunAction(action)
          } label: {
            Label(actionMenuLabel(action), systemImage: actionIcon(action))
          }
        }
        Divider()
      }
      Button("Show in Finder") {
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: session.path)])
      }
      Button("Copy Session ID") {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(session.sessionId, forType: .string)
      }
      Button("Copy Project Path") {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(session.cwd, forType: .string)
      }
    }
  }

  private var relativeUpdatedAt: String {
    guard let updatedAt = session.updatedAt else {
      return "unknown"
    }
    let isoFormatter = ISO8601DateFormatter()
    isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = isoFormatter.date(from: updatedAt) else {
      return "unknown"
    }
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .abbreviated
    return formatter.localizedString(for: date, relativeTo: Date())
  }

  private func actionMenuLabel(_ action: KageAction) -> String {
    switch action.type {
    case "resume":
      return "Resume Session"
    case "fork":
      return "Fork as New Session"
    case "replay":
      return "Open Replay Story"
    case "bridge":
      return "Bridge to \(agentLabel(action.targetAgent))"
    default:
      return action.label
    }
  }

  private func actionIcon(_ action: KageAction) -> String {
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
