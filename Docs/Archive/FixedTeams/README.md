Status: ARCHIVED
Snapshot: 823d2be (2026-10-31)

# Fixed Teams Archive

This folder is the permanent record of the fixed three-team design of Danner Apps, "the way it used to be." The hub carried exactly four hard-coded tiles: Cleveland Guardians (MLB statsapi), New England Patriots (ESPN NFL), Iowa State Cyclones (ESPN college football, men's basketball, and women's basketball), and the YouTube TV `TV Location` tile with a compiled-in Tripoli, Iowa default. Each team had its own screen copy, root streams file, Worker `module`, `repository_dispatch` type, GitHub Actions workflow, and pipeline config secret, all sharing one Cloudflare Worker and one family PIN. The rules file and the Cyclones delivery brief ruled out a parameterized sports engine. That design was replaced by the modular-teams plan in [Docs/Production/ModularTeams.md](../../Production/ModularTeams.md): teams chosen on each phone, one generic team engine, and one generic stream pipeline, planned as a clean cutover: every family phone was to be updated, so no route, dispatch type, secret, streams file, or parser rule of this design was kept for older builds. The files here describe the old behavior in enough detail to rebuild it.

## Pinned commit

| Item | Value |
|---|---|
| Commit | `823d2be562d252c9f3b0da305275adc6d8498f55` (short `823d2be`) |
| Branch and date | `main`, 2026-10-31 22:50 UTC |
| Commit subject | `cyclones: update stream for 2026-10-31 game 1` (a pipeline write by `github-actions[bot]`) |
| Tree at that commit | https://github.com/Danner36/Danner_App/tree/823d2be562d252c9f3b0da305275adc6d8498f55 |
| Last family release of this design | `v1.4.16` (2026-10-13, commit `d8d847f`; `Docs/Production/Validation.md:92`) |
| Code drift from `v1.4.16` | None. The 8 commits from `v1.4.16` to `823d2be` changed only Markdown docs, READMEs, `release/RELEASE_NOTES.md`, and the three root streams files; app, pipeline, Worker, and workflow code were identical to the shipped release |
| Recommended tag | `fixed-teams-final` (annotated, on `823d2be`). It did not exist on `origin` when this archive was written |

Tag commands:

```bash
git tag -a fixed-teams-final 823d2be562d252c9f3b0da305275adc6d8498f55 -m "Fixed three-team design archive snapshot"
git push origin fixed-teams-final
```

The tag keeps the commit reachable after the fixed-team files leave `main`, so every permalink in this folder keeps resolving. To inspect the old tree locally: `git worktree add ../Danner_App-fixed-teams fixed-teams-final`.

## Conventions

- Every `path:line` citation is at `823d2be`. A bare `:N` refers to the file named by the enclosing section, table, or row. In [Pipeline.md](Pipeline.md), `P/` means `scripts/guardians-stream-pipeline/`.
- Permalink form: `https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/<path>#L<a>-L<b>`.
- Behavior is described in the past tense. Quoted rule text keeps its original wording.
- Withheld everywhere: secret values, the family PIN and the harness debug PIN, the listing site (written `<listing site>`), the provider player host value (named only by its identifier `GOOZ_HOST`), stream embed ids, the Worker's `workers.dev` account subdomain (written `<account>`), Apple account details, and device identifiers.
- Test and run results quoted here were re-checked on 2026-11-01 against `823d2be`: the pipeline `node --test` suite passed 65 of 65 and the three team snapshot tests passed (Node 22, no device).

## Index

| File | Covers |
|---|---|
| [Hub.md](Hub.md) | `App.tsx` screen switch; hub layout math and the four hard-coded tiles; bundled artwork and provenance; iPhone signing-expiration warning; release-tag version bake; GitHub-release update prompt (Android in-app APK install, iPhone SideStore handoff); app identifiers and permissions; AsyncStorage keys; build-time env vars |
| [Guardians.md](Guardians.md) | MLB statsapi endpoints and parse; official date; featured-game selection; featured card, park scoreboard, 5 s live poll; ESPN win chance; streams schema and fetch chain; Get video; the shared playback stack (Play modal, `direct`, `youtube`, isolated `web` WebView, Listen, Cast, TV send and the LAN HLS relay); harness |
| [Patriots.md](Patriots.md) | ESPN NFL schedule across season types; computed W–L–T record; Eastern official dates; football board and summary poll; differences from Guardians; `module: "patriots"` Get video; harness |
| [Cyclones.md](Cyclones.md) | Three ESPN NCAA sports under one tile; per-sport failure isolation; season-year rules; Chicago official dates with Eastern TBA dates; records and postseason status lines; basketball and football boards; streams entries with `sport`; `{ module, sport }` Get video; harness |
| [TvLocation.md](TvLocation.md) | The Tripoli default and every place it lived; `danner.destination.v1`; four guided steps; offline U.S. map page and its Census build; `tv.youtube.com/verify` WebView, navigation gate, in-WebView Google sign-in; Geolocation injection and `Next` automation; Android cookie flush |
| [Pipeline.md](Pipeline.md) | `scripts/guardians-stream-pipeline/`: CLI and env; config keys and the three committed examples; module table; `--check-config`; MLB, NFL, and NCAA schedule libraries; featured-game tiers and window; run sequence and outcome codes; Playwright listing extraction and log redaction; playable check; streams upsert and prune; GitHub contents publish; local helpers; 65 unit tests |
| [WorkerAndWorkflows.md](WorkerAndWorkflows.md) | Cloudflare Worker `guardians-get-video` (routes, check order, rate limit, ETag streams cache, dispatch); the three stream workflows and their differences; observed run times; `release.yml` and release assets; full secrets and environment inventory (names only) |
| [StreamsFiles.md](StreamsFiles.md) | The three root streams files: shape, `HOW_TO_GUIDE` text, inactive example, entries at the snapshot, matching keys, phone fetch order and cache, Worker serving, pipeline writes, owner hand-editing |
| [TestsAndRules.md](TestsAndRules.md) | Per-team fixture servers, scenario and Get video drivers, ports 8108–8113, snapshot tests, npm scripts, CI coverage, and the `AI_Framework/AI_RULES.md` lines that fixed the hub, the three sibling modules, and the TV Location default |

## At a glance

| Tile (hub position) | Data source | Team ids | Official-date zone | Streams file | Worker `module` | Dispatch type | Workflow (`TZ`) | Config secret |
|---|---|---|---|---|---|---|---|---|
| Cleveland Guardians (row 1 left) | MLB statsapi schedule and AL standings; ESPN MLB win chance | MLB `114` (`leagueId` `103`); ESPN `5` | MLB `officialDate`; pipeline "today" in America/New_York | `guardians_streams.json` | `guardians`, or omitted | `guardians-get-video` | `guardians-stream-pipeline.yml` (America/New_York) | `GUARDIANS_STREAM_PIPELINE_CONFIG` |
| New England Patriots (row 1 right) | ESPN site API NFL schedule, season types 1, 2, 3; ESPN core win chance | ESPN `17` | America/New_York date of kickoff | `patriots_streams.json` | `patriots` | `patriots-get-video` | `patriots-stream-pipeline.yml` (America/New_York) | `PATRIOTS_STREAM_PIPELINE_CONFIG` |
| Iowa State Cyclones (row 2 left) | ESPN site API college football, men's and women's college basketball, season types 1, 2, 3 each; ESPN core win chance | ESPN `66` in all three sports | America/Chicago date of kickoff; America/New_York date when the time was TBA | `cyclones_streams.json` (entries carry `sport`) | `cyclones` plus `sport` | `cyclones-get-video` | `cyclones-stream-pipeline.yml` (America/Chicago) | `CYCLONES_STREAM_PIPELINE_CONFIG` |
| TV Location (row 2 right) | `https://tv.youtube.com/verify` in a WebView with injected Geolocation; bundled offline U.S. map (2025 Census) | none | none | none | none | none | none (shipped only in `release.yml` builds) | none |

Shared by the three team tiles:

| Item | Value |
|---|---|
| Worker | Cloudflare `guardians-get-video`; secrets `FAMILY_PIN`, `GITHUB_TOKEN`; `[vars] GITHUB_REPO`; routes `GET /health`, `GET /streams?module=`, `POST /get-video` |
| App build secrets | `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL`, `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` (Guardians-named, used by all three) |
| Pipeline package | `scripts/guardians-stream-pipeline/` (Guardians-named, used by all three); run as `xvfb-run -a node run.mjs` |
| On-phone stream cache keys | `danner.guardians.sources.v2`, `danner.patriots.sources.v1`, `danner.cyclones.sources.v1` |
| Cadences | streams every 60 s while open; schedule every 10 min; live board 5 s; countdown 1 s (30 s when delayed); win chance 10 min pre-game, 30 s live; Get video poll 5 s for up to 5 min |
| Video window | Play and Get video from 15 minutes before the start |
| Playback stack | Imported from `app/guardians/` by Patriots and Cyclones |
| TV Location state | `danner.destination.v1`; default `Tripoli, Iowa` at `42.808371, -92.2578433` |

## Governing documents at the snapshot

These were current docs at `823d2be` and are expected to be rewritten or removed by the modular-teams work. The links pin the old text.

- Rules: [AI_Framework/AI_RULES.md](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/AI_Framework/AI_RULES.md#L40-L63) (product constraints, lines 40-63)
- Domain: [Guardians.md](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/Docs/Domain/Guardians.md), [Patriots.md](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/Docs/Domain/Patriots.md), [Cyclones.md](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/Docs/Domain/Cyclones.md), [Playback.md](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/Docs/Domain/Playback.md)
- Delivery brief: [Docs/Production/Cyclones.md](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/Docs/Production/Cyclones.md)
- Status: [Docs/Production/Roadmap.md](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/Docs/Production/Roadmap.md), [Docs/Production/Validation.md](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/Docs/Production/Validation.md)
- Product intent: [Docs/Anchor/Vision.md](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/Docs/Anchor/Vision.md)
- Worker operations: [workers/guardians-get-video/README.md](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/workers/guardians-get-video/README.md)
