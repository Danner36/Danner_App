Status: ACTIVE
Phase: MVP

# Stack

## Runtime

- Expo SDK 57
- React Native 0.86
- React 19.2
- TypeScript 6
- One managed source project for Android and iOS

## Native integrations

- `expo-video` plays approved direct HTTPS media, or an explicitly opted-in HTTP source, through the platform-native Android and iOS media stacks with caching disabled.
- `react-native-webview` hosts isolated approved Guardians player pages with exact-host navigation and popup interception, plus YouTube TV verification and its browser-level coordinate injection. Cleartext page navigation and mixed HTTP resources are enabled only for a source that sets `allowInsecureHttp: true`.
- A second isolated WebView renders the bundled canvas-based U.S. map and performs local city search without an online map service.
- `@react-native-async-storage/async-storage` persists the selected map point and the last valid GitHub Guardians source document.
- `expo-asset` installs and opens the generated offline map HTML on Android and iOS.
- `react-native-safe-area-context` preserves readable system-bar insets.
- `expo-status-bar`, `expo-navigation-bar`, and `expo-system-ui` keep light system chrome.
- `expo-splash-screen` uses the Danner launcher art on `#F7F7F2`.
- `expo-build-properties` sets Android minimum, compile, and target SDK versions and enables the native cleartext-traffic capability. The source allowlist still rejects HTTP unless the individual entry opts in.
- `modules/danner-provisioning-profile/` is an Apple-only local Expo module. Its Swift implementation extracts the embedded provisioning plist and returns the real `ExpirationDate`; the menu checks again whenever the app becomes active and once per minute while open.

iOS declares ATS media, WebView, and local-network exceptions so opted-in home-network sources can load, plus the local-network usage message displayed by iOS. These native capabilities do not bypass the app's per-source validation or exact-host navigation gate.

The app has no location library, no Android intent launcher, no mock-location native module, and no configured Android or iOS location permission.

## Identifiers

| Platform | Identifier |
|----------|------------|
| Android | `com.example.location_helper` |
| iOS | `com.danner.locationhelper` |

Android uses version name `1.0`, version code 1, minimum SDK 29, and compile and target SDK 36.

## Source layout

| Path | Role |
|------|------|
| `app/App.tsx` | Danner app hub, module navigation, guided home, destination storage, browser injection, and verification view |
| `guardians_streams.json` | Owner-edited, GitHub-hosted playback dates, game numbers, URLs, HTTP opt-ins, and trusted redirect hosts |
| `app/GuardiansScreen.tsx` | MLB data retrieval, today/live promotion, countdown, delay state, source refresh and cache, schedule, and video player |
| `app/guardiansSources.ts` | Strict source-document schema, date and game-number matching, playback types, host rules, and URL validation |
| `app/OfflineUsMap.tsx` | Offline map template, canvas interaction, place search, and native message bridge |
| `app/app.json` | Android and iOS native configuration |
| `app/eas.json` | Existing internal-distribution development, preview, and production profiles; Android outputs APK while the selected family-iPhone delivery path is SideStore |
| `app/modules/danner-provisioning-profile/` | iOS embedded-profile expiration reader used by the final-48-hour main-menu warning |
| `app/metro.config.js` | Adds generated HTML to Metro's packaged asset types |
| `app/scripts/build-offline-map.mjs` | Rebuilds compact nationwide map data from official Census sources |
| `app/assets/` | Expo launcher, splash, sub-app logo, and generated offline map assets |
| `app/android/` | Locally generated and ignored native project |
| `release/` | Required GitHub release set and portable iPhone first-install and recovery card linking to official LocalDevVPN, SideStore, iLoader, and Danner release locations |
| `reference/` | Legacy APK and its technical inventory |
| `tests/guardians/` | Development-only simulated live game, remote test links, local server, and Android runner |

## Commands

Run from `app/`:

```powershell
npm install
npm run build:offline-map
npm run typecheck
npx expo install --check
npm run android
npm run ios
npx expo export --platform ios
npm run test:guardians:android
npm run test:guardians:android:ready
npm run test:guardians:android:delayed
npm run test:guardians:android:live
npm run test:provisioning-warning
cd android
.\gradlew.bat app:assembleRelease
```

`npm run ios` requires macOS for a native simulator or device build. The intended family-device route is an IPA installed and renewed through SideStore with a free dedicated Apple Account. SideStore requires Wi-Fi for renewal, but the phone does not need to be on the owner's home network; cellular data alone is insufficient.

The app is distributed only by direct installation. The local Gradle release uses the generated development keystore and is suitable for emulator or internal validation. Generate a stable signed APK for Android and a device IPA for SideStore before delivery. A Danner GitHub release contains both artifacts and `release/IPHONE_SETUP.md`; the guide points to official third-party download locations instead of duplicating their binaries. LocalDevVPN is installed from the Apple App Store and does not consume a free SideStore app slot. SideStore and Danner Apps consume two sideloaded app slots. The iPhone renewal automation and real profile warning require physical-device validation; no Danner app-store artifact or submission is part of this project.
