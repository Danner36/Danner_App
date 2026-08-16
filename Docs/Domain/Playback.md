Status: ACTIVE
Phase: MVP

# Playback

## Destination

Tripoli, Iowa is the default destination, using the internal point published in the [2024 U.S. Census Gazetteer](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_gaz_place_19.txt):

```text
Latitude:  42.808371
Longitude: -92.2578433
```

`Change map location` opens a large, bundled U.S. map. A parent can drag the map under a fixed pin, tap a point, zoom, show the full U.S. view, or search the offline list of 32,350 cities and towns. The map contains state outlines and major interstate lines, with no satellite layer or neighborhood-street download. The selected point is labeled with its nearest place and state; latitude and longitude remain internal. The label and point are stored with AsyncStorage and restored on later launches. `Use Tripoli default` restores Tripoli before saving.

The generated map asset uses the official 2025 U.S. Census national Places Gazetteer and TIGERweb state and interstate geometry. It covers the 50 states, District of Columbia, and Puerto Rico and runs without network access.

Changing the destination after verification moves the flow back to phone verification and clears completion, because the new coordinates have not been submitted.

## Guided flow

The home screen contains four ordered cards:

1. `Choose the location` confirms the named map location YouTube should receive.
2. `Get the TV ready` directs the parent to YouTube TV, Profile, and Location, then leaves the displayed QR code on screen.
3. `Update on this phone` shows only the `Update the TV location` action. It opens the embedded verification page, automatically activates YouTube's `Next` control on the playback-area prompt, supplies the selected point, and returns to the steps page after `Next` is activated.
4. `Reload the Live guide` waits for the TV's `Welcome to...` message, then directs the parent to the YouTube TV main screen on the TV and `Live` to reload channels.

Only the current step displays its action. Completing an action marks that card done, advances the progress bar, and scrolls the next highlighted card into view. Activating YouTube's exact `Next` control automatically returns to the guided page and advances to step 4. Android hardware Back and the visible `Steps` control provide the same manual return behavior.

## Browser geolocation

Step 3 opens `https://tv.youtube.com/verify` in an in-app WebView with HTTPS redirects and shared cookies. Before and after the page loads, the app installs a browser-level geolocation implementation with the selected coordinates:

- `navigator.geolocation.getCurrentPosition`
- `navigator.geolocation.watchPosition`
- `navigator.geolocation.clearWatch`
- geolocation responses from `navigator.permissions.query`

Coordinate-bridge diagnostics are not displayed in the interface. Native WebView geolocation is disabled, so the site does not fall through to the phone's actual sensor location. The app requests no Android or iOS location permission and does not change device GPS.

The browser override covers the Geolocation API exposed to the embedded page. YouTube and Google may also evaluate account state, IP address, device signals, or service-side rules, so a real signed-in account and TV remain the final acceptance test.

Google help: [Manage home area or current location](https://support.google.com/youtubetv/answer/7129768).
