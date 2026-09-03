package expo.modules.dannerlivehls

/**
 * Holds the single page-stream proxy. Screen capture keeps its own service and port; this
 * runs in process because it only relays HTTP and needs no projection or notification.
 */
internal object HlsProxyRuntime {
  private var server: HlsProxyServer? = null

  @Volatile
  var origin: String? = null
    private set

  @Volatile
  var port: Int = 0
    private set

  @Volatile
  var sourceUrl: String? = null
    private set

  val running: Boolean
    get() = server != null

  @Synchronized
  fun start(source: String, referer: String): Pair<String, Int> {
    val current = server
    if (current != null && sourceUrl == source) {
      val existingOrigin = origin
      if (existingOrigin != null && port != 0) {
        return Pair(existingOrigin, port)
      }
    }
    stop()
    val next = HlsProxyServer(source, referer)
    val bound = next.start(LanAddresses.FIRST_PORT..LanAddresses.LAST_PORT)
    val nextOrigin = LanAddresses.originForPort(bound)
    server = next
    port = bound
    origin = nextOrigin
    sourceUrl = source
    return Pair(nextOrigin, bound)
  }

  @Synchronized
  fun stop() {
    try {
      server?.stop()
    } catch (_: Exception) {
    }
    server = null
    origin = null
    port = 0
    sourceUrl = null
  }
}
