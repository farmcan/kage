import Foundation
import KageContracts

@MainActor
final class SessionPoller: ObservableObject {
  @Published var sessionsResponse: SessionsResponse?
  @Published var doctorResult: DoctorResult?
  @Published var actionsResponse: ActionsResponse?
  @Published var errorMessage: String?
  @Published var isRefreshing = false
  @Published var lastRefresh: Date?
  @Published var actionMessage: String?

  private let cli = KageCLI()
  private var task: Task<Void, Never>?
  private var previousSessionIds = Set<String>()
  private var lastDirectory: String?

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
        let interval = UInt64(max(appState.refreshIntervalSec, 30) * 1_000_000_000)
        try? await Task.sleep(nanoseconds: interval)
      }
    }
  }

  func stop() {
    task?.cancel()
    task = nil
  }

  func refresh(appState: AppState, notifications: NotificationManager) async {
    let watchedDirectory = appState.watchedDirectory
    if lastDirectory != watchedDirectory {
      previousSessionIds.removeAll()
      lastDirectory = watchedDirectory
    }

    isRefreshing = true
    errorMessage = nil
    defer {
      isRefreshing = false
      lastRefresh = Date()
    }

    do {
      async let sessions = cli.sessions(cwd: watchedDirectory)
      async let doctor = cli.doctor(cwd: watchedDirectory)
      async let actions = cli.actions(cwd: watchedDirectory)

      let resolvedSessions = try await sessions
      let resolvedDoctor = try await doctor
      let resolvedActions = try await actions

      notifyNewSessions(resolvedSessions.sessions, appState: appState, notifications: notifications)

      sessionsResponse = resolvedSessions
      doctorResult = resolvedDoctor
      actionsResponse = resolvedActions
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func runAction(_ action: KageAction, appState: AppState, notifications: NotificationManager) async {
    actionMessage = nil
    do {
      _ = try await cli.runAction(id: action.id, cwd: appState.watchedDirectory)
      actionMessage = "Ran \(action.label)"
      await refresh(appState: appState, notifications: notifications)
    } catch {
      actionMessage = error.localizedDescription
    }
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
}
