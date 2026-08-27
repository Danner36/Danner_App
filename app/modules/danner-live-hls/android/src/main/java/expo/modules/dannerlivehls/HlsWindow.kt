package expo.modules.dannerlivehls

import java.util.ArrayDeque
import java.util.Locale

internal class HlsWindow(
  private val targetDurationSeconds: Int = 3,
  private val maxSegments: Int = 8,
) {
  private val lock = Any()
  private val segments = ArrayDeque<Segment>()
  private var nextMediaSequence = 0L

  data class Segment(
    val durationSeconds: Double,
    val index: Long,
    val payload: ByteArray,
  )

  fun add(durationSeconds: Double, payload: ByteArray): Long {
    synchronized(lock) {
      val index = nextMediaSequence
      nextMediaSequence += 1
      segments.addLast(Segment(durationSeconds, index, payload))
      while (segments.size > maxSegments) {
        segments.removeFirst()
      }
      return index
    }
  }

  fun playlist(): String {
    synchronized(lock) {
      if (segments.isEmpty()) {
        return ""
      }
      val first = segments.first.index
      val builder = StringBuilder()
      builder.append("#EXTM3U\n")
      builder.append("#EXT-X-VERSION:3\n")
      builder.append("#EXT-X-TARGETDURATION:$targetDurationSeconds\n")
      builder.append("#EXT-X-MEDIA-SEQUENCE:$first\n")
      builder.append("#EXT-X-INDEPENDENT-SEGMENTS\n")
      for (segment in segments) {
        builder.append(
          "#EXTINF:${"%.3f".format(Locale.US, segment.durationSeconds)},\n",
        )
        builder.append("seg-${segment.index}.ts\n")
      }
      return builder.toString()
    }
  }

  fun segment(index: Long): ByteArray? {
    synchronized(lock) {
      return segments.firstOrNull { it.index == index }?.payload
    }
  }

  fun size(): Int {
    synchronized(lock) {
      return segments.size
    }
  }

  fun clear() {
    synchronized(lock) {
      segments.clear()
    }
  }
}
