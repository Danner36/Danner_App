package expo.modules.dannerlivehls

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Rect
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
      val layout = captureLayout()
      val session = ScreenHlsPipeline(
        projection,
        layout.captureWidth,
        layout.captureHeight,
        layout.encodeWidth,
        layout.encodeHeight,
        layout.crop,
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

  private fun captureLayout(): CaptureLayout {
    val screen = displaySize()
    val capture = scaleToLongEdge(screen.first, screen.second)
    val screenCrop = Rect(
      LiveHlsRuntime.cropX,
      LiveHlsRuntime.cropY,
      LiveHlsRuntime.cropX + LiveHlsRuntime.cropWidth,
      LiveHlsRuntime.cropY + LiveHlsRuntime.cropHeight,
    )
    val crop = mapCrop(screenCrop, screen.first, screen.second, capture.first, capture.second)
    val encoded = alignCoded(crop.width(), crop.height())
    return CaptureLayout(
      capture.first,
      capture.second,
      encoded.first,
      encoded.second,
      crop,
    )
  }

  private fun displaySize(): Pair<Int, Int> {
    var width = resources.displayMetrics.widthPixels
    var height = resources.displayMetrics.heightPixels
    val windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val bounds = windowManager.currentWindowMetrics.bounds
      width = bounds.width()
      height = bounds.height()
    }
    return Pair(width.coerceAtLeast(16), height.coerceAtLeast(16))
  }

  private fun scaleToLongEdge(rawWidth: Int, rawHeight: Int): Pair<Int, Int> {
    var width = rawWidth
    var height = rawHeight
    val longest = maxOf(width, height)
    if (longest > MAX_LONG_EDGE) {
      val scale = MAX_LONG_EDGE.toFloat() / longest.toFloat()
      width = (width * scale).toInt()
      height = (height * scale).toInt()
    }
    return alignCoded(width, height)
  }

  private fun mapCrop(
    screenCrop: Rect,
    screenWidth: Int,
    screenHeight: Int,
    captureWidth: Int,
    captureHeight: Int,
  ): Rect {
    if (screenCrop.width() < 32 || screenCrop.height() < 32) {
      return Rect(0, 0, captureWidth, captureHeight)
    }
    val left = (screenCrop.left.toLong() * captureWidth / screenWidth)
      .toInt()
      .coerceIn(0, captureWidth - 16)
    val top = (screenCrop.top.toLong() * captureHeight / screenHeight)
      .toInt()
      .coerceIn(0, captureHeight - 16)
    val right = (screenCrop.right.toLong() * captureWidth / screenWidth)
      .toInt()
      .coerceIn(left + 16, captureWidth)
    val bottom = (screenCrop.bottom.toLong() * captureHeight / screenHeight)
      .toInt()
      .coerceIn(top + 16, captureHeight)
    return Rect(left, top, right, bottom)
  }

  private fun alignCoded(rawWidth: Int, rawHeight: Int): Pair<Int, Int> {
    var width = minOf(rawWidth, MAX_LONG_EDGE)
    var height = minOf(rawHeight, MAX_LONG_EDGE)
    width -= width % 16
    height -= height % 16
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
    private const val MAX_LONG_EDGE = 1080
    private const val NOTIFICATION_ID = 7108
  }

  private data class CaptureLayout(
    val captureWidth: Int,
    val captureHeight: Int,
    val encodeWidth: Int,
    val encodeHeight: Int,
    val crop: Rect,
  )
}
