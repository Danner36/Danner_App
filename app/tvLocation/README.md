# tvLocation

Four-step YouTube TV location setup, bundled nationwide map, and verification WebView.

## Behavior

- Guides a parent through four large, highlighted setup cards.
- Defaults to Tripoli, Iowa and provides a bundled nationwide map with offline city search, state outlines, and major highways.
- Displays and saves the nearest city or town while retaining the selected point internally. City search matches place names, not every town in a state, and a pin inside a large city keeps that city name instead of a bordering suburb.
- Injects the selected coordinates into the verification WebView's browser Geolocation API on Android and iPhone.
- Does not change device GPS, request location permission, or depend on an external Fake GPS app. Android Cast location permission lives on the Guardians TV send path, not in this flow.
- Keeps step 3 to one `Update the TV location` action with no technical bridge copy.
- Opens YouTube TV verification with Google sign-in redirects, shared cookies, automatic `Next` activation on the playback-area prompt, and automatic return to step 4 after `Next` is activated.
- Instructs the parent to wait for the welcome message on the TV before reopening `Live` on the TV.
- Android hardware back closes verification when that view is open, dismisses the map picker through the system modal, and otherwise returns to the hub.
