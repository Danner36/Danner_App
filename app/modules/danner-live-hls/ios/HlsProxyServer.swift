import Foundation
import Network

/// Serves an approved page's HLS stream from a phone origin the Cast receiver can read.
///
/// The provider answers its playlists only when the request carries the player page as
/// `Referer`, and a Cast receiver sends its own origin instead, so the receiver gets 403 on
/// every playlist. Segments are pre-signed object-store URLs that need no `Referer` but
/// carry no CORS header, which the receiver also requires. This server adds the `Referer`
/// upstream and CORS downstream, and leaves the media untouched.
final class HlsProxyServer: @unchecked Sendable {
  static let shared = HlsProxyServer()

  private let queue = DispatchQueue(label: "danner.livehls.proxy")
  private let session: URLSession
  private var listener: NWListener?
  private var source: URL?
  private var referer: String = ""

  private(set) var port: Int = 0
  private(set) var origin: String?

  var running: Bool { listener != nil }

  private init() {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 20
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    session = URLSession(configuration: configuration)
  }

  func start(source sourceUrl: String, referer refererValue: String) throws -> (origin: String, port: Int) {
    guard let parsed = URL(string: sourceUrl) else {
      throw NSError(domain: "DannerLiveHls", code: 2)
    }
    if let existing = origin, running, source?.absoluteString == sourceUrl, port != 0 {
      return (existing, port)
    }
    stop()
    source = parsed
    referer = refererValue

    var lastError: Error?
    for candidate in HlsProxyServer.firstPort...HlsProxyServer.lastPort {
      do {
        guard let portValue = NWEndpoint.Port(rawValue: UInt16(candidate)) else { continue }
        let started = try NWListener(using: .tcp, on: portValue)
        started.newConnectionHandler = { [weak self] connection in
          self?.handle(connection)
        }
        let ready = DispatchSemaphore(value: 0)
        let failed = ProxyStartFlag()
        started.stateUpdateHandler = { state in
          switch state {
          case .ready:
            ready.signal()
          case .failed:
            failed.value = true
            ready.signal()
          default:
            break
          }
        }
        started.start(queue: queue)
        _ = ready.wait(timeout: .now() + 1)
        if failed.value {
          started.cancel()
          continue
        }
        listener = started
        port = candidate
        let originValue = "http://\(HlsProxyServer.lanIPv4()):\(candidate)"
        origin = originValue
        return (originValue, candidate)
      } catch {
        lastError = error
      }
    }
    throw lastError ?? NSError(domain: "DannerLiveHls", code: 1)
  }

  func stop() {
    listener?.cancel()
    listener = nil
    port = 0
    origin = nil
    source = nil
  }

  private func handle(_ connection: NWConnection) {
    connection.start(queue: queue)
    receive(on: connection, buffer: Data())
  }

  private func receive(on connection: NWConnection, buffer: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, isComplete, error in
      guard let self else {
        connection.cancel()
        return
      }
      if error != nil {
        connection.cancel()
        return
      }
      var next = buffer
      if let data {
        next.append(data)
      }
      if let range = next.range(of: Data([13, 10, 13, 10])) {
        let header = String(data: next.prefix(upTo: range.lowerBound), encoding: .ascii) ?? ""
        self.respond(on: connection, header: header)
        return
      }
      if isComplete {
        connection.cancel()
        return
      }
      self.receive(on: connection, buffer: next)
    }
  }

  private func respond(on connection: NWConnection, header: String) {
    let firstLine = header.split(separator: "\r\n").first.map(String.init) ?? ""
    let parts = firstLine.split(separator: " ")
    let method = parts.first.map(String.init) ?? "GET"
    let target = parts.count >= 2 ? String(parts[1]) : "/"
    let path = target.split(separator: "?").first.map(String.init) ?? "/"
    let query = target.contains("?") ? String(target[target.index(after: target.firstIndex(of: "?")!)...]) : ""

    if method == "OPTIONS" {
      send(on: connection, status: 204, reason: "No Content", contentType: nil, body: nil)
      return
    }
    if method != "GET" && method != "HEAD" {
      send(on: connection, status: 405, reason: "Method Not Allowed", contentType: "text/plain", body: Data())
      return
    }
    let withBody = method == "GET"

    if path == HlsProxyServer.playlistPath {
      buildPlaylist { [weak self] playlist in
        guard let self else { return }
        guard let playlist else {
          self.send(on: connection, status: 502, reason: "Bad Gateway", contentType: "text/plain", body: Data())
          return
        }
        self.send(
          on: connection,
          status: 200,
          reason: "OK",
          contentType: "application/vnd.apple.mpegurl",
          body: Data(playlist.utf8),
          withBody: withBody
        )
      }
      return
    }

    if path == HlsProxyServer.segmentPath {
      guard let target = HlsProxyServer.decodeUrl(HlsProxyServer.queryValue(query, "u")) else {
        send(on: connection, status: 400, reason: "Bad Request", contentType: "text/plain", body: Data())
        return
      }
      fetch(target) { [weak self] data in
        guard let self else { return }
        guard let data else {
          self.send(on: connection, status: 502, reason: "Bad Gateway", contentType: "text/plain", body: Data())
          return
        }
        // The provider labels segments as text. The receiver picks its demuxer from this
        // header, so it has to name the real transport-stream payload.
        self.send(
          on: connection,
          status: 200,
          reason: "OK",
          contentType: "video/MP2T",
          body: data,
          withBody: withBody
        )
      }
      return
    }

    send(on: connection, status: 404, reason: "Not Found", contentType: "text/plain", body: Data())
  }

  /// Resolves the source down to a media playlist and rewrites every media reference back
  /// through this server. The provider hands out a fresh variant host and time-limited
  /// segment URLs on each read, so this repeats the walk for every receiver poll.
  private func buildPlaylist(completion: @escaping (String?) -> Void) {
    guard let masterUrl = source else {
      completion(nil)
      return
    }
    fetch(masterUrl.absoluteString) { [weak self] data in
      guard
        let self,
        let data,
        let master = String(data: data, encoding: .utf8),
        HlsProxyServer.isPlaylist(master)
      else {
        completion(nil)
        return
      }
      guard let mediaUrl = HlsProxyServer.variantUrl(base: masterUrl, playlist: master) else {
        completion(self.rewrite(playlist: master, base: masterUrl))
        return
      }
      self.fetch(mediaUrl.absoluteString) { mediaData in
        guard
          let mediaData,
          let media = String(data: mediaData, encoding: .utf8),
          HlsProxyServer.isPlaylist(media)
        else {
          completion(nil)
          return
        }
        completion(self.rewrite(playlist: media, base: mediaUrl))
      }
    }
  }

  private func rewrite(playlist: String, base: URL) -> String {
    var builder = ""
    for rawLine in playlist.components(separatedBy: .newlines) {
      let line = rawLine.hasSuffix("\r") ? String(rawLine.dropLast()) : rawLine
      if line.isEmpty {
        builder += "\n"
      } else if line.hasPrefix("#") {
        builder += HlsProxyServer.rewriteAttributeUri(line, base: base) + "\n"
      } else if let absolute = URL(string: line, relativeTo: base)?.absoluteString {
        builder += HlsProxyServer.proxyPath(absolute) + "\n"
      } else {
        builder += line + "\n"
      }
    }
    return builder
  }

  /// The provider answers a dropped stream with a 200 error page, so a body that is not a
  /// playlist has to fail here rather than reach the receiver as rewritten segment lines.
  private static func isPlaylist(_ body: String) -> Bool {
    body.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("#EXTM3U")
  }

  /// Picks the first variant of a master playlist, or nil when this is already media.
  private static func variantUrl(base: URL, playlist: String) -> URL? {
    let lines = playlist.components(separatedBy: .newlines)
    for (index, line) in lines.enumerated() where line.hasPrefix("#EXT-X-STREAM-INF") {
      for next in (index + 1)..<lines.count {
        let candidate = lines[next].trimmingCharacters(in: .whitespacesAndNewlines)
        if candidate.isEmpty || candidate.hasPrefix("#") {
          continue
        }
        return URL(string: candidate, relativeTo: base)
      }
    }
    return nil
  }

  /// Sends `#EXT-X-KEY` and `#EXT-X-MAP` payloads through this server as well.
  private static func rewriteAttributeUri(_ line: String, base: URL) -> String {
    guard line.hasPrefix("#EXT-X-KEY") || line.hasPrefix("#EXT-X-MAP") else {
      return line
    }
    guard let markerRange = line.range(of: "URI=\"") else {
      return line
    }
    let valueStart = markerRange.upperBound
    guard let closing = line[valueStart...].firstIndex(of: "\"") else {
      return line
    }
    guard let absolute = URL(string: String(line[valueStart..<closing]), relativeTo: base)?.absoluteString else {
      return line
    }
    return String(line[..<valueStart]) + proxyPath(absolute) + String(line[closing...])
  }

  private func fetch(_ target: String, completion: @escaping (Data?) -> Void) {
    guard let url = URL(string: target) else {
      completion(nil)
      return
    }
    var request = URLRequest(url: url)
    request.setValue(referer, forHTTPHeaderField: "Referer")
    request.setValue(HlsProxyServer.upstreamUserAgent, forHTTPHeaderField: "User-Agent")
    request.setValue("*/*", forHTTPHeaderField: "Accept")
    session.dataTask(with: request) { data, response, _ in
      guard
        let data,
        let http = response as? HTTPURLResponse,
        (200...299).contains(http.statusCode)
      else {
        completion(nil)
        return
      }
      completion(data)
    }.resume()
  }

  private static func proxyPath(_ absolute: String) -> String {
    let encoded = Data(absolute.utf8).base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
    return "\(segmentPath)?u=\(encoded)"
  }

  private static func decodeUrl(_ encoded: String?) -> String? {
    guard let encoded, !encoded.isEmpty else {
      return nil
    }
    var normalized = encoded
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    while normalized.count % 4 != 0 {
      normalized += "="
    }
    guard
      let data = Data(base64Encoded: normalized),
      let decoded = String(data: data, encoding: .utf8),
      let parsed = URL(string: decoded),
      parsed.scheme == "http" || parsed.scheme == "https"
    else {
      return nil
    }
    return decoded
  }

  private static func queryValue(_ query: String, _ key: String) -> String? {
    for pair in query.split(separator: "&") {
      let parts = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
      if parts.count == 2, String(parts[0]) == key {
        return String(parts[1])
      }
    }
    return nil
  }

  private func send(
    on connection: NWConnection,
    status: Int,
    reason: String,
    contentType: String?,
    body: Data?,
    withBody: Bool = true
  ) {
    var header = "HTTP/1.1 \(status) \(reason)\r\n"
    header += "Access-Control-Allow-Origin: *\r\n"
    header += "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n"
    header += "Access-Control-Allow-Headers: *\r\n"
    header += "Access-Control-Expose-Headers: Content-Length, Content-Type\r\n"
    header += "Accept-Ranges: none\r\n"
    header += "Cache-Control: no-store\r\n"
    header += "Connection: close\r\n"
    if let contentType {
      header += "Content-Type: \(contentType)\r\n"
    }
    if let body {
      header += "Content-Length: \(body.count)\r\n"
    }
    header += "\r\n"
    var payload = Data(header.utf8)
    if let body, withBody {
      payload.append(body)
    }
    connection.send(content: payload, completion: .contentProcessed { _ in
      connection.cancel()
    })
  }

  /// The receiver reaches this server by address, so the origin has to name the Wi-Fi
  /// interface rather than loopback.
  private static func lanIPv4() -> String {
    var address = "127.0.0.1"
    var ifaddr: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&ifaddr) == 0, let first = ifaddr else {
      return address
    }
    defer { freeifaddrs(first) }
    var pointer: UnsafeMutablePointer<ifaddrs>? = first
    while let current = pointer {
      let interface = current.pointee
      if let addr = interface.ifa_addr, addr.pointee.sa_family == sa_family_t(AF_INET) {
        let name = String(cString: interface.ifa_name)
        if name.hasPrefix("en") {
          var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
          getnameinfo(
            addr,
            socklen_t(addr.pointee.sa_len),
            &hostname,
            socklen_t(hostname.count),
            nil,
            0,
            NI_NUMERICHOST
          )
          let ip = String(cString: hostname)
          if !ip.hasPrefix("127.") && !ip.hasPrefix("169.254") {
            address = ip
            if name == "en0" {
              break
            }
          }
        }
      }
      pointer = interface.ifa_next
    }
    return address
  }

  private static let playlistPath = "/live.m3u8"
  private static let segmentPath = "/s"
  private static let firstPort = 8108
  private static let lastPort = 8127
  private static let upstreamUserAgent =
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) "
      + "Chrome/140.0.0.0 Mobile Safari/537.36"
}

private final class ProxyStartFlag: @unchecked Sendable {
  var value = false
}
