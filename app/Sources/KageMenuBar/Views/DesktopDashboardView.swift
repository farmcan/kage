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
  @State private var autoOpeningActionID: String?

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
        ForEach(sessionGroups) { group in
          Section {
            ForEach(group.sessions, id: \.path) { session in
              DesktopSessionListRow(session: session, match: searchMatches[session.path])
                .tag(sessionKey(session))
                .contextMenu {
                  if let resumeAction = primaryResumeAction(for: session) {
                    Button {
                      runAndOpenAction(resumeAction)
                    } label: {
                      Label("Continue in \(agentLabel(session.agent))", systemImage: "play.fill")
                    }
                  }
                  Button {
                    NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: session.path)])
                  } label: {
                    Label("Show Session File", systemImage: "doc")
                  }
                }
                .onTapGesture(count: 2) {
                  if let resumeAction = primaryResumeAction(for: session) {
                    runAndOpenAction(resumeAction)
                  }
                }
            }
          } header: {
            DirectoryGroupHeader(group: group)
          }
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
    if poller.isRefreshing && visibleSessions.isEmpty {
      VStack(spacing: 14) {
        ProgressView()
          .controlSize(.large)
        Text("Loading sessions...")
          .font(.headline)
        Text("KAGE is scanning local Codex, Claude Code, and QoderCLI transcripts.")
          .font(.callout)
          .foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color(nsColor: .textBackgroundColor))
    } else if let session = selectedSession {
      DesktopSessionDetailView(
        session: session,
        match: searchMatches[session.path],
        actions: actionsBySession[session.path] ?? [],
        actionResult: poller.actionResult,
        actionMessage: poller.actionMessage,
        watchedDirectory: appState.watchedDirectory,
        primaryResumeAction: primaryResumeAction(for: session),
        isOpening: autoOpeningActionID != nil,
        onContinue: runAndOpenAction,
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

  private var sessionGroups: [DirectorySessionGroup] {
    let grouped = Dictionary(grouping: visibleSessions, by: \.cwd)
    return grouped.map { cwd, sessions in
      DirectorySessionGroup(cwd: cwd, sessions: sessions.sorted(by: isNewer))
    }
    .sorted { lhs, rhs in
      if lhs.lastUpdated != rhs.lastUpdated {
        return lhs.lastUpdated > rhs.lastUpdated
      }
      return lhs.displayName.localizedCaseInsensitiveCompare(rhs.displayName) == .orderedAscending
    }
  }

  private var selectedSession: AgentSession? {
    visibleSessions.first { sessionKey($0) == selectedSessionID }
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
        return (result.path, match)
      } ?? []
    )
  }

  private var actionsBySession: [String: [KageAction]] {
    Dictionary(
      grouping: poller.actionsResponse?.actions.filter { $0.sessionId != nil } ?? [],
      by: { action in action.sessionPath ?? "\(action.agent):\(action.sessionId ?? "")" }
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
    if let selectedSessionID, visibleSessions.contains(where: { sessionKey($0) == selectedSessionID }) {
      return
    }
    selectedSessionID = visibleSessions.first.map(sessionKey)
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

  private func runAndOpenAction(_ action: KageAction) {
    autoOpeningActionID = action.id
    if action.type == "resume", let command = action.command {
      do {
        try TerminalCommandLauncher.open(command: command, cwd: appState.watchedDirectory)
      } catch {
        TerminalCommandLauncher.copy(command)
      }
      autoOpeningActionID = nil
      return
    }

    Task {
      await poller.runAction(action, appState: appState, notifications: notifications)
      defer {
        autoOpeningActionID = nil
      }
      guard let command = poller.actionResult?.resumeCommand else {
        return
      }
      do {
        try TerminalCommandLauncher.open(command: command, cwd: appState.watchedDirectory)
      } catch {
        TerminalCommandLauncher.copy(command)
      }
    }
  }

  private func primaryResumeAction(for session: AgentSession) -> KageAction? {
    actionsBySession[session.path]?.first { $0.type == "resume" }
  }

  private func sessionKey(_ session: AgentSession) -> String {
    "\(session.agent):\(session.sessionId):\(session.path)"
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
      return agent ?? "Agent"
    }
  }
}

private struct DesktopSessionListRow: View {
  let session: AgentSession
  let match: SearchMatch?

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack {
        Label(session.agentLabel, systemImage: agentIcon)
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

private struct DirectorySessionGroup: Identifiable {
  let cwd: String
  let sessions: [AgentSession]

  var id: String {
    cwd
  }

  var displayName: String {
    URL(fileURLWithPath: cwd).lastPathComponent.isEmpty ? cwd : URL(fileURLWithPath: cwd).lastPathComponent
  }

  var parentPath: String {
    URL(fileURLWithPath: cwd).deletingLastPathComponent().path
  }

  var lastUpdated: Date {
    sessions.compactMap { parseSessionDate($0.updatedAt) }.max() ?? .distantPast
  }
}

private struct DirectoryGroupHeader: View {
  let group: DirectorySessionGroup

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack(spacing: 6) {
        Image(systemName: "folder")
        Text(group.displayName)
          .fontWeight(.semibold)
        Spacer()
        Text("\(group.sessions.count)")
          .foregroundStyle(.secondary)
      }
      Text(group.parentPath)
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
        .truncationMode(.middle)
    }
    .textCase(nil)
    .padding(.vertical, 3)
  }
}

private func isNewer(_ lhs: AgentSession, _ rhs: AgentSession) -> Bool {
  let lhsDate = parseSessionDate(lhs.updatedAt) ?? .distantPast
  let rhsDate = parseSessionDate(rhs.updatedAt) ?? .distantPast
  if lhsDate != rhsDate {
    return lhsDate > rhsDate
  }
  return lhs.displayTitle.localizedCaseInsensitiveCompare(rhs.displayTitle) == .orderedAscending
}

private func parseSessionDate(_ value: String?) -> Date? {
  guard let value else {
    return nil
  }

  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  if let date = formatter.date(from: value) {
    return date
  }

  formatter.formatOptions = [.withInternetDateTime]
  return formatter.date(from: value)
}

private struct DesktopSessionDetailView: View {
  let session: AgentSession
  let match: SearchMatch?
  let actions: [KageAction]
  let actionResult: RunActionResponse?
  let actionMessage: String?
  let watchedDirectory: String
  let primaryResumeAction: KageAction?
  let isOpening: Bool
  let onContinue: (KageAction) -> Void
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

      if let primaryResumeAction {
        Button {
          onContinue(primaryResumeAction)
        } label: {
          if isOpening {
            Label("Opening \(session.agentLabel)", systemImage: "hourglass")
          } else {
            Label("Continue in \(session.agentLabel)", systemImage: "play.fill")
          }
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(isOpening)
      }
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
    TerminalCommandLauncher.copy(resumeCommand)
  }

  private func openResumeCommand() {
    guard let resumeCommand = result.resumeCommand else {
      return
    }
    do {
      try TerminalCommandLauncher.open(command: resumeCommand, cwd: cwd)
    } catch {
      TerminalCommandLauncher.copy(resumeCommand)
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
      return agent ?? "target"
    }
  }
}
