Status: ACTIVE
Phase: MVP

# Playback

## Destination

The app has no built-in location. A phone with no saved point shows `No location chosen yet` on step 1 with `Choose on map`, and `Use this location` stays hidden, so steps 2 through 4 cannot start.

The map picker is a large, bundled U.S. map. A parent can drag the map under a fixed pin, tap a point, zoom, show the full U.S. view, or search the offline list of 32,350 cities and towns. The map contains state outlines and major interstate lines, with no satellite layer or neighborhood-street download. With no saved point it opens on the contiguous U.S. with nothing selected, and `Save this location` stays disabled until a pan, tap, `U.S.` button, or search result selects a place. The selected point is labeled with its nearest place and state; latitude and longitude remain internal.

The phone stores two points in AsyncStorage, each as `{label, latitude, longitude}`:

| Key | Value | Written by | Removed by |
|---|---|---|---|
| `danner.tv.default.v1` | The default point | The first save; `Make this my default` | `Forget location` |
| `danner.destination.v1` | The point YouTube receives | Any picker save; `Use my default` | `Forget location` |

A phone holding only the current point keeps it, and that point is written once as the default, so every point saved before the default existed carries forward. A phone holding only the default uses it as the current point. An unreadable value counts as absent and shows `The saved location could not be loaded. Choose a location.`

Once a default exists, the picker offers `Use this map location`, plus `Use my default (<label>)` and `Make this my default` when the selected point differs from the default. Step 1 shows `Use my default (<label>)` beside `Change map location` when the current point differs from the default.

The generated map asset uses the official 2025 U.S. Census national Places Gazetteer and TIGERweb state and interstate geometry. It covers the 50 states, District of Columbia, and Puerto Rico and runs without network access.

Changing the destination after verification moves the flow back to phone verification and clears completion, because the new coordinates have not been submitted.

## Guided flow

The home screen contains four ordered cards:

1. `Choose the location` picks or confirms the named map location YouTube should receive.
2. `Get the TV ready` directs the parent to YouTube TV, Profile, and Location, then leaves the displayed QR code on screen.
3. `Update on this phone` shows only the `Update the TV location` action. It opens the embedded verification page, automatically activates YouTube's `Next` control on the playback-area prompt, supplies the selected point, and returns to the steps page after `Next` is activated.
4. `Reload the Live guide` waits for the TV's `Welcome to...` message, then directs the parent to the YouTube TV main screen on the TV and `Live` to reload channels.

Only the current step displays its action. Completing an action marks that card done, advances the progress bar, and scrolls the next highlighted card into view. Activating YouTube's exact `Next` control automatically returns to the guided page and advances to step 4. Android hardware Back and the visible `Steps` control provide the same manual return behavior. `Start over` returns to step 1 and keeps the location.

## On this phone

A panel below step 4, with no step number, holds what belongs to this phone rather than to one run through the steps:

- A status line: `Signed in on this phone`, `Not signed in on this phone`, or `Sign-in status is not available`. It is derived from whether Google's session cookie names are present and never reads their values.
- `Sign in` when signed out or unknown; `Switch account` and `Sign out` when signed in or unknown.
- `Default: <label>` and `Forget location`, which after a confirmation removes both keys and returns to step 1.

Each person signs in to their own YouTube TV account on Google's own pages inside the app. The app has no credential fields, stores no password or cookie value, and never shows the account email. Google's pages handle 2-Step and device prompts. Passkeys are not expected to work in the embedded WebView, so the panel directs the person to `Try another way`.

`Sign in` opens `https://tv.youtube.com/verify`, and `Switch account` opens Google's account chooser with a `tv.youtube.com` continue target. Both stay inside the verification page's navigation limits and carry no injected script. The view returns to the steps 800 ms after reaching `tv.youtube.com` from `accounts.google.com`. When the view lands on Google's refusal page for embedded browsers, the app closes it and shows `Google blocked sign-in inside the app for this account.`

`Sign out` asks for confirmation and leaves the location and steps unchanged; the TV stays signed in. On Android it clears every WebView cookie and all web storage in the app, because the platform has no per-domain delete. Team players do not rely on stored cookies. On iPhone it removes Google and YouTube data only.

## Browser geolocation

Step 3 opens `https://tv.youtube.com/verify` in an in-app WebView with HTTPS redirects and shared cookies. Before and after a `youtube.com` page loads, the app installs a browser-level geolocation implementation with the selected coordinates. Google account pages never receive it.

- `navigator.geolocation.getCurrentPosition`
- `navigator.geolocation.watchPosition`
- `navigator.geolocation.clearWatch`
- geolocation responses from `navigator.permissions.query`

Coordinate-bridge diagnostics are not displayed in the interface. Native WebView geolocation is disabled, so the site does not fall through to the phone's actual sensor location. The app requests no Android or iOS location permission and does not change device GPS. Android Cast uses Nearby Wi-Fi marked `neverForLocation`.

The browser override covers the Geolocation API exposed to the embedded page. YouTube and Google may also evaluate account state, IP address, device signals, or service-side rules, so a real signed-in account and TV remain the final acceptance test.

Google help: [Manage home area or current location](https://support.google.com/youtubetv/answer/7129768).
