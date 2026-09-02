package expo.modules.dannerlivehls

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DannerLiveHlsModule : Module() {
  private var pendingStart: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("DannerLiveHls")

    AsyncFunction("start") { cropX: Double, cropY: Double, cropWidth: Double, cropHeight: Double, promise: Promise ->
      val existingOrigin = LiveHlsRuntime.origin
      val existingPort = LiveHlsRuntime.port
      if (LiveHlsRuntime.running && existingOrigin != null && existingPort != 0) {
        promise.resolve(
          mapOf(
            "origin" to existingOrigin,
            "port" to existingPort,
          ),
        )
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("ERR_NO_ACTIVITY", "The app is not in the foreground.", null)
        return@AsyncFunction
      }
      pendingStart?.reject("ERR_CANCELLED", "Screen capture was replaced.", null)
      pendingStart = promise
      LiveHlsRuntime.resetForStart()
      LiveHlsRuntime.setCrop(
        cropX.toInt(),
        cropY.toInt(),
        cropWidth.toInt(),
        cropHeight.toInt(),
      )
      val manager =
        activity.getSystemService(Activity.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      activity.startActivityForResult(
        manager.createScreenCaptureIntent(),
        REQUEST_CAPTURE,
      )
    }

    AsyncFunction("stop") {
      stopCapture()
    }

    AsyncFunction("getStatus") {
      val origin = LiveHlsRuntime.origin
      val port = LiveHlsRuntime.port
      val status = mutableMapOf<String, Any>(
        "running" to LiveHlsRuntime.running,
      )
      if (origin != null) {
        status["origin"] = origin
      }
      if (port != 0) {
        status["port"] = port
      }
      status
    }

    AsyncFunction("showAirPlayPicker") {
    }

    OnActivityResult { activity, payload ->
      if (payload.requestCode != REQUEST_CAPTURE) {
        return@OnActivityResult
      }
      val promise = pendingStart
      pendingStart = null
      if (promise == null) {
        return@OnActivityResult
      }
      if (payload.resultCode != Activity.RESULT_OK || payload.data == null) {
        promise.reject("ERR_CANCELLED", "Screen capture was not allowed.", null)
        return@OnActivityResult
      }
      try {
        LiveHlsRuntime.startForeground(
          activity.applicationContext,
          LiveHlsRuntime.startIntent(
            activity.applicationContext,
            payload.resultCode,
            payload.data!!,
          ),
        )
      } catch (error: Exception) {
        promise.reject("ERR_START", error.message, error)
        return@OnActivityResult
      }
      Thread {
        val ready = LiveHlsRuntime.awaitReady()
        val origin = LiveHlsRuntime.origin
        val port = LiveHlsRuntime.port
        if (!ready || origin == null || port == 0) {
          stopCapture()
          promise.reject("ERR_START", "The TV stream could not start.", null)
          return@Thread
        }
        promise.resolve(
          mapOf(
            "origin" to origin,
            "port" to port,
          ),
        )
      }.start()
    }

    OnDestroy {
      pendingStart?.reject("ERR_CANCELLED", "Screen capture was replaced.", null)
      pendingStart = null
    }
  }

  private fun stopCapture() {
    val context = appContext.reactContext ?: appContext.currentActivity ?: return
    try {
      context.startService(LiveHlsRuntime.stopIntent(context.applicationContext))
    } catch (_: Exception) {
    }
    LiveHlsRuntime.running = false
    LiveHlsRuntime.origin = null
    LiveHlsRuntime.port = 0
  }

  companion object {
    private const val REQUEST_CAPTURE = 7108
  }
}
