import CryptoKit
import Foundation

/// Per-session relay token and HMAC key. Every upstream URL the relay hands out carries
/// `sig(url)`, so the relay fetches only URLs it wrote for the current session.
struct RelaySigner {
  let token: String
  private let key: SymmetricKey

  init() {
    let tokenBytes: [UInt8] = SymmetricKey(size: .bits128).withUnsafeBytes { Array($0) }
    token = RelaySigner.hex(tokenBytes)
    key = SymmetricKey(size: .bits256)
  }

  /// Lowercase hex of the first 16 bytes of HMAC-SHA256 over the UTF-8 bytes of `value`.
  func sign(_ value: String) -> String {
    let code = HMAC<SHA256>.authenticationCode(for: Data(value.utf8), using: key)
    let bytes: [UInt8] = code.withUnsafeBytes { Array($0) }
    return RelaySigner.hex(Array(bytes.prefix(16)))
  }

  func verify(_ value: String, signature: String) -> Bool {
    return RelaySigner.constantTimeEquals(sign(value), signature)
  }

  static func constantTimeEquals(_ left: String, _ right: String) -> Bool {
    let leftBytes = Array(left.utf8)
    let rightBytes = Array(right.utf8)
    guard leftBytes.count == rightBytes.count else {
      return false
    }
    var difference: UInt8 = 0
    for index in 0..<leftBytes.count {
      difference |= leftBytes[index] ^ rightBytes[index]
    }
    return difference == 0
  }

  static func hex(_ bytes: [UInt8]) -> String {
    let digits: [Character] = Array("0123456789abcdef")
    var output = ""
    output.reserveCapacity(bytes.count * 2)
    for byte in bytes {
      output.append(digits[Int(byte >> 4)])
      output.append(digits[Int(byte & 0x0f)])
    }
    return output
  }

  /// URL-safe base64 of the UTF-8 bytes, without padding.
  static func base64Url(_ value: String) -> String {
    return Data(value.utf8).base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  static func decodeBase64Url(_ value: String) -> String? {
    guard !value.isEmpty else {
      return nil
    }
    var normalized = value
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    while normalized.count % 4 != 0 {
      normalized += "="
    }
    guard let data = Data(base64Encoded: normalized) else {
      return nil
    }
    return String(data: data, encoding: .utf8)
  }
}

/// Relay paths for one session. Segment paths are origin-relative. DASH directories are
/// absolute, because a manifest `BaseURL` is resolved against them.
struct RelayRoutes {
  let origin: String
  let signer: RelaySigner

  var prefix: String {
    return "/" + signer.token
  }

  /// `/<token>/s?u=<base64url>&k=<sig>` for one upstream object.
  func segment(_ absolute: String) -> String {
    return "\(prefix)/s?u=\(RelaySigner.base64Url(absolute))&k=\(signer.sign(absolute))"
  }

  /// `<origin>/<token>/d/<base64url>/<sig>/` for an upstream directory ending in `/`.
  func directory(_ upstreamDirectory: String) -> String {
    let encoded = RelaySigner.base64Url(upstreamDirectory)
    return "\(origin)\(prefix)/d/\(encoded)/\(signer.sign(upstreamDirectory))/"
  }

  static func isHttpUrl(_ value: String) -> Bool {
    let lower = value.lowercased()
    return lower.hasPrefix("http://") || lower.hasPrefix("https://")
  }
}
