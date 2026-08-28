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
- Inject the selected coordinates into the verification WebView's browser Geolocation API. Do not modify device GPS, request device location, launch a separate mock-location app, or claim that phone location changed.
- Keep the main hub logo-only: center the 210dp Danner branding one-third down the usable screen, then center a row of 101.2dp artwork tiles with a 28dp gap two-thirds down. The active Cleveland Guardians tile stays left and the frequently used YouTube TV tile stays rightmost. Do not add menu headings, prompts, or tile descriptions.
- On iPhone only, allow the signing-health exception above the Danner logo during the final 48 hours of the embedded provisioning profile. Keep it to the expiration text plus `Connect to Wi-Fi and charge phone to fix`. Do not show it when more than 48 hours remain, when no embedded profile exists, or on Android.
- The Guardians screen fetches the current record, game state, score, and remaining schedule from MLB when opened and refreshes every minute. Promote an in-progress game or today's next game above the schedule. Today's scheduled game shows a one-second countdown; delayed, postponed, suspended, and canceled games state that condition directly. Never show completed games in the schedule; format game times in the phone's time zone.
- Guardians video playback uses `guardians_streams.json`, matched by MLB official date and game number. Fetch that GitHub file on screen open, pull-to-refresh, and every minute; cache the last valid file for network failures. Keep its direct `HOW_TO_GUIDE` and complete inactive six-field example inside `streams`. Do not require the owner to enter an MLB identifier or source display name. Show icon-only Play actions starting 15 minutes before game time; if no matching URL is ready, say so and keep checking automatically. HTTPS is the default; cleartext HTTP is accepted only when that entry sets `allowInsecureHttp: true`. Prefer direct media in the native player; isolate YouTube and other approved player pages in restricted WebViews. Intercept new-window requests, promote only targets on the source's exact trusted hosts into the isolated player, and discard all other popup targets without loading them.
- Guardians test fixtures stay under `tests/guardians/`, are served from port 8108, and can be read only by a development build with `EXPO_PUBLIC_GUARDIANS_TEST_URL` set. Never import test fixtures into the Expo asset graph or enable the harness in production.
- Inside `TV Location`, keep four explicit guided steps, large controls, large text, highlighted current work, automatic scrolling to the next action, and clear completion/retry states. Step 3 exposes only its update button, returns to step 4 after YouTube's `Next` control is activated, and does not expose coordinate-bridge diagnostics. Step 4 identifies the `Welcome to...` message as appearing on the TV.
- Platforms: Android and iPhone from one Expo app.
- Distribution: direct device installation only. Produce an installable signed APK for Android and a SideStore-compatible IPA for iPhone. Each GitHub release carries both Danner artifacts and `release/IPHONE_SETUP.md`. That setup card links to the official LocalDevVPN App Store listing, SideStore instructions, current iLoader release, and Apple's 64-bit iTunes download; do not mirror third-party binaries. iLoader on Windows requires Apple website iTunes (not the Microsoft Store) so Apple Mobile Device Service can see the phone. A logged-in iLoader session may also `Import IPA` over USB. Use a free dedicated Apple Account and any working Wi-Fi for SideStore renewal; cellular data alone is not a supported refresh path. Do not require paid Apple Developer membership or add app-store submission work.
- Preserve Android version `1.0`, version code 1, and minimum SDK 29; use the current target SDK required by the maintained toolchain.
- Branding: Danner green and white script logo in `Docs/Art/media/ic_launcher_danner.jpg`.
