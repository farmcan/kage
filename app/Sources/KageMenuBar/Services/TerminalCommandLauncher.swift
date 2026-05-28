import AppKit
import Foundation

enum TerminalCommandLauncher {
  static func copy(_ command: String) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(command, forType: .string)
  }

  static func open(command: String, cwd: String) throws {
    let scriptPath = try writeCommand(command, cwd: cwd)
    NSWorkspace.shared.open(scriptPath)
  }

  private static func writeCommand(_ command: String, cwd: String) throws -> URL {
    cleanupOldCommands()
    let fileName = "kage-resume-\(UUID().uuidString).command"
    let fileURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(fileName)
    let script = """
    #!/bin/zsh
    cd \(shellQuote(cwd))
    \(command)
    rm -f \(shellQuote(fileURL.path))

    """
    try script.write(to: fileURL, atomically: true, encoding: .utf8)
    try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: fileURL.path)
    return fileURL
  }

  private static func cleanupOldCommands() {
    let tempURL = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
    guard let files = try? FileManager.default.contentsOfDirectory(
      at: tempURL,
      includingPropertiesForKeys: [.contentModificationDateKey],
      options: [.skipsHiddenFiles]
    ) else {
      return
    }

    let cutoff = Date().addingTimeInterval(-24 * 60 * 60)
    for file in files where file.lastPathComponent.hasPrefix("kage-resume-") && file.pathExtension == "command" {
      let modifiedAt = (try? file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
      if modifiedAt < cutoff {
        try? FileManager.default.removeItem(at: file)
      }
    }
  }

  private static func shellQuote(_ value: String) -> String {
    "'\(value.replacingOccurrences(of: "'", with: "'\"'\"'"))'"
  }
}
