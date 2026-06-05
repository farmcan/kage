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
  @State private var pendingNewSession: LaunchableAgent?
  @State private var isDemoMode = false
  @State private var demoSelectedAgent = "all"
  @State private var demoIncludeSubdirectories = false
  @State private var demoSearchResponse: SearchResponse?
  @State private var expandedMonthIDs = Set<String>()
  @State private var derivedState = DashboardDerivedState.empty

  var body: some View {
    NavigationSplitView {
      sidebar
        .navigationSplitViewColumnWidth(min: 320, ideal: 380, max: 460)
    } detail: {
      detailPane
    }
    .toolbar {
      ToolbarItemGroup(placement: .primaryAction) {
        newSessionMenu

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
      rebuildDerivedState()
      if !isDemoMode {
        refresh()
      }
    }
    .task(id: derivedStateSignature) {
      rebuildDerivedState()
    }
    .onReceive(poller.$sessionsResponse) { _ in
      guard !isDemoMode else {
        return
      }
      rebuildDerivedState()
    }
    .onReceive(poller.$actionsResponse) { _ in
      guard !isDemoMode else {
        return
      }
      rebuildDerivedState()
    }
    .onReceive(poller.$searchResponse) { _ in
      guard !isDemoMode else {
        return
      }
      rebuildDerivedState()
    }
    .onChange(of: selectedSessionID) { _, newValue in
      guard newValue != nil else {
        return
      }
      pendingNewSession = nil
      if standaloneTerminalSession != nil {
        terminalSession = nil
      }
    }
    .onChange(of: searchText) { _, newValue in
      rebuildDerivedState()
      scheduleSearch(newValue)
    }
    .onChange(of: activeSelectedAgent) { _, _ in
      rebuildDerivedState()
      if isSearchActive {
        searchNow(searchText)
      }
    }
    .onChange(of: isDemoMode) { _, enabled in
      demoSearchResponse = nil
      terminalSession = nil
      pendingNewSession = nil
      poller.clearActionResult()
      poller.actionMessage = nil
      if enabled {
        demoSelectedAgent = "all"
        demoIncludeSubdirectories = false
      } else {
        selectedSessionID = nil
        refresh()
      }
      rebuildDerivedState()
    }
    .onDisappear {
      searchTask?.cancel()
    }
  }

  private var sidebar: some View {
    let state = renderingState
    let groups = state.sessionGroups
    let matches = state.searchMatches
    let actionLookup = state.actionsBySession
    let rowModels = state.rowModelsByPath
    return VStack(alignment: .leading, spacing: 0) {
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

        AgentTabBar(agents: activeAgents, selection: selectedAgentBinding)

        searchField

        Toggle(
          "Include subdirectories",
          isOn: includeSubdirectoriesBinding
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
        Text("\(groups.count)")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 10)

      if groups.isEmpty {
        sidebarEmptyState
      } else {
        List(selection: $selectedSessionID) {
          ForEach(groups) { group in
            Section {
              sessionRows(for: group, matches: matches, actionLookup: actionLookup, rowModels: rowModels)
            } header: {
              DirectoryGroupHeader(group: group)
            }
          }
        }
        .listStyle(.sidebar)
      }

      Divider()

      statusFooter
        .padding(12)
    }
  }

  private var sidebarEmptyState: some View {
    VStack(alignment: .leading, spacing: 12) {
      Spacer(minLength: 12)

      Image(systemName: isSearchActive ? "magnifyingglass" : "rectangle.stack")
        .font(.title2)
        .foregroundStyle(.secondary)

      VStack(alignment: .leading, spacing: 6) {
        Text(sidebarEmptyTitle)
          .font(.headline)
        Text(sidebarEmptyDescription)
          .font(.caption)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
      }

      VStack(alignment: .leading, spacing: 8) {
        if activeSelectedAgent != "all" {
          Button {
            selectedAgentBinding.wrappedValue = "all"
            if isSearchActive {
              searchNow(searchText)
            }
          } label: {
            Label("Back to All", systemImage: "person.3")
          }
        }

        if isSearchActive {
          Button {
            searchText = ""
            poller.clearSearch()
          } label: {
            Label("Clear Search", systemImage: "xmark.circle")
          }
        }

        Button {
          refresh()
        } label: {
          Label("Refresh", systemImage: "arrow.clockwise")
        }

        newSessionMenu
      }
      .controlSize(.small)

      Spacer()
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  private var sidebarEmptyTitle: String {
    if isSearchActive {
      return "No matches"
    }
    if activeSelectedAgent != "all" {
      return "No \(agentLabel(activeSelectedAgent)) sessions"
    }
    return "No sessions"
  }

  private var sidebarEmptyDescription: String {
    if isSearchActive, activeSelectedAgent != "all" {
      return "No \(agentLabel(activeSelectedAgent)) sessions match this search. Try all agents or clear the search."
    }
    if isSearchActive {
      return "No sessions match this search in the current project."
    }
    if activeSelectedAgent != "all" {
      return "This project has no \(agentLabel(activeSelectedAgent)) sessions yet. Go back to All or start a new session."
    }
    return "Start or resume an agent session in this project, then refresh."
  }

  @ViewBuilder
  private var detailPane: some View {
    let matches = searchMatches
    let actionLookup = actionsBySession
    if let terminalSession = standaloneTerminalSession {
      DesktopStandaloneTerminalView(
        session: terminalSession,
        onClose: {
          self.terminalSession = nil
        }
      )
    } else if let pendingNewSession {
      DesktopNewSessionReadyView(
        agent: pendingNewSession,
        cwd: appState.watchedDirectory,
        onStartInKage: {
          startNewSessionInKage(agent: pendingNewSession.id)
        },
        onStartInTerminalApp: {
          openExternalTerminal(
            command: AgentLaunchCommand.command(for: pendingNewSession.id, cwd: appState.watchedDirectory),
            cwd: appState.watchedDirectory
          )
          self.pendingNewSession = nil
        },
        onCancel: {
          self.pendingNewSession = nil
        }
      )
    } else if poller.isRefreshing && visibleSessions.isEmpty {
      VStack(spacing: 14) {
        ProgressView()
          .controlSize(.large)
        Text("Loading sessions...")
          .font(.headline)
        Text("KAGE is scanning local Codex, Claude Code, QoderCLI, and QoderWork transcripts.")
          .font(.callout)
          .foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color(nsColor: .textBackgroundColor))
    } else if let session = selectedSession {
      DesktopSessionDetailView(
        session: session,
        match: matches[session.path],
        actions: actionLookup[session.path] ?? [],
        actionResult: actionResult(for: session),
        actionMessage: poller.actionMessage,
        primaryResumeAction: primaryResumeAction(for: session, in: actionLookup),
        terminalSession: terminalSession?.sessionPath == session.path ? terminalSession : nil,
        isDemoSession: isDemoSession(session),
        isOpening: autoOpeningActionID != nil,
        onContinue: runAndOpenAction,
        onRunAction: runAction,
        onOpenExternalCommand: openExternalTerminal,
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

  private var newSessionMenu: some View {
    Menu {
      ForEach(AgentLaunchCommand.agents) { agent in
        Button {
          prepareNewSession(agent: agent)
        } label: {
          Label(agent.label, systemImage: agent.iconName)
        }
      }
    } label: {
      Label("New Session", systemImage: "plus.circle")
    }
  }

  @ViewBuilder
  private var emptyStateActions: some View {
    if isSearchActive {
      HStack(spacing: 10) {
        if activeSelectedAgent != "all" {
          Button {
            selectedAgentBinding.wrappedValue = "all"
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

        if !activeIncludeSubdirectories {
          Button {
            includeSubdirectoriesBinding.wrappedValue = true
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

        newSessionMenu
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

      if !isDemoMode, let errorMessage = poller.errorMessage {
        Label(errorMessage, systemImage: "exclamationmark.triangle")
          .font(.caption)
          .foregroundStyle(.orange)
          .lineLimit(2)
      }

      if isDemoMode {
        Label("Demo Mode", systemImage: "play.rectangle")
          .font(.caption)
          .foregroundStyle(.secondary)
      } else {
        HStack(spacing: 8) {
          Label(poller.loadsFullHistory ? "Full history" : "Recent 90d / 120 max", systemImage: "calendar")
            .font(.caption)
            .foregroundStyle(.secondary)

          Spacer()

          Button {
            Task {
              await poller.setLoadsFullHistory(!poller.loadsFullHistory, appState: appState, notifications: notifications)
              ensureSelection()
            }
          } label: {
            Text(poller.loadsFullHistory ? "Recent Only" : "Load Full History")
          }
          .font(.caption)
          .buttonStyle(.link)
          .disabled(poller.isRefreshing)
        }
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
    guard isDemoMode, !activeIncludeSubdirectories else {
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

  private var activeSelectedAgent: String {
    isDemoMode ? demoSelectedAgent : appState.selectedAgent
  }

  private var activeIncludeSubdirectories: Bool {
    isDemoMode ? demoIncludeSubdirectories : appState.includeSubdirectories
  }

  private var selectedAgentBinding: Binding<String> {
    Binding(
      get: {
        activeSelectedAgent
      },
      set: { value in
        if isDemoMode {
          demoSelectedAgent = value
        } else {
          appState.selectedAgent = value
        }
      }
    )
  }

  private var includeSubdirectoriesBinding: Binding<Bool> {
    Binding(
      get: {
        activeIncludeSubdirectories
      },
      set: { enabled in
        if isDemoMode {
          demoIncludeSubdirectories = enabled
          ensureDemoAgentIsVisible()
          if isSearchActive {
            searchNow(searchText)
          }
          rebuildDerivedState()
        } else {
          appState.includeSubdirectories = enabled
          refresh()
        }
      }
    )
  }

  private var visibleSessions: [AgentSession] {
    renderingState.visibleSessions
  }

  private var sessionGroups: [DirectorySessionGroup] {
    renderingState.sessionGroups
  }

  private var selectedSession: AgentSession? {
    guard let selectedSessionID else {
      return nil
    }
    return renderingState.sessionsByKey[selectedSessionID]
  }

  private var isSearchActive: Bool {
    !trimmedSearchText.isEmpty
  }

  private var trimmedSearchText: String {
    searchText.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private var searchMatches: [String: SearchMatch] {
    renderingState.searchMatches
  }

  private var actionsBySession: [String: [KageAction]] {
    renderingState.actionsBySession
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
      return "No \(activeAgentScopeLabel) sessions found in \(directoryScopeLabel). Start or resume Codex, Claude Code, QoderCLI, or QoderWork in this project, enable subdirectories, or choose another directory."
    }

    return "Choose a session from the sidebar."
  }

  private var activeAgentScopeLabel: String {
    activeSelectedAgent == "all" ? "AI coding" : agentLabel(activeSelectedAgent)
  }

  private var standaloneTerminalSession: EmbeddedTerminalSession? {
    guard let terminalSession, terminalSession.sessionPath.hasPrefix("kage-new-session:") else {
      return nil
    }
    return terminalSession
  }

  @ViewBuilder
  private func sessionRows(
    for group: DirectorySessionGroup,
    matches: [String: SearchMatch],
    actionLookup: [String: [KageAction]],
    rowModels: [String: DesktopSessionRowModel]
  ) -> some View {
    if poller.loadsFullHistory && !isSearchActive {
      ForEach(group.monthGroups) { month in
        if month.isCurrentMonth {
          ForEach(month.sessions, id: \.path) { session in
            sessionRow(session, rowModel: rowModels[session.path], match: matches[session.path], actionLookup: actionLookup)
          }
        } else {
          DisclosureGroup(isExpanded: monthExpansionBinding(group: group, month: month)) {
            ForEach(month.sessions, id: \.path) { session in
              sessionRow(session, rowModel: rowModels[session.path], match: matches[session.path], actionLookup: actionLookup)
            }
          } label: {
            MonthGroupHeader(month: month)
          }
        }
      }
    } else {
      ForEach(group.sessions, id: \.path) { session in
        sessionRow(session, rowModel: rowModels[session.path], match: matches[session.path], actionLookup: actionLookup)
      }
    }
  }

  private func sessionRow(
    _ session: AgentSession,
    rowModel: DesktopSessionRowModel?,
    match: SearchMatch?,
    actionLookup: [String: [KageAction]]
  ) -> some View {
    DesktopSessionListRow(
      model: rowModel ?? DesktopSessionRowModel.fallback(session: session, match: match)
    )
      .equatable()
      .tag(sessionKey(session))
      .contextMenu {
        if let resumeAction = primaryResumeAction(for: session, in: actionLookup) {
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
        if let resumeAction = primaryResumeAction(for: session, in: actionLookup) {
          runAndOpenAction(resumeAction)
        }
      }
  }

  private func monthExpansionBinding(group: DirectorySessionGroup, month: MonthSessionGroup) -> Binding<Bool> {
    let id = "\(group.id)|\(month.id)"
    return Binding(
      get: {
        expandedMonthIDs.contains(id)
      },
      set: { expanded in
        if expanded {
          expandedMonthIDs.insert(id)
        } else {
          expandedMonthIDs.remove(id)
        }
      }
    )
  }

  private var directoryScopeLabel: String {
    if isDemoMode {
      return activeIncludeSubdirectories
        ? "\(DemoSessionCatalog.displayRoot) and subdirectories"
        : DemoSessionCatalog.defaultProjectPath
    }
    return activeIncludeSubdirectories
      ? "\(appState.watchedDirectory) and subdirectories"
      : appState.watchedDirectory
  }

  private func ensureSelection() {
    ensureSelection(in: renderingState)
  }

  private func ensureSelection(in state: DashboardDerivedState) {
    if pendingNewSession != nil || standaloneTerminalSession != nil {
      selectedSessionID = nil
      return
    }

    if let selectedSessionID, state.sessionsByKey[selectedSessionID] != nil {
      return
    }
    selectedSessionID = state.visibleSessions.first.map(sessionKey)
  }

  private func scheduleSearch(_ query: String) {
    searchTask?.cancel()
    let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedQuery.isEmpty else {
      demoSearchResponse = nil
      poller.clearSearch()
      rebuildDerivedState()
      return
    }

    if isDemoMode {
      demoSearchResponse = DemoSessionCatalog.searchResponse(
        query: trimmedQuery,
        selectedAgent: activeSelectedAgent,
        includeSubdirectories: activeIncludeSubdirectories
      )
      rebuildDerivedState()
      return
    }

    searchTask = Task {
      try? await Task.sleep(nanoseconds: 350_000_000)
      guard !Task.isCancelled else {
        return
      }
      await poller.search(query: trimmedQuery, appState: appState)
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
          selectedAgent: activeSelectedAgent,
          includeSubdirectories: activeIncludeSubdirectories
        )
      rebuildDerivedState()
      return
    }

    Task {
      await poller.search(query: query, appState: appState)
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
      rebuildDerivedState()
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

  private func prepareNewSession(agent: LaunchableAgent) {
    if isDemoMode {
      stopDemoMode()
    }
    pendingNewSession = agent
    terminalSession = nil
    selectedSessionID = nil
  }

  private func startNewSessionInKage(agent: String) {
    let cwd = appState.watchedDirectory
    let command = AgentLaunchCommand.command(for: agent, cwd: cwd)
    pendingNewSession = nil
    terminalSession = EmbeddedTerminalSession(
      title: "New \(AgentLaunchCommand.label(for: agent)) session",
      command: command,
      cwd: cwd,
      sessionPath: "kage-new-session:\(agent):\(cwd)"
    )
    selectedSessionID = nil
  }

  private func openExternalTerminal(command: String, cwd: String) {
    do {
      try TerminalCommandLauncher.open(command: command, cwd: cwd)
    } catch {
      TerminalCommandLauncher.copy(command)
      poller.actionMessage = "Could not open Terminal.app, so the command was copied."
    }
  }

  private func openTerminal(title: String, command: String, sessionPath: String?, cwd: String? = nil) {
    pendingNewSession = nil
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

  private func rebuildDerivedState() {
    let signature = derivedStateSignature
    let state = makeDerivedState(signature: signature)
    derivedState = state
    ensureSelection(in: state)
  }

  private var renderingState: DashboardDerivedState {
    let signature = derivedStateSignature
    if derivedState.signature == signature {
      return derivedState
    }
    return makeDerivedState(signature: signature)
  }

  private var derivedStateSignature: DashboardDerivedStateSignature {
    DashboardDerivedStateSignature(
      isDemoMode: isDemoMode,
      sessions: scopedSessions,
      actions: activeActionsResponse?.actions ?? [],
      searchResponse: activeSearchResponse,
      selectedAgent: activeSelectedAgent,
      includeSubdirectories: activeIncludeSubdirectories,
      searchText: searchText
    )
  }

  private func makeDerivedState(signature: DashboardDerivedStateSignature) -> DashboardDerivedState {
    DashboardDerivedState(
      signature: signature,
      sessions: scopedSessions,
      searchResponse: activeSearchResponse,
      actionsResponse: activeActionsResponse,
      selectedAgent: activeSelectedAgent,
      includeSubdirectories: activeIncludeSubdirectories,
      searchText: searchText
    )
  }

  private func ensureDemoAgentIsVisible() {
    guard isDemoMode, demoSelectedAgent != "all" else {
      return
    }
    let visibleAgents = Set(scopedSessions.map(\.agent))
    if !visibleAgents.contains(demoSelectedAgent) {
      demoSelectedAgent = "all"
    }
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

  private func primaryResumeAction(for session: AgentSession, in actionLookup: [String: [KageAction]]? = nil) -> KageAction? {
    let state = renderingState
    if actionLookup == nil, let action = state.primaryResumeActions[session.path] {
      return action
    }
    return (actionLookup ?? state.actionsBySession)[session.path]?.first { $0.type == "resume" }
  }

  private func actionResult(for session: AgentSession) -> RunActionResponse? {
    guard let result = poller.actionResult else {
      return nil
    }
    guard let resultSessionPath = result.sessionPath else {
      return result
    }
    return resultSessionPath == session.path ? result : nil
  }

  private func isDemoSession(_ session: AgentSession) -> Bool {
    DemoSessionCatalog.isDemoPath(session.path)
  }

  private func agentGroups(for sessions: [AgentSession]) -> [AgentGroup] {
    let grouped = Dictionary(grouping: sessions, by: \.agent)
    return ["codex", "claude", "qodercli", "qoderwork"].compactMap { agent -> AgentGroup? in
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
    dashboardSessionKey(session)
  }

  private func agentLabel(_ agent: String?) -> String {
    switch agent {
    case "claude":
      return "Claude Code"
    case "codex":
      return "Codex"
    case "qodercli":
      return "QoderCLI"
    case "qoderwork":
      return "QoderWork"
    default:
      return agent ?? "Agent"
    }
  }
}

private struct DashboardDerivedStateSignature: Equatable {
  static let empty = DashboardDerivedStateSignature(
    isDemoMode: false,
    sessionsCount: 0,
    firstSessionPath: nil,
    firstSessionUpdatedAt: nil,
    lastSessionPath: nil,
    lastSessionUpdatedAt: nil,
    actionsCount: 0,
    firstActionID: nil,
    lastActionID: nil,
    searchQuery: nil,
    searchResultsCount: 0,
    firstSearchPath: nil,
    lastSearchPath: nil,
    selectedAgent: "all",
    includeSubdirectories: false,
    searchText: ""
  )

  let isDemoMode: Bool
  let sessionsCount: Int
  let firstSessionPath: String?
  let firstSessionUpdatedAt: String?
  let lastSessionPath: String?
  let lastSessionUpdatedAt: String?
  let actionsCount: Int
  let firstActionID: String?
  let lastActionID: String?
  let searchQuery: String?
  let searchResultsCount: Int
  let firstSearchPath: String?
  let lastSearchPath: String?
  let selectedAgent: String
  let includeSubdirectories: Bool
  let searchText: String

  init(
    isDemoMode: Bool,
    sessions: [AgentSession],
    actions: [KageAction],
    searchResponse: SearchResponse?,
    selectedAgent: String,
    includeSubdirectories: Bool,
    searchText: String
  ) {
    self.init(
      isDemoMode: isDemoMode,
      sessionsCount: sessions.count,
      firstSessionPath: sessions.first?.path,
      firstSessionUpdatedAt: sessions.first?.updatedAt,
      lastSessionPath: sessions.last?.path,
      lastSessionUpdatedAt: sessions.last?.updatedAt,
      actionsCount: actions.count,
      firstActionID: actions.first?.id,
      lastActionID: actions.last?.id,
      searchQuery: searchResponse?.query,
      searchResultsCount: searchResponse?.results.count ?? 0,
      firstSearchPath: searchResponse?.results.first?.path,
      lastSearchPath: searchResponse?.results.last?.path,
      selectedAgent: selectedAgent,
      includeSubdirectories: includeSubdirectories,
      searchText: searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    )
  }

  private init(
    isDemoMode: Bool,
    sessionsCount: Int,
    firstSessionPath: String?,
    firstSessionUpdatedAt: String?,
    lastSessionPath: String?,
    lastSessionUpdatedAt: String?,
    actionsCount: Int,
    firstActionID: String?,
    lastActionID: String?,
    searchQuery: String?,
    searchResultsCount: Int,
    firstSearchPath: String?,
    lastSearchPath: String?,
    selectedAgent: String,
    includeSubdirectories: Bool,
    searchText: String
  ) {
    self.isDemoMode = isDemoMode
    self.sessionsCount = sessionsCount
    self.firstSessionPath = firstSessionPath
    self.firstSessionUpdatedAt = firstSessionUpdatedAt
    self.lastSessionPath = lastSessionPath
    self.lastSessionUpdatedAt = lastSessionUpdatedAt
    self.actionsCount = actionsCount
    self.firstActionID = firstActionID
    self.lastActionID = lastActionID
    self.searchQuery = searchQuery
    self.searchResultsCount = searchResultsCount
    self.firstSearchPath = firstSearchPath
    self.lastSearchPath = lastSearchPath
    self.selectedAgent = selectedAgent
    self.includeSubdirectories = includeSubdirectories
    self.searchText = searchText
  }
}

private struct DashboardDerivedState {
  static let empty = DashboardDerivedState(
    signature: .empty,
    visibleSessions: [],
    sessionGroups: [],
    sessionsByKey: [:],
    searchMatches: [:],
    actionsBySession: [:],
    primaryResumeActions: [:],
    rowModelsByPath: [:]
  )

  let signature: DashboardDerivedStateSignature
  let visibleSessions: [AgentSession]
  let sessionGroups: [DirectorySessionGroup]
  let sessionsByKey: [String: AgentSession]
  let searchMatches: [String: SearchMatch]
  let actionsBySession: [String: [KageAction]]
  let primaryResumeActions: [String: KageAction]
  let rowModelsByPath: [String: DesktopSessionRowModel]

  init(
    signature: DashboardDerivedStateSignature,
    sessions: [AgentSession],
    searchResponse: SearchResponse?,
    actionsResponse: ActionsResponse?,
    selectedAgent: String,
    includeSubdirectories: Bool,
    searchText: String
  ) {
    let trimmedSearch = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    let matchingSearchResults = DashboardDerivedState.matchingSearchResults(
      from: searchResponse,
      trimmedSearch: trimmedSearch,
      selectedAgent: selectedAgent,
      includeSubdirectories: includeSubdirectories
    )
    let visibleSessions = DashboardDerivedState.visibleSessions(
      from: sessions,
      matchingSearchResults: matchingSearchResults,
      selectedAgent: selectedAgent,
      trimmedSearch: trimmedSearch
    )
    let searchMatches = DashboardDerivedState.searchMatches(from: matchingSearchResults)
    let dateLookup = DashboardDerivedState.dateLookup(for: visibleSessions)
    let actionsBySession = DashboardDerivedState.actionsBySession(from: actionsResponse)
    let rowModelsByPath = DashboardDerivedState.rowModels(
      for: visibleSessions,
      dateLookup: dateLookup,
      matches: searchMatches
    )
    var sessionsByKey = [String: AgentSession]()
    sessionsByKey.reserveCapacity(visibleSessions.count)
    for session in visibleSessions {
      sessionsByKey[dashboardSessionKey(session)] = session
    }

    self.signature = signature
    self.visibleSessions = visibleSessions
    self.sessionGroups = DashboardDerivedState.sessionGroups(
      for: visibleSessions,
      dateLookup: dateLookup
    )
    self.sessionsByKey = sessionsByKey
    self.searchMatches = searchMatches
    self.actionsBySession = actionsBySession
    self.primaryResumeActions = DashboardDerivedState.primaryResumeActions(from: actionsBySession)
    self.rowModelsByPath = rowModelsByPath
  }

  private init(
    signature: DashboardDerivedStateSignature,
    visibleSessions: [AgentSession],
    sessionGroups: [DirectorySessionGroup],
    sessionsByKey: [String: AgentSession],
    searchMatches: [String: SearchMatch],
    actionsBySession: [String: [KageAction]],
    primaryResumeActions: [String: KageAction],
    rowModelsByPath: [String: DesktopSessionRowModel]
  ) {
    self.signature = signature
    self.visibleSessions = visibleSessions
    self.sessionGroups = sessionGroups
    self.sessionsByKey = sessionsByKey
    self.searchMatches = searchMatches
    self.actionsBySession = actionsBySession
    self.primaryResumeActions = primaryResumeActions
    self.rowModelsByPath = rowModelsByPath
  }

  private static func matchingSearchResults(
    from searchResponse: SearchResponse?,
    trimmedSearch: String,
    selectedAgent: String,
    includeSubdirectories: Bool
  ) -> [SearchSessionResult]? {
    guard
      !trimmedSearch.isEmpty,
      let searchResponse,
      searchResponse.query == trimmedSearch
    else {
      return nil
    }

    let expectedAgent = selectedAgent == "all" ? nil : selectedAgent
    guard
      searchResponse.filters.agent == expectedAgent,
      searchResponse.filters.includeSubdirs == includeSubdirectories
    else {
      return nil
    }

    return searchResponse.results
  }

  private static func visibleSessions(
    from sessions: [AgentSession],
    matchingSearchResults: [SearchSessionResult]?,
    selectedAgent: String,
    trimmedSearch: String
  ) -> [AgentSession] {
    if let matchingSearchResults {
      return matchingSearchResults.map(\.agentSession)
    }

    let agentFiltered = selectedAgent == "all"
      ? sessions
      : sessions.filter { $0.agent == selectedAgent }

    guard !trimmedSearch.isEmpty else {
      return agentFiltered
    }

    return agentFiltered.filter { session in
      searchableSessionText(for: session).localizedCaseInsensitiveContains(trimmedSearch)
    }
  }

  private static func searchMatches(from results: [SearchSessionResult]?) -> [String: SearchMatch] {
    var matches = [String: SearchMatch]()
    for result in results ?? [] {
      if let match = result.match {
        matches[result.path] = match
      }
    }
    return matches
  }

  private static func dateLookup(for sessions: [AgentSession]) -> [String: Date] {
    var dates = [String: Date]()
    dates.reserveCapacity(sessions.count)
    for session in sessions {
      dates[session.path] = parseSessionDate(session.updatedAt) ?? .distantPast
    }
    return dates
  }

  private static func actionsBySession(from response: ActionsResponse?) -> [String: [KageAction]] {
    Dictionary(
      grouping: response?.actions.filter { $0.sessionId != nil } ?? [],
      by: { action in action.sessionPath ?? "\(action.agent):\(action.sessionId ?? "")" }
    )
  }

  private static func primaryResumeActions(from actionsBySession: [String: [KageAction]]) -> [String: KageAction] {
    var actions = [String: KageAction]()
    for (sessionPath, sessionActions) in actionsBySession {
      if let action = sessionActions.first(where: { $0.type == "resume" }) {
        actions[sessionPath] = action
      }
    }
    return actions
  }

  private static func rowModels(
    for sessions: [AgentSession],
    dateLookup: [String: Date],
    matches: [String: SearchMatch]
  ) -> [String: DesktopSessionRowModel] {
    let now = Date()
    let relativeFormatter = RelativeDateTimeFormatter()
    relativeFormatter.unitsStyle = .abbreviated
    var models = [String: DesktopSessionRowModel]()
    models.reserveCapacity(sessions.count)

    for session in sessions {
      models[session.path] = DesktopSessionRowModel(
        session: session,
        updatedDate: dateLookup[session.path],
        match: matches[session.path],
        now: now,
        relativeFormatter: relativeFormatter
      )
    }

    return models
  }

  private static func sessionGroups(
    for sessions: [AgentSession],
    dateLookup: [String: Date]
  ) -> [DirectorySessionGroup] {
    let calendar = Calendar.current
    let monthFormatter = DateFormatter()
    monthFormatter.dateFormat = "MMMM yyyy"
    let grouped = Dictionary(grouping: sessions, by: \.cwd)

    return grouped.map { cwd, sessions in
      DirectorySessionGroup(
        cwd: cwd,
        sessions: sortSessions(sessions, dateLookup: dateLookup),
        dateLookup: dateLookup,
        calendar: calendar,
        monthFormatter: monthFormatter
      )
    }
    .sorted { lhs, rhs in
      if lhs.lastUpdated != rhs.lastUpdated {
        return lhs.lastUpdated > rhs.lastUpdated
      }
      return lhs.displayName.localizedCaseInsensitiveCompare(rhs.displayName) == .orderedAscending
    }
  }
}

private struct DesktopSessionRowModel: Equatable {
  let id: String
  let agent: String
  let agentLabel: String
  let displayTitle: String
  let cwd: String
  let relativeUpdatedAt: String
  let matchText: String?

  init(
    session: AgentSession,
    updatedDate: Date?,
    match: SearchMatch?,
    now: Date,
    relativeFormatter: RelativeDateTimeFormatter
  ) {
    self.id = dashboardSessionKey(session)
    self.agent = session.agent
    self.agentLabel = session.agentLabel
    self.displayTitle = session.displayTitle
    self.cwd = session.cwd
    if let updatedDate, updatedDate != .distantPast {
      self.relativeUpdatedAt = relativeFormatter.localizedString(for: updatedDate, relativeTo: now)
    } else {
      self.relativeUpdatedAt = "unknown"
    }
    self.matchText = match?.text
  }

  static func fallback(session: AgentSession, match: SearchMatch?) -> DesktopSessionRowModel {
    let relativeFormatter = RelativeDateTimeFormatter()
    relativeFormatter.unitsStyle = .abbreviated
    return DesktopSessionRowModel(
      session: session,
      updatedDate: parseSessionDate(session.updatedAt),
      match: match,
      now: Date(),
      relativeFormatter: relativeFormatter
    )
  }
}

private struct DesktopSessionListRow: View, Equatable {
  let model: DesktopSessionRowModel

  nonisolated static func == (lhs: DesktopSessionListRow, rhs: DesktopSessionListRow) -> Bool {
    lhs.model == rhs.model
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        AgentBadge(agent: model.agent, label: model.agentLabel, size: .small)
        Spacer()
        Text(model.relativeUpdatedAt)
          .font(.caption2)
          .foregroundStyle(.secondary)
      }

      Text(model.displayTitle)
        .font(.callout)
        .fontWeight(.medium)
        .lineLimit(2)

      Text(model.cwd)
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
        .truncationMode(.middle)

      if let matchText = model.matchText {
        Text(matchText)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
    }
    .padding(.vertical, 8)
  }
}

private struct DirectorySessionGroup: Identifiable {
  let cwd: String
  let sessions: [AgentSession]
  let displayName: String
  let parentPath: String
  let lastUpdated: Date
  let monthGroups: [MonthSessionGroup]
  let agentCounts: [(agent: String, label: String, count: Int)]

  var id: String {
    cwd
  }

  init(
    cwd: String,
    sessions: [AgentSession],
    dateLookup: [String: Date],
    calendar: Calendar,
    monthFormatter: DateFormatter
  ) {
    self.cwd = cwd
    self.sessions = sessions
    let url = URL(fileURLWithPath: cwd)
    self.displayName = url.lastPathComponent.isEmpty ? cwd : url.lastPathComponent
    self.parentPath = url.deletingLastPathComponent().path
    self.lastUpdated = sessions.map { sessionDate($0, dateLookup: dateLookup) }.max() ?? .distantPast
    let grouped = Dictionary(grouping: sessions) { session in
      monthBucket(session, dateLookup: dateLookup, calendar: calendar)
    }
    self.monthGroups = grouped.map { _, sessions in
      MonthSessionGroup(
        sessions: sortSessions(sessions, dateLookup: dateLookup),
        dateLookup: dateLookup,
        calendar: calendar,
        formatter: monthFormatter
      )
    }
    .sorted { lhs, rhs in
      lhs.sortDate > rhs.sortDate
    }

    let agentGroups = Dictionary(grouping: sessions, by: \.agent)
    self.agentCounts = agentGroups.map { agent, sessions in
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

private struct MonthSessionGroup: Identifiable {
  let sessions: [AgentSession]
  let id: String
  let label: String
  let sortDate: Date
  let isCurrentMonth: Bool

  init(
    sessions: [AgentSession],
    dateLookup: [String: Date],
    calendar: Calendar,
    formatter: DateFormatter
  ) {
    self.sessions = sessions
    self.id = monthBucket(sessions.first, dateLookup: dateLookup, calendar: calendar)
    self.sortDate = sessions.map { sessionDate($0, dateLookup: dateLookup) }.max() ?? .distantPast
    if sortDate == .distantPast {
      self.label = "Unknown date"
      self.isCurrentMonth = false
    } else {
      self.label = formatter.string(from: sortDate)
      self.isCurrentMonth = calendar.isDate(sortDate, equalTo: Date(), toGranularity: .month)
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

private struct MonthGroupHeader: View {
  let month: MonthSessionGroup

  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: "calendar")
      Text(month.label)
        .fontWeight(.medium)
      Spacer()
      Text("\(month.sessions.count)")
        .foregroundStyle(.secondary)
    }
    .font(.caption)
    .foregroundStyle(.secondary)
    .padding(.vertical, 4)
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

private func dashboardSessionKey(_ session: AgentSession) -> String {
  "\(session.agent):\(session.sessionId):\(session.path)"
}

private func sortSessions(_ sessions: [AgentSession], dateLookup: [String: Date]) -> [AgentSession] {
  sessions.sorted { lhs, rhs in
    let lhsDate = sessionDate(lhs, dateLookup: dateLookup)
    let rhsDate = sessionDate(rhs, dateLookup: dateLookup)
    if lhsDate != rhsDate {
      return lhsDate > rhsDate
    }
    return lhs.displayTitle.localizedCaseInsensitiveCompare(rhs.displayTitle) == .orderedAscending
  }
}

private func sessionDate(_ session: AgentSession, dateLookup: [String: Date]) -> Date {
  dateLookup[session.path] ?? parseSessionDate(session.updatedAt) ?? .distantPast
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

private func monthBucket(
  _ session: AgentSession?,
  dateLookup: [String: Date],
  calendar: Calendar
) -> String {
  guard let session else {
    return "unknown"
  }
  let date = sessionDate(session, dateLookup: dateLookup)
  guard date != .distantPast else {
    return "unknown"
  }
  let components = calendar.dateComponents([.year, .month], from: date)
  return String(format: "%04d-%02d", components.year ?? 0, components.month ?? 0)
}

private func monthBucket(_ session: AgentSession?) -> String {
  guard let date = parseSessionDate(session?.updatedAt) else {
    return "unknown"
  }
  let components = Calendar.current.dateComponents([.year, .month], from: date)
  return String(format: "%04d-%02d", components.year ?? 0, components.month ?? 0)
}

private func searchableSessionText(for session: AgentSession) -> String {
  ([session.agentLabel, session.displayTitle, session.sessionId, session.cwd, session.path] + session.recentUserMessages)
    .joined(separator: "\n")
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
    return AgentPalette.claude
  case "codex":
    return AgentPalette.codex
  case "qodercli", "qoderwork":
    return AgentPalette.qoder
  default:
    return .secondary
  }
}

private enum AgentPalette {
  static let codex = Color(hex: 0x3A86FF)
  static let qoder = Color(hex: 0x10A37F)
  static let claude = Color(hex: 0xD97757)
}

private extension Color {
  init(hex: UInt32) {
    self.init(
      red: Double((hex >> 16) & 0xff) / 255.0,
      green: Double((hex >> 8) & 0xff) / 255.0,
      blue: Double(hex & 0xff) / 255.0
    )
  }
}

private func agentIconName(_ agent: String?) -> String {
  switch agent {
  case "claude":
    return "sparkles"
  case "codex":
    return "terminal"
  case "qodercli", "qoderwork":
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
  let onOpenExternalCommand: (String, String) -> Void
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
        onContinue: onContinue,
        onOpenExternalCommand: onOpenExternalCommand
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
    case "qoderwork":
      return "QoderWork"
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
  let onOpenExternalCommand: (String, String) -> Void

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

        if !isDemoMode, let command = action.command {
          Button {
            onOpenExternalCommand(command, session.cwd)
          } label: {
            Label("Terminal.app", systemImage: "macwindow")
          }
        }
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

private struct DesktopStandaloneTerminalView: View {
  let session: EmbeddedTerminalSession
  let onClose: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 12) {
        Label(session.title, systemImage: "terminal")
          .font(.title3)
          .fontWeight(.semibold)

        Spacer()

        Text(session.cwd)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
          .truncationMode(.middle)

        Button {
          onClose()
        } label: {
          Image(systemName: "xmark")
            .accessibilityLabel("Close terminal")
        }
        .buttonStyle(.borderless)
      }

      EmbeddedTerminalView(session: session)
        .id(session.id)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
          RoundedRectangle(cornerRadius: 8)
            .stroke(Color.secondary.opacity(0.18))
        )
    }
    .padding(20)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .background(Color(nsColor: .textBackgroundColor))
  }
}

private struct DesktopNewSessionReadyView: View {
  let agent: LaunchableAgent
  let cwd: String
  let onStartInKage: () -> Void
  let onStartInTerminalApp: () -> Void
  let onCancel: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .center, spacing: 12) {
        Image(systemName: agent.iconName)
          .font(.title2)
          .foregroundStyle(agentTint(agent.id))
          .frame(width: 44, height: 44)
          .background(
            RoundedRectangle(cornerRadius: 8)
              .fill(agentTint(agent.id).opacity(0.14))
          )

        VStack(alignment: .leading, spacing: 5) {
          Text("New \(agent.label) session")
            .font(.title3)
            .fontWeight(.semibold)
          Text(URL(fileURLWithPath: cwd).lastPathComponent.isEmpty ? cwd : URL(fileURLWithPath: cwd).lastPathComponent)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }

        Spacer()

        Button {
          onStartInKage()
        } label: {
          Label("Start in KAGE", systemImage: "play.fill")
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)

        Button {
          onStartInTerminalApp()
        } label: {
          Label("Terminal.app", systemImage: "macwindow")
        }
        .controlSize(.large)

        Button {
          onCancel()
        } label: {
          Image(systemName: "xmark")
            .accessibilityLabel("Cancel new session")
        }
        .buttonStyle(.borderless)
      }

      VStack(alignment: .leading, spacing: 10) {
        Text("$ \(command)")
          .font(.title3.monospaced())
          .lineLimit(2)
          .truncationMode(.middle)
          .textSelection(.enabled)

        Text(cwd)
          .font(.caption.monospaced())
          .foregroundStyle(.secondary)
          .lineLimit(1)
          .truncationMode(.middle)
          .textSelection(.enabled)
      }
      .padding(14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        RoundedRectangle(cornerRadius: 8)
          .fill(Color.secondary.opacity(0.07))
      )

      Spacer()
    }
    .padding(20)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Color(nsColor: .textBackgroundColor))
  }

  private var command: String {
    AgentLaunchCommand.command(for: agent.id, cwd: cwd)
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
    case "qoderwork":
      return "QoderWork"
    default:
      return agent ?? "target"
    }
  }
}
