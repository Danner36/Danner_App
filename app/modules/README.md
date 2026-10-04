# modules

Local Expo native modules used by Danner Apps. This folder is not a product sub-app.

## Modules

- `danner-app-update/` is Android-only. It downloads a GitHub release APK off the shared module queue, verifies SHA-256, and opens the system package installer. One install runs at a time. It is absent from iPhone builds.
- `danner-provisioning-profile/` is iOS-only. It reads `ExpirationDate` from the embedded signing profile for the hub's final-48-hour warning. It is absent from Android builds.
- `danner-live-hls/` relays an approved page's HLS, DASH, or MP4 stream from a LAN port in 8108–8127 so a Cast receiver can play it. Each send gets a random session token and signed media URLs. Android holds a wake lock and a Wi-Fi lock in a `connectedDevice` foreground service with a Stop action, forwards a variant at or under 3.5 Mbps when one exists, and prefetches the live-edge segments. iPhone uses the same relay for Cast while the app is in front, and AirPlay without it.
