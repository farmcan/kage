import Foundation
import KageContracts

@MainActor
final class SessionPoller: ObservableObject {
  @Published var sessionsResponse: SessionsResponse?
  @Published var doctorResult: DoctorResult?
  @Published var actionsResponse: ActionsResponse?
  @Published var searchResponse: SearchResponse?
  @Published var errorMessage: String?
  @Published var searchErrorMessage: String?
  @Published var isRefreshing = false
  @Published var isSearching = false
  @Published var lastRefresh: Date?
  @Published var actionMessage: String?
  @Published var actionResult: RunActionResponse?
  @Published var loadsFullHistory = false

  private let cli = KageCLI()
  private var task: Task<Void, Never>?
  private var previousSessionIds = Set<String>()
  private var lastScope: String?
  private var lastDoctorRefresh: Date?
  private var refreshGeneration = 0
  private var doctorRefreshInFlight = false
  private let doctorRefreshInterval: TimeInterval = 300
  private let recentHistorySince = "90d"
  private let recentHistoryLimit = 120
  private let searchResultLimit = 50

  var totalSessions: Int {
    sessionsResponse?.sessions.count ?? 0
  }

  var hasWarning: Bool {
    errorMessage != nil || doctorResult?.ok == false
  }

  func start(appState: AppState, notifications: NotificationManager) {
    guard task == nil else {
      return
    }

    task = Task { [weak self, weak appState, weak notifications] in
      while !Task.isCancelled {
        guard let self, let appState, let notifications else {
          return
        }
        await self.refresh(appState: appState, notifications: notifications)
        let interval = UInt64(max(appState.refreshIntervalSec, 15) * 1_000_000_000)
        try? await Task.sleep(nanoseconds: interval)
      }
    }
  }

  func stop() {
    task?.cancel()
    task = nil
  }

  func refresh(appState: AppState, notifications: NotificationManager) async {
    refreshGeneration += 1
    let generation = refreshGeneration
    let watchedDirectory = appState.watchedDirectory
    let includeSubdirectories = appState.includeSubdirectories
    let scope = "\(watchedDirectory)|includeSubdirectories=\(includeSubdirectories)|fullHistory=\(loadsFullHistory)"
    if lastScope != scope {
      previousSessionIds.removeAll()
      lastScope = scope
    }

    isRefreshing = true
    errorMessage = nil
    defer {
      if generation == refreshGeneration {
        isRefreshing = false
        lastRefresh = Date()
      }
    }

    do {
      let since = loadsFullHistory ? nil : recentHistorySince
      let limit = loadsFullHistory ? nil : recentHistoryLimit
      let resolvedDesktopState = try await cli.desktopState(
        cwd: watchedDirectory,
        includeSubdirectories: includeSubdirectories,
        since: since,
        limit: limit
      )
      guard generation == refreshGeneration else {
        return
      }

      let resolvedSessions = resolvedDesktopState.sessionsResponse
      let resolvedActions = resolvedDesktopState.actionsResponse

      notifyNewSessions(resolvedSessions.sessions, appState: appState, notifications: notifications)

      actionsResponse = resolvedActions
      sessionsResponse = resolvedSessions

      if beginDoctorRefreshIfNeeded() {
        Task { [weak self] in
          await self?.refreshDoctor(cwd: watchedDirectory, generation: generation)
        }
      }
    } catch {
      guard generation == refreshGeneration else {
        return
      }
      errorMessage = error.localizedDescription
    }
  }

  func setLoadsFullHistory(_ enabled: Bool, appState: AppState, notifications: NotificationManager) async {
    guard loadsFullHistory != enabled else {
      return
    }
    loadsFullHistory = enabled
    await refresh(appState: appState, notifications: notifications)
  }

  func runAction(_ action: KageAction, appState: AppState, notifications: NotificationManager) async {
    actionMessage = nil
    actionResult = nil
    do {
      let result = try await cli.runAction(
        action,
        cwd: appState.watchedDirectory,
        includeSubdirectories: appState.includeSubdirectories
      )
      actionResult = result
      actionMessage = result.resumeCommand == nil ? "Ran \(action.label)" : nil
      await refresh(appState: appState, notifications: notifications)
    } catch {
      actionMessage = error.localizedDescription
    }
  }

  func search(query: String, appState: AppState) async {
    let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedQuery.isEmpty else {
      searchResponse = nil
      searchErrorMessage = nil
      isSearching = false
      return
    }

    isSearching = true
    searchErrorMessage = nil
    defer {
      isSearching = false
    }

    do {
      let since = loadsFullHistory ? nil : recentHistorySince
      searchResponse = try await cli.search(
        cwd: appState.watchedDirectory,
        query: trimmedQuery,
        agent: appState.selectedAgent,
        includeSubdirectories: appState.includeSubdirectories,
        since: since,
        limit: searchResultLimit
      )
    } catch {
      searchErrorMessage = error.localizedDescription
    }
  }

  func clearSearch() {
    searchResponse = nil
    searchErrorMessage = nil
  }

  func clearActionResult() {
    actionResult = nil
  }

  private func notifyNewSessions(
    _ sessions: [AgentSession],
    appState: AppState,
    notifications: NotificationManager
  ) {
    let ids = Set(sessions.map(\.id))
    defer {
      previousSessionIds = ids
    }

    guard !previousSessionIds.isEmpty, appState.notificationsEnabled else {
      return
    }

    let newIds = ids.subtracting(previousSessionIds)
    for session in sessions where newIds.contains(session.id) {
      notifications.notifyNewSession(session)
    }
  }

  private var shouldRefreshDoctor: Bool {
    guard let lastDoctorRefresh else {
      return true
    }
    return Date().timeIntervalSince(lastDoctorRefresh) >= doctorRefreshInterval
  }

  private func beginDoctorRefreshIfNeeded() -> Bool {
    guard shouldRefreshDoctor, !doctorRefreshInFlight else {
      return false
    }
    doctorRefreshInFlight = true
    return true
  }

  private func refreshDoctor(cwd: String, generation: Int) async {
    defer {
      doctorRefreshInFlight = false
    }

    do {
      let result = try await cli.doctor(cwd: cwd)
      guard generation == refreshGeneration else {
        return
      }
      doctorResult = result
      lastDoctorRefresh = Date()
    } catch {
      guard generation == refreshGeneration else {
        return
      }
      errorMessage = error.localizedDescription
    }
  }
}
