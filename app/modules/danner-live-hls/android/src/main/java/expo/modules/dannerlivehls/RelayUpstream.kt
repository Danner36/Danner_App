package expo.modules.dannerlivehls

import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/** An upstream request the relay cannot use; the client gets 502. */
internal class UpstreamException(message: String) : IOException(message)

/** An open upstream response. [finalUrl] is the URL after every redirect. */
internal class UpstreamResponse(
  val connection: HttpURLConnection,
  val finalUrl: URL,
  val status: Int,
) : Closeable {
  val contentLength: Long
    get() = connection.contentLengthLong

  fun header(name: String): String? = connection.getHeaderField(name)

  override fun close() {
    try {
      connection.disconnect()
    } catch (_: Exception) {
    }
  }
}

internal class FetchedText(val finalUrl: URL, val body: String)

/**
 * Upstream requests for the relay. Every request carries the session `Referer` and the
 * player's user agent, and every text body is capped so an error page or an endless file
 * cannot exhaust memory.
 */
internal object RelayUpstream {
  const val READ_TIMEOUT_MS = 20_000
  const val MAX_TEXT_BYTES = 4 * 1024 * 1024
  private const val CONNECT_TIMEOUT_MS = 8_000
  private const val MAX_REDIRECTS = 5
  private val REDIRECT_STATUSES = setOf(301, 302, 303, 307, 308)
  private const val USER_AGENT =
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0.0.0 Mobile Safari/537.36"

  /**
   * Follows redirects here rather than in [HttpURLConnection], which refuses to cross between
   * http and https and does not report where it landed. Relative references resolve against
   * [UpstreamResponse.finalUrl].
   */
  fun open(
    url: URL,
    referer: String,
    range: String? = null,
    identity: Boolean = false,
  ): UpstreamResponse {
    var current = url
    var hops = 0
    while (true) {
      if (current.protocol != "http" && current.protocol != "https") {
        throw UpstreamException("unsupported upstream scheme ${current.protocol}")
      }
      val connection = current.openConnection() as HttpURLConnection
      connection.instanceFollowRedirects = false
      connection.connectTimeout = CONNECT_TIMEOUT_MS
      connection.readTimeout = READ_TIMEOUT_MS
      if (referer.isNotBlank()) {
        connection.setRequestProperty("Referer", referer)
      }
      connection.setRequestProperty("User-Agent", USER_AGENT)
      connection.setRequestProperty("Accept", "*/*")
      if (range != null) {
        connection.setRequestProperty("Range", range)
      }
      if (identity) {
        // Media passes through byte for byte, so lengths and ranges have to match the wire.
        connection.setRequestProperty("Accept-Encoding", "identity")
      }
      val status = try {
        connection.responseCode
      } catch (error: IOException) {
        connection.disconnect()
        throw error
      }
      if (status in REDIRECT_STATUSES) {
        val location = connection.getHeaderField("Location")
        connection.disconnect()
        if (location.isNullOrBlank() || hops >= MAX_REDIRECTS) {
          throw UpstreamException("upstream redirect $status has no usable target")
        }
        current = URL(current, location.trim())
        hops += 1
        continue
      }
      return UpstreamResponse(connection, current, status)
    }
  }

  /** A 2xx text body of at most [MAX_TEXT_BYTES]; anything else throws. */
  fun fetchText(url: URL, referer: String): FetchedText {
    return open(url, referer).use { response ->
      if (response.status !in 200..299) {
        throw UpstreamException("upstream status ${response.status}")
      }
      if (response.contentLength > MAX_TEXT_BYTES) {
        throw UpstreamException("upstream body is over the playlist limit")
      }
      val bytes = response.connection.inputStream.use { stream ->
        readCapped(stream, MAX_TEXT_BYTES)
      } ?: throw UpstreamException("upstream body is over the playlist limit")
      FetchedText(response.finalUrl, String(bytes, StandardCharsets.UTF_8))
    }
  }

  /** The whole stream when it is at most [limit] bytes, else null. */
  fun readCapped(input: InputStream, limit: Int): ByteArray? {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(16 * 1024)
    while (true) {
      val read = input.read(buffer)
      if (read < 0) {
        return output.toByteArray()
      }
      if (output.size() + read > limit) {
        return null
      }
      output.write(buffer, 0, read)
    }
  }

  /** Exactly [length] bytes, or null when the stream ends first. */
  fun readExactly(input: InputStream, length: Int): ByteArray? {
    val bytes = ByteArray(length)
    var offset = 0
    while (offset < length) {
      val read = input.read(bytes, offset, length - offset)
      if (read < 0) {
        return null
      }
      offset += read
    }
    return bytes
  }
}
