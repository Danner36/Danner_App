# modules

Local Expo native modules used by Danner Apps. This folder is not a product sub-app.

## Modules

- `danner-app-update/` is Android-only. It downloads a GitHub release APK, verifies SHA-256, and opens the system package installer. It is absent from iPhone builds.
- `danner-provisioning-profile/` is iOS-only. It reads `ExpirationDate` from the embedded signing profile for the hub's final-48-hour warning. It is absent from Android builds.
- `danner-live-hls/` captures the on-screen Guardians web player on Android and iPhone, encodes H.264/AAC, and serves a sliding MPEG-TS HLS origin on a port in 8108–8127.
