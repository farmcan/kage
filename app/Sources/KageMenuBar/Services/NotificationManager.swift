import Foundation
import KageContracts
@preconcurrency import UserNotifications

@MainActor
final class NotificationManager: ObservableObject {
  @Published var authorizationStatus: UNAuthorizationStatus = .notDetermined
  @Published var lastError: String?

  func requestAuthorizationIfNeeded() async {
    let center = UNUserNotificationCenter.current()
    let settings = await center.notificationSettings()
    authorizationStatus = settings.authorizationStatus

    guard settings.authorizationStatus == .notDetermined else {
      return
    }

    do {
      _ = try await center.requestAuthorization(options: [.alert, .sound])
      authorizationStatus = await center.notificationSettings().authorizationStatus
    } catch {
      lastError = error.localizedDescription
    }
  }

  func notifyNewSession(_ session: AgentSession) {
    Task {
      await deliverNewSessionNotification(session)
    }
  }

  private func deliverNewSessionNotification(_ session: AgentSession) async {
    await requestAuthorizationIfNeeded()

    guard authorizationStatus == .authorized || authorizationStatus == .provisional else {
      return
    }

    let content = UNMutableNotificationContent()
    content.title = "New \(session.agentLabel) session"
    content.body = "\(session.displayTitle)\n\(session.cwd)"
    content.sound = .default

    let request = UNNotificationRequest(
      identifier: "kage.\(session.id).\(UUID().uuidString)",
      content: content,
      trigger: nil
    )
    do {
      try await UNUserNotificationCenter.current().add(request)
    } catch {
      lastError = error.localizedDescription
    }
  }
}
