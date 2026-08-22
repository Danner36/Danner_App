# tests

Repository-only validation harnesses. Files under this directory are not imported by the Expo application and are not packaged into Android or iPhone builds.

## Harnesses

- `guardians/` simulates today, video-ready, delayed, and live Cleveland Guardians states and supplies HTTPS direct-media, local HTTP direct-media, YouTube, and popup/redirect safety checks to a development build.
- `offline-map/` checks pin coordinates, city labels, and offline city search against the bundled Census place list without opening YouTube.
- `provisioning-warning/` verifies the hidden, 48-hour, hourly, final-hour, and expired iPhone signing-warning text without adding a test control to the app.
