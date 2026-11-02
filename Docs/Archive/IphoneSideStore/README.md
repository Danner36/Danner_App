Status: ARCHIVED
Snapshot: 19740af (2026-11-02)

# iPhone SideStore distribution

This is the permanent record of how family iPhones received and kept Danner Apps before the owner joined the paid Apple Developer Program, "the way it used to be." Each iPhone ran an unsigned IPA from GitHub Releases. SideStore signed it on the phone with a free Apple Account dedicated to that phone. The signature lasted 7 days, and SideStore renewed it over Wi-Fi only while LocalDevVPN was connected. A Windows PC with iLoader and Apple website iTunes did the first install over USB. A charger-triggered Shortcuts automation did the weekly renewal. The app read its own embedded provisioning profile and showed a warning during the final 48 hours, and its update prompt handed the new IPA to SideStore. On 2026-11-02 the owner decided to join the paid Apple Developer Program and retire SideStore, LocalDevVPN, iLoader, and free-account renewal. The successor path belongs to [Docs/Production/ModularTeams.md](../../Production/ModularTeams.md). This file records the old method in enough detail to rebuild it.

Android distribution (signed APK, in-app `PackageInstaller` update) did not depend on any of this and is out of scope here. The hub, version bake, and update-prompt internals that both platforms shared are recorded in [../FixedTeams/Hub.md](../FixedTeams/Hub.md); this file links there instead of repeating them.

## Pinned commit

| Item | Value |
|---|---|
| Commit | `19740af1ff0a7f5d88873e855cf79889feef1f20` (short `19740af`) on `main` |
| Commit date and subject | 2026-11-02 02:37 UTC, `Correct the Phase 0 rule wording after review.` |
| Tree | https://github.com/Danner36/Danner_App/tree/19740af1ff0a7f5d88873e855cf79889feef1f20 |
| Last release built this way | `v1.4.16`, published 2026-10-13 15:10 UTC from commit `d8d847f`, marked Latest (`Docs/Production/Validation.md:92`) |
| Last release page | https://github.com/Danner36/Danner_App/releases/tag/v1.4.16 (the card, the IPA, and `sidestore-source.json` as published) |
| Code drift from `v1.4.16` | None: app, release, workflow, and test code at `19740af` match `d8d847f`. Docs cited here changed between them: `AI_Framework/AI_RULES.md`, `AI_Framework/AI_ONBOARDING.md`, `Docs/Anchor/Vision.md`, `Docs/Production/Roadmap.md`, `Docs/Production/Validation.md`, `Docs/README.md`, `Docs/Production/README.md`, `app/README.md`, `app/hub/README.md`, `app/modules/README.md`, and `release/RELEASE_NOTES.md` (`git diff --stat d8d847f 19740af`). Rule text that did not exist while `v1.4.16` shipped is marked in section 8 |
| Drift from the FixedTeams snapshot `823d2be` | App, release, workflow, and test code identical. `AI_Framework/AI_RULES.md` lines moved: rules cited in [../FixedTeams/Hub.md](../FixedTeams/Hub.md) as `:48`, `:49`, `:61`, `:62` are `:50`, `:51`, `:64`, `:65` here |
| Recommended tag | `iphone-sidestore-final` (annotated, on `19740af`). It did not exist on `origin` when this archive was written |

Tag commands:

```bash
git tag -a iphone-sidestore-final 19740af1ff0a7f5d88873e855cf79889feef1f20 -m "iPhone SideStore distribution archive snapshot"
git push origin iphone-sidestore-final
```

The tag keeps the commit reachable after the SideStore files leave `main`, so every permalink in this file keeps resolving. To inspect the old tree locally: `git worktree add ../Danner_App-iphone-sidestore iphone-sidestore-final`.

## Conventions

- Every `path:line` citation is at `19740af`. A bare `:N` refers to the file named by the enclosing section, table, or row.
- Permalink form: `https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/<path>#L<a>-L<b>`. The full list is under [Permalinks](#permalinks).
- Behavior is described in the past tense. Quoted rule text keeps its original wording.
- Withheld everywhere: Apple Account emails, passwords, 2FA codes, pairing files, free-account team identifiers, certificate values, device UDIDs, and the household device name (written `<device name>`). Public download links already in the repository are kept because a rebuild needs them.
- Re-checked on 2026-11-02 against the published `v1.4.16` release through the GitHub REST API: six assets present; the downloaded `Danner-Apps-iOS.ipa` was 12,066,671 bytes with SHA-256 `c3b2e8d0b5f865cc5c8d86f37658263bd0349da6c7d18647756e41788a8afb73`, matching `Docs/Production/Validation.md:118-119`; `sidestore-source.json` matched the writer in `release/build-update-assets.mjs:54-79`.

---

## 1. Why it existed

- Distribution was direct device installation only, with no app-store delivery and no paid Apple Developer membership. `AI_Framework/AI_RULES.md:64` ended: "Do not require paid Apple Developer membership or add app-store submission work." `Docs/Anchor/Vision.md:39` said: "Direct installation through a signed Android APK or a SideStore-renewed iPhone IPA using a free dedicated Apple Account; no app-store delivery or paid Apple Developer membership".
- The development machine was a Windows PC. "There is no Mac in this project. There is no iOS ADB. Wireless debugging is not available from Windows." (`AI_Framework/IPHONE_INSTALL.md:5`; also `AI_Framework/AI_RULES.md:16`).
- Without a paid membership, no Apple signing identity existed for CI. GitHub's macOS runner built an unsigned device app (`.github/workflows/release.yml:125-147`), and the signature was applied on each phone by SideStore or iLoader with that phone's free Apple Account (`AI_Framework/IPHONE_INSTALL.md:5`).
- `app/eas.json:1-24` kept EAS internal-distribution profiles, but the release workflow never used EAS. "Family iPhones use SideStore and a free dedicated Apple Account instead of paid ad hoc distribution." (`app/README.md:74`; also `Docs/Technical/Stack.md:57`).

## 2. Timeline

Dates are tag commit dates from `git log`.

| When | What |
|---|---|
| `v1.0.0`, 2026-08-20 (`79ad72d`) | First release workflow with the unsigned iOS job (`CODE_SIGNING_ALLOWED=NO`), the `danner-provisioning-profile` module, the warning text (then `app/provisioningWarning.ts`), and the first `release/IPHONE_SETUP.md`: LocalDevVPN, iLoader `Install SideStore (Stable)`, Developer Mode, SideStore `+`, manual refresh, and `SIDESTORE EXPIRED OR MISSING`. No iTunes, USB IPA import, or charger automation yet |
| `v1.3.0`, 2026-08-26 (`1ab1b0f`) | The build installed on the family iPhone two days later |
| 2026-08-28 | The one recorded physical session: iLoader, Apple website iTunes, SideStore, USB import of `v1.3.0`, SideStore `+`, one charger run (`AI_Framework/IPHONE_INSTALL.md:9-31`) |
| `v1.3.1`, 2026-08-28 (`8d619a8`) | `AI_Framework/IPHONE_INSTALL.md` added with the day's results. The card gained Apple website iTunes, USB `Import IPA`, `ANOTHER IPHONE`, and `CHARGER REFRESH` |
| `v1.3.3`, 2026-08-29 (`092146b`) | Last build without the update check (`AI_Framework/IPHONE_INSTALL.md:140`) |
| `v1.4.0`, 2026-08-29 (`e037bcf`) | In-app update check: `app/hub/appUpdate.ts`, `release/build-update-assets.mjs` (`version-manifest.json`, `sidestore-source.json`), and `LSApplicationQueriesSchemes: ["sidestore"]` in `app/app.json` |
| `v1.4.16`, 2026-10-13 (`d8d847f`) | Last release published this way |
| 2026-11-02 (`19740af`) | Owner decision to join the paid Apple Developer Program; this snapshot |

The repository records no iPhone install after the 2026-08-28 `v1.3.0` install. `v1.3.0` predated the update check, so a phone still on it could update only by SideStore `+` of a downloaded IPA (`AI_Framework/IPHONE_INSTALL.md:140-143`).

## 3. How the parts fit

1. A pushed `v*` tag ran `.github/workflows/release.yml`. Its iOS job built an unsigned Release device app on `macos-latest` and zipped it as `Danner-Apps-iOS.ipa` (`:85-178`).
2. The release job published the IPA with the APK, `IPHONE_SETUP.md`, `SHA256SUMS.txt`, `version-manifest.json`, and `sidestore-source.json` (`:180-253`).
3. First install, per phone: on the Windows PC, iLoader (talking to the phone through Apple website iTunes' Apple Mobile Device Support) signed in with that phone's dedicated free Apple Account, installed SideStore over USB, and could also `Import IPA` the Danner IPA. On the phone, the parent trusted the developer app, turned on Developer Mode, installed LocalDevVPN from the App Store, connected it, signed SideStore into the same account, and used SideStore `+` on the IPA so SideStore tracked it.
4. Renewal, per phone, at least every 7 days: a Shortcuts personal automation on charger connect ran `Refresh SideStore` (start LocalDevVPN, wait 20 s, `Refresh All Apps`, wait 60 s, stop LocalDevVPN). Wi-Fi was required.
5. In the app: the hub read `ExpirationDate` from `embedded.mobileprovision` and showed a two-line warning during the final 48 hours. When GitHub's `version-manifest.json` was newer, the hub's Yes opened `sidestore://install?url=<IPA URL>`.

## 4. Components on the phone and the PC

### 4.1 One dedicated free Apple Account per phone

- Each iPhone used its own free Apple Account, dedicated to that phone's signing. "Give that iPhone its own dedicated free Apple Account. Do not reuse another phone's account." (`AI_Framework/IPHONE_INSTALL.md:80`; card `release/IPHONE_SETUP.md:104`).
- The same account was signed in to iLoader on the PC (`AI_Framework/IPHONE_INSTALL.md:45`) and to SideStore on the phone (`:49`, `:70`; card `release/IPHONE_SETUP.md:69`). It appeared under Settings → General → VPN & Device Management → `Developer App` (`AI_Framework/IPHONE_INSTALL.md:46`).
- iLoader stored the login. After an iLoader restart the session was logged out until `Sign in` on the saved login, which could prompt 2FA on the phone; the code went into iLoader, never into chat (`AI_Framework/IPHONE_INSTALL.md:19`, `:155`, `:163`).
- The account's credentials, team identifier, and certificates never entered the repository or CI.

### 4.2 SideStore

- SideStore was the on-phone signer and installer. iLoader's `SideStore (Stable)` control downloaded, signed, and installed it and placed the pairing file SideStore used (`AI_Framework/IPHONE_INSTALL.md:158`).
- Before SideStore could open, the phone needed the developer-app trust (`Allow & Restart`) and Developer Mode, each with a restart (`AI_Framework/IPHONE_INSTALL.md:46-47`; card `release/IPHONE_SETUP.md:30-43`).
- SideStore `My Apps` showed each tracked app with its days left (`7 DAYS` after a fresh signature). The card had the parent tap SideStore's own `7 DAYS` button and accept `Yes` or `Refresh Now` if it asked for a signing certificate (`release/IPHONE_SETUP.md:71-72`).
- SideStore signed itself with the same 7-day limit. If SideStore expired or went missing, the only path was a fresh install from the PC (`release/IPHONE_SETUP.md:162-164`; `AI_Framework/IPHONE_INSTALL.md:129`, `:183`).
- Official links used: install docs https://docs.sidestore.io/docs/installation/install and releases https://github.com/SideStore/SideStore/releases/latest (`release/IPHONE_SETUP.md:170-171`).

### 4.3 LocalDevVPN

- LocalDevVPN came from the Apple App Store (https://apps.apple.com/us/app/localdevvpn/id6755608044; `AI_Framework/IPHONE_INSTALL.md:41`, `:195`). Being an App Store app, it did not use a sideload slot (`Docs/Technical/Stack.md:125`).
- SideStore installs and refreshes worked only while LocalDevVPN was connected on Wi-Fi (`AI_Framework/IPHONE_INSTALL.md:69`, `:119`, `:125`). The first `Connect` asked iOS to add a VPN configuration (`Allow`, then passcode; `release/IPHONE_SETUP.md:45-51`).
- The charger shortcut started and stopped it through its Shortcuts actions `Start VPN` and `Stop VPN` (`AI_Framework/IPHONE_INSTALL.md:92`, `:96`).

### 4.4 iLoader and Apple website iTunes on Windows

- iLoader: the official MSI `iloader-windows-x64.msi` from https://github.com/nab138/iloader/releases/latest. Proven version `v2.3.1`, installed at `C:\Program Files\iloader\iloader.exe` (`AI_Framework/IPHONE_INSTALL.md:16`, `:42`).
- iTunes: the 64-bit installer from https://www.apple.com/itunes/download/win64, not the Microsoft Store build, because iLoader reached the phone through usbmuxd, which on Windows is Apple Mobile Device Support from the Apple website iTunes (`AI_Framework/IPHONE_INSTALL.md:43`, `:167`). Proven: iTunes `12.13.10.3`, Apple Mobile Device Support `19.4.0.10` (`:17`). A quiet `msiexec` without elevation exited `1603`; an elevated GUI install succeeded (`:43`).
- Healthy state: service `Apple Mobile Device Service` `Running`; Device Manager showing `Apple Mobile Device USB Composite Device` and `Apple Mobile Device USB Device`, not only the generic WPD `Apple iPhone` (`AI_Framework/IPHONE_INSTALL.md:43`, `:169-174`).
- Pairing needed a USB data cable, an unlocked phone, and `Trust` plus passcode on the phone (`AI_Framework/IPHONE_INSTALL.md:18`, `:44`). The proven phone ran iOS `26.6` and appeared in iLoader as `<device name>` (`:20`).
- Both stayed on the PC. A second phone reused them (`AI_Framework/IPHONE_INSTALL.md:78`, `:81`). Third-party binaries were never copied into the repository or the release (`:7`; `release/README.md:13`).

### 4.5 USB `Import IPA`

- With iLoader signed in and the phone selected, `Import IPA` opened a native file dialog, then signed and installed the chosen IPA with the same free account (`AI_Framework/IPHONE_INSTALL.md:56-63`, `:159`; card `release/IPHONE_SETUP.md:57-64`).
- Proven 2026-08-28 with the `v1.3.0` IPA: `Installing App`, then `Operation completed`, staging path `PublicStaging/DannerApps.app` (`AI_Framework/IPHONE_INSTALL.md:23`; `Docs/Production/Validation.md:86`).
- The USB copy was not tracked by SideStore and so was not renewed by `Refresh All` (`AI_Framework/IPHONE_INSTALL.md:26`, `:65`).

### 4.6 SideStore `+` registration

- SideStore tracked only apps it installed through `+`. Even after a USB install, the parent had to put `Danner-Apps-iOS.ipa` in the phone's `Downloads` (Safari download from the release page, or a USB AFC push from the PC) and pick it with SideStore `My Apps` → `+` (`AI_Framework/IPHONE_INSTALL.md:67-72`; card `release/IPHONE_SETUP.md:66-78`).
- After `+`, `My Apps` showed both SideStore and Danner Apps at `7 DAYS` (`AI_Framework/IPHONE_INSTALL.md:26`; `Docs/Production/Validation.md:87`).
- The same `+` path installed new versions by hand (`AI_Framework/IPHONE_INSTALL.md:140-143`; `release/IPHONE_SETUP.md:96`).

### 4.7 App slots

"Free Apple IDs allow three sideloaded apps. SideStore plus Danner Apps uses two." (`AI_Framework/IPHONE_INSTALL.md:74`; also `Docs/Technical/Stack.md:125`, `app/README.md:80`). The plan treated a bundle-id change as costing "a new app container and a third sideload slot" (`Docs/Production/ModularTeams.md:333`).

### 4.8 Seven-day signature and Wi-Fi-only renewal

- The free-account development signature lasted seven days (`app/README.md:80`). Renewal meant SideStore re-signing every tracked app on the phone.
- "Wi-Fi required. Cellular alone is not a supported SideStore refresh path." (`AI_Framework/IPHONE_INSTALL.md:119`). Any working Wi-Fi was enough; the phone did not need the owner's home network (`Docs/Technical/Stack.md:123`).
- `Refresh All` only re-signed the build SideStore already had. It did not fetch GitHub updates (`AI_Framework/IPHONE_INSTALL.md:147`).

### 4.9 Charger `Refresh SideStore` automation

Built on each phone after both apps showed `7 DAYS`. Shortcuts did not copy between phones (`AI_Framework/IPHONE_INSTALL.md:78`, `:88`).

Shortcut `Refresh SideStore` (Shortcuts → Library → `+`; `AI_Framework/IPHONE_INSTALL.md:90-97`, card `release/IPHONE_SETUP.md:113-122`):

1. LocalDevVPN `Start VPN`.
2. `Wait` 20 seconds.
3. SideStore `Refresh All Apps`.
4. `Wait` 60 seconds ("resign must finish before the VPN drops").
5. LocalDevVPN `Stop VPN`.

Personal automation (`AI_Framework/IPHONE_INSTALL.md:99-105`, card `release/IPHONE_SETUP.md:124-133`): `New Automation` → `Charger` → `Is Connected` → `Run Immediately` (not `Run After Confirmation`), `Notify When Run` off → run `Refresh SideStore` (not only `Start VPN`).

Proof of one run (`AI_Framework/IPHONE_INSTALL.md:107-113`, card `release/IPHONE_SETUP.md:135-144`): on Wi-Fi, unplug, wait two seconds, plug in, `Always Allow` if asked; about 80 seconds; LocalDevVPN shows a new `Connected at` time then `Disconnected`; both apps still `7 DAYS`. Proven once, 2026-08-28 12:26, on an unlocked phone (`:29`).

The hub warning text `Connect to Wi-Fi and charge phone to fix` was written for this automation ([../FixedTeams/Hub.md §5](../FixedTeams/Hub.md#5-iphone-provisioning-signing-expiration-warning)).

### 4.10 Manual refresh and recovery

- Manual refresh: LocalDevVPN `Connect`, SideStore `My Apps` → `Refresh All`, confirm `7 DAYS` (`AI_Framework/IPHONE_INSTALL.md:123-127`; card `release/IPHONE_SETUP.md:146-160`).
- Recovery table (`AI_Framework/IPHONE_INSTALL.md:176-187`): empty iLoader device list → Apple website iTunes, running service, unlock and Trust, `Refresh Devices`; logged-out iLoader → `Sign in` on the saved login; SideStore missing → `Install SideStore (Stable)`; Danner Apps missing → `Import IPA` or SideStore `+`; on the phone but absent from `My Apps` → SideStore `+`; expired → charger on Wi-Fi or manual refresh; charger does nothing → check `Run Immediately`, the shortcut target, Wi-Fi, then unplug and replug.

## 5. Release pipeline

### 5.1 iOS job (`.github/workflows/release.yml:85-178`)

| Step | Detail | Lines |
|---|---|---|
| Job | `ios`, name `Build SideStore IPA`, `runs-on: macos-latest`, working directory `app` | `:85-90` |
| Tag check | `vMAJOR.MINOR.PATCH`, digits only, minor and patch 0–99 | `:92-99` |
| Checkout | `refs/tags/<tag>`, `persist-credentials: false` | `:101-105` |
| Node | 24 with npm cache on `app/package-lock.json`; `npm ci` | `:107-115` |
| Prebuild | `npx expo prebuild --platform ios --clean` with `EXPO_PUBLIC_APP_VERSION`, the two `EXPO_PUBLIC_GUARDIANS_*` secrets, and `RELEASE_TAG` | `:117-123` |
| Build | `xcodebuild` on the generated `.xcworkspace`, first non-`Pods-` scheme, `-configuration Release -sdk iphoneos -destination 'generic/platform=iOS'`, `CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO`; on failure, `error:` lines and the log tail became annotations | `:125-159` |
| Package | Copied `Release-iphoneos/*.app` into `Payload/`, zipped with `ditto -c -k --sequesterRsrc --keepParent`, checked with `unzip -t` | `:161-171` |
| Upload | Artifact `ios-release`, file `Danner-Apps-iOS.ipa` | `:173-178` |

No Apple certificate, provisioning profile, Apple Account, or App Store Connect key existed in CI. The published `v1.4.16` IPA held `Payload/DannerApps.app/` with no `embedded.mobileprovision` and no `_CodeSignature` (checked 2026-11-02). Its `Info.plist` had `CFBundleIdentifier` `com.danner.locationhelper`, `CFBundleShortVersionString` `1.4.16`, `CFBundleVersion` `10416`, `MinimumOSVersion` `16.4`, and `LSApplicationQueriesSchemes` `["sidestore"]`. The profile the app later read was added on the phone at signing time.

Version bake: `app/app.config.js:18-28` set `expo.version` and `ios.buildNumber` from `RELEASE_TAG` (`major * 10000 + minor * 100 + patch`). Details: [../FixedTeams/Hub.md §6](../FixedTeams/Hub.md#6-release-tag-version-baking).

### 5.2 Release job and asset set (`.github/workflows/release.yml:180-253`)

- Needed both platform jobs; only this job had `contents: write` (`:180-187`).
- Copied the card: `cp release/IPHONE_SETUP.md release-assets/IPHONE_SETUP.md` (`:211`).
- Ran `node release/build-update-assets.mjs <tag> <apk> <ipa> release-assets` (`:212-216`) and `sha256sum` over the APK and IPA into `SHA256SUMS.txt` (`:217-218`).
- Marked Latest only when the tag was the highest `v*` tag (`:220-236`), then `gh release create` with six assets, `--verify-tag`, title `Danner Apps <tag>`, and notes from `release/RELEASE_NOTES.md` (`:238-253`).

Asset set (`release/README.md:3-11`; published `v1.4.16` sizes from the API):

| Asset | `v1.4.16` bytes | Role on iPhone |
|---|---|---|
| `Danner-Apps-Android.apk` | 95,222,266 | None |
| `Danner-Apps-iOS.ipa` | 12,066,671 | Unsigned app for iLoader `Import IPA`, SideStore `+`, and `sidestore://install` |
| `IPHONE_SETUP.md` | 5,897 | The family numbered card |
| `SHA256SUMS.txt` | 176 | Checksums of the APK and IPA |
| `version-manifest.json` | 542 | Read by the hub update check |
| `sidestore-source.json` | 931 | Optional SideStore source |

`release/RELEASE_NOTES.md:12-15` sent iPhone readers to `IPHONE_SETUP.md` ("Follow every section in order"); `:47-48` listed the SideStore expiration warning and the SideStore update handoff.

### 5.3 `release/build-update-assets.mjs`

- Arguments `<tag> <apk> <ipa> <outDir>`; the tag had to start with `v` and pass the shared parser (`:11-25`). Repository from `GITHUB_REPOSITORY`, default `Danner36/Danner_App` (`:27`).
- IPA URL `https://github.com/<repo>/releases/download/<tag>/Danner-Apps-iOS.ipa` (`:33`); the IPA's SHA-256 and size went into the manifest (`:29`, `:31`, `:46-51`).
- `version-manifest.json` (`:37-52`): `{ version, tag, android: {...}, ios: { versionCode, url, sha256, size } }`.
- `sidestore-source.json` (`:54-79`): `name: 'Danner Apps'`; `identifier: 'com.danner.locationhelper.source'` (`:56`); `sourceURL` `https://github.com/<repo>/releases/latest/download/sidestore-source.json` (`:34`, `:57`); one app with `bundleIdentifier: 'com.danner.locationhelper'` (`:61`), `developerName: 'Danner'`, `subtitle: 'Danner family tools'`, `localizedDescription: 'Guardians, Patriots, and TV Location.'` (`:64`, never updated for Cyclones), `iconURL` raw `main/Docs/Art/media/ic_launcher_danner.jpg`, `tintColor: '1F6F55'`; one version entry with `version`, `buildVersion` = `String(versionCode)`, `date`, `localizedDescription: 'Danner Apps <tag>'`, `downloadURL`, `size` (`:67-76`). Only the latest release was listed.
- Adding the source in SideStore was optional and let SideStore's own Updates tab see new IPAs (`AI_Framework/IPHONE_INSTALL.md:145`; card `release/IPHONE_SETUP.md:98`).

### 5.4 The family card (`release/IPHONE_SETUP.md`)

Upper-case section headings named where each step happened:

| Section | Lines | Content |
|---|---|---|
| `ON IPHONE` | `:3-8` | Wi-Fi; LocalDevVPN `Get` |
| `ON PC` | `:10-28` | iLoader MSI; Apple website iTunes; Apple Mobile Device Support; USB, unlock, `Trust`; iLoader sign-in; select phone; `Install SideStore (Stable)`. Skip 1–5 when both are installed (`:12`) |
| `ON IPHONE` | `:30-43` | `Developer App` → `Allow & Restart`; Developer Mode on, restart, confirm |
| `INSIDE LOCALDEVVPN` | `:45-51` | `Connect`, `Allow`, passcode |
| `INSTALL DANNER APPS` | `:53-78` | `ON PC (USB)` `Import IPA`; `ON IPHONE (SIDESTORE)` sign-in, `7 DAYS`, download IPA, `+` |
| `INSIDE DANNER APPS` | `:80-83` | Logo and both app buttons (two-tile wording kept since `v1.0.0`, never updated for the four-tile hub) |
| `NEW VERSION ON IPHONE` | `:85-98` | Wi-Fi, LocalDevVPN `Connect`, open the app, `Yes`, finish in SideStore; `+` fallback; optional source |
| `ANOTHER IPHONE` | `:100-107` | Own account; repeat everything; select new phone in iLoader; `+` after USB |
| `CHARGER REFRESH` | `:109-144` | Shortcut, automation, proof |
| `MANUAL REFRESH` | `:146-160` | LocalDevVPN `Connect`; SideStore `Refresh All` |
| `SIDESTORE EXPIRED OR MISSING` | `:162-164` | Repeat from `ON PC` |
| `LINKS` | `:166-173` | Releases, LocalDevVPN, SideStore docs and release, iLoader, iTunes |

### 5.5 `release/README.md`

Listed the release set (`:3-11`), described the card and the iTunes requirement, and pointed to the agent procedure (`:13`). `:15` described the tag-driven workflow and named `release/build-update-assets.mjs` as the writer of `version-manifest.json` and `sidestore-source.json`.

## 6. App side

Full hub detail (layout constants, effect structure, Android path) is in [../FixedTeams/Hub.md §5](../FixedTeams/Hub.md#5-iphone-provisioning-signing-expiration-warning) and [§7](../FixedTeams/Hub.md#7-github-release-update-prompt). Only the iPhone-specific parts follow.

### 6.1 Provisioning profile module (`app/modules/danner-provisioning-profile/`)

- Apple-only: `expo-module.config.json:2-4` (`"platforms": ["apple"]`, module `DannerProvisioningProfileModule`). Pod `DannerProvisioningProfile`, iOS 16.4, Swift 5.9; its description read "Local Expo module used by Danner Apps to warn before a free iOS development signature expires." (`ios/DannerProvisioningProfile.podspec:2-10`).
- Swift `Name("DannerProvisioningProfile")`, `Function("getExpirationTimestamp")` (`ios/DannerProvisioningProfileModule.swift:6-8`): loaded `Bundle.main` resource `embedded.mobileprovision` (`:10-13`), cut the bytes from `<?xml` through `</plist>` out of the CMS envelope (`:30-48`, byte search `:50-71`), parsed the property list, read `ExpirationDate` (`:21`), and returned epoch milliseconds (`:26`). Any missing file or parse failure returned `nil`.
- JS wrapper: required the native module only on iOS, and returned `undefined` for anything not a finite number (`src/index.ts:8-20`).
- An unsigned or simulator build had no profile, so no warning showed. The profile existed only after SideStore or iLoader signed the app on the phone (section 5.1).

### 6.2 Final-48-hour warning (`app/hub/provisioningWarning.ts`, `app/hub/HubScreen.tsx`)

- Window: `WARNING_WINDOW_MS = 2 * DAY_MS` (`provisioningWarning.ts:4-6`); nothing above 48 hours or for missing or non-finite input (`:17-28`).
- Titles (`:30-42`), rounded down: `App refresh needed` (≤ 0), `Expires in less than 1 hour`, `Expires in N hour(s)` below 24 hours, `Expires in N day(s)` from 24 to 48 hours. Instruction line, always: `Connect to Wi-Fi and charge phone to fix` (`:1-2`).
- Hub: iOS only (`HubScreen.tsx:59-62`); read at mount and on every `AppState` `active` (`:54-57`, `:64-73`); a 60-second timer only advanced the displayed time (`:65`). Rendered as a two-line `accessibilityRole="alert"` view above the logo (`:241-256`; styles `:366-386`: title `#A32626` 16/800, instruction `#5A4137` 14/600, `top: '33.333%'`, `translateY: -158`).
- A visible warning blocked the update prompt (section 6.3).
- Text table and rules: [../FixedTeams/Hub.md §5.2–5.3](../FixedTeams/Hub.md#52-text-rules-apphubprovisioningwarningts). Tests: `tests/provisioning-warning/run.mjs:12-50` (no profile, `NaN`, 49 h hidden, 48 h `2 days`, 47 h 59 m / 25 h / 24 h `1 day`, 24 h − 1 ms and 23 h `23 hours`, 90 min `1 hour`, 59 min `less than 1 hour`, expired), run by `npm run test:provisioning-warning` (`app/package.json:40`).

### 6.3 Update prompt, iPhone path (`app/hub/appUpdate.ts`, `app/hub/HubScreen.tsx`)

- Manifest: `https://github.com/Danner36/Danner_App/releases/latest/download/version-manifest.json`, overridable by `EXPO_PUBLIC_APP_UPDATE_MANIFEST_URL` (`appUpdate.ts:5-7`); asset URLs had to be `https` on `github.com` or `*.githubusercontent.com` (`:54-66`); parsed by `parseVersionManifest` (`:68-94`).
- Offer rule: no prompt while the signing warning was visible, after a No in this process, without a baked version, or off the hub (`appUpdate.ts:96-115`). The hub checked the warning before and again after the fetch (`HubScreen.tsx:100-105`, `:166-192`).
- iPhone prompt text: `Connect to Wi-Fi, open LocalDevVPN, then update in SideStore.` (`appUpdate.ts:12-13`; chosen at `HubScreen.tsx:196-198`).
- iPhone Yes: `Linking.openURL(sideStoreInstallUrl(manifest.ios.url))` (`HubScreen.tsx:149-158`), where `sideStoreInstallUrl` returned `sidestore://install?url=${encodeURIComponent(ipaUrl)}` (`appUpdate.ts:129-131`). If `openURL` threw, an OK alert said `SideStore must be installed to update on iPhone.` (`appUpdate.ts:15-16`, `HubScreen.tsx:153-156`).
- The app passed only the URL. It did not check the IPA's SHA-256 on iPhone; SideStore downloaded, re-signed, and installed it, with LocalDevVPN connected on Wi-Fi (`AI_Framework/AI_RULES.md:51`).
- `app/app.json:24-26` declared `LSApplicationQueriesSchemes: ["sidestore"]`.
- Tests: `tests/app-update/run.mjs:195-200` (SideStore URL encoding) and `:323-327` (source `bundleIdentifier`, `version`, `buildVersion: '10304'`, no `marketplaceID`), run by `npm run test:app-update` (`app/package.json:41`).
- Full update-prompt detail: [../FixedTeams/Hub.md §7](../FixedTeams/Hub.md#7-github-release-update-prompt), iPhone handoff at [§7.5](../FixedTeams/Hub.md#75-iphone-yes-sidestore-handoff).

## 7. Agent procedure (`AI_Framework/IPHONE_INSTALL.md`)

A 196-line Windows-PC procedure the agent read before any iPhone install, refresh, or recovery (`:3`; `AI_Framework/AI_RULES.md:16`; `AI_Framework/AI_ONBOARDING.md:17`, `:26`). Summary:

| Section | Lines | Content |
|---|---|---|
| Header | `:1-7` | Card link; no Mac, no iOS ADB, no wireless debugging; unsigned IPA signed on the phone; never print Apple Account emails, passwords, 2FA codes, pairing files, or UDIDs; never copy iLoader, iTunes, or IPA binaries into the repository; never start with Microsoft Store iTunes |
| Last proven session | `:9-31` | 2026-08-28 run described in section 4; "The eight-day unattended locked-phone renewal path remains unproven. iPhone Cast of the local live playlist remains unproven." (`:31`) |
| Agent can and cannot | `:33-37` | Could: download and install iLoader and iTunes, drive iLoader by UI Automation including the child `Open` dialog, download the IPA, push it to the phone's `Downloads` over USB (AFC), launch apps, screenshot. Could not: tap `Trust`, enter the passcode, toggle Developer Mode, tap LocalDevVPN `Connect` or VPN `Allow`, use SideStore's `+` picker, or activate Shortcuts controls |
| First-time order | `:39-52` | 12 steps: LocalDevVPN; iLoader; Apple iTunes (elevated); USB and Trust; iLoader sign-in and `Install SideStore (Stable)`; developer-app trust; Developer Mode; USB import then SideStore `+`; LocalDevVPN and SideStore `7 DAYS`; open the app; build the charger shortcut; prove one plug |
| Install paths | `:54-74` | USB path: IPA in the PC's Downloads folder; device selected; `Dismiss` leftovers; `Import IPA`; the dialog is a child window `Open`, class `#32770`; set the path on item `1148` with `WM_SETTEXT`, click item `1` with `BM_CLICK`; wait for `Operation completed`. On-phone `+` path. Three-slot limit |
| Another iPhone | `:76-84` | Full first-time install per phone; own account; reuse the PC tools |
| Charger automation | `:86-115` | Shortcut, automation, proof (section 4.9) |
| Recurring refresh | `:117-129` | Wi-Fi only; charger preferred; manual fallback; PC reinstall when missing or expired |
| New version | `:131-147` | Prompt path through `sidestore://install`; `+` fallback, required on builds without the checker including `v1.3.3`; optional source; `Refresh All` does not fetch GitHub updates |
| iLoader UI Automation | `:149-163` | Window title `iloader` (WebView2). Controls `Sign in`, `Refresh Devices` (`Ctrl+R`), the device button, `SideStore (Stable)`, `Import IPA`, `Dismiss` (an open overlay blocked later clicks), `Continue` (maximum-certificates dialog only). Logged-out toast `You must be logged in!` |
| USB detection | `:165-174` | WPD `Apple iPhone` alone was not enough; Apple website iTunes supplied usbmuxd |
| Recovery | `:176-187` | Section 4.10 |
| Links | `:189-196` | Releases, latest IPA, iLoader, iTunes, LocalDevVPN, SideStore docs |

## 8. Rules that governed it

Quoted from `AI_Framework/AI_RULES.md` at `19740af`. At `v1.4.16` (`d8d847f`) the same rules sat at `:16`, `:17`, `:48`, `:49`, `:59`, and `:60`. Two parts quoted below were added after `v1.4.16` by the Phase 0 commits (`230446e`, `19740af`) and did not govern SideStore while it shipped; they are marked "(Phase 0)".

- `:16`: "Physical iPhone install, SideStore, IPA sideload, and signing refresh follow [IPHONE_INSTALL.md](IPHONE_INSTALL.md). Windows has no iOS ADB and no Xcode."
- `:17`: "Do not print Apple Account emails, passwords, 2FA codes, pairing files, device UDIDs, Google or YouTube TV account data, any listing-site URL including backup sources, the family PIN, or the app key." (Phase 0: every clause after "device UDIDs". At `v1.4.16` the line ended "pairing files, or device UDIDs.")
- `:50`: "On iPhone only, allow the signing-health exception above the Danner logo during the final 48 hours of the embedded provisioning profile. Keep it to the expiration text plus `Connect to Wi-Fi and charge phone to fix`. Do not show it when more than 48 hours remain, when no embedded profile exists, or on Android."
- `:51` (iPhone parts): "When a published GitHub release is newer than the embedded build version, the hub may show a yes/no update prompt on launch and when returning to the hub. Do not show it while the iPhone signing-health warning is visible, while Guardians, Patriots, Cyclones, or TV Location is open, or when the baked release version is absent. No dismisses the prompt until the app process exits. … iPhone Yes opens SideStore with `sidestore://install?url=` for the release IPA. LocalDevVPN on Wi-Fi is still required for that SideStore install."
- `:64`: "Distribution: direct device installation only. Produce an installable signed APK for Android and a SideStore-compatible IPA for iPhone. Each GitHub release carries both Danner artifacts, `release/IPHONE_SETUP.md`, `version-manifest.json`, and `sidestore-source.json`. That setup card links to the official LocalDevVPN App Store listing, SideStore instructions, current iLoader release, and Apple's 64-bit iTunes download; do not mirror third-party binaries. iLoader on Windows requires Apple website iTunes (not the Microsoft Store) so Apple Mobile Device Service can see the phone. A logged-in iLoader session may also `Import IPA` over USB. Use a free dedicated Apple Account and any working Wi-Fi for SideStore renewal; cellular data alone is not a supported refresh path. Do not require paid Apple Developer membership or add app-store submission work."
- `:65` (identity part, Phase 0; at `v1.4.16` `:60` had only the version bake and the keystore sentence): "The Android package `com.example.location_helper`, the iOS bundle id `com.danner.locationhelper`, and the debug keystore never change, and versionCode strictly rises, so on-phone data survives updates."

`Docs/Anchor/Vision.md:41` added: "Routine SideStore renewal is intended to run through a silent charger-triggered Shortcuts automation; physical-device validation remains required because iOS and SideStore control the background signing operation."

## 9. Validation at the snapshot

From `Docs/Production/Validation.md` (last updated 2026-10-05):

| Line | Check | Status | What it recorded |
|---|---|---|---|
| `:14` | Expo platform config | Pass | Source `app.json` includes the `sidestore` query scheme |
| `:19` | iPhone signing warning implementation | Pass | Pod resolves; plist `ExpirationDate` extracted; no value without a profile; read at launch and foreground |
| `:20` | iPhone signing warning state tests | Pass | Repository-only text assertions |
| `:21` | iPhone signing warning presentation | Review | "an actual expiring SideStore profile is still required for iPhone visual confirmation" |
| `:23` | SideStore profile renewal and warning reset | Pending | Locked-phone charger renewal of both profiles, and the app reading the renewed date after foregrounding, never proven |
| `:83` | Direct-install configuration | Pass | Unsigned IPA from GitHub; SideStore applied the free-account signature |
| `:84` | Portable iPhone recovery links | Pass | Card links; no third-party binaries in the repository |
| `:85` | Physical iPhone SideStore via iLoader | Pass | 2026-08-28: iLoader `v2.3.1`, Apple website iTunes, iOS 26.6, `Install SideStore (Stable)` |
| `:86` | Physical iPhone Danner Apps IPA via iLoader | Pass | 2026-08-28: `v1.3.0` IPA over USB, `PublicStaging/DannerApps.app` |
| `:87` | Physical iPhone LocalDevVPN and SideStore refresh | Pass | 2026-08-28: both apps `7 DAYS` after `+`; one charger run at 12:26 |
| `:88` | Physical iPhone hub open | Pass | 2026-08-28: two-tile hub; Guardians live data; TV Location opened |
| `:89` | Physical iPhone and TV | Pending | Profile parsing, silent renewal over any Wi-Fi, TV results on the target iPhone |
| `:90` | iOS native module discovery | Pass | Autolinking resolves the module for Apple only |
| `:91` | iOS native build | Pass | macOS job built the unsigned Release device app and a valid IPA |
| `:92` | GitHub release publication | Pass | `v1.4.16` with all six assets |
| `:96` | App update version tests | Pass | Includes SideStore URL encoding and the source writer |
| `:98` | iPhone SideStore update handoff | Review | "Physical LocalDevVPN + SideStore install is still required" |
| `:117-122` | Release artifacts checked | — | IPA name, size, SHA-256; `IPHONE_SETUP.md`; update assets |
| `:142` | Current behavior | — | "SideStore renewal can use any working Wi-Fi network; cellular data alone is not supported by its current documentation." |

`Docs/Production/Roadmap.md:30` (iPhone expiration warning "Implementation complete"), `:31` (setup card Complete), `:35` (eight-day unattended SideStore renewal Pending), `:36` (distribution Complete), `:37` (update check "Implementation complete", device confirmation remaining).

Proven: SideStore install through iLoader, USB IPA import, SideStore `+` registration, LocalDevVPN connect, one charger-triggered refresh on an unlocked phone, and the hub opening, all on one phone on one day. Never proven: an eight-day unattended renewal on a locked phone, the warning on a real expiring profile, the warning reset after renewal, the `sidestore://install` handoff from the prompt, and any second iPhone.

## 10. Identifiers

| Identifier | Value | Source |
|---|---|---|
| iOS bundle identifier (built) | `com.danner.locationhelper` | `app/app.json:15`; `release/build-update-assets.mjs:61`; `tests/app-update/run.mjs:324`; `v1.4.16` IPA `Info.plist` |
| Bundle name and display name | `DannerApps`, `Danner Apps` | `v1.4.16` IPA `Info.plist`; `app/app.json:3` |
| iOS build number | `major * 10000 + minor * 100 + patch` from the tag, `"1"` without one | `app/app.config.js:25-28`; `app/app.json:16` |
| SideStore source identifier | `com.danner.locationhelper.source` | `release/build-update-assets.mjs:56` |
| SideStore source URL | `https://github.com/Danner36/Danner_App/releases/latest/download/sidestore-source.json` (historical: it stops resolving at `v1.5.0`, whose release has no `sidestore-source.json`; the last published copy is https://github.com/Danner36/Danner_App/releases/download/v1.4.16/sidestore-source.json) | `release/build-update-assets.mjs:34` |
| Install URL scheme | `sidestore://install?url=<encoded IPA URL>`; query scheme `sidestore` | `app/hub/appUpdate.ts:129-131`; `app/app.json:24-26` |
| Native module | package `danner-provisioning-profile`, pod `DannerProvisioningProfile`, class `DannerProvisioningProfileModule` | `Docs/Production/Validation.md:90` |
| Signer | Each phone's own free Apple Account; team identifier `<free team id>` per phone, never recorded | `AI_Framework/IPHONE_INSTALL.md:80` |
| Bundle identifier as installed on the phone | **Unknown** | See below |

Whether SideStore re-signed under a derived bundle identifier (for example `com.danner.locationhelper.<free team id>`) is not recorded. `AI_Framework/IPHONE_INSTALL.md` logged only the iLoader staging path `PublicStaging/DannerApps.app` (`:23`); `Docs/Production/Validation.md` has no row for it; `sidestore-source.json` names only the original `com.danner.locationhelper`, which is how a source identifies an app. The approved plan assumed a per-signer derived identifier: "iOS signer | The phone's own SideStore Apple Account (`AI_Framework/IPHONE_INSTALL.md`) | A different derived bundle id, so a new empty app" (`Docs/Production/ModularTeams.md:334`). No device read confirmed it. Either way, on-phone data (AsyncStorage, WebView cookies) was expected to last only while the phone kept the same bundle identifier and the same SideStore account (`Docs/Production/ModularTeams.md:20`, `:43`; [../FixedTeams/Hub.md §8](../FixedTeams/Hub.md#8-identifiers)). An install over that copy signed by a different Apple team was never tried.

## 11. Known pain points

1. One dedicated free Apple Account per phone, with saved iLoader logins that logged out on restart and could ask for 2FA on the phone (`AI_Framework/IPHONE_INSTALL.md:19`, `:80`, `:155`, `:163`).
2. A Windows PC with iLoader and Apple website iTunes was needed for every first install and every recovery from an expired SideStore. Microsoft Store iTunes did not work, and a quiet non-elevated iTunes install failed with `1603` (`AI_Framework/IPHONE_INSTALL.md:43`, `:167-174`; `release/IPHONE_SETUP.md:28`, `:162-164`).
3. Each phone needed developer-app trust, Developer Mode, and two restarts before SideStore ran (`release/IPHONE_SETUP.md:30-43`).
4. A USB install was invisible to SideStore. Every phone needed a second install of the same IPA through SideStore `+` before renewal worked (`AI_Framework/IPHONE_INSTALL.md:26`, `:65`; `release/IPHONE_SETUP.md:55`, `:64`).
5. The signature lasted 7 days and renewed only on Wi-Fi with LocalDevVPN connected; cellular alone never worked (`AI_Framework/IPHONE_INSTALL.md:119`). SideStore expired on the same clock, and an expired SideStore meant starting over from the PC (`release/IPHONE_SETUP.md:162-164`).
6. Renewal depended on a hand-built Shortcuts shortcut and charger automation on every phone, which did not copy between phones and could look idle for about 80 seconds on the first run (`AI_Framework/IPHONE_INSTALL.md:78`, `:111`). Silent renewal on a locked phone over eight days was never proven (`:31`, `:115`; `Docs/Production/Validation.md:23`; `Docs/Production/Roadmap.md:35`).
7. The hub warning appeared only in the final 48 hours and was never seen on a real expiring profile (`Docs/Production/Validation.md:21`). iOS normally does not launch an app whose profile has expired (Apple platform behavior, not recorded in this repository), so a lapsed phone needed SideStore or the PC, not the app.
8. Free accounts allowed three sideloaded apps; SideStore and Danner Apps used two (`AI_Framework/IPHONE_INSTALL.md:74`). iLoader could raise a maximum-certificates dialog (`:161`).
9. Updates on iPhone needed Wi-Fi, LocalDevVPN, and SideStore. The prompt handoff was never proven on a device (`Docs/Production/Validation.md:98`). Phones on builds without the checker, including `v1.3.3`, updated only by `+` (`AI_Framework/IPHONE_INSTALL.md:140`). `Refresh All` never picked up a new release (`:147`).
10. The agent could not perform any on-phone step: Trust, passcode, Developer Mode, VPN `Allow`, SideStore `+`, or Shortcuts (`AI_Framework/IPHONE_INSTALL.md:37`). Every install and recovery needed a person holding the phone.
11. Smaller drift: `sidestore-source.json` still described the app as `Guardians, Patriots, and TV Location.` (`release/build-update-assets.mjs:64`), and the card's `INSIDE DANNER APPS` still said "both app buttons" (`release/IPHONE_SETUP.md:83`).
12. The plan expected the iPhone container path to change across SideStore updates and stored logo files by relative path for that reason (`Docs/Production/ModularTeams.md:286`).

## 12. Where the method was written down

Every place that described or depended on this method at `19740af`:

| Location | What it said or did |
|---|---|
| `.github/workflows/release.yml:85-178`, `:206-253` | iOS job `Build SideStore IPA`; card copy; update assets; six-asset release |
| `release/IPHONE_SETUP.md:1-173` | Family card |
| `release/README.md:3-15` | Asset set, card summary, agent procedure link, workflow |
| `release/build-update-assets.mjs:33-34`, `:46-51`, `:54-79`, `:85-88` | IPA URL, manifest `ios` entry, SideStore source |
| `release/RELEASE_NOTES.md:12-15`, `:47-48` | iPhone install pointer; SideStore warning and handoff lines |
| `app/app.json:24-26` | `LSApplicationQueriesSchemes: ["sidestore"]` |
| `app/hub/appUpdate.ts:12-16`, `:129-131` | iPhone prompt and SideStore-missing strings; `sideStoreInstallUrl` |
| `app/hub/HubScreen.tsx:19`, `:23`, `:25`, `:30`, `:33`, `:46-79`, `:100-105`, `:149-159`, `:168`, `:188`, `:196-198`, `:241-256`, `:366-386` | Profile and warning imports, iPhone prompt and SideStore strings, profile read, warning, SideStore handoff, prompt suppression |
| `app/hub/provisioningWarning.ts:1-48` | Warning text |
| `app/hub/README.md:3`, `:8-11` | "On SideStore-signed iPhones…" |
| `app/modules/danner-provisioning-profile/**` | Native profile reader |
| `app/modules/README.md:8` | Module summary |
| `app/README.md:9`, `:72`, `:74`, `:80` | Hub summary with the signing warning, module, EAS note, SideStore delivery paragraph |
| `app/package.json:40-41` | `test:provisioning-warning`, `test:app-update` |
| `tests/provisioning-warning/run.mjs:1-52`; `tests/app-update/run.mjs:195-200`, `:323-327`; `tests/README.md:11-12` | Tests |
| `AI_Framework/IPHONE_INSTALL.md:1-196` | Agent procedure |
| `AI_Framework/AI_RULES.md:16`, `:17`, `:50`, `:51`, `:64`, `:65` | Rules (section 8) |
| `AI_Framework/AI_ONBOARDING.md:9`, `:17`, `:26`; `AI_Framework/README.md:9` | Status summary and reading order |
| `Docs/README.md:32-33`; `Docs/Production/README.md:12` | Index links to the procedure and card |
| `Docs/Anchor/Vision.md:39`, `:41` | Distribution and warning in the product vision |
| `Docs/Technical/Stack.md:26`, `:47`, `:57`, `:59`, `:66`, `:73`, `:116`, `:123`, `:125` | Module, hub warning text, EAS, release workflow, release folder, `test:provisioning-warning`, SideStore delivery |
| `Docs/Production/Roadmap.md:26`, `:30`, `:31`, `:35-37` | EAS internal-distribution profiles, expiration warning, setup card, renewal, distribution, and update rows |
| `Docs/Production/Validation.md:11`, `:14`, `:19-23`, `:83-92`, `:96`, `:98`, `:107`, `:117-122`, `:142` | Validation rows (section 9), the bug-pass run of `test:provisioning-warning` (`:11`), and the direct-delivery signing note (`:107`) |
| `Docs/Production/ModularTeams.md:20`, `:43`, `:71`, `:125`, `:243`, `:286`, `:333-334`, `:340`, `:355-356`, `:695`, `:697`, `:736`, `:754`, `:773`, `:813`, `:815`, `:819`, `:841-842` | Plan text that assumed SideStore: persistence across SideStore install-overs, the kept SideStore account, O16's draft IPA over `v1.4.16`, the unchanged `provisioningWarning.ts`, the signing-warning reserve in the hub grid, the container-path note, identity constants, the install-only-from-releases note, the iPhone seeding rows for install-overs, the podspec modeled on the profile module, the draft-IPA verify check, the Phase 6 rewrite list, the provisioning-warning suite in `test:all`, the hotfix branch from `v1.4.16`, the draft-IPA install by SideStore `+`, family updates through SideStore with LocalDevVPN, the closing of `Validation.md:98`, and the identity-drift and install-source risks |
| [../FixedTeams/Hub.md](../FixedTeams/Hub.md) §5, §7.5–7.7, §8, §11 | The same app and release internals at `823d2be` |

## 13. Rebuild

1. Restore the iPhone-only files from the tag `iphone-sidestore-final` (`19740af`): `git checkout 19740af1ff0a7f5d88873e855cf79889feef1f20 -- app/modules/danner-provisioning-profile app/hub/provisioningWarning.ts release/IPHONE_SETUP.md AI_Framework/IPHONE_INSTALL.md tests/provisioning-warning`.
2. Reapply the cited lines, not whole files, where later work has changed the file: the unsigned iOS job (`CODE_SIGNING_ALLOWED=NO`) and the six-asset release in `.github/workflows/release.yml:85-178`, `:206-253`; the IPA URL, the manifest `ios` entry, and the SideStore source in `release/build-update-assets.mjs:33-34`, `:46-51`, `:54-79`, `:85-88` (the same file writes the Android manifest, so restoring it whole would undo later manifest changes); `sideStoreInstallUrl` and the iPhone strings in `app/hub/appUpdate.ts:12-16`, `:129-131`; the profile read, warning, and iPhone Yes branch in `app/hub/HubScreen.tsx` (section 6); `LSApplicationQueriesSchemes` in `app/app.json:24-26`; `test:provisioning-warning` in `app/package.json:40`; the asset list in `release/README.md:3-11`; the rules in section 8.
3. Keep `CODE_SIGNING_ALLOWED=NO` and `CODE_SIGNING_REQUIRED=NO`; no Apple secrets go into CI.
4. Per phone: create a dedicated free Apple Account, then follow `release/IPHONE_SETUP.md` from `ON IPHONE` through `CHARGER REFRESH` (agent detail in `AI_Framework/IPHONE_INSTALL.md:39-52`). The PC needs iLoader and Apple website iTunes once.
5. Confirm on each phone: SideStore `My Apps` shows SideStore and Danner Apps at `7 DAYS`, and one charger plug on Wi-Fi refreshes both.

A rebuild after iPhones have used a paid-team build gives each iPhone another new, empty app, because the signer changes again: selections, logos, the TV point, and the Google session do not carry over from the paid-team copy.

## Permalinks

- Last SideStore release page: https://github.com/Danner36/Danner_App/releases/tag/v1.4.16
- Last SideStore IPA: https://github.com/Danner36/Danner_App/releases/download/v1.4.16/Danner-Apps-iOS.ipa
- Last family card asset: https://github.com/Danner36/Danner_App/releases/download/v1.4.16/IPHONE_SETUP.md
- Last SideStore source asset: https://github.com/Danner36/Danner_App/releases/download/v1.4.16/sidestore-source.json
- Release workflow, iOS job: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/.github/workflows/release.yml#L85-L178
- Release workflow, release job: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/.github/workflows/release.yml#L180-L253
- Update assets writer: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/release/build-update-assets.mjs#L1-L88
- SideStore source object: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/release/build-update-assets.mjs#L54-L79
- Family card: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/release/IPHONE_SETUP.md#L1-L173
- Release set README: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/release/README.md#L1-L15
- Release notes iPhone lines: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/release/RELEASE_NOTES.md#L12-L15
- Agent procedure: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/AI_Framework/IPHONE_INSTALL.md#L1-L196
- Last proven session: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/AI_Framework/IPHONE_INSTALL.md#L9-L31
- Charger automation: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/AI_Framework/IPHONE_INSTALL.md#L86-L115
- iLoader UI Automation: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/AI_Framework/IPHONE_INSTALL.md#L149-L163
- Rules, environment: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/AI_Framework/AI_RULES.md#L16-L17
- Rules, warning and update prompt: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/AI_Framework/AI_RULES.md#L50-L51
- Rules, distribution and identity: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/AI_Framework/AI_RULES.md#L64-L65
- Update prompt strings and SideStore URL: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/app/hub/appUpdate.ts#L1-L188
- Hub profile read: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/app/hub/HubScreen.tsx#L46-L79
- Hub iPhone Yes branch: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/app/hub/HubScreen.tsx#L149-L159
- Hub offer check: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/app/hub/HubScreen.tsx#L166-L218
- Hub warning render: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/app/hub/HubScreen.tsx#L241-L256
- Hub warning styles: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/app/hub/HubScreen.tsx#L366-L386
- Warning text: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/app/hub/provisioningWarning.ts#L1-L48
- Profile reader (Swift): https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/app/modules/danner-provisioning-profile/ios/DannerProvisioningProfileModule.swift#L1-L72
- Profile reader (JS): https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/app/modules/danner-provisioning-profile/src/index.ts#L1-L20
- Profile pod: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/app/modules/danner-provisioning-profile/ios/DannerProvisioningProfile.podspec#L1-L20
- Bundle id and query scheme: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/app/app.json#L13-L31
- Build number bake: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/app/app.config.js#L18-L28
- Warning tests: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/tests/provisioning-warning/run.mjs#L1-L52
- Update tests, SideStore URL: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/tests/app-update/run.mjs#L195-L200
- Update tests, source writer: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/tests/app-update/run.mjs#L323-L327
- Validation, warning rows: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/Docs/Production/Validation.md#L19-L23
- Validation, iPhone and release rows: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/Docs/Production/Validation.md#L83-L98
- Validation, release artifacts: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/Docs/Production/Validation.md#L111-L123
- Roadmap rows: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/Docs/Production/Roadmap.md#L31-L37
- Vision distribution lines: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/Docs/Anchor/Vision.md#L39-L41
- Stack delivery paragraphs: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/Docs/Technical/Stack.md#L123-L125
- Plan identity constants: https://github.com/Danner36/Danner_App/blob/19740af1ff0a7f5d88873e855cf79889feef1f20/Docs/Production/ModularTeams.md#L326-L340
