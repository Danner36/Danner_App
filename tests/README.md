# tests

Repository-only validation harnesses. Files under this directory are not imported by the Expo application and are not packaged into Android or iPhone builds.

## Harnesses

- `leagues/` holds per-adapter schedule fixtures and live captures. `run.mjs [--league <adapter>]` checks that the app's adapter rows equal the catalog's, runs each adapter under the nine phone time zones, and checks the board model of the committed live captures.
- `team-engine/` runs the engine: `guardians.mjs`, `patriots.mjs`, and `cyclones.mjs` are the fixed-team snapshot cases ported to the engine; `engine.mjs` adds the partial-failure, live-merge, postseason, stream-match, accent, and Get video text cases.
- `imports/` imports every pure module under plain Node.
- `hub/` runs `hubGrid` for 1 through 32 tiles on four screen sizes (no overlap, inside the container) and the sizes in the layout table.
- `selection/` runs the tile operations including the 30-tile cap, load and migration (corrupt JSON, schema changes, read-only sessions, write order), the seeding table, and the catalog data path from what `scripts/team-catalog/build.mjs` writes, including retired, hidden and `retiredSports` entries and the snapshot script.
- `fixtures/stream-match.json` holds the stream-match cases shared with `scripts/stream-pipeline/test/`.
- `team-harness/` serves today, ready, delayed, live, Final, live-basketball, and two-games fixtures by team key from port 8108 to a development build, and drives them: `run-android.mjs --team <key> --scenario <s>` or `--all`. `run-get-video.mjs --team <key>` runs Get video against a Worker v2 mock on port 8111 through no-video, `too_early`, and a three-site run that stalls and succeeds. `run-picker.mjs` drives a fresh install, a pro add, a two-sport school becoming one tile, a remove-one-sport, tile actions, the cap, and `adb install -r` keeping tiles and TV keys against the fixture catalog. `run-upgrade.mjs` installs a release build over `v1.4.16` and checks each seeding layer. `storage.mjs` reads and writes the app's AsyncStorage on a debuggable build. Set `SKIP_ANDROID_BUILD=1` to use the app already installed.
- `playback/` checks the player stack. `run-cast-discovery.mjs` checks the page-reported Cast URL gate, the per-page message nonce, the MP4-then-HLS upgrade through the real injection, relay kinds and failure messages, relay origin validation, live relay stream type, and relay variant selection. `run-cast-web.mjs` opens the fixture player on a device and asserts Cast loads only the phone's token relay URL and plays. `run-shell-fix.mjs` drives Back navigation and TV send. The two converter harnesses moved to `reference/screen-capture-hls/tests/` with the pipeline they exercise.
- `offline-map/` checks pin coordinates, city labels (including suburbs next to major cities), and offline city search against the bundled Census place list, and checks that the selection code shipped inside `app/assets/offline-us-map.html` agrees with `offlineMapSelection.ts`, without opening YouTube.
- `tv-location/` holds `run.mjs`, which checks `resolveTvLocation`, button visibility, the navigation gate, the geolocation host guard against fake page objects, and that no app source carries a built-in point or an Android `incognito`, and `run-android.mjs`, which drives first use, save, relaunch, `Use my default`, and `Forget location` on an emulator and, with `--upgrade-from`, an in-place update from an older build. It signs in to nothing.
- `provisioning-warning/` verifies the hidden, 48-hour, hourly, final-hour, and expired iPhone signing-warning text without adding a test control to the app.
- `app-update/` verifies the strict release-tag parser, version compare, the `app.config.js` version bake, the release workflow's tag regex, manifest parse, trusted download URLs, signing-warning suppression, SideStore install URL encoding, and the release manifest writer.

## Captures

- `leagues/<adapter>/captures/<event>/` (`ncaa-mens-basketball`, `ncaa-womens-basketball`) holds live ESPN basketball polls committed by `scripts/espn-capture/`: gzipped trimmed summaries, each with the Core situation body, plus `REPORT.md`.
