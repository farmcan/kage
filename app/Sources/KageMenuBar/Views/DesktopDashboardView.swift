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
  @State private var terminalSession: EmbeddedTerminalSession?
  @State private var isDemoMode = false
  @State private var demoSearchResponse: SearchResponse?

  var body: some View {
    NavigationSplitView {
      sidebar
        .navigationSplitViewColumnWidth(min: 320, ideal: 380, max: 460)
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
      if !isDemoMode {
        refresh()
      }
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
    .onChange(of: isDemoMode) { _, enabled in
      demoSearchResponse = nil
      terminalSession = nil
      poller.clearActionResult()
      poller.actionMessage = nil
      if enabled {
        appState.selectedAgent = "all"
      } else {
        selectedSessionID = nil
        refresh()
      }
      ensureSelection()
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

        AgentTabBar(agents: activeAgents)

        searchField

        Toggle(
          "Include subdirectories",
          isOn: Binding(
            get: { appState.includeSubdirectories },
            set: { enabled in
              appState.includeSubdirectories = enabled
              if isDemoMode {
                if isSearchActive {
                  searchNow(searchText)
                }
                ensureSelection()
              } else {
                refresh()
              }
            }
          )
        )
        .toggleStyle(.checkbox)
        .font(.caption)

        if isDemoMode {
          DemoModeSidebarBanner(onExit: stopDemoMode)
        }
      }
      .padding(16)

      Divider()

      HStack {
        Text("Projects")
          .font(.headline)
        Spacer()
        Text("\(sessionGroups.count)")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 10)

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
                  if !isDemoSession(session) {
                    Button {
                      NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: session.path)])
                    } label: {
                      Label("Show Session File", systemImage: "doc")
                    }
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
        primaryResumeAction: primaryResumeAction(for: session),
        terminalSession: terminalSession?.sessionPath == session.path ? terminalSession : nil,
        isDemoSession: isDemoSession(session),
        isOpening: autoOpeningActionID != nil,
        onContinue: runAndOpenAction,
        onRunAction: runAction,
        onOpenResultTerminal: openResultInKageTerminal,
        onDismissResult: {
          poller.clearActionResult()
        }
      )
    } else {
      DesktopEmptyStateView(
        title: emptyStateTitle,
        description: emptyStateDescription,
        iconName: emptyStateIconName
      ) {
        emptyStateActions
      }
    }
  }

  @ViewBuilder
  private var emptyStateActions: some View {
    if isSearchActive {
      HStack(spacing: 10) {
        if appState.selectedAgent != "all" {
          Button {
            appState.selectedAgent = "all"
            searchNow(searchText)
          } label: {
            Label("Try All Agents", systemImage: "person.3")
          }
        }

        Button {
          searchText = ""
          poller.clearSearch()
        } label: {
          Label("Clear Search", systemImage: "xmark.circle")
        }

        Button {
          appState.chooseWatchedDirectory()
          refresh()
        } label: {
          Label("Change Directory", systemImage: "folder")
        }
      }
      .controlSize(.large)
    } else if visibleSessions.isEmpty {
      HStack(spacing: 10) {
        Button {
          refresh()
        } label: {
          Label("Refresh", systemImage: "arrow.clockwise")
        }

        if !appState.includeSubdirectories {
          Button {
            appState.includeSubdirectories = true
            if isDemoMode {
              ensureSelection()
            } else {
              refresh()
            }
          } label: {
            Label("Include Subdirs", systemImage: "folder.badge.plus")
          }
        }

        Button {
          appState.chooseWatchedDirectory()
          refresh()
        } label: {
          Label("Change Directory", systemImage: "folder")
        }

        Button {
          startDemoMode()
        } label: {
          Label("Explore Demo", systemImage: "play.rectangle")
        }

        Button {
          openGettingStarted()
        } label: {
          Label("Getting Started", systemImage: "questionmark.circle")
        }
      }
      .controlSize(.large)
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

      if !isDemoMode, let searchErrorMessage = poller.searchErrorMessage {
        Label(searchErrorMessage, systemImage: "exclamationmark.triangle")
          .font(.caption2)
          .foregroundStyle(.orange)
          .lineLimit(2)
      } else if isSearchActive {
        Text(isDemoMode ? "Searching sanitized demo session text." : "Searching transcript text in this project.")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
  }

  private var statusFooter: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Label("\(scopedSessions.count)", systemImage: "rectangle.stack")
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

      if isDemoMode {
        Label("Demo Mode", systemImage: "play.rectangle")
          .font(.caption)
          .foregroundStyle(.secondary)
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
    if isDemoMode {
      return DemoSessionCatalog.sessionsResponse.sessions
    }
    return realSessions
  }

  private var scopedSessions: [AgentSession] {
    guard isDemoMode, !appState.includeSubdirectories else {
      return allSessions
    }
    return allSessions.filter { $0.cwd == DemoSessionCatalog.defaultProjectPath }
  }

  private var realSessions: [AgentSession] {
    poller.sessionsResponse?.sessions ?? []
  }

  private var activeAgents: [AgentGroup] {
    if isDemoMode {
      return agentGroups(for: scopedSessions)
    }
    return poller.sessionsResponse?.agents ?? []
  }

  private var activeActionsResponse: ActionsResponse? {
    isDemoMode ? DemoSessionCatalog.actionsResponse : poller.actionsResponse
  }

  private var activeSearchResponse: SearchResponse? {
    isDemoMode ? demoSearchResponse : poller.searchResponse
  }

  private var visibleSessions: [AgentSession] {
    if isSearchActive, let searchResponse = activeSearchResponse {
      return searchResponse.results.map(\.agentSession)
    }

    let agentFiltered = appState.selectedAgent == "all"
      ? scopedSessions
      : scopedSessions.filter { $0.agent == appState.selectedAgent }

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
    !trimmedSearchText.isEmpty
  }

  private var trimmedSearchText: String {
    searchText.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private var searchMatches: [String: SearchMatch] {
    Dictionary(
      uniqueKeysWithValues: activeSearchResponse?.results.compactMap { result in
        guard let match = result.match else {
          return nil
        }
        return (result.path, match)
      } ?? []
    )
  }

  private var actionsBySession: [String: [KageAction]] {
    Dictionary(
      grouping: activeActionsResponse?.actions.filter { $0.sessionId != nil } ?? [],
      by: { action in action.sessionPath ?? "\(action.agent):\(action.sessionId ?? "")" }
    )
  }

  private var emptyStateTitle: String {
    if isSearchActive {
      return "No Search Results"
    }
    if visibleSessions.isEmpty {
      return "No Sessions Found"
    }
    return "No Session Selected"
  }

  private var emptyStateIconName: String {
    isSearchActive ? "magnifyingglass" : "rectangle.stack"
  }

  private var emptyStateDescription: String {
    if isSearchActive {
      return "No \(activeAgentScopeLabel) sessions matched \"\(trimmedSearchText)\" in \(directoryScopeLabel)."
    }

    if visibleSessions.isEmpty {
      return "No \(activeAgentScopeLabel) sessions found in \(directoryScopeLabel). Start or resume Codex, Claude Code, or QoderCLI in this project, enable subdirectories, or choose another directory."
    }

    return "Choose a session from the sidebar."
  }

  private var activeAgentScopeLabel: String {
    appState.selectedAgent == "all" ? "AI coding" : agentLabel(appState.selectedAgent)
  }

  private var directoryScopeLabel: String {
    appState.includeSubdirectories
      ? "\(appState.watchedDirectory) and subdirectories"
      : appState.watchedDirectory
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
      demoSearchResponse = nil
      poller.clearSearch()
      ensureSelection()
      return
    }

    if isDemoMode {
      demoSearchResponse = DemoSessionCatalog.searchResponse(
        query: trimmedQuery,
        selectedAgent: appState.selectedAgent,
        includeSubdirectories: appState.includeSubdirectories
      )
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
    if isDemoMode {
      let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
      demoSearchResponse = trimmedQuery.isEmpty
        ? nil
        : DemoSessionCatalog.searchResponse(
          query: trimmedQuery,
          selectedAgent: appState.selectedAgent,
          includeSubdirectories: appState.includeSubdirectories
        )
      ensureSelection()
      return
    }

    Task {
      await poller.search(query: query, appState: appState)
      ensureSelection()
    }
  }

  private func refresh() {
    if isDemoMode {
      stopDemoMode()
      return
    }

    Task {
      await poller.refresh(appState: appState, notifications: notifications)
      if isSearchActive {
        await poller.search(query: searchText, appState: appState)
      }
    }
  }

  private func runAction(_ action: KageAction) {
    if DemoSessionCatalog.isDemoAction(action) {
      presentDemoAction(action, openTerminal: false)
      return
    }

    Task {
      await poller.runAction(action, appState: appState, notifications: notifications)
      openReplayStoryIfNeeded(for: action)
    }
  }

  private func runAndOpenAction(_ action: KageAction) {
    autoOpeningActionID = action.id
    if DemoSessionCatalog.isDemoAction(action) {
      presentDemoAction(action, openTerminal: true)
      autoOpeningActionID = nil
      return
    }

    if action.type == "resume", let command = action.command {
      openTerminal(title: action.label, command: command, sessionPath: action.sessionPath)
      autoOpeningActionID = nil
      return
    }

    Task {
      await poller.runAction(action, appState: appState, notifications: notifications)
      defer {
        autoOpeningActionID = nil
      }
      if let result = poller.actionResult, result.resumeCommand != nil {
        openResultInKageTerminal(result)
      }
    }
  }

  private func openResultInKageTerminal(_ result: RunActionResponse) {
    guard let command = result.resumeCommand else {
      return
    }
    let terminalCommand = DemoSessionCatalog.isDemoPath(result.sessionPath)
      ? (DemoSessionCatalog.terminalCommand(for: result) ?? command)
      : command
    let title: String
    if result.action?.type == "bridge" {
      title = "Continue bridged \(agentLabel(result.targetAgent)) session"
    } else if result.action?.type == "fork" {
      title = "Continue forked \(agentLabel(result.targetAgent ?? result.sourceAgent)) session"
    } else {
      title = "Continue \(agentLabel(result.targetAgent ?? result.sourceAgent)) session"
    }
    openTerminal(
      title: title,
      command: terminalCommand,
      sessionPath: result.sessionPath ?? result.outputPath ?? result.paths?.first,
      cwd: DemoSessionCatalog.isDemoPath(result.sessionPath) ? NSHomeDirectory() : nil
    )
  }

  private func openReplayStoryIfNeeded(for action: KageAction) {
    guard action.type == "replay" else {
      return
    }
    guard let path = poller.actionResult?.outputPath ?? poller.actionResult?.paths?.first else {
      return
    }
    FileLauncher.open(path: path)
  }

  private func openGettingStarted() {
    guard let url = URL(string: "https://github.com/farmcan/kage#try-it-in-60-seconds") else {
      return
    }
    NSWorkspace.shared.open(url)
  }

  private func openTerminal(title: String, command: String, sessionPath: String?, cwd: String? = nil) {
    terminalSession = EmbeddedTerminalSession(
      title: title,
      command: command,
      cwd: cwd ?? selectedSession?.cwd ?? appState.watchedDirectory,
      sessionPath: sessionPath ?? selectedSession?.path ?? ""
    )
  }

  private func startDemoMode() {
    isDemoMode = true
    searchText = ""
    demoSearchResponse = nil
    selectedSessionID = DemoSessionCatalog.sessionsResponse.sessions.first.map(sessionKey)
  }

  private func stopDemoMode() {
    isDemoMode = false
  }

  private func presentDemoAction(_ action: KageAction, openTerminal shouldOpenTerminal: Bool) {
    poller.actionMessage = action.type == "replay"
      ? "Demo replay would create a local HTML story export from this session."
      : nil
    poller.actionResult = DemoSessionCatalog.result(for: action)
    if shouldOpenTerminal {
      openTerminal(
        title: action.label,
        command: DemoSessionCatalog.terminalCommand(for: action),
        sessionPath: action.sessionPath,
        cwd: NSHomeDirectory()
      )
    }
  }

  private func primaryResumeAction(for session: AgentSession) -> KageAction? {
    actionsBySession[session.path]?.first { $0.type == "resume" }
  }

  private func isDemoSession(_ session: AgentSession) -> Bool {
    DemoSessionCatalog.isDemoPath(session.path)
  }

  private func agentGroups(for sessions: [AgentSession]) -> [AgentGroup] {
    let grouped = Dictionary(grouping: sessions, by: \.agent)
    return ["codex", "claude", "qodercli"].compactMap { agent -> AgentGroup? in
      guard let sessions = grouped[agent] else {
        return nil
      }
      return AgentGroup(
        agent: agent,
        agentLabel: sessions.first?.agentLabel ?? agentLabel(agent),
        root: "\(DemoSessionCatalog.root)/\(agent)",
        sessions: sessions.sorted(by: isNewer)
      )
    }
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
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        AgentBadge(agent: session.agent, label: session.agentLabel, size: .small)
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
    .padding(.vertical, 8)
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

  var agentCounts: [(agent: String, label: String, count: Int)] {
    let grouped = Dictionary(grouping: sessions, by: \.agent)
    return grouped.map { agent, sessions in
      (agent: agent, label: sessions.first?.agentLabel ?? agent, count: sessions.count)
    }
    .sorted { lhs, rhs in
      if lhs.count != rhs.count {
        return lhs.count > rhs.count
      }
      return lhs.label.localizedCaseInsensitiveCompare(rhs.label) == .orderedAscending
    }
  }
}

private struct DirectoryGroupHeader: View {
  let group: DirectorySessionGroup

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
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

      HStack(spacing: 5) {
        ForEach(group.agentCounts, id: \.agent) { item in
          AgentCountBadge(agent: item.agent, label: item.label, count: item.count)
        }
      }
    }
    .textCase(nil)
    .padding(.vertical, 6)
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

private enum AgentBadgeSize {
  case small
  case regular
}

private struct AgentBadge: View {
  let agent: String
  let label: String
  var size: AgentBadgeSize = .regular

  var body: some View {
    HStack(spacing: size == .small ? 4 : 6) {
      Image(systemName: agentIconName(agent))
      Text(label)
        .lineLimit(1)
    }
    .font(size == .small ? .caption2 : .caption)
    .fontWeight(.semibold)
    .foregroundStyle(agentTint(agent))
    .padding(.horizontal, size == .small ? 7 : 9)
    .padding(.vertical, size == .small ? 3 : 5)
    .background(
      Capsule()
        .fill(agentTint(agent).opacity(0.12))
    )
  }
}

private struct AgentCountBadge: View {
  let agent: String
  let label: String
  let count: Int

  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: agentIconName(agent))
      Text(shortAgentLabel(label))
      Text("\(count)")
        .foregroundStyle(.secondary)
    }
    .font(.caption2)
    .fontWeight(.medium)
    .foregroundStyle(agentTint(agent))
    .padding(.horizontal, 6)
    .padding(.vertical, 3)
    .background(
      Capsule()
        .fill(agentTint(agent).opacity(0.10))
    )
  }

  private func shortAgentLabel(_ label: String) -> String {
    if label.localizedCaseInsensitiveContains("claude") {
      return "Claude"
    }
    if label.localizedCaseInsensitiveContains("qoder") {
      return "Qoder"
    }
    return label
  }
}

private struct DemoModeSidebarBanner: View {
  let onExit: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: "play.rectangle")
        .foregroundStyle(.blue)
        .padding(.top, 2)

      VStack(alignment: .leading, spacing: 4) {
        Text("Demo Mode")
          .font(.caption)
          .fontWeight(.semibold)
        Text("Sanitized sessions for exploring KAGE without private transcripts.")
          .font(.caption2)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
      }

      Spacer()

      Button {
        onExit()
      } label: {
        Image(systemName: "xmark.circle.fill")
          .accessibilityLabel("Exit demo mode")
      }
      .buttonStyle(.plain)
      .foregroundStyle(.secondary)
    }
    .padding(10)
    .background(
      RoundedRectangle(cornerRadius: 8)
        .fill(Color.blue.opacity(0.08))
    )
  }
}

private struct DemoModeNotice: View {
  var body: some View {
    HStack(alignment: .center, spacing: 10) {
      Label("Demo session", systemImage: "play.rectangle")
        .font(.headline)
        .foregroundStyle(.blue)
      Text("Actions are previews only; KAGE will not read or write local transcript files.")
        .font(.callout)
        .foregroundStyle(.secondary)
      Spacer()
    }
    .padding(12)
    .background(
      RoundedRectangle(cornerRadius: 8)
        .fill(Color.blue.opacity(0.08))
    )
  }
}

private struct DesktopEmptyStateView<Actions: View>: View {
  let title: String
  let description: String
  let iconName: String
  @ViewBuilder let actions: Actions

  var body: some View {
    VStack(spacing: 16) {
      Image(systemName: iconName)
        .font(.system(size: 32, weight: .regular))
        .foregroundStyle(.secondary)

      VStack(spacing: 8) {
        Text(title)
          .font(.title2)
          .fontWeight(.semibold)
        Text(description)
          .font(.callout)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
          .frame(maxWidth: 560)
          .fixedSize(horizontal: false, vertical: true)
      }

      actions
        .padding(.top, 2)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(32)
    .background(Color(nsColor: .textBackgroundColor))
  }
}

private func agentTint(_ agent: String?) -> Color {
  switch agent {
  case "claude":
    return Color(red: 0.55, green: 0.32, blue: 0.83)
  case "codex":
    return Color(red: 0.10, green: 0.47, blue: 0.36)
  case "qodercli":
    return Color(red: 0.13, green: 0.36, blue: 0.74)
  default:
    return .secondary
  }
}

private func agentIconName(_ agent: String?) -> String {
  switch agent {
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

private struct DesktopSessionDetailView: View {
  @State private var isContextExpanded = false

  let session: AgentSession
  let match: SearchMatch?
  let actions: [KageAction]
  let actionResult: RunActionResponse?
  let actionMessage: String?
  let primaryResumeAction: KageAction?
  let terminalSession: EmbeddedTerminalSession?
  let isDemoSession: Bool
  let isOpening: Bool
  let onContinue: (KageAction) -> Void
  let onRunAction: (KageAction) -> Void
  let onOpenResultTerminal: (RunActionResponse) -> Void
  let onDismissResult: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      header

      if isDemoSession {
        DemoModeNotice()
      }

      if let actionResult, shouldShowResultCard(actionResult) {
        DesktopActionResultBanner(
          result: actionResult,
          onOpenInKageTerminal: onOpenResultTerminal,
          onDismiss: onDismissResult
        )
      } else if let actionMessage {
        Text(actionMessage)
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      terminalSection
        .frame(maxWidth: .infinity, maxHeight: .infinity)

      contextSection
    }
    .padding(20)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .background(Color(nsColor: .textBackgroundColor))
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .center, spacing: 12) {
        Image(systemName: agentIcon)
          .font(.system(size: 25))
          .foregroundStyle(agentTint(session.agent))
          .frame(width: 44, height: 44)
          .background(
            RoundedRectangle(cornerRadius: 8)
              .fill(agentTint(session.agent).opacity(0.11))
          )

        VStack(alignment: .leading, spacing: 7) {
          HStack(spacing: 8) {
            AgentBadge(agent: session.agent, label: session.agentLabel)
            Label(projectName, systemImage: "folder")
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
          Text(session.displayTitle)
            .font(.title3)
            .fontWeight(.semibold)
            .lineLimit(1)
            .textSelection(.enabled)
        }

        Spacer()

        if let primaryResumeAction {
          Button {
            onContinue(primaryResumeAction)
          } label: {
            if isOpening {
              Label("Starting", systemImage: "hourglass")
            } else {
              Label("Continue", systemImage: "play.fill")
            }
          }
          .buttonStyle(.borderedProminent)
          .controlSize(.large)
          .disabled(isOpening)
        }

        if !secondaryActions.isEmpty {
          Menu {
            ForEach(secondaryActions) { action in
              Button {
                onRunAction(action)
              } label: {
                Label(actionLabel(action), systemImage: actionIcon(action))
              }
            }
          } label: {
            Label("Actions", systemImage: "ellipsis.circle")
          }
          .controlSize(.large)
        }
      }

      Text(session.cwd)
        .font(.caption.monospaced())
        .foregroundStyle(.secondary)
        .lineLimit(1)
        .truncationMode(.middle)
        .textSelection(.enabled)
    }
  }

  @ViewBuilder
  private var terminalSection: some View {
    if let terminalSession {
      VStack(alignment: .leading, spacing: 10) {
        HStack {
          Label(terminalSession.title, systemImage: "terminal")
            .font(.headline)
          Spacer()
          Text(terminalSession.cwd)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .truncationMode(.middle)
        }
        EmbeddedTerminalView(session: terminalSession)
          .id(terminalSession.id)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .frame(minHeight: 560)
          .clipShape(RoundedRectangle(cornerRadius: 8))
          .overlay(
            RoundedRectangle(cornerRadius: 8)
              .stroke(Color.secondary.opacity(0.18))
          )
      }
    } else if let primaryResumeAction {
      DesktopTerminalReadyPanel(
        session: session,
        action: primaryResumeAction,
        isDemoMode: isDemoSession,
        onContinue: onContinue
      )
    }
  }

  private var secondaryActions: [KageAction] {
    actions.filter { $0.type != "resume" }
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

  private var insightGrid: some View {
    LazyVGrid(columns: insightColumns, alignment: .leading, spacing: 14) {
      metadataSection
      recentMessagesSection
    }
  }

  private var contextSection: some View {
    DisclosureGroup(isExpanded: $isContextExpanded) {
      VStack(alignment: .leading, spacing: 14) {
        searchMatchSection
        insightGrid
      }
      .padding(.top, 10)
    } label: {
      HStack {
        Label("Session context", systemImage: "doc.text.magnifyingglass")
          .font(.headline)
        Spacer()
        Text(isContextExpanded ? "Hide details" : "Show details")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(12)
    .background(
      RoundedRectangle(cornerRadius: 8)
        .fill(Color.secondary.opacity(0.06))
    )
  }

  private var insightColumns: [GridItem] {
    [
      GridItem(.adaptive(minimum: 320), spacing: 14, alignment: .top)
    ]
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
    agentIconName(session.agent)
  }

  private var projectName: String {
    URL(fileURLWithPath: session.cwd).lastPathComponent.isEmpty
      ? session.cwd
      : URL(fileURLWithPath: session.cwd).lastPathComponent
  }

  private func shouldShowResultCard(_ result: RunActionResponse) -> Bool {
    result.ok == true && (result.resumeCommand != nil || result.outputPath != nil || result.paths?.isEmpty == false)
  }

  private func actionLabel(_ action: KageAction) -> String {
    if action.type == "fork" {
      return "Fork as new session"
    }
    if action.type == "bridge" {
      return "Bridge to \(agentLabel(action.targetAgent))"
    }
    if action.type == "replay" {
      return "Open replay story"
    }
    return action.label
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

private struct DesktopTerminalReadyPanel: View {
  let session: AgentSession
  let action: KageAction
  let isDemoMode: Bool
  let onContinue: (KageAction) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .center, spacing: 12) {
        Image(systemName: "terminal")
          .font(.title3)
          .foregroundStyle(agentTint(session.agent))
          .frame(width: 38, height: 38)
          .background(
            RoundedRectangle(cornerRadius: 8)
              .fill(agentTint(session.agent).opacity(0.18))
          )

        VStack(alignment: .leading, spacing: 4) {
          Text("Ready to continue")
            .font(.headline)
            .foregroundStyle(.white)
          Text(isDemoMode
            ? "KAGE will preview this \(session.agentLabel) workflow without touching local transcripts."
            : "KAGE will run this \(session.agentLabel) session inside the embedded terminal.")
            .font(.callout)
            .foregroundStyle(.white.opacity(0.66))
        }

        Spacer()

        Button {
          onContinue(action)
        } label: {
          Label(isDemoMode ? "Preview" : "Start", systemImage: "play.fill")
        }
        .buttonStyle(.borderedProminent)
      }

      if let command = action.command {
        VStack(alignment: .leading, spacing: 10) {
          Text("$ \(command)")
            .font(.title3.monospaced())
            .foregroundStyle(.white.opacity(0.86))
            .lineLimit(2)
            .truncationMode(.middle)
            .textSelection(.enabled)

          Text(isDemoMode ? "Demo output will appear here." : "Terminal output will appear here.")
            .font(.callout.monospaced())
            .foregroundStyle(.white.opacity(0.45))
        }
      }

      Spacer()
    }
    .padding(20)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(
      RoundedRectangle(cornerRadius: 8)
        .fill(Color(red: 0.08, green: 0.09, blue: 0.10))
    )
    .overlay(
      RoundedRectangle(cornerRadius: 8)
        .stroke(agentTint(session.agent).opacity(0.28))
    )
  }
}

private struct DesktopActionResultBanner: View {
  let result: RunActionResponse
  let onOpenInKageTerminal: (RunActionResponse) -> Void
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
            onOpenInKageTerminal(result)
          } label: {
            Label("Open in KAGE Terminal", systemImage: "play.fill")
          }

          Button {
            copyResumeCommand()
          } label: {
            Label("Copy", systemImage: "doc.on.doc")
          }

        }

        if let filePath = replayPath {
          Button {
            FileLauncher.open(path: filePath)
          } label: {
            Label("Open", systemImage: "arrow.up.right.square")
          }
        }

        if let filePath = revealPath {
          Button {
            FileLauncher.reveal(path: filePath)
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
    if DemoSessionCatalog.isDemoPath(result.sessionPath) {
      if result.action?.type == "bridge" {
        return "Demo preview: bridge to \(agentLabel(result.targetAgent))"
      }
      if result.action?.type == "fork" {
        return "Demo preview: fork \(agentLabel(result.targetAgent ?? result.sourceAgent))"
      }
      return "Demo preview ready"
    }

    if result.action?.type == "bridge" {
      return "Created \(agentLabel(result.targetAgent)) session"
    }
    if result.action?.type == "fork" {
      return "Created forked \(agentLabel(result.targetAgent ?? result.sourceAgent)) session"
    }
    if result.action?.type == "replay" {
      return "Created replay story"
    }
    if result.action?.type == "resume" {
      return "Ready to resume \(agentLabel(result.targetAgent ?? result.sourceAgent))"
    }
    return "Action completed"
  }

  private var revealPath: String? {
    result.outputPath ?? result.paths?.first
  }

  private var replayPath: String? {
    result.action?.type == "replay" ? revealPath : nil
  }

  private func copyResumeCommand() {
    guard let resumeCommand = result.resumeCommand else {
      return
    }
    TerminalCommandLauncher.copy(resumeCommand)
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
