Status: ACTIVE
Phase: MVP

# Validation

Last updated: 2026-08-16

| Check | Status | Evidence |
|-------|--------|----------|
| TypeScript | Pass | `npm run typecheck` |
| Expo package compatibility | Pass | `npx expo install --check` |
| npm advisory scan | Review | `npm audit` reports 19 transitive Expo, React Native, Metro, and Xcode-tooling advisories; its proposed automatic fixes downgrade the compatible framework stack and were not applied |
| Expo platform config | Pass | Public config reports `Danner Apps` on Android and iOS with no location permission configured |
| Android prebuild | Pass | Expo generated the ignored native project |
| Android standalone release APK | Pass | Gradle `app:assembleRelease` completed 367 tasks and embedded the production JavaScript bundle |
| Standalone emulator launch | Pass | Release APK opened the Danner app hub on Pixel 7 API 34 with Metro stopped and no listener on port 8081 |
| Parent-friendly app hub | Pass | At 1080 by 2400, the 210dp logo remains centered at one-third usable-screen height; the 101.2dp tiles render 265 px wide with a 74 px gap, a centered row, and centers at the two-thirds target |
| YouTube TV hub tile | Pass | The requested locally bundled artwork fills the active rightmost tile and opens `TV Location` |
| Guardians placeholder | Pass | The requested official winged-baseball artwork fills the left tile at full color; Android accessibility reports it disabled and tapping it leaves the menu unchanged |
| Parent-friendly guided home | Pass | Large cards, progress, current-step emphasis, completion, retry, and QR-code instructions render at 1080 by 2400 |
| Simplified step 3 | Pass | Installed release hierarchy and capture show only `Update on this phone` and the `Update the TV location` button, with no explanatory or bridge-status copy |
| TV-specific step 4 | Pass | Installed release says the `Welcome to...` message appears on the TV before returning to the TV main screen and selecting `Live` |
| Automatic step navigation | Pass | Steps 1 through 4 each scroll their next active action into the visible viewport |
| Verification scroll restoration | Pass | Android Back returned from step 3 to the step 4 area instead of resetting the guided page to the top |
| Offline U.S. map generation | Pass | Generator produced 50 states plus DC and Puerto Rico, 5,413 interstate lines, and 32,350 named places in a 1.58 MiB dataset |
| Offline map packaging | Pass | Android and iOS production exports both include the 1.7 MB generated HTML map asset |
| Offline map operation | Pass | Standalone release opened and rendered the map after Wi-Fi and mobile data were disabled |
| U.S.-scale map readability | Pass | The national view renders the 50 states, DC, Puerto Rico, major-city labels, and interstate lines without neighborhood or satellite detail |
| Nationwide city search | Pass | Offline search returned Los Angeles variants and moved the pin to `Los Angeles, California` |
| Named-place persistence | Pass | Los Angeles was saved, the app was force-stopped, and `Los Angeles, California` was restored after relaunch |
| Tripoli reset | Pass | `Use Tripoli default` restored `Tripoli, Iowa` and its internal point after the persistence test |
| Device location isolation | Pass | Release manifest contains no fine, coarse, or background location permission; live verification displayed no system location prompt |
| YouTube TV verification page | Pass | Standalone WebView loaded Google sign-in from `https://tv.youtube.com/verify` and completed account two-step approval |
| Location bridge readiness | Pass | Signed-in validation emitted the internal ready event with Tripoli selected; the interface intentionally does not display it |
| YouTube geolocation request | Pass | Signed-in validation emitted the internal request event before YouTube accepted the Tripoli point |
| YouTube area result | Pass | YouTube accepted the injected pair and displayed `Welcome to the Cedar Rapids/Waterloo/Dubuque area` |
| YouTube `Next` automation and return | Review | The embedded script limits activation to `tv.youtube.com` pages containing the playback-area prompt and an exact `Next` control, observes automatic or manual activation, then returns to step 4 after 800 ms; target-device and TV validation remains |
| Android Back navigation | Pass | Hardware Back returned from verification and highlighted step 4 with confirm and retry actions |
| Cross-platform production export | Pass | Expo export bundled 606 iOS modules and 607 Android modules, including both hub logos and the same offline map asset |
| Requested artwork terms | Review | The supplied Vecteezy page labels its YouTube TV artwork attribution-required and editorial-use-only; the source and author are recorded in the art documentation for this owner-directed build |
| iOS native build | Pending | EAS CLI reports `Not logged in`; requires an Expo account plus Apple signing, or macOS with Apple signing |
| Physical iPhone and TV | Pending | Requires a signed iPhone build and confirmation of automatic step return plus the target TV's welcome and reloaded-channel results |

## Android release artifact checked

- Package: `com.example.location_helper`
- Version: `1.0`, code 1
- Minimum SDK: 29
- Target and compile SDK: 36
- App label: `Danner Apps`
- Release APK size: 84,264,784 bytes
- Release APK SHA-256: `762DBC4A04F2EA4F57B5AA1FB9C537AEBD2BF673E8D716A1DBE5972E3E65204D`
- Generated path: `app/android/app/build/outputs/apk/release/app-release.apk`
- Signing: generated development keystore for local validation; production signing remains pending

The generated `app/android/` directory is intentionally ignored and can be regenerated from `app.json`.

## Current behavior confirmed

- Android and iOS share the Danner app hub, `TV Location` flow, offline map, and verification implementation.
- Tripoli is the default; searched cities and dropped map points persist with their nearest-place label across launches.
- The bundled map covers the 50 states, District of Columbia, and Puerto Rico without map-network access or satellite imagery.
- The app does not launch Fake GPS, modify device sensors, or request location permission.
- Verification replaces browser geolocation inside the WebView with the saved pair.
- Android live testing proves that YouTube requested and accepted the selected Tripoli coordinates.
