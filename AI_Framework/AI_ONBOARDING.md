# AI Onboarding

## Project

`Danner_App` is a cross-platform Expo app for Danner family tools. Its logo-only hub opens a Cleveland Guardians dashboard from the left artwork tile and `TV Location` from the right YouTube TV tile. The Guardians module loads the current record, today's or an active game, score, and remaining schedule from MLB. Today's game receives a countdown and approved icon-only Play controls become available 15 minutes before game time. After Final, the featured card stays as today's recap through local midnight of that official date. Playback sources come from root `guardians_streams.json` on GitHub and match by date and game number. Get video, Listen, and Send to TV appear when their env and source conditions are met. HTTPS is the default and each cleartext HTTP source requires an explicit opt-in. Android and iPhone share the same parent-friendly TV Location flow, bundled nationwide map, and offline city search without changing device GPS. Android Cast still declares fine location for Chromecast discovery.

## Phase

The logo-tile hub, iPhone final-48-hour signing warning, Guardians today countdown, live score, post-game recap, date-matched remote source list, Get video, Listen, Cast and TV send, native direct-media player, isolated approved-page player with popup and redirect gating, explicit HTTP-source support, repo-only today/ready/delayed/live/final/get-video harness, guided TV Location flow, automatic return from YouTube `Next`, offline U.S. map, named-place storage, Android standalone build, signed-in YouTube location acceptance, Android emulator interactions, Android/iOS production bundle compilation, portable iPhone setup and recovery links, and GitHub-hosted Android and iPhone release artifacts are implemented. Root `guardians_streams.json` already holds dated production `web` entries plus the inactive example. Play still requires a date- and game-number match for the featured game. The delivery target is direct installation only. Latest published family tag is `v1.3.2`. Physical iPhone first-time SideStore, USB IPA install, LocalDevVPN, SideStore `+` registration, hub plus both modules, and one proven charger `Refresh SideStore` automation from this Windows PC are recorded in [IPHONE_INSTALL.md](IPHONE_INSTALL.md). Eight-day locked-phone silent renewal and physical target-device and TV validation remain. [Docs/Production/Validation.md](../Docs/Production/Validation.md) is the current status source of truth.

## Context hierarchy

| File | Role |
|------|------|
| `AI_Framework/AI_RULES.md` | Agent behavior and product invariants |
| `AI_Framework/AI_ONBOARDING.md` | Repository-wide orientation |
| `AI_Framework/IPHONE_INSTALL.md` | Windows physical iPhone SideStore and IPA procedure |
| `README.md` | Per-directory overview at useful folder tiers |

Each tier `README.md` covers its folder and immediate subfolders only. Cross-cutting sources of truth are listed in [Docs/README.md](../Docs/README.md).

## Read order

1. [AI_RULES.md](AI_RULES.md)
2. `AI_ONBOARDING.md`
3. [IPHONE_INSTALL.md](IPHONE_INSTALL.md) when the task installs, refreshes, or recovers the iPhone app
4. Tier `README.md` files from the repository root through the working directory
5. Relevant source-of-truth documents from `Docs/README.md`

## Tier README criteria

Create or update a tier README when a directory boundary, responsibility, dependency rule, or non-obvious invariant changes. Routine implementation, bug fixes, generated output, and line-level history do not require README changes.
