package expo.modules.dannerlivehls

import android.util.Base64
import android.util.Log
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Serves an approved page's HLS stream from a phone origin the Cast receiver can read.
 *
 * The provider answers its playlists only when the request carries the player page as
 * `Referer`, and a Cast receiver sends its own origin instead, so the receiver gets 403 on
 * every playlist. Segments are pre-signed object-store URLs that need no `Referer` but
 * carry no CORS header, which the receiver also requires. This server adds the `Referer`
 * upstream and CORS downstream, and leaves the media untouched.
 */
internal class HlsProxyServer(
  private val sourceUrl: String,
  private val referer: String,
) {
  private val running = AtomicBoolean(false)
  private var serverSocket: ServerSocket? = null
  private var acceptExecutor: ExecutorService? = null
  private var requestExecutor: ExecutorService? = null

  @Volatile
  var port: Int = 0
    private set

  fun start(preferredRange: IntRange): Int {
    stop()
    var lastError: Exception? = null
    for (candidate in preferredRange) {
      try {
        // SO_REUSEADDR only takes effect before bind, so the socket is created unbound and a
        // lingering TIME_WAIT does not push the origin to the next port.
        val socket = ServerSocket()
        socket.reuseAddress = true
        socket.bind(InetSocketAddress(candidate))
        serverSocket = socket
        port = socket.localPort
        running.set(true)
        acceptExecutor = Executors.newSingleThreadExecutor()
        requestExecutor = Executors.newCachedThreadPool()
        acceptExecutor?.execute { acceptLoop() }
        Log.i(TAG, "proxy listening on $port for $sourceUrl")
        return port
      } catch (error: Exception) {
        lastError = error
      }
    }
    throw lastError ?: IllegalStateException("No free port")
  }

  fun stop() {
    running.set(false)
    try {
      serverSocket?.close()
    } catch (_: Exception) {
    }
    serverSocket = null
    acceptExecutor?.shutdownNow()
    requestExecutor?.shutdownNow()
    acceptExecutor = null
    requestExecutor = null
    port = 0
  }

  private fun acceptLoop() {
    val socket = serverSocket ?: return
    while (running.get()) {
      try {
        val client = socket.accept()
        requestExecutor?.execute { handle(client) }
      } catch (_: Exception) {
        if (!running.get()) {
          return
        }
        try {
          Thread.sleep(50)
        } catch (_: InterruptedException) {
          return
        }
      }
    }
  }

  private fun handle(client: Socket) {
    client.soTimeout = 5_000
    try {
      val input = BufferedInputStream(client.getInputStream())
      val request = readRequest(input) ?: return
      val firstLine = request.substringBefore("\r\n")
      val parts = firstLine.split(' ')
      val method = parts.firstOrNull().orEmpty()
      val target = if (parts.size >= 2) parts[1] else "/"
      val path = target.substringBefore('?')
      val query = target.substringAfter('?', "")
      val output = client.getOutputStream()

      if (method == "OPTIONS") {
        writeHeaders(output, 204, "No Content", null, null)
        output.flush()
        return
      }
      if (method != "GET" && method != "HEAD") {
        writeHeaders(output, 405, "Method Not Allowed", "text/plain", 0)
        output.flush()
        return
      }
      val withBody = method == "GET"

      when {
        path == PLAYLIST_PATH -> servePlaylist(output, withBody)
        path == SEGMENT_PATH -> serveSegment(output, withBody, queryValue(query, "u"))
        else -> {
          writeHeaders(output, 404, "Not Found", "text/plain", 0)
          output.flush()
        }
      }
    } catch (_: Exception) {
    } finally {
      try {
        client.close()
      } catch (_: Exception) {
      }
    }
  }

  private fun servePlaylist(output: OutputStream, withBody: Boolean) {
    val playlist = try {
      buildPlaylist()
    } catch (error: Exception) {
      Log.w(TAG, "playlist failed: ${error.message}")
      null
    }
    if (playlist == null) {
      writeHeaders(output, 502, "Bad Gateway", "text/plain", 0)
      output.flush()
      return
    }
    val body = playlist.toByteArray(StandardCharsets.UTF_8)
    writeHeaders(output, 200, "OK", "application/vnd.apple.mpegurl", body.size)
    if (withBody) {
      output.write(body)
    }
    output.flush()
  }

  /**
   * Resolves the source down to a media playlist and rewrites every media reference back
   * through this server. The provider hands out a fresh variant host and time-limited
   * segment URLs on each read, so this repeats the walk for every receiver poll.
   */
  private fun buildPlaylist(): String {
    val masterUrl = URL(sourceUrl)
    val master = requirePlaylist(fetchText(masterUrl))
    val mediaUrl = variantUrl(masterUrl, master) ?: masterUrl
    val media = if (mediaUrl == masterUrl) master else requirePlaylist(fetchText(mediaUrl))

    val builder = StringBuilder()
    for (rawLine in media.lines()) {
      val line = rawLine.trimEnd('\r')
      when {
        line.isEmpty() -> builder.append('\n')
        line.startsWith("#") -> {
          builder.append(rewriteAttributeUri(line, mediaUrl)).append('\n')
        }
        else -> {
          val absolute = URL(mediaUrl, line).toString()
          builder.append(proxyPath(absolute)).append('\n')
        }
      }
    }
    return builder.toString()
  }

  /**
   * The provider answers a dropped stream with a 200 error page, so a body that is not a
   * playlist has to fail here rather than reach the receiver as rewritten segment lines.
   */
  private fun requirePlaylist(body: String): String {
    if (!body.trimStart().startsWith("#EXTM3U")) {
      throw IllegalStateException("upstream body is not a playlist")
    }
    return body
  }

  /** Picks the first variant of a master playlist, or null when this is already media. */
  private fun variantUrl(base: URL, playlist: String): URL? {
    val lines = playlist.lines()
    for (index in lines.indices) {
      if (!lines[index].startsWith("#EXT-X-STREAM-INF")) {
        continue
      }
      for (next in index + 1 until lines.size) {
        val candidate = lines[next].trim()
        if (candidate.isEmpty() || candidate.startsWith("#")) {
          continue
        }
        return URL(base, candidate)
      }
    }
    return null
  }

  /** Sends `#EXT-X-KEY` and `#EXT-X-MAP` payloads through this server as well. */
  private fun rewriteAttributeUri(line: String, base: URL): String {
    if (!line.startsWith("#EXT-X-KEY") && !line.startsWith("#EXT-X-MAP")) {
      return line
    }
    val marker = "URI=\""
    val start = line.indexOf(marker)
    if (start < 0) {
      return line
    }
    val valueStart = start + marker.length
    val end = line.indexOf('"', valueStart)
    if (end < 0) {
      return line
    }
    val absolute = try {
      URL(base, line.substring(valueStart, end)).toString()
    } catch (_: Exception) {
      return line
    }
    return line.substring(0, valueStart) + proxyPath(absolute) + line.substring(end)
  }

  private fun serveSegment(output: OutputStream, withBody: Boolean, encoded: String?) {
    val target = decodeUrl(encoded)
    if (target == null) {
      writeHeaders(output, 400, "Bad Request", "text/plain", 0)
      output.flush()
      return
    }
    var connection: HttpURLConnection? = null
    try {
      connection = openConnection(URL(target))
      val status = connection.responseCode
      if (status !in 200..299) {
        writeHeaders(output, 502, "Bad Gateway", "text/plain", 0)
        output.flush()
        return
      }
      val length = connection.contentLengthLong
      // The provider labels segments as text. The receiver decides its demuxer from this
      // header, so it has to name the real transport-stream payload.
      writeHeaders(
        output,
        200,
        "OK",
        SEGMENT_CONTENT_TYPE,
        if (length in 1..Int.MAX_VALUE.toLong()) length.toInt() else null,
      )
      if (!withBody) {
        output.flush()
        return
      }
      connection.inputStream.use { stream ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val read = stream.read(buffer)
          if (read < 0) {
            break
          }
          output.write(buffer, 0, read)
        }
      }
      output.flush()
    } catch (error: Exception) {
      Log.w(TAG, "segment failed: ${error.message}")
    } finally {
      connection?.disconnect()
    }
  }

  private fun fetchText(url: URL): String {
    val connection = openConnection(url)
    try {
      val status = connection.responseCode
      if (status !in 200..299) {
        throw IllegalStateException("upstream $status for $url")
      }
      return connection.inputStream.use { stream ->
        stream.readBytes().toString(StandardCharsets.UTF_8)
      }
    } finally {
      connection.disconnect()
    }
  }

  private fun openConnection(url: URL): HttpURLConnection {
    val connection = url.openConnection() as HttpURLConnection
    connection.instanceFollowRedirects = true
    connection.connectTimeout = CONNECT_TIMEOUT_MS
    connection.readTimeout = READ_TIMEOUT_MS
    connection.setRequestProperty("Referer", referer)
    connection.setRequestProperty("User-Agent", UPSTREAM_USER_AGENT)
    connection.setRequestProperty("Accept", "*/*")
    return connection
  }

  private fun proxyPath(absolute: String): String {
    val encoded = Base64.encodeToString(
      absolute.toByteArray(StandardCharsets.UTF_8),
      Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
    )
    return "$SEGMENT_PATH?u=$encoded"
  }

  private fun decodeUrl(encoded: String?): String? {
    if (encoded.isNullOrEmpty()) {
      return null
    }
    return try {
      val decoded = String(
        Base64.decode(encoded, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING),
        StandardCharsets.UTF_8,
      )
      val parsed = URL(decoded)
      if (parsed.protocol != "http" && parsed.protocol != "https") {
        null
      } else {
        decoded
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun queryValue(query: String, key: String): String? {
    for (pair in query.split('&')) {
      val separator = pair.indexOf('=')
      if (separator > 0 && pair.substring(0, separator) == key) {
        return pair.substring(separator + 1)
      }
    }
    return null
  }

  private fun readRequest(input: BufferedInputStream): String? {
    val buffer = ByteArrayOutputStream()
    while (buffer.size() < 8_192) {
      val next = input.read()
      if (next < 0) {
        break
      }
      buffer.write(next)
      val bytes = buffer.toByteArray()
      if (bytes.size >= 4 &&
        bytes[bytes.size - 4] == '\r'.code.toByte() &&
        bytes[bytes.size - 3] == '\n'.code.toByte() &&
        bytes[bytes.size - 2] == '\r'.code.toByte() &&
        bytes[bytes.size - 1] == '\n'.code.toByte()
      ) {
        return String(bytes, StandardCharsets.US_ASCII)
      }
    }
    return null
  }

  private fun writeHeaders(
    output: OutputStream,
    status: Int,
    reason: String,
    contentType: String?,
    length: Int?,
  ) {
    val builder = StringBuilder()
    builder.append("HTTP/1.1 $status $reason\r\n")
    builder.append("Access-Control-Allow-Origin: *\r\n")
    builder.append("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n")
    builder.append("Access-Control-Allow-Headers: *\r\n")
    builder.append("Access-Control-Expose-Headers: Content-Length, Content-Type\r\n")
    builder.append("Cache-Control: no-store\r\n")
    builder.append("Connection: close\r\n")
    if (contentType != null) {
      builder.append("Content-Type: $contentType\r\n")
    }
    if (length != null) {
      builder.append("Content-Length: $length\r\n")
    }
    builder.append("\r\n")
    output.write(builder.toString().toByteArray(StandardCharsets.US_ASCII))
  }

  companion object {
    const val PLAYLIST_PATH = "/live.m3u8"
    const val SEGMENT_PATH = "/s"
    private const val SEGMENT_CONTENT_TYPE = "video/MP2T"
    private const val CONNECT_TIMEOUT_MS = 8_000
    private const val READ_TIMEOUT_MS = 20_000
    private const val UPSTREAM_USER_AGENT =
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/140.0.0.0 Mobile Safari/537.36"

    /** Shared with the capture server so one logcat filter covers the whole session. */
    private const val TAG = "DannerLiveHls"
  }
}
