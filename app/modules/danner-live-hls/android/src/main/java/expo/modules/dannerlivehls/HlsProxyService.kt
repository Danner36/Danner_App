package expo.modules.dannerlivehls

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.net.wifi.WifiManager
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.ServiceCompat

/**
 * Keeps the relay reachable while the phone is locked.
 *
 * The receiver fetches every playlist and segment from this phone, so the process has to stay
 * running for the length of a game. The socket server itself stays in [HlsProxyRuntime]; this
 * `connectedDevice` foreground service holds that process, a partial wake lock, and a Wi-Fi
 * lock, and posts a notification with a Stop action.
 *
 * Each start calls `startForeground` first, then stays only while the runtime has a listener.
 * It is not sticky: after process death there is no listener to serve, so it does not return.
 */
internal class HlsProxyService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // A startForegroundService call has to be answered with startForeground even when the
    // intent only asks this service to stop.
    val foreground = enterForeground()
    if (intent?.action == ACTION_STOP_RELAY) {
      HlsProxyRuntime.stop()
    } else if (!foreground) {
      HlsProxyRuntime.onServiceFailed(this)
    } else if (HlsProxyRuntime.onServiceForeground(this)) {
      acquireLocks()
      return START_NOT_STICKY
    }
    releaseLocks()
    // Only the newest start ends the service, so a stop that raced a newer start is ignored.
    stopSelfResult(startId)
    return START_NOT_STICKY
  }

  override fun onTimeout(startId: Int, fgsType: Int) {
    HlsProxyRuntime.stop()
    releaseLocks()
    stopSelf()
  }

  override fun onDestroy() {
    releaseLocks()
    HlsProxyRuntime.onServiceDestroyed(this)
    super.onDestroy()
  }

  private fun enterForeground(): Boolean {
    return try {
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        buildNotification(),
        ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
      )
      true
    } catch (error: Exception) {
      Log.w(RELAY_TAG, "relay service could not enter the foreground: ${error.message}")
      false
    }
  }

  private fun buildNotification(): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
      CHANNEL_ID,
      "TV send",
      NotificationManager.IMPORTANCE_LOW,
    )
    channel.setShowBadge(false)
    manager?.createNotificationChannel(channel)
    val stopIntent = PendingIntent.getService(
      this,
      STOP_REQUEST_CODE,
      Intent(this, HlsProxyService::class.java).setAction(ACTION_STOP_RELAY),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val stopAction = Notification.Action.Builder(
      Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
      "Stop",
      stopIntent,
    ).build()
    return Notification.Builder(this, CHANNEL_ID)
      .setContentTitle("Sending to TV")
      .setContentText("Keep this phone on Wi-Fi. The screen can be off.")
      .setSmallIcon(android.R.drawable.stat_sys_upload)
      .setOngoing(true)
      .addAction(stopAction)
      .build()
  }

  private fun acquireLocks() {
    if (wakeLock == null) {
      val power = getSystemService(POWER_SERVICE) as PowerManager
      wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "danner:hlsproxy").apply {
        setReferenceCounted(false)
        acquire(WAKE_LOCK_TIMEOUT_MS)
      }
    }
    if (wifiLock == null) {
      val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      // Below Android 14 this keeps the radio out of power save between the receiver's
      // reads. From Android 14 the platform treats it as a low-latency lock, which applies
      // only while the app is in front with the screen on; with the screen off the send
      // relies on the wake lock and this foreground service.
      @Suppress("DEPRECATION")
      val mode = WifiManager.WIFI_MODE_FULL_HIGH_PERF
      wifiLock = wifi.createWifiLock(mode, "danner:hlsproxy").apply {
        setReferenceCounted(false)
        acquire()
      }
    }
  }

  private fun releaseLocks() {
    try {
      wakeLock?.takeIf { it.isHeld }?.release()
    } catch (_: Exception) {
    }
    wakeLock = null
    try {
      wifiLock?.takeIf { it.isHeld }?.release()
    } catch (_: Exception) {
    }
    wifiLock = null
  }

  companion object {
    /** Sent by [HlsProxyRuntime.stop]: stop unless a newer start has a listener running. */
    const val ACTION_STOP = "expo.modules.dannerlivehls.STOP_PROXY"

    /** Sent by the notification's Stop action: stop the relay and the service. */
    const val ACTION_STOP_RELAY = "expo.modules.dannerlivehls.STOP_RELAY"
    private const val CHANNEL_ID = "danner-tv-send"
    private const val NOTIFICATION_ID = 7109
    private const val STOP_REQUEST_CODE = 7110

    /** Longer than a game, and released with the service either way. */
    private const val WAKE_LOCK_TIMEOUT_MS = 6L * 60L * 60L * 1000L

    fun start(context: Context) {
      context.startForegroundService(Intent(context, HlsProxyService::class.java))
    }

    /**
     * [foreground] is true once the service has called `startForeground`. Before that,
     * `stopService` would crash the app ("did not then call startForeground"), so the stop is
     * delivered as an intent the service handles after `startForeground`.
     */
    fun stop(context: Context, foreground: Boolean) {
      val intent = Intent(context, HlsProxyService::class.java)
      if (!foreground) {
        try {
          context.startService(Intent(intent).setAction(ACTION_STOP))
          return
        } catch (error: Exception) {
          Log.w(RELAY_TAG, "relay stop intent was not delivered: ${error.message}")
        }
      }
      try {
        context.stopService(intent)
      } catch (_: Exception) {
      }
    }
  }
}
