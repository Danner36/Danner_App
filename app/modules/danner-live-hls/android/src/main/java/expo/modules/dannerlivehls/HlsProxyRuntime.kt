package expo.modules.dannerlivehls

import android.content.Context
import android.util.Log
import java.net.Inet4Address
import java.net.URL
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** A started relay session, as `startProxy` resolves it. */
internal class RelayStart(
  private val origin: String,
  private val port: Int,
  private val session: RelaySession,
  private val probe: RelayProbeResult,
) {
  fun toMap(): Map<String, Any> {
    val result = mutableMapOf<String, Any>(
      "origin" to origin,
      "port" to port,
      "token" to session.token,
      "kind" to session.kind.wire,
      "path" to session.mediaPath,
      "contentType" to session.kind.contentType,
      "live" to probe.live,
    )
    probe.segmentFormat?.let { result["segmentFormat"] = it }
    return result
  }
}

/**
 * Holds the single relay listener, its current session, and the foreground service that keeps
 * it reachable while the phone is locked. The server runs in process; the service exists to
 * keep that process out of Doze and hold the locks.
 *
 * Every start and stop bumps [generation]. A start does its network work outside the lock and
 * commits only while its generation is still current, after both the listener and the service
 * are up; otherwise it undoes what it started.
 */
internal object HlsProxyRuntime {
  private const val SERVICE_START_TIMEOUT_MS = 8_000L
  private val lock = Any()
  private var generation = 0L
  private var appContext: Context? = null
  private var server: HlsProxyServer? = null
  private var session: RelaySession? = null

  /** The service instance that reached the foreground for the running relay. */
  private var service: HlsProxyService? = null

  /** A `startForegroundService` call whose service has not reached the foreground yet. */
  private var serviceRequested = false
  private var serviceReady: CountDownLatch? = null

  fun start(context: Context, source: String, referer: String, kindWire: String): RelayStart {
    val kind = RelayKind.fromWire(kindWire)
      ?: throw RelayStartException(ERR_UNSUPPORTED, "Unsupported media kind: $kindWire")
    val sourceUrl = parseSource(source)
      ?: throw RelayStartException(ERR_UNSUPPORTED, "The source is not an http or https URL.")
    val application = context.applicationContext
    val ticket = synchronized(lock) {
      generation += 1
      releaseServiceWaiter()
      // The previous session's routes answer 404 from here on.
      server?.session = null
      session = null
      appContext = application
      generation
    }
    try {
      val address = LanAddresses.select(application)
        ?: throw RelayStartException(ERR_NO_NETWORK, "The phone has no Wi-Fi or Ethernet address.")
      val probe = RelayProbe.probe(sourceUrl, referer, kind)
      val waiter = synchronized(lock) {
        requireCurrent(ticket)
        listenerFor(address)
        if (service != null) {
          null
        } else {
          val ready = CountDownLatch(1)
          serviceReady = ready
          HlsProxyService.start(application)
          serviceRequested = true
          ready
        }
      }
      if (waiter != null && !waiter.await(SERVICE_START_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
        throw RelayStartException(ERR_RELAY, "The relay service did not start.")
      }
      return synchronized(lock) {
        requireCurrent(ticket)
        val listener = server?.takeIf { it.isAccepting }
          ?: throw RelayStartException(ERR_RELAY, "The relay listener stopped.")
        if (service == null) {
          throw RelayStartException(ERR_RELAY, "The relay service did not start.")
        }
        val next = RelaySession(listener.origin, kind, sourceUrl.toString(), referer)
        listener.session = next
        session = next
        RelayStart(listener.origin, listener.port, next, probe)
      }
    } catch (error: Throwable) {
      synchronized(lock) {
        if (generation == ticket) {
          stopLocked()
        }
      }
      if (error is RelayStartException) {
        throw error
      }
      throw RelayStartException(ERR_RELAY, error.message ?: "The relay did not start.", error)
    }
  }

  fun stop() {
    synchronized(lock) {
      stopLocked()
    }
  }

  fun status(): Map<String, Any> {
    synchronized(lock) {
      val listener = server
      val current = session
      val running = listener != null && listener.isAccepting && current != null && service != null
      val result = mutableMapOf<String, Any>("running" to running)
      if (listener != null && current != null) {
        result["origin"] = listener.origin
        result["port"] = listener.port
        result["token"] = current.token
        result["kind"] = current.kind.wire
      }
      return result
    }
  }

  /**
   * Called by the service after `startForeground`. Returns false when no listener is running,
   * and the service then stops itself, so a stale start or a stop request never leaves a
   * foreground service holding locks.
   */
  fun onServiceForeground(instance: HlsProxyService): Boolean {
    synchronized(lock) {
      if (server?.isAccepting != true) {
        return false
      }
      service = instance
      releaseServiceWaiter()
      return true
    }
  }

  /**
   * The service could not enter the foreground. A waiting start fails now instead of timing
   * out; a running relay stops, since it no longer has its service.
   */
  fun onServiceFailed(instance: HlsProxyService) {
    synchronized(lock) {
      if (service === instance) {
        service = null
        serviceRequested = false
        stopLocked()
      } else {
        releaseServiceWaiter()
      }
    }
  }

  /** The service went away (task removed, timeout, or system stop); the relay goes with it. */
  fun onServiceDestroyed(instance: HlsProxyService) {
    synchronized(lock) {
      if (service !== instance) {
        return
      }
      service = null
      serviceRequested = false
      stopLocked()
    }
  }

  private fun stopLocked() {
    generation += 1
    releaseServiceWaiter()
    val listener = server
    server = null
    session = null
    try {
      listener?.stop()
    } catch (error: Exception) {
      Log.w(RELAY_TAG, "relay stop failed: ${error.message}")
    }
    val context = appContext
    val foreground = service
    service = null
    if (context != null && (foreground != null || serviceRequested)) {
      HlsProxyService.stop(context, foreground != null)
    }
    serviceRequested = false
  }

  /** Reuses the listener when it is still accepting on [address]; otherwise binds a new one. */
  private fun listenerFor(address: Inet4Address): HlsProxyServer {
    val current = server
    if (current != null && current.isAccepting && current.address == address) {
      return current
    }
    server = null
    current?.stop()
    val next = try {
      HlsProxyServer.bind(address, LanAddresses.FIRST_PORT..LanAddresses.LAST_PORT)
    } catch (error: Exception) {
      throw RelayStartException(ERR_RELAY, "No relay port is free.", error)
    }
    server = next
    return next
  }

  private fun requireCurrent(ticket: Long) {
    if (generation != ticket) {
      throw RelayStartException(ERR_RELAY, "A newer relay start or a stop replaced this one.")
    }
  }

  private fun releaseServiceWaiter() {
    serviceReady?.countDown()
    serviceReady = null
  }

  private fun parseSource(source: String): URL? {
    return try {
      val url = URL(source.trim())
      if ((url.protocol == "http" || url.protocol == "https") && !url.host.isNullOrEmpty()) url else null
    } catch (_: Exception) {
      null
    }
  }
}
