# app

Shared Expo SDK 57 `Danner Apps` project for Android and iPhone.

## Behavior

- Opens on a logo-only hub with the 210dp Danner mark centered one-third down the usable screen and a centered row of 101.2dp tiles two-thirds down. Guardians is inactive on the left; the frequently used YouTube TV tile is rightmost.
- Guides a parent through four large, highlighted setup cards.
- Defaults to Tripoli, Iowa and provides a bundled nationwide map with offline city search, state outlines, and major highways.
- Displays and saves the nearest city or town while retaining the selected point internally.
- Injects the selected coordinates into the verification WebView's browser Geolocation API on Android and iPhone.
- Does not change device GPS, request location permission, or depend on an external Fake GPS app.
- Keeps step 3 to one `Update the TV location` action with no technical bridge copy.
- Opens YouTube TV verification with Google sign-in redirects, shared cookies, automatic `Next` activation on the playback-area prompt, and automatic return to step 4 after `Next` is activated.
- Instructs the parent to wait for the welcome message on the TV before reopening `Live` on the TV.

## Run

```powershell
npm install
npm run build:offline-map
npm run typecheck
npx expo install --check
npm run android
npx expo export --platform ios
cd android
.\gradlew.bat app:assembleRelease
```

Use `npm run ios` on macOS, or use EAS for a signed iOS build. `npx expo export --platform ios` validates the production iOS JavaScript bundle on Windows. The local Android release APK is generated at `android/app/build/outputs/apk/release/app-release.apk`.

The checked-in offline map already runs without a network connection. `npm run build:offline-map` refreshes the generated U.S. place, state, and interstate data from the official 2025 U.S. Census sources.

## Build configuration

- `app.json` contains shared Android and iOS native settings.
- `eas.json` contains development, preview APK, and production profiles.
- `metro.config.js` packages the generated offline HTML map as an app asset.
- `android/` and `ios/` are generated locally and ignored.

Android native metadata uses package `com.example.location_helper`, version `1.0`, code 1, minimum SDK 29, and compile and target SDK 36.
