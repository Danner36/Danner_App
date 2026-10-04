package expo.modules.dannerlivehls

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.concurrent.thread

class DannerLiveHlsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DannerLiveHls")

    AsyncFunction("startProxy") { sourceUrl: String, referer: String, kind: String, promise: Promise ->
      val context = appContext.reactContext ?: appContext.currentActivity
      if (context == null) {
        promise.reject(ERR_RELAY, "The app is not running.", null)
        return@AsyncFunction
      }
      // The source probe is network I/O, so it runs off the shared module queue.
      thread(name = "danner-relay-start", isDaemon = true) {
        try {
          promise.resolve(HlsProxyRuntime.start(context, sourceUrl, referer, kind).toMap())
        } catch (error: RelayStartException) {
          promise.reject(error.code, error.message, error)
        } catch (error: Throwable) {
          promise.reject(ERR_RELAY, error.message ?: "The relay did not start.", error)
        }
      }
    }

    AsyncFunction("stopProxy") {
      HlsProxyRuntime.stop()
    }

    AsyncFunction("getProxyStatus") {
      HlsProxyRuntime.status()
    }

    OnDestroy {
      HlsProxyRuntime.stop()
    }
  }
}
