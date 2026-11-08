# AI Onboarding

## Project

`Danner_App` is a cross-platform Expo app for Danner family tools. Its logo-only hub shows the teams each phone chose, then `TV Location`, then `+`, which opens the team picker: league or college sport, then team or school, then sports for a school. A first install shows only `TV Location` and `+`; a phone upgraded from `v1.x` is seeded with Cleveland Guardians, New England Patriots, and Iowa State Cyclones. One team screen serves every tile from MLB statsapi or ESPN JSON, with today's game receiving a countdown and approved icon-only Play controls 15 minutes before game time, an ESPN-based win chance bar, and a Final recap through local midnight. Playback sources come from each team's streams file through Worker v2, with Get video, Listen, and Send to TV when their env and source conditions are met. HTTPS is the default and each cleartext HTTP source requires an explicit opt-in. Android and iPhone share the same parent-friendly TV Location flow, bundled nationwide map, and offline city search without changing device GPS. Android Cast uses Nearby Wi-Fi and does not request location permission.

## Phase

The logo-tile hub, iPhone final-48-hour signing warning, Guardians today countdown, live score, post-game recap, date-matched remote source list, Get video, Listen, Cast and TV send, native direct-media player, isolated approved-page player with popup and redirect gating, explicit HTTP-source support, repo-only today/ready/delayed/live/final/get-video harness, guided TV Location flow, automatic return from YouTube `Next`, offline U.S. map, named-place storage, Android standalone build, signed-in YouTube location acceptance, Android emulator interactions, Android/iOS production bundle compilation, portable iPhone setup and recovery links, and GitHub-hosted Android and iPhone release artifacts are implemented. The Patriots sibling dashboard, football scoreboard, root `patriots_streams.json`, shared Worker `module` parameter, and Patriots GitHub Action are implemented in source. The Cyclones sibling dashboard, three-sport ESPN merge, root `cyclones_streams.json`, Worker `module: "cyclones"` with `sport`, and Cyclones GitHub Action are implemented in source. Family phones need `v1.4.9` or newer to show the Cyclones tile. Latest published family tag is `v1.4.16`. Root `guardians_streams.json` already holds dated production `web` entries plus the inactive example. Play still requires a date- and game-number match for the featured game. The delivery target is direct installation only. Release builds bake the release tag into the app version. The hub can compare GitHub `version-manifest.json` and offer an Android in-place install or a SideStore IPA handoff. Physical iPhone first-time SideStore, USB IPA install, LocalDevVPN, SideStore `+` registration, hub plus both modules, and one proven charger `Refresh SideStore` automation from this Windows PC are recorded in [IPHONE_INSTALL.md](IPHONE_INSTALL.md). Eight-day locked-phone silent renewal, the two-row hub plus Patriots tile on installed phones, and physical target-device and TV validation remain. [Docs/Production/Validation.md](../Docs/Production/Validation.md) is the current status source of truth. The approved [modular teams plan](../Docs/Production/ModularTeams.md) replaces the fixed Guardians, Patriots, and Cyclones modules in phases; [Docs/Archive/FixedTeams/](../Docs/Archive/FixedTeams/README.md) records the fixed design.

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
