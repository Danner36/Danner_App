package expo.modules.dannerpictureinpicture

import android.app.Activity
import android.app.Application
import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Rational
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Puts the whole activity into Android's picture-in-picture window while a game player is open.
// Armed, it enters on its own when the person leaves the app: Android 12 and later through the
// auto-enter parameter, older versions from the user-leave hint.
class DannerPictureInPictureModule : Module() {
  private var armed = false
  private var inPictureInPicture = false
  private var callbacks: Application.ActivityLifecycleCallbacks? = null

  private fun supported(activity: Activity?): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      activity != null &&
      activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

  private fun params(): PictureInPictureParams {
    val builder = PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setAutoEnterEnabled(armed).setSeamlessResizeEnabled(true)
    }
    return builder.build()
  }

  private fun enter(activity: Activity): Boolean {
    if (!supported(activity)) {
      return false
    }
    return try {
      activity.enterPictureInPictureMode(params())
    } catch (error: Exception) {
      false
    }
  }

  private fun inPictureInPicture(activity: Activity): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity.isInPictureInPictureMode

  // Closing the small window stops the activity while it is still in picture-in-picture;
  // expanding it resumes the activity full size.
  private fun register() {
    val application = appContext.reactContext?.applicationContext as? Application ?: return
    val lifecycle = object : Application.ActivityLifecycleCallbacks {
      override fun onActivityPaused(activity: Activity) {
        if (inPictureInPicture(activity)) {
          inPictureInPicture = true
        }
      }

      override fun onActivityResumed(activity: Activity) {
        if (!inPictureInPicture(activity)) {
          inPictureInPicture = false
        }
      }

      override fun onActivityStopped(activity: Activity) {
        if (inPictureInPicture) {
          inPictureInPicture = false
          sendEvent("onPictureInPictureClosed", emptyMap<String, Any>())
        }
      }

      override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
      override fun onActivityStarted(activity: Activity) {}
      override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
      override fun onActivityDestroyed(activity: Activity) {}
    }
    application.registerActivityLifecycleCallbacks(lifecycle)
    callbacks = lifecycle
  }

  override fun definition() = ModuleDefinition {
    Name("DannerPictureInPicture")

    Events("onPictureInPictureClosed")

    OnCreate { register() }

    OnDestroy {
      val application = appContext.reactContext?.applicationContext as? Application
      callbacks?.let { application?.unregisterActivityLifecycleCallbacks(it) }
      callbacks = null
    }

    Function("isSupported") { supported(appContext.currentActivity) }

    AsyncFunction("setArmed") { value: Boolean ->
      armed = value
      val activity = appContext.currentActivity
      if (supported(activity)) {
        try {
          activity?.setPictureInPictureParams(params())
        } catch (error: Exception) {
          // A device that refuses the parameters still offers the Pop out button.
        }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("enter") {
      val activity = appContext.currentActivity
      activity != null && enter(activity)
    }.runOnQueue(Queues.MAIN)

    OnUserLeavesActivity {
      val activity = appContext.currentActivity
      if (armed && Build.VERSION.SDK_INT < Build.VERSION_CODES.S && activity != null) {
        enter(activity)
      }
    }
  }
}
