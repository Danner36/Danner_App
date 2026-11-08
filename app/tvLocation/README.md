# tvLocation

Four-step YouTube TV location setup, bundled nationwide map, and verification WebView.

## Behavior

- Guides a parent through four large, highlighted setup cards.
- Has no built-in location. First use shows `No location chosen yet` and hides `Use this location`, so steps 2-4 cannot start. The bundled nationwide map opens on the contiguous U.S. with nothing selected, and `Save this location` waits for a pan, tap, `U.S.` button, or search result.
- Stores two points with AsyncStorage: the default (`danner.tv.default.v1`) and the point YouTube receives (`danner.destination.v1`). `resolveTvLocation` reads both; a phone holding only the current point keeps it and that point is written once as the default. `Use my default (<label>)` and `Make this my default` appear when a point differs from the default.
- Displays and saves the nearest city or town while retaining the selected point internally. Among the places whose area-sized radius covers the pin, the closest relative to its radius names it; a major city's fixed radius names a pin only when no other place covers it, so a suburb keeps its own name. A pin more than 80 km from every place reads `Near <place>`. City search matches place names, lists each name once per state, and returns the Census point unless the name equals the saved point's label.
- The `On this phone` panel below step 4 has no step number. It shows the sign-in state from Google session cookie names, `Sign in` when signed out or unknown, `Switch account` and `Sign out` when signed in or unknown, `Default: <label>`, and `Forget location`, which removes both points after a confirmation.
- `AccountView` opens Google's own sign-in or account chooser in a WebView with no injection and no message bridge, and returns 800 ms after reaching `tv.youtube.com` from `accounts.google.com`. Google's embedded-browser refusal closes it with a message. No credential is entered into, stored by, or read by the app.
- Injects the selected coordinates into the verification WebView's browser Geolocation API on Android and iPhone, including `Geolocation.prototype` and `Permissions.prototype.query`, so references a page saved earlier also get the selected point. The script returns at once on any host other than `youtube.com` and `*.youtube.com`.
- Does not change device GPS, request location permission, or depend on an external Fake GPS app.
- Keeps step 3 to one `Update the TV location` action with no technical bridge copy.
- Opens YouTube TV verification with Google sign-in redirects and shared cookies. Top-level pages stay on https `youtube.com` and `google.com` hosts; other links and app schemes are dropped without opening anything.
- Activates an enabled `Next` on the playback-area prompt and returns to step 4 only after `Next` is followed by a page change on `tv.youtube.com`. Closing verification by hand returns to step 3 with a retry note, and a failed load shows a Retry button.
- Instructs the parent to wait for the welcome message on the TV before reopening `Live` on the TV.
- Android hardware back closes verification or the account view when one is open, dismisses the map picker through the system modal, and otherwise returns to the hub.
- On Android, writes the WebView cookie store to disk every 20 seconds while a YouTube or Google page is open, when the app leaves the foreground, and when that page closes, through `modules/danner-webview-cookies/`, so the Google sign-in survives a swiped-away app. iPhone keeps `sharedCookiesEnabled` and has no flush call.
- The verification and account WebViews never set `incognito`, because Android implements it by clearing every WebView cookie in the app.
