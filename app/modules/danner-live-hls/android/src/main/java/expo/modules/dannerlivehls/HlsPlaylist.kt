package expo.modules.dannerlivehls

import java.net.URL

internal const val HLS_PLAYLIST_CONTENT_TYPE = "application/vnd.apple.mpegurl"

private val FMP4_SEGMENT_SUFFIXES = listOf(".m4s", ".mp4", ".cmfv", ".cmfa")

/** The body without a leading byte-order mark or whitespace. */
internal fun playlistText(body: String): String {
  return body.trimStart { it == '\uFEFF' || it.isWhitespace() }
}

/**
 * The provider answers a dropped stream with a 200 error page, so a body that is not a
 * playlist has to fail here rather than reach the receiver as rewritten segment lines.
 */
internal fun requirePlaylist(body: String): String {
  if (!playlistText(body).startsWith("#EXTM3U")) {
    throw IllegalStateException("upstream body is not a playlist")
  }
  return body
}

internal fun resolveUri(base: URL, value: String): String? {
  return try {
    URL(base, value).toString()
  } catch (_: Exception) {
    null
  }
}

/** `data:` and `skd:` payloads are not fetched from the provider and stay as written. */
private fun isOpaqueUri(value: String): Boolean {
  return value.startsWith("data:", ignoreCase = true) || value.startsWith("skd:", ignoreCase = true)
}

/** One `NAME=value` attribute of a tag line and the span of its value (quotes excluded). */
internal class HlsAttribute(
  val name: String,
  val value: String,
  val valueStart: Int,
  val valueEnd: Int,
  val quoted: Boolean,
)

/** Attributes after the tag's `:`. Quoted values keep their commas. */
internal fun hlsAttributes(line: String): List<HlsAttribute> {
  val colon = line.indexOf(':')
  if (colon < 0) {
    return emptyList()
  }
  val attributes = ArrayList<HlsAttribute>()
  var index = colon + 1
  while (index < line.length) {
    while (index < line.length && (line[index] == ',' || line[index] == ' ')) {
      index += 1
    }
    val equals = line.indexOf('=', index)
    if (equals < 0) {
      break
    }
    val name = line.substring(index, equals).trim()
    val valueStart = equals + 1
    if (valueStart < line.length && line[valueStart] == '"') {
      val close = line.indexOf('"', valueStart + 1)
      if (close < 0) {
        break
      }
      attributes.add(HlsAttribute(name, line.substring(valueStart + 1, close), valueStart + 1, close, true))
      index = close + 1
    } else {
      val comma = line.indexOf(',', valueStart).let { if (it < 0) line.length else it }
      attributes.add(HlsAttribute(name, line.substring(valueStart, comma), valueStart, comma, false))
      index = comma
    }
    val next = line.indexOf(',', index)
    if (next < 0) {
      break
    }
    index = next + 1
  }
  return attributes
}

/** Replaces each quoted `URI` value on a tag line; a null [transform] result keeps that value. */
internal fun rewriteUriAttributes(line: String, transform: (String) -> String?): String {
  val uris = hlsAttributes(line).filter { it.name == "URI" && it.quoted }
  if (uris.isEmpty()) {
    return line
  }
  val builder = StringBuilder()
  var last = 0
  for (attribute in uris) {
    val replacement = transform(attribute.value) ?: continue
    builder.append(line, last, attribute.valueStart).append(replacement)
    last = attribute.valueEnd
  }
  builder.append(line, last, line.length)
  return builder.toString()
}

/** One `#EXT-X-MEDIA` line of a master playlist. */
internal class HlsMediaTag(
  val line: String,
  val type: String?,
  val groupId: String?,
  val uri: String?,
)

/** A master playlist and the variant the relay forwards from it. */
internal class HlsMaster(
  val base: URL,
  val independentSegments: Boolean,
  val variants: List<RelayVariant>,
  val media: List<HlsMediaTag>,
) {
  val selected: RelayVariant? = selectRelayVariant(variants)

  /** The renditions of [variant]'s `AUDIO` group, in playlist order. */
  fun audioGroup(variant: RelayVariant): List<HlsMediaTag> {
    val group = variant.audioGroup ?: return emptyList()
    return media.filter { it.type == "AUDIO" && it.groupId == group }
  }

  companion object {
    /** Null when [body] is a media playlist rather than a master. */
    fun parse(body: String, base: URL): HlsMaster? {
      val lines = playlistText(body).lines().map { it.trimEnd() }
      if (lines.none { it.startsWith("#EXT-X-STREAM-INF") }) {
        return null
      }
      var independentSegments = false
      val variants = ArrayList<RelayVariant>()
      val media = ArrayList<HlsMediaTag>()
      for (index in lines.indices) {
        val line = lines[index]
        when {
          line.startsWith("#EXT-X-INDEPENDENT-SEGMENTS") -> independentSegments = true
          line.startsWith("#EXT-X-MEDIA:") -> {
            val attributes = hlsAttributes(line)
            media.add(
              HlsMediaTag(
                line = line,
                type = attributes.firstOrNull { it.name == "TYPE" }?.value,
                groupId = attributes.firstOrNull { it.name == "GROUP-ID" }?.value,
                uri = attributes.firstOrNull { it.name == "URI" && it.quoted }?.value,
              ),
            )
          }
          line.startsWith("#EXT-X-STREAM-INF") -> {
            for (next in index + 1 until lines.size) {
              val candidate = lines[next].trim()
              if (candidate.isEmpty() || candidate.startsWith("#")) {
                continue
              }
              val url = resolveUri(base, candidate) ?: break
              variants.add(
                RelayVariant(
                  audioOnly = streamInfAudioOnly(line),
                  bandwidth = streamInfBandwidth(line),
                  url = url,
                  streamInf = line,
                  audioGroup = hlsAttributes(line).firstOrNull { it.name == "AUDIO" }?.value,
                ),
              )
              break
            }
          }
        }
      }
      return HlsMaster(base, independentSegments, variants, media)
    }
  }
}

/**
 * Master playlist for a variant whose audio is a separate rendition: that group's renditions
 * and the variant itself, each pointing back at this relay.
 */
internal fun demuxedMasterPlaylist(
  master: HlsMaster,
  variant: RelayVariant,
  group: List<HlsMediaTag>,
  token: String,
): String {
  val builder = StringBuilder("#EXTM3U\n")
  if (master.independentSegments) {
    builder.append("#EXT-X-INDEPENDENT-SEGMENTS\n")
  }
  group.forEachIndexed { index, tag ->
    val line = if (tag.uri == null) tag.line else rewriteUriAttributes(tag.line) { "/$token/audio.m3u8?g=$index" }
    builder.append(line).append('\n')
  }
  builder.append(variant.streamInf).append('\n')
  builder.append("/").append(token).append("/video.m3u8\n")
  return builder.toString()
}

internal class MediaRewrite(val text: String, val prefetchUrls: List<String>)

/**
 * Sends every segment line and every `URI` attribute of a media playlist back through the
 * relay as a signed `/s` path. [base] is the playlist URL after redirects. The prefetch list is
 * the init maps and keys, then the last [edgeCount] segments, newest first.
 */
internal fun rewriteMediaPlaylist(
  body: String,
  base: URL,
  session: RelaySession,
  edgeCount: Int,
): MediaRewrite {
  val builder = StringBuilder()
  val segmentUrls = ArrayList<String>()
  val initUrls = ArrayList<String>()
  for (rawLine in playlistText(body).lines()) {
    val line = rawLine.trimEnd()
    when {
      line.isEmpty() -> builder.append('\n')
      line.startsWith("#EXT") -> {
        val initTag = line.startsWith("#EXT-X-MAP") || line.startsWith("#EXT-X-KEY")
        val rewritten = rewriteUriAttributes(line) { value ->
          if (isOpaqueUri(value)) {
            null
          } else {
            resolveUri(base, value)?.let { absolute ->
              if (initTag) {
                initUrls.add(absolute)
              }
              session.signedPath(absolute)
            }
          }
        }
        builder.append(rewritten).append('\n')
      }
      line.startsWith("#") -> builder.append(line).append('\n')
      else -> {
        val value = line.trim()
        val absolute = if (isOpaqueUri(value)) null else resolveUri(base, value)
        if (absolute == null) {
          builder.append(line).append('\n')
        } else {
          segmentUrls.add(absolute)
          builder.append(session.signedPath(absolute)).append('\n')
        }
      }
    }
  }
  val prefetchUrls = ArrayList<String>(initUrls)
  prefetchUrls.addAll(segmentUrls.takeLast(edgeCount).asReversed())
  return MediaRewrite(builder.toString(), prefetchUrls)
}

internal class MediaPlaylistInfo(val live: Boolean, val segmentFormat: String)

/** Live when the playlist has no `#EXT-X-ENDLIST`; fMP4 when it maps an init segment or names CMAF segments. */
internal fun mediaPlaylistInfo(body: String, base: URL): MediaPlaylistInfo {
  var hasMap = false
  var ended = false
  var firstSegment: String? = null
  for (rawLine in playlistText(body).lines()) {
    val line = rawLine.trim()
    if (line.startsWith("#EXT-X-MAP")) {
      hasMap = true
    } else if (line.startsWith("#EXT-X-ENDLIST")) {
      ended = true
    } else if (line.isNotEmpty() && !line.startsWith("#") && firstSegment == null) {
      firstSegment = line
    }
  }
  val path = firstSegment?.let { segment ->
    try {
      URL(base, segment).path
    } catch (_: Exception) {
      segment.substringBefore('?').substringBefore('#')
    }
  }?.lowercase().orEmpty()
  val fmp4 = hasMap || FMP4_SEGMENT_SUFFIXES.any { path.endsWith(it) }
  return MediaPlaylistInfo(!ended, if (fmp4) "fmp4" else "ts")
}
