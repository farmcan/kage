import AppKit
import SwiftUI

@main
struct KageMenuBarApp: App {
  @NSApplicationDelegateAdaptor(KageAppDelegate.self) private var appDelegate
  @StateObject private var model = KageAppModel.shared

  init() {
    Task { @MainActor in
      try? await Task.sleep(nanoseconds: 300_000_000)
      KageWindowPresenter.shared.showDashboard()
    }
  }

  var body: some Scene {
    MenuBarExtra {
      MainMenuView()
        .environmentObject(model.appState)
        .environmentObject(model.poller)
        .environmentObject(model.notifications)
        .frame(width: 430, height: 560)
        .task {
          model.poller.start(appState: model.appState, notifications: model.notifications)
        }
    } label: {
      MenuBarLabelView()
        .environmentObject(model.poller)
    }
    .menuBarExtraStyle(.window)

    Settings {
      SettingsView()
        .environmentObject(model.appState)
        .environmentObject(model.poller)
        .environmentObject(model.notifications)
        .frame(width: 660, height: 640)
    }
  }

}

@MainActor
final class KageAppModel: ObservableObject {
  static let shared = KageAppModel()

  let appState = AppState()
  let poller = SessionPoller()
  let notifications = NotificationManager()
}

@MainActor
final class KageAppDelegate: NSObject, NSApplicationDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
      KageWindowPresenter.shared.showDashboard()
    }
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    KageWindowPresenter.shared.showDashboard()
    return true
  }
}

@MainActor
final class KageWindowPresenter {
  static let shared = KageWindowPresenter()

  private var dashboardWindow: NSWindow?

  func showDashboard() {
    NSApp.setActivationPolicy(.regular)
    NSApp.activate(ignoringOtherApps: true)
    NSRunningApplication.current.activate(options: [.activateAllWindows])

    if let dashboardWindow {
      dashboardWindow.makeKeyAndOrderFront(nil)
      return
    }

    let model = KageAppModel.shared
    let rootView = DesktopDashboardView()
      .environmentObject(model.appState)
      .environmentObject(model.poller)
      .environmentObject(model.notifications)
      .frame(minWidth: 1240, minHeight: 760)
      .task {
        model.poller.start(appState: model.appState, notifications: model.notifications)
      }

    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = "KAGE"
    window.isReleasedWhenClosed = false
    window.collectionBehavior = [.moveToActiveSpace, .managed]
    window.center()
    window.contentView = NSHostingView(rootView: rootView)
    window.makeKeyAndOrderFront(nil)
    window.orderFrontRegardless()
    dashboardWindow = window
  }
}
