package expo.modules.dannerlivehls

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DannerLiveHlsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DannerLiveHls")

    AsyncFunction("startProxy") { sourceUrl: String, referer: String, promise: Promise ->
      val context = appContext.reactContext ?: appContext.currentActivity
      if (context == null) {
        promise.reject("ERR_NO_CONTEXT", "The app is not running.", null)
        return@AsyncFunction
      }
      try {
        val (origin, port) = HlsProxyRuntime.start(context, sourceUrl, referer)
        promise.resolve(
          mapOf(
            "origin" to origin,
            "port" to port,
          ),
        )
      } catch (error: Exception) {
        promise.reject("ERR_PROXY", error.message, error)
      }
    }

    AsyncFunction("stopProxy") {
      HlsProxyRuntime.stop()
    }

    AsyncFunction("getProxyStatus") {
      val origin = HlsProxyRuntime.origin
      val port = HlsProxyRuntime.port
      val status = mutableMapOf<String, Any>(
        "running" to HlsProxyRuntime.running,
      )
      if (origin != null) {
        status["origin"] = origin
      }
      if (port != 0) {
        status["port"] = port
      }
      status
    }

    OnDestroy {
      HlsProxyRuntime.stop()
    }
  }
}
