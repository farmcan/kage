import Foundation
import KageContracts

private final class ProcessDataBuffer: @unchecked Sendable {
  private let lock = NSLock()
  private var storage = Data()

  func set(_ data: Data) {
    lock.lock()
    storage = data
    lock.unlock()
  }

  var data: Data {
    lock.lock()
    defer { lock.unlock() }
    return storage
  }
}

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

  func sessions(cwd: String, includeSubdirectories: Bool, since: String? = nil, limit: Int? = nil) async throws -> SessionsResponse {
    try await decode(
      SessionsResponse.self,
      args: KageCLIArguments.sessions(since: since, limit: limit, includeSubdirectories: includeSubdirectories),
      cwd: cwd
    )
  }

  func actions(cwd: String, includeSubdirectories: Bool, since: String? = nil, limit: Int? = nil) async throws -> ActionsResponse {
    try await decode(
      ActionsResponse.self,
      args: KageCLIArguments.actions(since: since, limit: limit, includeSubdirectories: includeSubdirectories),
      cwd: cwd
    )
  }

  func search(
    cwd: String,
    query: String,
    agent: String?,
    includeSubdirectories: Bool,
    since: String? = nil,
    limit: Int? = nil
  ) async throws -> SearchResponse {
    return try await decode(
      SearchResponse.self,
      args: KageCLIArguments.search(
        query: query,
        project: cwd,
        agent: agent,
        since: since,
        limit: limit,
        includeSubdirectories: includeSubdirectories
      ),
      cwd: cwd
    )
  }

  func runAction(_ action: KageAction, cwd: String, includeSubdirectories: Bool) async throws -> RunActionResponse {
    if let cliArgs = action.cliArgs {
      let result = try await decode(RunActionResponse.self, args: cliArgs + ["--json"], cwd: cwd)
      return attach(action: action, to: result)
    }

    let result = try await decode(
      RunActionResponse.self,
      args: KageCLIArguments.runAction(id: action.id, includeSubdirectories: includeSubdirectories),
      cwd: cwd
    )
    return attach(action: action, to: result)
  }

  private func attach(action: KageAction, to result: RunActionResponse) -> RunActionResponse {
    RunActionResponse(
      mode: result.mode,
      actionId: result.actionId ?? action.id,
      ok: result.ok ?? true,
      action: result.action ?? action,
      sourceAgent: result.sourceAgent ?? action.agent,
      targetAgent: result.targetAgent ?? action.targetAgent ?? action.agent,
      sessionId: result.sessionId ?? action.sessionId,
      sessionPath: result.sessionPath ?? action.sessionPath,
      resumeCommand: result.resumeCommand,
      outputPath: result.outputPath,
      sidecarPath: result.sidecarPath,
      paths: result.paths,
      stdout: result.stdout,
      stderr: result.stderr
    )
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
    let output = drainOutput(stdout: stdout, stderr: stderr, process: process)

    guard process.terminationStatus == 0 else {
      let stderrText = String(data: output.stderr, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      throw KageCLIError.executionFailed(
        command: command,
        exitCode: Int(process.terminationStatus),
        stderr: stderrText
      )
    }

    return output.stdout
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
    let output = drainOutput(stdout: stdout, stderr: stderr, process: process)

    guard process.terminationStatus == 0 else {
      let stderrText = String(data: output.stderr, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      throw KageCLIError.executionFailed(
        command: command,
        exitCode: Int(process.terminationStatus),
        stderr: stderrText
      )
    }

    return output.stdout
  }

  private func drainOutput(stdout: Pipe, stderr: Pipe, process: Process) -> (stdout: Data, stderr: Data) {
    let stdoutBuffer = ProcessDataBuffer()
    let stderrBuffer = ProcessDataBuffer()
    let group = DispatchGroup()
    let queue = DispatchQueue.global(qos: .userInitiated)

    group.enter()
    queue.async {
      stdoutBuffer.set(stdout.fileHandleForReading.readDataToEndOfFile())
      group.leave()
    }

    group.enter()
    queue.async {
      stderrBuffer.set(stderr.fileHandleForReading.readDataToEndOfFile())
      group.leave()
    }

    process.waitUntilExit()
    group.wait()

    return (stdoutBuffer.data, stderrBuffer.data)
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
