package expo.modules.dannerlivehls

import java.util.ArrayDeque
import java.util.Locale
import kotlin.math.ceil

internal class HlsWindow(
  private val minTargetDurationSeconds: Int = 3,
  private val maxSegments: Int = 12,
) {
  private val lock = Any()
  private val segments = ArrayDeque<Segment>()
  private var nextMediaSequence = 0L
  private var width = 0
  private var height = 0
  private var codecs = ""

  data class Segment(
    val durationSeconds: Double,
    val index: Long,
    val payload: ByteArray,
  )

  fun setProgram(codedWidth: Int, codedHeight: Int, codecList: String) {
    synchronized(lock) {
      width = codedWidth
      height = codedHeight
      codecs = codecList
    }
  }

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

  fun masterPlaylist(): String {
    synchronized(lock) {
      if (width <= 0 || height <= 0 || segments.isEmpty()) {
        return ""
      }
      val bandwidth = 2_500_000
      val codecsAttr = if (codecs.isNotEmpty()) "CODECS=\"$codecs\"," else ""
      return "#EXTM3U\n" +
        "#EXT-X-VERSION:6\n" +
        "#EXT-X-INDEPENDENT-SEGMENTS\n" +
        "#EXT-X-STREAM-INF:BANDWIDTH=$bandwidth,${codecsAttr}" +
        "RESOLUTION=${width}x${height},FRAME-RATE=30.000\n" +
        "index.m3u8\n"
    }
  }

  fun mediaPlaylist(): String {
    synchronized(lock) {
      if (segments.isEmpty()) {
        return ""
      }
      val first = segments.first.index
      val targetDuration = maxOf(
        minTargetDurationSeconds,
        ceil(segments.maxOf { it.durationSeconds }).toInt(),
      )
      val builder = StringBuilder()
      builder.append("#EXTM3U\n")
      builder.append("#EXT-X-VERSION:3\n")
      builder.append("#EXT-X-TARGETDURATION:$targetDuration\n")
      builder.append("#EXT-X-MEDIA-SEQUENCE:$first\n")
      for (segment in segments) {
        builder.append(
          "#EXTINF:${"%.5f".format(Locale.US, segment.durationSeconds)},\n",
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
      width = 0
      height = 0
    }
  }
}
