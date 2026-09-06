Status: ACTIVE
Phase: MVP

# Validation

Last updated: 2026-09-05

| Check | Status | Evidence |
|-------|--------|----------|
| TypeScript | Pass | `npm run typecheck` |
| Expo package compatibility | Pass | `npx expo install --check` reports dependencies are up to date after the 57.0.18 / RN 0.86.3 patch bump |
| npm advisory scan | Review | `npm audit` reports 19 transitive Expo, React Native, Metro, and Xcode-tooling advisories; its proposed automatic fixes downgrade the compatible framework stack and were not applied |
| Expo platform config | Pass | Source `app.json` reports `Danner Apps` on Android and iOS, blocks fine and coarse location, keeps Nearby Wi-Fi plus capture permissions for Cast, Android `REQUEST_INSTALL_PACKAGES` for in-app APK updates, and iOS ATS media, WebView, local-network exceptions, local-network usage description, and `sidestore` query scheme |
| Android prebuild | Pass | 2026-08-29 local `npx expo prebuild --platform android --no-install`: manifest blocks fine and coarse location with `tools:node="remove"`, Nearby Wi-Fi has `neverForLocation`, one official Cast `onCreate`, and `play-services-cast-framework` pinned at 21.5.0 |
| Android standalone release APK | Pass | Gradle `assembleRelease` completed and embedded the production JavaScript bundle |
| Standalone emulator launch | Pass | Release APK opened the Danner app hub on Pixel 7 API 34 with Metro stopped and no listener on port 8081 |
| Parent-friendly app hub | Review | Source now uses a two-row 2×2 grid (Guardians, Patriots, Cyclones, YouTube TV) centered on the two-thirds line. The last device pass predates the Cyclones tile |
| iPhone signing warning implementation | Pass | The Apple-only local Expo module resolves as pod `DannerProvisioningProfile`, extracts the embedded plist `ExpirationDate`, and returns no value when a profile is absent; the menu reads the profile at launch and on foregrounding; a one-minute timer only advances the displayed remaining time |
| iPhone signing warning state tests | Pass | Repository-only assertions cover no profile, invalid profile time, more than 48 hours, exactly 48 hours, one day, hourly, final-hour, and expired messages without packaging test controls or fixtures into the app |
| iPhone signing warning presentation | Review | Source positions the final-48-hour two-line warning above the unchanged one-third-positioned Danner logo and says `Connect to Wi-Fi and charge phone to fix`; an actual expiring SideStore profile is still required for iPhone visual confirmation |
| Android signing-warning isolation | Review | Source still hides the warning on Android. The last release APK hierarchy had the Danner logo and two module tiles; the two-row hub plus Patriots tile needs a new install to re-confirm |
| SideStore profile renewal and warning reset | Pending | Requires a physical iPhone signed through SideStore to prove that a locked-phone charger automation renews both profiles and that Danner Apps reads the renewed expiration after returning to the foreground |
| YouTube TV hub tile | Review | Source places the bundled artwork under Patriots in row 2 and still opens `TV Location`. The last device pass predates that move |
| Guardians hub tile | Review | Source keeps the winged-baseball artwork in row 1 left; the last device pass was the previous single-row left tile |
| Patriots hub tile | Pass | Pixel emulator `emulator-5554` development harness opened `New England Patriots` from the hub and reached the live Patriots card |
| Guardians live-data response | Pass | The installed release returned Cleveland's 61-66 record, today's San Francisco matchup at 1:10 PM Eastern, and the remaining schedule on 2026-08-20 |
| Guardians featured game and schedule | Pass | Today's game was promoted above the schedule; filtering removed completed and featured games and sorted all retained games by MLB start timestamp |
| Guardians post-game recap selection | Pass | Snapshot tests: live and later-today beat recap; today's Final is featured; completed games stay out of the schedule; recap ends after the local official date |
| Guardians post-game recap presentation | Pending | Featured card WIN/LOSS/TIE, score, and decision line without park board or Play; needs harness `final` or a completed gameday on a device |
| Guardians today countdown | Pass | The standalone release displayed `TODAY`, `STARTS IN`, a one-second 2-hour countdown, and `Video starts 15 minutes before game time.` with no early Play control |
| Guardians local times and refresh | Pass | The screen formats MLB UTC timestamps through the device locale, fetches MLB on mount, pull-to-refresh, and every 10 minutes, fetches source data every 60 seconds, and exposes pull-to-refresh plus retry |
| Guardians Android interaction | Pass | Installed release rendered the current featured game, record, and Eastern-time schedule at 1080 by 2400, showed no harness controls, and ran with Metro stopped |
| Guardians source schema | Pass | Parser checks accepted all six required fields, ignored the in-stream placeholder example, matched one URL across multiple dates and doubleheader numbers, rejected missing or extra fields, rejected HTTP without an entry opt-in, and required no owner-entered MLB identifier or source name. Root-level `HOW_TO_GUIDE` is editor text only; the phone does not render it |
| Guardians GitHub source retrieval | Pass | Production bundles contain the raw `main/guardians_streams.json` URL; the screen checks on open, pull-to-refresh, and every 60 seconds, tries Worker `GET /streams` first when that origin is set, uses an 8-second timeout per attempt so a slow first source cannot abort the fallbacks, and stores the last valid production document for offline fallback. A later list with no featured-game match does not wipe a URL the phone already has |
| Guardians authorized-source gate | Pass | Only a valid `direct`, `youtube`, or `web` entry whose `gameDates` and `gameNumbers` match the featured MLB game can create a Watch action; HTTPS is the default and HTTP requires `allowInsecureHttp: true` on that entry |
| Guardians live-game harness isolation | Pass | Fixture JSON, HTTP proxy path, remote Apple HLS sample, MLB YouTube ID, popup-test page text, synthetic game identifiers, and emulator harness URL are absent from the Android and iOS production exports and the release APK |
| Guardians simulated live state | Pass | Development harness rendered `LIVE`, Guardians 4, Detroit 2, `Top 5th`, four icon-only Play controls, record, and remaining schedule on Pixel 7 API 34 |
| Guardians simulated today state | Pass | Development harness rendered a game 45 minutes away with a one-second countdown and the 15-minute message while hiding every Watch action |
| Guardians simulated ready state | Pass | Development harness rendered a game 10 minutes away with its countdown and four icon-only Play controls |
| Guardians simulated delayed state | Pass | Development harness rendered `DELAYED`, `Delayed Start`, and `The game is delayed.` with no countdown or premature Watch action |
| Guardians native direct playback | Pass | Both the remote HTTPS HLS fixture and the fixed local HTTP HLS proxy played in `expo-video` with native controls and no webpage or JavaScript; Close returned to the live card |
| Guardians isolated YouTube playback | Pass | The official MLB archive played through the privacy-enhanced embed after the script-free app-origin wrapper supplied YouTube's required referrer; Close returned to the live card |
| Guardians approved-page isolation | Pass | Web playback is incognito and disables files, file bridging, location, shared and third-party cookies, and downloads while limiting top-level navigation to exact configured hosts; cleartext navigation and mixed content remain disabled unless the selected source opts in |
| Guardians popup and redirect gate | Pass | On the opted-in HTTP test page, Pixel 7 API 34 retained the original player after unapproved popup and redirect requests, promoted an approved popup into the same isolated player, and followed its approved redirect; the official HTTPS MLB YouTube archive continued playing afterward |
| Guardians production live playback | Review | Root `guardians_streams.json` holds dated `web` entries for 2026-08-20, 08-25, 08-26, and 08-28 plus the inactive example. Play still requires a date- and game-number match for the featured game. The 2026-08-29 featured game has no matching URL in that file |
| Guardians Get video | Pass | Source POSTs `{ pin }` to the Worker, then polls Worker `/streams`, raw-by-commit SHA, then raw `main` for up to 5 minutes. Pixel 7 API 34 development harness showed Getting video then Play without restart. Live Worker `/streams` returned 200 after the 2026-09-01 Worker deploy |
| Patriots live-data and snapshot | Pass | Repository snapshot tests cover featured live/today/recap selection, regular-season record ignoring preseason, Time TBA, ESPN event parse (scheduled contests map to `Scheduled` rather than ESPN kickoff `detail`), Eastern official date `2026-09-09` for kickoff `2026-09-10T00:20Z`, and ESPN schedule `{ value, displayValue }` scores |
| Patriots dashboard | Review | Pixel emulator Get video harness reached the live featured card and Get video. Separate today, ready, delayed, and Final scenario launches were not run |
| Patriots source schema | Pass | Parser reuses the Guardians six-field checks against root `patriots_streams.json` (guide plus inactive example only) |
| Patriots GitHub source retrieval | Pass | Source tries Worker `GET /streams?module=patriots` first when that origin is set, then raw `main`, with last-valid cache. Live Worker `GET /streams?module=patriots` returned 200 after the 2026-09-01 Worker deploy |
| Patriots Get video | Pass | 2026-08-29 Pixel emulator `emulator-5554`: `npm run test:patriots:android:get-video` posted `{ pin, module: "patriots" }`, polled `/streams?module=patriots` on port 8112, and showed Play after publish without restart |
| Cyclones hub tile | Pass | 2026-09-04 Pixel emulator `emulator-5554` Get video harness opened `Iowa State Cyclones` from the hub row-2 tile and reached the live Cyclones card |
| Cyclones live-data and snapshot | Pass | 2026-09-05: `npm run test:cyclones:snapshot` covers featured live/today/recap across sports, regular-season records ignoring preseason, Chicago official date `2026-09-05` for kickoff `2026-09-05T17:00Z`, elimination versus awaiting-next, streams that require `sport`, and ESPN schedule `{ value, displayValue }` scores (SEMO Final parses as WIN 38–10, not TIE 0–0). Live ESPN schedule `401856779` parsed the same way. |
| Cyclones dashboard | Review | Pixel emulator Get video harness reached the live featured card and Get video. Separate today, ready, delayed, and Final scenario launches were not run |
| Cyclones source schema | Pass | Parser requires the six Guardians fields plus `sport` against root `cyclones_streams.json` (guide plus inactive example only) and rejects same-day entries for a different sport |
| Cyclones GitHub source retrieval | Pass | Source tries Worker `GET /streams?module=cyclones` first when that origin is set, then raw `main`, with last-valid cache. Live Worker `GET /streams?module=cyclones` returned 200 after the 2026-09-04 Worker deploy and `cyclones_streams.json` on `main` |
| Cyclones Get video | Pass | 2026-09-04 Pixel emulator `emulator-5554`: `npm run test:cyclones:android:get-video` posted `{ pin, module: "cyclones", sport: "football" }`, polled `/streams?module=cyclones` on port 8113, and showed Play after publish without restart |
| Guardians Listen and TV send | Pass | Source: Listen is `direct` only; header Cast loads the JSON URL for `direct` without forcing MPEG-TS; header TV relays a page-reported HLS, DASH, or MP4 URL from a phone origin and reports a failure when a page offers none. Cast load is keyed by client plus media so a later session is not skipped. `test:guardians:cast-discovery` covers the URL gate; `test:guardians:android:cast-web` exercises the relay TV path. 2026-09-03 on a live `gooz.aapmains.net` game with v1.4.7: Android Cast to Living Room TV played the relayed page stream, and iPhone AirPlay played the same page stream. The screen-capture converter is archived unbuilt under `reference/screen-capture-hls/`. The Android relay foreground service and the player keep-awake are new in v1.4.8 and need a physical pass |
| Guardians TV send transport gates | Pass | 2026-09-02 measured against a live provider stream: the master and variant playlists answer 403 without the player page as `Referer` and 403 for a receiver's own `Origin`, and the pre-signed object-store segments answer 200 with no `Access-Control-Allow-Origin`. A receiver therefore cannot load the page URL directly, which is why the phone relays both playlists and passes the segments through with CORS |
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
| Device location isolation | Pass | Pixel 7 API 34 `dumpsys package` lists Nearby Wi-Fi, Record Audio, and Post Notifications and does not list fine or coarse location. Send to TV showed those three system prompts only; after Deny the player showed `TV send needs permission.` |
| YouTube TV verification page | Pass | Standalone WebView loaded Google sign-in from `https://tv.youtube.com/verify` and completed account two-step approval |
| Location bridge readiness | Pass | Signed-in validation emitted the internal ready event with Tripoli selected; the interface intentionally does not display it |
| YouTube geolocation request | Pass | Signed-in validation emitted the internal request event before YouTube accepted the Tripoli point |
| YouTube area result | Pass | YouTube accepted the injected pair and displayed `Welcome to the Cedar Rapids/Waterloo/Dubuque area` |
| YouTube `Next` automation and return | Review | The embedded script limits activation to `tv.youtube.com` pages containing the playback-area prompt and an exact `Next` control, observes automatic or manual activation, then returns to step 4 after 800 ms; target-device and TV validation remains |
| Android Back navigation | Pass | Hardware Back returned from verification and highlighted step 4 with confirm and retry actions |
| Guardians Android Back | Pass | Pixel 7 API 34 live harness: Play opened `Close video`; hardware Back returned to the live card with Play still visible; the next Back returned to the hub tiles |
| Cross-platform production export | Review | Source now also packages the Patriots screen and logo. The last export pass predates that module |
| Requested artwork terms | Review | The supplied Vecteezy page labels its YouTube TV artwork attribution-required and editorial-use-only; the source and author are recorded in the art documentation for this owner-directed build |
| Direct-install configuration | Pass | Tag-triggered GitHub jobs build the Android APK and unsigned iPhone device IPA on their native toolchains; SideStore applies the dedicated free Apple Account signature during iPhone installation |
| Portable iPhone recovery links | Pass | `release/IPHONE_SETUP.md` points to LocalDevVPN, SideStore, iLoader, Apple 64-bit iTunes, and Danner releases; third-party binaries are not copied into the repository |
| Physical iPhone SideStore via iLoader | Pass | 2026-08-28: Windows iLoader `v2.3.1` plus Apple website iTunes installed Apple Mobile Device Support; after Trust, iLoader listed `Danners USB` (iOS 26.6) and `Install SideStore (Stable)` completed |
| Physical iPhone Danner Apps IPA via iLoader | Pass | 2026-08-28: GitHub `v1.3.0` `Danner-Apps-iOS.ipa` imported over USB; iLoader reported `Operation completed` and staged `PublicStaging/DannerApps.app` |
| Physical iPhone LocalDevVPN and SideStore refresh | Pass | 2026-08-28: LocalDevVPN connected on Wi-Fi; SideStore signed in; `My Apps` showed SideStore and Danner Apps each at `7 DAYS` after SideStore `+` of `Danner-Apps-iOS.ipa`. iLoader USB install alone did not list Danner Apps in SideStore. Charger automation `Refresh SideStore` ran once at 12:26: on-screen all-apps-refreshed, LocalDevVPN connected then disconnected |
| Physical iPhone hub open | Pass | 2026-08-28: Danner Apps opened to the logo hub with Guardians left and TV Location right; Guardians loaded live MLB data; TV Location opened from the right tile |
| Physical iPhone and TV | Pending | Requires the target iPhone to validate profile parsing, silent SideStore renewal over any working Wi-Fi, automatic step return, and the target TV's welcome and reloaded-channel results |
| iOS native module discovery | Pass | Expo autolinking resolves package `danner-provisioning-profile`, pod `DannerProvisioningProfile`, Swift module `DannerProvisioningProfile`, and class `DannerProvisioningProfileModule` only for Apple |
| iOS native build | Pass | GitHub's macOS job generated the native project, built the unsigned Release device app with Xcode, packaged a valid IPA archive, and uploaded it for SideStore installation |
| GitHub release publication | Pass | Latest published family tag is [`v1.4.10`](https://github.com/Danner36/Danner_App/releases/tag/v1.4.10) (2026-09-05). It contains the APK, IPA, iPhone setup guide, SHA-256 checksum file, `version-manifest.json`, and `sidestore-source.json` after both platform jobs passed |
| Release version bake | Pass | `app.config.js` sets `expo.version`, Android `versionCode`, and iOS `buildNumber` from `RELEASE_TAG` (`v1.4.10` → `1.4.10` / `10410`). Local builds without that env stay `1.0` / 1 |
| App update version tests | Pass | `npm run test:app-update` covers semver compare, trailing-garbage tag rejection, trusted HTTPS GitHub asset URLs, manifest parse, signing-warning suppression, session dismiss, SideStore install URL encoding, and `release/build-update-assets.mjs` output |
| Android in-app APK update | Review | Source downloads the release APK over trusted GitHub redirects, verifies SHA-256, and commits a `PackageInstaller` session. The download status clears when the system Update sheet appears. Physical Yes → system Update sheet is still required |
| iPhone SideStore update handoff | Review | Source opens `sidestore://install?url=` for the release IPA and does not present that prompt after leaving the hub. Physical LocalDevVPN + SideStore install is still required |

## Android identifiers

- Package: `com.example.location_helper`
- Version: local/default `1.0`, code 1; release builds use the GitHub tag (`v1.4.10` → name `1.4.10`, code `10410`)
- Minimum SDK: 29
- Target and compile SDK: 36
- App label: `Danner Apps`
- Signing: Expo-generated debug keystore used by the direct family APK; store-grade signing is outside this direct-delivery scope

The generated `app/android/` directory is intentionally ignored and can be regenerated from `app.json` plus `app.config.js`.

## GitHub release artifacts checked

- Release: [Danner Apps v1.4.10](https://github.com/Danner36/Danner_App/releases/tag/v1.4.10)
- Android asset: `Danner-Apps-Android.apk`
- Android asset size: 95,067,134 bytes
- Android SHA-256: `d7c35e09c3790f7aa69e15fb69d1ac9a7267ab90d58d516b26f0c97204202061`
- iPhone asset: `Danner-Apps-iOS.ipa`
- iPhone asset size: 11,966,825 bytes
- iPhone SHA-256: `af1963a6d230cfa59dd7912ba356a448d45f49a98d4a8bd288b662a146e9257a`
- Setup asset: `IPHONE_SETUP.md`
- Integrity asset: `SHA256SUMS.txt`
- Update assets: `version-manifest.json`, `sidestore-source.json`
- Release state: published; not draft; not prerelease

## Current behavior confirmed

- Android and iOS share the Danner app hub, Guardians, Patriots, and Cyclones dashboards and players, `TV Location` flow, offline map, and verification implementation. `v1.4.10` includes the Cyclones tile and reads ESPN `{value, displayValue}` scores so a Final recap shows the real score. Phones on `v1.4.9` and earlier need that update.
- Opening Guardians fetches current MLB data and root `guardians_streams.json`; today's, a live, or today's completed game receives its own featured card and is omitted from the remaining schedule.
- Opening Patriots fetches leftover ESPN NFL games and root `patriots_streams.json`. Official dates are America/New_York. Get video POSTs `{ pin, module: "patriots" }` to the shared Worker. The hero record stays `0–0` until a regular-season game is Final.
- Opening Cyclones fetches leftover ESPN NCAA football, men's basketball, and women's basketball games and root `cyclones_streams.json`. Official dates are America/Chicago. Get video POSTs `{ pin, module: "cyclones", sport }` to the shared Worker. Each sport record stays `0–0` until that sport's first regular-season Final.
- Today's scheduled game counts down every second. A live game refreshes its park-style scoreboard every five seconds. Icon-only Play controls become eligible 15 minutes before game time. Missing video states that it is not ready and continues checking each minute. Get video appears when the worker origin and family PIN are in the build.
- Play appears when a date- and game-number-matched URL is already in `guardians_streams.json`. That file already has dated production `web` entries plus the inactive example. HTTPS works by default; an HTTP source must opt in explicitly.
- Direct media bypasses webpage execution and can offer Listen and Cast. `web` sources use an isolated WebView and can offer TV send of a page-reported media URL or captured playlist. YouTube stays phone-only. An HTTP opt-in does not relax popup, redirect, file, cookie, or download gates.
- Test fixtures and test media URLs remain outside production artifacts, and the release build restored MLB data with no simulated live card or test buttons.
- Tripoli is the default; searched cities and dropped map points persist with their nearest-place label across launches.
- The bundled map covers the 50 states, District of Columbia, and Puerto Rico without map-network access or satellite imagery.
- The app does not launch Fake GPS, modify device sensors, or request location permission. Android Cast uses Nearby Wi-Fi marked `neverForLocation`. Send to TV starts capture only after the requested grants succeed.
- Android hardware Back on Guardians closes the Play modal when it is open, then returns to the hub.
- Verification replaces browser geolocation inside the WebView with the saved pair.
- Android live testing proves that YouTube requested and accepted the selected Tripoli coordinates.
- Distribution is direct-to-device only: a signed APK for Android and a SideStore-compatible IPA for iPhone. Latest published family tag is `v1.4.10`, which also publishes `version-manifest.json` and `sidestore-source.json`. A `v1.4.9` hub can offer an in-place Android install or a SideStore IPA handoff for `v1.4.10`. SideStore renewal can use any working Wi-Fi network; cellular data alone is not supported by its current documentation.
