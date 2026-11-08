# app

Shared Expo SDK 57 `Danner Apps` project for Android and iPhone.

`App.tsx` is the thin shell: SafeArea, status bar, and a route among the hub, the preset team screens, and TV Location. Product screens live in sibling folders.

## Folders

- `hub/` is the logo-only main menu, the iPhone signing-warning text, and the GitHub-release update prompt.
- `team/` is the one team screen, its pure engine under `team/engine/`, and its pieces.
- `leagues/` holds the league adapters (`espn/`, `mlb/`) and the shared basketball board parser and rules.
- `playback/` is the native player, isolated WebView player, Listen, Cast, and TV relay.
- `streams/` is the per-team streams parser, fetch chain, and Get video through Worker v2.
- `scoreboards/` is the baseball board, the period board, and `basketball/`, the arena board with pure layout, text, color, and model-type modules.
- `selection/` holds the tile types and the three presets.
- `tvLocation/` is the four-step YouTube TV location flow and bundled map.
- `modules/` holds native Expo modules only, not product screens.
- `assets/` holds shared logos, splash art, and the generated offline map HTML.
- `scripts/` rebuilds the offline map data.
- `plugins/` holds Expo config plugins. `withGoogleCastNative` marks Nearby Wi-Fi `neverForLocation`. The official Cast plugin owns init and the pinned framework version.

## Run

```powershell
npm install
npm run build:offline-map
npm run typecheck
npx expo install --check
npm run android
npx expo export --platform ios
npm run test:leagues
npm run test:team-engine
npm run test:imports
npm run test:team:android:all
npm run test:team:android -- --team mlb-5 --scenario live
npm run test:team:android:get-video -- --team ncaa-66
npm run test:team:server
npm run test:playback:cast-discovery
npm run test:playback:android:cast-web
npm run test:playback:android:shell-fix
npm run test:provisioning-warning
npm run test:app-update
npm run test:offline-map
npm run test:tv-location
npm run test:tv-location:android
npm run test:scoreboards
cd android
.\gradlew.bat app:assembleRelease
```

Metro answers Android packager requests with a single JavaScript body. The emulator client cannot load Metro's multipart packager stream.

Use `npm run ios` on macOS to create a native iPhone build. `npx expo export --platform ios` validates the production iOS JavaScript bundle on Windows. The local Android release APK is generated at `android/app/build/outputs/apk/release/app-release.apk`.

The checked-in offline map already runs without a network connection. `npm run build:offline-map` refreshes the generated U.S. place, state, and interstate data from the official 2025 U.S. Census sources. `npm run build:offline-map -- --reuse-json` rebuilds `assets/offline-us-map.html` from the committed JSON and the page template `scripts/offline-us-map.template.html` without downloading.

## Build configuration

- `app.json` contains shared Android and iOS native settings, including native video and cleartext-media transport support. `app.config.js` overlays the GitHub release tag onto version, versionCode, and buildNumber when `RELEASE_TAG` is set. The tag must be `vMAJOR.MINOR.PATCH` with digits only and minor and patch from 0 to 99 (`hub/releaseVersion.js`); any other value fails the build.
- `modules/danner-app-update/` is an Android-only local Expo module that downloads a GitHub release APK, verifies SHA-256, and opens the system installer. It is absent from iPhone builds.
- `modules/danner-provisioning-profile/` is an iOS-only local Expo module that reads `ExpirationDate` from the embedded signing profile. It is absent from Android builds.
- `modules/danner-live-hls/` relays a sports web player's own HLS, DASH, or MP4 stream from a phone origin for Cast.
- `eas.json` retains internal-distribution development, preview, and production profiles; Android profiles produce APKs. Family iPhones use SideStore and a free dedicated Apple Account instead of paid ad hoc distribution.
- `metro.config.js` packages the generated offline HTML map as an app asset.
- `android/` and `ios/` are generated locally and ignored.

Android native metadata uses package `com.example.location_helper`, minimum SDK 29, and compile and target SDK 36. Release builds set version and versionCode from the GitHub tag. Local builds without `RELEASE_TAG` stay version `1.0` and code 1.

Delivery is direct-to-device only. Android uses a signed APK. Each iPhone receives an IPA through SideStore, which renews the free seven-day development signature over any working Wi-Fi connection. LocalDevVPN comes from the Apple App Store and does not consume a SideStore app slot; SideStore and Danner Apps are the two sideloaded apps. Cellular data alone does not satisfy SideStore's refresh requirement. GitHub releases include the portable [iPhone setup card](../release/IPHONE_SETUP.md), `version-manifest.json`, and `sidestore-source.json`. The hub can offer an in-place Android install or a SideStore IPA handoff when a newer tag is published.
