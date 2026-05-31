import AppKit
import Foundation

enum FileLauncher {
  static func open(path: String) {
    let url = URL(fileURLWithPath: path)
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = true
    if let applicationURL = NSWorkspace.shared.urlForApplication(toOpen: url) {
      NSWorkspace.shared.open([url], withApplicationAt: applicationURL, configuration: configuration) { app, _ in
        app?.activate(options: [.activateAllWindows])
      }
    } else {
      NSWorkspace.shared.open(url)
    }
  }

  static func reveal(path: String) {
    NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
  }
}
