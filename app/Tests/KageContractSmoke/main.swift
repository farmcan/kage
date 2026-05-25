import Foundation
import KageContracts

do {
  let doctor = try decode(
    DoctorResult.self,
    """
    {
      "mode": "doctor",
      "ok": true,
      "cwd": "/tmp/project",
      "kageVersion": "0.1.0",
      "agents": [
        {
          "agent": "codex",
          "label": "Codex",
          "command": "codex",
          "installed": true,
          "version": "codex-cli 0.130.0",
          "commandError": null,
          "sessionRoot": {
            "path": "/Users/test/.codex/sessions",
            "exists": true,
            "readable": true,
            "writable": true
          },
          "resumeCommand": "codex resume <session-id>",
          "forkCommand": "codex fork <session-id>"
        }
      ]
    }
    """
  )
  try require(doctor.ok, "doctor ok should decode")
  try require(doctor.agents[0].sessionRoot.isHealthy, "doctor session root should decode as healthy")

  let sessions = try decode(
    SessionsResponse.self,
    """
    {
      "mode": "sessions",
      "cwd": "/tmp/project",
      "sessions": [
        {
          "agent": "claude",
          "agentLabel": "Claude",
          "sessionId": "session-1",
          "title": "Fix login",
          "updatedAt": "2026-05-25T06:56:02.409Z",
          "cwd": "/tmp/project",
          "path": "/Users/test/.claude/projects/-tmp-project/session-1.jsonl",
          "recentUserMessages": ["Fix login"]
        }
      ],
      "agents": [
        {
          "agent": "claude",
          "agentLabel": "Claude",
          "root": "/Users/test/.claude/projects",
          "sessions": [
            {
              "agent": "claude",
              "agentLabel": "Claude",
              "sessionId": "session-1",
              "title": "Fix login",
              "updatedAt": "2026-05-25T06:56:02.409Z",
              "cwd": "/tmp/project",
              "path": "/Users/test/.claude/projects/-tmp-project/session-1.jsonl",
              "recentUserMessages": ["Fix login"]
            }
          ]
        }
      ],
      "errors": []
    }
    """
  )
  try require(sessions.sessions[0].id == "claude:session-1", "session id should compose from agent and id")
  try require(sessions.agents[0].sessions[0].recentUserMessages == ["Fix login"], "recent user messages should decode")

  let actions = try decode(
    ActionsResponse.self,
    """
    {
      "mode": "actions",
      "cwd": "/tmp/project",
      "actions": [
        {
          "id": "resume:codex:session-1",
          "type": "resume",
          "label": "Resume latest Codex session",
          "agent": "codex",
          "sessionId": "session-1",
          "sessionPath": "/Users/test/.codex/sessions/session-1.jsonl",
          "command": "codex resume session-1"
        },
        {
          "id": "bridge:x2c:session-1",
          "type": "bridge",
          "label": "Bridge latest Codex session to Claude Code",
          "agent": "codex",
          "targetAgent": "claude",
          "sessionId": "session-1",
          "sessionPath": "/Users/test/.codex/sessions/session-1.jsonl",
          "routeAlias": "x2c",
          "cliArgs": ["x2c", "--session", "/Users/test/.codex/sessions/session-1.jsonl"]
        }
      ],
      "errors": []
    }
    """
  )
  try require(actions.actions.count == 2, "actions should decode")
  try require(actions.actions[0].command == "codex resume session-1", "resume command should decode")
  try require(actions.actions[1].targetAgent == "claude", "bridge target should decode")
} catch {
  fputs("KAGE contract smoke failed: \(error)\n", stderr)
  exit(1)
}

print("KAGE contract smoke passed")

private func decode<T: Decodable>(_ type: T.Type, _ payload: String) throws -> T {
  try JSONDecoder().decode(T.self, from: Data(payload.utf8))
}

private func require(_ condition: Bool, _ message: String) throws {
  if !condition {
    throw ContractSmokeError.failed(message)
  }
}

private enum ContractSmokeError: Error, CustomStringConvertible {
  case failed(String)

  var description: String {
    switch self {
    case let .failed(message):
      return message
    }
  }
}
