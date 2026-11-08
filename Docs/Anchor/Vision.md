Status: ACTIVE
Phase: MVP

# Vision

Delivery phases that are not finished are in the approved [modular teams plan](../Production/ModularTeams.md).

## Product

Danner Apps is a cross-platform collection of Danner family tools. The logo-only main menu centers the Danner mark one-third down the screen and a grid of artwork tiles on the two-thirds line: the teams chosen on that phone, then YouTube TV, which launches `TV Location`, then `+`, which adds a team. A long press on a tile opens its move and remove actions. A family phone updated from `v1.x` starts with Cleveland Guardians, New England Patriots, and Iowa State Cyclones; a fresh install starts with only YouTube TV and `+`. Each sub-app remains self-contained with a clear way back to the menu. Android and iPhone share all features.

## Team experience

Every team tile opens the same team screen, fed by MLB statsapi or ESPN JSON through a league adapter. The picker offers MLB, NFL, NCAA football, NCAA men's basketball, and NCAA women's basketball; other leagues stay hidden until their probes and fixtures pass.

The screen retrieves the record, or one record per sport for a school, today's or an active game, score, and remaining schedule whenever it opens. It refreshes that snapshot every ten minutes, supports pull-to-refresh, omits completed and featured games from the schedule, and presents all start times in the phone's time zone. Today's game is promoted above the schedule with a one-second countdown when the start time is known, or `Time TBA` when it is not. A school tile gives each game today its own featured card: live games, then today's next games, then today's recaps. After Final, the featured card stays as today's recap through local midnight. Delay states are explicit. A live game refreshes a baseball, football, or basketball arena board every five seconds.

Icon-only Play controls become eligible 15 minutes before game time and appear only for entries in that team's `streams/<league>/<espnId>.json` that match the game. Get video appears in that window when the Worker URL and the app key are in the build: it asks the Cloudflare Worker to start the stream pipeline for that game, then polls until Play appears. Direct video uses the native player, with Listen and Cast on `direct` sources and a TV control on `web` sources that Casts a page-reported media URL relayed from the phone. Approved player pages use an isolated WebView. On iPhone those web pages report an Android Chrome user agent. HTTPS is the default, with a separate opt-in required on every cleartext HTTP source.

## TV Location experience

1. Choose a U.S. city or map point, or confirm the one saved on the phone.
2. On the TV, open Profile, then Location, and leave the QR code visible.
3. Tap the single phone update action; the app advances YouTube's playback-area prompt, supplies the chosen map point, and returns to the steps page.
4. After the TV displays YouTube's `Welcome to...` message, return to the TV's main screen and select `Live` again.

The interface uses large type and controls, one highlighted current step, progress feedback, automatic scrolling to the next action, and automatic return to step 4 after phone verification. The map shows names rather than coordinates and saves the chosen point on the device.

## Platforms

- One Expo and React Native source tree
- Android package `com.example.location_helper`
- Android version and version code come from the GitHub release tag during the release build; local builds stay `1.0` / code 1; minimum SDK 29
- iOS bundle `com.danner.locationhelper`
- Direct installation through a signed Android APK or a SideStore-renewed iPhone IPA using a free dedicated Apple Account; no app-store delivery. A paid Apple Developer path is Phase 1b of the plan and is not built

On iPhone, the hub reads the embedded development profile. During its final 48 hours, a short warning appears above the Danner logo and tells the parent to connect to Wi-Fi and charge the phone. Routine SideStore renewal is intended to run through a silent charger-triggered Shortcuts automation; physical-device validation remains required because iOS and SideStore control the background signing operation. When a newer GitHub release exists, the hub can ask to update: Android opens the system installer after downloading the APK; iPhone opens SideStore with the IPA URL.

Both platforms inject the selected destination into the embedded verification page's browser Geolocation API. This creates a meaningful iPhone path without requiring either platform to replace its system location.

## Boundaries

- Team video is limited to exact links in `streams/<league>/<espnId>.json`, matched to the game's event or official date and game number. HTTPS is the default, and cleartext HTTP must be enabled on the individual entry. Get video does not invent a URL on the phone; it starts the stream pipeline for that game, then plays only a matching entry that lands in that file.
- The app does not modify device location or implement a system mock-location provider.
- The app does not request foreground or background location permission. TV Location does not read GPS. Android Cast uses Nearby Wi-Fi marked `neverForLocation`.
- The bundled map covers the 50 states, District of Columbia, and Puerto Rico with offline place search, state outlines, and major highways; it does not contain neighborhood streets or satellite imagery.
- The selected coordinates are supplied only inside the WebView opened at `https://tv.youtube.com/verify` and its sign-in redirects.
- Google and YouTube can still apply account, network, device, and service-side location rules outside the browser Geolocation API.
