import AppKit
import SwiftUI

struct SessionListView: View {
  let sessions: [AgentSession]

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 8) {
        if sessions.isEmpty {
          Text("No sessions for this directory.")
            .font(.callout)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 24)
        } else {
          ForEach(sessions) { session in
            SessionRowView(session: session)
          }
        }
      }
    }
  }
}

private struct SessionRowView: View {
  let session: AgentSession

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack(alignment: .firstTextBaseline) {
        Text(session.agentLabel)
          .font(.caption)
          .foregroundStyle(.secondary)
          .frame(width: 70, alignment: .leading)
        Text(session.title)
          .font(.callout)
          .fontWeight(.medium)
          .lineLimit(1)
          .truncationMode(.tail)
        Spacer()
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
}
