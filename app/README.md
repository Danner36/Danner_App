# app

Shared Expo SDK 57 `Danner Apps` project for Android and iPhone.

`App.tsx` is the thin shell: SafeArea, status bar, and a switch among the hub, Guardians, Patriots, and TV Location. Product screens live in sibling folders. `guardians_streams.json` and `patriots_streams.json` stay at the repository root so phones keep fetching `.../main/` those files.

## Folders

- `hub/` is the logo-only main menu, the iPhone signing-warning text, and the GitHub-release update prompt.
- `guardians/` is the Cleveland Guardians dashboard and authorized players.
- `patriots/` is the New England Patriots dashboard and authorized players.
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
npm run test:guardians:android
npm run test:guardians:android:ready
npm run test:guardians:android:delayed
npm run test:guardians:android:final
npm run test:guardians:android:live
npm run test:guardians:snapshot
npm run test:guardians:android:live-hls
npm run test:guardians:android:get-video
npm run test:guardians:server
npm run test:patriots:android
npm run test:patriots:android:ready
npm run test:patriots:android:delayed
npm run test:patriots:android:final
npm run test:patriots:android:live
npm run test:patriots:snapshot
npm run test:patriots:android:get-video
npm run test:patriots:server
npm run test:provisioning-warning
npm run test:app-update
npm run test:offline-map
cd android
.\gradlew.bat app:assembleRelease
```

Metro answers Android packager requests with a single JavaScript body. The emulator client cannot load Metro's multipart packager stream.

Use `npm run ios` on macOS to create a native iPhone build. `npx expo export --platform ios` validates the production iOS JavaScript bundle on Windows. The local Android release APK is generated at `android/app/build/outputs/apk/release/app-release.apk`.

The checked-in offline map already runs without a network connection. `npm run build:offline-map` refreshes the generated U.S. place, state, and interstate data from the official 2025 U.S. Census sources.

## Build configuration

- `app.json` contains shared Android and iOS native settings, including native video and cleartext-media transport support. `app.config.js` overlays the GitHub release tag onto version, versionCode, and buildNumber when `RELEASE_TAG` is set.
- `modules/danner-app-update/` is an Android-only local Expo module that downloads a GitHub release APK, verifies SHA-256, and opens the system installer. It is absent from iPhone builds.
- `modules/danner-provisioning-profile/` is an iOS-only local Expo module that reads `ExpirationDate` from the embedded signing profile. It is absent from Android builds.
- `modules/danner-live-hls/` captures the on-screen Guardians web player into a local HLS origin for Cast.
- `eas.json` retains internal-distribution development, preview, and production profiles; Android profiles produce APKs. Family iPhones use SideStore and a free dedicated Apple Account instead of paid ad hoc distribution.
- `metro.config.js` packages the generated offline HTML map as an app asset.
- `android/` and `ios/` are generated locally and ignored.

Android native metadata uses package `com.example.location_helper`, minimum SDK 29, and compile and target SDK 36. Release builds set version and versionCode from the GitHub tag. Local builds without `RELEASE_TAG` stay version `1.0` and code 1.

Delivery is direct-to-device only. Android uses a signed APK. Each iPhone receives an IPA through SideStore, which renews the free seven-day development signature over any working Wi-Fi connection. LocalDevVPN comes from the Apple App Store and does not consume a SideStore app slot; SideStore and Danner Apps are the two sideloaded apps. Cellular data alone does not satisfy SideStore's refresh requirement. GitHub releases include the portable [iPhone setup card](../release/IPHONE_SETUP.md), `version-manifest.json`, and `sidestore-source.json`. The hub can offer an in-place Android install or a SideStore IPA handoff when a newer tag is published.
