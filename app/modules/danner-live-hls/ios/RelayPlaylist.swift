import Foundation

/// HLS parsing and rewriting for the relay. Variant selection matches `src/relayVariant.ts`.
enum RelayPlaylist {
  static let maxBandwidth = 3_500_000

  /// One `NAME=value` attribute of a tag line. The value span indexes the line's characters
  /// and excludes quotes.
  struct Attribute {
    let name: String
    let value: String
    let valueStart: Int
    let valueEnd: Int
    let quoted: Bool
  }

  struct Variant {
    let info: String
    let audioOnly: Bool
    let bandwidth: Int
    let url: URL
    let audioGroup: String?
  }

  /// One `#EXT-X-MEDIA` line of a master playlist.
  struct MediaTag {
    let line: String
    let type: String?
    let groupId: String?
    let uri: String?
  }

  struct Master {
    let independentSegments: Bool
    let variants: [Variant]
    let media: [MediaTag]

    var selected: Variant? {
      return RelayPlaylist.select(variants)
    }

    /// The renditions of `variant`'s `AUDIO` group, in playlist order.
    func audioGroup(_ variant: Variant) -> [MediaTag] {
      guard let group = variant.audioGroup else {
        return []
      }
      return media.filter { $0.type == "AUDIO" && $0.groupId == group }
    }
  }

  struct MediaInfo {
    let live: Bool
    let segmentFormat: String
  }

  /// The body without a leading byte-order mark or whitespace.
  static func playlistText(_ body: String) -> String {
    var rest = Substring(body)
    while let first = rest.first, first == "\u{FEFF}" || first.isWhitespace {
      rest = rest.dropFirst()
    }
    return String(rest)
  }

  /// The provider answers a dropped stream with a 200 error page, so a body that is not a
  /// playlist has to fail rather than reach the receiver as rewritten segment lines.
  static func isPlaylist(_ body: String) -> Bool {
    return playlistText(body).hasPrefix("#EXTM3U")
  }

  static func lines(_ body: String) -> [String] {
    return playlistText(body)
      .replacingOccurrences(of: "\r\n", with: "\n")
      .replacingOccurrences(of: "\r", with: "\n")
      .components(separatedBy: "\n")
  }

  static func resolve(_ value: String, base: URL) -> String? {
    return URL(string: value, relativeTo: base)?.absoluteString
  }

  /// `data:` and `skd:` payloads are not fetched from the provider and stay as written.
  static func isOpaque(_ value: String) -> Bool {
    let lower = value.lowercased()
    return lower.hasPrefix("data:") || lower.hasPrefix("skd:")
  }

  /// Attributes after the tag's `:`. Quoted values keep their commas.
  static func attributes(_ line: String) -> [Attribute] {
    let chars = Array(line)
    guard let colon = chars.firstIndex(of: ":") else {
      return []
    }
    var result: [Attribute] = []
    var index = colon + 1
    while index < chars.count {
      while index < chars.count && (chars[index] == "," || chars[index] == " ") {
        index += 1
      }
      guard let equals = RelayPlaylist.firstIndex(of: "=", in: chars, from: index) else {
        break
      }
      let name = String(chars[index..<equals]).trimmingCharacters(in: .whitespaces)
      let valueStart = equals + 1
      if valueStart < chars.count && chars[valueStart] == "\"" {
        guard let close = RelayPlaylist.firstIndex(of: "\"", in: chars, from: valueStart + 1) else {
          break
        }
        result.append(Attribute(
          name: name,
          value: String(chars[(valueStart + 1)..<close]),
          valueStart: valueStart + 1,
          valueEnd: close,
          quoted: true
        ))
        index = close + 1
      } else {
        let comma = RelayPlaylist.firstIndex(of: ",", in: chars, from: valueStart) ?? chars.count
        result.append(Attribute(
          name: name,
          value: String(chars[valueStart..<comma]),
          valueStart: valueStart,
          valueEnd: comma,
          quoted: false
        ))
        index = comma
      }
      guard let next = RelayPlaylist.firstIndex(of: ",", in: chars, from: index) else {
        break
      }
      index = next + 1
    }
    return result
  }

  static func attributeValue(_ attributes: [Attribute], _ name: String) -> String? {
    return attributes.first(where: { $0.name == name })?.value
  }

  /// Replaces each quoted `URI` value on a tag line. A nil `transform` result keeps that value.
  static func rewriteUriAttributes(_ line: String, _ transform: (String) -> String?) -> String {
    let uris = attributes(line).filter { $0.name == "URI" && $0.quoted }
    if uris.isEmpty {
      return line
    }
    let chars = Array(line)
    var output = ""
    var last = 0
    for attribute in uris {
      guard let replacement = transform(attribute.value) else {
        continue
      }
      output += String(chars[last..<attribute.valueStart])
      output += replacement
      last = attribute.valueEnd
    }
    output += String(chars[last..<chars.count])
    return output
  }

  /// nil when `body` is a media playlist rather than a master. `base` is the playlist URL
  /// after redirects.
  static func parseMaster(_ body: String, base: URL) -> Master? {
    let all = lines(body).map { $0.trimmingCharacters(in: .whitespaces) }
    guard all.contains(where: { $0.hasPrefix("#EXT-X-STREAM-INF") }) else {
      return nil
    }
    var independentSegments = false
    var variants: [Variant] = []
    var media: [MediaTag] = []
    for index in 0..<all.count {
      let line = all[index]
      if line.hasPrefix("#EXT-X-INDEPENDENT-SEGMENTS") {
        independentSegments = true
      } else if line.hasPrefix("#EXT-X-MEDIA:") {
        let fields = RelayPlaylist.attributes(line)
        media.append(MediaTag(
          line: line,
          type: RelayPlaylist.attributeValue(fields, "TYPE"),
          groupId: RelayPlaylist.attributeValue(fields, "GROUP-ID"),
          uri: fields.first(where: { $0.name == "URI" && $0.quoted })?.value
        ))
      } else if line.hasPrefix("#EXT-X-STREAM-INF") {
        var next = index + 1
        while next < all.count {
          let candidate = all[next]
          if candidate.isEmpty || candidate.hasPrefix("#") {
            next += 1
            continue
          }
          if let absolute = RelayPlaylist.resolve(candidate, base: base), let url = URL(string: absolute) {
            variants.append(Variant(
              info: line,
              audioOnly: RelayPlaylist.streamInfAudioOnly(line),
              bandwidth: RelayPlaylist.streamInfBandwidth(line),
              url: url,
              audioGroup: RelayPlaylist.attributeValue(RelayPlaylist.attributes(line), "AUDIO")
            ))
          }
          break
        }
      }
    }
    return Master(independentSegments: independentSegments, variants: variants, media: media)
  }

  /// Picks a variant the phone can forward. The first rendition is often the largest, and
  /// relaying that one stalls the TV.
  static func select(_ variants: [Variant]) -> Variant? {
    guard !variants.isEmpty else {
      return nil
    }
    let video = variants.filter { !$0.audioOnly }
    let pool = video.isEmpty ? variants : video
    let known = pool.filter { $0.bandwidth > 0 }
    let under = known.filter { $0.bandwidth <= RelayPlaylist.maxBandwidth }
    if let best = under.max(by: { $0.bandwidth < $1.bandwidth }) {
      return best
    }
    if let lowest = known.min(by: { $0.bandwidth < $1.bandwidth }) {
      return lowest
    }
    return pool.first
  }

  /// Peak `BANDWIDTH`, or -1. `AVERAGE-BANDWIDTH=` contains the same suffix and is skipped.
  static func streamInfBandwidth(_ line: String) -> Int {
    var searchStart = line.startIndex
    while let range = line.range(of: "BANDWIDTH=", range: searchStart..<line.endIndex) {
      var accepted = range.lowerBound == line.startIndex
      if !accepted {
        let previous = line[line.index(before: range.lowerBound)]
        accepted = previous == ":" || previous == ","
      }
      if accepted {
        let digits = line[range.upperBound...].prefix { $0 >= "0" && $0 <= "9" }
        return Int(String(digits)) ?? -1
      }
      searchStart = range.upperBound
    }
    return -1
  }

  static func streamInfAudioOnly(_ line: String) -> Bool {
    guard let codecs = attributeValue(attributes(line), "CODECS")?.lowercased() else {
      return false
    }
    let videoCodecs = ["avc1", "avc3", "hvc1", "hev1", "dvh1", "dvhe", "av01", "vp09", "vp9"]
    if videoCodecs.contains(where: { codecs.contains($0) }) {
      return false
    }
    let audioCodecs = ["mp4a", "ac-3", "ec-3", "opus", "flac", "alac"]
    return audioCodecs.contains(where: { codecs.contains($0) })
  }

  /// Master playlist for a variant whose audio is a separate rendition: that group's
  /// renditions and the variant itself, each pointing back at this relay.
  static func demuxedMaster(_ master: Master, variant: Variant, group: [MediaTag], prefix: String) -> String {
    var output = "#EXTM3U\n"
    if master.independentSegments {
      output += "#EXT-X-INDEPENDENT-SEGMENTS\n"
    }
    for (index, tag) in group.enumerated() {
      if tag.uri == nil {
        output += tag.line + "\n"
      } else {
        let path = "\(prefix)/audio.m3u8?g=\(index)"
        let rewritten = RelayPlaylist.rewriteUriAttributes(tag.line) { _ in path }
        output += rewritten + "\n"
      }
    }
    output += variant.info + "\n"
    output += "\(prefix)/video.m3u8\n"
    return output
  }

  /// Sends every segment line and every quoted `URI` attribute of a media playlist back
  /// through the relay as a signed `/s` path. `base` is the playlist URL after redirects.
  static func rewriteMedia(_ body: String, base: URL, routes: RelayRoutes) -> String {
    var output = ""
    for raw in lines(body) {
      let line = RelayPlaylist.trimEnd(raw)
      if line.isEmpty {
        output += "\n"
      } else if line.hasPrefix("#EXT") {
        let rewritten = RelayPlaylist.rewriteUriAttributes(line) { value in
          RelayPlaylist.relayed(value, base: base, routes: routes)
        }
        output += rewritten + "\n"
      } else if line.hasPrefix("#") {
        output += line + "\n"
      } else {
        let value = line.trimmingCharacters(in: .whitespaces)
        output += (RelayPlaylist.relayed(value, base: base, routes: routes) ?? line) + "\n"
      }
    }
    return output
  }

  /// Signed relay path for one playlist URI, or nil for opaque values and anything that
  /// does not resolve to http(s).
  static func relayed(_ value: String, base: URL, routes: RelayRoutes) -> String? {
    if isOpaque(value) {
      return nil
    }
    guard let absolute = resolve(value, base: base), RelayRoutes.isHttpUrl(absolute) else {
      return nil
    }
    return routes.segment(absolute)
  }

  /// Live when the playlist has no `#EXT-X-ENDLIST`. fMP4 when it maps an init segment or
  /// names CMAF segments.
  static func mediaInfo(_ body: String) -> MediaInfo {
    var hasMap = false
    var ended = false
    var firstSegment: String?
    for raw in lines(body) {
      let line = raw.trimmingCharacters(in: .whitespaces)
      if line.hasPrefix("#EXT-X-MAP") {
        hasMap = true
      } else if line.hasPrefix("#EXT-X-ENDLIST") {
        ended = true
      } else if !line.isEmpty && !line.hasPrefix("#") && firstSegment == nil {
        firstSegment = line
      }
    }
    var path = firstSegment ?? ""
    if let cut = path.firstIndex(where: { $0 == "?" || $0 == "#" }) {
      path = String(path[..<cut])
    }
    path = path.lowercased()
    let suffixes = [".m4s", ".mp4", ".cmfv", ".cmfa"]
    let fmp4 = hasMap || suffixes.contains(where: { path.hasSuffix($0) })
    return MediaInfo(live: !ended, segmentFormat: fmp4 ? "fmp4" : "ts")
  }

  private static func firstIndex(of target: Character, in chars: [Character], from start: Int) -> Int? {
    var index = start
    while index < chars.count {
      if chars[index] == target {
        return index
      }
      index += 1
    }
    return nil
  }

  private static func trimEnd(_ value: String) -> String {
    var end = value.endIndex
    while end > value.startIndex {
      let previous = value.index(before: end)
      if !value[previous].isWhitespace {
        break
      }
      end = previous
    }
    return String(value[..<end])
  }
}
