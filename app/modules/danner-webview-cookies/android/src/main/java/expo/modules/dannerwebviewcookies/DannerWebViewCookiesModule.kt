package expo.modules.dannerwebviewcookies

import android.webkit.CookieManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DannerWebViewCookiesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DannerWebViewCookies")

    // Writes pending WebView cookie changes to disk. The cookie store otherwise batches
    // writes for up to 30 seconds, and a swiped-away app is killed without a final write.
    AsyncFunction("flushCookies") {
      try {
        CookieManager.getInstance().flush()
        true
      } catch (error: Exception) {
        false
      }
    }
  }
}
