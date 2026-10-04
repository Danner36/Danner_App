package expo.modules.dannerlivehls

import android.os.SystemClock
import android.util.Log
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.SynchronousQueue
import java.util.concurrent.ThreadFactory
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Serves an approved page's HLS, DASH, or MP4 stream from a phone origin the Cast receiver can
 * read.
 *
 * The provider answers its playlists only when the request carries the player page as
 * `Referer`, and a Cast receiver sends its own origin instead, so the receiver gets 403 on
 * every playlist. Segments are pre-signed object-store URLs that need no `Referer` but
 * carry no CORS header, which the receiver also requires. This server adds the `Referer`
 * upstream and CORS downstream, and leaves the media untouched.
 *
 * The listener binds the phone's LAN address only. Every route lives under the session token,
 * and every upstream URL it hands out is signed with the session key, so the relay fetches
 * only what this session's playlists and manifests named.
 */
internal class HlsProxyServer private constructor(
  val address: Inet4Address,
  private val listener: ServerSocket,
) {
  val port: Int = listener.localPort
  val origin: String = "http://${address.hostAddress}:$port"

  /** The session the routes answer for. Null answers every route with 404. */
  @Volatile
  var session: RelaySession? = null

  private val running = AtomicBoolean(true)
  private val connections = ConcurrentHashMap.newKeySet<ClientConnection>()
  private val workers = ThreadPoolExecutor(
    0,
    MAX_WORKERS,
    IDLE_THREAD_SECONDS,
    TimeUnit.SECONDS,
    SynchronousQueue<Runnable>(),
    threadFactory("danner-relay-worker"),
  )
  private val prefetcher = ThreadPoolExecutor(
    PREFETCH_THREADS,
    PREFETCH_THREADS,
    IDLE_THREAD_SECONDS,
    TimeUnit.SECONDS,
    LinkedBlockingQueue<Runnable>(PREFETCH_QUEUE),
    threadFactory("danner-relay-prefetch"),
    ThreadPoolExecutor.DiscardPolicy(),
  ).apply { allowCoreThreadTimeOut(true) }
  private val watchdog: ScheduledExecutorService =
    Executors.newSingleThreadScheduledExecutor(threadFactory("danner-relay-watchdog"))
  private val acceptThread = Thread({ acceptLoop() }, "danner-relay-accept").apply { isDaemon = true }

  /** True while the listener is open and its accept loop is alive. */
  val isAccepting: Boolean
    get() = running.get() && !listener.isClosed && acceptThread.isAlive

  private fun launch() {
    acceptThread.start()
    watchdog.scheduleWithFixedDelay(
      { sweepStalledWrites() },
      WATCHDOG_PERIOD_MS,
      WATCHDOG_PERIOD_MS,
      TimeUnit.MILLISECONDS,
    )
  }

  fun stop() {
    if (!running.getAndSet(false)) {
      return
    }
    session = null
    closeQuietly(listener)
    for (connection in connections) {
      closeQuietly(connection.socket)
    }
    workers.shutdownNow()
    prefetcher.shutdownNow()
    watchdog.shutdownNow()
    acceptThread.interrupt()
    Log.i(RELAY_TAG, "relay stopped on $origin")
  }

  private fun acceptLoop() {
    while (running.get()) {
      val client = try {
        listener.accept()
      } catch (_: IOException) {
        if (!running.get() || listener.isClosed || !pauseAfterAcceptFailure()) {
          return
        }
        continue
      }
      val connection = ClientConnection(client)
      connections.add(connection)
      // stop() closes every tracked socket after clearing `running`, so a socket accepted
      // while it runs is closed either there or here.
      if (!running.get()) {
        connections.remove(connection)
        closeQuietly(client)
        return
      }
      try {
        client.tcpNoDelay = true
        client.keepAlive = true
        client.soTimeout = REQUEST_READ_TIMEOUT_MS
        workers.execute { serve(connection) }
      } catch (_: RejectedExecutionException) {
        refuse(connection)
      } catch (_: Exception) {
        connections.remove(connection)
        closeQuietly(client)
      }
    }
  }

  private fun pauseAfterAcceptFailure(): Boolean {
    return try {
      Thread.sleep(50)
      true
    } catch (_: InterruptedException) {
      false
    }
  }

  /** Every worker is busy; the client retries. */
  private fun refuse(connection: ClientConnection) {
    try {
      writeEmpty(connection.socket.getOutputStream(), 503)
    } catch (_: Exception) {
    } finally {
      connections.remove(connection)
      closeQuietly(connection.socket)
    }
  }

  private fun serve(connection: ClientConnection) {
    val socket = connection.socket
    try {
      val request = readRequest(BufferedInputStream(socket.getInputStream())) ?: return
      route(request, WatchedOutputStream(socket.getOutputStream(), connection))
    } catch (_: IOException) {
    } catch (error: Throwable) {
      // A relay request never takes the app down, including an upstream object too large
      // for memory.
      Log.w(RELAY_TAG, "relay request failed: $error")
    } finally {
      connections.remove(connection)
      closeQuietly(socket)
    }
  }

  /**
   * A dead receiver stops reading and would pin its worker in a blocking write until TCP
   * gives up. Closing the socket ends that write.
   */
  private fun sweepStalledWrites() {
    try {
      val now = SystemClock.elapsedRealtime()
      for (connection in connections) {
        val started = connection.writeStartedAt
        if (started != 0L && now - started > WRITE_STALL_MS) {
          Log.w(RELAY_TAG, "closing a client that stopped reading")
          closeQuietly(connection.socket)
        }
      }
    } catch (_: Throwable) {
    }
  }

  private fun route(request: HttpRequest, output: OutputStream) {
    if (request.method == "OPTIONS") {
      writeHead(output, 204, null, null, preflight = true)
      output.flush()
      return
    }
    if (request.method != "GET" && request.method != "HEAD") {
      writeEmpty(output, 405)
      return
    }
    val withBody = request.method == "GET"
    val current = session
    val path = request.path
    val slash = if (path.startsWith("/")) path.indexOf('/', 1) else -1
    if (current == null || slash <= 1 || !current.matchesToken(path.substring(1, slash))) {
      writeEmpty(output, 404)
      return
    }
    val route = path.substring(slash + 1)
    val range = request.headers["range"]
    val hls = current.kind == RelayKind.HLS
    when {
      route == "live.m3u8" && hls ->
        servePlaylist(output, withBody, HLS_PLAYLIST_CONTENT_TYPE) { hlsEntry(current) }
      route == "video.m3u8" && hls ->
        servePlaylist(output, withBody, HLS_PLAYLIST_CONTENT_TYPE) { hlsVideo(current) }
      route == "audio.m3u8" && hls -> {
        val group = queryValue(request.query, "g")?.toIntOrNull()
        if (group == null || group < 0) {
          writeEmpty(output, 404)
        } else {
          servePlaylist(output, withBody, HLS_PLAYLIST_CONTENT_TYPE) { hlsAudio(current, group) }
        }
      }
      route == "s" -> serveSigned(output, withBody, current, request.query, range)
      route == "live.mpd" && current.kind == RelayKind.DASH ->
        servePlaylist(output, withBody, DashManifest.CONTENT_TYPE) { dashManifest(current) }
      route.startsWith("d/") ->
        serveDirectory(output, withBody, current, route.substring(2), request.query, range)
      route == "media.mp4" && current.kind == RelayKind.MP4 ->
        relay(output, withBody, current, current.sourceUrl, range, sniff = false)
      else -> writeEmpty(output, 404)
    }
  }

  /** Builds a playlist or manifest; null answers 404 and a failure answers 502. */
  private fun servePlaylist(
    output: OutputStream,
    withBody: Boolean,
    contentType: String,
    build: () -> String?,
  ) {
    val body = try {
      build()
    } catch (error: Exception) {
      Log.w(RELAY_TAG, "playlist failed: ${error.message}")
      writeEmpty(output, 502)
      return
    } catch (_: OutOfMemoryError) {
      Log.w(RELAY_TAG, "playlist failed: out of memory")
      writeEmpty(output, 502)
      return
    }
    if (body == null) {
      writeEmpty(output, 404)
      return
    }
    val bytes = body.toByteArray(StandardCharsets.UTF_8)
    writeHead(output, 200, contentType, bytes.size.toLong(), noStore = true)
    if (withBody) {
      output.write(bytes)
    }
    output.flush()
  }

  /**
   * The receiver's entry playlist. The source is re-walked on every read: the provider hands
   * out a fresh variant host and time-limited segment URLs each time, so a cached walk goes
   * stale within minutes. A variant with separate audio renditions gets a small master that
   * names those renditions and the variant; any other variant is answered directly.
   */
  private fun hlsEntry(current: RelaySession): String {
    val source = fetchPlaylist(current, current.sourceUrl)
    val master = HlsMaster.parse(source.body, source.finalUrl)
    val variant = master?.selected
    if (master == null || variant == null) {
      return relayMediaPlaylist(current, source)
    }
    val group = master.audioGroup(variant)
    if (group.any { it.uri != null }) {
      return demuxedMasterPlaylist(master, variant, group, current.token)
    }
    return relayMediaPlaylist(current, fetchPlaylist(current, variant.url))
  }

  private fun hlsVideo(current: RelaySession): String {
    val source = fetchPlaylist(current, current.sourceUrl)
    val variant = HlsMaster.parse(source.body, source.finalUrl)?.selected
      ?: return relayMediaPlaylist(current, source)
    return relayMediaPlaylist(current, fetchPlaylist(current, variant.url))
  }

  private fun hlsAudio(current: RelaySession, index: Int): String? {
    val source = fetchPlaylist(current, current.sourceUrl)
    val master = HlsMaster.parse(source.body, source.finalUrl) ?: return null
    val variant = master.selected ?: return null
    val uri = master.audioGroup(variant).getOrNull(index)?.uri ?: return null
    val absolute = resolveUri(master.base, uri) ?: return null
    return relayMediaPlaylist(current, fetchPlaylist(current, absolute))
  }

  private fun fetchPlaylist(current: RelaySession, url: String): FetchedText {
    val fetched = RelayUpstream.fetchText(URL(url), current.referer)
    requirePlaylist(fetched.body)
    return fetched
  }

  private fun relayMediaPlaylist(current: RelaySession, playlist: FetchedText): String {
    val rewrite = rewriteMediaPlaylist(playlist.body, playlist.finalUrl, current, PREFETCH_EDGE)
    // The receiver asks for the live edge next. Fetch those segments now so the
    // TV is not waiting on the provider for every one of them.
    prefetch(current, rewrite.prefetchUrls)
    return rewrite.text
  }

  /** The MPD is fetched fresh on every read, like the HLS walk. */
  private fun dashManifest(current: RelaySession): String {
    val manifest = RelayUpstream.fetchText(URL(current.sourceUrl), current.referer)
    if (!DashManifest.isManifest(manifest.body)) {
      throw UpstreamException("upstream body is not an MPD")
    }
    return DashManifest.rewrite(manifest.body, manifest.finalUrl) { current.relayDirectory(it) }
  }

  private fun serveSigned(
    output: OutputStream,
    withBody: Boolean,
    current: RelaySession,
    query: String?,
    range: String?,
  ) {
    val target = queryValue(query, "u")?.let { decodeBase64Url(it) }
    if (target == null || !current.verify(target, queryValue(query, "k"))) {
      writeEmpty(output, 403)
      return
    }
    if (range == null) {
      val ready = current.cached(target) ?: loadMedia(current, target)
      if (ready != null) {
        writeCached(output, withBody, ready)
        return
      }
    }
    relay(output, withBody, current, target, range, sniff = true)
  }

  /** `d/<base64url directory>/<sig>/<rest>`: the signature covers the directory only. */
  private fun serveDirectory(
    output: OutputStream,
    withBody: Boolean,
    current: RelaySession,
    route: String,
    query: String?,
    range: String?,
  ) {
    val first = route.indexOf('/')
    val second = if (first <= 0) -1 else route.indexOf('/', first + 1)
    if (second < 0) {
      writeEmpty(output, 404)
      return
    }
    val directory = decodeBase64Url(route.substring(0, first))
    val signature = route.substring(first + 1, second)
    val rest = route.substring(second + 1)
    if (directory == null || !current.verify(directory, signature) || leavesDirectory(rest)) {
      writeEmpty(output, 403)
      return
    }
    val target = if (query.isNullOrEmpty()) directory + rest else "$directory$rest?$query"
    relay(output, withBody, current, target, range, sniff = true)
  }

  private fun leavesDirectory(rest: String): Boolean {
    return rest.split('/').any { segment ->
      val decoded = segment.replace("%2e", ".", ignoreCase = true)
      decoded == "." || decoded == ".."
    }
  }

  /**
   * Streams one upstream object through with the client's `Range`. With [sniff], the content
   * type is the upstream's when it names media and otherwise comes from the first bytes: the
   * provider labels segments as text, and the receiver picks its demuxer from this header.
   * Without [sniff] (the MP4 entry), a non-video upstream type becomes `video/mp4`.
   */
  private fun relay(
    output: OutputStream,
    withBody: Boolean,
    current: RelaySession,
    target: String,
    range: String?,
    sniff: Boolean,
  ) {
    val response = try {
      RelayUpstream.open(URL(target), current.referer, range, identity = true)
    } catch (error: Exception) {
      Log.w(RELAY_TAG, "upstream failed: ${error.message}")
      writeEmpty(output, 502)
      return
    }
    response.use { upstream ->
      val status = upstream.status
      if (status == 416) {
        val extra = listOfNotNull(upstream.header("Content-Range")?.let { "Content-Range" to it })
        writeHead(output, 416, null, 0L, extra)
        output.flush()
        return
      }
      if (status != 200 && status != 206) {
        Log.w(RELAY_TAG, "upstream status $status")
        writeEmpty(output, 502)
        return
      }
      val stream = try {
        upstream.connection.inputStream
      } catch (error: IOException) {
        Log.w(RELAY_TAG, "upstream failed: ${error.message}")
        writeEmpty(output, 502)
        return
      }
      stream.use { input ->
        val upstreamType = upstream.header("Content-Type")
        val passed = if (sniff) passthroughType(upstreamType) else null
        val head = ByteArray(SNIFF_BYTES)
        var headLength = 0
        val contentType = when {
          !sniff ->
            if (upstreamType != null && upstreamType.startsWith("video/", ignoreCase = true)) {
              upstreamType
            } else {
              RelayKind.MP4.contentType
            }
          passed != null -> passed
          else -> {
            headLength = try {
              readUpTo(input, head)
            } catch (error: IOException) {
              Log.w(RELAY_TAG, "upstream failed: ${error.message}")
              writeEmpty(output, 502)
              return
            }
            sniffContentType(head, headLength)
          }
        }
        val extra = ArrayList<Pair<String, String>>()
        if (status == 206) {
          upstream.header("Content-Range")?.let { extra.add("Content-Range" to it) }
        }
        upstream.header("Accept-Ranges")?.let { extra.add("Accept-Ranges" to it) }
        val length = upstream.contentLength.takeIf { it >= 0 }
        writeHead(output, status, contentType, length, extra)
        if (withBody) {
          if (headLength > 0) {
            output.write(head, 0, headLength)
          }
          copy(input, output)
        }
        output.flush()
      }
    }
  }

  private fun writeCached(output: OutputStream, withBody: Boolean, media: CachedMedia) {
    val contentType = passthroughType(media.contentType)
      ?: sniffContentType(media.bytes, minOf(media.bytes.size, SNIFF_BYTES))
    val extra = listOfNotNull(media.acceptRanges?.let { "Accept-Ranges" to it })
    writeHead(output, 200, contentType, media.bytes.size.toLong(), extra)
    if (withBody) {
      output.write(media.bytes)
    }
    output.flush()
  }

  private fun prefetch(current: RelaySession, urls: List<String>) {
    for (url in urls) {
      if (current.cached(url) != null || current.isLoading(url)) {
        continue
      }
      prefetcher.execute {
        if (session === current) {
          try {
            loadMedia(current, url)
          } catch (_: Throwable) {
          }
        }
      }
    }
  }

  private fun loadMedia(current: RelaySession, url: String): CachedMedia? {
    return current.load(url, RelayUpstream.READ_TIMEOUT_MS.toLong() + LOAD_WAIT_MARGIN_MS) {
      download(current, url)
    }
  }

  /** The whole object in memory, or null when it is missing or larger than one cache entry. */
  private fun download(current: RelaySession, url: String): CachedMedia? {
    val target = try {
      URL(url)
    } catch (_: Exception) {
      return null
    }
    return RelayUpstream.open(target, current.referer, identity = true).use { upstream ->
      val declared = upstream.contentLength
      if (upstream.status != 200 || declared > RelaySession.MAX_CACHED_OBJECT_BYTES) {
        null
      } else {
        val bytes = upstream.connection.inputStream.use { input ->
          if (declared >= 0) {
            RelayUpstream.readExactly(input, declared.toInt())
          } else {
            RelayUpstream.readCapped(input, RelaySession.MAX_CACHED_OBJECT_BYTES)
          }
        }
        bytes?.let {
          CachedMedia(it, upstream.header("Content-Type"), upstream.header("Accept-Ranges"))
        }
      }
    }
  }

  private fun readRequest(input: InputStream): HttpRequest? {
    val buffer = ByteArrayOutputStream(512)
    var tail = 0
    var complete = false
    while (!complete && buffer.size() < MAX_REQUEST_BYTES) {
      val next = input.read()
      if (next < 0) {
        return null
      }
      buffer.write(next)
      tail = (tail shl 8) or next
      complete = tail == CRLF_CRLF || (tail and 0xffff) == LF_LF
    }
    if (!complete) {
      return null
    }
    val lines = String(buffer.toByteArray(), StandardCharsets.ISO_8859_1).lines()
    val parts = lines.firstOrNull()?.trim()?.split(' ')?.filter { it.isNotEmpty() } ?: return null
    if (parts.size < 2) {
      return null
    }
    val headers = HashMap<String, String>()
    for (line in lines.drop(1)) {
      val colon = line.indexOf(':')
      if (colon > 0) {
        headers[line.substring(0, colon).trim().lowercase()] = line.substring(colon + 1).trim()
      }
    }
    val target = parts[1]
    val question = target.indexOf('?')
    return HttpRequest(
      method = parts[0],
      path = if (question < 0) target else target.substring(0, question),
      query = if (question < 0) null else target.substring(question + 1),
      headers = headers,
    )
  }

  private fun queryValue(query: String?, key: String): String? {
    if (query.isNullOrEmpty()) {
      return null
    }
    for (pair in query.split('&')) {
      val separator = pair.indexOf('=')
      if (separator > 0 && pair.substring(0, separator) == key) {
        return pair.substring(separator + 1)
      }
    }
    return null
  }

  private fun writeEmpty(output: OutputStream, status: Int) {
    writeHead(output, status, "text/plain", 0L, noStore = true)
    output.flush()
  }

  private fun writeHead(
    output: OutputStream,
    status: Int,
    contentType: String?,
    length: Long?,
    extra: List<Pair<String, String>> = emptyList(),
    noStore: Boolean = false,
    preflight: Boolean = false,
  ) {
    val builder = StringBuilder()
    builder.append("HTTP/1.1 ").append(status).append(' ').append(reasonPhrase(status)).append("\r\n")
    builder.append("Access-Control-Allow-Origin: *\r\n")
    builder.append("Access-Control-Allow-Headers: Range, Content-Type\r\n")
    builder.append("Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges\r\n")
    if (preflight) {
      builder.append("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n")
      builder.append("Access-Control-Allow-Private-Network: true\r\n")
    }
    if (noStore) {
      builder.append("Cache-Control: no-store\r\n")
    }
    builder.append("Connection: close\r\n")
    if (contentType != null) {
      builder.append("Content-Type: ").append(contentType).append("\r\n")
    }
    if (length != null) {
      builder.append("Content-Length: ").append(length).append("\r\n")
    }
    for ((name, value) in extra) {
      builder.append(name).append(": ").append(value).append("\r\n")
    }
    builder.append("\r\n")
    output.write(builder.toString().toByteArray(StandardCharsets.ISO_8859_1))
  }

  companion object {
    private const val MAX_WORKERS = 16
    private const val PREFETCH_THREADS = 3
    private const val PREFETCH_QUEUE = 16
    private const val IDLE_THREAD_SECONDS = 30L
    private const val BACKLOG = 32
    private const val REQUEST_READ_TIMEOUT_MS = 10_000
    private const val MAX_REQUEST_BYTES = 8_192
    private const val WATCHDOG_PERIOD_MS = 5_000L
    private const val WRITE_STALL_MS = 60_000L
    private const val LOAD_WAIT_MARGIN_MS = 2_000L
    private const val PREFETCH_EDGE = 4
    private const val SNIFF_BYTES = 8
    private const val CRLF_CRLF = 0x0d0a0d0a
    private const val LF_LF = 0x0a0a
    private const val TS_SYNC_BYTE: Byte = 0x47
    private val MP4_BOXES = setOf("ftyp", "styp", "moof", "sidx", "moov")
    private val PASSTHROUGH_TYPES = listOf(
      "video/",
      "audio/",
      "application/mp4",
      "application/vnd.apple.mpegurl",
      "application/x-mpegurl",
      "application/dash+xml",
    )

    /** Binds [address] on the first free port in [ports] and starts accepting. */
    fun bind(address: Inet4Address, ports: IntRange): HlsProxyServer {
      var lastError: Exception? = null
      for (candidate in ports) {
        var socket: ServerSocket? = null
        try {
          socket = ServerSocket()
          // SO_REUSEADDR only takes effect before bind, so a lingering TIME_WAIT does not
          // push the origin to the next port.
          socket.reuseAddress = true
          socket.bind(InetSocketAddress(address, candidate), BACKLOG)
          val server = HlsProxyServer(address, socket)
          server.launch()
          Log.i(RELAY_TAG, "relay listening on ${server.origin}")
          return server
        } catch (error: Exception) {
          closeQuietly(socket)
          lastError = error
        }
      }
      throw lastError ?: IOException("No free relay port")
    }

    private fun passthroughType(type: String?): String? {
      val trimmed = type?.trim() ?: return null
      val lower = trimmed.lowercase()
      return if (PASSTHROUGH_TYPES.any { lower.startsWith(it) }) trimmed else null
    }

    private fun sniffContentType(bytes: ByteArray, length: Int): String {
      if (length >= 1 && bytes[0] == TS_SYNC_BYTE) {
        return "video/MP2T"
      }
      if (length >= 8 && String(bytes, 4, 4, StandardCharsets.US_ASCII) in MP4_BOXES) {
        return "video/mp4"
      }
      return "application/octet-stream"
    }

    private fun readUpTo(input: InputStream, buffer: ByteArray): Int {
      var filled = 0
      while (filled < buffer.size) {
        val read = input.read(buffer, filled, buffer.size - filled)
        if (read < 0) {
          break
        }
        filled += read
      }
      return filled
    }

    private fun copy(input: InputStream, output: OutputStream) {
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val read = input.read(buffer)
        if (read < 0) {
          return
        }
        output.write(buffer, 0, read)
      }
    }

    private fun reasonPhrase(status: Int): String {
      return when (status) {
        200 -> "OK"
        204 -> "No Content"
        206 -> "Partial Content"
        403 -> "Forbidden"
        404 -> "Not Found"
        405 -> "Method Not Allowed"
        416 -> "Range Not Satisfiable"
        502 -> "Bad Gateway"
        503 -> "Service Unavailable"
        else -> "Status"
      }
    }

    private fun threadFactory(name: String): ThreadFactory {
      val count = AtomicInteger()
      return ThreadFactory { runnable ->
        Thread(runnable, "$name-${count.incrementAndGet()}").apply { isDaemon = true }
      }
    }

    private fun closeQuietly(closeable: Closeable?) {
      try {
        closeable?.close()
      } catch (_: Exception) {
      }
    }
  }
}

private class HttpRequest(
  val method: String,
  val path: String,
  val query: String?,
  val headers: Map<String, String>,
)

/** One accepted client. [writeStartedAt] is nonzero while a write to it is blocked. */
private class ClientConnection(val socket: Socket) {
  @Volatile
  var writeStartedAt: Long = 0L
}

/** Marks each write so the watchdog can close a client that stopped reading. */
private class WatchedOutputStream(
  private val delegate: OutputStream,
  private val connection: ClientConnection,
) : OutputStream() {
  override fun write(b: Int) {
    connection.writeStartedAt = SystemClock.elapsedRealtime()
    try {
      delegate.write(b)
    } finally {
      connection.writeStartedAt = 0L
    }
  }

  override fun write(b: ByteArray, off: Int, len: Int) {
    connection.writeStartedAt = SystemClock.elapsedRealtime()
    try {
      delegate.write(b, off, len)
    } finally {
      connection.writeStartedAt = 0L
    }
  }

  override fun flush() {
    connection.writeStartedAt = SystemClock.elapsedRealtime()
    try {
      delegate.flush()
    } finally {
      connection.writeStartedAt = 0L
    }
  }

  override fun close() {
    delegate.close()
  }
}
