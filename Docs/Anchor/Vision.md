Status: ACTIVE
Phase: MVP

# Vision

## Product

Danner Apps is a cross-platform collection of Danner family tools. The logo-only main menu centers the Danner mark one-third down the screen and a two-row 2×2 artwork grid on the two-thirds line. Cleveland Guardians and New England Patriots sit on the first row. YouTube TV launches `TV Location` from the cell under Guardians; the cell under Patriots is a reserved empty spacer. Android and iPhone share all three modules.

## Guardians experience

The Guardians screen retrieves the current record, today's or an active game, score, and remaining schedule whenever it opens. It refreshes that MLB snapshot every ten minutes, supports pull-to-refresh, omits completed games from the schedule, and presents all start times in the phone's time zone. Today's game is promoted above the schedule with a one-second countdown. After Final, the featured card stays as today's recap through local midnight of that official date. Delay states are explicit. A live game refreshes its park-style scoreboard every five seconds. Icon-only Play controls become eligible 15 minutes before game time and appear only for date- and game-number-matched entries fetched from root `guardians_streams.json` on GitHub. Get video starts the extract pipeline when that window is open, no match is stored, and the worker origin plus family PIN are in the build. Direct video uses the native player, with Listen and Cast on `direct` sources and TV capture on `web` sources. Approved player pages use an isolated WebView. HTTPS is the default, with a separate opt-in required on every cleartext HTTP source.

## Patriots experience

The Patriots screen retrieves leftover preseason, regular-season, and playoff games plus the regular-season record from ESPN whenever it opens. It refreshes that ESPN snapshot every ten minutes, supports pull-to-refresh, omits completed and featured games from the schedule, and presents all start times in the phone's time zone. Today's game is promoted above the schedule with a one-second countdown when the kickoff time is known, or `Time TBA` when it is not. After Final, the featured card stays as today's recap through local midnight of that official date. A live game refreshes a football scoreboard every five seconds. Icon-only Play controls become eligible 15 minutes before game time and appear only for date- and game-number-matched entries fetched from root `patriots_streams.json` on GitHub. Get video POSTs `{ pin, module: "patriots" }` to the same Cloudflare Worker and family PIN used by Guardians, then polls `GET /streams?module=patriots`. Direct video, Listen, Cast, TV capture, and isolated player pages follow the same rules as Guardians.

## Current experience

1. Confirm Tripoli, Iowa or choose another U.S. city or map point.
2. On the TV, open Profile, then Location, and leave the QR code visible.
3. Tap the single phone update action; the app advances YouTube's playback-area prompt, supplies the chosen map point, and returns to the steps page.
4. After the TV displays YouTube's `Welcome to...` message, return to the TV's main screen and select `Live` again.

The interface uses large type and controls, one highlighted current step, progress feedback, automatic scrolling to the next action, and automatic return to step 4 after phone verification. The map shows names rather than coordinates and saves the chosen point on the device.

## Platforms

- One Expo and React Native source tree
- Android package `com.example.location_helper`
- Android version and version code come from the GitHub release tag during the release build; local builds stay `1.0` / code 1; minimum SDK 29
- iOS bundle `com.danner.locationhelper`
- Direct installation through a signed Android APK or a SideStore-renewed iPhone IPA using a free dedicated Apple Account; no app-store delivery or paid Apple Developer membership

On iPhone, the hub reads the embedded development profile. During its final 48 hours, a short warning appears above the Danner logo and tells the parent to connect to Wi-Fi and charge the phone. Routine SideStore renewal is intended to run through a silent charger-triggered Shortcuts automation; physical-device validation remains required because iOS and SideStore control the background signing operation. When a newer GitHub release exists, the hub can ask to update: Android opens the system installer after downloading the APK; iPhone opens SideStore with the IPA URL.

Both platforms inject the selected destination into the embedded verification page's browser Geolocation API. This creates a meaningful iPhone path without requiring either platform to replace its system location.

## Boundaries

- Guardians video is limited to exact links in `guardians_streams.json`, matched to an MLB official date and game number. Patriots video is limited to exact links in `patriots_streams.json`, matched to the America/New_York official date and game number. HTTPS is the default, and cleartext HTTP must be enabled on the individual entry. Get video does not invent a URL on the phone; it starts the matching GitHub extract pipeline, then plays only a date-matched entry that lands in that file.
- The app does not modify device location or implement a system mock-location provider.
- The app does not request foreground or background location permission. TV Location does not read GPS. Android Cast uses Nearby Wi-Fi marked `neverForLocation`.
- The bundled map covers the 50 states, District of Columbia, and Puerto Rico with offline place search, state outlines, and major highways; it does not contain neighborhood streets or satellite imagery.
- The selected coordinates are supplied only inside the WebView opened at `https://tv.youtube.com/verify` and its sign-in redirects.
- Google and YouTube can still apply account, network, device, and service-side location rules outside the browser Geolocation API.
