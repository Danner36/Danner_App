# AI Onboarding

## Project

`Danner_App` is a cross-platform Expo app for Danner family tools. Its logo-only hub shows the teams each phone chose, then `TV Location` when it has been added, then `+`, which opens the team picker: league or college sport, then team or school, then sports for a school, with `Custom modules` as the last row. A long press on a tile opens its move and remove actions. A first install shows only `+`; a phone updated from `v1.x` is seeded with Cleveland Guardians, New England Patriots, and Iowa State Cyclones. One team screen serves every tile from MLB statsapi or ESPN JSON, with today's game receiving a countdown and approved icon-only Play controls 15 minutes before game time, an ESPN-based win chance bar, and a Final recap through local midnight. Playback sources come from each team's streams file through Worker v2, with Get video, Listen, and Send to TV when their env and source conditions are met. HTTPS is the default and each cleartext HTTP source requires an explicit opt-in. Android and iPhone share the same parent-friendly TV Location flow, bundled nationwide map, and offline city search without changing device GPS. Android Cast uses Nearby Wi-Fi and does not request location permission.

## Phase

The app is on version 2, first released as `v2.0.1`. [Docs/Production/Validation.md](../Docs/Production/Validation.md) is the current status source of truth, and the approved [modular teams plan](../Docs/Production/ModularTeams.md) holds the phases not yet finished. [Docs/Archive/FixedTeams/](../Docs/Archive/FixedTeams/README.md) records the earlier fixed-team design.

| Area | Current state |
|------|---------------|
| Hub and picker | `app/hub/`, `app/picker/`, `app/selection/`. The picker offers MLB, NFL, NCAA football, men's basketball, and women's basketball; other leagues stay hidden until their probes and fixtures pass (`catalog/`, `tests/leagues/`) |
| Team screen | One engine in `app/team/` for all teams, with league adapters in `app/leagues/` |
| Logos | Every team logo is an ESPN URL from the catalog, cached by `app/logos/logoStore.ts`, shown contained on white with 12% padding, with the abbreviation as the fallback. Bundled art is only the Danner logo and the YouTube TV logo |
| Streams | `streams/<league>/<espnId>.json`, read through the Worker, then raw GitHub |
| Pipeline | `scripts/stream-pipeline/` with `.github/workflows/stream-pipeline.yml`, started by `repository_dispatch` type `team-get-video` |
| Worker | Source `workers/team-worker/`, deployed by hand through `worker-deploy.yml` to the frozen Cloudflare name `guardians-get-video`. The app authenticates with an app key (`EXPO_PUBLIC_DANNER_APP_KEY`) and finds the Worker through `EXPO_PUBLIC_DANNER_WORKER_URL` |
| Releases | `release.yml` builds an Android APK and an unsigned SideStore IPA. A new major version is a draft that the owner publishes; minor and patch versions publish directly. Android updates through the in-app prompt. iPhones stay on SideStore through [IPHONE_INSTALL.md](IPHONE_INSTALL.md). The paid Apple Developer path is Phase 1b of the plan and is not built |
| Tests | `npm run test:all` in `app/`, plus the suites in `scripts/stream-pipeline`, `workers/team-worker`, and `scripts/team-catalog` |

Not yet tested on v2: TV send, any iPhone run, and a physical second Google account. Eight-day locked-phone SideStore renewal and physical target-device and TV validation also remain.

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
