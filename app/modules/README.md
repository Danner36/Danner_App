# modules

Local Expo native modules used by Danner Apps. This folder is not a product sub-app.

## Modules

- `danner-app-update/` is Android-only. It downloads a GitHub release APK off the shared module queue, verifies SHA-256, and opens the system package installer. One install runs at a time. It is absent from iPhone builds.
- `danner-provisioning-profile/` is iOS-only. It reads `ExpirationDate` from the embedded signing profile for the hub's final-48-hour warning. It is absent from Android builds.
- `danner-webview-cookies/` serves TV Location on Android and iPhone. `clearYouTubeSession` signs the phone out and `youTubeSessionState` reports `signed-in`, `signed-out`, or `unknown` from cookie names, never values. Android clears every WebView cookie and all web storage in the app; iPhone clears only Google and YouTube data. Android also has `flushCookies`, which calls `CookieManager.flush()` so the Google sign-in reaches disk before a swiped-away app is killed; iPhone has no equivalent call.
- `danner-picture-in-picture/` is Android-only. While a game player is open it arms picture-in-picture, so leaving the app moves the game into a small window over other apps (Android 12 and later through the auto-enter parameter, older versions from the user-leave hint); `enter` serves the player's `Pop out` button, and closing the small window reports `onPictureInPictureClosed`. It is absent from iPhone builds.
- `danner-live-hls/` relays an approved page's HLS, DASH, or MP4 stream from a LAN port in 8108–8127 so a Cast receiver can play it. Each send gets a random session token and signed media URLs. Android holds a wake lock and a Wi-Fi lock in a `connectedDevice` foreground service with a Stop action, forwards a variant at or under 3.5 Mbps when one exists, and prefetches the live-edge segments. iPhone uses the same relay for Cast while the app is in front, and AirPlay without it.
