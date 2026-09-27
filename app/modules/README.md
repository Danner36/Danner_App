# modules

Local Expo native modules used by Danner Apps. This folder is not a product sub-app.

## Modules

- `danner-app-update/` is Android-only. It downloads a GitHub release APK, verifies SHA-256, and opens the system package installer. It is absent from iPhone builds.
- `danner-provisioning-profile/` is iOS-only. It reads `ExpirationDate` from the embedded signing profile for the hub's final-48-hour warning. It is absent from Android builds.
- `danner-live-hls/` relays an approved page HLS playlist from a LAN port in 8108–8127 so a Cast receiver can play it. Android holds a wake lock and a Wi-Fi lock in a foreground service, loads the relay as a live stream, forwards a variant at or under 3.5 Mbps when one exists, and prefetches the live-edge segments. iPhone playback to a TV uses AirPlay and does not use this relay.
