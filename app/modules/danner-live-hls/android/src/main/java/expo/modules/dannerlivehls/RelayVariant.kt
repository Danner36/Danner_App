package expo.modules.dannerlivehls

/**
 * Which master-playlist variant the phone forwards. Selection matches
 * `src/relayVariant.ts`. [url] is absolute; [streamInf] is the original
 * `#EXT-X-STREAM-INF` line and [audioGroup] its `AUDIO` group, when present.
 */
internal data class RelayVariant(
  val audioOnly: Boolean,
  val bandwidth: Long,
  val url: String,
  val streamInf: String = "",
  val audioGroup: String? = null,
)

internal const val RELAY_MAX_BANDWIDTH = 3_500_000L

internal fun selectRelayVariant(variants: List<RelayVariant>): RelayVariant? {
  if (variants.isEmpty()) {
    return null
  }
  val video = variants.filter { !it.audioOnly }
  val pool = if (video.isNotEmpty()) video else variants
  val known = pool.filter { it.bandwidth > 0 }
  val under = known.filter { it.bandwidth <= RELAY_MAX_BANDWIDTH }
  if (under.isNotEmpty()) {
    return under.maxBy { it.bandwidth }
  }
  if (known.isNotEmpty()) {
    return known.minBy { it.bandwidth }
  }
  return pool.first()
}

internal fun streamInfBandwidth(line: String): Long {
  val marker = "BANDWIDTH="
  var search = 0
  while (search < line.length) {
    val start = line.indexOf(marker, search)
    if (start < 0) {
      return -1
    }
    // AVERAGE-BANDWIDTH= contains the same suffix and is not the peak rate.
    if (start == 0 || line[start - 1] == ',' || line[start - 1] == ':') {
      val digits = line.substring(start + marker.length).takeWhile { it.isDigit() }
      return digits.toLongOrNull() ?: -1
    }
    search = start + marker.length
  }
  return -1
}

internal fun streamInfAudioOnly(line: String): Boolean {
  val codecs = streamInfAttribute(line, "CODECS")?.lowercase() ?: return false
  val video =
    codecs.contains("avc1") ||
      codecs.contains("avc3") ||
      codecs.contains("hvc1") ||
      codecs.contains("hev1") ||
      codecs.contains("dvh1") ||
      codecs.contains("dvhe") ||
      codecs.contains("av01") ||
      codecs.contains("vp09") ||
      codecs.contains("vp9")
  if (video) {
    return false
  }
  return codecs.contains("mp4a") ||
    codecs.contains("ac-3") ||
    codecs.contains("ec-3") ||
    codecs.contains("opus") ||
    codecs.contains("flac") ||
    codecs.contains("alac")
}

private fun streamInfAttribute(line: String, name: String): String? {
  val key = "$name="
  val start = line.indexOf(key)
  if (start < 0) {
    return null
  }
  var index = start + key.length
  if (index < line.length && line[index] == '"') {
    val end = line.indexOf('"', index + 1)
    if (end < 0) {
      return null
    }
    return line.substring(index + 1, end)
  }
  val comma = line.indexOf(',', index)
  val end = if (comma < 0) line.length else comma
  return line.substring(index, end)
}
