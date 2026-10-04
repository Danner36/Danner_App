import Foundation
import Network

/// A `startProxy` failure. `code` is the rejection code the JS wrapper maps.
struct RelayStartFailure: Error {
  let code: String
  let message: String

  static func unsupported(_ message: String) -> RelayStartFailure {
    return RelayStartFailure(code: "ERR_UNSUPPORTED", message: message)
  }

  static func noNetwork(_ message: String) -> RelayStartFailure {
    return RelayStartFailure(code: "ERR_NO_NETWORK", message: message)
  }

  static func source(_ message: String) -> RelayStartFailure {
    return RelayStartFailure(code: "ERR_SOURCE", message: message)
  }

  static func relay(_ message: String) -> RelayStartFailure {
    return RelayStartFailure(code: "ERR_RELAY", message: message)
  }
}

/// Media shape a session forwards. The raw value is what the JS wrapper passes and receives.
enum RelayKind: String {
  case hls
  case dash
  case mp4

  var fileName: String {
    switch self {
    case .hls:
      return "live.m3u8"
    case .dash:
      return "live.mpd"
    case .mp4:
      return "media.mp4"
    }
  }

  var contentType: String {
    switch self {
    case .hls:
      return "application/x-mpegURL"
    case .dash:
      return "application/dash+xml"
    case .mp4:
      return "video/mp4"
    }
  }
}

typealias RelayStartCompletion = (Result<[String: Any], RelayStartFailure>) -> Void

/// Serves an approved page's HLS, DASH, or MP4 stream from a phone origin a Cast receiver
/// can read.
///
/// The provider answers its playlists only when the request carries the player page as
/// `Referer`, and a Cast receiver sends its own origin instead, so the receiver gets 403 on
/// every playlist. Segments are pre-signed object-store URLs that need no `Referer` but
/// carry no CORS header, which the receiver also requires. This server adds the `Referer`
/// upstream and CORS downstream, and leaves the media bytes untouched.
///
/// Every start opens a new session with a random path token and HMAC key. Only
/// `/<token>/...` paths answer, and upstream fetches require a URL the session signed, so
/// other devices on the network and web pages cannot use the relay as a general proxy.
///
/// The listener, client connections, URLSession delegate callbacks, and all mutable state
/// are confined to `queue`.
final class HlsProxyServer {
  static let shared = HlsProxyServer()

  private let queue: DispatchQueue
  private let upstream: UpstreamDelegate
  private let urlSession: URLSession

  private var listener: NWListener?
  private var listenerReady = false
  private var active: RelaySession?
  private var pending: PendingStart?
  private var clients: [Int: RelayClient] = [:]
  private var nextClientId = 0

  private init() {
    let queue = DispatchQueue(label: "danner.livehls.proxy")
    let upstream = UpstreamDelegate()
    let delegateQueue = OperationQueue()
    delegateQueue.underlyingQueue = queue
    delegateQueue.maxConcurrentOperationCount = 1
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 20
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.urlCache = nil
    self.queue = queue
    self.upstream = upstream
    urlSession = URLSession(configuration: configuration, delegate: upstream, delegateQueue: delegateQueue)
  }

  /// Ends any previous session, probes the source, and opens the listener. `completion`
  /// runs on the relay queue once the listener is accepting or the start has failed.
  func start(source: String, referer: String, kind: String, completion: @escaping RelayStartCompletion) {
    queue.async {
      self.beginStart(source: source, referer: referer, kind: kind, completion: completion)
    }
  }

  func stop() {
    queue.sync {
      self.stopLocked()
    }
  }

  func status() -> [String: Any] {
    return queue.sync { () -> [String: Any] in
      guard let current = self.active, self.listener != nil, self.listenerReady else {
        return ["running": false]
      }
      return [
        "running": true,
        "origin": current.origin,
        "port": current.port,
        "token": current.routes.signer.token,
        "kind": current.kind.rawValue,
      ]
    }
  }

  // MARK: - Start and stop

  private func beginStart(source: String, referer: String, kind: String, completion: @escaping RelayStartCompletion) {
    stopLocked()
    guard let relayKind = RelayKind(rawValue: kind) else {
      completion(.failure(.unsupported("The relay does not serve \(kind) media.")))
      return
    }
    guard let url = URL(string: source), let scheme = url.scheme?.lowercased(), url.host != nil else {
      completion(.failure(.unsupported("The source is not an absolute URL.")))
      return
    }
    // App Transport Security blocks cleartext fetches from this URLSession, and the app does
    // not weaken it for the relay.
    guard scheme == "https" else {
      completion(.failure(.unsupported("Only https sources can be relayed on iPhone.")))
      return
    }
    guard let address = HlsProxyServer.lanIPv4() else {
      completion(.failure(.noNetwork("No Wi-Fi, Ethernet, or hotspot address is available.")))
      return
    }
    let start = PendingStart(source: url, referer: referer, kind: relayKind, address: address, completion: completion)
    pending = start
    probe(start)
  }

  /// Checks the source once with the session `Referer`. A source that fails here would only
  /// give the receiver 502s.
  private func probe(_ start: PendingStart) {
    switch start.kind {
    case .hls:
      fetchText(start.source, referer: start.referer) { [weak self, weak start] master in
        guard let self, let start, self.pending === start else {
          return
        }
        guard let master, RelayPlaylist.isPlaylist(master.text) else {
          self.fail(start, .source("The source did not answer with an HLS playlist."))
          return
        }
        guard let variant = RelayPlaylist.parseMaster(master.text, base: master.url)?.selected else {
          let info = RelayPlaylist.mediaInfo(master.text)
          self.listen(start, probe: RelayProbe(live: info.live, segmentFormat: info.segmentFormat))
          return
        }
        self.fetchText(variant.url, referer: start.referer) { [weak self, weak start] media in
          guard let self, let start, self.pending === start else {
            return
          }
          guard let media, RelayPlaylist.isPlaylist(media.text) else {
            self.fail(start, .source("The source variant did not answer with an HLS playlist."))
            return
          }
          let info = RelayPlaylist.mediaInfo(media.text)
          self.listen(start, probe: RelayProbe(live: info.live, segmentFormat: info.segmentFormat))
        }
      }
    case .dash:
      fetchText(start.source, referer: start.referer) { [weak self, weak start] manifest in
        guard let self, let start, self.pending === start else {
          return
        }
        guard let manifest, RelayManifest.isManifest(manifest.text) else {
          self.fail(start, .source("The source did not answer with a DASH manifest."))
          return
        }
        self.listen(start, probe: RelayProbe(live: RelayManifest.isDynamic(manifest.text), segmentFormat: nil))
      }
    case .mp4:
      probeRange(start.source, referer: start.referer) { [weak self, weak start] available in
        guard let self, let start, self.pending === start else {
          return
        }
        guard available else {
          self.fail(start, .source("The source did not answer a range request."))
          return
        }
        self.listen(start, probe: RelayProbe(live: false, segmentFormat: nil))
      }
    }
  }

  private func listen(_ start: PendingStart, probe: RelayProbe) {
    start.probe = probe
    start.deadline = DispatchTime.now() + HlsProxyServer.listenSeconds
    openListener(start)
  }

  /// Binds the LAN address first so the relay does not answer on loopback or cellular. When
  /// that bind is refused, the same port is tried on every interface; the session token and
  /// signed URLs still gate every route.
  private func openListener(_ start: PendingStart) {
    guard pending === start else {
      return
    }
    guard
      start.port <= HlsProxyServer.lastPort,
      DispatchTime.now() < start.deadline,
      let port = NWEndpoint.Port(rawValue: UInt16(start.port))
    else {
      fail(start, .relay("No relay port could be opened."))
      return
    }
    let parameters = HlsProxyServer.listenerParameters()
    let created: NWListener
    do {
      if start.bindAddress, let address = IPv4Address(start.address) {
        parameters.requiredLocalEndpoint = NWEndpoint.hostPort(host: .ipv4(address), port: port)
        created = try NWListener(using: parameters)
      } else {
        created = try NWListener(using: parameters, on: port)
      }
    } catch {
      retry(start, addressInUse: false)
      return
    }
    start.listener = created
    created.newConnectionHandler = { [weak self, weak created] connection in
      guard let self, let created, created === self.listener else {
        connection.cancel()
        return
      }
      self.accept(connection)
    }
    created.stateUpdateHandler = { [weak self, weak start, weak created] state in
      guard let self, let created else {
        return
      }
      self.listenerChanged(created, state: state, start: start)
    }
    // A listener stuck in `.setup` or `.waiting` is not accepting, so it counts as failed.
    let timer = DispatchWorkItem { [weak self, weak start, weak created] in
      guard let self, let start, let created, self.pending === start, start.listener === created else {
        return
      }
      self.retry(start, addressInUse: false)
    }
    start.attemptTimer = timer
    queue.asyncAfter(deadline: DispatchTime.now() + HlsProxyServer.listenerAttemptSeconds, execute: timer)
    created.start(queue: queue)
  }

  private func listenerChanged(_ changed: NWListener, state: NWListener.State, start: PendingStart?) {
    if changed === listener {
      switch state {
      case .ready:
        listenerReady = true
      case .waiting:
        listenerReady = false
      case .failed, .cancelled:
        // iOS reclaims a suspended app's listening socket. Ending the session here keeps
        // `getProxyStatus` from reporting a dead origin as running.
        stopLocked()
      default:
        break
      }
      return
    }
    guard let start, pending === start, start.listener === changed else {
      return
    }
    switch state {
    case .ready:
      commit(start, listener: changed)
    case .failed(let error):
      var addressInUse = false
      if case .posix(let code) = error, code == .EADDRINUSE {
        addressInUse = true
      }
      retry(start, addressInUse: addressInUse)
    default:
      // `.waiting` may still turn `.ready`; the attempt timer ends it otherwise.
      break
    }
  }

  private func retry(_ start: PendingStart, addressInUse: Bool) {
    start.attemptTimer?.cancel()
    start.attemptTimer = nil
    if let failed = start.listener {
      start.listener = nil
      failed.cancel()
    }
    if addressInUse || !start.bindAddress {
      start.port += 1
    } else {
      start.bindAddress = false
    }
    openListener(start)
  }

  private func commit(_ start: PendingStart, listener ready: NWListener) {
    start.attemptTimer?.cancel()
    start.attemptTimer = nil
    start.listener = nil
    pending = nil

    let port = Int(ready.port?.rawValue ?? UInt16(start.port))
    let origin = "http://\(start.address):\(port)"
    let routes = RelayRoutes(origin: origin, signer: RelaySigner())
    active = RelaySession(
      routes: routes,
      source: start.source,
      referer: start.referer,
      kind: start.kind,
      origin: origin,
      port: port
    )
    listener = ready
    listenerReady = true

    var result: [String: Any] = [
      "origin": origin,
      "port": port,
      "token": routes.signer.token,
      "kind": start.kind.rawValue,
      "path": "\(routes.prefix)/\(start.kind.fileName)",
      "contentType": start.kind.contentType,
      "live": start.probe?.live ?? false,
    ]
    if let segmentFormat = start.probe?.segmentFormat {
      result["segmentFormat"] = segmentFormat
    }
    start.completion(.success(result))
  }

  private func fail(_ start: PendingStart, _ failure: RelayStartFailure) {
    guard pending === start else {
      return
    }
    pending = nil
    start.attemptTimer?.cancel()
    start.attemptTimer = nil
    if let opened = start.listener {
      start.listener = nil
      opened.cancel()
    }
    start.completion(.failure(failure))
  }

  private func stopLocked() {
    if let start = pending {
      fail(start, .relay("The relay start was stopped."))
    }
    if let current = listener {
      listener = nil
      current.cancel()
    }
    listenerReady = false
    active = nil
    let open = Array(clients.values)
    clients.removeAll()
    for client in open {
      close(client)
    }
    upstream.cancelAll()
  }

  // MARK: - Connections

  private func accept(_ connection: NWConnection) {
    guard active != nil, clients.count < HlsProxyServer.maxClients else {
      connection.cancel()
      return
    }
    nextClientId += 1
    let client = RelayClient(id: nextClientId, connection: connection)
    clients[client.id] = client
    connection.stateUpdateHandler = { [weak self, weak client] state in
      guard let self, let client else {
        return
      }
      switch state {
      case .failed, .cancelled:
        self.close(client)
      default:
        break
      }
    }
    connection.start(queue: queue)
    receive(client)
    watch(client)
  }

  private func receive(_ client: RelayClient) {
    client.connection.receive(
      minimumIncompleteLength: 1,
      maximumLength: HlsProxyServer.maxHeaderBytes
    ) { [weak self, weak client] data, _, isComplete, error in
      guard let self, let client, !client.closed else {
        return
      }
      if error != nil {
        self.close(client)
        return
      }
      if let data, !data.isEmpty {
        client.buffer.append(data)
      }
      if let end = client.buffer.range(of: HlsProxyServer.headerEnd) {
        let headerLength = end.lowerBound - client.buffer.startIndex
        guard headerLength <= HlsProxyServer.maxHeaderBytes else {
          self.respondStatus(client, 431)
          return
        }
        client.requestParsed = true
        client.touch()
        let head = String(decoding: client.buffer[client.buffer.startIndex..<end.lowerBound], as: UTF8.self)
        client.buffer = Data()
        self.route(client, head: head)
        return
      }
      if client.buffer.count >= HlsProxyServer.maxHeaderBytes {
        self.respondStatus(client, 431)
        return
      }
      if isComplete {
        self.close(client)
        return
      }
      self.receive(client)
    }
  }

  /// Closes a client that has not sent a full request header in time, or whose response
  /// has made no progress, so a dead peer cannot hold a connection open.
  private func watch(_ client: RelayClient) {
    queue.asyncAfter(deadline: DispatchTime.now() + HlsProxyServer.watchdogSeconds) { [weak self, weak client] in
      guard let self, let client, !client.closed else {
        return
      }
      let now = DispatchTime.now().uptimeNanoseconds
      let expired: Bool
      if client.requestParsed {
        expired = now > client.lastActivity.uptimeNanoseconds + HlsProxyServer.idleTimeoutNanos
      } else {
        expired = now > client.acceptedAt.uptimeNanoseconds + HlsProxyServer.headerTimeoutNanos
      }
      if expired {
        self.close(client)
        return
      }
      self.watch(client)
    }
  }

  private func close(_ client: RelayClient) {
    if client.closed {
      return
    }
    client.closed = true
    clients[client.id] = nil
    if let task = client.task {
      client.task = nil
      upstream.cancel(task)
    }
    client.connection.cancel()
  }

  // MARK: - Routes

  private func route(_ client: RelayClient, head: String) {
    let lines = head.components(separatedBy: "\r\n")
    let parts = (lines.first ?? "").split(separator: " ")
    guard parts.count >= 2 else {
      respondStatus(client, 400)
      return
    }
    let method = String(parts[0])
    let target = String(parts[1])
    for line in lines.dropFirst() {
      guard let colon = line.firstIndex(of: ":") else {
        continue
      }
      let name = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
      if name == "range" {
        let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        client.range = value.isEmpty ? nil : value
      }
    }
    let path: String
    let query: String
    if let mark = target.firstIndex(of: "?") {
      path = String(target[..<mark])
      query = String(target[target.index(after: mark)...])
    } else {
      path = target
      query = ""
    }

    guard let current = active, path.hasPrefix("/") else {
      respondStatus(client, 404)
      return
    }
    let afterSlash = path.dropFirst()
    guard
      let tokenEnd = afterSlash.firstIndex(of: "/"),
      RelaySigner.constantTimeEquals(String(afterSlash[..<tokenEnd]), current.routes.signer.token)
    else {
      respondStatus(client, 404)
      return
    }
    let file = String(afterSlash[afterSlash.index(after: tokenEnd)...])

    if method == "OPTIONS" {
      respondPreflight(client)
      return
    }
    guard method == "GET" || method == "HEAD" else {
      respondStatus(client, 405)
      return
    }
    let withBody = method == "GET"

    switch current.kind {
    case .hls:
      if file == "live.m3u8" {
        serveHlsEntry(client, current, withBody: withBody)
        return
      }
      if file == "video.m3u8" {
        serveHlsVideo(client, current, withBody: withBody)
        return
      }
      if file == "audio.m3u8" {
        guard
          let raw = HlsProxyServer.queryValue(query, "g"),
          let index = Int(raw),
          index >= 0
        else {
          respondStatus(client, 404)
          return
        }
        serveHlsAudio(client, current, index: index, withBody: withBody)
        return
      }
      if file == "s" {
        serveSigned(client, current, query: query, withBody: withBody)
        return
      }
    case .dash:
      if file == "live.mpd" {
        serveDash(client, current, withBody: withBody)
        return
      }
      if file == "s" {
        serveSigned(client, current, query: query, withBody: withBody)
        return
      }
      if file.hasPrefix("d/") {
        serveDirectory(client, current, route: String(file.dropFirst(2)), query: query, withBody: withBody)
        return
      }
    case .mp4:
      if file == "media.mp4" {
        relayMedia(client, url: current.source, referer: current.referer, rule: .mp4, withBody: withBody)
        return
      }
    }
    respondStatus(client, 404)
  }

  /// The source re-walked on every read. The provider hands out a fresh variant host and
  /// time-limited segment URLs each time, so a cached walk goes stale within minutes.
  /// A variant with a separate audio rendition gets a two-entry master playlist so the
  /// receiver plays sound.
  private func serveHlsEntry(_ client: RelayClient, _ current: RelaySession, withBody: Bool) {
    fetchPlaylist(client, current.source, current) { [weak self] master in
      guard let self else {
        return
      }
      guard
        let parsed = RelayPlaylist.parseMaster(master.text, base: master.url),
        let variant = parsed.selected
      else {
        let body = RelayPlaylist.rewriteMedia(master.text, base: master.url, routes: current.routes)
        self.respondPlaylist(client, body, withBody: withBody)
        return
      }
      let group = parsed.audioGroup(variant)
      if group.contains(where: { $0.uri != nil }) {
        let body = RelayPlaylist.demuxedMaster(parsed, variant: variant, group: group, prefix: current.routes.prefix)
        self.respondPlaylist(client, body, withBody: withBody)
        return
      }
      self.fetchPlaylist(client, variant.url, current) { [weak self] media in
        guard let self else {
          return
        }
        let body = RelayPlaylist.rewriteMedia(media.text, base: media.url, routes: current.routes)
        self.respondPlaylist(client, body, withBody: withBody)
      }
    }
  }

  private func serveHlsVideo(_ client: RelayClient, _ current: RelaySession, withBody: Bool) {
    fetchPlaylist(client, current.source, current) { [weak self] master in
      guard let self else {
        return
      }
      guard let variant = RelayPlaylist.parseMaster(master.text, base: master.url)?.selected else {
        let body = RelayPlaylist.rewriteMedia(master.text, base: master.url, routes: current.routes)
        self.respondPlaylist(client, body, withBody: withBody)
        return
      }
      self.fetchPlaylist(client, variant.url, current) { [weak self] media in
        guard let self else {
          return
        }
        let body = RelayPlaylist.rewriteMedia(media.text, base: media.url, routes: current.routes)
        self.respondPlaylist(client, body, withBody: withBody)
      }
    }
  }

  private func serveHlsAudio(_ client: RelayClient, _ current: RelaySession, index: Int, withBody: Bool) {
    fetchPlaylist(client, current.source, current) { [weak self] master in
      guard let self else {
        return
      }
      guard
        let parsed = RelayPlaylist.parseMaster(master.text, base: master.url),
        let variant = parsed.selected
      else {
        self.respondStatus(client, 502)
        return
      }
      let group = parsed.audioGroup(variant)
      guard
        index < group.count,
        let uri = group[index].uri,
        let absolute = RelayPlaylist.resolve(uri, base: master.url),
        let url = URL(string: absolute)
      else {
        self.respondStatus(client, 502)
        return
      }
      self.fetchPlaylist(client, url, current) { [weak self] media in
        guard let self else {
          return
        }
        let body = RelayPlaylist.rewriteMedia(media.text, base: media.url, routes: current.routes)
        self.respondPlaylist(client, body, withBody: withBody)
      }
    }
  }

  private func serveDash(_ client: RelayClient, _ current: RelaySession, withBody: Bool) {
    fetchClientText(client, current.source, current, accept: RelayManifest.isManifest) { [weak self] manifest in
      guard let self else {
        return
      }
      let body = RelayManifest.rewrite(manifest.text, manifestUrl: manifest.url, routes: current.routes)
      self.respond(
        client,
        status: 200,
        headers: [("Content-Type", RelayManifest.contentType), ("Cache-Control", "no-store")],
        body: Data(body.utf8),
        withBody: withBody
      )
    }
  }

  /// `/<token>/s?u=<base64url>&k=<sig>`: only URLs this session signed are fetched.
  private func serveSigned(_ client: RelayClient, _ current: RelaySession, query: String, withBody: Bool) {
    guard let signature = HlsProxyServer.queryValue(query, "k") else {
      respondStatus(client, 403)
      return
    }
    guard
      let encoded = HlsProxyServer.queryValue(query, "u"),
      let target = RelaySigner.decodeBase64Url(encoded)
    else {
      respondStatus(client, 400)
      return
    }
    guard current.routes.signer.verify(target, signature: signature) else {
      respondStatus(client, 403)
      return
    }
    guard let url = URL(string: target), RelayRoutes.isHttpUrl(target) else {
      respondStatus(client, 400)
      return
    }
    relayMedia(client, url: url, referer: current.referer, rule: .segment, withBody: withBody)
  }

  /// `/<token>/d/<base64url dir>/<sig>/<rest…>`: a signed upstream directory plus whatever
  /// the DASH client resolved under it.
  private func serveDirectory(
    _ client: RelayClient,
    _ current: RelaySession,
    route: String,
    query: String,
    withBody: Bool
  ) {
    guard let first = route.firstIndex(of: "/") else {
      respondStatus(client, 404)
      return
    }
    let encoded = String(route[..<first])
    let afterEncoded = route[route.index(after: first)...]
    guard let second = afterEncoded.firstIndex(of: "/") else {
      respondStatus(client, 404)
      return
    }
    let signature = String(afterEncoded[..<second])
    let rest = String(afterEncoded[afterEncoded.index(after: second)...])
    guard let directory = RelaySigner.decodeBase64Url(encoded) else {
      respondStatus(client, 400)
      return
    }
    guard current.routes.signer.verify(directory, signature: signature) else {
      respondStatus(client, 403)
      return
    }
    let target = directory + rest + (query.isEmpty ? "" : "?" + query)
    guard let url = URL(string: target), RelayRoutes.isHttpUrl(target) else {
      respondStatus(client, 400)
      return
    }
    relayMedia(client, url: url, referer: current.referer, rule: .segment, withBody: withBody)
  }

  // MARK: - Upstream

  private func fetchPlaylist(
    _ client: RelayClient,
    _ url: URL,
    _ current: RelaySession,
    _ next: @escaping (UpstreamText) -> Void
  ) {
    fetchClientText(client, url, current, accept: RelayPlaylist.isPlaylist, next)
  }

  /// A capped text fetch on behalf of a client. Upstream failure or an unexpected body
  /// answers 502.
  private func fetchClientText(
    _ client: RelayClient,
    _ url: URL,
    _ current: RelaySession,
    accept: @escaping (String) -> Bool,
    _ next: @escaping (UpstreamText) -> Void
  ) {
    let task = fetchText(url, referer: current.referer) { [weak self, weak client] body in
      guard let self, let client, !client.closed else {
        return
      }
      client.task = nil
      guard let body, accept(body.text) else {
        self.respondStatus(client, 502)
        return
      }
      client.touch()
      next(body)
    }
    client.task = task
  }

  /// A 2xx text body of at most `maxTextBytes`, with the URL it was served from after
  /// redirects. Anything else completes with nil.
  @discardableResult
  private func fetchText(
    _ url: URL,
    referer: String,
    completion: @escaping (UpstreamText?) -> Void
  ) -> URLSessionDataTask {
    let request = HlsProxyServer.upstreamRequest(url, referer: referer, range: nil, identity: false)
    let task = urlSession.dataTask(with: request)
    let handler = UpstreamHandler()
    var body = Data()
    var finalUrl = url
    var done = false
    handler.onResponse = { response in
      guard
        let http = response as? HTTPURLResponse,
        (200...299).contains(http.statusCode),
        http.expectedContentLength <= Int64(HlsProxyServer.maxTextBytes)
      else {
        done = true
        completion(nil)
        return false
      }
      finalUrl = http.url ?? url
      return true
    }
    handler.onData = { data in
      if body.count + data.count > HlsProxyServer.maxTextBytes {
        done = true
        completion(nil)
        return false
      }
      body.append(data)
      return true
    }
    handler.onComplete = { error in
      if done {
        return
      }
      done = true
      guard error == nil else {
        completion(nil)
        return
      }
      completion(UpstreamText(text: String(decoding: body, as: UTF8.self), url: finalUrl))
    }
    upstream.register(task, handler)
    task.resume()
    return task
  }

  /// MP4 probe: `Range: bytes=0-1` must answer 200 or 206. The body is not read.
  private func probeRange(_ url: URL, referer: String, completion: @escaping (Bool) -> Void) {
    let request = HlsProxyServer.upstreamRequest(url, referer: referer, range: "bytes=0-1", identity: true)
    let task = urlSession.dataTask(with: request)
    let handler = UpstreamHandler()
    var done = false
    handler.onResponse = { response in
      done = true
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      completion(status == 200 || status == 206)
      return false
    }
    handler.onComplete = { _ in
      if done {
        return
      }
      done = true
      completion(false)
    }
    upstream.register(task, handler)
    task.resume()
  }

  /// Streams one upstream object to the client with the client's `Range`. The upstream task
  /// is suspended while too many bytes wait on the client socket.
  private func relayMedia(_ client: RelayClient, url: URL, referer: String, rule: MediaRule, withBody: Bool) {
    let request = HlsProxyServer.upstreamRequest(url, referer: referer, range: client.range, identity: true)
    let task = urlSession.dataTask(with: request)
    let handler = UpstreamHandler()
    var response: HTTPURLResponse?
    var head = Data()
    var started = false

    handler.onResponse = { [weak self, weak client] raw in
      guard let self, let client, !client.closed else {
        return false
      }
      guard let http = raw as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
        client.task = nil
        self.respondStatus(client, 502)
        return false
      }
      response = http
      client.touch()
      return true
    }
    handler.onData = { [weak self, weak client] data in
      guard let self, let client, !client.closed, let http = response else {
        return false
      }
      client.touch()
      if started {
        self.forward(client, data)
        return true
      }
      head.append(data)
      if rule == .segment && head.count < HlsProxyServer.sniffBytes {
        return true
      }
      started = true
      self.sendMediaHead(client, http, sniff: head, rule: rule)
      if !withBody {
        client.task = nil
        self.finish(client)
        return false
      }
      self.forward(client, head)
      head = Data()
      return true
    }
    handler.onComplete = { [weak self, weak client] error in
      guard let self, let client, !client.closed else {
        return
      }
      client.task = nil
      if error != nil {
        if started {
          self.close(client)
        } else {
          self.respondStatus(client, 502)
        }
        return
      }
      guard let http = response else {
        self.respondStatus(client, 502)
        return
      }
      if !started {
        started = true
        self.sendMediaHead(client, http, sniff: head, rule: rule)
        if withBody {
          self.forward(client, head)
        }
      }
      self.finish(client)
    }
    client.task = task
    upstream.register(task, handler)
    task.resume()
  }

  private func sendMediaHead(_ client: RelayClient, _ http: HTTPURLResponse, sniff: Data, rule: MediaRule) {
    client.responded = true
    let upstreamType = http.value(forHTTPHeaderField: "Content-Type")
    let contentType: String
    switch rule {
    case .segment:
      contentType = HlsProxyServer.segmentContentType(upstreamType, sniff: sniff)
    case .mp4:
      if let upstreamType, upstreamType.lowercased().hasPrefix("video/") {
        contentType = upstreamType
      } else {
        contentType = "video/mp4"
      }
    }
    var headers: [(String, String)] = [("Content-Type", contentType)]
    if let contentRange = http.value(forHTTPHeaderField: "Content-Range") {
      headers.append(("Content-Range", contentRange))
    }
    if let acceptRanges = http.value(forHTTPHeaderField: "Accept-Ranges") {
      headers.append(("Accept-Ranges", acceptRanges))
    }
    // URLSession decodes a compressed body, so its length no longer matches the header.
    let encoding = http.value(forHTTPHeaderField: "Content-Encoding")?.lowercased() ?? "identity"
    if http.expectedContentLength >= 0 && encoding == "identity" {
      headers.append(("Content-Length", String(http.expectedContentLength)))
    }
    forward(client, HlsProxyServer.responseHead(status: http.statusCode, headers: headers))
  }

  private func forward(_ client: RelayClient, _ data: Data) {
    guard !client.closed, !data.isEmpty else {
      return
    }
    let count = data.count
    client.unsent += count
    client.connection.send(content: data, completion: .contentProcessed { [weak self, weak client] error in
      guard let self, let client, !client.closed else {
        return
      }
      client.unsent -= count
      if error != nil {
        self.close(client)
        return
      }
      client.touch()
      if client.paused && client.unsent <= HlsProxyServer.resumeBytes {
        client.paused = false
        client.task?.resume()
      }
    })
    if !client.paused && client.unsent >= HlsProxyServer.pauseBytes, let task = client.task {
      client.paused = true
      task.suspend()
    }
  }

  private func finish(_ client: RelayClient) {
    guard !client.closed else {
      return
    }
    client.connection.send(
      content: nil,
      contentContext: .finalMessage,
      isComplete: true,
      completion: .contentProcessed { [weak self, weak client] _ in
        guard let self, let client else {
          return
        }
        self.close(client)
      }
    )
  }

  // MARK: - Responses

  private func respond(
    _ client: RelayClient,
    status: Int,
    headers: [(String, String)],
    body: Data,
    withBody: Bool
  ) {
    guard !client.closed, !client.responded else {
      return
    }
    client.responded = true
    var allHeaders = headers
    if status != 204 {
      allHeaders.append(("Content-Length", String(body.count)))
    }
    var payload = HlsProxyServer.responseHead(status: status, headers: allHeaders)
    if withBody {
      payload.append(body)
    }
    client.connection.send(
      content: payload,
      contentContext: .finalMessage,
      isComplete: true,
      completion: .contentProcessed { [weak self, weak client] _ in
        guard let self, let client else {
          return
        }
        self.close(client)
      }
    )
  }

  private func respondStatus(_ client: RelayClient, _ status: Int) {
    respond(client, status: status, headers: [("Content-Type", "text/plain")], body: Data(), withBody: true)
  }

  private func respondPlaylist(_ client: RelayClient, _ text: String, withBody: Bool) {
    respond(
      client,
      status: 200,
      headers: [("Content-Type", "application/vnd.apple.mpegurl"), ("Cache-Control", "no-store")],
      body: Data(text.utf8),
      withBody: withBody
    )
  }

  private func respondPreflight(_ client: RelayClient) {
    respond(
      client,
      status: 204,
      headers: [
        ("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"),
        ("Access-Control-Allow-Private-Network", "true"),
      ],
      body: Data(),
      withBody: false
    )
  }

  private static func responseHead(status: Int, headers: [(String, String)]) -> Data {
    var text = "HTTP/1.1 \(status) \(reasonPhrase(status))\r\n"
    text += "Access-Control-Allow-Origin: *\r\n"
    text += "Access-Control-Allow-Headers: Range, Content-Type\r\n"
    text += "Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges\r\n"
    for header in headers {
      let value = header.1
        .replacingOccurrences(of: "\r", with: "")
        .replacingOccurrences(of: "\n", with: "")
      text += "\(header.0): \(value)\r\n"
    }
    text += "Connection: close\r\n\r\n"
    return Data(text.utf8)
  }

  private static func reasonPhrase(_ status: Int) -> String {
    switch status {
    case 200:
      return "OK"
    case 204:
      return "No Content"
    case 206:
      return "Partial Content"
    case 400:
      return "Bad Request"
    case 403:
      return "Forbidden"
    case 404:
      return "Not Found"
    case 405:
      return "Method Not Allowed"
    case 431:
      return "Request Header Fields Too Large"
    case 502:
      return "Bad Gateway"
    default:
      return status < 300 ? "OK" : "Error"
    }
  }

  /// The provider labels segments as text. The receiver picks its demuxer from this header,
  /// so a type that does not name media is replaced by one sniffed from the first bytes.
  private static func segmentContentType(_ upstreamType: String?, sniff: Data) -> String {
    if let upstreamType {
      let lower = upstreamType.lowercased()
      if passthroughTypes.contains(where: { lower.hasPrefix($0) }) {
        return upstreamType
      }
    }
    let bytes = [UInt8](sniff.prefix(HlsProxyServer.sniffBytes))
    if let first = bytes.first, first == 0x47 {
      return "video/MP2T"
    }
    if bytes.count >= 8 {
      let box = String(decoding: bytes[4..<8], as: UTF8.self)
      if mp4Boxes.contains(box) {
        return "video/mp4"
      }
    }
    return "application/octet-stream"
  }

  private static func upstreamRequest(_ url: URL, referer: String, range: String?, identity: Bool) -> URLRequest {
    var request = URLRequest(url: url)
    if !referer.isEmpty {
      request.setValue(referer, forHTTPHeaderField: "Referer")
    }
    request.setValue(upstreamUserAgent, forHTTPHeaderField: "User-Agent")
    request.setValue("*/*", forHTTPHeaderField: "Accept")
    if let range {
      request.setValue(range, forHTTPHeaderField: "Range")
    }
    if identity {
      // Media passes through byte for byte, so lengths and ranges have to match the wire.
      request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
    }
    return request
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

  private static func listenerParameters() -> NWParameters {
    let tcp = NWProtocolTCP.Options()
    tcp.noDelay = true
    tcp.enableKeepalive = true
    tcp.keepaliveIdle = 30
    tcp.keepaliveInterval = 10
    tcp.keepaliveCount = 3
    let parameters = NWParameters(tls: nil, tcp: tcp)
    parameters.allowLocalEndpointReuse = true
    return parameters
  }

  /// The receiver reaches this server by address, so the origin names the Wi-Fi, Ethernet,
  /// or Personal Hotspot interface. Loopback, link-local, `192.0.0.0/29`, cellular, and VPN
  /// tunnels never qualify. Private addresses win over others.
  private static func lanIPv4() -> String? {
    var ifaddr: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&ifaddr) == 0, let first = ifaddr else {
      return nil
    }
    defer { freeifaddrs(first) }
    var best: (rank: Int, address: String)?
    var pointer: UnsafeMutablePointer<ifaddrs>? = first
    while let entry = pointer {
      let interface = entry.pointee
      pointer = interface.ifa_next
      guard let addr = interface.ifa_addr, addr.pointee.sa_family == sa_family_t(AF_INET) else {
        continue
      }
      let flags = Int32(truncatingIfNeeded: interface.ifa_flags)
      guard (flags & IFF_UP) != 0, (flags & IFF_RUNNING) != 0, (flags & IFF_LOOPBACK) == 0 else {
        continue
      }
      guard let nameRank = HlsProxyServer.interfaceRank(String(cString: interface.ifa_name)) else {
        continue
      }
      let networkOrder = addr.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr.s_addr }
      let value = UInt32(bigEndian: networkOrder)
      guard HlsProxyServer.usableAddress(value) else {
        continue
      }
      let rank = nameRank + (HlsProxyServer.privateAddress(value) ? 0 : 10)
      if let chosen = best, chosen.rank <= rank {
        continue
      }
      let address = "\((value >> 24) & 0xff).\((value >> 16) & 0xff).\((value >> 8) & 0xff).\(value & 0xff)"
      best = (rank: rank, address: address)
    }
    return best?.address
  }

  private static func interfaceRank(_ name: String) -> Int? {
    if name == "en0" {
      return 0
    }
    if name.hasPrefix("en") {
      return 1
    }
    if name.hasPrefix("bridge") {
      return 2
    }
    if name.hasPrefix("ap") {
      return 3
    }
    return nil
  }

  private static func usableAddress(_ value: UInt32) -> Bool {
    let first = value >> 24
    if first == 0 || first == 127 || first >= 224 {
      return false
    }
    if value >> 16 == 0xA9FE {
      return false
    }
    if value & 0xFFFF_FFF8 == 0xC000_0000 {
      return false
    }
    return true
  }

  private static func privateAddress(_ value: UInt32) -> Bool {
    let first = value >> 24
    let second = (value >> 16) & 0xff
    return first == 10 || (first == 172 && second >= 16 && second <= 31) || (first == 192 && second == 168)
  }

  fileprivate static let firstPort = 8108
  fileprivate static let lastPort = 8127
  fileprivate static let maxTextBytes = 4 * 1024 * 1024
  fileprivate static let maxHeaderBytes = 8 * 1024
  fileprivate static let maxClients = 32
  fileprivate static let sniffBytes = 8
  fileprivate static let pauseBytes = 4 * 1024 * 1024
  fileprivate static let resumeBytes = 1024 * 1024
  fileprivate static let listenerAttemptSeconds = 2.0
  fileprivate static let listenSeconds = 10.0
  fileprivate static let watchdogSeconds = 5.0
  fileprivate static let headerTimeoutNanos: UInt64 = 10_000_000_000
  fileprivate static let idleTimeoutNanos: UInt64 = 30_000_000_000
  fileprivate static let headerEnd = Data([13, 10, 13, 10])
  fileprivate static let passthroughTypes = [
    "video/",
    "audio/",
    "application/mp4",
    "application/vnd.apple.mpegurl",
    "application/x-mpegurl",
    "application/dash+xml",
  ]
  fileprivate static let mp4Boxes: Set<String> = ["ftyp", "styp", "moof", "sidx", "moov"]
  fileprivate static let upstreamUserAgent =
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) "
      + "Chrome/140.0.0.0 Mobile Safari/537.36"
}

/// The committed session. Its token and HMAC key live in `routes.signer`.
private struct RelaySession {
  let routes: RelayRoutes
  let source: URL
  let referer: String
  let kind: RelayKind
  let origin: String
  let port: Int
}

private struct RelayProbe {
  let live: Bool
  let segmentFormat: String?
}

private struct UpstreamText {
  let text: String
  let url: URL
}

private enum MediaRule {
  /// `/s` and `/d/`: upstream media type or sniffed bytes.
  case segment
  /// `/media.mp4`: upstream `video/*`, else `video/mp4`.
  case mp4
}

/// A start between `startProxy` and the listener reaching `.ready`.
private final class PendingStart {
  let source: URL
  let referer: String
  let kind: RelayKind
  let address: String
  let completion: RelayStartCompletion
  var probe: RelayProbe?
  var listener: NWListener?
  var attemptTimer: DispatchWorkItem?
  var port = HlsProxyServer.firstPort
  var bindAddress = true
  var deadline = DispatchTime.now()

  init(source: URL, referer: String, kind: RelayKind, address: String, completion: @escaping RelayStartCompletion) {
    self.source = source
    self.referer = referer
    self.kind = kind
    self.address = address
    self.completion = completion
  }
}

/// One accepted receiver connection. It serves a single request, then closes.
private final class RelayClient {
  let id: Int
  let connection: NWConnection
  let acceptedAt = DispatchTime.now()
  var lastActivity = DispatchTime.now()
  var buffer = Data()
  var requestParsed = false
  var responded = false
  var closed = false
  var range: String?
  var task: URLSessionDataTask?
  var unsent = 0
  var paused = false

  init(id: Int, connection: NWConnection) {
    self.id = id
    self.connection = connection
  }

  func touch() {
    lastActivity = DispatchTime.now()
  }
}

/// Callbacks for one upstream task. `onResponse` and `onData` return false to cancel it.
private final class UpstreamHandler {
  var onResponse: (URLResponse) -> Bool = { _ in true }
  var onData: (Data) -> Bool = { _ in true }
  var onComplete: (Error?) -> Void = { _ in }
}

/// Routes URLSession callbacks to per-task handlers. The session delivers every callback on
/// the relay queue, so the handler table needs no lock.
private final class UpstreamDelegate: NSObject, URLSessionDataDelegate {
  private var handlers: [Int: UpstreamHandler] = [:]
  private var tasks: [Int: URLSessionDataTask] = [:]

  func register(_ task: URLSessionDataTask, _ handler: UpstreamHandler) {
    handlers[task.taskIdentifier] = handler
    tasks[task.taskIdentifier] = task
  }

  /// Cancels without calling the task's handler again.
  func cancel(_ task: URLSessionDataTask) {
    forget(task.taskIdentifier)
    task.cancel()
  }

  func cancelAll() {
    let open = Array(tasks.values)
    handlers.removeAll()
    tasks.removeAll()
    for task in open {
      task.cancel()
    }
  }

  private func forget(_ identifier: Int) {
    handlers[identifier] = nil
    tasks[identifier] = nil
  }

  func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    guard let handler = handlers[dataTask.taskIdentifier] else {
      completionHandler(.cancel)
      return
    }
    if handler.onResponse(response) {
      completionHandler(.allow)
    } else {
      forget(dataTask.taskIdentifier)
      completionHandler(.cancel)
    }
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard let handler = handlers[dataTask.taskIdentifier] else {
      return
    }
    if !handler.onData(data) {
      forget(dataTask.taskIdentifier)
      dataTask.cancel()
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let identifier = task.taskIdentifier
    guard let handler = handlers[identifier] else {
      return
    }
    forget(identifier)
    handler.onComplete(error)
  }
}
