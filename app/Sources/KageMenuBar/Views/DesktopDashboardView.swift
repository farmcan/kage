import AppKit
import KageContracts
import SwiftUI

struct DesktopDashboardView: View {
  @Environment(\.openSettings) private var openSettings
  @EnvironmentObject private var appState: AppState
  @EnvironmentObject private var poller: SessionPoller
  @EnvironmentObject private var notifications: NotificationManager

  @State private var selectedSessionID: String?
  @State private var searchText = ""
  @State private var searchTask: Task<Void, Never>?

  var body: some View {
    NavigationSplitView {
      sidebar
        .navigationSplitViewColumnWidth(min: 260, ideal: 320, max: 380)
    } detail: {
      detailPane
    }
    .toolbar {
      ToolbarItemGroup(placement: .primaryAction) {
        Button {
          refresh()
        } label: {
          Label("Refresh", systemImage: "arrow.clockwise")
        }
        .disabled(poller.isRefreshing)

        Button {
          openSettings()
        } label: {
          Label("Settings", systemImage: "gearshape")
        }
      }
    }
    .onAppear {
      refresh()
      ensureSelection()
    }
    .onChange(of: visibleSessions) { _, _ in
      ensureSelection()
    }
    .onChange(of: searchText) { _, newValue in
      scheduleSearch(newValue)
    }
    .onChange(of: appState.selectedAgent) { _, _ in
      if isSearchActive {
        searchNow(searchText)
      }
    }
    .onDisappear {
      searchTask?.cancel()
    }
  }

  private var sidebar: some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 12) {
        HStack(spacing: 10) {
          Image(systemName: "scope")
            .font(.title3)
            .foregroundStyle(.secondary)

          DirectoryPathSummary(
            path: appState.watchedDirectory,
            nameFont: .headline,
            pathFont: .caption
          )

          Spacer()

          Button {
            appState.chooseWatchedDirectory()
            refresh()
          } label: {
            Image(systemName: "folder")
              .accessibilityLabel("Choose directory")
          }
        }

        AgentTabBar(agents: poller.sessionsResponse?.agents ?? [])

        searchField

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
        .toggleStyle(.checkbox)
        .font(.caption)
      }
      .padding(16)

      Divider()

      List(selection: $selectedSessionID) {
        ForEach(visibleSessions) { session in
          DesktopSessionListRow(session: session, match: searchMatches[session.id])
            .tag(session.id)
        }
      }
      .listStyle(.sidebar)

      Divider()

      statusFooter
        .padding(12)
    }
  }

  @ViewBuilder
  private var detailPane: some View {
    if let session = selectedSession {
      DesktopSessionDetailView(
        session: session,
        match: searchMatches[session.id],
        actions: actionsBySession[session.id] ?? [],
        actionResult: poller.actionResult,
        actionMessage: poller.actionMessage,
        watchedDirectory: appState.watchedDirectory,
        onRunAction: runAction,
        onDismissResult: {
          poller.clearActionResult()
        }
      )
    } else {
      ContentUnavailableView(
        "No Session Selected",
        systemImage: "rectangle.stack",
        description: Text(emptyStateDescription)
      )
    }
  }

  private var searchField: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 8) {
        Image(systemName: "magnifyingglass")
          .foregroundStyle(.secondary)
        TextField("Search transcripts", text: $searchText)
          .textFieldStyle(.plain)
          .onSubmit {
            searchNow(searchText)
          }

        if poller.isSearching {
          ProgressView()
            .controlSize(.small)
        } else if !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          Button {
            searchText = ""
            poller.clearSearch()
          } label: {
            Image(systemName: "xmark.circle.fill")
              .foregroundStyle(.secondary)
              .accessibilityLabel("Clear search")
          }
          .buttonStyle(.plain)
        }
      }
      .padding(8)
      .background(
        RoundedRectangle(cornerRadius: 6)
          .fill(Color.secondary.opacity(0.09))
      )

      if let searchErrorMessage = poller.searchErrorMessage {
        Label(searchErrorMessage, systemImage: "exclamationmark.triangle")
          .font(.caption2)
          .foregroundStyle(.orange)
          .lineLimit(2)
      } else if isSearchActive {
        Text("Searching transcript text in this project.")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
  }

  private var statusFooter: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Label("\(poller.totalSessions)", systemImage: "rectangle.stack")
        Spacer()
        if poller.isRefreshing {
          ProgressView()
            .controlSize(.small)
        } else if let lastRefresh = poller.lastRefresh {
          Text(lastRefresh.formatted(date: .omitted, time: .shortened))
        }
      }
      .font(.caption)
      .foregroundStyle(.secondary)

      if let errorMessage = poller.errorMessage {
        Label(errorMessage, systemImage: "exclamationmark.triangle")
          .font(.caption)
          .foregroundStyle(.orange)
          .lineLimit(2)
      }

      if let doctor = poller.doctorResult {
        HStack(spacing: 6) {
          Image(systemName: doctor.ok ? "checkmark.circle" : "exclamationmark.triangle")
            .foregroundStyle(doctor.ok ? .green : .orange)
          Text("KAGE \(doctor.kageVersion)")
          Spacer()
        }
        .font(.caption)
        .foregroundStyle(.secondary)
      }
    }
  }

  private var allSessions: [AgentSession] {
    poller.sessionsResponse?.sessions ?? []
  }

  private var visibleSessions: [AgentSession] {
    if isSearchActive, let searchResponse = poller.searchResponse {
      return searchResponse.results.map(\.agentSession)
    }

    let agentFiltered = appState.selectedAgent == "all"
      ? allSessions
      : allSessions.filter { $0.agent == appState.selectedAgent }

    let trimmedSearch = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedSearch.isEmpty else {
      return agentFiltered
    }

    return agentFiltered.filter { session in
      searchableText(for: session).localizedCaseInsensitiveContains(trimmedSearch)
    }
  }

  private var selectedSession: AgentSession? {
    visibleSessions.first { $0.id == selectedSessionID }
  }

  private var isSearchActive: Bool {
    !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private var searchMatches: [String: SearchMatch] {
    Dictionary(
      uniqueKeysWithValues: poller.searchResponse?.results.compactMap { result in
        guard let match = result.match else {
          return nil
        }
        return (result.id, match)
      } ?? []
    )
  }

  private var actionsBySession: [String: [KageAction]] {
    Dictionary(
      grouping: poller.actionsResponse?.actions.filter { $0.sessionId != nil } ?? [],
      by: { action in "\(action.agent):\(action.sessionId ?? "")" }
    )
  }

  private var emptyStateDescription: String {
    visibleSessions.isEmpty
      ? "No matching sessions for the current directory."
      : "Choose a session from the sidebar."
  }

  private func searchableText(for session: AgentSession) -> String {
    ([session.agentLabel, session.displayTitle, session.sessionId, session.cwd, session.path] + session.recentUserMessages)
      .joined(separator: "\n")
  }

  private func ensureSelection() {
    if let selectedSessionID, visibleSessions.contains(where: { $0.id == selectedSessionID }) {
      return
    }
    selectedSessionID = visibleSessions.first?.id
  }

  private func scheduleSearch(_ query: String) {
    searchTask?.cancel()
    let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedQuery.isEmpty else {
      poller.clearSearch()
      ensureSelection()
      return
    }

    searchTask = Task {
      try? await Task.sleep(nanoseconds: 350_000_000)
      guard !Task.isCancelled else {
        return
      }
      await poller.search(query: trimmedQuery, appState: appState)
      ensureSelection()
    }
  }

  private func searchNow(_ query: String) {
    searchTask?.cancel()
    Task {
      await poller.search(query: query, appState: appState)
      ensureSelection()
    }
  }

  private func refresh() {
    Task {
      await poller.refresh(appState: appState, notifications: notifications)
      if isSearchActive {
        await poller.search(query: searchText, appState: appState)
      }
    }
  }

  private func runAction(_ action: KageAction) {
    Task {
      await poller.runAction(action, appState: appState, notifications: notifications)
    }
  }
}

private struct DesktopSessionListRow: View {
  let session: AgentSession
  let match: SearchMatch?

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack {
        Text(session.agentLabel)
          .font(.caption)
          .foregroundStyle(.secondary)
        Spacer()
        Text(relativeUpdatedAt)
          .font(.caption2)
          .foregroundStyle(.secondary)
      }

      Text(session.displayTitle)
        .font(.callout)
        .fontWeight(.medium)
        .lineLimit(2)

      Text(session.cwd)
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
        .truncationMode(.middle)

      if let match {
        Text(match.text)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
    }
    .padding(.vertical, 5)
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

private struct DesktopSessionDetailView: View {
  let session: AgentSession
  let match: SearchMatch?
  let actions: [KageAction]
  let actionResult: RunActionResponse?
  let actionMessage: String?
  let watchedDirectory: String
  let onRunAction: (KageAction) -> Void
  let onDismissResult: () -> Void

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        header

        if let actionResult, shouldShowResultCard(actionResult) {
          DesktopActionResultBanner(
            result: actionResult,
            cwd: watchedDirectory,
            onDismiss: onDismissResult
          )
        } else if let actionMessage {
          Text(actionMessage)
            .font(.caption)
            .foregroundStyle(.secondary)
        }

        actionSection
        searchMatchSection
        metadataSection
        recentMessagesSection
      }
      .padding(24)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(Color(nsColor: .textBackgroundColor))
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 12) {
        Image(systemName: agentIcon)
          .font(.system(size: 30))
          .foregroundStyle(.secondary)
          .frame(width: 44, height: 44)
          .background(
            RoundedRectangle(cornerRadius: 8)
              .fill(Color.secondary.opacity(0.08))
          )

        VStack(alignment: .leading, spacing: 5) {
          Text(session.agentLabel)
            .font(.caption)
            .foregroundStyle(.secondary)
          Text(session.displayTitle)
            .font(.title2)
            .fontWeight(.semibold)
            .lineLimit(3)
            .textSelection(.enabled)
        }

        Spacer()
      }

      Text(session.cwd)
        .font(.callout)
        .foregroundStyle(.secondary)
        .lineLimit(2)
        .truncationMode(.middle)
        .textSelection(.enabled)
    }
  }

  private var actionSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Actions")
        .font(.headline)

      if actions.isEmpty {
        Text("No actions available for this session.")
          .font(.callout)
          .foregroundStyle(.secondary)
      } else {
        LazyVGrid(columns: actionColumns, alignment: .leading, spacing: 8) {
          ForEach(actions) { action in
            Button {
              onRunAction(action)
            } label: {
              Label(actionLabel(action), systemImage: actionIcon(action))
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
          }
        }
      }
    }
  }

  private var actionColumns: [GridItem] {
    [
      GridItem(.adaptive(minimum: 180), spacing: 8, alignment: .leading)
    ]
  }

  @ViewBuilder
  private var searchMatchSection: some View {
    if let match {
      VStack(alignment: .leading, spacing: 10) {
        Text("Search Match")
          .font(.headline)
        VStack(alignment: .leading, spacing: 5) {
          Text(match.field)
            .font(.caption)
            .foregroundStyle(.secondary)
          Text(match.text)
            .font(.callout)
            .textSelection(.enabled)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
          RoundedRectangle(cornerRadius: 6)
            .fill(Color.yellow.opacity(0.12))
        )
      }
    }
  }

  private var metadataSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Details")
        .font(.headline)

      Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 18, verticalSpacing: 8) {
        metadataRow("Session", session.sessionId)
        metadataRow("Updated", formattedUpdatedAt)
        metadataRow("File", session.path)
      }
    }
    .textSelection(.enabled)
  }

  private var recentMessagesSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Recent User Messages")
        .font(.headline)

      if session.recentUserMessages.isEmpty {
        Text("No recent user messages.")
          .font(.callout)
          .foregroundStyle(.secondary)
      } else {
        VStack(alignment: .leading, spacing: 8) {
          ForEach(Array(session.recentUserMessages.enumerated()), id: \.offset) { _, message in
            Text(message)
              .font(.callout)
              .lineLimit(6)
              .textSelection(.enabled)
              .padding(10)
              .frame(maxWidth: .infinity, alignment: .leading)
              .background(
                RoundedRectangle(cornerRadius: 6)
                  .fill(Color.secondary.opacity(0.07))
              )
          }
        }
      }
    }
  }

  private func metadataRow(_ label: String, _ value: String) -> some View {
    GridRow {
      Text(label)
        .font(.caption)
        .foregroundStyle(.secondary)
      Text(value)
        .font(.callout)
        .lineLimit(3)
        .truncationMode(.middle)
    }
  }

  private var formattedUpdatedAt: String {
    guard let updatedAt = session.updatedAt else {
      return "unknown"
    }
    let isoFormatter = ISO8601DateFormatter()
    isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = isoFormatter.date(from: updatedAt) else {
      return updatedAt
    }
    return date.formatted(date: .abbreviated, time: .shortened)
  }

  private var agentIcon: String {
    switch session.agent {
    case "claude":
      return "sparkles"
    case "codex":
      return "terminal"
    case "qodercli":
      return "q.square"
    default:
      return "cpu"
    }
  }

  private func shouldShowResultCard(_ result: RunActionResponse) -> Bool {
    result.ok == true && (result.resumeCommand != nil || result.outputPath != nil || result.paths?.isEmpty == false)
  }

  private func actionLabel(_ action: KageAction) -> String {
    if action.type == "bridge" {
      return "Bridge to \(agentLabel(action.targetAgent))"
    }
    return action.label
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

private struct DesktopActionResultBanner: View {
  let result: RunActionResponse
  let cwd: String
  let onDismiss: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Label(title, systemImage: "checkmark.circle")
          .font(.headline)
          .foregroundStyle(.green)
        Spacer()
        Button {
          onDismiss()
        } label: {
          Image(systemName: "xmark")
            .accessibilityLabel("Dismiss")
        }
        .buttonStyle(.borderless)
      }

      if let resumeCommand = result.resumeCommand {
        Text(resumeCommand)
          .font(.callout.monospaced())
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

          Button {
            openResumeCommand()
          } label: {
            Label("Open in Terminal", systemImage: "terminal")
          }
        }

        if let filePath = revealPath {
          Button {
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: filePath)])
          } label: {
            Label("Show in Finder", systemImage: "folder")
          }
        }
      }
      .controlSize(.small)
    }
    .padding(14)
    .background(
      RoundedRectangle(cornerRadius: 8)
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
