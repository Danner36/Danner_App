package expo.modules.dannerlivehls

import android.util.Log
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

internal class HlsHttpServer(
  private val window: HlsWindow,
) {
  private val running = AtomicBoolean(false)
  private var serverSocket: ServerSocket? = null
  private var acceptExecutor: ExecutorService? = null
  private var requestExecutor: ExecutorService? = null
  private val clients = ConcurrentHashMap<String, ClientStats>()

  @Volatile
  var port: Int = 0
    private set

  fun start(preferredRange: IntRange): Int {
    stop()
    var lastError: Exception? = null
    for (candidate in preferredRange) {
      try {
        // SO_REUSEADDR only takes effect before bind, so the socket is created unbound.
        // Otherwise a lingering TIME_WAIT from the previous session pushes us to the next
        // port and silently changes the origin the phone already handed to the receiver.
        val socket = ServerSocket()
        socket.reuseAddress = true
        socket.bind(InetSocketAddress(candidate))
        serverSocket = socket
        port = socket.localPort
        running.set(true)
        acceptExecutor = Executors.newSingleThreadExecutor()
        // The Cast receiver is Chrome-based and opens speculative connections that may sit
        // idle. A small fixed pool lets those starve the real playlist and segment requests.
        requestExecutor = Executors.newCachedThreadPool()
        acceptExecutor?.execute { acceptLoop() }
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
    clients.clear()
    port = 0
  }

  private class ClientStats {
    val requests = AtomicLong(0)
    val bytes = AtomicLong(0)
    val misses = AtomicLong(0)
  }

  /**
   * Leaves a usable trail under the shared [TAG] without a line per segment: the first
   * request from each client, every miss up to a cap, and a rolling summary after that.
   *
   * The question this answers is whether the TV is reaching the phone at all. A Chromecast
   * IP appearing here means the receiver is fetching the playlist and segments, which rules
   * out every transport-level cause and points at the segment contents instead.
   */
  private fun logRequest(remote: String, path: String, status: Int, byteCount: Int) {
    val stats = clients.computeIfAbsent(remote) {
      Log.i(TAG, "client $remote connected, first request $path")
      ClientStats()
    }
    val served = stats.requests.incrementAndGet()
    stats.bytes.addAndGet(byteCount.toLong())
    if (status != 200 && status != 206) {
      val misses = stats.misses.incrementAndGet()
      if (misses <= MAX_MISS_LOGS) {
        Log.w(TAG, "client $remote got $status for $path")
      }
      return
    }
    if (served <= FIRST_PATH_LOGS) {
      Log.i(TAG, "client $remote $path $byteCount")
    }
    if (served % SUMMARY_EVERY == 0L) {
      Log.i(
        TAG,
        "client $remote served $served requests, ${stats.bytes.get()} bytes, " +
          "${stats.misses.get()} misses",
      )
    }
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
        // Back off so a persistent accept() failure cannot spin this thread.
        try {
          Thread.sleep(50)
        } catch (_: InterruptedException) {
          return
        }
      }
    }
  }

  private fun handle(client: Socket) {
    // Bounds the header read only. The Cast receiver preconnects sockets it may never send a
    // request on, and a long timeout keeps each of those holding a pool thread.
    client.soTimeout = 2_000
    try {
      val input = BufferedInputStream(client.getInputStream())
      val request = readRequest(input) ?: return
      val firstLine = request.substringBefore("\r\n")
      val parts = firstLine.split(' ')
      val method = parts.firstOrNull().orEmpty()
      val path = if (parts.size >= 2) parts[1].substringBefore('?') else "/"
      val output = client.getOutputStream()
      val remote = client.inetAddress?.hostAddress ?: "unknown"
      if (method == "OPTIONS") {
        writeHeaders(output, 204, "No Content", null, null)
        output.flush()
        logRequest(remote, path, 204, 0)
        return
      }
      if (method != "GET" && method != "HEAD") {
        writeHeaders(output, 405, "Method Not Allowed", "text/plain", 0)
        output.flush()
        logRequest(remote, path, 405, 0)
        return
      }
      val withBody = method == "GET"
      var status = 404
      var served = 0
      when {
        path == "/live.m3u8" -> {
          val body = window.masterPlaylist().toByteArray(StandardCharsets.UTF_8)
          if (body.isEmpty()) {
            writeHeaders(output, 404, "Not Found", "text/plain", 0)
          } else {
            writeHeaders(
              output,
              200,
              "OK",
              "application/vnd.apple.mpegurl",
              body.size,
            )
            if (withBody) {
              output.write(body)
            }
            status = 200
            served = body.size
          }
        }
        path == "/index.m3u8" -> {
          val body = window.mediaPlaylist().toByteArray(StandardCharsets.UTF_8)
          if (body.isEmpty()) {
            writeHeaders(output, 404, "Not Found", "text/plain", 0)
          } else {
            writeHeaders(
              output,
              200,
              "OK",
              "application/vnd.apple.mpegurl",
              body.size,
            )
            if (withBody) {
              output.write(body)
            }
            status = 200
            served = body.size
          }
        }
        path.startsWith("/seg-") && path.endsWith(".ts") -> {
          val index = path.removePrefix("/seg-").removeSuffix(".ts").toLongOrNull()
          val payload = index?.let { window.segment(it) }
          if (payload == null) {
            writeHeaders(output, 404, "Not Found", "text/plain", 0)
          } else {
            writeHeaders(output, 200, "OK", "video/mp2t", payload.size)
            if (withBody) {
              output.write(payload)
            }
            status = 200
            served = payload.size
          }
        }
        else -> writeHeaders(output, 404, "Not Found", "text/plain", 0)
      }
      output.flush()
      logRequest(remote, path, status, served)
    } catch (_: Exception) {
    } finally {
      try {
        client.close()
      } catch (_: Exception) {
      }
    }
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
    builder.append("Access-Control-Expose-Headers: Content-Length, Content-Type, Accept-Ranges\r\n")
    builder.append("Accept-Ranges: none\r\n")
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

  private companion object {
    /** Shared with LiveHlsService so one logcat filter covers the whole session. */
    const val TAG = "DannerLiveHls"

    /** First successful fetches from a client, including init and the opening segments. */
    const val FIRST_PATH_LOGS = 12L

    /** At roughly one request per second, a summary line every ~50 seconds. */
    const val SUMMARY_EVERY = 50L

    /** Misses past this are counted silently and reported in the summary. */
    const val MAX_MISS_LOGS = 5L
  }
}
