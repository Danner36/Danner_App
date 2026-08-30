# tests

Repository-only validation harnesses. Files under this directory are not imported by the Expo application and are not packaged into Android or iPhone builds.

## Harnesses

- `guardians/` simulates today, video-ready, delayed, live, and Final recap Cleveland Guardians states and supplies HTTPS direct-media, local HTTP direct-media, YouTube, popup/redirect safety checks, and a moving capture-pattern page to a development build. `run-snapshot.mjs` checks featured-card selection. `run-live-hls.mjs` proves the local converter playlist on an Android emulator.
- `patriots/` simulates today, video-ready, delayed, live, and Final recap New England Patriots states plus Get video on port 8112. `run-snapshot.mjs` checks featured-card selection, regular-season record, and Eastern official dates.
- `offline-map/` checks pin coordinates, city labels, and offline city search against the bundled Census place list without opening YouTube.
- `provisioning-warning/` verifies the hidden, 48-hour, hourly, final-hour, and expired iPhone signing-warning text without adding a test control to the app.
- `app-update/` verifies release-tag version compare, manifest parse, trusted download URLs, signing-warning suppression, SideStore install URL encoding, and the release manifest writer.
