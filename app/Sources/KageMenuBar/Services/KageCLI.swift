import Foundation
import KageContracts

enum KageCLIError: LocalizedError {
  case notFound
  case executionFailed(command: String, exitCode: Int, stderr: String)
  case decodingFailed(command: String, message: String)

  var errorDescription: String? {
    switch self {
    case .notFound:
      return "kage was not found in the usual locations or shell PATH."
    case let .executionFailed(command, exitCode, stderr):
      return "\(command) exited with \(exitCode): \(stderr)"
    case let .decodingFailed(command, message):
      return "Could not decode \(command): \(message)"
    }
  }
}

actor KageCLI {
  private var cachedBinary: String?

  func doctor(cwd: String) async throws -> DoctorResult {
    try await decode(DoctorResult.self, args: ["doctor", "--json"], cwd: cwd)
  }

  func sessions(cwd: String, includeSubdirectories: Bool) async throws -> SessionsResponse {
    try await decode(SessionsResponse.self, args: scopedArgs(["sessions", "--json"], includeSubdirectories), cwd: cwd)
  }

  func actions(cwd: String, includeSubdirectories: Bool) async throws -> ActionsResponse {
    try await decode(ActionsResponse.self, args: scopedArgs(["actions", "--json"], includeSubdirectories), cwd: cwd)
  }

  func runAction(id: String, cwd: String, includeSubdirectories: Bool) async throws -> RunActionResponse {
    try await decode(
      RunActionResponse.self,
      args: scopedArgs(["run-action", id, "--json"], includeSubdirectories),
      cwd: cwd
    )
  }

  private func scopedArgs(_ args: [String], _ includeSubdirectories: Bool) -> [String] {
    includeSubdirectories ? args + ["--include-subdirs"] : args
  }

  private func decode<T: Decodable>(_ type: T.Type, args: [String], cwd: String) async throws -> T {
    let binary = try locateBinary()
    let command = commandLine(binary: binary, args: args)
    let data = try runBinary(binary: binary, args: args, cwd: cwd, command: command)
    do {
      return try JSONDecoder().decode(T.self, from: data)
    } catch {
      throw KageCLIError.decodingFailed(command: command, message: error.localizedDescription)
    }
  }

  private func commandLine(binary: String, args: [String]) -> String {
    return ([binary] + args).map(shellQuote).joined(separator: " ")
  }

  private func locateBinary() throws -> String {
    if let cachedBinary {
      return cachedBinary
    }

    let environmentPath = ProcessInfo.processInfo.environment["KAGE_PATH"]
    let bundledPath = Bundle.main.resourceURL?.appendingPathComponent("kage").path
    let candidates = [
      environmentPath,
      bundledPath,
      "/usr/local/bin/kage",
      "/opt/homebrew/bin/kage",
      "\(NSHomeDirectory())/.npm-global/bin/kage",
      "\(NSHomeDirectory())/.local/bin/kage",
    ]

    for candidate in candidates.compactMap(\.self) where FileManager.default.isExecutableFile(atPath: candidate) {
      cachedBinary = candidate
      return candidate
    }

    do {
      let data = try runShell("command -v kage", cwd: nil)
      let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
      if let path, !path.isEmpty {
        cachedBinary = path
        return path
      }
    } catch {
      throw KageCLIError.notFound
    }

    throw KageCLIError.notFound
  }

  private func runShell(_ command: String, cwd: String?) throws -> Data {
    let process = Process()
    let stdout = Pipe()
    let stderr = Pipe()

    process.executableURL = URL(fileURLWithPath: "/bin/zsh")
    process.arguments = ["-lc", command]
    process.standardOutput = stdout
    process.standardError = stderr
    if let cwd {
      process.currentDirectoryURL = URL(fileURLWithPath: cwd, isDirectory: true)
    }

    try process.run()
    process.waitUntilExit()

    let stdoutData = stdout.fileHandleForReading.readDataToEndOfFile()
    let stderrData = stderr.fileHandleForReading.readDataToEndOfFile()

    guard process.terminationStatus == 0 else {
      let stderrText = String(data: stderrData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      throw KageCLIError.executionFailed(
        command: command,
        exitCode: Int(process.terminationStatus),
        stderr: stderrText
      )
    }

    return stdoutData
  }

  private func runBinary(binary: String, args: [String], cwd: String, command: String) throws -> Data {
    let process = Process()
    let stdout = Pipe()
    let stderr = Pipe()

    process.executableURL = URL(fileURLWithPath: binary)
    process.arguments = args
    process.standardOutput = stdout
    process.standardError = stderr
    process.currentDirectoryURL = URL(fileURLWithPath: cwd, isDirectory: true)
    process.environment = executionEnvironment()

    try process.run()
    process.waitUntilExit()

    let stdoutData = stdout.fileHandleForReading.readDataToEndOfFile()
    let stderrData = stderr.fileHandleForReading.readDataToEndOfFile()

    guard process.terminationStatus == 0 else {
      let stderrText = String(data: stderrData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      throw KageCLIError.executionFailed(
        command: command,
        exitCode: Int(process.terminationStatus),
        stderr: stderrText
      )
    }

    return stdoutData
  }

  private func executionEnvironment() -> [String: String] {
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
    return environment
  }

  private func shellQuote(_ value: String) -> String {
    "'\(value.replacingOccurrences(of: "'", with: "'\"'\"'"))'"
  }
}
