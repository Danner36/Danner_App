package expo.modules.dannerlivehls

import android.content.Context

/**
 * Holds the single page-stream relay and the foreground service that keeps it reachable
 * while the phone is locked. The server runs in process; the service exists to keep that
 * process out of Doze and hold the Wi-Fi radio awake.
 */
internal object HlsProxyRuntime {
  private var server: HlsProxyServer? = null
  private var appContext: Context? = null

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
  fun start(context: Context, source: String, referer: String): Pair<String, Int> {
    val current = server
    if (current != null && sourceUrl == source) {
      val existingOrigin = origin
      if (existingOrigin != null && port != 0) {
        return Pair(existingOrigin, port)
      }
    }
    stop()
    val application = context.applicationContext
    val next = HlsProxyServer(source, referer)
    val bound = next.start(LanAddresses.FIRST_PORT..LanAddresses.LAST_PORT)
    val nextOrigin = LanAddresses.originForPort(bound)
    server = next
    appContext = application
    port = bound
    origin = nextOrigin
    sourceUrl = source
    HlsProxyService.start(application)
    return Pair(nextOrigin, bound)
  }

  @Synchronized
  fun stop() {
    appContext?.let { HlsProxyService.stop(it) }
    appContext = null
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
