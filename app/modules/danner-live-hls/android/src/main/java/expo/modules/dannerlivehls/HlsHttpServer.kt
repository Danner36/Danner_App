package expo.modules.dannerlivehls

import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

internal class HlsHttpServer(
  private val window: HlsWindow,
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
        val socket = ServerSocket(candidate)
        socket.reuseAddress = true
        serverSocket = socket
        port = socket.localPort
        running.set(true)
        acceptExecutor = Executors.newSingleThreadExecutor()
        requestExecutor = Executors.newFixedThreadPool(4)
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
      }
    }
  }

  private fun handle(client: Socket) {
    client.soTimeout = 8_000
    try {
      val input = BufferedInputStream(client.getInputStream())
      val request = readRequest(input) ?: return
      val firstLine = request.substringBefore("\r\n")
      val parts = firstLine.split(' ')
      val method = parts.firstOrNull().orEmpty()
      val path = if (parts.size >= 2) parts[1].substringBefore('?') else "/"
      val output = client.getOutputStream()
      if (method == "OPTIONS") {
        writeHeaders(output, 204, "No Content", null, 0)
        return
      }
      when {
        path == "/live.m3u8" -> {
          val body = window.playlist().toByteArray(StandardCharsets.UTF_8)
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
            output.write(body)
          }
        }
        path.startsWith("/seg-") && path.endsWith(".ts") -> {
          val index = path.removePrefix("/seg-").removeSuffix(".ts").toLongOrNull()
          val payload = index?.let { window.segment(it) }
          if (payload == null) {
            writeHeaders(output, 404, "Not Found", "text/plain", 0)
          } else {
            writeHeaders(output, 200, "OK", "video/MP2T", payload.size)
            output.write(payload)
          }
        }
        else -> writeHeaders(output, 404, "Not Found", "text/plain", 0)
      }
      output.flush()
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
    length: Int,
  ) {
    val builder = StringBuilder()
    builder.append("HTTP/1.1 $status $reason\r\n")
    builder.append("Access-Control-Allow-Origin: *\r\n")
    builder.append("Access-Control-Allow-Methods: GET, OPTIONS\r\n")
    builder.append("Access-Control-Allow-Headers: *\r\n")
    builder.append("Cache-Control: no-store\r\n")
    builder.append("Connection: close\r\n")
    if (contentType != null) {
      builder.append("Content-Type: $contentType\r\n")
    }
    builder.append("Content-Length: $length\r\n\r\n")
    output.write(builder.toString().toByteArray(StandardCharsets.US_ASCII))
  }
}
