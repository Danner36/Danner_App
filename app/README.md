# app

Shared Expo SDK 57 `Danner Apps` project for Android and iPhone.

`App.tsx` is the thin shell: SafeArea, status bar, and a switch among the hub, Guardians, and TV Location. Product screens live in sibling folders. `guardians_streams.json` stays at the repository root so phones keep fetching `.../main/guardians_streams.json`.

## Folders

- `hub/` is the logo-only main menu and the iPhone signing-warning text.
- `guardians/` is the Cleveland Guardians dashboard and authorized players.
- `tvLocation/` is the four-step YouTube TV location flow and bundled map.
- `modules/` holds native Expo modules only, not product screens.
- `assets/` holds shared logos, splash art, and the generated offline map HTML.
- `scripts/` rebuilds the offline map data.
- `plugins/` holds Expo config plugins.

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
npm run test:guardians:android:live
npm run test:provisioning-warning
npm run test:offline-map
cd android
.\gradlew.bat app:assembleRelease
```

Use `npm run ios` on macOS to create a native iPhone build. `npx expo export --platform ios` validates the production iOS JavaScript bundle on Windows. The local Android release APK is generated at `android/app/build/outputs/apk/release/app-release.apk`.

The checked-in offline map already runs without a network connection. `npm run build:offline-map` refreshes the generated U.S. place, state, and interstate data from the official 2025 U.S. Census sources.

## Build configuration

- `app.json` contains shared Android and iOS native settings, including native video and cleartext-media transport support.
- `modules/danner-provisioning-profile/` is an iOS-only local Expo module that reads `ExpirationDate` from the embedded signing profile. It is absent from Android builds.
- `eas.json` retains internal-distribution development, preview, and production profiles; Android profiles produce APKs. Family iPhones use SideStore and a free dedicated Apple Account instead of paid ad hoc distribution.
- `metro.config.js` packages the generated offline HTML map as an app asset.
- `android/` and `ios/` are generated locally and ignored.

Android native metadata uses package `com.example.location_helper`, version `1.0`, code 1, minimum SDK 29, and compile and target SDK 36.

Delivery is direct-to-device only. Android uses a signed APK. Each iPhone receives an IPA through SideStore, which renews the free seven-day development signature over any working Wi-Fi connection. LocalDevVPN comes from the Apple App Store and does not consume a SideStore app slot; SideStore and Danner Apps are the two sideloaded apps. Cellular data alone does not satisfy SideStore's refresh requirement. GitHub releases include the portable [iPhone setup card](../release/IPHONE_SETUP.md) with official installation and recovery links.
