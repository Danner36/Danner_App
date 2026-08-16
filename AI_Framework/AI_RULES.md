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
- Documentation writes require owner approval. The owner approved full documentation alignment for this reconstruction.
- Keep changes surgical when a local edit is sufficient.
- Report what was attempted and request device verification for behavior that cannot be proven locally.
- Provide a sorted, repository-relative list of touched paths at handoff.
- Default to concise, high-level replies.

## Product constraints

- Preserve the original app's YouTube TV playback-area purpose while using the parent-friendly guided interface on Android and iPhone.
- Allowed verification URL: `https://tv.youtube.com/verify` and redirects initiated by that page.
- Default the selected destination to Tripoli, Iowa at `42.808371, -92.2578433`.
- Let the destination be chosen from the bundled U.S. map or offline city search, display the nearest town or city rather than coordinates, and save the point locally for later launches.
- Inject the selected coordinates into the verification WebView's browser Geolocation API. Do not modify device GPS, request device location, launch a separate mock-location app, or claim that phone location changed.
- Keep the main hub logo-only: center the 210dp Danner branding one-third down the usable screen, then center a row of 101.2dp artwork tiles with a 28dp gap two-thirds down. The disabled Cleveland Guardians tile stays left and the frequently used YouTube TV tile stays rightmost. Do not add menu headings, prompts, or tile descriptions.
- Inside `TV Location`, keep four explicit guided steps, large controls, large text, highlighted current work, automatic scrolling to the next action, and clear completion/retry states. Step 3 exposes only its update button, returns to step 4 after YouTube's `Next` control is activated, and does not expose coordinate-bridge diagnostics. Step 4 identifies the `Welcome to...` message as appearing on the TV.
- Platforms: Android and iPhone from one Expo app.
- Preserve Android version `1.0`, version code 1, and minimum SDK 29; use the current target SDK required by the maintained toolchain.
- Branding: Danner green and white script logo in `Docs/Art/media/ic_launcher_danner.jpg`.
