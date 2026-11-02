Status: ARCHIVED
Snapshot: 823d2be (2026-10-31)

# Hub, shell, identity, and release path (fixed-team design)

This is the permanent record of how the Danner Apps shell worked while the hub carried exactly three hard-coded teams (Cleveland Guardians, New England Patriots, Iowa State Cyclones) and the fixed YouTube TV `TV Location` tile. Everything below is pinned to commit `823d2be562d252c9f3b0da305275adc6d8498f55` on `main` (2026-10-31). Paths are repository-relative and cited as `path:line` at that commit.

Permalink base for every citation: `https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/<path>#L<a>-L<b>`.

Companion records in this folder: [Guardians.md](Guardians.md), [Patriots.md](Patriots.md), [Cyclones.md](Cyclones.md), [TvLocation.md](TvLocation.md).

---

## 1. File inventory

| File | Lines | Role |
|---|---|---|
| `app/index.ts` | 8 | `registerRootComponent(App)` (`app/index.ts:8`) |
| `app/App.tsx` | 58 | Screen switch, safe area, status bar |
| `app/hub/HubScreen.tsx` | 429 | Logo, 2×2 tile grid, signing warning, update prompt, download spinner |
| `app/hub/appUpdate.ts` | 188 | Manifest URL, prompt strings, manifest parse and trust checks, offer rule, SideStore URL |
| `app/hub/provisioningWarning.ts` | 48 | Final-48-hour warning text |
| `app/hub/releaseVersion.js` | 34 | The one release-tag parser (CommonJS) |
| `app/hub/README.md` | 12 | Tier README for the hub |
| `app/modules/danner-app-update/**` | — | Android-only native APK download, SHA-256 check, `PackageInstaller` session |
| `app/modules/danner-provisioning-profile/**` | — | iOS-only native read of `embedded.mobileprovision` `ExpirationDate` |
| `app/app.json`, `app/app.config.js`, `app/eas.json`, `app/metro.config.js`, `app/package.json` | — | Identity, version bake, build profiles, asset extensions, dependencies |
| `.github/workflows/release.yml` | 253 | Tag-triggered APK, IPA, manifest, and GitHub release |
| `release/build-update-assets.mjs` | 88 | Writes `version-manifest.json` and `sidestore-source.json` |
| `tests/app-update/run.mjs`, `tests/provisioning-warning/run.mjs` | 346, 52 | Repository-only checks |

---

## 2. Screen switch (`app/App.tsx`)

The app had no navigation library (no react-navigation, no expo-router; `app/package.json:44-58`). One `useState` held the visible screen and a ternary chain rendered exactly one screen.

| Item | Value | Source |
|---|---|---|
| Screen union | `type AppScreen = 'cyclones' \| 'guardians' \| 'menu' \| 'patriots' \| 'tv-location'` | `app/App.tsx:14-19` |
| Initial screen | `useState<AppScreen>('menu')` | `app/App.tsx:22` |
| Return to hub | `openMenu` = `setAppScreen('menu')` in a `useCallback` | `app/App.tsx:24-26` |
| Root wrappers | `SafeAreaProvider` → `StatusBar style="dark"` → `SafeAreaView edges={['top','bottom']}` | `app/App.tsx:29-31` |
| Hub branch | `HubScreen` with `onOpenCyclones`, `onOpenGuardians`, `onOpenPatriots`, `onOpenTvLocation` | `app/App.tsx:32-38` |
| Team branches | `GuardiansScreen onBack={openMenu}`, `PatriotsScreen onBack={openMenu}`, `CyclonesScreen onBack={openMenu}` | `app/App.tsx:39-44` |
| Fallback branch | `TvLocationScreen onBackToMenu={openMenu}` | `app/App.tsx:45-46` |
| Safe-area background | `#F7F7F2`, `flex: 1` | `app/App.tsx:53-58` |

Behavior that followed from this shape:

- Every screen unmounted when another was shown. Team state (snapshot, streams, Get video session, audio) was lost and refetched on reopen. TV Location step progress was lost; only its destination persisted.
- The hub itself remounted on every return. Its update check ran on mount and on `AppState` `active`, and the "no prompt while a module is open" rule relied on the hub being unmounted (`hubMounted`, `app/hub/HubScreen.tsx:85,92,186,236`).
- Android hardware Back: each team screen registered its own `BackHandler` (Play modal first, then `onBack`), TV Location registered two (verification view, then home). The hub registered none, so Back on the hub fell through to the system and left the app.
- `scheme: "dannerapp"` existed (`app/app.json:5`) but nothing read deep links (no `Linking.getInitialURL`, no URL listener).
- Team screens took no team parameter; signatures were `({ onBack }: { onBack: () => void })` (`app/guardians/GuardiansScreen.tsx:1134`, `app/patriots/PatriotsScreen.tsx:1024`, `app/cyclones/CyclonesScreen.tsx:1135`).

---

## 3. Hub layout (`app/hub/HubScreen.tsx`)

The hub was logo-only: no heading, no prompt, no tile titles or descriptions. Layout used absolute positioning with percentage anchors. The file never read window dimensions (`useWindowDimensions` and `Dimensions` appear nowhere in `app/`). Percentages were fractions of the usable (safe-area) height, because the hub rendered inside `SafeAreaView edges={['top','bottom']}`.

### 3.1 Style constants

| Style | Properties | Source |
|---|---|---|
| `menuScreen` | `backgroundColor: '#F7F7F2'`, `flex: 1`, `position: 'relative'` | `app/hub/HubScreen.tsx:351-355` |
| `menuLogo` | `height: 210`, `width: 210`, `borderRadius: 34`, `position: 'absolute'`, `top: '33.333%'`, `left: '50%'`, `marginTop: -105`, `marginLeft: -105` | `app/hub/HubScreen.tsx:356-365` |
| `menuExpiryWarning` (warning and spinner slot) | `position: 'absolute'`, `top: '33.333%'`, `left: 24`, `right: 24`, `alignItems: 'center'`, `transform: [{ translateY: -158 }]` | `app/hub/HubScreen.tsx:366-373` |
| `menuExpiryWarningTitle` | `color: '#A32626'`, `fontSize: 16`, `fontWeight: '800'`, centered | `app/hub/HubScreen.tsx:381-386` |
| `menuExpiryWarningInstruction` | `color: '#5A4137'`, `fontSize: 14`, `fontWeight: '600'`, `marginTop: 2`, centered | `app/hub/HubScreen.tsx:374-380` |
| `subAppGrid` | `position: 'absolute'`, `top: '66.667%'`, `left: 0`, `right: 0`, `alignItems: 'center'`, `gap: 28`, `marginTop: -115.2` | `app/hub/HubScreen.tsx:387-395` |
| `subAppRow` | `flexDirection: 'row'`, `gap: 28`, `alignItems: 'center'`, `justifyContent: 'center'` | `app/hub/HubScreen.tsx:396-401` |
| `subAppTile` | `height: 101.2`, `width: 101.2`, `borderRadius: 14`, `borderWidth: 2`, `borderColor: '#A9CEBB'`, `backgroundColor: '#FFFFFF'`, `overflow: 'hidden'`, `alignItems: 'center'`, shadow `#15354A` offset `{0, 4}` opacity `0.1` radius `9`, `elevation: 2` | `app/hub/HubScreen.tsx:402-416` |
| `subAppTilePressed` | `opacity: 0.78`, `transform: [{ scale: 0.98 }]` | `app/hub/HubScreen.tsx:417-420` |
| `subAppLogoFill`, `subAppLogoContained` | both `height: '100%'`, `width: '100%'` (identical; TV used `Fill`, teams used `Contained`) | `app/hub/HubScreen.tsx:421-428` |

### 3.2 Layout math

With `H` = usable height in dp:

| Element | Vertical extent | Derivation |
|---|---|---|
| Logo | `H/3 − 105` to `H/3 + 105` | 210dp square centered on the one-third line by `top: 33.333%` and `marginTop: -105` |
| Warning or spinner slot top edge | `H/3 − 158` | 158dp above the logo center, 53dp above the logo top edge |
| Grid block | `2H/3 − 115.2` to `2H/3 + 115.2` | Two rows of 101.2dp plus one 28dp gap = 230.4dp; `marginTop: -115.2` is half of that, so the block centered on the two-thirds line |
| Grid width | 230.4dp | 2 × 101.2 + 28, centered by `alignItems: 'center'` |

Clearance between the logo bottom and the grid top was `(2H/3 − 115.2) − (H/3 + 105) = H/3 − 220.2`, which was non-negative only when `H ≥ 660.6dp`. Shorter usable heights (iPhone SE class, any landscape) overlapped the logo and the first tile row. `app/app.json:7` set `"orientation": "default"` and `app/app.json:14` set `"supportsTablet": true`, so landscape and tablets used the same fixed constants.

### 3.3 Render order and tiles

Render order inside `menuScreen` (`app/hub/HubScreen.tsx:246-347`): warning or spinner slot, then the logo image, then the grid.

- Logo: `Image accessibilityLabel="Danner logo"`, `resizeMode="contain"`, `require('../assets/ic_launcher_danner.jpg')` (`app/hub/HubScreen.tsx:267-272`).
- Grid: two hard-coded `View` rows (`app/hub/HubScreen.tsx:275-309`, `311-344`), each tile a `Pressable` with `accessibilityRole="button"` wrapping an `Image resizeMode="cover"`.

| Position | `accessibilityLabel` | `accessibilityHint` | Artwork | Opened | Source |
|---|---|---|---|---|---|
| Row 1 left | `Cleveland Guardians` | `Opens Guardians scores, record, schedule, and authorized live video` | `assets/cleveland-guardians-logo.jpg` | `'guardians'` | `app/hub/HubScreen.tsx:276-291` |
| Row 1 right | `New England Patriots` | `Opens Patriots scores, record, schedule, and authorized live video` | `assets/new-england-patriots-logo.jpg` | `'patriots'` | `app/hub/HubScreen.tsx:293-308` |
| Row 2 left (under Guardians) | `Iowa State Cyclones` | `Opens Cyclones scores, records, schedule, and authorized live video` | `assets/iowa-state-cyclones-logo.jpg` | `'cyclones'` | `app/hub/HubScreen.tsx:312-327` |
| Row 2 right (under Patriots) | `TV Location` | `Opens the YouTube TV location setup` | `assets/youtube-tv-logo-vecteezy.jpg` | `'tv-location'` | `app/hub/HubScreen.tsx:328-343` |

The accessibility labels were load-bearing: Android UI harnesses tapped tiles by `content-desc` (`tests/guardians/run-get-video.mjs:425`, `tests/guardians/run-cast-web.mjs:399`, `tests/guardians/run-shell-fix.mjs:221,236,399`, `tests/patriots/run-get-video.mjs:450`, `tests/cyclones/run-get-video.mjs:461`).

The hub made no network request other than the update manifest. It showed no team state, scores, or badges.

### 3.4 Where the fixed layout was written down

| Location | Text it carried |
|---|---|
| `AI_Framework/AI_RULES.md:47` | 210dp logo one-third down, two-row 2×2 grid of 101.2dp tiles, 28dp gaps, `marginTop: -115.2`, row assignments, no headings/prompts/descriptions |
| `app/hub/README.md:7` | Same layout and row assignments |
| `Docs/Art/README.md:8-12,20` | Logo at one-third, grid at two-thirds, row assignments, no tile titles |
| `Docs/Anchor/Vision.md:8` | Product paragraph naming the four tiles |
| `Docs/Production/Roadmap.md:9`, `Docs/Production/Validation.md:18,24-26` | Hub rows and device-validation status |
| `release/RELEASE_NOTES.md:19` | "Logo-only two-row hub" with row assignments (used as the GitHub release body, `.github/workflows/release.yml:253`) |

Doc and code mismatch at the snapshot: `app/hub/README.md:10` said the download spinner sat "under the tiles"; the code rendered it in the above-logo slot (`app/hub/HubScreen.tsx:257-264`).

---

## 4. Bundled artwork and licensing

Every image was a Metro static `require`, resolved at bundle time. No remote logo URL existed anywhere in `app/`.

| File | Bytes | Pixels | Used by | Provenance recorded in `Docs/Art/README.md` |
|---|---|---|---|---|
| `app/assets/ic_launcher_danner.jpg` | 84,327 | 1079×1079 | Hub logo (`HubScreen.tsx:270`), app icon (`app/app.json:8`), splash (`app/app.json:72`, `imageWidth: 240`) | Build copy of canonical `Docs/Art/media/ic_launcher_danner.jpg` (Danner green and white script logo) (`Docs/Art/README.md:26,32`, `Docs/Art/media/README.md`) |
| `app/assets/cleveland-guardians-logo.jpg` | 136,908 | 2208×1242 | Hub tile (`HubScreen.tsx:288`), Guardians hero (`GuardiansScreen.tsx:1558`) | Requested winged-baseball mark sourced from the official Cleveland Guardians team-name page on mlb.com (`Docs/Art/README.md:28`). The landscape source was center-cropped by `cover` in the square tile |
| `app/assets/new-england-patriots-logo.jpg` | 45,866 | 1000×1000 | Hub tile (`HubScreen.tsx:305`), Patriots hero (`PatriotsScreen.tsx:1441`) | Bundled Flying Elvis mark on the owner-supplied Patriots navy field `#091932` (`Docs/Art/README.md:29`) |
| `app/assets/iowa-state-cyclones-logo.jpg` | 35,037 | 500×500 | Hub tile (`HubScreen.tsx:324`), Cyclones hero (`CyclonesScreen.tsx:1567`) | Iowa State mark from ESPN NCAA team 66 artwork (`Docs/Art/README.md:30`) |
| `app/assets/youtube-tv-logo-vecteezy.jpg` | 43,420 | 1920×1920 | Hub TV tile (`HubScreen.tsx:340`) | Requested YouTube TV artwork by Sagor Roy on Vecteezy; the source page marked it attribution-required and editorial-use-only (`Docs/Art/README.md:27`; `Docs/Production/Validation.md:82` kept "Requested artwork terms" at Review) |
| `app/assets/offline-us-map.html` | 1,676,397 | — | TV Location map page | Generated from U.S. Census data; see [TvLocation.md](TvLocation.md) |

Other assets in `app/assets/` (`icon.png`, `splash-icon.png`, `favicon.png`, `android-icon-*.png`) were Expo template leftovers; no config or code referenced them.

`app/metro.config.js:5-7` added `html` to `assetExts` so the offline map could be required. `expo-asset` was a config plugin (`app/app.json:88`). `Docs/Art/README.md:32` said "Both sub-app marks are packaged locally and do not require menu-time network access", a sentence written when two tiles existed; three team marks were bundled at the snapshot.

---

## 5. iPhone provisioning (signing-expiration) warning

Purpose: free-account SideStore signatures expire after 7 days. The hub warned during the final 48 hours so a parent would put the phone on Wi-Fi and a charger, which triggered the `Refresh SideStore` charger automation documented in `release/IPHONE_SETUP.md` (`## CHARGER REFRESH`, line 109) and `AI_Framework/IPHONE_INSTALL.md` (`## Charger automation`, line 86).

### 5.1 Native read

- Module `danner-provisioning-profile`, `expo-module.config.json` `"platforms": ["apple"]`; absent from Android builds.
- Swift `Name("DannerProvisioningProfile")`, `Function("getExpirationTimestamp")` (`app/modules/danner-provisioning-profile/ios/DannerProvisioningProfileModule.swift:6,8`). It loaded `Bundle.main` resource `embedded.mobileprovision` (`:10-13`), cut the bytes between `<?xml` and `</plist>` (`extractPlist`, `:30-50`), parsed the property list, read `ExpirationDate` (`:21`), and returned epoch milliseconds (`:26`). No profile, or any parse failure, returned `nil`.
- JS wrapper required the module only when `Platform.OS === 'ios'` and returned `undefined` for anything that was not a finite number (`app/modules/danner-provisioning-profile/src/index.ts:8-20`).

### 5.2 Text rules (`app/hub/provisioningWarning.ts`)

| Remaining time | Title | Source |
|---|---|---|
| `undefined`, `NaN`, or non-finite inputs | no warning | `:17-23` |
| more than 48 hours (`WARNING_WINDOW_MS = 2 * DAY_MS`) | no warning | `:6`, `:25-28` |
| ≤ 0 | `App refresh needed` | `:31-32` |
| < 1 hour | `Expires in less than 1 hour` | `:33-34` |
| < 24 hours | `Expires in N hour(s)`, `Math.floor` | `:35-38` |
| otherwise (24–48 hours) | `Expires in N day(s)`, `Math.floor` (25 hours read `Expires in 1 day`; exactly 48 hours read `Expires in 2 days`) | `:39-42` |

Instruction line, always: `Connect to Wi-Fi and charge phone to fix` (`PROVISIONING_WARNING_INSTRUCTION`, `:1-2`).

### 5.3 Hub behavior

- iOS only (`app/hub/HubScreen.tsx:60-62`). The expiration was read at mount and on every `AppState` `active` (`:64-73`); a 60,000 ms interval only advanced `currentTime` so the remaining-time text stayed current (`:65`).
- The warning rendered as a two-line `View accessibilityRole="alert"` in the above-logo slot (`:248-256`). When visible it took the slot from the download spinner.
- A visible warning suppressed the update prompt (section 7).
- Rule text: `AI_Framework/AI_RULES.md:48`. Validation: `Docs/Production/Validation.md:19-21` (implementation Pass, state tests Pass, presentation Review), `:23` (renewal and reset Pending).

---

## 6. Release-tag version baking

### 6.1 Parser (`app/hub/releaseVersion.js`)

- `RELEASE_VERSION_PATTERN = /^v?(0|[1-9]\d{0,4})\.(0|[1-9]\d?)\.(0|[1-9]\d?)$/` (`:9`): optional `v`, digits only, no leading zeros, major below 100000, minor and patch 0–99.
- `parseReleaseVersion(raw)` returned `{ version: 'M.m.p', versionCode: major * 10000 + minor * 100 + patch }` (`:15-32`).
- CommonJS (`module.exports`, `:34`) so Expo config evaluation, Metro, and plain Node all loaded it. Shared by `app/app.config.js:2`, `app/hub/appUpdate.ts:1`, and `release/build-update-assets.mjs:5`. The workflow repeated the same pattern in shell (`.github/workflows/release.yml:32,96,228`); `tests/app-update/run.mjs:270-287` asserted all three regexes matched.

### 6.2 Bake (`app/app.config.js`)

- `readRelease(process.env.RELEASE_TAG)` (`:4-18`): empty or missing tag meant local build; an invalid tag threw `RELEASE_TAG "<tag>" must be vMAJOR.MINOR.PATCH with digits only and minor and patch from 0 to 99.`
- With a tag: `expo.version = release.version` (`:24`), `ios.buildNumber = String(release.versionCode)` (`:27`), `android.versionCode = release.versionCode` (`:31`).
- Without a tag: `app/app.json` defaults stayed: `version: "1.0"` (`:6`), `ios.buildNumber: "1"` (`:16`), `android.versionCode: 1` (`:34`). A local or development build therefore had code 1 and could not install over a release build without an uninstall.
- Example recorded in `Docs/Production/Validation.md:93`: `v1.4.16` → `1.4.16` / `10416`. The latest published family tag recorded there was `v1.4.16`, 2026-10-13 (`Docs/Production/Validation.md:92`).

The JS bundle carried the tag separately as `EXPO_PUBLIC_APP_VERSION` (section 10); `getEmbeddedAppVersion()` parsed it with the same parser (`app/hub/appUpdate.ts:36-38`).

---

## 7. GitHub-release update prompt

### 7.1 Manifest fetch and trust (`app/hub/appUpdate.ts`)

| Item | Value | Source |
|---|---|---|
| Manifest URL | `EXPO_PUBLIC_APP_UPDATE_MANIFEST_URL` if set, else `https://github.com/Danner36/Danner_App/releases/latest/download/version-manifest.json` | `:5-7` |
| Timeout | `MANIFEST_TIMEOUT_MS = 8_000` via `AbortController` | `:18`, `:136-137` |
| Request headers | `Accept: application/json`, `User-Agent: danner-apps` | `:139-145` |
| Non-OK or thrown | returned `undefined` silently | `:146-155` |
| Manifest shape | `{ version, tag, android: ReleaseAsset, ios: ReleaseAsset }`; `ReleaseAsset = { sha256, size, url, versionCode }` | `:20-32` |
| Parse rules | `version` must parse; `tag` must start with `v` and parse to the same version; both assets must parse | `:68-94` |
| Asset rules | URL trusted; `sha256` 64 hex chars (lower-cased); `size` finite and > 0; `versionCode` finite and ≥ 1 (number or numeric string) | `:158-188` |
| Trusted URL | `https:` and host `github.com` or ending `.githubusercontent.com` | `:54-66` |
| Compare | `compareSemver` = difference of `versionCode`s; unparsable compares as 0 | `:40-52` |

### 7.2 Offer rule

`shouldOfferAppUpdate` (`app/hub/appUpdate.ts:96-115`) returned true only when the hub was visible, the signing warning was not visible, the prompt had not been dismissed this process (`updatePromptDismissed`, module scope, `:34`), both versions parsed, and the remote version was newer.

The hub's update effect (`app/hub/HubScreen.tsx:84-239`) kept `hubMounted`, `promptVisible`, `messageVisible`, and `checkInFlight` in effect-local variables, not render state, so an install finishing never started another check by itself (`:81-83`). A check was skipped (`updateBlocked`, `:90-98`) while the hub was unmounted, a prompt or message was showing, a check was in flight, or a native install was active. It also skipped when no baked version existed or the signing warning was visible (`:166-170`), and re-evaluated all of that after the manifest arrived (`:179-192`).

Triggers: once on mount (unless an install was already active, in which case the hub followed that install, `:220-225`) and on every `AppState` `active` (`:226-233`).

### 7.3 Prompt strings

| Constant | Text | Source |
|---|---|---|
| `APP_UPDATE_PROMPT_TITLE` | `Update available` | `app/hub/appUpdate.ts:9` |
| `APP_UPDATE_PROMPT_ANDROID` | `Install the new Danner Apps version on this phone?` | `:10-11` |
| `APP_UPDATE_PROMPT_IOS` | `Connect to Wi-Fi, open LocalDevVPN, then update in SideStore.` | `:12-13` |
| `APP_UPDATE_DOWNLOADING` | `Downloading update` (spinner accessibility label) | `:14` |
| `APP_UPDATE_SIDESTORE_MISSING` | `SideStore must be installed to update on iPhone.` | `:15-16` |

The prompt was a non-cancelable `Alert.alert` with `No` (style `cancel`) and `Yes` (`app/hub/HubScreen.tsx:196-217`). `No` set `updatePromptDismissed` for the life of the process.

### 7.4 Android Yes: in-app APK install

1. `installReleaseApk(manifest.android.url, manifest.android.sha256)` (`app/hub/HubScreen.tsx:161-163`).
2. JS wrapper (`app/modules/danner-app-update/src/index.ts`): module required only on Android (`:14-17`). A module-scope `activeInstall` promise (`:21`) meant a hub that remounted mid-download followed the same install (`:33-43`). Native result `cancelled` or `installed` mapped through; anything else resolved as `prompted`. Native errors mapped to `failed`, except code `ERR_INSTALL_PERMISSION`, which mapped to `needs-permission` (`:45-74`).
3. Native (`app/modules/danner-app-update/android/src/main/java/expo/modules/dannerappupdate/DannerAppUpdateModule.kt`, module `Name("DannerAppUpdate")`, `:28`):

| Step | Detail | Source |
|---|---|---|
| Preconditions | `ERR_NO_ACTIVITY` without a context; `ERR_TRUST` unless https `github.com`/`*.githubusercontent.com`; `ERR_CHECKSUM` unless 64 hex chars; `ERR_INSTALL_PERMISSION` (and opened `ACTION_MANAGE_UNKNOWN_APP_SOURCES` for the package) when `canRequestPackageInstalls()` is false; `ERR_BUSY` when another install was already running (process-wide `AtomicBoolean`) | `:43-72`, `:289-318`, `:385` |
| Threading | download and session write on `appContext.backgroundCoroutineScope`, not the shared module queue | `:75-87` |
| Cache hygiene | deleted earlier `Danner-Apps-update*.apk` from `cacheDir`, then `File.createTempFile` | `:89-95`, `:111-118` |
| Download | up to 5 manual redirects, each hop re-checked against the trusted-host rule; `connectTimeout` 15,000 ms, `readTimeout` 120,000 ms, `User-Agent: danner-apps` | `:149-174` |
| Checksum | streaming SHA-256 over 64 KiB buffers; mismatch threw `The update file did not match the published checksum.` | `:120-147` |
| Session | `PackageInstaller.SessionParams(MODE_FULL_INSTALL)`, `setAppPackageName(context.packageName)`, single entry `Danner-Apps-update.apk`, `fsync` | `:176-190`, `:379` |
| Result receiver | action `<package>.DANNER_APP_UPDATE_INSTALL`, registered `RECEIVER_NOT_EXPORTED` through `ContextCompat`; ignored any broadcast whose `EXTRA_SESSION_ID` differs | `:192-204`, `:244-253` |
| Statuses | `STATUS_PENDING_USER_ACTION` → started the system confirmation intent (deferred to the next foreground if the app was backgrounded); `STATUS_SUCCESS` → `installed`; `STATUS_FAILURE_ABORTED` → `cancelled`; other → `ERR_INSTALL` with the platform message | `:209-240`, `:30-41`, `:266-278` |
| Commit | `PendingIntent.getBroadcast(..., FLAG_UPDATE_CURRENT or FLAG_MUTABLE)` → `session.commit` | `:256-260` |
| Settle once | every exit unregistered the receiver, deleted the APK, abandoned the session on failure, and freed the install slot | `:325-370` |

4. Hub side (`app/hub/HubScreen.tsx:127-147`): while the promise was pending the slot showed only an `ActivityIndicator` (`color="#1F6F55"`, `size="small"`, label `Downloading update`, `:257-264`). `failed` and `needs-permission` cleared the spinner and showed an OK alert; OK after `needs-permission` offered the update again. Any other outcome (system sheet opened, installed, cancelled) called `dismissAppUpdatePrompt()` so the prompt stayed away until the process exited.

The manifest declared `REQUEST_INSTALL_PACKAGES` both in `app/app.json:49` and in the module manifest.

### 7.5 iPhone Yes: SideStore handoff

- `Linking.openURL(sideStoreInstallUrl(manifest.ios.url))` with `sidestore://install?url=<encodeURIComponent(IPA URL)>` (`app/hub/HubScreen.tsx:150-158`, `app/hub/appUpdate.ts:129-131`).
- `LSApplicationQueriesSchemes: ["sidestore"]` (`app/app.json:24-26`).
- If `openURL` threw, an OK alert said `SideStore must be installed to update on iPhone.`
- SideStore then downloaded the unsigned IPA and re-signed it with that phone's dedicated free Apple Account. LocalDevVPN on Wi-Fi was required for that install (`AI_Framework/AI_RULES.md:49`).
- Physical validation of both update paths stayed at Review at the snapshot (`Docs/Production/Validation.md:97-98`).

### 7.6 Release pipeline (`.github/workflows/release.yml`)

| Item | Value | Source |
|---|---|---|
| Triggers | push of tags `v*`; `workflow_dispatch` with required input `release_tag` | `:3-12` |
| Tag env | `RELEASE_TAG: ${{ inputs.release_tag \|\| github.ref_name }}` | `:17-18` |
| Permissions | `contents: read` globally; `contents: write` only for the release job | `:14-15`, `:186-187` |
| Android job | ubuntu-latest; tag regex check; checkout `refs/tags/<tag>` without persisted credentials; Node 24 with npm cache; Temurin Java 17; `npm ci`; `npx expo prebuild --platform android --clean`; `./android/gradlew --no-daemon -p android app:assembleRelease`; copy to `Danner-Apps-Android.apk`; upload artifact `android-release` | `:21-83` |
| iOS job | macos-latest; same checks; `npx expo prebuild --platform ios --clean`; `xcodebuild` Release `-sdk iphoneos` `generic/platform=iOS` with `CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO`; on failure printed `error:` lines and the log tail as annotations; packaged `Payload/*.app` with `ditto` into `Danner-Apps-iOS.ipa` and checked it with `unzip -t`; uploaded `ios-release` | `:85-178` |
| Release job | needed both; downloaded the artifacts; copied `release/IPHONE_SETUP.md`; ran `release/build-update-assets.mjs <tag> <apk> <ipa> release-assets`; wrote `SHA256SUMS.txt`; marked Latest only when the tag was the highest `v*` tag from `git ls-remote` sorted with `sort -V`; ran `gh release create` with six assets, `--verify-tag`, title `Danner Apps <tag>`, notes file `release/RELEASE_NOTES.md` | `:180-253` |

Android signing: the workflow configured no keystore. The APK was signed with the Expo-generated debug keystore that `expo prebuild` placed in the template (`Docs/Production/Validation.md:107`). `AI_Framework/AI_RULES.md:62`: "Do not rotate the Expo debug keystore used by family APKs." In-place updates depended on that key staying the same.

### 7.7 Update assets (`release/build-update-assets.mjs`)

- Repo from `GITHUB_REPOSITORY`, default `Danner36/Danner_App` (`:27`).
- Asset URLs: `https://github.com/<repo>/releases/download/<tag>/Danner-Apps-Android.apk` and `.../Danner-Apps-iOS.ipa` (`:32-33`).
- `version-manifest.json` (`:37-52`): `{ version, tag, android: { versionCode, url, sha256, size }, ios: { versionCode, url, sha256, size } }`.
- `sidestore-source.json` (`:54-79`): `name: 'Danner Apps'`, `identifier: 'com.danner.locationhelper.source'`, `sourceURL: .../releases/latest/download/sidestore-source.json`, one app with `bundleIdentifier: 'com.danner.locationhelper'`, `developerName: 'Danner'`, `subtitle: 'Danner family tools'`, `localizedDescription: 'Guardians, Patriots, and TV Location.'` (never updated for Cyclones), `iconURL` raw `main/Docs/Art/media/ic_launcher_danner.jpg`, `tintColor: '1F6F55'`, and one version entry with `buildVersion = String(versionCode)`.

---

## 8. Identifiers

| Identifier | Value | Source |
|---|---|---|
| App name | `Danner Apps` | `app/app.json:3` |
| Expo slug | `danner-app` | `app/app.json:4` |
| URL scheme | `dannerapp` (declared, unused) | `app/app.json:5` |
| Android package | `com.example.location_helper` | `app/app.json:33` |
| iOS bundle identifier | `com.danner.locationhelper` | `app/app.json:15`; repeated in `release/build-update-assets.mjs:61`; asserted in `tests/app-update/run.mjs:324` |
| SideStore source identifier | `com.danner.locationhelper.source` | `release/build-update-assets.mjs:56` |
| Android versionCode / iOS buildNumber | `major * 10000 + minor * 100 + patch` from the tag; `1` without a tag | `app/app.config.js:24-31` |
| Android SDKs | min 29, compile 36, target 36, `usesCleartextTraffic: true` | `app/app.json:77-87` |
| Android blocked permissions | `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` | `app/app.json:35-38` |
| Android permissions | `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `CHANGE_NETWORK_STATE`, `CHANGE_WIFI_MULTICAST_STATE`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CONNECTED_DEVICE`, `INTERNET`, `NEARBY_WIFI_DEVICES` (marked `neverForLocation` by `app/plugins/withGoogleCastNative.js`), `POST_NOTIFICATIONS`, `REQUEST_INSTALL_PACKAGES`, `WAKE_LOCK` | `app/app.json:39-51` |
| iOS Info.plist | ATS `NSAllowsArbitraryLoadsForMedia`, `NSAllowsArbitraryLoadsInWebContent`, `NSAllowsLocalNetworking`; `NSLocalNetworkUsageDescription`; `LSApplicationQueriesSchemes: [sidestore]`; `UIBackgroundModes: [audio]` | `app/app.json:17-30` |
| Cast | `react-native-google-cast` with `receiverAppId: "CC1AD845"` (default media receiver), `androidPlayServicesCastFrameworkVersion: "21.5.0"`, `expandedController: false` | `app/app.json:95-102` |
| Theme | `backgroundColor: #F7F7F2`, `primaryColor: #1F6F55`, `userInterfaceStyle: light`, `newArchEnabled: true`, `orientation: default` | `app/app.json:7-12` |
| Signing (Android) | Expo debug keystore from prebuild; never rotated | `AI_Framework/AI_RULES.md:62`, `Docs/Production/Validation.md:107` |
| Signing (iPhone) | unsigned IPA; SideStore applied each phone's dedicated free Apple Account | `.github/workflows/release.yml:145-146`, `AI_Framework/AI_RULES.md:61` |
| EAS profiles | `development` (dev client, internal), `preview` (internal, APK), `production` (internal, APK, `autoIncrement: false`); not used by the release workflow | `app/eas.json` |

Persistence consequence: AsyncStorage and WebView cookies survived an Android in-place update and a SideStore reinstall only while the package name, bundle identifier, Android signing key, and each phone's SideStore Apple Account stayed the same, and while versionCodes increased.

---

## 9. AsyncStorage keys

Package `@react-native-async-storage/async-storage` `2.2.0` (`app/package.json:45`). There were no hub-level keys and no record of which tiles existed; the tile set was code.

| Key | Owner | Write | Read | Format |
|---|---|---|---|---|
| `danner.guardians.sources.v2` | `app/guardians/GuardiansScreen.tsx:96` | `:412`, after every successful parse while the production URL was in use | `:450`, only after every live fetch failed and stale cache was allowed | Raw response text of the streams document |
| `danner.patriots.sources.v1` | `app/patriots/PatriotsScreen.tsx:94` | `:327` | `:354` | Raw `patriots_streams.json` text |
| `danner.cyclones.sources.v1` | `app/cyclones/CyclonesScreen.tsx:99` | `:405` | `:449` | Raw `cyclones_streams.json` text (entries carry `sport`) |
| `danner.destination.v1` | `app/tvLocation/destination.ts:1` | `app/tvLocation/TvLocationScreen.tsx:728-731`, only from the map picker save path | `TvLocationScreen.tsx:644-657`, once per mount | `JSON.stringify({ label, latitude, longitude })`; absent meant the in-code Tripoli default |

The `.v2` suffix on the Guardians key implied an earlier `.v1`; the shallow history did not show it. The app never called `removeItem` or `getAllKeys`.

Process-memory state (lost at process exit): `updatePromptDismissed` (`app/hub/appUpdate.ts:34`), `activeInstall` (`app/modules/danner-app-update/src/index.ts:21`), the MLB jersey cache and the MLB→ESPN event-id map (see [Guardians.md](Guardians.md)).

Other persisted state: the platform WebView cookie store held TV Location's Google sign-in (see [TvLocation.md](TvLocation.md)).

---

## 10. Build-time environment variables and secrets

`EXPO_PUBLIC_*` values were inlined into the JS bundle at build time, so anything set in a release build was readable from the APK or IPA.

| Name | Kind | Set by | Read by | Effect |
|---|---|---|---|---|
| `RELEASE_TAG` | env | `release.yml:17-18`, passed to all four build steps (`:64,72,122,130`) | `app/app.config.js:18` | Native version, versionCode, buildNumber |
| `EXPO_PUBLIC_APP_VERSION` | env | `${{ env.RELEASE_TAG }}` in the four build steps (`release.yml:61,69,119,127`) | `app/hub/appUpdate.ts:37` | Embedded version for the update compare; absent meant no prompt |
| `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` | repo secret of the same name | `release.yml:63,71,121,129` | `app/guardians/guardiansGetVideo.ts:7`, `app/patriots/patriotsGetVideo.ts:7`, `app/cyclones/cyclonesGetVideo.ts:8` | Cloudflare Worker origin for `/streams` and `/get-video`, shared by all three teams despite the name |
| `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` | repo secret of the same name | `release.yml:62,70,120,128` | `guardiansGetVideo.ts:8`, `patriotsGetVideo.ts:8`, `cyclonesGetVideo.ts:9` | Family PIN sent in Get video bodies; Get video hid unless both this and the Worker URL were set |
| `EXPO_PUBLIC_APP_UPDATE_MANIFEST_URL` | env, optional | not set by the workflow | `app/hub/appUpdate.ts:6` | Manifest URL override |
| `EXPO_PUBLIC_GUARDIANS_TEST_URL`, `EXPO_PUBLIC_GUARDIANS_SOURCES_URL` | env, dev only (`__DEV__`) | `tests/guardians/*.mjs` | `app/guardians/GuardiansScreen.tsx:97-103` | Harness snapshot and sources overrides |
| `EXPO_PUBLIC_PATRIOTS_TEST_URL`, `EXPO_PUBLIC_PATRIOTS_SOURCES_URL` | env, dev only | `tests/patriots/*.mjs` | `app/patriots/PatriotsScreen.tsx:95-100` | Same for Patriots |
| `EXPO_PUBLIC_CYCLONES_TEST_URL`, `EXPO_PUBLIC_CYCLONES_SOURCES_URL` | env, dev only | `tests/cyclones/*.mjs` | `app/cyclones/CyclonesScreen.tsx:100-105` | Same for Cyclones |
| `GH_TOKEN` (= `github.token`), `GITHUB_REPOSITORY` | workflow only | `release.yml:206-209,238-241` | `gh release create`, `build-update-assets.mjs:27` | Not baked into the app |

Hard-coded, non-env URLs baked into the app: raw `main` streams files, the GitHub commits API per file, raw-by-SHA URLs (per team; see the team records), the manifest default (`app/hub/appUpdate.ts:7`), and `YOUTUBE_WRAPPER_URL = 'https://danner.app/'` (`app/guardians/GuardiansScreen.tsx:93`, copies in Patriots `:78` and Cyclones `:87`).

---

## 11. Tests and validation for this area

| Command (from `app/`) | Script | Covered |
|---|---|---|
| `npm run test:provisioning-warning` | `tests/provisioning-warning/run.mjs` | No profile, `NaN`, 49 h (hidden), 48 h (`2 days`), 47 h 59 m and 25 h and 24 h (`1 day`), 24 h − 1 ms and 23 h (`23 hours`), 90 min (`1 hour`), 59 min (`less than 1 hour`), expired (`App refresh needed`) |
| `npm run test:app-update` | `tests/app-update/run.mjs` | Strict tag parser accept/reject table, versionCode compare (`1.3.10 > 1.3.9`, `1.4.0 > 1.3.99`), trusted asset URLs, manifest parse, offer rule (signing warning, dismissal, hub visibility), SideStore URL encoding, `app.config.js` bake with and without `RELEASE_TAG` (and the thrown error), the three workflow regexes, and the manifest/source writer (`bundleIdentifier`, `buildVersion: '10304'`) |
| `npm run typecheck` | `tsc --noEmit` | Whole app |

No CI workflow ran any of these; `release.yml` had no test step.

Validation rows that described this area at the snapshot: `Docs/Production/Validation.md:17` (standalone emulator launch Pass), `:18` (hub Review: last device pass predated the Cyclones tile), `:22` (Android signing-warning isolation Review), `:24-26` (tile rows), `:88` (physical iPhone hub open, 2026-08-28, when the hub had two tiles), `:92-93` (release publication and version bake Pass), `:96-98` (update tests Pass; Android and iPhone update paths Review).

---

## 12. Permalinks

- App shell: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/App.tsx#L14-L47
- Hub props and update effect: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/hub/HubScreen.tsx#L35-L239
- Hub render and tiles: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/hub/HubScreen.tsx#L246-L347
- Hub styles: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/hub/HubScreen.tsx#L350-L429
- Update manifest and offer rule: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/hub/appUpdate.ts#L1-L188
- Provisioning warning text: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/hub/provisioningWarning.ts#L1-L48
- Release-tag parser: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/hub/releaseVersion.js#L1-L34
- Version bake: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/app.config.js#L1-L34
- Identity and permissions: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/app.json#L1-L106
- Native APK installer: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/modules/danner-app-update/android/src/main/java/expo/modules/dannerappupdate/DannerAppUpdateModule.kt#L26-L392
- APK install wrapper: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/modules/danner-app-update/src/index.ts#L1-L74
- Provisioning profile reader: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/modules/danner-provisioning-profile/ios/DannerProvisioningProfileModule.swift#L1-L72
- Release workflow: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/.github/workflows/release.yml#L1-L253
- Update assets writer: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/release/build-update-assets.mjs#L1-L88
- Fixed-hub rule text: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/AI_Framework/AI_RULES.md#L47-L49
- Art provenance: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/Docs/Art/README.md#L24-L32
