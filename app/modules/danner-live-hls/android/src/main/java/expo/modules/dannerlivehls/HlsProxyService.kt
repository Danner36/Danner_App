package expo.modules.dannerlivehls

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/**
 * Keeps the relay reachable while the phone is locked.
 *
 * The receiver fetches every playlist and segment from this phone, so the process has to
 * stay outside Doze and the Wi-Fi radio out of power save for the length of a game. The
 * socket server itself stays in [HlsProxyRuntime]; this service exists to hold that process
 * alive, hold the locks, and give the send a notification the phone owner can stop.
 */
internal class HlsProxyService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      HlsProxyRuntime.stop()
      return START_NOT_STICKY
    }
    startForegroundNotification()
    acquireLocks()
    return START_STICKY
  }

  override fun onDestroy() {
    releaseLocks()
    super.onDestroy()
  }

  private fun startForegroundNotification() {
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "TV send",
        NotificationManager.IMPORTANCE_LOW,
      )
      channel.setShowBadge(false)
      manager.createNotificationChannel(channel)
    }
    val notification = Notification.Builder(this, CHANNEL_ID)
      .setContentTitle("Sending to TV")
      .setContentText("Keep this phone on Wi-Fi. The screen can be off.")
      .setSmallIcon(android.R.drawable.stat_sys_upload)
      .setOngoing(true)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
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
      // Power save parks the radio between the receiver's polls, which stalls segment reads.
      wifiLock = wifi.createWifiLock(
        WifiManager.WIFI_MODE_FULL_HIGH_PERF,
        "danner:hlsproxy",
      ).apply {
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
    const val ACTION_STOP = "expo.modules.dannerlivehls.STOP_PROXY"
    private const val CHANNEL_ID = "danner-tv-send"
    private const val NOTIFICATION_ID = 7109

    /** Longer than a game, and released with the service either way. */
    private const val WAKE_LOCK_TIMEOUT_MS = 6L * 60L * 60L * 1000L

    fun start(context: Context) {
      val intent = Intent(context, HlsProxyService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      try {
        context.stopService(Intent(context, HlsProxyService::class.java))
      } catch (_: Exception) {
      }
    }
  }
}
