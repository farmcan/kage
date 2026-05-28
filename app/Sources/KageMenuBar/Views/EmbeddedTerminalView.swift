import AppKit
import SwiftTerm
import SwiftUI

struct EmbeddedTerminalSession: Identifiable, Equatable {
  let id = UUID()
  let title: String
  let command: String
  let cwd: String
}

struct EmbeddedTerminalView: NSViewRepresentable {
  let session: EmbeddedTerminalSession

  func makeCoordinator() -> Coordinator {
    Coordinator()
  }

  func makeNSView(context: Context) -> LocalProcessTerminalView {
    let terminal = LocalProcessTerminalView(frame: .zero)
    terminal.processDelegate = context.coordinator
    terminal.autoresizingMask = [.width, .height]
    terminal.nativeForegroundColor = NSColor(calibratedWhite: 0.86, alpha: 1)
    terminal.nativeBackgroundColor = NSColor(calibratedRed: 0.08, green: 0.09, blue: 0.10, alpha: 1)
    terminal.layer?.backgroundColor = terminal.nativeBackgroundColor.cgColor
    terminal.caretColor = .systemGreen
    terminal.getTerminal().setCursorStyle(.steadyBlock)
    do {
      try terminal.setUseMetal(false)
    } catch {
      // TextKit rendering is good enough for the first embedded-terminal pass.
    }

    let environment = terminalEnvironment()
    terminal.feed(text: "$ \(session.command)\r\n")
    terminal.startProcess(
      executable: "/bin/zsh",
      args: ["-lc", session.command],
      environment: environment,
      currentDirectory: session.cwd
    )
    DispatchQueue.main.async {
      terminal.window?.makeFirstResponder(terminal)
    }
    return terminal
  }

  func updateNSView(_ nsView: LocalProcessTerminalView, context: Context) {}

  private func terminalEnvironment() -> [String] {
    var environment = ProcessInfo.processInfo.environment
    let fallbackPath = [
      environment["PATH"],
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "\(NSHomeDirectory())/.npm-global/bin",
      "\(NSHomeDirectory())/.local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ]
      .compactMap(\.self)
      .joined(separator: ":")
    environment["PATH"] = fallbackPath
    environment["TERM"] = "xterm-256color"
    environment["COLORTERM"] = "truecolor"
    return environment.map { "\($0.key)=\($0.value)" }
  }

  final class Coordinator: NSObject, LocalProcessTerminalViewDelegate {
    func sizeChanged(source: LocalProcessTerminalView, newCols: Int, newRows: Int) {}

    func setTerminalTitle(source: LocalProcessTerminalView, title: String) {}

    func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}

    func processTerminated(source: TerminalView, exitCode: Int32?) {}
  }
}
