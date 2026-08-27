# modules

Local Expo native modules used by Danner Apps. This folder is not a product sub-app.

## Modules

- `danner-provisioning-profile/` is iOS-only. It reads `ExpirationDate` from the embedded signing profile for the hub's final-48-hour warning. It is absent from Android builds.
- `danner-live-hls/` captures the on-screen Guardians web player on Android and iPhone, encodes H.264/AAC, and serves a sliding HLS playlist on a LAN port in 8108–8127.
