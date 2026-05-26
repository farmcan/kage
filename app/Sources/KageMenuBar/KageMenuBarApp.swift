import SwiftUI

@main
struct KageMenuBarApp: App {
  @StateObject private var appState = AppState()
  @StateObject private var poller = SessionPoller()
  @StateObject private var notifications = NotificationManager()

  var body: some Scene {
    MenuBarExtra {
      MainMenuView()
        .environmentObject(appState)
        .environmentObject(poller)
        .environmentObject(notifications)
        .frame(width: 430, height: 560)
        .task {
          poller.start(appState: appState, notifications: notifications)
        }
    } label: {
      MenuBarLabelView()
        .environmentObject(poller)
    }
    .menuBarExtraStyle(.window)

    Settings {
      SettingsView()
        .environmentObject(appState)
        .environmentObject(poller)
        .environmentObject(notifications)
        .frame(width: 660, height: 640)
    }
  }
}
