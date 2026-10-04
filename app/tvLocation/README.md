# tvLocation

Four-step YouTube TV location setup, bundled nationwide map, and verification WebView.

## Behavior

- Guides a parent through four large, highlighted setup cards.
- Defaults to Tripoli, Iowa and provides a bundled nationwide map with offline city search, state outlines, and major highways.
- Displays and saves the nearest city or town while retaining the selected point internally. Among the places whose area-sized radius covers the pin, the closest relative to its radius names it; a major city's fixed radius names a pin only when no other place covers it, so a suburb keeps its own name. A pin more than 80 km from every place reads `Near <place>`. City search matches place names, lists each name once per state, and choosing Tripoli selects the exact default point.
- Injects the selected coordinates into the verification WebView's browser Geolocation API on Android and iPhone, including `Geolocation.prototype` and `Permissions.prototype.query`, so references a page saved earlier also get the selected point.
- Does not change device GPS, request location permission, or depend on an external Fake GPS app.
- Keeps step 3 to one `Update the TV location` action with no technical bridge copy.
- Opens YouTube TV verification with Google sign-in redirects and shared cookies. Top-level pages stay on https `youtube.com` and `google.com` hosts; other links and app schemes are dropped without opening anything.
- Activates an enabled `Next` on the playback-area prompt and returns to step 4 only after `Next` is followed by a page change on `tv.youtube.com`. Closing verification by hand returns to step 3 with a retry note, and a failed load shows a Retry button.
- Instructs the parent to wait for the welcome message on the TV before reopening `Live` on the TV.
- Android hardware back closes verification when that view is open, dismisses the map picker through the system modal, and otherwise returns to the hub.
