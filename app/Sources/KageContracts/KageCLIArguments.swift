public enum KageCLIArguments {
  public static func sessions(
    since: String? = nil,
    limit: Int? = nil,
    includeSubdirectories: Bool = false
  ) -> [String] {
    scoped(bounded(["sessions", "--json"], since: since, limit: limit), includeSubdirectories: includeSubdirectories)
  }

  public static func actions(
    since: String? = nil,
    limit: Int? = nil,
    includeSubdirectories: Bool = false
  ) -> [String] {
    scoped(bounded(["actions", "--json"], since: since, limit: limit), includeSubdirectories: includeSubdirectories)
  }

  public static func desktopState(
    since: String? = nil,
    limit: Int? = nil,
    includeSubdirectories: Bool = false
  ) -> [String] {
    scoped(bounded(["desktop-state", "--json"], since: since, limit: limit), includeSubdirectories: includeSubdirectories)
  }

  public static func search(
    query: String,
    project: String,
    agent: String?,
    since: String? = nil,
    limit: Int? = nil,
    includeSubdirectories: Bool = false
  ) -> [String] {
    var args = bounded(["search", query, "--project", project, "--json"], since: since, limit: limit)
    if let agent, agent != "all" {
      args += ["--agent", agent]
    }
    return scoped(args, includeSubdirectories: includeSubdirectories)
  }

  public static func runAction(id: String, includeSubdirectories: Bool = false) -> [String] {
    scoped(["run-action", id, "--json"], includeSubdirectories: includeSubdirectories)
  }

  public static func scoped(_ args: [String], includeSubdirectories: Bool) -> [String] {
    includeSubdirectories ? args + ["--include-subdirs"] : args
  }

  private static func bounded(_ args: [String], since: String?, limit: Int?) -> [String] {
    var next = args
    if let since {
      next += ["--since", since]
    }
    if let limit {
      next += ["--limit", String(limit)]
    }
    return next
  }
}
