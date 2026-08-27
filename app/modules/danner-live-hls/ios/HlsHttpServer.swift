import Foundation
import Network

final class HlsHttpServer {
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
        var failed = false
        started.stateUpdateHandler = { state in
          switch state {
          case .ready:
            ready.signal()
          case .failed:
            failed = true
            ready.signal()
          default:
            break
          }
        }
        started.start(queue: queue)
        _ = ready.wait(timeout: .now() + 1)
        if failed {
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
      send(on: connection, status: 204, reason: "No Content", contentType: nil, body: Data())
      return
    }
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
          body: body
        )
      }
      return
    }
    if path.hasPrefix("/seg-"), path.hasSuffix(".ts") {
      let indexString = path.replacingOccurrences(of: "/seg-", with: "").replacingOccurrences(of: ".ts", with: "")
      if let index = Int64(indexString), let payload = window.segment(index) {
        send(on: connection, status: 200, reason: "OK", contentType: "video/MP2T", body: payload)
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
    body: Data
  ) {
    var header = "HTTP/1.1 \(status) \(reason)\r\n"
    header += "Access-Control-Allow-Origin: *\r\n"
    header += "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
    header += "Access-Control-Allow-Headers: *\r\n"
    header += "Cache-Control: no-store\r\n"
    header += "Connection: close\r\n"
    if let contentType {
      header += "Content-Type: \(contentType)\r\n"
    }
    header += "Content-Length: \(body.count)\r\n\r\n"
    var payload = Data(header.utf8)
    payload.append(body)
    connection.send(content: payload, completion: .contentProcessed { _ in
      connection.cancel()
    })
  }
}
