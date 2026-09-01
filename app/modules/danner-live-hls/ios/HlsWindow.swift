import Foundation

final class HlsWindow: @unchecked Sendable {
  struct Segment {
    let durationSeconds: Double
    let index: Int64
    let payload: Data
  }

  private let lock = NSLock()
  private var segments: [Segment] = []
  private var nextMediaSequence: Int64 = 0
  private let maxSegments = 12
  private let minTargetDurationSeconds = 3

  func add(durationSeconds: Double, payload: Data) -> Int64 {
    lock.lock()
    defer { lock.unlock() }
    let index = nextMediaSequence
    nextMediaSequence += 1
    segments.append(Segment(durationSeconds: durationSeconds, index: index, payload: payload))
    while segments.count > maxSegments {
      segments.removeFirst()
    }
    return index
  }

  func playlist() -> String {
    lock.lock()
    defer { lock.unlock() }
    guard let first = segments.first else {
      return ""
    }
    // RFC 8216 requires TARGETDURATION to be at least the longest EXTINF in the window, and
    // players size their live holdback from it, so it has to follow the real segments.
    let longest = segments.map(\.durationSeconds).max() ?? 0
    let targetDuration = max(minTargetDurationSeconds, Int(longest.rounded(.up)))
    var builder = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:\(targetDuration)\n"
    builder += "#EXT-X-MEDIA-SEQUENCE:\(first.index)\n"
    for segment in segments {
      builder += String(format: "#EXTINF:%.3f,\nseg-%lld.ts\n", locale: Locale(identifier: "en_US_POSIX"), segment.durationSeconds, segment.index)
    }
    return builder
  }

  func segment(_ index: Int64) -> Data? {
    lock.lock()
    defer { lock.unlock() }
    return segments.first(where: { $0.index == index })?.payload
  }

  var count: Int {
    lock.lock()
    defer { lock.unlock() }
    return segments.count
  }

  func clear() {
    lock.lock()
    segments.removeAll()
    lock.unlock()
  }
}
