import Foundation

/// Rewrites an MPD so every media request goes back through the relay. Upstream directories
/// become signed relay directories (`/<token>/d/<base64url>/<sig>/`), so relative segment
/// templates keep resolving without the relay knowing each segment name.
enum RelayManifest {
  static let contentType = "application/dash+xml"

  private static let locationPattern = RelayManifest.compile(
    #"<Location\b[^>]*>.*?</Location>"#,
    dotAll: true
  )
  private static let rootPattern = RelayManifest.compile(#"<MPD\b[^>]*>"#, dotAll: false)
  private static let dynamicPattern = RelayManifest.compile(#"\stype\s*=\s*["']dynamic["']"#, dotAll: false)

  /// BaseURL elements (group 1 is the text) and the container tags that scope them.
  private static let structurePattern = RelayManifest.compile(
    #"<BaseURL(?:\s[^>]*)?(?<!/)>(.*?)</BaseURL>|<(/?)(MPD|Period|AdaptationSet|Representation)\b[^>]*>"#,
    dotAll: true
  )
  private static let attributePattern = RelayManifest.compile(
    #"(\s(?:media|initialization|index|sourceURL)\s*=\s*)(["'])(.*?)\2"#,
    dotAll: false
  )

  static func isManifest(_ body: String) -> Bool {
    return body.contains("<MPD")
  }

  /// True when the root `<MPD>` element declares `type="dynamic"`.
  static func isDynamic(_ body: String) -> Bool {
    guard let root = RelayManifest.firstMatch(rootPattern, in: body) else {
      return false
    }
    return RelayManifest.firstMatch(dynamicPattern, in: root) != nil
  }

  /// `manifestUrl` is the MPD URL after redirects. Each BaseURL resolves against its parent
  /// level's BaseURL (the MPD URL at the top), as a DASH client would resolve it.
  static func rewrite(_ body: String, manifestUrl: URL, routes: RelayRoutes) -> String {
    let source = RelayManifest.replaceAll(locationPattern, in: body, with: "")
    let sourceText = source as NSString
    var output = ""
    // First resolved BaseURL of each open MPD, Period, AdaptationSet, and Representation.
    var levels: [String?] = []
    var topLevelBase = false
    var last = 0
    if let structure = structurePattern {
      let matches = structure.matches(
        in: source,
        options: [],
        range: NSRange(location: 0, length: sourceText.length)
      )
      for match in matches {
        let textRange = match.range(at: 1)
        if textRange.location == NSNotFound {
          let slashRange = match.range(at: 2)
          let closing = slashRange.location != NSNotFound && slashRange.length > 0
          if closing {
            if !levels.isEmpty {
              levels.removeLast()
            }
          } else if !sourceText.substring(with: match.range).hasSuffix("/>") {
            levels.append(nil)
          }
          continue
        }
        if levels.count <= 1 {
          topLevelBase = true
        }
        var parent = manifestUrl.absoluteString
        if levels.count > 1 {
          for candidate in levels[0..<(levels.count - 1)].reversed() {
            if let candidate {
              parent = candidate
              break
            }
          }
        }
        let value = RelayManifest.xmlUnescape(
          sourceText.substring(with: textRange).trimmingCharacters(in: .whitespacesAndNewlines)
        )
        guard
          let parentUrl = URL(string: parent),
          let resolved = URL(string: value, relativeTo: parentUrl)?.absoluteString,
          RelayRoutes.isHttpUrl(resolved)
        else {
          continue
        }
        if let lastLevel = levels.indices.last, levels[lastLevel] == nil {
          levels[lastLevel] = resolved
        }
        let split = RelayManifest.splitDirectory(resolved)
        output += sourceText.substring(with: NSRange(location: last, length: textRange.location - last))
        output += routes.directory(split.directory) + RelayManifest.xmlEscape(split.rest)
        last = textRange.location + textRange.length
      }
    }
    output += sourceText.substring(from: last)

    var rewritten = output
    if !topLevelBase, let root = rootPattern {
      let rewrittenText = rewritten as NSString
      let found = root.firstMatch(
        in: rewritten,
        options: [],
        range: NSRange(location: 0, length: rewrittenText.length)
      )
      if let found {
        let directory = RelayManifest.splitDirectory(manifestUrl.absoluteString).directory
        let insertAt = found.range.location + found.range.length
        rewritten = rewrittenText.substring(to: insertAt)
          + "<BaseURL>" + routes.directory(directory) + "</BaseURL>"
          + rewrittenText.substring(from: insertAt)
      }
    }

    return RelayManifest.replaceMatches(attributePattern, in: rewritten) { match, text in
      let quote = text.substring(with: match.range(at: 2))
      let value = RelayManifest.xmlUnescape(text.substring(with: match.range(at: 3)))
      guard let relayed = RelayManifest.relayAbsoluteTemplate(value, routes: routes) else {
        return nil
      }
      return text.substring(with: match.range(at: 1)) + quote + relayed + quote
    }
  }

  /// An absolute `media`/`initialization`/`index`/`sourceURL` value, split before its
  /// template or query.
  private static func relayAbsoluteTemplate(_ value: String, routes: RelayRoutes) -> String? {
    guard RelayRoutes.isHttpUrl(value), let authority = value.range(of: "//")?.upperBound else {
      return nil
    }
    let stop = value.firstIndex(where: { $0 == "$" || $0 == "?" }) ?? value.endIndex
    guard stop > authority, let slash = value[authority..<stop].lastIndex(of: "/") else {
      return nil
    }
    let cut = value.index(after: slash)
    return routes.directory(String(value[..<cut])) + RelayManifest.xmlEscape(String(value[cut...]))
  }

  /// The URL up to and including the last `/` of its path, and whatever follows.
  static func splitDirectory(_ absolute: String) -> (directory: String, rest: String) {
    let pathEnd = absolute.firstIndex(where: { $0 == "?" || $0 == "#" }) ?? absolute.endIndex
    let authorityStart = absolute.range(of: "//")?.upperBound ?? absolute.startIndex
    if authorityStart < pathEnd, let slash = absolute[authorityStart..<pathEnd].lastIndex(of: "/") {
      let cut = absolute.index(after: slash)
      return (directory: String(absolute[..<cut]), rest: String(absolute[cut...]))
    }
    return (directory: String(absolute[..<pathEnd]) + "/", rest: String(absolute[pathEnd...]))
  }

  private static func xmlUnescape(_ value: String) -> String {
    if !value.contains("&") {
      return value
    }
    return value
      .replacingOccurrences(of: "&lt;", with: "<")
      .replacingOccurrences(of: "&gt;", with: ">")
      .replacingOccurrences(of: "&quot;", with: "\"")
      .replacingOccurrences(of: "&apos;", with: "'")
      .replacingOccurrences(of: "&amp;", with: "&")
  }

  private static func xmlEscape(_ value: String) -> String {
    return value
      .replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
      .replacingOccurrences(of: "\"", with: "&quot;")
      .replacingOccurrences(of: "'", with: "&apos;")
  }

  private static func compile(_ pattern: String, dotAll: Bool) -> NSRegularExpression? {
    let options: NSRegularExpression.Options = dotAll ? [.dotMatchesLineSeparators] : []
    return try? NSRegularExpression(pattern: pattern, options: options)
  }

  private static func firstMatch(_ regex: NSRegularExpression?, in text: String) -> String? {
    guard let regex else {
      return nil
    }
    let nsText = text as NSString
    let found = regex.firstMatch(in: text, options: [], range: NSRange(location: 0, length: nsText.length))
    guard let found else {
      return nil
    }
    return nsText.substring(with: found.range)
  }

  private static func replaceAll(_ regex: NSRegularExpression?, in text: String, with template: String) -> String {
    guard let regex else {
      return text
    }
    let nsText = text as NSString
    return regex.stringByReplacingMatches(
      in: text,
      options: [],
      range: NSRange(location: 0, length: nsText.length),
      withTemplate: template
    )
  }

  /// Applies `transform` to each match. A nil result keeps that match.
  private static func replaceMatches(
    _ regex: NSRegularExpression?,
    in text: String,
    _ transform: (NSTextCheckingResult, NSString) -> String?
  ) -> String {
    guard let regex else {
      return text
    }
    let nsText = text as NSString
    let matches = regex.matches(in: text, options: [], range: NSRange(location: 0, length: nsText.length))
    if matches.isEmpty {
      return text
    }
    var result = ""
    var last = 0
    for match in matches {
      result += nsText.substring(with: NSRange(location: last, length: match.range.location - last))
      result += transform(match, nsText) ?? nsText.substring(with: match.range)
      last = match.range.location + match.range.length
    }
    result += nsText.substring(from: last)
    return result
  }
}
