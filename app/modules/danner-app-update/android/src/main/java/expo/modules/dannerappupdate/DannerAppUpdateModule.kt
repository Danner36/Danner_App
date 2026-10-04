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
import kotlinx.coroutines.launch
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

class DannerAppUpdateModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DannerAppUpdate")

    OnActivityEntersForeground {
      activityInForeground = true
      val deferred = deferredConfirmation
      if (deferred != null) {
        deferredConfirmation = null
        launchConfirmation(deferred)
      }
    }

    OnActivityEntersBackground {
      activityInForeground = false
    }

    AsyncFunction("installApk") { url: String, sha256: String, promise: Promise ->
      val context = (appContext.reactContext ?: appContext.currentActivity)?.applicationContext
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
      if (!installInProgress.compareAndSet(false, true)) {
        promise.reject("ERR_BUSY", "The update is already downloading.", null)
        return@AsyncFunction
      }

      startInstall(InstallAttempt(context, promise), url, sha256)
    }
  }

  private fun startInstall(attempt: InstallAttempt, url: String, sha256: String) {
    // The download and the installer session write are tens of megabytes of blocking I/O, so
    // they run on the background scope instead of the shared AsyncFunction queue that every
    // other Expo module call waits on. A job cancelled before it runs still settles the promise.
    val job = appContext.backgroundCoroutineScope.launch {
      runInstall(attempt, url, sha256)
    }
    job.invokeOnCompletion { cause ->
      if (cause != null) {
        attempt.reject("ERR_DOWNLOAD", "The update could not be downloaded.", cause)
      }
    }
  }

  private fun runInstall(attempt: InstallAttempt, url: String, sha256: String) {
    val apk = try {
      clearCachedUpdates(attempt.context)
      File.createTempFile(APK_PREFIX, APK_SUFFIX, attempt.context.cacheDir).also { file ->
        attempt.apk = file
        downloadAndVerify(file, url, sha256)
      }
    } catch (error: ChecksumException) {
      attempt.reject("ERR_CHECKSUM", error.message, error)
      return
    } catch (error: Exception) {
      attempt.reject("ERR_DOWNLOAD", error.message, error)
      return
    }

    try {
      commitInstall(attempt, apk)
    } catch (error: Exception) {
      attempt.reject("ERR_INSTALL", error.message, error)
    }
  }

  private fun clearCachedUpdates(context: Context) {
    // Only one install runs per process, so every earlier update file is a leftover.
    context.cacheDir.listFiles()?.forEach { file ->
      if (file.name.startsWith(APK_PREFIX) && file.name.endsWith(APK_SUFFIX)) {
        file.delete()
      }
    }
  }

  private fun downloadAndVerify(apk: File, url: String, expectedSha256: String) {
    val connection = openDownload(url)
    try {
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
        throw ChecksumException("The update file did not match the published checksum.")
      }
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

  private fun commitInstall(attempt: InstallAttempt, apk: File) {
    val context = attempt.context
    val installer = context.packageManager.packageInstaller
    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
    params.setAppPackageName(context.packageName)
    val sessionId = installer.createSession(params)
    attempt.sessionId = sessionId
    val session = installer.openSession(sessionId)
    try {
      session.openWrite(SESSION_APK_NAME, 0, apk.length()).use { output ->
        apk.inputStream().use { input ->
          input.copyTo(output)
        }
        session.fsync(output)
      }

      val action = "${context.packageName}.DANNER_APP_UPDATE_INSTALL"
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(receiverContext: Context, intent: Intent) {
          // Only act on results for the session opened here. STATUS_PENDING_USER_ACTION hands
          // over an Intent that is then started, so a spoofed broadcast would be an activity
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
              val confirm = pendingUserActionIntent(intent)
              if (confirm == null) {
                attempt.reject("ERR_INSTALL", INSTALL_FAILED_MESSAGE, null)
                return
              }
              confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
              val confirmation = DeferredConfirmation(attempt, confirm)
              // Android blocks activity starts from the background, so a download that finishes
              // while the app is hidden opens the installer when the app next resumes.
              if (activityInForeground) {
                launchConfirmation(confirmation)
              } else {
                deferredConfirmation = confirmation
              }
            }
            PackageInstaller.STATUS_SUCCESS -> {
              attempt.resolve("installed")
            }
            PackageInstaller.STATUS_FAILURE_ABORTED -> {
              attempt.resolve("cancelled")
            }
            else -> {
              attempt.reject(
                "ERR_INSTALL",
                intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                  ?: INSTALL_FAILED_MESSAGE,
                null,
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
      attempt.receiver = receiver

      val resultIntent = Intent(action).setPackage(context.packageName)
      val pendingFlags =
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
      val pending = PendingIntent.getBroadcast(context, sessionId, resultIntent, pendingFlags)
      session.commit(pending.intentSender)
    } finally {
      session.close()
    }
  }

  private fun launchConfirmation(confirmation: DeferredConfirmation) {
    val attempt = confirmation.attempt
    if (attempt.isSettled) {
      return
    }
    try {
      val starter: Context = appContext.currentActivity ?: attempt.context
      starter.startActivity(confirmation.intent)
      attempt.resolve("prompted")
    } catch (error: Exception) {
      attempt.reject("ERR_INSTALL", INSTALL_FAILED_MESSAGE, error)
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

  /**
   * One download-and-install run. Settles its promise exactly once, and every settle path
   * unregisters the result receiver, deletes the downloaded file, and releases the
   * process-wide install slot. Failures also abandon the installer session.
   */
  private class InstallAttempt(val context: Context, private val promise: Promise) {
    private val settled = AtomicBoolean(false)

    @Volatile var apk: File? = null

    @Volatile var sessionId: Int? = null

    @Volatile var receiver: BroadcastReceiver? = null

    val isSettled: Boolean
      get() = settled.get()

    fun resolve(status: String) {
      if (settle(abandonSession = false)) {
        promise.resolve(status)
      }
    }

    fun reject(code: String, message: String?, cause: Throwable?) {
      if (settle(abandonSession = true)) {
        promise.reject(code, message ?: INSTALL_FAILED_MESSAGE, cause)
      }
    }

    private fun settle(abandonSession: Boolean): Boolean {
      if (!settled.compareAndSet(false, true)) {
        return false
      }
      receiver?.let { registered ->
        try {
          context.unregisterReceiver(registered)
        } catch (_: Exception) {
        }
      }
      val openedSession = sessionId
      if (abandonSession && openedSession != null) {
        try {
          context.packageManager.packageInstaller.abandonSession(openedSession)
        } catch (_: Exception) {
        }
      }
      apk?.delete()
      installInProgress.set(false)
      return true
    }
  }

  private class DeferredConfirmation(val attempt: InstallAttempt, val intent: Intent)

  private class ChecksumException(message: String) : Exception(message)

  companion object {
    private const val APK_PREFIX = "Danner-Apps-update"
    private const val APK_SUFFIX = ".apk"
    private const val SESSION_APK_NAME = "Danner-Apps-update.apk"
    private const val INSTALL_FAILED_MESSAGE = "The update could not be installed."
    private val SHA256_PATTERN = Regex("^[0-9a-fA-F]{64}$")

    // Process-wide so a second call, or a module instance recreated by a JavaScript reload,
    // cannot start a parallel download.
    private val installInProgress = AtomicBoolean(false)

    // Written on the main thread by activity lifecycle events and installer results.
    @Volatile private var activityInForeground = false

    @Volatile private var deferredConfirmation: DeferredConfirmation? = null
  }
}
