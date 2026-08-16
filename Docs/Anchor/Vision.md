Status: ACTIVE
Phase: MVP

# Vision

## Product

Danner Apps is a cross-platform reconstruction and expansion of the original `Youtube Fix` APK for parents who can follow clear directions but do not want to manage developer settings or a separate GPS app. The logo-only main menu centers the Danner mark one-third down the screen and a compact module row two-thirds down. Its disabled Cleveland Guardians tile stays left for later work; its frequently used rightmost YouTube TV tile launches `TV Location`. Android and iPhone then use the same guided setup and open YouTube TV's current-playback-area verification page inside the app.

## Current experience

1. Confirm Tripoli, Iowa or choose another U.S. city or map point.
2. On the TV, open Profile, then Location, and leave the QR code visible.
3. Tap the single phone update action; the app advances YouTube's playback-area prompt, supplies the chosen map point, and returns to the steps page.
4. After the TV displays YouTube's `Welcome to...` message, return to the TV's main screen and select `Live` again.

The interface uses large type and controls, one highlighted current step, progress feedback, automatic scrolling to the next action, and automatic return to step 4 after phone verification. The map shows names rather than coordinates and saves the chosen point on the device.

## Platforms

- One Expo and React Native source tree
- Android package `com.example.location_helper`
- Android version `1.0`, version code 1, and minimum SDK 29
- iOS bundle `com.danner.locationhelper`

Both platforms inject the selected destination into the embedded verification page's browser Geolocation API. This creates a meaningful iPhone path without requiring either platform to replace its system location.

## Boundaries

- The app does not modify device location or implement a system mock-location provider.
- The app does not request foreground or background location permission.
- The bundled map covers the 50 states, District of Columbia, and Puerto Rico with offline place search, state outlines, and major highways; it does not contain neighborhood streets or satellite imagery.
- The selected coordinates are supplied only inside the WebView opened at `https://tv.youtube.com/verify` and its sign-in redirects.
- Google and YouTube can still apply account, network, device, and service-side location rules outside the browser Geolocation API.
