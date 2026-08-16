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

- `react-native-webview` hosts YouTube TV verification and receives the browser-level coordinate injection.
- A second isolated WebView renders the bundled canvas-based U.S. map and performs local city search without an online map service.
- `@react-native-async-storage/async-storage` persists the selected label, latitude, and longitude.
- `expo-asset` installs and opens the generated offline map HTML on Android and iOS.
- `react-native-safe-area-context` preserves readable system-bar insets.
- `expo-status-bar`, `expo-navigation-bar`, and `expo-system-ui` keep light system chrome.
- `expo-splash-screen` uses the Danner launcher art on `#F7F7F2`.
- `expo-build-properties` preserves the original Android minimum SDK while using current compile and target SDKs.

The app has no location library, no Android intent launcher, no mock-location native module, and no configured Android or iOS location permission.

## Identifiers

| Platform | Identifier |
|----------|------------|
| Android | `com.example.location_helper` |
| iOS | `com.danner.locationhelper` |

Android keeps the recovered version name `1.0`, version code 1, and minimum SDK 29. Compile and target SDK 36 replace the APK's SDK 33 build target so the reconstruction uses the maintained Android toolchain.

## Source layout

| Path | Role |
|------|------|
| `app/App.tsx` | Danner app hub, guided home, destination storage, browser injection, and verification view |
| `app/OfflineUsMap.tsx` | Offline map template, canvas interaction, place search, and native message bridge |
| `app/app.json` | Android and iOS native configuration |
| `app/eas.json` | Development, preview APK, and production build profiles |
| `app/metro.config.js` | Adds generated HTML to Metro's packaged asset types |
| `app/scripts/build-offline-map.mjs` | Rebuilds compact nationwide map data from official Census sources |
| `app/assets/` | Expo launcher, splash, sub-app logo, and generated offline map assets |
| `app/android/` | Locally generated and ignored native project |
| `reference/` | Original APK and recovered facts |

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
cd android
.\gradlew.bat app:assembleRelease
```

`npm run ios` requires macOS for a native simulator or device build. EAS can build the iOS binary remotely from the same source.

The local Gradle release uses the generated development keystore and is suitable for emulator or internal validation. Generate a production-signed Android artifact and iOS build through the production signing workflow before distribution.
