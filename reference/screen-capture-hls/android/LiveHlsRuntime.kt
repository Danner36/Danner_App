package expo.modules.dannerlivehls

import android.content.Context
import android.content.Intent
import android.os.Build
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

internal object LiveHlsRuntime {
  const val ACTION_STOP = "expo.modules.dannerlivehls.STOP"
  const val EXTRA_DATA = "data"
  const val EXTRA_RESULT_CODE = "resultCode"
  const val MIN_SEGMENTS = 3
  const val READY_TIMEOUT_MS = 25_000L

  @Volatile
  var origin: String? = null

  @Volatile
  var port: Int = 0

  @Volatile
  var running: Boolean = false

  @Volatile
  var cropX: Int = 0

  @Volatile
  var cropY: Int = 0

  @Volatile
  var cropWidth: Int = 0

  @Volatile
  var cropHeight: Int = 0

  fun setCrop(x: Int, y: Int, width: Int, height: Int) {
    cropX = x.coerceAtLeast(0)
    cropY = y.coerceAtLeast(0)
    cropWidth = width.coerceAtLeast(0)
    cropHeight = height.coerceAtLeast(0)
  }

  private val lock = Object()
  private var readyLatch = CountDownLatch(1)
  private val failed = AtomicBoolean(false)

  fun resetForStart() {
    synchronized(lock) {
      origin = null
      port = 0
      running = false
      cropX = 0
      cropY = 0
      cropWidth = 0
      cropHeight = 0
      failed.set(false)
      readyLatch = CountDownLatch(1)
    }
  }

  fun markReady(originValue: String, portValue: Int) {
    synchronized(lock) {
      origin = originValue
      port = portValue
      running = true
      readyLatch.countDown()
    }
  }

  fun markFailed() {
    failed.set(true)
    readyLatch.countDown()
  }

  fun awaitReady(): Boolean {
    val completed = readyLatch.await(READY_TIMEOUT_MS, TimeUnit.MILLISECONDS)
    return completed && !failed.get() && origin != null
  }

  fun stopIntent(context: Context): Intent {
    return Intent(context, LiveHlsService::class.java).setAction(ACTION_STOP)
  }

  fun startIntent(context: Context, resultCode: Int, data: Intent): Intent {
    return Intent(context, LiveHlsService::class.java).apply {
      putExtra(EXTRA_RESULT_CODE, resultCode)
      putExtra(EXTRA_DATA, data)
    }
  }

  fun startForeground(context: Context, intent: Intent) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
  }
}
