import Foundation

enum DirectoryHistory {
  static func normalized(_ path: String) -> String {
    NSString(string: path).standardizingPath
  }

  static func adding(_ path: String, to history: [String], limit: Int = 5) -> [String] {
    let normalizedPath = normalized(path)
    var next = history.filter { normalized($0) != normalizedPath }
    next.insert(normalizedPath, at: 0)
    return Array(next.prefix(limit))
  }
}
