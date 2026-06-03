import Foundation

struct UpdateCheckResult: Equatable, Sendable {
  let currentVersion: String
  let latestVersion: String
  let releaseURL: URL

  var isUpdateAvailable: Bool {
    ComparableVersion(latestVersion) > ComparableVersion(currentVersion)
  }
}

struct GitHubReleaseUpdateChecker: Sendable {
  private let latestReleaseURL = URL(string: "https://api.github.com/repos/farmcan/kage/releases/latest")!

  func check(currentVersion: String) async throws -> UpdateCheckResult {
    var request = URLRequest(url: latestReleaseURL)
    request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
    request.setValue("KAGE", forHTTPHeaderField: "User-Agent")

    let (data, response) = try await URLSession.shared.data(for: request)
    if let httpResponse = response as? HTTPURLResponse, !(200..<300).contains(httpResponse.statusCode) {
      throw UpdateCheckError.badStatus(httpResponse.statusCode)
    }

    let release = try JSONDecoder().decode(GitHubLatestRelease.self, from: data)
    guard let releaseURL = URL(string: release.htmlURL) else {
      throw UpdateCheckError.invalidReleaseURL
    }

    return UpdateCheckResult(
      currentVersion: currentVersion,
      latestVersion: release.tagName,
      releaseURL: releaseURL
    )
  }
}

private struct GitHubLatestRelease: Decodable {
  let tagName: String
  let htmlURL: String

  enum CodingKeys: String, CodingKey {
    case tagName = "tag_name"
    case htmlURL = "html_url"
  }
}

private enum UpdateCheckError: LocalizedError {
  case badStatus(Int)
  case invalidReleaseURL

  var errorDescription: String? {
    switch self {
    case .badStatus(let status):
      return "GitHub returned HTTP \(status)."
    case .invalidReleaseURL:
      return "GitHub returned an invalid release URL."
    }
  }
}

private struct ComparableVersion: Comparable {
  let parts: [Int]

  init(_ rawValue: String) {
    let normalized = rawValue.trimmingCharacters(in: CharacterSet(charactersIn: "vV"))
    parts = normalized.split(separator: ".").map { part in
      Int(part.prefix { $0.isNumber }) ?? 0
    }
  }

  static func < (left: ComparableVersion, right: ComparableVersion) -> Bool {
    let maxCount = max(left.parts.count, right.parts.count)
    for index in 0..<maxCount {
      let leftPart = index < left.parts.count ? left.parts[index] : 0
      let rightPart = index < right.parts.count ? right.parts[index] : 0
      if leftPart != rightPart {
        return leftPart < rightPart
      }
    }
    return false
  }
}
