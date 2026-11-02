Status: ARCHIVED
Snapshot: 823d2be (2026-10-31)

# TV Location module (fixed YouTube TV tile with a baked Tripoli default)

`TV Location` was the fixed fourth hub tile (row 2 right, YouTube TV artwork). It walked a parent through four guided steps that changed YouTube TV's playback area: pick a point on a bundled offline U.S. map (default Tripoli, Iowa, compiled into the app and into the map page), get the TV's Location QR screen up, open `https://tv.youtube.com/verify` in an in-app WebView that injected the chosen coordinates into the browser Geolocation API and pressed YouTube's `Next`, then reload the TV's Live guide. Google sign-in happened inside that WebView on Google's own pages, and the session persisted in the platform WebView cookie store. This record pins every rule to commit `823d2be562d252c9f3b0da305275adc6d8498f55` (2026-10-31).

Permalink base: `https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/<path>#L<a>-L<b>`.

Related: [Hub.md](Hub.md) (tile, AsyncStorage, identity), [Guardians.md](Guardians.md) section 13.4 (the Android non-incognito rule in team players that protected this module's sign-in).

---

## 1. File inventory

| File | Lines | Role |
|---|---|---|
| `app/tvLocation/TvLocationScreen.tsx` | 1146 | `ActionButton`, `StepCard`, `DestinationSummary`, `MapPicker`, `GuidedHome` (four cards), `VerifyView` (YouTube WebView), exported `TvLocationScreen`, styles (`:788-1146`) |
| `app/tvLocation/destination.ts` | 70 | Storage key, `Destination` type, `TRIPOLI_DESTINATION`, stored-value validation |
| `app/tvLocation/geolocationInjection.ts` | 320 | Injected Geolocation/Permissions shim, `Next` automation, message bridge |
| `app/tvLocation/verifyNavigation.ts` | 38 | Top-frame host gate and `isVerifyPageUrl` |
| `app/tvLocation/OfflineUsMap.tsx` | 216 | Loads the bundled map HTML in a local-file WebView; passes the start point; receives selections |
| `app/tvLocation/offlineMapSelection.ts` | 224 | TypeScript mirror of the map page's selection rules; imported only by `tests/offline-map/run.mjs` |
| `app/tvLocation/README.md` | 17 | Tier README |
| `app/assets/offline-us-map.html` | 519 | Generated map page (template plus embedded data on line 89) |
| `app/assets/offline-us-map.json` | — | Generated map data (1,652,023 bytes) |
| `app/scripts/offline-us-map.template.html` | 519 | Map page source; identical to the generated HTML except line 89 |
| `app/scripts/build-offline-map.mjs` | 454 | Downloaded Census data and wrote the JSON and HTML |
| `app/modules/danner-webview-cookies/**` | — | Android-only `CookieManager.flush()` |
| `tests/offline-map/run.mjs` | 221 | Map parity, labels, search, and the Tripoli default |

---

## 2. Entry and state ownership

- Hub tile `accessibilityLabel="TV Location"`, hint `Opens the YouTube TV location setup`, art `youtube-tv-logo-vecteezy.jpg`, `resizeMode="cover"` (`app/hub/HubScreen.tsx:328-343`).
- Route: `setAppScreen('tv-location')`; the App fallback branch rendered `<TvLocationScreen onBackToMenu={openMenu} />` (`app/App.tsx:37,45-46`).
- State lived in `TvLocationScreen` (`app/tvLocation/TvLocationScreen.tsx:628-786`): `currentStep` (1–4, starts 1), `complete`, `destination` (starts `TRIPOLI_DESTINATION`), `mapPickerVisible`, `showVerify`, `message`, `verifyRetry`, plus refs for the home scroll offset and the step to focus on return.
- Only the destination persisted. Step progress reset every time the screen mounted.
- Android Back (`:677-711`): while verification was open, Back closed it (`closeVerify`); while the map picker was open, the system modal handled it; otherwise Back returned to the hub.

---

## 3. The Tripoli default and where it lived

Point: latitude `42.808371`, longitude `-92.2578433`, label `Tripoli, Iowa`, the internal point of Tripoli in the 2024 U.S. Census Gazetteer (`Docs/Domain/Playback.md:8-13`). It was the only destination compiled into the code; every other point came from the map picker and was saved on the phone.

| Location | What it did | Source |
|---|---|---|
| `TRIPOLI_DESTINATION` | `{ label: 'Tripoli, Iowa', latitude: 42.808371, longitude: -92.2578433 }` | `app/tvLocation/destination.ts:9-13` |
| `isTripoli` | `sameCoordinates(destination, TRIPOLI_DESTINATION)`; tolerance `< 0.0000001` on both axes | `destination.ts:37-46` |
| Stored-value canonicalization | any stored point equal to Tripoli returned `TRIPOLI_DESTINATION` (stored label ignored) | `destination.ts:59-61` |
| Initial screen state | `useState(TRIPOLI_DESTINATION)`; every mount started at Tripoli until AsyncStorage answered | `TvLocationScreen.tsx:635` |
| Map save | `onSave(isTripoli(draft) ? TRIPOLI_DESTINATION : draft)` | `TvLocationScreen.tsx:190-197` |
| `Use Tripoli default` button | `onSave(TRIPOLI_DESTINATION)`; the only reset | `TvLocationScreen.tsx:239-244` |
| Load-failure text | `The saved location could not be loaded. Tripoli is selected.` | `TvLocationScreen.tsx:655-657` |
| Map page `DEFAULT_START` | `{ latitude: 42.808371, longitude: -92.2578433, label: 'Tripoli, Iowa' }` inside `// BEGIN SELECTION RULES` … `// END SELECTION RULES` | `app/scripts/offline-us-map.template.html:107` (markers `:104`, `:211`); same line in `app/assets/offline-us-map.html:107` |
| Map page fallback start | `readStart()` used `DEFAULT_START` for any missing latitude, longitude, or label | template `:217-235` |
| Map page search | searching and choosing `Tripoli, Iowa` returned the exact default point instead of the quantized Census point | template `:203-210` |
| TypeScript mirror | `searchSelection(place, stateNames, defaultStart)` with the same exact-point rule | `app/tvLocation/offlineMapSelection.ts:208-224` |
| Test | `assert.deepEqual(shipped.DEFAULT_START, tripoliDefault)` and the Tripoli search assertions | `tests/offline-map/run.mjs:48-49,193-194,211-214` |
| Rule | "Default the selected destination to Tripoli, Iowa at `42.808371, -92.2578433`." | `AI_Framework/AI_RULES.md:44` |
| Docs | `Docs/Domain/Playback.md:8-15`, `Docs/Anchor/Vision.md:24`, `app/tvLocation/README.md:8-9`, `Docs/Production/Roadmap.md:22,32`, `Docs/Production/Validation.md:72,75-76,136,141` | — |

`app/scripts/build-offline-map.mjs` had no Tripoli reference; the default existed only in the template's selection rules. `reference/Apk_Inventory.md:35` recorded the legacy APK's `1. Fake GPS to Tripoli` button as history.

---

## 4. Destination storage

| Item | Value | Source |
|---|---|---|
| Key | `DESTINATION_STORAGE_KEY = 'danner.destination.v1'` | `destination.ts:1` |
| Format | `JSON.stringify({ label, latitude, longitude })` | `destination.ts:3-7`; write `TvLocationScreen.tsx:727-731` |
| Read | once per mount: `getItem` → `JSON.parse` → `destinationFromStored`; missing or invalid kept the Tripoli state silently; a thrown error showed the load-failure banner | `TvLocationScreen.tsx:643-658` |
| Validation | finite latitude in [-90, 90] and longitude in [-180, 180]; trimmed label, else `Saved map location`; Tripoli canonicalized | `destination.ts:15-35,48-70` |
| Write paths | only `saveDestination`, called from `Use this map location` and `Use Tripoli default` | `TvLocationScreen.tsx:713-739` |
| Not written | confirming step 1 (`Use this location`) only advanced the step | `TvLocationScreen.tsx:420-425,767` |
| Removal | none; no `removeItem` anywhere | — |

`saveDestination` side effects (`:713-739`): close the picker, clear the message; when the coordinates changed while on step 4 or after completion, return to step 3, clear completion and retry, and show `Map location changed. Run the phone update again.`; a failed write showed `The map location is selected for this session but could not be saved.`

A phone that never opened the map had no key at all and relied on the in-code default. The value survived Android in-place updates and SideStore reinstalls under the identity rules in [Hub.md](Hub.md) section 8.

---

## 5. The four-step flow (`GuidedHome`, `TvLocationScreen.tsx:252-494`)

Header (`:362-392`): `‹ Apps` (`accessibilityLabel="Return to Danner Apps"`), title `TV Location` (32pt, weight 800, `#15354A`), progress text `Step N of 4` or `All steps complete`, and a progress bar filled `#1F6F55` to `progress / 4` (progress = 4 when complete, else the current step).

Banners: completion (`accessibilityRole="alert"`) `You’re all done` / `The TV location update is complete.` (`:394-401`); a message banner for `message` (`:403-407`).

| Step | Title | Description | Actions shown only while current | Source |
|---|---|---|---|---|
| 1 | `Choose the location` | `Confirm the map location YouTube should receive. You can change it whenever you need to.` | Destination box `LOCATION YOUTUBE WILL RECEIVE` with the label and `Change map location` (secondary, always visible); `Use this location` → step 2 | `:409-427`, `DestinationSummary` `:147-165` |
| 2 | `Get the TV ready` | `On the TV, open YouTube TV. Select your profile picture, then Location. When the QR code appears, leave it on the screen.` | `The TV is ready` → step 3 | `:429-440` |
| 3 | `Update on this phone` | none, or after a failed attempt `The update did not finish. Keep the QR code on the TV and try again.` | `Update the TV location` → open verification | `:442-460` |
| 4 | `Reload the Live guide` | `After the TV says “Welcome to…” for the new location, return to the YouTube TV main screen on the TV and select Live again to reload the channels.` | `The new channels are showing` → complete; `Try phone verification again` (secondary) → verification; after completion `Start over` (secondary) | `:462-490` |

Card states (`StepCard`, `:87-144`): eyebrow `DONE` (number replaced by `✓`), `DO THIS NOW`, or `COMING NEXT`; `accessibilityLabel="Step N: <title>"`; the current card had a 3dp `#1F6F55` border and shadow (`:884-890`). Actions were 58dp minimum height (`:971-978`). Content column `maxWidth: 720` (`:797-801`).

Scrolling (`:285-347`): each card's layout offset was recorded; on a step change the view scrolled to that card minus 12dp after 180 ms; completion scrolled to the top; returning from verification restored the saved scroll offset and focused the step set in `homeFocusStep`.

`Start over` (`:741-746`) reset step, completion, retry, and message; the destination stayed.

---

## 6. Map picker and the offline U.S. map

### 6.1 Picker modal (`MapPicker`, `TvLocationScreen.tsx:167-250`)

- Slide-up `Modal`; header `Cancel` and title `Choose a map location`.
- Body `<OfflineUsMap destination={destination} onChange={setDraft} />` (the committed destination, not the draft, so the page reloaded only when the saved point changed).
- Footer `SELECTED AREA` and the draft label; `Use this map location` (busy while saving) and `Use Tripoli default` (secondary).
- The draft reset to the committed destination every time the picker opened.

### 6.2 Map component (`app/tvLocation/OfflineUsMap.tsx`)

- `require('../assets/offline-us-map.html')` (`:12`) through `Asset.loadAsync`, then the asset's `localUri` (`:26-43`). Load failure: `The offline map could not open.` / `Close the map and try again.`
- Start point passed three ways (`:45-78`): URL hash `#label=…&latitude=…&longitude=…`; `window.__DANNER_MAP_START = {label, latitude, longitude}` before content; `window.__dannerApplyStart(lat, lon, label)` after load.
- WebView (`:146-163`): `allowFileAccess`, `allowingReadAccessToURL={assetUri}`, `originWhitelist={['*']}`, scrolling off, `setSupportMultipleWindows={false}`. No network.
- Messages accepted only with `source: 'danner-offline-map'`; `ready` cleared the overlay (`Opening the offline map...` / `Cities and major roads are stored in the app.`); `selected` with a non-empty label and finite coordinates updated the draft (`:84-124`).

### 6.3 Map page (`app/scripts/offline-us-map.template.html`)

- Canvas map with a fixed green `#1f6f55` pin at the center, search box `Find a city or town`, zoom `+`/`-`, a `U.S.` button, help text `Move the map under the pin`, attribution `Offline map: U.S. Census Bureau, 2025` (`:72-86`).
- Web Mercator on a `65535` grid (`DATA.gridMax`), 256px tiles, initial `zoom = 8`, zoom range 2–11 (`:89-97`, `:422-425`).
- Selection fired only on a direct touch: pointer up or cancel (a tap without drag moved the center to the tap first), the `U.S.` button (fit the box 49.4,-124.8 to 24.4,-66.9), or a search result tap (`:444-504`). Initial load sent only `ready` (`:515-516`).
- Labeling rules (selection rules block, `:104-211`):
  - Place radius = `sqrt(ALAND / π) / 1000` km clamped to 1.5–40 km; a major place (sort score above `MAJOR_PLACE_SCORE = 1e12`) used a fixed `MAJOR_PLACE_RADIUS_KM = 18`.
  - Distance = equirectangular approximation × 111.32 km per degree.
  - Among places whose radius covered the pin, a non-major place beat a major one, then the smallest distance-to-radius ratio won, so a suburb kept its own name next to a big city.
  - With no covering place, the nearest place named the pin, prefixed `Near ` beyond `NEAR_LABEL_KM = 80`; with no place at all, `Selected map location`.
  - Label format `<place>, <state name>`.
- Search: at least 2 characters; names starting with the query, then names containing it; one result per name and state; at most 8 results. Choosing a result centered there (zoom at least 8) and sent `selected`.

### 6.4 Offline map build (`app/scripts/build-offline-map.mjs`)

| Item | Value | Source |
|---|---|---|
| Command | `npm run build:offline-map` (from `app/`); `-- --reuse-json` regenerated the HTML from the existing JSON without network | `app/package.json:11`; `:411-424` |
| Places | 2025 U.S. Census national Places Gazetteer, `2025_Gaz_place_national.zip` (fields `NAME`, `USPS`, `INTPTLAT`, `INTPTLONG`, `ALAND`) | `:6-7`, `:255-304` |
| Roads | TIGERweb `Transportation/MapServer/0` query (interstates) | `:8-9`, `:306-329` |
| States | TIGERweb `State_County/MapServer/0` query | `:10-11`, `:331-347` |
| Download header | `User-Agent: DannerApp offline map builder` | `:134-142` |
| Place tuple | `[name, stateIndex, x, y, sortScore]`, quantized to the grid; sort score = land area, or `1e18 − rank` for a fixed list of major cities (`MAJOR_PLACE_ORDER`, `MAJOR_PLACE_RANK`) | `:18-71`, `:285-300` |
| Fixed points | `REPRESENTATIVE_POINTS` for `Anchorage, AK` and `San Francisco, CA` | `:74-77` |
| Output | `offline-us-map.json`, and the HTML made by replacing `__OFFLINE_MAP_DATA__` (exactly once) with the JSON (every `<` written as the JSON escape for U+003C, backslash-u-003c, so the data could not close the script tag) | `:377-409` |
| Data at the snapshot | `version 1`, `vintage 2025`, `gridMax 65535`, 52 state names and outlines (50 states, DC, Puerto Rico), 5,413 road lines, 32,350 places | `app/assets/offline-us-map.json`; `Docs/Production/Validation.md:66` |

`app/metro.config.js:5-7` added `html` to Metro's asset extensions so the page could be required. Android and iOS production exports both carried the 1.7 MB HTML (`Docs/Production/Validation.md:67`).

---

## 7. Verification WebView (`VerifyView`, `TvLocationScreen.tsx:496-626`)

Header: `‹ Steps` (`accessibilityLabel="Return to the setup steps"`) and title `YouTube Verification`. Loading view `Opening YouTube…`; error view `YouTube did not open` / `Check that this phone is online, then tap Retry.` with `Retry`, which remounted the WebView with a new key (`:597-616`).

| Prop | Value | Source |
|---|---|---|
| `source` | `{ uri: 'https://tv.youtube.com/verify' }` (`VERIFY_URL`) | `:32`, `:619` |
| `sharedCookiesEnabled` | `true` | `:618` |
| `thirdPartyCookiesEnabled` | `true` | `:622` |
| `incognito` | not set (persistent default store) | — |
| `geolocationEnabled` | `false`; the real sensor was never consulted | `:587` |
| `injectedJavaScriptBeforeContentLoaded`, `injectedJavaScript` | `createGeolocationInjection(destination)` | `:509-512`, `:588-589` |
| `injectedJavaScriptBeforeContentLoadedForMainFrameOnly` | `Platform.OS !== 'ios'` (iPhone also injected into subframes) | `:590-592` |
| `onShouldStartLoadWithRequest` | `allowVerifyNavigation` | `:595` |
| `originWhitelist` | `['*']` so the gate, not the whitelist, decided; the library would otherwise hand whitelist misses to `Linking` | `:583-584`, `:596` |
| `setSupportMultipleWindows` | `false` (popups stayed in-frame) | `:617` |
| `allowsBackForwardNavigationGestures` | on | `:586` |

### 7.1 Navigation gate (`app/tvLocation/verifyNavigation.ts`)

- `httpsHost(url)` (`:6-13`): only `https://`; rejected `@` credentials and any host outside `[a-z0-9.-]`; dropped the port.
- `allowVerifyNavigation` (`:17-34`): subframe loads (`isTopFrame === false`) always allowed; `about:blank` and `about:srcdoc` allowed; otherwise the host had to be `youtube.com`, `google.com`, or a subdomain of either. Disallowed loads (other sites, app schemes) were dropped without opening anything.
- `isVerifyPageUrl(url)`: host exactly `tv.youtube.com` (`:36-38`).

### 7.2 In-WebView Google sign-in

The app had no sign-in screen and no credential field. When the WebView had no Google session, `tv.youtube.com/verify` redirected to Google's sign-in and 2-Step pages, which rendered inside the same WebView under the host gate; the parent typed into Google's page. The resulting session cookies lived in the platform WebView store: Android `CookieManager` (process-wide), iPhone the WKWebView default data store plus `NSHTTPCookieStorage` through `sharedCookiesEnabled`. Validated: the standalone WebView loaded Google sign-in from the verify URL and completed two-step approval (`Docs/Production/Validation.md:74`).

The app never read cookies (no JS cookie API; the native module exposed only `flushCookies`) and posted no page text across the bridge. The injected script, however, had no host guard of its own and was installed into every top-level document the WebView loaded, including Google account pages; it read only body text and button labels to detect the YouTube prompt.

The team player WebViews protected this sign-in: on Android they never set `incognito`, because Android implemented incognito by clearing every WebView cookie in the app (`app/guardians/GuardiansScreen.tsx:629-631`, `app/patriots/PatriotsScreen.tsx:519-521`, `app/cyclones/CyclonesScreen.tsx:618`). `release/RELEASE_NOTES.md` recorded the fix as "Watching a game on Android no longer signs TV Location out of Google".

### 7.3 Return to step 4

`onMessage` (`:541-560`) parsed JSON, ignored anything whose `source` was not `danner-geolocation`, and on `event: 'advanced'` from a page whose URL host was `tv.youtube.com` scheduled `onAdvanced` after 800 ms (once). `finishVerify` (`:669-675`) closed verification, set step 4, cleared retry and message, and focused step 4. Manual return (`‹ Steps` or Android Back) ran `closeVerify` (`:661-667`): step 3 with the retry note.

---

## 8. Geolocation injection (`app/tvLocation/geolocationInjection.ts`)

Built per destination (`createGeolocationInjection`, `:4`) and run both before content and after load; each part installed once per document.

Bridge: `send(event, detail)` posted `{ source: 'danner-geolocation', event, latitude, longitude, detail }` through `window.ReactNativeWebView.postMessage` (`:12-24`). Events: `requested` (`getCurrentPosition` or `watchPosition`), `error`, `advancing`, `advanced` (`YouTube Next`), `ready`.

Shim, guarded by `window.__DANNER_GEOLOCATION_SHIM__` (`:26-155`):

| Piece | Behavior |
|---|---|
| Position | `coords { latitude, longitude, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: null }`, `timestamp: Date.now()` (`:30-43`) |
| `getCurrentPosition` | success on the next tick (`:46-51`) |
| `watchPosition` | success on the next tick, then every 3,000 ms; numbered ids (`:52-62`) |
| `clearWatch` | stopped that interval (`:63-68`) |
| Prototype patch | `Geolocation.prototype` methods replaced, so references a page saved earlier also got the point (`:87-97`) |
| `navigator.geolocation` | redefined as a frozen, non-writable, non-configurable object; fallback assigned the three methods (`:99-116`) |
| Permissions | `Permissions.prototype.query` (or `navigator.permissions.query`) answered `{ name: 'geolocation', state: 'granted' }` for geolocation and delegated everything else (`:118-148`) |
| Marker | `window.__DANNER_SELECTED_LOCATION__ = Object.freeze({ latitude, longitude })` (`:311-314`) |

`Next` automation (`:157-309`):

- Prompt detection: host `tv.youtube.com` and body text containing `verify your current playback area` (`PROMPT_TEXT`, `:157,162-166`).
- Control: the first shown `button`, `[role="button"]`, `input[type="button"]`, or `input[type="submit"]` whose trimmed lower-case label was exactly `next` (`:158,168-188`).
- Auto-click: every 500 ms (`__DANNER_AUTO_ADVANCE_TIMER__`), an enabled `Next` not already marked `data-danner-auto-clicked` was marked, reported `advancing`, and clicked after 250 ms (`:268-287`, `:304-308`).
- Confirmation: a capture-phase document click listener started a watch on any `Next` click (automatic or manual) (`:291-303`). Within `WATCH_MS = 5000` the watch counted success when the URL changed, the prompt disappeared, or the `Next` control disappeared; it polled every 250 ms (`:197-246`). The watch was saved in `sessionStorage` under `__dannerNextWatch` so a click that loaded a new `tv.youtube.com` document was finished by the next document's script (`resumeWatch`, `:248-266`). Success reported `advanced` once (`__DANNER_ADVANCE_REPORTED__`, `:190-195`).

Rule text: `AI_Framework/AI_RULES.md:46` (inject into the browser Geolocation API; never change device GPS, request device location, or launch a mock-location app). The app declared no location permission and blocked fine and coarse location on Android (`app/app.json:35-38`). Validation: YouTube accepted the injected Tripoli point and the TV showed `Welcome to the Cedar Rapids/Waterloo/Dubuque area` (`Docs/Production/Validation.md:75-77`); the `Next` automation and return stayed at Review (`:78`).

---

## 9. Android cookie flush

- Native module `danner-webview-cookies`, `expo-module.config.json` `"platforms": ["android"]`; Kotlin `Name("DannerWebViewCookies")`, `AsyncFunction("flushCookies")` → `CookieManager.getInstance().flush()`, returning `true`, or `false` on an exception (`app/modules/danner-webview-cookies/android/src/main/java/expo/modules/dannerwebviewcookies/DannerWebViewCookiesModule.kt:9-21`).
- JS wrapper `flushWebViewCookies()` required the module only on Android and swallowed errors; on iPhone it did nothing (`app/modules/danner-webview-cookies/src/index.ts:8-23`).
- `VerifyView` flushed every `COOKIE_FLUSH_INTERVAL_MS = 20_000` while open (shorter than the cookie store's 30-second write batch), whenever `AppState` left `active`, and when verification closed (`TvLocationScreen.tsx:33-34,523-539`). A swiped-away app was killed without a final write, so without the flush a fresh Google sign-in could be lost.
- Rule: `AI_Framework/AI_RULES.md:58`. Validation: compile and typecheck passed; the phone check (sign in, leave, swipe away, reopen) stayed at Review (`Docs/Production/Validation.md:95`).

---

## 10. Tests

| Command (from `app/`) | Script | Covered |
|---|---|---|
| `npm run test:offline-map` | `tests/offline-map/run.mjs` (221 lines) | `gridMax === 65535` and 32,350 places (`:24-25`); the HTML's embedded `DATA` equals `offline-us-map.json` (`:28-36`); the code between the selection-rule markers is evaluated with `new Function` and compared with `offlineMapSelection.ts` (`:38-46`); `DEFAULT_START` equals Tripoli (`:48-49`); Tripoli grid round trip under 1 m and quantization under 1 km (`:56-74`); label cases including Tripoli, Cleveland, New York, Los Angeles, suburbs next to major cities (`:76`+); search ordering (`washington` → District of Columbia first, `new york`, `tripoli` → `Tripoli, Iowa` first, `cleveland`), no repeated places, Puerto Rico names, no ` zona` names (`:185-209`); search selection of Tripoli returns the exact default and Cleveland agrees between module and page (`:211-219`) |

Validation rows for this module at the snapshot: `Docs/Production/Validation.md:61-79` (guided home, step 3, step 4, auto-scroll, scroll restoration, map generation, packaging, offline operation, readability, search, persistence, Tripoli reset, location isolation, verify page, bridge readiness, geolocation request, area result, `Next` automation, Back), `:89` (physical iPhone and TV Pending), `:95` (cookie flush Review).

---

## 11. Rules and docs that pinned this module

- `AI_Framework/AI_RULES.md:42` (preserve the YouTube TV playback-area purpose), `:43` (allowed verification URL `https://tv.youtube.com/verify` and redirects it initiated), `:44` (Tripoli default), `:45` (map or offline search, nearest town label, saved locally), `:46` (browser Geolocation injection only), `:58` (Android cookie flush), `:59` (four explicit steps; step 3 exposes only its update button; returns to step 4 after `Next`; step 4 says the `Welcome to...` message appears on the TV).
- `Docs/Domain/Playback.md` (destination, guided flow, browser geolocation), `Docs/Anchor/Vision.md:22-28`, `Docs/Art/README.md:13-20` (step styling), `app/tvLocation/README.md`, `app/modules/README.md:9`.

---

## 12. Permalinks

- Screen: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/tvLocation/TvLocationScreen.tsx#L1-L786
- Map picker with the Tripoli button: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/tvLocation/TvLocationScreen.tsx#L167-L250
- Four steps: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/tvLocation/TvLocationScreen.tsx#L252-L494
- Verification WebView and cookie flush: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/tvLocation/TvLocationScreen.tsx#L496-L626
- State owner and storage: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/tvLocation/TvLocationScreen.tsx#L628-L786
- Destination and Tripoli constant: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/tvLocation/destination.ts#L1-L70
- Geolocation injection: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/tvLocation/geolocationInjection.ts#L1-L320
- Navigation gate: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/tvLocation/verifyNavigation.ts#L1-L38
- Offline map component: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/tvLocation/OfflineUsMap.tsx#L1-L216
- Map template selection rules and `DEFAULT_START`: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/scripts/offline-us-map.template.html#L104-L235
- Map build script: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/scripts/build-offline-map.mjs#L1-L454
- Cookie flush module: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/modules/danner-webview-cookies/android/src/main/java/expo/modules/dannerwebviewcookies/DannerWebViewCookiesModule.kt#L1-L22
- Offline map test: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/tests/offline-map/run.mjs#L1-L221
- Playback doc: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/Docs/Domain/Playback.md#L1-L45
