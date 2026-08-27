package expo.modules.dannerlivehls

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.view.WindowManager

internal class LiveHlsService : Service() {
  private val window = HlsWindow()
  private val httpServer = HlsHttpServer(window)
  private var pipeline: ScreenHlsPipeline? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var mediaProjection: MediaProjection? = null
  private val projectionCallback = object : MediaProjection.Callback() {
    override fun onStop() {
      stopSelf()
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == LiveHlsRuntime.ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }
    val resultCode = intent?.getIntExtra(LiveHlsRuntime.EXTRA_RESULT_CODE, 0) ?: 0
    val data = projectionData(intent)
    if (resultCode == 0 || data == null) {
      LiveHlsRuntime.markFailed()
      stopSelf()
      return START_NOT_STICKY
    }
    startForegroundNotification()
    acquireWakeLock()
    try {
      val port = httpServer.start(LanAddresses.FIRST_PORT..LanAddresses.LAST_PORT)
      val origin = LanAddresses.originForPort(port)
      val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      val projection = manager.getMediaProjection(resultCode, data)
        ?: throw IllegalStateException("missing projection")
      mediaProjection = projection
      projection.registerCallback(projectionCallback, null)
      val size = captureSize()
      val session = ScreenHlsPipeline(
        projection,
        size.first,
        size.second,
        resources.displayMetrics.densityDpi,
        window,
      ) { count ->
        if (count >= LiveHlsRuntime.MIN_SEGMENTS) {
          android.util.Log.i("DannerLiveHls", "origin=$origin")
          LiveHlsRuntime.markReady(origin, port)
        }
      }
      pipeline = session
      session.start()
      LiveHlsRuntime.port = port
      LiveHlsRuntime.origin = origin
      LiveHlsRuntime.running = true
    } catch (_: Exception) {
      LiveHlsRuntime.markFailed()
      stopSelf()
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    try {
      pipeline?.stop()
    } catch (_: Exception) {
    }
    pipeline = null
    httpServer.stop()
    window.clear()
    try {
      mediaProjection?.unregisterCallback(projectionCallback)
    } catch (_: Exception) {
    }
    mediaProjection = null
    releaseWakeLock()
    LiveHlsRuntime.running = false
    LiveHlsRuntime.origin = null
    LiveHlsRuntime.port = 0
    super.onDestroy()
  }

  private fun startForegroundNotification() {
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "TV playback",
        NotificationManager.IMPORTANCE_LOW,
      )
      channel.setShowBadge(false)
      manager.createNotificationChannel(channel)
    }
    val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
      .setContentTitle("Danner Apps")
      .setContentText("Sending the game to the TV")
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setOngoing(true)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun acquireWakeLock() {
    val power = getSystemService(POWER_SERVICE) as PowerManager
    val lock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "danner:livehls")
    lock.setReferenceCounted(false)
    lock.acquire()
    wakeLock = lock
  }

  private fun releaseWakeLock() {
    try {
      if (wakeLock?.isHeld == true) {
        wakeLock?.release()
      }
    } catch (_: Exception) {
    }
    wakeLock = null
  }

  private fun captureSize(): Pair<Int, Int> {
    val metrics = resources.displayMetrics
    var width = metrics.widthPixels
    var height = metrics.heightPixels
    val windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val bounds = windowManager.currentWindowMetrics.bounds
      width = bounds.width()
      height = bounds.height()
    }
    val longest = maxOf(width, height)
    if (longest > MAX_LONG_EDGE) {
      val scale = MAX_LONG_EDGE.toFloat() / longest.toFloat()
      width = (width * scale).toInt()
      height = (height * scale).toInt()
    }
    width = width and 1.inv()
    height = height and 1.inv()
    if (width < 16) {
      width = 16
    }
    if (height < 16) {
      height = 16
    }
    return Pair(width, height)
  }

  private fun projectionData(intent: Intent?): Intent? {
    if (intent == null) {
      return null
    }
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(LiveHlsRuntime.EXTRA_DATA, Intent::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(LiveHlsRuntime.EXTRA_DATA)
    }
  }

  companion object {
    private const val CHANNEL_ID = "danner-live-hls"
    private const val MAX_LONG_EDGE = 1280
    private const val NOTIFICATION_ID = 7108
  }
}
