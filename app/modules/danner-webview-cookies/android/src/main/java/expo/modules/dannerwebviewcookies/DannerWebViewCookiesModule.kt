package expo.modules.dannerwebviewcookies

import android.webkit.CookieManager
import android.webkit.WebStorage
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val ACCOUNTS_URL = "https://accounts.google.com"
private val SESSION_COOKIE_NAMES = setOf("SID", "__Secure-1PSID", "__Secure-3PSID")

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

    // CookieManager has no per-domain delete, so this clears every WebView cookie and all
    // web storage in the app.
    AsyncFunction("clearYouTubeSession") { promise: Promise ->
      try {
        val cookies = CookieManager.getInstance()
        cookies.removeAllCookies {
          try {
            cookies.flush()
            WebStorage.getInstance().deleteAllData()
            promise.resolve(true)
          } catch (error: Exception) {
            promise.resolve(false)
          }
        }
      } catch (error: Exception) {
        promise.resolve(false)
      }
    }.runOnQueue(Queues.MAIN)

    // Only cookie names are compared; values never leave this function.
    AsyncFunction("youTubeSessionState") {
      try {
        val header = CookieManager.getInstance().getCookie(ACCOUNTS_URL).orEmpty()
        val signedIn = header.split(";").any {
          it.substringBefore("=").trim() in SESSION_COOKIE_NAMES
        }
        if (signedIn) "signed-in" else "signed-out"
      } catch (error: Exception) {
        "unknown"
      }
    }
  }
}
