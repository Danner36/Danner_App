package expo.modules.dannerlivehls

import java.net.URL

/** What one probe of the source learned. [segmentFormat] is set for HLS only. */
internal class RelayProbeResult(val live: Boolean, val segmentFormat: String?)

/**
 * Checks the source once, with the session `Referer`, before a relay session is handed to the
 * receiver. A source that fails here would only give the receiver 502s.
 */
internal object RelayProbe {
  fun probe(source: URL, referer: String, kind: RelayKind): RelayProbeResult {
    return try {
      when (kind) {
        RelayKind.HLS -> probeHls(source, referer)
        RelayKind.DASH -> probeDash(source, referer)
        RelayKind.MP4 -> probeMp4(source, referer)
      }
    } catch (error: Exception) {
      throw RelayStartException(ERR_SOURCE, error.message ?: "The source is unavailable.", error)
    } catch (error: OutOfMemoryError) {
      throw RelayStartException(ERR_SOURCE, "The source is too large.", error)
    }
  }

  private fun probeHls(source: URL, referer: String): RelayProbeResult {
    val first = RelayUpstream.fetchText(source, referer)
    requirePlaylist(first.body)
    val variant = HlsMaster.parse(first.body, first.finalUrl)?.selected
    val media = if (variant == null) {
      first
    } else {
      RelayUpstream.fetchText(URL(variant.url), referer).also { requirePlaylist(it.body) }
    }
    val info = mediaPlaylistInfo(media.body, media.finalUrl)
    return RelayProbeResult(info.live, info.segmentFormat)
  }

  private fun probeDash(source: URL, referer: String): RelayProbeResult {
    val manifest = RelayUpstream.fetchText(source, referer)
    if (!DashManifest.isManifest(manifest.body)) {
      throw UpstreamException("upstream body is not an MPD")
    }
    return RelayProbeResult(DashManifest.isDynamic(manifest.body), null)
  }

  private fun probeMp4(source: URL, referer: String): RelayProbeResult {
    RelayUpstream.open(source, referer, range = "bytes=0-1", identity = true).use { response ->
      if (response.status != 200 && response.status != 206) {
        throw UpstreamException("upstream status ${response.status}")
      }
    }
    return RelayProbeResult(false, null)
  }
}
