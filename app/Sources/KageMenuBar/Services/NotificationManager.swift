import Foundation
import KageContracts
@preconcurrency import UserNotifications

@MainActor
final class NotificationManager: ObservableObject {
  @Published var authorizationStatus: UNAuthorizationStatus = .notDetermined
  @Published var lastError: String?

  func clearError() {
    lastError = nil
  }

  func requestAuthorizationIfNeeded() async {
    let center = UNUserNotificationCenter.current()
    let settings = await center.notificationSettings()
    authorizationStatus = settings.authorizationStatus

    guard settings.authorizationStatus == .notDetermined else {
      lastError = nil
      return
    }

    do {
      _ = try await center.requestAuthorization(options: [.alert, .sound])
      authorizationStatus = await center.notificationSettings().authorizationStatus
      lastError = nil
    } catch {
      lastError = notificationErrorMessage(error)
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
      lastError = nil
    } catch {
      lastError = notificationErrorMessage(error)
    }
  }

  private func notificationErrorMessage(_ error: Error) -> String {
    let nsError = error as NSError
    if nsError.domain == UNErrorDomain, nsError.code == UNError.Code.notificationsNotAllowed.rawValue {
      return "Notifications are not allowed for KAGE. Enable them in System Settings or turn off Notifications here."
    }
    return error.localizedDescription
  }
}
