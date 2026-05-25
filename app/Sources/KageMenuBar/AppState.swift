import AppKit
import Foundation
import ServiceManagement

@MainActor
final class AppState: ObservableObject {
  private enum Keys {
    static let watchedDirectory = "watchedDirectory"
    static let watchedDirectoryHistory = "watchedDirectoryHistory"
    static let refreshIntervalSec = "refreshIntervalSec"
    static let notificationsEnabled = "notificationsEnabled"
    static let launchAtLogin = "launchAtLogin"
  }

  private let defaults: UserDefaults

  @Published var watchedDirectory: String {
    didSet {
      let normalizedDirectory = DirectoryHistory.normalized(watchedDirectory)
      defaults.set(normalizedDirectory, forKey: Keys.watchedDirectory)
      watchedDirectoryHistory = DirectoryHistory.adding(normalizedDirectory, to: watchedDirectoryHistory)
      defaults.set(watchedDirectoryHistory, forKey: Keys.watchedDirectoryHistory)
    }
  }

  @Published var watchedDirectoryHistory: [String]

  @Published var refreshIntervalSec: Double {
    didSet {
      defaults.set(refreshIntervalSec, forKey: Keys.refreshIntervalSec)
    }
  }

  @Published var notificationsEnabled: Bool {
    didSet {
      defaults.set(notificationsEnabled, forKey: Keys.notificationsEnabled)
    }
  }

  @Published var launchAtLogin: Bool {
    didSet {
      defaults.set(launchAtLogin, forKey: Keys.launchAtLogin)
    }
  }

  @Published var launchAtLoginError: String?
  @Published var selectedAgent: String = "all"

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    let savedDirectory = defaults.string(forKey: Keys.watchedDirectory) ?? NSHomeDirectory()
    let normalizedDirectory = DirectoryHistory.normalized(savedDirectory)
    self.watchedDirectory = normalizedDirectory
    self.watchedDirectoryHistory = defaults.stringArray(forKey: Keys.watchedDirectoryHistory) ?? [normalizedDirectory]
    let savedInterval = defaults.double(forKey: Keys.refreshIntervalSec)
    self.refreshIntervalSec = savedInterval > 0 ? savedInterval : 300
    self.notificationsEnabled = defaults.object(forKey: Keys.notificationsEnabled) as? Bool ?? true
    self.launchAtLogin = defaults.object(forKey: Keys.launchAtLogin) as? Bool ?? false
  }

  func chooseWatchedDirectory() {
    let panel = NSOpenPanel()
    panel.canChooseFiles = false
    panel.canChooseDirectories = true
    panel.allowsMultipleSelection = false
    panel.directoryURL = URL(fileURLWithPath: watchedDirectory, isDirectory: true)

    if panel.runModal() == .OK, let path = panel.url?.path {
      watchedDirectory = path
    }
  }

  func useHomeDirectory() {
    watchedDirectory = NSHomeDirectory()
  }

  func setLaunchAtLogin(_ enabled: Bool) {
    launchAtLogin = enabled
    launchAtLoginError = nil
    do {
      if enabled {
        try SMAppService.mainApp.register()
      } else {
        try SMAppService.mainApp.unregister()
      }
    } catch {
      launchAtLoginError = error.localizedDescription
    }
  }
}
