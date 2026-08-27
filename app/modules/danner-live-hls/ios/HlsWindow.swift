import Foundation

final class HlsWindow {
  struct Segment {
    let durationSeconds: Double
    let index: Int64
    let payload: Data
  }

  private let lock = NSLock()
  private var segments: [Segment] = []
  private var nextMediaSequence: Int64 = 0
  private let maxSegments = 8
  private let targetDurationSeconds = 3

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
    var builder = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:\(targetDurationSeconds)\n"
    builder += "#EXT-X-MEDIA-SEQUENCE:\(first.index)\n#EXT-X-INDEPENDENT-SEGMENTS\n"
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
