import Foundation
import Network

final class HlsHttpServer: @unchecked Sendable {
  private let window: HlsWindow
  private let queue = DispatchQueue(label: "danner.livehls.http")
  private var listener: NWListener?

  private(set) var port: Int = 0

  init(window: HlsWindow) {
    self.window = window
  }

  func start(in range: ClosedRange<Int>) throws -> Int {
    stop()
    var lastError: Error?
    for candidate in range {
      do {
        let portValue = NWEndpoint.Port(rawValue: UInt16(candidate))!
        let started = try NWListener(using: .tcp, on: portValue)
        started.newConnectionHandler = { [weak self] connection in
          self?.handle(connection)
        }
        let ready = DispatchSemaphore(value: 0)
        let failed = StartFlag()
        started.stateUpdateHandler = { state in
          switch state {
          case .ready:
            ready.signal()
          case .failed(_):
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
        return candidate
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
    let path = parts.count >= 2 ? String(parts[1]).split(separator: "?").first.map(String.init) ?? "/" : "/"
    if method == "OPTIONS" {
      // A 204 carries no representation, so it must not announce a length.
      send(on: connection, status: 204, reason: "No Content", contentType: nil, body: nil)
      return
    }
    if method != "GET" && method != "HEAD" {
      send(on: connection, status: 405, reason: "Method Not Allowed", contentType: "text/plain", body: Data())
      return
    }
    // A HEAD reply carries the headers of the GET, including Content-Length, but no body.
    let withBody = method == "GET"
    if path == "/live.m3u8" {
      let body = Data(window.playlist().utf8)
      if body.isEmpty {
        send(on: connection, status: 404, reason: "Not Found", contentType: "text/plain", body: Data())
      } else {
        send(
          on: connection,
          status: 200,
          reason: "OK",
          contentType: "application/vnd.apple.mpegurl",
          body: body,
          withBody: withBody
        )
      }
      return
    }
    if path.hasPrefix("/seg-"), path.hasSuffix(".ts") {
      let indexString = String(path.dropFirst("/seg-".count).dropLast(".ts".count))
      if let index = Int64(indexString), let payload = window.segment(index) {
        send(
          on: connection,
          status: 200,
          reason: "OK",
          contentType: "video/MP2T",
          body: payload,
          withBody: withBody
        )
      } else {
        send(on: connection, status: 404, reason: "Not Found", contentType: "text/plain", body: Data())
      }
      return
    }
    send(on: connection, status: 404, reason: "Not Found", contentType: "text/plain", body: Data())
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
    // Content-Length is not CORS-safelisted, so the receiver's player cannot read it without
    // this. Range is unsupported, and saying so keeps clients from probing for it.
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
}

private final class StartFlag: @unchecked Sendable {
  var value = false
}
