# AI Rules

Read this file before any other work in this repository. Then read [AI_ONBOARDING.md](AI_ONBOARDING.md).

## Context files

- At task start, read every tier `README.md` from the repository root down to the working directory before exploring code or editing files.
- For cross-cutting tasks, read the context chain for every edited directory tree.
- At task end, update a tier README only when its directory boundary, responsibility, or non-obvious invariant changed.

## Environment

- Development target is Windows.
- Prefer PowerShell for shell commands.
- If a local preview server is added, prefer port 8108, then scan 8108 through 8127.
- Physical iPhone install, SideStore, IPA sideload, and signing refresh follow [IPHONE_INSTALL.md](IPHONE_INSTALL.md). Windows has no iOS ADB and no Xcode.
- Do not print Apple Account emails, passwords, 2FA codes, pairing files, or device UDIDs.

## Generated material

- No troubleshooting or best-practice asides in generated material.
- Avoid stock filler, hype language, and slanted text.
- Drop abandoned work silently.

## Comments and documentation

- Comments are not conversational and do not use `we` or `user`.
- Comments and docs describe current behavior only.
- Keep validation results synchronized with [../Docs/Production/Validation.md](../Docs/Production/Validation.md).

## Edits and communication

- Summarize the implementation scope before editing.
- Documentation writes require owner approval.
- Keep changes surgical when a local edit is sufficient.
- Report what was attempted and request device verification for behavior that cannot be proven locally.
- Provide a sorted, repository-relative list of touched paths at handoff.
- Default to concise, high-level replies.

## Product constraints

- Preserve the Danner family app hub, Guardians module, YouTube TV playback-area purpose, and parent-friendly interfaces on Android and iPhone.
- Allowed verification URL: `https://tv.youtube.com/verify` and redirects initiated by that page.
- Default the selected destination to Tripoli, Iowa at `42.808371, -92.2578433`.
- Let the destination be chosen from the bundled U.S. map or offline city search, display the nearest town or city rather than coordinates, and save the point locally for later launches.
- Inject the selected coordinates into the verification WebView's browser Geolocation API. Do not modify device GPS, request device location, launch a separate mock-location app, or claim that phone location changed. TV Location does not read GPS. Android Cast uses Nearby Wi-Fi with `neverForLocation` and does not declare or request fine location.
- Keep the main hub logo-only: center the 210dp Danner branding one-third down the usable screen, then center a two-row 2×2 grid of 101.2dp artwork tiles with 28dp gaps so the cluster sits on the two-thirds line (`marginTop: -115.2`). Row 1 is Cleveland Guardians then New England Patriots. Row 2 is YouTube TV then a same-size reserved empty spacer with no button or accessibility role, so TV Location stays under Guardians. Do not add menu headings, prompts, or tile descriptions.
- On iPhone only, allow the signing-health exception above the Danner logo during the final 48 hours of the embedded provisioning profile. Keep it to the expiration text plus `Connect to Wi-Fi and charge phone to fix`. Do not show it when more than 48 hours remain, when no embedded profile exists, or on Android.
- When a published GitHub release is newer than the embedded build version, the hub may show a yes/no update prompt on launch and when returning to the hub. Do not show it while the iPhone signing-health warning is visible, while Guardians, Patriots, or TV Location is open, or when the baked release version is absent. No dismisses the prompt until the app process exits. Android Yes downloads the release APK, verifies SHA-256, and opens the system installer. iPhone Yes opens SideStore with `sidestore://install?url=` for the release IPA. LocalDevVPN on Wi-Fi is still required for that SideStore install.
- The Guardians screen fetches the current record, game state, score, and remaining schedule from MLB when opened, on pull-to-refresh, and every ten minutes. A live featured game also refreshes its park-style scoreboard every five seconds while the screen is open. Promote an in-progress game, today's next game, or today's completed-game recap above the schedule. Today's scheduled game shows a one-second countdown; delayed, postponed, suspended, and canceled games state that condition directly. After Final, the featured card shows `WIN`, `LOSS`, or `TIE`, the score, and optional pitcher decisions without the park-style scoreboard, Play, Listen, or Get video. Never show completed games in the schedule; format game times in the phone's time zone.
- Guardians video playback uses `guardians_streams.json`, matched by MLB official date and game number. Fetch that file on screen open, pull-to-refresh, and every minute; cache the last valid file for network failures. Production fetches try `GET {GET_VIDEO_URL}/streams` first when that origin is set, then raw GitHub `main`. Get video and other `preferLive` loads also try raw GitHub by the latest commit SHA that touched the file. A later fetch that has no featured-game match does not wipe a URL the phone already has. Keep root-level `HOW_TO_GUIDE` and the complete inactive six-field example inside `streams`. Do not require the owner to enter an MLB identifier or source display name. Show icon-only Play actions starting 15 minutes before game time; if no matching URL is ready, say so and keep checking automatically. When `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` and `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` are set, show **Get video** in that same window. Get video POSTs `{ pin }` to `{GET_VIDEO_URL}/get-video`, then polls for a matching URL for up to 5 minutes. A matching `direct` source also shows Listen. Direct sources expose a header Cast control; `web` sources expose a header TV control that Casts a page-reported HLS, DASH, or MP4 URL when the injection names a matching content type, and otherwise captures the on-screen player; YouTube stays phone-only. Isolated `web` pages on iPhone report an Android Chrome user agent so the page serves the same player build as Android. HTTPS is the default; cleartext HTTP is accepted only when that entry sets `allowInsecureHttp: true`. Prefer direct media in the native player; isolate YouTube and other approved player pages in restricted WebViews. Intercept new-window requests, promote only targets on the source's exact trusted hosts into the isolated player, and discard all other popup targets without loading them.
- Guardians test fixtures stay under `tests/guardians/`, are served from port 8108 (Get video harness uses 8111 so it does not collide with Expo), and can be read only by a development build with `EXPO_PUBLIC_GUARDIANS_TEST_URL` set. Never import test fixtures into the Expo asset graph or enable the harness in production.
- The Patriots screen is a sibling of Guardians, not a parameterized sports engine. Fetch leftover preseason, regular-season, and playoff games from ESPN NFL site JSON for team 17 when opened, on pull-to-refresh, and every ten minutes. The hero record is regular-season W–L or W–L–T and stays `0–0` until a regular-season game is Final. A live featured game refreshes a football scoreboard (quarters, clock, down and distance, possession) every five seconds. After Final, the featured card shows `WIN` / `LOSS` / `TIE` and the score through local midnight of the official date without the football board, Play, Listen, or Get video. Unknown kickoff times show `Time TBA` and do not count down. Playback uses root `patriots_streams.json` with the same six-field schema, matched by official date and game number. Official dates are the America/New_York calendar date of kickoff so phones and GitHub Actions agree. Production fetches try `GET {GET_VIDEO_URL}/streams?module=patriots` first. Get video POSTs `{ pin, module: "patriots" }` to the shared Worker and polls that module list. Reuse `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL`, `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN`, `FAMILY_PIN`, and `GITHUB_TOKEN`. Do not reuse `guardians-get-video` dispatch, `guardians-stream-pipeline.yml`, or `GUARDIANS_STREAM_PIPELINE_CONFIG`. Missing or legacy module stays `guardians`.
- Patriots test fixtures stay under `tests/patriots/`, are served from port 8108 (Get video harness uses 8112), and can be read only by a development build with `EXPO_PUBLIC_PATRIOTS_TEST_URL` set. Never import those fixtures into the Expo asset graph.
- Inside `TV Location`, keep four explicit guided steps, large controls, large text, highlighted current work, automatic scrolling to the next action, and clear completion/retry states. Step 3 exposes only its update button, returns to step 4 after YouTube's `Next` control is activated, and does not expose coordinate-bridge diagnostics. Step 4 identifies the `Welcome to...` message as appearing on the TV.
- Platforms: Android and iPhone from one Expo app.
- Distribution: direct device installation only. Produce an installable signed APK for Android and a SideStore-compatible IPA for iPhone. Each GitHub release carries both Danner artifacts, `release/IPHONE_SETUP.md`, `version-manifest.json`, and `sidestore-source.json`. That setup card links to the official LocalDevVPN App Store listing, SideStore instructions, current iLoader release, and Apple's 64-bit iTunes download; do not mirror third-party binaries. iLoader on Windows requires Apple website iTunes (not the Microsoft Store) so Apple Mobile Device Service can see the phone. A logged-in iLoader session may also `Import IPA` over USB. Use a free dedicated Apple Account and any working Wi-Fi for SideStore renewal; cellular data alone is not a supported refresh path. Do not require paid Apple Developer membership or add app-store submission work.
- Bake the GitHub release tag into `expo.version`, Android `versionCode`, and iOS `buildNumber` during the release build (`major * 10000 + minor * 100 + patch`). Local and development builds without `RELEASE_TAG` keep version `1.0` and code 1. Keep minimum SDK 29 and the current target SDK required by the maintained toolchain. Do not rotate the Expo debug keystore used by family APKs.
- Branding: Danner green and white script logo in `Docs/Art/media/ic_launcher_danner.jpg`.
