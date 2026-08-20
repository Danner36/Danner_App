# app

Shared Expo SDK 57 `Danner Apps` project for Android and iPhone.

## Behavior

- Opens on a logo-only hub with the 210dp Danner mark centered one-third down the usable screen and a centered row of 101.2dp tiles two-thirds down. Guardians is active on the left; the frequently used YouTube TV tile is rightmost.
- On SideStore-signed iPhones, reads the real provisioning-profile expiration and shows a two-line warning above the Danner mark only during the final 48 hours. The warning directs the parent to connect to Wi-Fi and charge the phone.
- Loads the Guardians season record, today's or an active game, score, and only remaining games from MLB, with one-minute and pull-to-refresh updates.
- Promotes today's game above the schedule, counts down every second, states delays directly, and enables approved icon-only Play controls 15 minutes before game time.
- Fetches approved playback URLs from root `guardians_streams.json` on GitHub on screen open and every minute, with the last valid file cached on the phone. Entries match normal dates and MLB game numbers; one URL can cover multiple dates.
- Keeps completed games out of the schedule and formats start times in the phone's time zone.
- Uses HTTPS by default; cleartext HTTP requires `allowInsecureHttp: true` on that entry. Direct media uses the native player, while YouTube and other approved pages use isolated WebViews that promote approved popup targets and discard all others.
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
npm run test:guardians:android
npm run test:guardians:android:ready
npm run test:guardians:android:delayed
npm run test:guardians:android:live
npm run test:provisioning-warning
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
