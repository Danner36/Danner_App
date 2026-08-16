Status: LOCKED
Phase: MVP

# APK inventory

Facts recovered directly from `app-debug.apk` with Android SDK tools, JADX, and a Pixel 7 API 34 emulator.

## Package

- Package: `com.example.location_helper`
- Version: `1.0`, code 1
- Label: `Youtube Fix`
- Debuggable: yes
- Minimum SDK: 29
- Target and compile SDK: 33
- Launch activity: `com.example.location_helper.MainActivity`
- Android Gradle Plugin: 8.1.1

## Manifest permissions

- `READ_EXTERNAL_STORAGE`
- `WRITE_EXTERNAL_STORAGE`
- `READ_MEDIA_STORAGE`
- `ACCESS_FINE_LOCATION`
- `ACCESS_COARSE_LOCATION`
- `INTERNET`
- `BIND_GET_INSTALL_REFERRER_SERVICE`

## Home layout

`res/layout/activity_main.xml` is a centered vertical `LinearLayout` with background `#CCCCCC`.

| ID | Type | Recovered value |
|----|------|-----------------|
| `textViewDanners` | `TextView` | `Danners`, 36sp, cursive, bold, black |
| `btn_fake_gps` | `Button` | `1. Fake GPS to Tripoli`, 20sp |
| `btn_launch_youtube_website` | `Button` | `2. Update YouTube Playback Area`, 20sp |
| `textViewVerifyChannels` | `TextView` | `3. Check TV for KWWL`, 20sp |
| `btn_stop_fake_gps` | `Button` | `4. Stop Faking GPS`, 20sp |
| `webview` | `WebView` | Full size and initially `gone` |

The title has 16dp padding, 16dp top and bottom margins, a `#CCCCCC` background, and match-parent width. The reminder has 16dp padding and match-parent width.

## Recovered Kotlin behavior

- Both GPS buttons start an explicit `android.intent.action.MAIN` intent.
- Component package: `com.blogspot.newapphorizons.fakegps`
- Component activity: `com.blogspot.newapphorizons.fakegps.MainActivity`
- The verification button calls `webView.loadUrl("https://tv.youtube.com/verify")`.
- The original code does not make the initially hidden WebView visible.
- No click handler requests runtime location permission.

## Emulator reference

Captured at 1080 by 2400 pixels and 420 dpi:

| Element | Bounds |
|---------|--------|
| Title | `[0,832][1080,1048]` |
| Step 1 | `[217,1090][862,1216]` |
| Step 2 | `[120,1216][960,1401]` |
| Step 3 | `[0,1401][1080,1556]` |
| Step 4 | `[246,1556][834,1682]` |

The Material 3 controls render purple with white text on the light emulator theme.

## Launcher assets

- Product icon: `res/mipmap-hdpi-v4/ic_launcher_danner.jpg`
- Recovered build copy: `Docs/Art/media/ic_launcher_danner.jpg`
- Default Android Studio adaptive robot icons also remain in the APK.

## Template leftovers

- `res/navigation/nav_graph.xml` names `FirstFragment` and `SecondFragment`.
- `res/layout/custom_dialog.xml` contains an unused `Ok` button.
- The home activity does not use those resources.
