package expo.modules.dannerappupdate

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Locale

class DannerAppUpdateModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DannerAppUpdate")

    AsyncFunction("installApk") { url: String, sha256: String, promise: Promise ->
      val context = appContext.reactContext ?: appContext.currentActivity
      if (context == null) {
        promise.reject("ERR_NO_ACTIVITY", "The app is not in the foreground.", null)
        return@AsyncFunction
      }
      if (!isTrustedApkUrl(url)) {
        promise.reject("ERR_TRUST", "The update is not from a Danner Apps release.", null)
        return@AsyncFunction
      }
      if (!SHA256_PATTERN.matches(sha256)) {
        promise.reject("ERR_CHECKSUM", "The update checksum is missing.", null)
        return@AsyncFunction
      }
      if (!canRequestPackageInstalls(context)) {
        openInstallPermissionSettings(context)
        promise.reject(
          "ERR_INSTALL_PERMISSION",
          "Allow Danner Apps to install updates, then tap Yes again.",
          null,
        )
        return@AsyncFunction
      }

      try {
        val apk = downloadAndVerify(context, url, sha256)
        // Deliberately not on the main thread: commitInstall streams the whole APK into the
        // installer session, which is tens of megabytes. The receiver's onReceive is still
        // delivered on the main looper, which is all that needed it.
        try {
          commitInstall(context, apk, promise)
        } catch (error: Exception) {
          promise.reject("ERR_INSTALL", error.message, error)
        }
      } catch (error: ChecksumException) {
        promise.reject("ERR_CHECKSUM", error.message, error)
      } catch (error: Exception) {
        promise.reject("ERR_DOWNLOAD", error.message, error)
      }
    }
  }

  private fun downloadAndVerify(context: Context, url: String, expectedSha256: String): File {
    val connection = openDownload(url)
    try {
      val apk = File(context.cacheDir, APK_NAME)
      if (apk.exists()) {
        apk.delete()
      }

      val digest = MessageDigest.getInstance("SHA-256")
      connection.inputStream.use { input ->
        apk.outputStream().use { output ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read < 0) {
              break
            }
            digest.update(buffer, 0, read)
            output.write(buffer, 0, read)
          }
        }
      }

      val actual = digest.digest().joinToString("") { byte ->
        String.format(Locale.US, "%02x", byte)
      }
      if (!actual.equals(expectedSha256, ignoreCase = true)) {
        apk.delete()
        throw ChecksumException("The update file did not match the published checksum.")
      }
      return apk
    } finally {
      connection.disconnect()
    }
  }

  private fun openDownload(url: String): HttpURLConnection {
    var current = URL(url)
    repeat(5) {
      if (!isTrustedApkUrl(current.toString())) {
        throw IllegalStateException("The update is not from a Danner Apps release.")
      }
      val connection = current.openConnection() as HttpURLConnection
      connection.instanceFollowRedirects = false
      connection.connectTimeout = 15_000
      connection.readTimeout = 120_000
      connection.setRequestProperty("User-Agent", "danner-apps")
      connection.connect()
      val code = connection.responseCode
      if (code in 200..299) {
        return connection
      }
      val location = connection.getHeaderField("Location")
      connection.disconnect()
      if (code in 300..399 && !location.isNullOrBlank()) {
        current = URL(current, location)
      } else {
        throw IllegalStateException("The update could not be downloaded.")
      }
    }
    throw IllegalStateException("The update could not be downloaded.")
  }

  private fun commitInstall(context: Context, apk: File, promise: Promise) {
    val installer = context.packageManager.packageInstaller
    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
    params.setAppPackageName(context.packageName)
    val sessionId = installer.createSession(params)
    val session = installer.openSession(sessionId)
    try {
      session.openWrite(APK_NAME, 0, apk.length()).use { output ->
        apk.inputStream().use { input ->
          input.copyTo(output)
        }
        session.fsync(output)
      }

      val action = "${context.packageName}.DANNER_APP_UPDATE_INSTALL"
      var completed = false
      val receiver = object : BroadcastReceiver() {
        fun complete(status: String?, errorMessage: String?) {
          if (completed) {
            return
          }
          completed = true
          try {
            context.unregisterReceiver(this)
          } catch (_: Exception) {
          }
          apk.delete()
          if (errorMessage != null) {
            promise.reject("ERR_INSTALL", errorMessage, null)
          } else {
            promise.resolve(status)
          }
        }

        override fun onReceive(receiverContext: Context, intent: Intent) {
          // Only act on results for the session we opened. STATUS_PENDING_USER_ACTION hands
          // us an Intent we then start, so a spoofed broadcast would be an activity
          // redirection; the session id is checked before that Intent is ever touched.
          val reportedSession = intent.getIntExtra(
            PackageInstaller.EXTRA_SESSION_ID,
            -1,
          )
          if (reportedSession != sessionId) {
            return
          }
          val status = intent.getIntExtra(
            PackageInstaller.EXTRA_STATUS,
            PackageInstaller.STATUS_FAILURE,
          )
          when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
              val confirm = pendingUserActionIntent(intent) ?: return
              confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
              val starter = appContext.currentActivity ?: receiverContext
              starter.startActivity(confirm)
              complete("prompted", null)
            }
            PackageInstaller.STATUS_SUCCESS -> {
              complete("installed", null)
            }
            PackageInstaller.STATUS_FAILURE_ABORTED -> {
              complete("cancelled", null)
            }
            else -> {
              complete(
                null,
                intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                  ?: "The update could not be installed.",
              )
            }
          }
        }
      }

      // Before API 33 a dynamically registered receiver with a custom action is reachable by
      // any app on the device that knows the action string, which is derivable from the
      // package name. ContextCompat closes that by registering behind a generated permission
      // on older releases; the platform flag is used from 33 up.
      ContextCompat.registerReceiver(
        context,
        receiver,
        IntentFilter(action),
        ContextCompat.RECEIVER_NOT_EXPORTED,
      )

      val confirmIntent = Intent(action).setPackage(context.packageName)
      val pendingFlags =
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
      val pending = PendingIntent.getBroadcast(context, sessionId, confirmIntent, pendingFlags)
      session.commit(pending.intentSender)
    } finally {
      session.close()
    }
  }

  private fun pendingUserActionIntent(intent: Intent): Intent? {
    return if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(Intent.EXTRA_INTENT)
    }
  }

  private fun canRequestPackageInstalls(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.packageManager.canRequestPackageInstalls()
    } else {
      true
    }
  }

  private fun openInstallPermissionSettings(context: Context) {
    val settings = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
      data = Uri.parse("package:${context.packageName}")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    Handler(Looper.getMainLooper()).post {
      context.startActivity(settings)
    }
  }

  private fun isTrustedApkUrl(url: String): Boolean {
    return try {
      val parsed = URL(url)
      if (parsed.protocol != "https") {
        return false
      }
      val host = parsed.host.lowercase(Locale.US)
      host == "github.com" || host.endsWith(".githubusercontent.com")
    } catch (_: Exception) {
      false
    }
  }

  private class ChecksumException(message: String) : Exception(message)

  companion object {
    private const val APK_NAME = "Danner-Apps-update.apk"
    private val SHA256_PATTERN = Regex("^[0-9a-fA-F]{64}$")
  }
}
