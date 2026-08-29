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

- `expo-video` plays approved direct HTTPS media, or an explicitly opted-in HTTP source, through the platform-native Android and iOS media stacks with caching disabled. iPhone native controls include AirPlay for those URLs.
- `react-native-google-cast` supplies a Cast button for `direct` Guardians sources. The default receiver `CC1AD845` loads the JSON playback URL. `web` sources use a header TV control that live-converts the on-screen player through `modules/danner-live-hls/` and then Cast of that local playlist on Android and iPhone. `youtube` sources stay phone-only.
- `react-native-webview` hosts isolated approved Guardians player pages with exact-host navigation and popup interception, plus YouTube TV verification and its browser-level coordinate injection. Cleartext page navigation and mixed HTTP resources are enabled only for a source that sets `allowInsecureHttp: true`. Isolated `web` entries load the exact JSON page URL with no player-library detection. On iPhone those pages enable WKWebView AirPlay and opt in HTML5 video and audio tags; YouTube embeds are not injected.
- A second isolated WebView renders the bundled canvas-based U.S. map and performs local city search without an online map service.
- `@react-native-async-storage/async-storage` persists the selected map point and the last valid GitHub Guardians source document.
- `expo-asset` installs and opens the generated offline map HTML on Android and iOS.
- `react-native-safe-area-context` preserves readable system-bar insets.
- `expo-status-bar` and `expo-navigation-bar` keep light system chrome. `expo-system-ui` is listed in `package.json` and is unused by app source.
- `expo-splash-screen` uses the Danner launcher art on `#F7F7F2`.
- `expo-build-properties` sets Android minimum, compile, and target SDK versions and enables the native cleartext-traffic capability. The source allowlist still rejects HTTP unless the individual entry opts in.
- `modules/danner-provisioning-profile/` is an Apple-only local Expo module. Its Swift implementation extracts the embedded provisioning plist and returns the real `ExpirationDate`; the menu reads it at launch and whenever the app becomes active. A one-minute timer only advances the displayed remaining time.
- `modules/danner-live-hls/` is a local Expo module on Android and iPhone. It captures decoded frames from the web player, encodes H.264 and AAC, and serves `live.m3u8` on the first free port in 8108–8127. The phone stays the origin. Android uses MediaProjection and a `mediaProjection` foreground service. iOS uses ReplayKit and VideoToolbox. The TV control Casts that playlist; it does not start an AirPlay player during capture.

iOS declares ATS media, WebView, and local-network exceptions so opted-in home-network sources can load, plus the local-network usage message displayed by iOS and `UIBackgroundModes` audio for AirPlay routing. These native capabilities do not bypass the app's per-source validation or exact-host navigation gate.

The app has no location library, no Android intent launcher, and no mock-location native module. Android Cast discovery uses Nearby Wi-Fi and, on older Android, fine location. TV Location does not read device GPS.

## Identifiers

| Platform | Identifier |
|----------|------------|
| Android | `com.example.location_helper` |
| iOS | `com.danner.locationhelper` |

Android uses version name `1.0`, version code 1, minimum SDK 29, and compile and target SDK 36.

## Source layout

| Path | Role |
|------|------|
| `app/App.tsx` | Thin shell: SafeArea, status bar, and hub / Guardians / TV Location switch |
| `app/hub/` | Logo-only menu and iPhone signing-warning text |
| `app/guardians/` | MLB data retrieval, today/live/recap promotion, countdown, delay state, source refresh and cache, Get video, Listen, Cast/TV send, schedule, and video player |
| `app/tvLocation/` | Guided home, destination storage, bundled map, browser injection, and verification view |
| `guardians_streams.json` | Owner-edited, GitHub-hosted playback dates, game numbers, URLs, HTTP opt-ins, and trusted redirect hosts |
| `app/app.json` | Android and iOS native configuration |
| `app/eas.json` | Existing internal-distribution development, preview, and production profiles; Android outputs APK while the selected family-iPhone delivery path is SideStore |
| `app/modules/danner-provisioning-profile/` | iOS embedded-profile expiration reader used by the final-48-hour main-menu warning |
| `app/modules/danner-live-hls/` | Live conversion of the on-screen web player into a local HLS origin for Cast |
| `app/metro.config.js` | Adds generated HTML to Metro's packaged asset types |
| `app/scripts/build-offline-map.mjs` | Rebuilds compact nationwide map data from official Census sources |
| `app/assets/` | Expo launcher, splash, sub-app logo, and generated offline map assets |
| `app/android/` | Locally generated and ignored native project |
| `workers/guardians-get-video/` | Cloudflare Worker that checks the family PIN, starts the stream pipeline, and can serve `GET /streams` |
| `.github/workflows/release.yml` | Tag-triggered Android and iPhone builds plus GitHub Release publication after both artifacts pass |
| `.github/workflows/guardians-stream-pipeline.yml` | Get video extract job, started by `repository_dispatch` type `guardians-get-video` |
| `tests/guardians/` | Repo-only today/ready/delayed/live/final/get-video/live-HLS harness |
| `release/` | Required GitHub release set and portable iPhone first-install and recovery card linking to official LocalDevVPN, SideStore, iLoader, and Danner release locations |
| `reference/` | Legacy APK and its technical inventory |
| `tests/offline-map/` | Pin coordinates, city labels, and offline city search against the bundled Census place list |

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
npm run test:guardians:snapshot
npm run test:guardians:android:final
npm run test:guardians:android:live-hls
npm run test:guardians:android:get-video
npm run test:guardians:server
npm run test:provisioning-warning
npm run test:offline-map
cd android
.\gradlew.bat app:assembleRelease
```

`npm run ios` requires macOS for a native simulator or device build. The intended family-device route is an IPA installed and renewed through SideStore with a free dedicated Apple Account. SideStore requires Wi-Fi for renewal, but the phone does not need to be on the owner's home network; cellular data alone is insufficient.

The app is distributed only by direct installation. The local Gradle release uses the generated development keystore and is suitable for emulator or internal validation. A pushed `v*` tag builds an Android APK and unsigned iPhone device IPA on GitHub-hosted platform toolchains. SideStore applies the free Apple Account signature when it installs the IPA. The release is created only after both builds succeed and contains both artifacts, checksums, and `release/IPHONE_SETUP.md`. The guide points to official third-party download locations instead of duplicating their binaries. LocalDevVPN is installed from the Apple App Store and does not consume a free SideStore app slot. SideStore and Danner Apps consume two sideloaded app slots. The iPhone renewal automation and real profile warning require physical-device validation; no Danner app-store artifact or submission is part of this project.
