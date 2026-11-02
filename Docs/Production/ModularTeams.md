Status: ACTIVE
Phase: Approved plan, Phase 0

# Modular teams plan

This plan replaces the fixed Guardians, Patriots and Cyclones setup with a hub of teams that each phone chooses, one team-screen engine, one cloud pipeline, and a TV Location module that any person can use with their own YouTube TV account. The fixed-team design is recorded in `Docs/Archive/FixedTeams/` ("the way it used to be", pinned to `823d2be`). This plan cites current code only where it drives a decision. The owner approved this plan and every recommended default on 2026-11-02.

Do not print listing-site URLs, the app key, Google or Apple account data, device identifiers or any secret value in this plan, issues, logs or chat. Placeholders such as `<paste listing URL 1>` stand in for them.

## Summary

The owner approved every recommended default below; the tag in brackets names the decision.

- Family phones: the first launch of `v2.0.0` shows Guardians, Patriots, Cyclones, TV Location and `+` on every Android phone updated in place and on every iPhone that holds a v1.x stream cache or saved TV point. Any other phone shows TV Location and `+`; a family iPhone with no v1.x data adds the three teams through the normal picker. Team screens look and behave as they do today, apart from the rule fixes listed under Team screen engine.
- Fresh installs (other people, new phones) show only TV Location and `+`. `+` opens a picker: league or college sport, then team or school, then sports (schools only).
- Two or more sports from one school share one tile, with one featured card and one record per sport. Adding a sport merges it into the tile, and the tile goes away only when its last sport is removed. A pro team always gets its own tile.
- The grid grows (2×2, 3×2, 3×3, 4×4) and the tiles shrink to fit. Past 4 columns on a phone the grid scrolls, and the hub holds at most 30 team tiles [O18]. A long press on a team tile moves it, changes its sports or removes it.
- Every team screen has today's preset features: record, featured game, countdown, live board, Final recap, win chance, schedule, Play, Get video, Listen, Cast and TV send.
- Leagues ship in stages [O11]: `v2.0.0` has MLB, NFL, and NCAA football, men's basketball and women's basketball; `v2.1.0` adds NBA and WNBA; `v2.2.0` adds NHL, MLS and NWSL; `v2.3.0` adds other major categories [O12]. A league is offered only after a live probe in GitHub Actions confirms its ESPN data.
- Selections, logos, the TV location and the Google session live on the phone. They survive Android in-place updates and iPhone SideStore install-overs as long as the package id, bundle id, signing key and SideStore account stay the same. The release build checks the signing certificate.
- TV Location has no built-in location: each phone picks its default on first use, and upgraded phones that never saved a point choose once. Each person signs into their own YouTube TV account on Google's own page inside the app, and the app never sees or stores a password.
- Backend: one workflow, one dispatch type, one config secret, one pipeline package and one streams file per team (`streams/<league>/<espnId>.json`), all driven by a committed team catalog. It runs entirely in the cloud: GitHub Actions plus the existing Cloudflare Worker.
- The shared pipeline is protected by the catalog allowlist, a Worker check that the requested game is this team's and is in its video window, per-game dedupe, rate limits keyed by (IP, team), and caps on runs in flight and per hour [O8]. The app key baked into every build is not treated as a secret.
- The listing site gets ordered backups in the pipeline secret. A source is abandoned on a move-on failure (the site is down or blocked, or this game is not found or not playable there) and the next one is tried [O10]. The phone shows `Looking for video (2 of 3)…` while it waits. Backups reach today's pipeline before the cutover [O2].
- Clean cutover: one Worker deploy and one app release (`v2.0.0`) replace the old contract. Installed `v1.4.x` builds lose Play and Get video from the Worker deploy until they take the in-app update; scores and schedules keep working.

## Owner decisions

### Decided

| # | Decision | Where |
|---|---|---|
| 1 | Hub tiles are the selected teams in stored order, then TV Location (fixed), then `+`. A fresh install shows TV Location and `+`. The grid grows and the tiles scale. The fixed-layout rule (`AI_Framework/AI_RULES.md:47`) is rewritten | Hub |
| 2 | `+` picker: league or category, then team. College: school, then one or more sports. Sports from the same school share one tile (the Cyclones model). Adding a sport merges it into the tile; removing one keeps the tile until its last sport is gone. A pro team always has its own tile | Picker |
| 3 | Every selected team's screen has every preset feature | Team screen engine |
| 4 | One backend pipeline parameterized by league, team and sport. It runs on GitHub Actions and the existing Cloudflare Worker, with no home PC | Backend |
| 5 | Other people get the same build and use the same pipeline. The app key can be extracted from any build. Protection comes from the catalog allowlist, per-team and per-game dedupe, rate limits keyed by (IP, team), and bounded runs and commits | Worker v2; Abuse and quota bounds |
| 6 | Selections persist across future app updates on Android and iPhone | On-device persistence and preset seeding |
| 7 | Existing family phones get Guardians, Patriots and Cyclones automatically when they upgrade | Preset seeding (owner item 7) |
| 8 | TV Location stays a fixed tile outside the picker. Each person signs into their own YouTube TV account through an in-app Google sign-in with sign-in, switch-account and sign-out controls. No password is stored. The default location is chosen on first use, and the Tripoli default is removed | TV Location |
| 9 | Ordered backup listing sites live in the pipeline config and are tried one at a time. Scripts otherwise run as they do today: source 1 keeps today's timeouts and per-league grace | Pipeline secret and listing sources |
| 10 | `AI_Framework/AI_RULES.md` and every doc that forbids a parameterized engine or fixes the hub layout are rewritten | Rules, docs and tests |
| 11 | Clean cutover: no backward compatibility for `v1.4.x`. The Worker contract, workflows, secret, streams layout and schema may all change. Kept for future persistence: the Android package id and Expo debug keystore, the iOS bundle id and SideStore account, a rising versionCode, the Worker origin, and the update manifest that `v1.4.16` reads | Delivery phases |
| 12 | The fixed-team setup is archived in `Docs/Archive/FixedTeams/`, pinned to `823d2be`. This plan points to the archive and does not repeat it | Delivery phases |
| 13 | This plan is committed as `Docs/Production/ModularTeams.md` after the owner agrees to it | Delivery phases |
| 14 | GitHub Actions deploys the Worker with repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (follows from item 4; replaces the PC deploy in `workers/guardians-get-video/README.md:5-13`). The owner picks the token scope (Edit Cloudflare Workers template, one account) | CI and deploy |
| 15 | Every date and time on screen is shown in the phone's time zone. The official date in O4 is a hidden matching key only | Team screen engine |
| 16 | No built-in TV location anywhere. Upgraded phones that never saved a point choose one on first use, like any new install | TV Location |
| 17 | The picker is the same for every install. There is no family-specific row; a family phone the seeding signals miss adds its teams through the normal picker | Preset seeding |
| 18 | Get video waits until the run reports its result, at most 900 s, and shows simple progress: `Looking for video (k of n)…` | Get video progress |
| 19 | `main` gets a ruleset that blocks force pushes and branch deletion, with no required checks or pull requests, because the pipeline and catalog bots commit straight to `main` (`scripts/guardians-stream-pipeline/lib/publishGithub.mjs:101-114`). Releases are gated by the `release.yml` `checks` job | CI and deploy |

### Approved defaults

The owner approved each default in this table on 2026-11-02. The numbers stay stable; O3, O6, O7 and O19 were settled separately and appear under Decided.

| # | Question | Recommended default | Reason |
|---|---|---|---|
| O1 | Tag `823d2be` as `fixed-teams-final`? | Yes, annotated, message "Fixed three-team design archive snapshot" | Same name as the archive README's commands. It marks the archive snapshot, not the last commit before the cutover; `v1.4.16` already marks the last shipped fixed build. The name avoids the `v*` release trigger (`.github/workflows/release.yml:4-6`) |
| O2 | Deliver listing backups before the cutover, in today's pipeline (Phase 1)? | Yes, using the final `STREAM_PIPELINE_CONFIG` secret so the URLs are pasted once | Family phones get backups weeks earlier, and the failover modules move into the new pipeline unchanged |
| O4 | Use the America/New_York calendar date as the hidden official-date key for every ESPN team, including Iowa State? It is never displayed (Decided 15); it only labels which day a hand-written streams entry belongs to. MLB keeps the statsapi official date | Yes | One rule for the app and the pipeline. Pipeline entries match by event id, so only hand-written `gameDates` are affected. The ESPN recap day moves to the phone-local start date (Team screen engine), so Cyclones' move off America/Chicago (`app/cyclones/cyclonesSnapshot.ts:88-95,406,418-422`) changes nothing a Central phone shows |
| O5 | Skip a `v1.4.17` bridge release that writes an install marker and proves the update paths before the cutover? | Skip | Owner item 11. A bridge makes every phone update twice. Legacy keys and Android install times cover the family phones; a family iPhone with neither adds its teams through the picker. The update paths are proven by the draft-release installs and the family updates in Phase 6 |
| O8 | Get video limits: 180 s cooldown per game, 10 runs per game, 3 per 10 min per IP+team, 20/h per IP, 10 wrong keys/h per IP, 60/h overall, 15 in flight? | Accept | Each is a Worker `[vars]` value that changes without a code change. The (IP, team) limit counts all sports of a school together |
| O9 | Allow at most 5 listing sources in the config? | Yes | The 600 s extraction deadline gives the first three sources full budgets; sources 4 and 5 run only when earlier sites fail fast |
| O10 | Move to the next site also when a site works but this game is not found or not playable there (`link_not_found`, `opponent_not_found`, `ambiguous_link`, `player_not_found`, `unknown_provider`, `invalid_entry`, `unplayable`)? | Yes | A backup only helps if a missing game counts. Owner item 9 named site-level failures; this widens it |
| O11 | League release staging: `v2.0.0` MLB, NFL, NCAA football and basketball; `v2.1.0` NBA, WNBA; `v2.2.0` NHL, MLS, NWSL? | Yes | The cutover uses only ESPN paths already parsed in repo code. The alternative holds `v2.0.0` until all ten pass their probes and boards |
| O12 | Which "other major categories" ship in Phase 9? | NCAA baseball, NCAA softball, NCAA men's ice hockey, NCAA women's volleyball, Premier League; each only after its probe and fixtures pass | Each new board or record format is app work. The owner may name others or defer Phase 9 |
| O13 | Add team-code share and paste for setting up another phone? | Yes, in Phase 9 | The code holds no secrets, and the feature is optional |
| O14 | Show a `Signed in on this phone` status line, based on whether Google session cookie names are present (never their values)? | Yes. When the state is unknown, all three account buttons are shown | A parent can see which phones still need to sign in |
| O15 | Accept that Android `Sign out` clears all WebView cookies and web storage for the whole app? `CookieManager` has no per-domain delete | Accept | Team players do not rely on stored cookies (`cacheEnabled={false}`, `app/guardians/GuardiansScreen.tsx:627`) |
| O16 | Run the iPhone physical checks (seeding, persistence, TV sign-in and sign-out) on the draft `v2.0.0` IPA, installed over `v1.4.16` on one family iPhone before the release is published? | Accept | One install proves the release itself; a failure stops the cutover before other phones see the prompt |
| O17 | Add a macOS `ios-build` CI job on PRs that touch native modules or `app/package.json`? | Yes | Windows has no Xcode (`AI_Framework/AI_RULES.md:16`), and the new native code needs an iPhone compile check |
| O18 | Hub size: phones scroll past 4 columns; at most 30 team tiles; at the cap `+` stays and the picker shows `Hub is full (30 teams)` with adding disabled? | Accept | Tiles stay at least 64 dp; 30 tiles fit a tablet without scrolling |
| O20 | Create a release as a draft when its major version is above the latest published release, so the owner publishes it by hand? | Yes | `v2.0.0` can then be built and installed on two phones before `v1.4.16` phones see the prompt. Minor and patch releases publish as today |

## Current state

This lists only what drives the plan. The full record is in `Docs/Archive/FixedTeams/`.

| Area | Today | What it drives |
|---|---|---|
| Hub | Fixed 2×2 grid of Guardians, Patriots, Cyclones and TV Location: 101.2 dp tiles, 28 dp gaps, percentage positions inside `SafeAreaView edges={['top','bottom']}` (`app/hub/HubScreen.tsx:387-395`, `app/App.tsx:31`, `AI_Framework/AI_RULES.md:47`) | Dynamic grid |
| Team screens | Three sibling copies, required by rule (`AI_RULES.md:53,55,57`): `app/guardians/` (MLB statsapi, team 114 hard-coded, `GuardiansScreen.tsx:229-238`), `app/patriots/` (ESPN NFL 17), and `app/cyclones/` (ESPN NCAA 66, three sports on one screen, `CyclonesScreen.tsx:828-853`) | One engine built from the Cyclones screen |
| Test imports | Pure-Node tests import app modules that have only `import type` siblings or explicit `.js` paths (`app/patriots/patriotsSnapshot.ts:1`, `app/hub/appUpdate.ts:1`); `app/tsconfig.json:1-6` only extends `expo/tsconfig.base` | Explicit `.ts` import rule |
| Stream match | Official date plus game number (`app/guardians/guardiansSources.ts:257-266`); the parser rejects unknown keys (`:203`) | Event-id match; lenient parser |
| Worker | One Worker, `guardians-get-video` (`workers/guardians-get-video/wrangler.toml:1`), with a three-row module table (`src/index.js:6-22`). It allows 3 presses per 10 min per IP across all teams, counted per isolate (`:1-4,106-118`). Every `/streams` call is a PAT request unless that isolate holds a matching ETag (`:178-202`). A missing streams file answers 502 (`:204-207`), and GitHub error text reaches the phone (`:205-206,242-243`). The phone reads 429 as "a run is in progress" (`app/cyclones/cyclonesGetVideo.ts:68-71`) | Worker v2 contract, gates, read index, distinct codes |
| Workflows | Three files that differ in about six parameters (`.github/workflows/cyclones-stream-pipeline.yml:16-22,37-38,50-60,66-67`), each with its own `TZ`. One job runs the headed browser and holds a `contents: write` token; checkout keeps its credentials (`guardians-stream-pipeline.yml:39`) | One workflow, split into `extract` and `publish` |
| Pipeline | `scripts/guardians-stream-pipeline/` with a fixed module table (`lib/pipeline.mjs:49-67`) and an in-package default config path (`:42-45`). A missing streams file fails the run: the checkout fallback in `readCurrentStreamsDocument` hits ENOENT (`lib/pipeline.mjs:274-290`, `lib/streamsDocument.mjs:75-77`); publish can already create a file without a `sha` (`lib/publishGithub.mjs:111`). Navigation timeout 90 s (`lib/pipeline.mjs:421-423`); grace 180 for Guardians, 240 for the others (`config.example.json`, `config.patriots.example.json`) | Catalog-driven TeamSpec; template creation; source 1 timings kept |
| Secrets | Three `*_STREAM_PIPELINE_CONFIG` secrets that hold the same `extract.baseUrl` plus per-team needles, `requireOpponent` and grace (`workers/guardians-get-video/README.md:22-26`). Build env `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` and `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN`, shared by all teams (`release.yml:62-63,70-71,120-121,128-129`). The Worker PAT may be classic `repo` or fine-grained (`README.md:22`) | One secret; renamed env; PAT check |
| Listing | One `baseUrl` (`lib/pipeline.mjs:497`). The listing HTTP status is discarded (`lib/extractGooz.mjs:925-937`); the link wait keeps polling through a Cloudflare challenge (`:548-561`). One player host, `GOOZ_HOST` (`:1-4,842`) | Ordered sources, challenge-aware stages, provider table |
| TV Location | A Tripoli constant (`app/tvLocation/destination.ts:9-13`) is used when no point is saved (`TvLocationScreen.tsx:635`). Sign-in happens only inside the verify WebView. The cookie module only flushes, and only on Android (`app/modules/danner-webview-cookies/src/index.ts:8-13`). The injected script has no host check and runs in iPhone subframes (`geolocationInjection.ts:8-9`, `TvLocationScreen.tsx:590-592`) | First use, own-account controls, host guard |
| Persistence | Four AsyncStorage keys: three sources caches and `danner.destination.v1`. There is no selection key and no install marker (`GuardiansScreen.tsx:96`, `PatriotsScreen.tsx:94`, `CyclonesScreen.tsx:99`, `destination.ts:1`) | Selection store and seeding signals |
| Identity | Package `com.example.location_helper` (`app/app.json:33`), bundle id `com.danner.locationhelper` (`:15`), Expo debug keystore regenerated by `expo prebuild --clean` (`release.yml:59-65`), versionCode from the tag and 1 without it (`app/app.config.js:18-32`, `app/app.json:34`); update manifest URL and parser (`app/hub/appUpdate.ts:5-7,68-93`) | Frozen constants; signing-certificate check |
| CI and deploy | No workflow runs a test. The Worker is deployed by hand from a PC (`workers/guardians-get-video/README.md:5-13`) with `wrangler ^4.28.0` (`package.json:10`). `.gitignore:53-56` covers only the old package's local config | `ci.yml`, `worker-deploy.yml`, new ignore entries |

## Target architecture

### Names used everywhere

| Name | Value |
|---|---|
| Team key | `<league>-<espnId>`, matching `^[a-z]{2,8}-\d{1,8}$`: `mlb-5`, `nfl-17`, `ncaa-66`. Used as is by the catalog, tiles, AsyncStorage keys, logo files, Worker allowlist, dispatch payload and concurrency group. The streams path is derived from it |
| League key | `mlb`, `nfl`, `nba`, `wnba`, `nhl`, `mls`, `nwsl`, `ncaa` |
| College sport key | `football`, `mens-basketball`, `womens-basketball` (today's values, `app/cyclones/cyclonesSources.ts:2-4`); Phase 9 adds more |
| Adapter key | The league key for pro teams; `ncaa/<sport>` for college. Fixture folders use `-` in place of `/` |
| Streams file | `streams/<league>/<espnId>.json`, one per pro team or school |
| Workflow | `.github/workflows/stream-pipeline.yml`, jobs `extract` and `publish`, dispatch type `team-get-video` |
| Pipeline secret | `STREAM_PIPELINE_CONFIG` |
| Other repo secrets | `RUN_STATUS_KEY`, `RUN_PROGRESS_KEY`, `WORKER_GITHUB_PAT`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| Build env | `EXPO_PUBLIC_DANNER_WORKER_URL` (today's Worker origin, value unchanged) and `EXPO_PUBLIC_DANNER_APP_KEY`, read only by `app/streams/workerConfig.ts` |
| Worker | Cloudflare name `guardians-get-video` and its workers.dev origin are kept and frozen for all future builds. Folder `workers/team-worker/`. Secrets `APP_KEY`, optional `APP_KEY_PREVIOUS`, `RUN_STATUS_KEY`, `RUN_PROGRESS_KEY` and `GITHUB_TOKEN`, all copied from repo secrets by `worker-deploy.yml` |
| Committed fingerprints | `release/app-key.sha256` (SHA-256 of the app key, never the key) and `release/android-signing-cert.sha256` (the `v1.4.16` APK certificate) |
| Archive tag | `fixed-teams-final` on `823d2be` (O1) |

### App layout

| New path | Built from | Contents |
|---|---|---|
| `app/playback/` | `app/guardians/GuardiansAudioPlayer.tsx`, `GuardiansCastButton.tsx`, `GuardiansTvRouteButton.tsx`, `castStreamType.ts`, `web*Injection.ts`, `webPlayer*.ts`; player stack `GuardiansScreen.tsx:484-799` | `AudioPlayer`, `CastButton`, `TvRouteButton`, `StreamPlayer`. The logic moves unchanged; only team strings (`GuardiansScreen.tsx:546,753`) become props |
| `app/streams/` | `guardiansSources.ts`, fetch chain `GuardiansScreen.tsx:303-460`, three `*GetVideo.ts` files | `sources.ts` (one parser), `fetchSources.ts`, `getVideo.ts`, `workerConfig.ts` |
| `app/team/` | `CyclonesScreen.tsx:1135-1715` and `FeaturedGameCard` | `TeamScreen.tsx`, `FeaturedGameCard.tsx`, `ScheduleList.tsx`, `HeroRecords.tsx`, `WinChanceBar.tsx`, `theme.ts` |
| `app/team/engine/` | `guardiansSnapshot.ts:62-255`, `patriotsSnapshot.ts:96-121,250-282`, `cyclonesSnapshot.ts:197-437` | `featured.ts`, `liveMerge.ts`, `videoWindow.ts`, `records.ts`, `dates.ts`, `postseason.ts`, `streamMatch.ts`, `types.ts` |
| `app/leagues/espn/`, `app/leagues/mlb/` | `espnNfl.ts`, `espnCyclones.ts`, both `espnScoreboard` files, both `espnWinChance.ts`; `GuardiansScreen.tsx:216-301`, `mlbLinescore.ts` | One ESPN adapter driven by config rows; the statsapi adapter |
| `app/scoreboards/` | The four `*Scoreboard.tsx` files | `BaseballScoreboard.tsx`, `PeriodScoreboard.tsx` |
| `app/hub/` | `HubScreen.tsx` | Adds `hubGrid.ts`, `HubTile.tsx`, `TileActionsSheet.tsx`. `appUpdate.ts`, `provisioningWarning.ts`, `releaseVersion.js` unchanged |
| `app/selection/` | New | `types.ts` and `presets.ts` (Phase 3); `ops.ts`, `store.ts`, `migrations.ts`, `seed.ts`, `installInfo.ts` (Phase 4) |
| `app/picker/`, `app/logos/` | New | Picker screen and catalog loader; `logoStore.ts`, `TeamLogo.tsx` |

Pure modules (`app/team/engine/`, `app/leagues/`, `app/selection/` except `store.ts`, `app/hub/hubGrid.ts`, `app/streams/sources.ts`, `app/tvLocation/destination.ts`) have no runtime React Native import and import siblings with explicit `.ts` extensions, because Node's type stripping does not resolve `./dates`. `app/tsconfig.json` sets `allowImportingTsExtensions`, which `tsc --noEmit` accepts (`app/package.json:42`). The Phase 3 exit checks that Metro resolves these specifiers, and CI imports every pure module under plain Node.

`app/guardians/`, `app/patriots/` and `app/cyclones/` are deleted in Phase 3. The tests that import them by path (`tests/guardians/run-snapshot.mjs:3-13`, `tests/patriots/run-snapshot.mjs:4-16`, `tests/cyclones/run-snapshot.mjs:3-25`, `tests/guardians/run-cast-discovery.mjs:4-38`) move in the same commit.

### Backend layout

| Path | Change |
|---|---|
| `.github/workflows/stream-pipeline.yml`, `team-catalog.yml`, `worker-deploy.yml`, `worker-health.yml`, `ci.yml` | New |
| `.github/workflows/{guardians,patriots,cyclones}-stream-pipeline.yml`, root `{guardians,patriots,cyclones}_streams.json`, `scripts/guardians-stream-pipeline/`, `workers/guardians-get-video/` | Deleted after the `v2.0.0` release is published (Phase 6 step 8) |
| `catalog/leagues.json`, `catalog/teams/<league>.json`, `catalog/probe-report.json` (written by the bot); `catalog/overrides.json` (edited by hand) | New |
| `streams/<league>/<espnId>.json` | New; created by the pipeline on first publish (presets created at the cutover) |
| `scripts/stream-pipeline/` (`run.mjs`, `publish.mjs`, `lib/`, `templates/streams.template.json`, `config.defaults.json`, `config.example.json`, `test/`) | New package built from today's. `control-server.mjs`, `extract-gooz.mjs` and the per-team example configs are dropped, because they are local-only tools (`control-server.mjs:13`); `workflow_dispatch` with `dry_run` and `source` replaces them. `run.mjs` reads only `STREAM_PIPELINE_CONFIG_PATH` or `--config` and has no in-repo default |
| `scripts/team-catalog/` (`build.mjs`, `probe.mjs`, `validate.mjs`, `required-paths.json`) | New |
| `workers/team-worker/` (`src/index.js`, `catalog.js`, `streams.js`, `gates.js`, `durable.js`, `events.js`, `github.js`, `test/`) | New source for the same Cloudflare Worker |
| `.gitignore` | Adds `scripts/stream-pipeline/config.json`, `scripts/stream-pipeline/node_modules/`, `scripts/stream-pipeline/.probe-output/`, `scripts/team-catalog/.probe-output/` |

### Data flow

```text
team-catalog.yml (weekly): ESPN /teams + statsapi /teams -> probe -> build -> validate -> catalog/*.json on main
  catalog/*.json -> Worker allowlist + GET /catalog[/<league>] -> phone picker (bundled snapshot, 24 h cache)
  catalog/*.json -> stream-pipeline.yml TeamSpec (checkout copy)

Phone TeamScreen (only while open)
  schedule, live board, win chance ------> ESPN site/core JSON, MLB statsapi (direct, no Worker)
  GET /streams?team=<key> ---------------> Worker: league listing index (10 s, conditional) + blob cache by SHA
  POST /get-video {appKey, team, sport?, eventId} -> Worker gates (key, event in window, dedupe, limits)
                                                   -> repository_dispatch team-get-video
  stream-pipeline.yml (one concurrency group per team+sport)
    extract (read-only token): check request -> config -> schedule -> event window -> sources 1..N -> candidate
                               each step -> POST /run-progress (HMAC, progress only) -> Worker
    publish (write token, no browser): re-validate -> one commit to streams/<league>/<espnId>.json
                                       -> POST /run-status (HMAC) -> Worker
  Phone polls GET /streams?team=<key>&event=<id> every 5 s (X-Run-Progress shows site k of N) until an entry matches, X-Run-State is final, or 900 s
```

## App

### Types

```ts
// app/leagues/types.ts
export type LeagueKey = 'mlb' | 'nfl' | 'nba' | 'wnba' | 'nhl' | 'mls' | 'nwsl' | 'ncaa';
export type SportKey = 'football' | 'mens-basketball' | 'womens-basketball';
export type AdapterKey = Exclude<LeagueKey, 'ncaa'> | `ncaa/${SportKey}`;
export type TeamKey = string;                       // '<league>-<espnId>'
export type TeamRef = {                             // snapshot of catalog display data, refreshed by key
  espnId: string; name: string; nickname: string; location: string; abbreviation: string;
  color?: string; alternateColor?: string; logo?: string;     // colors '#RRGGBB'; logo https, a.espncdn.com only
  conference?: string;                                        // schools only, when the probe finds it
  statsapi?: { teamId: number; leagueId: 103 | 104 };         // MLB only
};
// app/selection/types.ts
export type ProTile = { kind: 'pro'; key: TeamKey; league: Exclude<LeagueKey, 'ncaa'>; team: TeamRef };
export type SchoolTile = { kind: 'school'; key: TeamKey; league: 'ncaa'; sports: SportKey[]; team: TeamRef };
export type Tile = ProTile | SchoolTile;            // sports non-empty, order football, mens-, womens-basketball
export type SelectionV1 = { schema: 1; tiles: Tile[]; updatedAt: string };
```

`TeamGame` (`app/team/engine/types.ts`) adds to today's game shape: `key` = `${adapter}:${gameId}:${officialDate}`, `adapter`, `gameId` (ESPN event id or MLB `gamePk`), `officialDate`, `gameNumber` (MLB doubleheader number, ESPN 1), `seasonType` (the list it came from), `scoresKnown`, and `scoreboard` (`baseball` or `periods`). The streams path is derived from the key by one rule shared with the pipeline, so it is not stored. Preset status (bundled logo and today's accent) is derived from the key in `app/selection/presets.ts`.

### League adapters

MLB stays on statsapi in both the app and the pipeline. The team id and league id (103 AL, 104 NL; hard-coded today at `GuardiansScreen.tsx:229-238`) come from the catalog. Statsapi already provides the doubleheader `gameNumber` (`guardiansSnapshot.ts:284`), resumed games and official dates (`scripts/guardians-stream-pipeline/lib/mlbSchedule.mjs:31-44,69-76`), Warmup and `startTimeTBD` (`guardiansSnapshot.ts:103-114,293`) and jersey numbers (`mlbLinescore.ts:138-211`). ESPN is used for MLB only for win chance (the nearest-start mapping in `app/guardians/espnWinChance.ts:42-77`, now keyed by `TeamGame.key`, which fixes the postponed-game cache at `:19,74`) and for logos.

ESPN leagues share one implementation; the rows differ only in config. The app adapter rows and the catalog league rows must agree, and `tests/leagues/run.mjs` asserts that they do.

| Adapter | ESPN path | Season year | Board | Record | Win chance | Evidence | Release |
|---|---|---|---|---|---|---|---|
| `nfl` | `football/nfl` | Jan–Feb → y−1 (`patriotsSnapshot.ts:57-59`) | periods Q4, OT, football situation | W-L-T | 2-way | in repo | `v2.0.0` |
| `ncaa/football` | `football/college-football` | Jan → y−1 (`cyclonesSnapshot.ts:115-117`) | same | W-L-T | 2-way | in repo | `v2.0.0` |
| `ncaa/mens-basketball` | `basketball/mens-college-basketball` | Jul–Dec → y+1 (`cyclonesSnapshot.ts:119-121`) | periods H2, OT | W-L | 2-way | in repo | `v2.0.0` |
| `ncaa/womens-basketball` | `basketball/womens-college-basketball` | same | periods Q4, OT | W-L | 2-way | in repo | `v2.0.0` |
| `nba`, `wnba` | `basketball/nba`, `basketball/wnba` | Jul–Dec → y+1; calendar | periods Q4, OT | W-L | 2-way; hidden when absent | probe | `v2.1.0` |
| `nhl` | `hockey/nhl` | Jul–Dec → y+1 | periods P3, OT, SO (new) | W-L-OTL | hidden when absent | probe | `v2.2.0` |
| `mls`, `nwsl` | `soccer/usa.1`, `soccer/usa.nwsl` | calendar | periods H2, ET, PK, minute clock (new) | W-D-L | 3-way when `tiePercentage` exists | probe | `v2.2.0` |

- Every "probe" row is confirmed by the Actions live probe before its phase starts, and its captures are committed under `tests/leagues/<adapter>/`. Captures cover the schedule per season type, the summary for a live and a final event, the predictor and probabilities, and `/teams`; soccer is captured both with and without `fixture=true`. This sandbox cannot reach ESPN or statsapi.
- NHL record: computed from regular-season Finals when the schedule carries `period`, otherwise ESPN `team.recordSummary`. The probe decides which.
- Soccer uses `DRAW` in place of `TIE` and shows `Us N% · Draw N% · Them N%` with a grey middle segment. Today's bar is 2-way only (`app/guardians/WinChanceBar.tsx:14-17`).
- A league that the installed build does not support is hidden in the picker. A stored tile whose adapter is missing shows "This team needs a newer app version." on its screen.

### Team screen engine

`TeamScreen` is built from the Cyclones screen, which already fans out across sports, isolates per-sport failures, shows one featured card across sports and keeps a record per sport. A pro tile is a one-league tile. Sport labels on the card and schedule rows (`CyclonesScreen.tsx:927,1667-1669`) appear only when a tile has more than one sport, so Guardians and Patriots look as they do today.

Screen contract: record hero; featured game (Live, else today's next game, else today's recap until local midnight); countdown; live board every 5 s; Final recap WIN/LOSS/TIE (DRAW for soccer); win-chance bar; schedule without completed games; Play, Get video, Listen, Cast, TV send; pull-to-refresh; Android Back closes the player first (`GuardiansScreen.tsx:1446-1464`).

The three screens diverge today in seven places. The engine picks one behavior for each:

| Divergence | Chosen | Visible change |
|---|---|---|
| Seasontype source | The list the event was fetched from (`espnNfl.ts:59`), not the event field (`cyclonesSnapshot.ts:612-616`) | None expected |
| Unparseable score | Kept out of the record (`patriotsSnapshot.ts:96-121`) | Cyclones: a Final with no published score no longer counts as 0–0 (`cyclonesSnapshot.ts:439-454`) |
| Live game with a TBA time | The video window opens (`GuardiansScreen.tsx:875-881`) | Patriots now shows Play and Get video (today closed, `PatriotsScreen.tsx:776-780`) |
| Board kept on schedule refresh | `liveMerge.ts`: keep the previous state, score and board when its state rank is higher or the last live poll was requested after the snapshot request; keep the polled board while Live and polled within 30 s; fill missing jersey numbers from the previous board (`GuardiansScreen.tsx:129-176`, `PatriotsScreen.tsx:133-174`, `CyclonesScreen.tsx:149-200`) | Patriots: after a live-poll stall of more than 30 s, the schedule board shows until the next poll |
| Partial schedule failure | The Cyclones rule for every adapter: any failed season-type list carries that adapter's previous games, record and postseason status forward and marks the snapshot incomplete, and the next tick retries (`app/cyclones/espnCyclones.ts:33-34,62-75`, `CyclonesScreen.tsx:254-309`). Record and postseason status are never computed from part of a schedule | Patriots: a failed pre- or post-season list keeps the previous schedule instead of a partial one (`espnNfl.ts:39-45`) |
| Recap day (ESPN) | The phone-local date of the start time when it is known, else the official date; MLB keeps the statsapi official date. Cyclones today matches the Chicago official date to the local day (`cyclonesSnapshot.ts:406,418-422`) | None for Central phones |
| Kickoff refresh | One `pendingStartKeyRef` and a forced load; the spinner is always cleared | None |

- Featured pick: the Guardians superset (`guardiansSnapshot.ts:179-255`: carried-over delay, demotion of suspended-but-Live games, makeup de-duplication), applied across all of a tile's leagues in the Cyclones cross-sport order.
- NCAA postseason (`cyclonesSnapshot.ts:237-394`) moves to `postseason.ts`. Football keeps its own path: only the College Football Playoff is a knockout, any other bowl ends the season (`:254-259`). For basketball the Big 12 literals (`:247-248`) become: a conference tournament game is one whose notes contain `conference tournament`, or a seasontype 2 game whose notes contain `tournament` or `championship`, or a game whose notes name the school's `conference` together with either word. A seasontype 3 game whose notes contain `tournament` and are not NCAA, NIT, WBIT or WNIT stays a knockout named `tournament` (`:280-282`), which covers CBI and CIT. Fixtures add CBI, CIT, a CFP game and a non-Big 12 conference final.
- Stream match (`streamMatch.ts`, sharing fixtures with the pipeline): an entry with `eventId` matches when the event id is equal and `gameDates` includes the game's current official date, so an entry for a postponed event that kept its id does not show Play on the new date. An entry without `eventId` matches when `gameDates` includes the official date and `gameNumbers` includes the game number. School files also require the same `sport`. Official date: MLB uses the statsapi `officialDate`; ESPN uses the America/New_York date (O4). The parser ignores unknown keys. `GOOZ_HOST` path validation (`guardiansSources.ts:82-101`) stays. Fixtures add a postponed ESPN event that keeps its id and an MLB resumed game.
- Identity in the UI: catalog `nickname` (the mascot, from ESPN `team.name`) replaces the short team literals (`GuardiansScreen.tsx:89,185,206,546,753,914,961,974,1094,1562,1677`); `team.name` (ESPN `displayName`) replaces the full-name strings at `:1556` (hero accessibility label) and `:1674` (audio artist). The board label is `nickname.toUpperCase()` when it is 10 characters or fewer, else `abbreviation`. The accent is the preset color (Guardians and Patriots `#E31937`, Cyclones `#AE192D`), else the catalog `color` when its contrast with white is at least 3:1, else `alternateColor` when it passes, else `#1F6F55` (`app/app.json:10`).

### Hub

Tile order is the selected tiles in stored order, then TV Location (fixed, cannot be removed), then `+`. A fresh install shows TV Location and `+`. A seeded family phone shows Guardians, Patriots, Cyclones, TV Location and `+` (5 tiles, 3 columns). Grid math lives in `app/hub/hubGrid.ts` (pure). W and H come from the hub container's `onLayout`, which already excludes the top and bottom insets of `SafeAreaView edges={['top','bottom']}` (`app/App.tsx:31`); in landscape the left and right insets from `useSafeAreaInsets()` are subtracted from W.

```text
n = tiles including TV and +;  cols = max(2, ceil(sqrt(n)));  rows = ceil(n / cols)
span(k) = k + (k - 1) * GAP_RATIO        GAP_RATIO = 28 / 101.2   MAX_TILE = 101.2
portrait (W < 1.1 * H):
  topReserve = (signing warning or update spinner visible) ? 112 : 16
  for L in [210, 180, 150, 120]:                       logo steps down only while height binds
    logoTop = max(topReserve, H/3 - 105);  regionTop = logoTop + L + 24;  regionH = H - regionTop - 16
    tile = min(MAX_TILE, (W - 32) / span(cols), regionH / span(rows))
    accept L when height does not bind or tile >= 72
  tile < 64 -> scroll mode
landscape (W >= 1.1 * H): logo pane = left 35% of W; grid in the rest; same tile formula
scroll mode: logo 210; cols = largest c <= cols with (W - 32) / span(c) >= 64; grid in a ScrollView
placement: gap = tile * GAP_RATIO; rows left-aligned so columns stay put as tiles are added;
  block centered on 2H/3 while it clears regionTop (today's anchor, HubScreen.tsx:387-395)
```

| Usable dp | n = 2 | n = 5 | n = 9 | n = 10–16 | n ≥ 17 |
|---|---|---|---|---|---|
| 412×840 phone | 2 cols, 101.2 | 3 cols, 101.2 | 3 cols, 101.2 | 4 cols, 78.7 | scroll, 4 cols, 78.7 |
| 375×647 small phone (removes today's 4–5 dp logo overlap) | 101.2 | 96.5 | 80.6 | 71.0, logo 210 → 150 at n = 16 | scroll, 4 cols, 71.0 |
| 780×380 landscape | 101.2 | 101.2 | 97.9 | 97.9 → 72.0 | 72.0; scroll below 64 |
| 800×1200 tablet | 101.2 | 101.2 | 101.2 | 101.2 | 101.2 up to 28 team tiles (n = 30); 88.7 at 29–30 team tiles (6 rows) |

Tiles (`HubTile.tsx`) keep today's 2 dp `#A9CEBB` border, radius 14, shadow and pressed style (`HubScreen.tsx:402-420`):
- Preset: the bundled JPG with `cover`. Catalog team: the cached PNG with `contain` and 12% padding on white. With no cached file, a fallback shows `abbreviation` in bold on the accent color, in white or black by contrast.
- TV Location keeps today's art and labels (`HubScreen.tsx:328-343`). The `+` tile is white with a `#1F6F55` glyph, label `Add team` and hint `Opens the team picker`. It stays at the 30-tile cap (O18).
- A team tile's label is `team.name`, which keeps today's harness tap targets (`tests/guardians/run-get-video.mjs:425`, `tests/patriots/run-get-video.mjs:450`, `tests/cyclones/run-get-video.mjs:461`).
- A long press opens `TileActionsSheet`, a React Native `Modal` (Android `Alert` allows only three buttons): `Move to front`, `Move earlier`, `Move later`, `Change sports` (schools only), `Remove from hub` (with a confirmation), `Cancel`. The same actions are exposed as `accessibilityActions`. There is no drag reorder, because it would need `react-native-gesture-handler` and `reanimated`, which are not dependencies (`app/package.json:44-58`). Removing a tile deletes its sources cache and logo file.
- Update prompt: the hub is unmounted while a team screen, the picker or TV Location is open, so `hubMounted` (`HubScreen.tsx:85-92`) still suppresses the prompt. While the actions sheet or a confirmation is open, `hubVisible` is false.

### Picker

`app/picker/TeamPickerScreen.tsx` is its own route and has its own Android `BackHandler`.

| Step | Content | Rules |
|---|---|---|
| 1. Add a team | MLB, NFL, NCAA football, NCAA men's basketball, NCAA women's basketball; later releases add the O11 and O12 leagues. Phase 9 adds `Share these teams` and `Paste a team code` (O13). At 30 team tiles the screen shows `Hub is full (30 teams)` and disables every add row (O18) | A league appears only when it is in the build's `SUPPORTED_ADAPTERS` and `pickable` in the catalog |
| 2. Team or school | A search box (ignoring case and accents, over name, nickname, location and abbreviation) and a `FlatList` with fixed row height (NCAA lists have 360+ schools). Retired entries are not listed | A pro team already on the hub shows `On hub` and is disabled. A school already on the hub shows `On hub · Football, …` and opens step 3 |
| 3. Sports (schools only) | Checkboxes for the sports the catalog lists for the school. Pre-checked: the existing sports plus the sport picked in step 1 | Save merges the sports into the tile. Unchecking every sport asks whether to remove the tile |

Pure operations in `app/selection/ops.ts`: `addPro` (no-op when the key exists), `addSchoolSports` (union into an existing `ncaa-<id>` tile, else append), `setSchoolSports` (an empty list removes the tile), `removeTile`, `moveTile`, `applyFamilyPreset` (appends the missing presets in the order Guardians, Patriots, Cyclones; merges Cyclones' sports into an existing `ncaa-66` tile). New tiles go after the last team tile. Adding past 30 team tiles is refused.

Catalog in the app: a bundled `app/picker/catalogSnapshot.json` (a copy of `catalog/`, refreshed by a pre-release script so the picker works offline) is replaced by the cached copy in `danner.catalog.v1` when that copy is newer. The cache is refreshed when the picker opens and is older than 24 h. A refresh updates the stored tiles' `TeamRef` fields by key (rebrands), but never their order or sports. The parser ignores unknown keys.

### Logos

- New dependency `expo-file-system` (SDK 57). Files in the document directory survive in-place updates; image disk caches are evicted by size and age.
- `logoStore.ts` downloads `team.logo` (https, `a.espncdn.com` only) to `logos/<TeamKey>.png` under the document directory and indexes it in `danner.logos.v1` by that relative name only. The path is resolved against the current document directory at runtime, because the iPhone container path can change across SideStore updates. When the hub mounts, it backfills, two at a time and only while online, every logo whose file is missing (not whose index entry is missing). A changed `logo` after a catalog refresh triggers a new download.
- `TeamLogo.tsx` uses the bundled preset JPG, else the cached file, else the fallback tile. The same component feeds the hub tile and the team hero; today these are three separate `require`s (`GuardiansScreen.tsx:1558`, `PatriotsScreen.tsx:1441`, `CyclonesScreen.tsx:1567`).

### Navigation and load guard

- `app/App.tsx` uses a `Route` union of `hub`, `team {tileKey}`, `picker {start?}` and `tv-location`. `<TeamScreen key={tile.key}>` mounts fresh for each tile. A team route whose tile no longer exists renders the hub.
- `SplashScreen.preventAutoHideAsync()` holds the splash screen until the selection has loaded. `expo-splash-screen` is already a dependency (`app/package.json:51`) but is unused today. Family phones therefore never flash the fresh-install hub.
- If AsyncStorage throws or does not answer within 3 s, the hub shows TV Location and `+` read-only: no seeding and no writes for that session. The next foreground retries.

### Polling and Worker use

| Surface | Network | Cadence |
|---|---|---|
| Hub | Update manifest (existing, `HubScreen.tsx:84-239`) and logo backfill | On mount or app active. Tiles show no live data and never fetch ESPN, statsapi or the Worker |
| Picker | `GET <worker>/catalog`, `/catalog/<league>` (ETag); raw `main` fallback | On open when the cache is older than 24 h |
| Open TeamScreen | Schedule (leagues × season types; 9 requests for a 3-sport school, as today, `espnCyclones.ts:35-60`), live board, win chance, streams | 60 s tick with 10 min snapshot staleness; 5 s live board; 10 min / 30 s win chance (`espnWinChance.ts:23-24`). Streams on open, pull-to-refresh and foreground, and every 60 s only while a game is Live or from 45 min before its start to the end of its grace period. All of it stops when the app is not active and on unmount |
| Get video | `POST <worker>/get-video` `{appKey, team, sport?, eventId}`, then `GET /streams?team=<key>&event=<id>` | Every 5 s until an entry matches, `X-Run-State` reports a final code, or 900 s (Decided 18); each poll updates the progress line (Get video progress) |

Streams fetch chain per tile: Worker `/streams?team=`, then raw `main/<streams path>` (with a commit-SHA lookup only during a Get video session, as today), then the last valid copy in `danner.sources.<TeamKey>.v1`. The phone's handling of each Get video answer and run state is in the Worker v2 code tables. Dev-only hooks (`__DEV__`): `EXPO_PUBLIC_TEAM_TEST_URL` and `EXPO_PUBLIC_TEAM_SOURCES_URL` (replacing the per-team variables, `GuardiansScreen.tsx:97-103` and siblings), and `EXPO_PUBLIC_TEST_SELECTION` (comma-separated team keys written as the selection on a fresh dev install, so device drivers can find tiles by label).

## On-device persistence and preset seeding

### Keys

| Key | Owner | Value |
|---|---|---|
| `danner.selection.v1` | `app/selection/store.ts` | `SelectionV1`. Removing every tile stores `tiles: []`; the key is never deleted, so "absent" means "never initialized" |
| `danner.seed.v1` | `app/selection/seed.ts` | `{decision: 'legacy-family' \| 'fresh', signal: 'legacy-keys' \| 'install-times' \| 'none', at, appVersion}`, written once |
| `danner.sources.<TeamKey>.v1` | `app/streams/fetchSources.ts` | Last valid streams document text (offline fallback) |
| `danner.catalog.v1` | `app/picker/catalog.ts` | `{files: {<name>: {etag, fetchedAt, text}}}` for `leagues` and each league file |
| `danner.logos.v1` | `app/logos/logoStore.ts` | `{[TeamKey]: {href, name}}`, `name` = `logos/<TeamKey>.png` |
| `danner.tv.default.v1` | `app/tvLocation/` | Default TV point (new) |
| `danner.destination.v1` | `app/tvLocation/destination.ts:1` | Current TV point; the name is kept so saved points carry forward |

Load and migrate (`app/selection/migrations.ts`):
1. `multiGet([selection, seed])`. If the selection is present, parse it. When its schema is older, run the migrations in order, validate and write back. When its schema is newer (not reachable through updates, because versionCode only rises), read the known fields and never write.
2. If the selection is absent and the seed is present, start with an empty selection and do not seed again.
3. If both are absent, run first-launch seeding and write `danner.seed.v1` and `danner.selection.v1` before the hub renders.
4. A later key version (`danner.selection.v2`) is written by migration from v1, and v1 is removed only after the v2 write succeeds.

### Identity constants that never change

| Constant | Value and source | If it changes |
|---|---|---|
| Android package | `com.example.location_helper` (`app/app.json:33`) | A second app with empty storage; the old app never updates |
| Android signing key | Expo debug keystore from `expo prebuild --clean` (`release.yml:59-65`, `AI_RULES.md:62`). `release.yml` runs `apksigner verify --print-certs` and fails unless the SHA-256 equals `release/android-signing-cert.sha256` | The installer refuses the update; uninstalling wipes the data |
| versionCode | `major·10000 + minor·100 + patch`, strictly increasing (`app/app.config.js:18-32`); `v2.0.0` = 20000 > `v1.4.16` = 10416 | A lower code is refused |
| iOS bundle id | `com.danner.locationhelper` (`app/app.json:15`, `release/build-update-assets.mjs:56,61`) | A new app container and a third sideload slot |
| iOS signer | The phone's own SideStore Apple Account (`AI_Framework/IPHONE_INSTALL.md`) | A different derived bundle id, so a new empty app |
| Worker origin | Today's workers.dev origin, the value of `EXPO_PUBLIC_DANNER_WORKER_URL` | Installed builds lose Play and Get video |
| Update channel | `releases/latest/download/version-manifest.json` (`app/hub/appUpdate.ts:5-7`), the `VersionManifest` fields and `parseVersionManifest` (`:20-32,68-93`), asset names `Danner-Apps-Android.apk` and `Danner-Apps-iOS.ipa`, github.com and githubusercontent.com hosts (`:54-66`). `tests/app-update/run.mjs:298-321` already parses the manifest that `release/build-update-assets.mjs` writes | Installed builds never see the update and need a manual install |

What wipes selections, logos, TV keys and the Google session: uninstalling or deleting the app; Android `Clear storage`; any change in the table above. A dev build (versionCode 1, `app/app.json:34`) cannot be installed over a release: the installer refuses it, and uninstalling to get past that wipes the data. The Google session alone is also lost on TV `Sign out` or when any Android WebView sets `incognito`. Nothing relies on Android Auto Backup.

The debug keystore is public, so any APK signed with it installs as an update and can read the app's WebView cookies, which now hold each person's Google session. The TV sign-in copy and `release/IPHONE_SETUP.md` say to install the app only from the in-app update or this repository's releases.

### Preset seeding (owner item 7)

There is no install marker today. iPhone exposes no installed-versus-updated signal to the app (Android does, through `PackageInfo`), so on iPhone only data left by v1.x proves an upgrade: a team screen's stream cache, written whenever that screen loads its sources, or a saved TV map point. The layers are evaluated in order, only when both `danner.selection.v1` and `danner.seed.v1` are absent:

| Layer | Signal | Reliability |
|---|---|---|
| 1. Legacy keys | Any of `danner.guardians.sources.v2`, `danner.patriots.sources.v1`, `danner.cyclones.sources.v1`, `danner.destination.v1` | Positive proof of a v1.x install; missing on a phone that never opened a team screen or saved a map point |
| 2. Android install times | `lastUpdateTime − firstInstallTime > 60 s`, from a new `getInstallTimes()` in `DannerAppUpdateModule.kt` | Covers every Android phone updated in place. False positive only when a fresh v2 install is first launched after a later update |
| 3. Picker | The normal picker: MLB → Guardians, NFL → Patriots, College → Iowa State with three sports | Always available; the same steps as any new install |

| Phone at first launch of `v2.0.0` | Result |
|---|---|
| Android family phone updated in place | Seeded (layer 1 or 2) |
| iPhone installed over the top with any legacy key | Seeded (layer 1) |
| iPhone installed over the top with no legacy key | TV Location and `+`; the parent adds the three teams through the picker |
| Any phone after a reinstall, a new phone, any non-family install | TV Location and `+` |

Seeding writes `mlb-5` (statsapi 114/103), `nfl-17` and `ncaa-66` (all three sports) in today's order and removes the three legacy sources keys. It never writes TV keys; TV Location is the only writer of those (Decided 16). Phase 10 removes layers 1 and 2.

## Backend

### Team catalog

`catalog/leagues.json` (`ncaa` abbreviated):

```json
{ "schemaVersion": 1, "generatedAt": "<ISO time>", "leagues": [
  { "key": "mlb", "label": "MLB", "kind": "pro", "pickable": true,
    "schedule": { "provider": "mlb-statsapi", "sportId": 1 }, "espn": { "sitePath": "baseball/mlb" } },
  { "key": "nfl", "label": "NFL", "kind": "pro", "pickable": true, "officialDateZone": "America/New_York",
    "schedule": { "provider": "espn", "sitePath": "football/nfl", "corePath": "football/leagues/nfl",
                  "seasonTypes": [1, 2, 3], "seasonYear": { "shiftBackThroughMonth": 2 } } },
  { "key": "ncaa", "label": "College", "kind": "school", "officialDateZone": "America/New_York", "sports": [
    { "key": "football", "label": "NCAA football", "pickable": true,
      "schedule": { "provider": "espn", "sitePath": "football/college-football", "seasonTypes": [1, 2, 3],
                    "seasonYear": { "shiftBackThroughMonth": 1 } } },
    { "key": "mens-basketball", "label": "NCAA men's basketball", "pickable": true, "schedule": { "seasonYear": { "shiftForwardFromMonth": 7 } } },
    { "key": "womens-basketball", "label": "NCAA women's basketball", "pickable": true, "schedule": { "...": "as men's" } } ] } ] }
```

`catalog/teams/<league>.json` holds one entry per team or school:

```json
{ "key": "ncaa-66", "espnId": "66", "name": "Iowa State Cyclones", "nickname": "Cyclones", "location": "Iowa State",
  "abbreviation": "ISU", "color": "#<hex>", "alternateColor": "#<hex>", "logo": "<ESPN logo href>", "conference": "Big 12",
  "hrefNeedles": ["iowa-state-cyclones"], "sports": ["football", "mens-basketball", "womens-basketball"] }
```

Pro entries have no `sports` or `conference`. `mlb-5` adds `"statsapi": {"teamId": 114, "leagueId": 103}`. MLB has no `officialDateZone`, because its official date comes from statsapi; every ESPN league uses America/New_York (O4). `catalog/overrides.json` holds hand-edited data that is merged last; the allowed keys are `statsapi`, `hrefNeedles`, `name`, `nickname`, `conference`, `hidden` (hidden from the picker) and `remove` (the only way an entry leaves the allowlist).

Builder (`scripts/team-catalog/build.mjs`, in Actions, because this sandbox cannot reach ESPN):
- Calls ESPN `site.api.espn.com/apis/site/v2/sports/<sitePath>/teams?limit=1000` and reads `sports[0].leagues[0].teams[].team` (shape from third-party documentation, confirmed by the probe). Field mapping: `name` ← `displayName`, `nickname` ← `name` (the mascot; ESPN's own `nickname` is often the school short name), `location` ← `location`, `abbreviation` ← `abbreviation`, `color` and `alternateColor` ← `'#' + value` (ESPN sends hex without `#`; confirmed by the probe), `logo` ← the first `logos[]` entry whose `rel` has `default` and not `dark`. `isAllStar === true` entries are skipped.
- The default `hrefNeedles` is `slugifyName(name)` (`scripts/guardians-stream-pipeline/lib/extractGooz.mjs:397-405`), which reproduces today's three needles.
- Schools: merges the three college lists by ESPN id (one id across sports, `Docs/Production/Cyclones.md:120-126`). `sports` lists the lists the school appears in. The probe chooses the D-I filter and the `conference` path.
- MLB: joins statsapi `/api/v1/teams?sportId=1` by normalized full name and sets `statsapi.teamId` and `leagueId`. Any MLB team without a match fails the build.
- Append-only allowlist: a team or sport that disappears from ESPN (`isActive === false`, relocation, a D-I change, a list glitch) is kept with `retired: true`. Retired entries and sports are not pickable but stay valid for the Worker, the pipeline and streams files. Only `remove` in `overrides.json` deletes an entry.
- Guards: a league whose team count drops under 90% of the committed count is not rewritten, and the job fails. The build fails unless `mlb-5` (statsapi 114/103, nickname `Guardians`), `nfl-17` (nickname `Patriots`) and `ncaa-66` (nickname `Cyclones`, sports include football, men's basketball and women's basketball) are present.
- `pickable` is sticky: a league or sport becomes pickable when its probe passes and fixtures exist in `tests/leagues/`, and the build never turns a shipped league off. A failing probe keeps the last good value and opens an issue; demotion is an owner edit.

Probe (`team-catalog.yml` job `probe`, before `build`): for each league and college sport it calls the teams list, one team's schedule per season type, today's scoreboard, `summary?event=` for the most recent live or final event in any season (an empty current-season schedule is a valid shape, so the off-season passes), and the Core `predictor` and `probabilities`. It writes HTTP status, latency, network errors and shape errors (missing paths from `scripts/team-catalog/required-paths.json`) separately to `catalog/probe-report.json`, and uploads raw bodies as artifact `espn-probe-<run id>` (14 days) for fixtures. Schedule: `cron: '23 9 * * 2'` plus `workflow_dispatch` (optional input `leagues`). Permissions `contents: write`, `issues: write`. Before committing it runs `scripts/team-catalog/validate.mjs` itself, because pushes made with `GITHUB_TOKEN` start no `ci.yml` run. It commits with `GITHUB_TOKEN`, rebasing and retrying up to 3 times, with message `catalog: refresh team list.`

### Streams files

Each team has one file at `streams/<league>/<espnId>.json`; one school file covers all of its sports.

```json
{ "schemaVersion": 2,
  "team": { "key": "ncaa-66", "name": "Iowa State Cyclones" },
  "HOW_TO_GUIDE": { "DATES": "gameDates are America/New_York calendar dates (MLB: MLB official date).", "COMMIT": "Commit streams/ncaa/66.json to main." },
  "streams": [
    "INACTIVE EXAMPLE. COPY THE COMPLETE OBJECT BELOW THIS LINE.",
    { "sport": "football", "gameDates": ["YYYY-MM-DD"], "gameNumbers": [1], "kind": "direct",
      "url": "https://example.invalid/game.m3u8", "allowInsecureHttp": false, "trustedHosts": [] },
    { "sport": "football", "eventId": "<ESPN event id>", "gameDates": ["2026-11-08"], "gameNumbers": [1],
      "kind": "web", "url": "<player embed URL>", "allowInsecureHttp": false, "trustedHosts": [], "source": "pipeline" } ] }
```

| Field | Rule |
|---|---|
| `sport` | Required in school files and must be one of the school's sports; absent in pro files |
| `eventId` | A string of digits. Always written by the pipeline (ESPN event id or MLB `gamePk`); optional on hand-written entries. Matching also requires `gameDates` to include the current official date |
| `gameDates`, `gameNumbers` | Required. Official dates (O4; never displayed); numbers 1-9 |
| `kind`, `url`, `allowInsecureHttp`, `trustedHosts` | Same meaning as today (`lib/playableStream.mjs:97-180`) |
| `source` | `"pipeline"` on pipeline entries only. The pipeline replaces or removes only these entries, which replaces today's provider-host ownership test (`lib/streamsDocument.mjs:96-102`) |
| Unknown keys | Ignored, not rejected (today they are rejected, `lib/streamsDocument.mjs:30-32`) |

- Creation: `templates/streams.template.json`. A 404 on read makes the publish `PUT` the template plus the entry without a `sha` (the no-`sha` create exists today, `lib/publishGithub.mjs:111`). A concurrent create answers 422, and the existing re-read retry handles it (`lib/publishGithub.mjs:126-130`). Only a `published` outcome creates a file, so fake keys cannot create files.
- Retention: every write prunes entries whose dates are all more than 7 days old (`lib/streamsDocument.mjs:20,167-185`). There is no count cap. The phone reads the last 200 objects (`MAX_REMOTE_STREAMS`, `lib/playableStream.mjs:6,30-34`), and an upsert moves its entry inside that window as today (`lib/streamsDocument.mjs:147-152`).
- Readiness and upsert use the same match as the phone: an existing pipeline entry counts for an event only when its `gameDates` include the event's current official date, so a rescheduled event gets a new run.
- Commits: one per `published` outcome, with message `streams: <teamKey>[ <sport>] <officialDate> game <n>.` Pushes made with `GITHUB_TOKEN` start no workflows.
- Cutover: the three preset files are created empty from the template. Root files and their history stay in git and under the archive tag; no entries are carried over.

### Pipeline secret and listing sources

`scripts/stream-pipeline/config.defaults.json` (committed) holds the `timing` and `matching` defaults, and the secret `STREAM_PIPELINE_CONFIG` is merged over it. There is no `github` block: the repo comes from `GITHUB_REPOSITORY`, the branch is `main`, and the path comes from the team key.

```json
{ "schemaVersion": 2,
  "timing": { "leadMinutes": 15, "postStartGraceMinutes": { "default": 240, "mlb": 180 },
              "primary": { "navigationTimeoutSeconds": 90 },
              "backup":  { "navigationTimeoutSeconds": 30, "timeoutSeconds": 120 },
              "extractDeadlineSeconds": 600 },
  "matching": { "leagues": { "mlb": { "leagueHints": ["/mlb/"] }, "nfl": { "leagueHints": ["/nfl/"] } },
                "defaultLeagueHints": ["/stream/"] } }
```

These values reproduce today's per-team settings (`config.example.json`, `config.patriots.example.json`, `config.cyclones.example.json`; `lib/extractGooz.mjs:745-751`); Phase 2b carries any difference in the owner's private record of the three old secrets (needles, `requireOpponent`, grace) into this file, the catalog `hrefNeedles` or the secret. Secret shape (reference only; the owner pastes the shorter form in the last section):

```json
{ "schemaVersion": 2,
  "sources": [
    { "label": "primary",  "baseUrl": "<paste listing URL 1>" },
    { "label": "backup-1", "baseUrl": "<paste listing URL 2>", "timeoutSeconds": 120 },
    { "label": "backup-2", "baseUrl": "<paste listing URL 3>",
      "matching": { "teams": { "nfl-17": { "hrefNeedles": ["<slug used by this site>"] } } } } ],
  "matching": { "leagues": { "ncaa": { "requireOpponent": false } },
                "teams": { "ncaa-66/womens-basketball": { "hrefNeedles": ["<slug>"] } } } }
```

- Source 1 runs as today: 90 s navigation timeout and no per-source cap unless its own `timeoutSeconds` is set. Backups use the `backup` timing, and each backup's budget is clamped to the time left before `extractDeadlineSeconds` minus 45 s.
- Needle precedence: the source's `matching.teams["<key>/<sport>"]`, then the source's `matching.teams["<key>"]`, then the same two in the global `matching`, then the catalog `hrefNeedles`.
- `leagueHints` replace the fixed `/mlb/`, `/nfl/`, `/stream/` score bonus (`lib/extractGooz.mjs:745-751`).
- `run.mjs --check-config` rules: `schemaVersion` is 2; 1 to 5 sources (O9); each `baseUrl` is http(s), and no two share origin plus path; `label` matches `^[a-z0-9-]{1,24}$` (no dots, so it can never be a host); `timeoutSeconds` 30-300; `navigationTimeoutSeconds` 15-120; `extractDeadlineSeconds` 120-660; `leadMinutes` 5-60; grace 60-360; 60 s setup + `extractDeadlineSeconds` + 45 s publish must stay within the phone's 900 s; `matching.teams` keys exist in the catalog; needles match `^[a-z0-9-]{2,60}$`. Every message is free of values and names "source 2", never a URL or host. An empty or missing secret fails the run; there is no fallback to an example file (today's fallback is at `cyclones-stream-pipeline.yml:55-57`).

### Listing failover

`lib/sources.mjs` runs after every pre-check passes. It launches Chromium once (today it launches once per call, `lib/extractGooz.mjs:1061,1243`), opens a fresh context for each source, tries the sources in array order one at a time, and stops at the first entry that passes the playable check. A move-on failure is any NEXT code below: the site is down or blocked, or this game is not found or not playable on that site (O10).

| Stage | Detection | Code | Action |
|---|---|---|---|
| Request, config | `--check-request`, `--check-config` | `bad_team`, `bad_sport`, `bad_event`, `config_invalid` | STOP |
| Browser launch | launch throws (`lib/extractGooz.mjs:528`) | `browser_failed` | STOP |
| Schedule | provider fetch not OK | `schedule_failed` | STOP |
| Game and window | the dispatched `eventId` in the team's schedule, else today's tiers for manual runs (`lib/gameWindow.mjs:48-89`, `lib/pipeline.mjs:247-260`) | `no_game`, `blocked`, `game_over`, `too_early` | STOP (success) |
| Already ready | a playable pipeline entry exists for the event and its current official date | `video_ready` | STOP (success) |
| Listing navigation | `page.goto` throws or times out | `nav_error`, `nav_timeout` | NEXT |
| Listing HTTP | `response.status() >= 400` with no challenge marker (discarded today, `lib/extractGooz.mjs:925-937`) | `http_4xx`, `http_5xx` | NEXT |
| Listing challenge | 403 or 503 with `cf-mitigated: challenge`, a `Just a moment` title (`isCloudflareChallengeTitle`, `:564-568`) or a challenge frame is not classified at once; the link wait runs as today (`waitForListingLink`, `:548-561`), and the code is set only when no link appears by its end | `bot_challenge` | NEXT |
| Link selection | `selectListingLink` (`lib/extractGooz.mjs:465-516`) | `link_not_found`, `opponent_not_found`, `ambiguous_link` | NEXT |
| Game page | navigation error, timeout or HTTP >= 400 | `game_nav` | NEXT |
| Player | no iframe or video / no provider matches | `player_not_found`, `unknown_provider` | NEXT |
| Entry | fails the provider pattern or playable check / embed HTTP >= 400 or an offline marker | `invalid_entry`, `unplayable` | NEXT |
| Source budget | timer fires; the context is closed | `source_timeout` | NEXT |
| Deadline | less than 45 s left before the next source | `deadline` | STOP |
| Publish | contents API error after retries | `publish_failed` | STOP |

When no source succeeds, the outcome is `ambiguous_link` if any source returned it (the pipeline never guesses), else `sources_unreachable` if every source failed at navigation, HTTP or challenge, else `no_video`. These and every STOP code not marked success exit with code 1.

| Budget | Today | New |
|---|---|---|
| Navigation, source 1 | 90 s (`lib/pipeline.mjs:421-423`) | 90 s |
| Navigation, backups | — | 30 s |
| Per source | none (one attempt takes about 2-5 min at worst) | Source 1: none unless set. Backups: `timeoutSeconds`, default 120 s, clamped to the time left |
| All sources | none | 600 s; a backup starts only with at least 45 s left |
| Job | 15 min (`guardians-stream-pipeline.yml:33`) | 15 min for each of `extract` and `publish` |
| Phone wait | 300 s | Until the run reports, at most 900 s, with live progress (Decided 18) |

Worst case: about 20 s queue, 30-60 s setup (run `41249897252`: 29 s setup, 19 s pipeline), 600 s extraction, about 30 s for the `publish` job (queue, sparse checkout, write with retries), 10 s Worker freshness and one 5 s poll, about 725 s in total. That fits the 900 s phone wait and each job's 900 s limit.

Player providers (`lib/extract/providers.mjs`) start with today's single row:

```js
export const PROVIDERS = [
  { id: 'gooz', host: GOOZ_HOST, embedPath: /\/new-stream-embed\/[^/?#]*\d/,
    iframeSelector: `iframe[src*="${GOOZ_HOST}"]`, trustedHosts: [], offlineMarkers: [] },
];
```

A backup site whose player is not in the table yields `unknown_provider`, and the next source runs. Adding a provider means one row plus a fixture test. The phone already accepts non-`GOOZ_HOST` `web` URLs (`app/guardians/guardiansSources.ts:82-101`); a dry run plus one check on a phone decides whether a new player needs app work.

Redaction and masking (`lib/redact.mjs`): the step that writes the config emits `::add-mask::` for every source `baseUrl`, origin and host before anything else runs, and the pipeline emits `::add-mask::` for every post-redirect listing host and game-page host before it can print one. This covers process output that `redact.mjs` never sees (Chromium and Playwright stderr under `xvfb-run`, unhandled-rejection traces). `redact.mjs` also rewrites every step message, thrown error, summary line and result file (today one host per call, `lib/pipeline.mjs:523-534`). Logs name `source 2/3 (backup-1)`. Playwright traces and screenshots are never uploaded. Each run writes this to `$GITHUB_STEP_SUMMARY` and to artifact `pipeline-result.json` (7 days):

```text
nfl-17 | event <id> | 2026-11-08 game 1 | published from source 2 of 3
| # | Label    | Stage reached | Result   | Seconds |
| 1 | primary  | listing       | http_5xx | 3       |
| 2 | backup-1 | entry         | found    | 21      |
```

### Workflow `stream-pipeline.yml`

```yaml
name: Stream pipeline
on:
  repository_dispatch: { types: [team-get-video] }
  workflow_dispatch:   # inputs: team (required, e.g. nfl-17), sport (schools), event, dry_run, force, source (1-based; blank = all)
permissions: { contents: read }
concurrency:
  group: stream-pipeline-${{ github.event.client_payload.team || inputs.team }}-${{ github.event.client_payload.sport || inputs.sport || 'all' }}
  cancel-in-progress: false
jobs:
  extract:                # ubuntu-latest, timeout-minutes: 15, permissions: contents: read
    env:                  # TEAM_KEY, TEAM_SPORT, EVENT_ID from client_payload or inputs; DRY_RUN, FORCE, SOURCE_ONLY from inputs only
    steps:                # checkout with persist-credentials: false; setup-node 24 (cache keyed on scripts/stream-pipeline/package-lock.json)
      - run: node scripts/stream-pipeline/run.mjs --check-request
      - name: Write pipeline config      # fails on an empty secret; umask 077 under $RUNNER_TEMP; ::add-mask:: every source host
        env: { STREAM_PIPELINE_CONFIG: "${{ secrets.STREAM_PIPELINE_CONFIG }}" }
      - run: node scripts/stream-pipeline/run.mjs --check-config
      # npm ci, Playwright cache, install-deps, xvfb: as today
      - run: xvfb-run -a node scripts/stream-pipeline/run.mjs    # EXTRACT_HEADED=1; GITHUB_TOKEN read-only for the readiness read
      # uploads candidate.json (entry or outcome code) as artifact candidate-<run id>
  publish:                # needs: extract, if: always(), timeout-minutes: 15, permissions: contents: write; no browser
    steps:                # sparse checkout of scripts/stream-pipeline and catalog, persist-credentials: false
      - run: node scripts/stream-pipeline/publish.mjs   # re-validates schema, provider pattern and path from the key; writes; posts run status
        env: { GITHUB_TOKEN: "${{ github.token }}", RUN_STATUS_KEY: "${{ secrets.RUN_STATUS_KEY }}" }
```

- The job that opens untrusted listing and player pages holds only a read-only token and no credentials in `.git/config`. The job that can write has no browser and trusts nothing in `candidate.json` that it does not re-check. A CI source test asserts both permission blocks and `persist-credentials: false`.
- Payload values and inputs reach the shell only through `env:` (today's `DISPATCH_SPORT` pattern, `cyclones-stream-pipeline.yml:67,101`). `--check-request` checks the key against the regex and the checkout catalog, the sport against the team, and `EVENT_ID` against `^\d{1,12}$`, before the secret is written.
- Each team+sport has its own concurrency group, so different teams run in parallel and each team+sport has at most one running and one pending run (`guardians-stream-pipeline.yml:22-27`). Two sports of one school can run together; both write `streams/ncaa/66.json` through the SHA retry.
- The pipeline fetches only the dispatched sport (today Cyclones fetches 9 lists, `lib/ncaaSchedule.mjs:189-204`) and computes the season month in America/New_York, not the process zone (`lib/nflSchedule.mjs:17-19`, `lib/ncaaSchedule.mjs:26-32`). No workflow sets `TZ`.
- The `extract` job posts each progress step to `POST /run-progress` with `RUN_PROGRESS_KEY` (Get video progress).
- `publish.mjs` posts `{team, sport, eventId, runId, code, at}` to `POST /run-status` with an HMAC-SHA256 signature made with `RUN_STATUS_KEY` (not on dry runs or runs without `eventId`).

Code map: the module table and config checks (`lib/pipeline.mjs:49-67,84-95,151-202`) become `lib/catalog.mjs` (TeamSpec) and `lib/config.mjs`; `lib/mlbSchedule.mjs` becomes `lib/schedule/mlbStatsapi.mjs` (team from `statsapi.teamId`, `eventId` = `gamePk`); the duplicated NFL and NCAA helpers (`nflSchedule.mjs:21-77` = `ncaaSchedule.mjs:38-94`) become one `lib/schedule/espn.mjs`; `lib/extractGooz.mjs` splits into `lib/extract/listing.mjs` and `lib/extract/providers.mjs`, with `lib/sources.mjs` and `lib/redact.mjs` around them; the streams and publish modules gain the v2 schema, event-id match, `source` ownership and template creation, and publishing moves to `publish.mjs`. Env `GUARDIANS_STREAM_CONFIG`, `PIPELINE_MODULE`, `DISPATCH_SPORT` and `TZ` become `STREAM_PIPELINE_CONFIG_PATH`, `TEAM_KEY`, `TEAM_SPORT`, `EVENT_ID`, `DRY_RUN`, `FORCE` and `SOURCE_ONLY`.

### Worker v2

| Route | Request | Success | Error codes |
|---|---|---|---|
| `GET /health` | `?deep=1` adds one conditional GitHub read | 200 `{ok, contract: 2, github?}` | — |
| `GET /catalog`, `GET /catalog/<league>` | league key | 200 `catalog/leagues.json` or `catalog/teams/<league>.json`, with `ETag` | 400 `bad_league`, 502 `upstream_error` |
| `GET /streams?team=<key>[&event=<id>]` | team key; `event` during a Get video wait | 200 document; 200 empty document with `X-Streams-State: empty` for an allowlisted team that has no file; 304 on a matching `If-None-Match`. With `event`, header `X-Run-State` | 400 `bad_team`, 429 `rate_limited`, 502 `upstream_error`, 500 `not_configured` |
| `POST /get-video` | `{"appKey": "<app key>", "team": "ncaa-66", "sport": "football", "eventId": "<id>"}`; `sport` only for schools | 202 `started` or `in_progress`; 200 `video_ready` | below |
| `POST /run-status` | signed body from `publish.mjs` | 204 | 401 `bad_signature`, 400 `bad_request` |
| `POST /run-progress` | signed body from the `extract` job (Get video progress) | 204 | 401 `bad_signature`, 400 `bad_request` |
| anything else | | | 404 `not_found` |

Every reply that is not a document has the same fields: `ok`, `code`, `message`, `team`, `sport`, `retryAfterSeconds`. The empty document is `schemaVersion` 2, `team` (`key`, `name`) and an empty `streams` list; today a missing file answers 502 (`index.js:204-207`).

| HTTP | `code` | Meaning | Phone |
|---|---|---|---|
| 202 | `started` | Dispatch sent | Polls |
| 202 | `in_progress` | The same game was dispatched inside the cooldown; nothing was sent | Polls |
| 200 | `video_ready` | A pipeline entry for this game already exists; nothing was sent | Refreshes the streams once |
| 409 | `not_in_window` | The game is not Live and not between 20 min before its start and the end of its grace; nothing counted | "Get video works from 15 minutes before the start until the game ends." |
| 400 | `bad_request`, `bad_team`, `bad_sport`, `bad_event` | Body is not a JSON object or a field is missing / key not in the catalog / sport missing, not offered, or sent for a pro team / the event is not this team's | Error text |
| 401 | `unauthorized` | Wrong app key | Error text |
| 429 | `rate_limited`, `game_limit` | An IP limit (with `Retry-After`) / the per-game run cap | "Get video was asked for too often. Try again in N minutes." (N from `Retry-After`) |
| 503 | `busy` | The global hourly cap or the in-flight cap (with `Retry-After`) | Same message |
| 502 | `dispatch_failed` | GitHub answered something other than 204 (`index.js:241-244`). GitHub text goes only to the Worker logs | Error text |
| 500 | `not_configured` | `APP_KEY`, `RUN_STATUS_KEY` or `GITHUB_TOKEN` is missing | Error text |

`X-Run-State` values: `queued` (dispatched, no result yet), `none`, or the run's final code. The phone stops at `published` when the entry appears, and at any other final code with "No video was found for this game yet." (`no_video`, `sources_unreachable`, `ambiguous_link`, `deadline`) or the matching message for `too_early`, `game_over` and `no_game`.

### Get video progress

The phone shows that the search is moving, in plain words, so a long wait never looks like a frozen app. Progress is keyed by team and event, so every phone waiting on the same game sees the same thing.

| Moment | Phone text (under the Get video button) |
|---|---|
| Button pressed, search not yet on a site | `Looking for video…` |
| Trying a site (`k` of `n`) | `Looking for video (k of n)…` with `n` dots, one filled per site tried |
| A site is found | `Video found. Getting it ready…` |
| Saved | The Play button appears |
| No site had it | `No video found. Try again in a few minutes.` |
| Nothing new for 90 s | `Still looking…` |
| `too_early`, `game_over`, `no_game` | Today's plain messages for those cases |

- The phone never shows why a site failed, a site name or a host. The reasons stay in the GitHub run summary for the owner (Listing failover).
- `n` comes from the run; the phone does not know the source count in advance. Leaving the screen and coming back during the run picks the progress up again from the next poll.
- Steps sent: the Worker records `requested` on `202 started` or `in_progress`; the `extract` job posts `source_start {k, n}` and `found {k, n}`; `publish.mjs` reports the final code through `/run-status`.
- `POST /run-progress` takes `{team, sport, eventId, runId, step, k, n, at}` signed with HMAC-SHA256 under `RUN_PROGRESS_KEY`, with the same 300 s replay window as `/run-status`. It can only record progress: it never sets a final code, never releases an in-flight slot and never touches a streams file. This keeps the result key (`RUN_STATUS_KEY`) out of the job that opens untrusted pages. `TeamGate` keeps the latest step for the game for 30 min.
- `GET /streams?team=<key>&event=<id>` returns the progress as header `X-Run-Progress` (compact JSON: `step`, `k`, `n`, `updatedSecondsAgo`) next to `X-Run-State`.
- Tests: Worker route, signature and replay tests for `/run-progress`; a pipeline test that no progress body carries a label or host; the Get video driver against the Worker v2 mock walks a three-site run that succeeds on site 3 and checks each phone text above.

`POST /get-video` check order: (1) the body is a JSON object; (2) the team's shape and catalog entry, retired entries included; (3) the sport against the team's kind; (4) `eventId` against `^\d{1,12}$`; (5) the `GlobalGate` wrong-key lockout for the IP; (6) a constant-time compare against `APP_KEY`, then `APP_KEY_PREVIOUS` when set (`pinMatches`, kept from `index.js:134-145`), with failures recorded in `GlobalGate`; (7) the event check in `events.js`: the event comes from ESPN `summary?event=` for the team's adapter, or statsapi `schedule?gamePk=` for MLB, cached 60 s per isolate; the team must play in it (else `bad_event`) and the game must be Live or inside the window (else `not_in_window`); when the provider does not answer, the check is skipped and the later gates still apply; (8) the readiness check against the cached streams file, with the phone's match rule (`video_ready`); (9) `TeamGate(<team>).reserve(ip, eventId)`: the per-game cooldown (`in_progress`), the IP+team limit, then the per-game cap; (10) `GlobalGate.reserve()`: the IP hourly limit, the in-flight cap and the global hourly limit, releasing the team reservation on refusal; (11) dispatch, releasing both reservations on failure, and `TeamGate` records `queued`. The key check comes before the event check, so a caller without the key cannot make the Worker call ESPN. The wrong-key limit is IP-wide, because a per-team limit alone would allow guesses across about a thousand catalog keys.

`POST /run-status` accepts a body whose HMAC matches `RUN_STATUS_KEY` and whose `at` is within 300 s, stores the code in `TeamGate` for that game, and releases the run from the `GlobalGate` in-flight count. A run that never reports is released after 20 min.

| `[vars]` limit | Default (O8) | Keyed by |
|---|---|---|
| `COOLDOWN_SECONDS` | 180 | team + event (dedupe together with the pipeline's `video_ready` exit) |
| `GAME_DISPATCH_MAX` | 10 | team + event |
| `IP_TEAM_DISPATCH_PER_10_MIN` | 3 (today's count, `index.js:1-2`, no longer shared across teams) | IP + team (all sports of a school together) |
| `IP_DISPATCH_PER_HOUR` | 20 | IP (`rateLimitKey`: IPv4, or IPv6 /64, `index.js:81-93`) |
| `IP_FAILED_KEY_PER_HOUR` | 10 | IP |
| `GLOBAL_DISPATCH_PER_HOUR` | 60 | all, counted only for requests that pass the event check |
| `GLOBAL_IN_FLIGHT_MAX` | 15 | all; leaves 5 of the account's 20 concurrent jobs for release and catalog runs |
| `READ_LIMITER` binding | 120 per 60 s | IP, on `/streams` and `/catalog` |

A caller with the extracted key can start runs only for a game that is Live or near its start and has no entry yet, at most 10 per game, so the presses that reach Actions are presses that also serve the family. A caller spread over many IPs can still fill the global hourly cap; the response is a `[vars]` change or a key rotation (CI and deploy). Dispatch: `POST https://api.github.com/repos/<owner>/Danner_App/dispatches` with `{"event_type": "team-get-video", "client_payload": {"team": "ncaa-66", "sport": "football", "eventId": "<id>", "origin": "phone", "requestedAt": "<ISO time>"}}`.

Reads (`streams.js`): per isolate, the Worker keeps an index of each league folder from `GET /repos/<repo>/contents/streams/<league>` (file name to blob SHA), refreshed every 10 s by a conditional request; a 304 does not count against the PAT's primary limit (`index.js:197-199`), and a missing folder is cached as empty for 60 s. A team with no file in the index gets the empty document with no further GitHub call. A file is read by blob SHA with `Accept: application/vnd.github.raw` and cached per isolate by that SHA, which never changes. Catalog files use the same pattern with a 3600 s refresh. A publish is visible to a polling phone within about 15 s. `caches.default` is not used, because Cloudflare documents Cache API calls as no-ops on `*.workers.dev` (outside knowledge; to be confirmed at the staging deploy).

Gates (`gates.js`) are plain classes that take an injected storage object, so `node --test` runs them. `durable.js` holds the `TeamGate` and `GlobalGate` Durable Object shells that extend `DurableObject` from `cloudflare:workers` and delegate to `gates.js`; the Node tests never import it. `wrangler.toml` keeps `name = "guardians-get-video"` and adds `[vars]` for `GITHUB_REPO = "<owner>/Danner_App"` and the limits above, Durable Object bindings `TEAM_GATE` and `GLOBAL_GATE` with `new_sqlite_classes = ["TeamGate", "GlobalGate"]`, and a `[[ratelimits]]` binding `READ_LIMITER` (today's file has only a commented `[[unsafe.bindings]]` form, `workers/guardians-get-video/wrangler.toml:9-15`). SQLite-backed Durable Objects are offered on the Workers Free plan (outside knowledge); the Phase 2b staging deploy confirms it.

The PAT behind `GITHUB_TOKEN` comes from repo secret `WORKER_GITHUB_PAT`. The README allows a classic `repo` token (`workers/guardians-get-video/README.md:22`), so Phase 2b checks it; a classic token is replaced by a fine-grained one (this repo only, Contents read and write, Metadata read) and its expiry date goes into the owner's private record.

### Abuse and quota bounds

Items marked * are outside knowledge and do not appear in repo code.

| Resource | Limit | Bound in this design |
|---|---|---|
| Actions minutes | Free for standard runners on a public repo* | Event-window check, per-game cap, `video_ready` exit before the browser starts |
| Concurrent jobs | 20 per account on the Free plan*, shared with release builds | `GLOBAL_IN_FLIGHT_MAX` 15; one group per team+sport |
| PAT primary limit | 5,000 requests/h* | League index by conditional request; blobs cached by SHA; unknown keys never reach GitHub; at most 60 dispatches/h; daily `worker-health.yml` check |
| `GITHUB_TOKEN` in Actions | 1,000 requests/h per repo* | About 2-8 contents calls per run, at most 60 runs/h |
| Workers and Durable Objects Free | 100,000 requests/day each*, 10 ms CPU* | `READ_LIMITER`; hub tiles do not fetch; streams polled every 60 s only near a game; DO calls only on presses and Get video polls; a Cloudflare usage notification at 60% (owner, Phase 2b) |
| ESPN and statsapi from the Worker | No published limit* | Only after the key check; 60 s per-isolate cache per event |
| Commits on `main` | No hard limit | One per `published` outcome; at most 10 runs per game and 60/h overall (today about 30 commits in two months for three teams) |
| Junk files | — | Catalog allowlist in the Worker and pipeline; files created only on `published`; `publish.mjs` re-validates the path |

### CI and deploy

- `ci.yml` runs on `pull_request`, on `push` to `main` (ignoring `streams/**` and `catalog/**`) and on `workflow_call` with a `ref` input. Jobs: `app` (`npm ci`, `npm run typecheck`, `npm run test:all`, `node ../tests/imports/run.mjs`, which imports every pure module listed under App layout under plain Node); `pipeline` (`TZ` matrix `UTC`, `Pacific/Honolulu`, `America/Chicago`; `npm test` with the extractor injected, no browser); `worker` (`node --test workers/team-worker/test`, gates and routes only); `catalog` (`scripts/team-catalog/validate.mjs`: schema, unique keys, preset guards, overrides resolve, every `streams/**` file parses as v2 and maps to a catalog key); `hygiene` (fails on a tracked `config.json` under `scripts/`, and checks the `stream-pipeline.yml` permission blocks); `ios-build` (macOS, on `workflow_dispatch` and on PRs touching `app/modules/**` or `app/package.json`: `expo prebuild` plus an unsigned `xcodebuild`, O17).
- `main` has no required status checks (Decided 19). `release.yml` gains job `checks: uses: ./.github/workflows/ci.yml` with the tag ref; `android` and `ios` get `needs: checks`. `checks` also confirms that `<EXPO_PUBLIC_DANNER_WORKER_URL>/health` answers 200 and that the SHA-256 of `EXPO_PUBLIC_DANNER_APP_KEY` equals `release/app-key.sha256`. `android` verifies the signing certificate. The `release` job's Latest and create steps (`release.yml:220-253`) also creates the release as a draft when the tag's major version is above the latest published one (O20).
- `worker-deploy.yml`: `workflow_dispatch` with inputs `target` (`staging` deploys `--name guardians-get-video-staging`; `production` deploys the real name), `rotate_key` and `rollback`. Job `test` runs the Worker tests; job `deploy` runs `cloudflare/wrangler-action@v3` with `workingDirectory: workers/team-worker` after `npm ci` and an explicit `wranglerVersion` (a 4.x release with `[[ratelimits]]`, pinned in Phase 2b), and sets the Worker secrets `APP_KEY` (from `EXPO_PUBLIC_DANNER_APP_KEY`, refused unless its SHA-256 matches `release/app-key.sha256` or `rotate_key` is set), `RUN_STATUS_KEY`, `RUN_PROGRESS_KEY` and `GITHUB_TOKEN` (from `WORKER_GITHUB_PAT`). `rollback` deploys `workers/guardians-get-video/` with a `deleted_classes` migration for the two gate classes; it exists only until Phase 6 step 8. A `push` trigger on `workers/team-worker/**` and `.github/workflows/worker-deploy.yml` is added in Phase 6 step 8.
- `worker-health.yml` (from Phase 6 step 8): daily `cron: '41 14 * * *'`; calls `/health?deep=1`, `/catalog` and `/streams?team=mlb-5`, and opens an issue on any failure.
- Key rotation: a new `EXPO_PUBLIC_DANNER_APP_KEY` and hash ship in a release; the deploy runs with `rotate_key`, and `APP_KEY_PREVIOUS` holds the old key until the owner confirms every family phone has updated.

## TV Location

### What changes

| Today | Target |
|---|---|
| `TRIPOLI_DESTINATION`, `isTripoli`, Tripoli canonicalization (`app/tvLocation/destination.ts:9-13,44-46,59-61`); every mount starts at Tripoli (`TvLocationScreen.tsx:635`) | Deleted; no compiled location anywhere. The screen starts unloaded and reads both keys with one `multiGet` |
| `Use Tripoli default` (`TvLocationScreen.tsx:239-244`); error copy "…Tripoli is selected." (:656) | `Use my default (<label>)`, `Make this my default`; "The saved location could not be loaded. Choose a location." |
| Sign-in only inside step 3's verify WebView (`TvLocationScreen.tsx:32,619`) | `Sign in`, `Switch account`, `Sign out` in an `On this phone` panel below step 4 |
| Cookie module: Android flush only (`app/modules/danner-webview-cookies/expo-module.config.json`) | `clearYouTubeSession()` and `youTubeSessionState()` on Android and iPhone |
| The geolocation script runs on every document, including `accounts.google.com` and iPhone subframes (`geolocationInjection.ts:8-9`, `TvLocationScreen.tsx:590-592`) | The script returns at once unless the hostname is `youtube.com` or ends with `.youtube.com` |
| The map falls back to `DEFAULT_START` Tripoli (`app/scripts/offline-us-map.template.html:107,217-235`) | No start: a contiguous U.S. view with nothing selected |

### Location state and first use

| Key | Value | Written by | Removed by |
|---|---|---|---|
| `danner.tv.default.v1` | `{label, latitude, longitude}` (`destination.ts:3-7`) | First-use save; `Make this my default` | `Forget location` |
| `danner.destination.v1` | Same shape; the point YouTube receives | Any picker save; `Use my default` | `Forget location` |

`resolveTvLocation(defaultRaw, currentRaw)` in `destination.ts` (pure, unit-tested): both absent → first use; only the current point → it becomes the default, written once (this keeps every point a parent saved under v1.x, with no seeding code); only the default → current := default in memory; both → as stored; unparseable or a storage error → treated as absent, with the load-error banner. `destinationFromStored` keeps its coordinate validation (`destination.ts:15-35`).

- First use: step 1 reads `No location chosen yet` with `Choose on map`. `Use this location` (:420-425) is hidden, so steps 2-4 cannot start. The map opens on the contiguous U.S., and `Save this location` stays disabled until the page sends a `selected` event (pan, tap, `U.S.` button or a search result). Saving writes both keys.
- Once a default exists, the picker buttons are `Use this map location` (primary), plus `Use my default (<label>)` and `Make this my default` when the draft differs from the default. Step 1 shows `Use my default (<label>)` beside `Change map location` when the current point differs from the default. A moved point while on step 4 still returns to step 3 (:713-726).
- `On this phone` panel, after the step 4 card (after `TvLocationScreen.tsx:490`), with no step number, which keeps step 3 as an update-button-only step (`AI_RULES.md:59`): a status line (O14); `Sign in` (when signed out or unknown); `Switch account` and `Sign out` (when signed in or unknown); `Default: <label>` and `Forget location` (confirm, then `multiRemove` both keys and return to step 1). `Start over` (:741-746) keeps the location.

### Own-account sign-in

- `YouTubeTvWebView` is factored out of `VerifyView` (`TvLocationScreen.tsx:496-626`) with props `startUrl`, `injection?` and `onMessage?`. It keeps the navigation gate (`verifyNavigation.ts:17-34`, https `youtube.com`/`google.com` only), `sharedCookiesEnabled`, `thirdPartyCookiesEnabled`, `setSupportMultipleWindows={false}`, `geolocationEnabled={false}`, no `incognito`, and the 20 s / background / close flush (:523-539).
- `VerifyView` is `https://tv.youtube.com/verify` plus the geolocation injection, unchanged. `AccountView` has no injection. `Sign in` opens `https://tv.youtube.com/verify`, the only URL validated to send a signed-out WebView to Google sign-in (`Docs/Production/Validation.md:74`); the Phase 5 device check may replace it with an `accounts.google.com` sign-in URL whose `continue` target is on `tv.youtube.com`. `Switch account` opens Google's account chooser with a continue target on `tv.youtube.com`; its exact path is chosen in the same check, inside the existing gate. The view returns to the steps 800 ms after reaching `tv.youtube.com` from an `accounts.google.com` page.
- `Sign out`: confirm "Sign out of YouTube TV on this phone? The TV stays signed in.", then `clearYouTubeSession()`, then `flushWebViewCookies()`. Location and steps are unchanged.
- No credential fields, no password storage and no autofill. Google's pages handle 2-Step and device prompts. Passkeys are not expected to work in the embedded WebView, so the sign-in panel says: "If Google asks for a passkey, choose Try another way and use your password or phone." When the account view lands on Google's "This browser or app may not be secure" page or a `disallowed_useragent` error, the app closes it and shows "Google blocked sign-in inside the app for this account." The app never shows the account email. Whether the Android session survives a swipe-away is still open (`Validation.md:95`, Review) and is a Phase 5 exit row.

### Native module `app/modules/danner-webview-cookies/`

| Function | Android (`DannerWebViewCookiesModule.kt`) | iPhone (new `ios/DannerWebViewCookiesModule.swift`) |
|---|---|---|
| `flushCookies` | Unchanged | Not defined; a JS no-op as today |
| `clearYouTubeSession(): boolean` | `CookieManager.removeAllCookies` → `flush()` → `WebStorage.getInstance().deleteAllData()`. App-wide (O15) | `WKWebsiteDataStore.default()` records whose name contains `google` or `youtube` → `removeData`; `HTTPCookieStorage.shared` cookies on `google.com`/`youtube.com` |
| `youTubeSessionState(): 'signed-in' \| 'signed-out' \| 'unknown'` | Cookie names for `https://accounts.google.com` checked against an allowlist (`SID`, `__Secure-1PSID`, `__Secure-3PSID`; unverified) | The same names from `WKHTTPCookieStore.getAllCookies` |

Only the boolean or the enum crosses the bridge; cookie values never reach JS, logs or AsyncStorage. Any exception returns `false` or `'unknown'`. Config: `"platforms": ["apple", "android"]` (precedent `app/modules/danner-live-hls/expo-module.config.json`) and a podspec modeled on `app/modules/danner-provisioning-profile/ios/`.

- Host guard: the first statement of the IIFE in `createGeolocationInjection` (`geolocationInjection.ts:8-9`) returns unless the hostname is `youtube.com` or a `*.youtube.com` host, so `accounts.google.com` and other `*.google.com` pages never get the shim. iPhone subframe injection (`TvLocationScreen.tsx:590-592`) stays, and YouTube subframes keep the shim. The draft-IPA check in Phase 6 step 5 confirms the iPhone verify flow before the release is published.
- Team player WebViews in `app/playback/` keep `incognito={Platform.OS === 'ios'}` with the reason comment from `GuardiansScreen.tsx:629-631`: on Android, incognito clears every WebView cookie in the app and signs TV Location out. A source-check test enforces this.

### Offline map

| File | Change |
|---|---|
| `app/scripts/offline-us-map.template.html` | Delete `DEFAULT_START` (:107). Move the start parsing into a pure `startFromInputs(injected, hash, query)` inside `// BEGIN SELECTION RULES` (:104-211); it returns `undefined` unless latitude and longitude are both finite. With no start, fit the contiguous U.S. without `selectCenter()` (:466-476), so only `ready` is sent. `searchSelection` returns the Census point unless the label equals the saved point's label (:203-210) |
| `app/assets/offline-us-map.html` | Regenerate with `npm run build:offline-map -- --reuse-json` (`app/package.json:11`) |
| `app/tvLocation/offlineMapSelection.ts:208-224`, `OfflineUsMap.tsx:15-21,54-78` | Mirror the change: optional `savedStart`; with no destination, no hash and no start injection |
| `tests/offline-map/run.mjs` | :44 drops `DEFAULT_START` and adds `startFromInputs`; delete :48-49; rewrite :211-219 (a Tripoli search returns the Census point, and the test records its distance from the old default; a matching saved label returns the saved point); add `startFromInputs` cases |

## Rules, docs and tests

### `AI_Framework/AI_RULES.md`

`AI_RULES.md` line numbers in this plan refer to the file at `823d2be`; after Phase 0, old lines 18-40 are +1, 42-57 are +2, and 58-63 are +3. Phase 0 removes the directives that forbid planned work and marks the ones a later phase rewrites. Behavior rules are rewritten when the phase that changes the behavior lands, because docs describe current behavior (`AI_RULES.md:28`).

| Phase | Lines and action |
|---|---|
| 0 | ADD: "`Docs/Production/ModularTeams.md` is the approved delivery plan. Work inside a plan phase follows the plan where it differs from a constraint below; each phase rewrites the constraints it changes. `Docs/Archive/FixedTeams/` and tag `fixed-teams-final` are history, not constraints." REMOVE: the "…not a parameterized sports engine." and do-not-reuse dispatch, workflow and secret sentences at :53 and :55, and "Each module keeps its own copy." at :57. MARK :42, :44 and :47 with "(Superseded by `Docs/Production/ModularTeams.md`, Phase 4 or 5.)". EXTEND :17 (also Google or YouTube TV account data, every listing URL including backups, the app key); :28 (`Docs/Production/` briefs with a `Status:` header may describe planned work); :62 (the package id, bundle id and keystore never change; versionCode strictly rises; AsyncStorage keys carry a version suffix, a new version is written by migration, and the old key is removed only after the new write succeeds). ADD: Android WebViews never set `incognito`; team players use `incognito={Platform.OS === 'ios'}`. ADD: `main` has no required status checks, because bots commit to it |
| 1 | ADD: listing sources form an ordered list in the pipeline secret and are tried one at a time; a source is abandoned on a move-on failure (site down or blocked, or this game not found or not playable there); source 1 keeps today's timeouts; logs name `source k of N`, never a host |
| 2b | ADD: one pipeline (one workflow, one dispatch type, one secret); team, sport and event come from the dispatch and are checked against the committed catalog; the job that runs the browser never holds a write token; dedupe per game; rate limits per (IP, team); the allowlist is append-only |
| 3 | SPLIT :50-51 into a shared team-screen rule plus MLB adapter specifics; streams per team key through Worker v2 and `EXPO_PUBLIC_DANNER_*`, with the playback, Cast, TV relay and isolation sentences kept for all screens. REPLACE :52, :54, :56 with one fixture rule (`tests/leagues/`, `tests/team-harness/`, dev-only `EXPO_PUBLIC_TEAM_*` and `EXPO_PUBLIC_TEST_SELECTION`, never in the asset graph). GENERALIZE the rest of :53, :55 into NFL and NCAA adapter rules, and :57 to every featured card (3-way bar when ESPN gives a draw share). ADD the explicit `.ts` import rule for pure modules. EXTEND :15 (ports: 8108 fixture server, 8109 Cast web, 8111 Get video mock) |
| 4 | GENERALIZE :42 (hub, selected-team screens, fixed TV Location tile) and :49 (prompt suppressed while a team screen, the picker or TV Location is open). REPLACE :47 with the dynamic-hub rule (logo-only; selected teams, TV Location, `+`; the grid grows and scales; 30-tile cap; values live in `app/hub/hubGrid.ts` and `Docs/Art/README.md`). ADD picker, school-tile merge and removal, preset seeding, and logo rules |
| 5 | EXTEND :43 (app-opened sign-in and account-chooser URLs, inside the same gate, with no injection). REPLACE :44 (no compiled default; first use requires a choice; default and current stored on the phone). EXTEND :45, :58 (`Sign out` on both platforms), :59 (the `On this phone` panel outside the cards; no credential fields; injection only on `youtube.com` hosts) |

### Docs

| Path | Action | Phase |
|---|---|---|
| `Docs/Production/ModularTeams.md` | This plan, with header `Status: ACTIVE` | 0 |
| `Docs/Archive/FixedTeams/` | As indexed in its `README.md`: Hub, Guardians, Patriots, Cyclones, TvLocation, Pipeline, WorkerAndWorkflows, StreamsFiles and TestsAndRules, `Status: ARCHIVED`, pinned to `823d2be`. Its tag commands already use `fixed-teams-final`; the tag message changes to "Fixed three-team design archive snapshot" | 0 |
| `Docs/Production/Cyclones.md` | Header becomes `Status: SUPERSEDED` with a pointer to this plan, because it forbids parameterizing (:8); the archive links its `823d2be` text. Deleted in Phase 3 after its NCAA facts (:120-126, :130-133, :165-179, :327-354) move to `Docs/Domain/Leagues/NCAA.md` | 0, 3 |
| `app/README.md:5`, `app/hub/README.md:7`; `Docs/README.md:28`, `Docs/Production/README.md:9`; `AI_ONBOARDING.md:9` | The two README lines are marked superseded and rewritten with the phase that changes the folder; the Cyclones index rows become a plan row and an archive row; onboarding points to this plan and drops its duplicated `v1.4.16` sentence | 0 |
| `scripts/README.md:5-9`, `workers/README.md:5`, `.github/` notes | New packages and workflows | 2b |
| `Docs/Domain/{Guardians,Patriots,Cyclones}.md` | Become `Docs/Domain/Leagues/{MLB,NFL,NCAA}.md`, with the presets as worked examples. `Guardians.md:20-77` becomes `Docs/Domain/Streams.md`. New `Docs/Domain/TeamScreen.md`. Tier READMEs for `app/`, `app/team/`, `app/leagues/`, `app/playback/`, `app/streams/` and `tests/` | 3 |
| `Docs/Domain/Hub.md` (new), `Docs/Art/README.md:9-12,20,22,28-32`, `app/hub/README.md`, `Docs/Anchor/Vision.md:8`, `AI_ONBOARDING.md:5`, `Docs/Production/Validation.md:18` | Grid, `+`, picker, merge rules, persistence, seeding; accent and fetched-logo rules | 4 |
| `Docs/Domain/Playback.md:6-15,25,34`, `app/tvLocation/README.md` | First use, default and current, `Forget location`, own-account sign-in | 5 |
| `Docs/Technical/Stack.md:17-20,46-72,90-115`, `scripts/README.md`, `workers/README.md`, `release/RELEASE_NOTES.md`, `release/IPHONE_SETUP.md`, `release/build-update-assets.mjs:64`, `AI_Framework/IPHONE_INSTALL.md:50` | Rewritten for `v2.0.0` and the deleted folders | 6 |
| `Docs/Production/Roadmap.md:9-22,33` | Capability rows updated | each phase |

### Tests

| Layer | Path | Contents |
|---|---|---|
| Adapter fixtures and runner | `tests/leagues/<adapter>/`, `tests/leagues/run.mjs [--league k]` | Probe captures plus the expected `TeamGame[]`; every adapter × the nine phone zones (`tests/patriots/run-snapshot.mjs:33-43`); app adapter rows equal catalog rows |
| Engine | `tests/team-engine/run.mjs` | Every case from the three `run-snapshot.mjs` suites, ported before the old folders are deleted: featured pick, recap day, `Time TBA`, delays, video window, stream match (fixtures shared with the pipeline, including a postponed event and a resumed game), records, partial-failure carry-forward, elimination (CBI, CIT, CFP, conference finals), live merge |
| Imports | `tests/imports/run.mjs` | Imports every pure module under plain Node |
| Hub and selection | `tests/hub/run.mjs`, `tests/selection/run.mjs` | `hubGrid` for n = 1..32 on four sizes (no overlap, inside the container); ops including the 30-tile cap; migrations (corrupt JSON, schema bump, read-only mode); the seeding table; catalog parse with retired entries |
| TV Location | `tests/tv-location/run.mjs`, `tests/offline-map/run.mjs` | `resolveTvLocation`; button visibility; host guard (the injection evaluated against fake `window.location` values for `tv.youtube.com`, a `*.youtube.com` subframe and `accounts.google.com`); the `incognito` source check |
| Device harness | `tests/team-harness/server.mjs` (8108), `run-android.mjs --team <key> --scenario <s>`, `run-get-video.mjs --team <key>` (Worker v2 mock on 8111, including `X-Run-State` and `X-Run-Progress`), `run-picker.mjs`; `tests/tv-location/run-android.mjs` | Replaces the three per-team servers and drivers. The dev build gets `EXPO_PUBLIC_TEST_SELECTION`. The picker driver checks a fresh install, a pro add, a two-sport school becoming one tile, a remove-one-sport, the cap, and `adb install -r` keeping tiles and TV keys |
| Playback | `tests/playback/` ← `tests/guardians/run-cast-discovery.mjs`, `run-cast-web.mjs`, `run-shell-fix.mjs`, `extract-uidump.mjs` | Taps the first seeded tile |
| Pipeline | `scripts/stream-pipeline/test/` | Config (timing bounds), catalog, sources (each NEXT and STOP code, the challenge-aware HTTP stage, source 1 without a cap, backup clamping on a fake clock, outcome precedence, `SOURCE_ONLY`), redaction and masking (a captured fake run log never contains three fake hosts), streams v2, publish (404 create, 422 retry, candidate re-validation, run-status signature), schedules. The 65 existing tests are ported where their rule survives; the listing host in `extractGooz.test.mjs:36,46` becomes `example.invalid` |
| Worker | `workers/team-worker/test/` | Every route and code, check order, no GitHub text in bodies, the empty document, the league index, each gate class with fake storage, reservations released on dispatch failure, run-status signature and replay window |
| Removed | `tests/guardians/prove-get-video.mjs` | It makes live GitHub calls and logs a debug payload (:45-56, :122-134) |

npm scripts (`app/package.json:12-42`): Phase 2b adds `test:all`, which runs today's snapshot, offline-map, provisioning-warning and app-update suites; later phases add `test:leagues`, `test:team-engine`, `test:hub`, `test:selection`, `test:tv-location`, `test:imports`, `test:team:*`, `test:picker:android`, `test:tv-location:android` and `test:playback:*`, and extend `test:all` with each pure-Node suite.

## Delivery phases

| # | Phase | Ships as | Installed `v1.4.16` phones |
|---|---|---|---|
| 0 | Plan, archive, tag, rules unblocked | Docs commit and tag | Unaffected |
| 1 | Listing backups in today's pipeline | Merge to `main` | Get video gains backups |
| 2a | Catalog and probe | Merge to `main` | Unaffected |
| 2b | Backend v2 dormant, CI | Merges to `main`; staging Worker only | Unaffected |
| 3 | App engine refactor | Merge to `main`, no tag | Unaffected |
| 4 | Dynamic hub, picker, persistence, seeding | Merge to `main`, no tag | Unaffected |
| 5 | TV Location made generic | Merge to `main`, no tag | Unaffected |
| 6 | Cutover | Draft `v2.0.0`, Worker v2 deploy, release published | Play and Get video stop from the Worker deploy until the phone updates |
| 7 | NBA, WNBA | App `v2.1.0` and catalog | — |
| 8 | NHL, MLS, NWSL | App `v2.2.0` and catalog | — |
| 9 | Other major categories (O12) and team code (O13) | App `v2.3.0` and catalog | — |
| 10 | Cleanup | Next release | — |

Order: 0 → 1 → 2a → 2b → 3 → 4 → 6. Phase 5 starts after 2b (it needs the `ios-build` job) and runs alongside 3 and 4; Phase 6 needs 3, 4 and 5. No `v*` tag is pushed on `main` from the start of 3 until 6, because a tag would ship a half-built app (`release.yml:4-6`). A `v1.4.x` hotfix branches from tag `v1.4.16`.

**Phase 0: Plan, archive, rules unblocked**
- Scope: commit this plan and `Docs/Archive/FixedTeams/`; mark `Docs/Production/Cyclones.md`, `AI_RULES.md:42,44,47`, `app/README.md:5` and `app/hub/README.md:7` superseded; apply the Phase 0 rule edits, `AI_ONBOARDING.md:9` and the index rows; add the annotated tag `fixed-teams-final` on `823d2be` (O1).
- Exit: `git grep -n -e "not a parameterized" -e "Do not parameterize" -- . ':!Docs/Archive/**' ':!Docs/Production/ModularTeams.md' ':!Docs/Production/Cyclones.md'` finds nothing; every remaining hub, Guardians-module or Tripoli constraint carries the superseded marker or falls under the Phase 0 override sentence.
- Owner: approve the doc writes (`AI_RULES.md:34`) and push the tag.

**Phase 1: Listing backups in today's pipeline (O2)**
- Scope: in `scripts/guardians-stream-pipeline/`, add `lib/sources.mjs`, `lib/extract/providers.mjs` and `lib/redact.mjs` with the stages, codes, budgets and masking above, including the challenge-aware listing status. The three workflows gain a step that writes `STREAM_PIPELINE_CONFIG` to `$RUNNER_TEMP` and masks every source host, and the `source` input. Its `sources` replace `extract.baseUrl`; when the secret is empty, the per-team `extract.baseUrl` is the only source (this fallback leaves with the old package). Source 1 keeps the per-team `extract.timeoutSeconds` and grace from the per-team secrets; the new secret's `matching` and `timing` take effect from Phase 2b. The Worker, dispatch types, root files and app do not change.
- Exit: pipeline tests green; `dry_run` + `force` runs per team, where Guardians may end at `no_game` out of season and Patriots and Cyclones reach `dry_run` from source 1 with the new classifier; one `source: 2` run on an in-season team reaches `dry_run` from source 2 with host-free logs; normal dispatches still publish. Validation rows: `Listing source fallback (unit)` and `(Actions)`.
- Owner: create `STREAM_PIPELINE_CONFIG` before the merge (see the last section) and run the dry runs.

**Phase 2a: Catalog and probe**
- Scope: `scripts/team-catalog/`, `team-catalog.yml`, the `.gitignore` entry for its raw captures. After the merge the owner dispatches it; `catalog/probe-report.json` is reviewed, and probe captures for `mlb`, `nfl` and the three `ncaa/*` adapters are committed under `tests/leagues/`.
- Exit: the bot commit lands on `main` after the Decided 19 ruleset is on; the preset and nickname guards pass; `validate.mjs` is green; the report separates network and shape errors; an off-season league (MLB) still passes.
- Owner: set the Decided 19 ruleset before the first catalog run.

**Phase 2b: Backend v2 dormant, CI**
- Scope: the `scripts/stream-pipeline/` package (Phase 1 modules copied in unchanged) with `config.defaults.json`; `stream-pipeline.yml` on `team-get-video` (nothing sends that type until Worker v2 is live); the `workers/team-worker/` source; `ci.yml`; `test:all` in `app/package.json`; `allowImportingTsExtensions` in `app/tsconfig.json`; the `.gitignore` entries; `worker-deploy.yml` with `workflow_dispatch` only; and in `release.yml` the `checks` job with the Worker `/health` preflight, the signing-certificate check and the O20 draft rule. `workflow_dispatch` runs only workflow files on the default branch, which is why the new workflow is merged before the cutover.
- Exit: CI green; dry runs of the new workflow for `mlb-5` (`no_game` out of season), `nfl-17`, `ncaa-66` × three sports and one in-season non-preset team publish nothing and log no host; an unknown key is rejected before any fetch; the `hygiene` job confirms the `extract` job is read-only; the staging Worker deploys with the Durable Object migration, answers `/health?deep=1`, refuses a wrong key, answers `not_in_window` for an old event, and survives a rehearsal of `rollback` followed by a v2 redeploy; the Worker and catalog contract are frozen.
- Owner: add repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `EXPO_PUBLIC_DANNER_WORKER_URL` (`<paste Worker origin>`, today's origin from the Cloudflare dashboard), `EXPO_PUBLIC_DANNER_APP_KEY` (`<paste app key>`, a new random value; its SHA-256 is committed as `release/app-key.sha256`. Reusing today's PIN value also works; a new value retires the PIN shipped inside `v1.x` builds), `RUN_STATUS_KEY` (`<paste random value>`), `RUN_PROGRESS_KEY` (`<paste a second random value>`) and `WORKER_GITHUB_PAT` (`<paste PAT>`, fine-grained; replace a classic token here and record the expiry). The app build reads the two `EXPO_PUBLIC_DANNER_*` secrets only from the cutover PR on; the staging deploy reads the app key, `RUN_STATUS_KEY` and `WORKER_GITHUB_PAT`. Compare the private record of the three old secrets with `config.defaults.json` and the catalog needles, and put any difference into `STREAM_PIPELINE_CONFIG`. Turn on a Cloudflare usage notification at 60% of the Workers Free daily requests. The agent records the `v1.4.16` APK certificate SHA-256 from the public release asset in `release/android-signing-cert.sha256`.

**Phase 3: App engine refactor**
- Scope: `app/playback/`, `app/streams/` (Worker v2 contract), `app/team/`, `app/leagues/`, `app/scoreboards/`, `app/selection/types.ts` and `presets.ts`. The preset tiles open `TeamScreen` from the still-fixed hub. Adapter, engine, import, harness and playback tests move; Phase 3 rules, adapter docs and tier READMEs are updated.
- Exit: `test:leagues` (nine zones), `test:team-engine` and `test:imports` green with every ported case; `npx expo export` for both platforms resolves the `.ts` specifiers; emulator scenarios (today, ready, delayed, live, final) per preset against the fixture server; the Get video driver passes against the Worker v2 mock; `app/{guardians,patriots,cyclones}/` deleted; typecheck clean.

**Phase 4: Dynamic hub, picker, persistence, seeding**
- Scope: grid, tiles, tile actions, picker, catalog snapshot, the rest of `app/selection/`, logos (`expo-file-system`), seeding layers 1-2, splash gating; Phase 4 rules and docs.
- Exit: pure tests green; `run-picker.mjs` green; a local build with `RELEASE_TAG=v2.0.0` (versionCode 20000, never pushed) whose certificate matches `release/android-signing-cert.sha256`, installed with `adb install -r` over an emulator `v1.4.16` with legacy keys, seeds the three presets; over a second `v1.4.16` emulator with no legacy keys it seeds through layer 2; tiles and TV keys survive a further `adb install -r`; CI `ios-build` green.

**Phase 5: TV Location made generic**
- Scope: keys and first use, picker buttons, the `On this phone` panel, `AccountView`, the native functions on both platforms, the host guard, and the map template and tests; Phase 5 rules and docs.
- Exit: `test:tv-location` and `test:offline-map` green, with the Tripoli search distance recorded; `tests/tv-location/run-android.mjs` green (first use blocks, save, relaunch restores, forget); on a physical Android phone with a second Google account: sign in, update the TV location, switch account, sign out (the next verify asks for sign-in); the session survives a swipe-away (closes `Validation.md:95`); a team `web` player opened and closed leaves TV Location signed in (`Validation.md:44`); the `Sign in` URL is chosen; CI `ios-build` green. iPhone rows wait for Phase 6 step 5 (O16).
- Owner: run the physical Android check with the owner's own test account; the agent never sees credentials.

**Phase 6: Cutover**
1. Confirm the Phase 2b secrets and the PAT check, and that the Phase 3-5 exits are met.
2. Pick a day with an evening game for an in-season preset or catalog team, and start in the morning.
3. Merge the cutover PR: the env rename in `release.yml`, the app-key hash check in `checks`, `streams/mlb/5.json`, `streams/nfl/17.json` and `streams/ncaa/66.json` from the template, and the Phase 6 doc and release-text rewrites. Nothing is deleted yet, so the v1 Worker and the old workflows keep serving `v1.4.16` phones.
4. Push tag `v2.0.0`. `release.yml` runs `checks`, builds, and creates a draft release (O20).
5. The owner installs the draft APK over `v1.4.16` on one Android family phone and the draft IPA over `v1.4.16` on one family iPhone (SideStore `+` with the downloaded IPA, `AI_Framework/IPHONE_INSTALL.md`). Checks: presets seeded, saved TV point kept, logos, tile actions, TV sign-in, switch and sign-out, and tiles kept after a restart. Play and Get video wait for step 6.
6. Run `worker-deploy.yml` with `target=production`. Live checks: `/health?deep=1`, `/catalog`, `/streams?team=` for each preset and for a team without a file (empty document), `/get-video` with a wrong key (401) and with an old event (`not_in_window`); `stream-pipeline.yml` dry runs for each preset and sport (out-of-season ones end at `no_game`).
7. Publish the draft as Latest. Family phones update from the prompt: Android in place; iPhone through SideStore with LocalDevVPN on Wi-Fi (`AI_RULES.md:49`). A phone whose prompt fails installs by hand: the APK from the release page, or SideStore `+` with the IPA.
8. In the evening game's window: a `force` + `dry_run` + `source: 2` run reaches `dry_run`, and a Get video press on a family phone publishes. Then merge the cleanup PR: delete the three old workflows, `scripts/guardians-stream-pipeline/` and its `.gitignore` lines, `workers/guardians-get-video/` and the root `*_streams.json` files; remove the `rollback` input; add the `push` trigger to `worker-deploy.yml` and add `worker-health.yml`.
9. After the first published v2 stream, the owner deletes `GUARDIANS_STREAM_PIPELINE_CONFIG`, `PATRIOTS_STREAM_PIPELINE_CONFIG`, `CYCLONES_STREAM_PIPELINE_CONFIG`, `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL`, `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` and the Worker secret `FAMILY_PIN`, and deletes the staging Worker.
- Rollback before step 7: run `worker-deploy.yml` with `rollback=true` (the old workflows and root files are still on `main`), delete the draft release, fix, and repeat from step 4 with `v2.0.1`. After step 7: fix forward with `v2.0.x`.
- Exit (cutover complete): the release is published with `checks` green; the step 6 and step 8 checks pass; every family phone is on `v2.0.0` with the presets seeded (the owner confirms each phone in `Docs/Production/Validation.md`); the iPhone rows for seeding, persistence, sign-in and sign-out are closed from step 5; `Android in-app APK update` (`Validation.md:97`) and `iPhone SideStore update handoff` (`:98`) are closed by the family updates. A later Validation row, `MLB first live Get video`, closes at the first Guardians game of 2027.

**Phase 7: NBA and WNBA (`v2.1.0`).** Scope: probe captures, adapter rows on the existing four-quarter board, catalog `pickable`.
- Exit: clean probe report; fixtures committed; `test:leagues --league nba` and `--league wnba` green in nine zones; one pipeline dry run per league (`no_game` when out of season); emulator add and open; release published. No Worker deploy is needed, because the Worker reads the catalog from `main`.

**Phase 8: NHL, MLS and NWSL (`v2.2.0`).** Scope: hockey and soccer boards, W-L-OTL and W-D-L records, the 3-way bar.
- Exit: clean probe report (soccer with and without `fixture=true`); fixtures with OT, SO, ET and PK cases; nine-zone adapter tests; a 3-way bar test; one dry run per league; emulator add and open; release published.

**Phase 9: Other major categories and team code (`v2.3.0`)**
- Scope: the O12 categories whose probe passes (new college sport keys or leagues), and the O13 team code: `Share these teams` sends `DANNER-TEAMS-1:` plus base64url JSON of `[[TeamKey, sports?], …]` through React Native `Share`; `Paste a team code` checks every key against the catalog, skips and counts unknown keys, then merges through the selection operations.
- Exit: per category, a clean probe report, fixtures, nine-zone adapter tests, one dry run and an emulator add and open; categories that fail stay hidden and are listed in the Roadmap; a team code shared from one emulator and pasted on a second gives the same tiles; release published. The owner may defer this phase by recording that choice in the Roadmap.

**Phase 10: Cleanup.** Trigger: the owner has confirmed every family phone on `v2.x` in `Validation.md`, or 60 days after `v2.0.0`, whichever comes first. Remove seeding layers 1 and 2 and `getInstallTimes()` ; retitle or fold the preset Validation rows; remove the stale `iOS compile check` workflow registration (registered in Actions, file absent at HEAD); remove `APP_KEY_PREVIOUS` handling if unused; sync the Roadmap. Ships with the next release.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Google blocks account sign-in inside embedded WebViews, or for some account types | Those people lose YouTube TV sign-in, and with it the TV flow | Phase 5 physical check and the step 5 iPhone check before publication; a clear block-page message; no stored-credential workaround exists. The fallback is a redesign around a system browser session |
| ESPN shapes for unverified leagues differ from the repo's NFL and NCAA parsing | Wrong or empty screens | A league stays non-pickable until its probe passes and fixtures exist; the app ignores unknown keys; a failed list carries its data forward |
| ESPN blocks GitHub Actions or Cloudflare IPs | `schedule_failed` runs; probe failures | Probe failures never demote a shipped league; the Worker event check fails open; the backup listing sources do not cover this single point of failure |
| A family iPhone shows no upgrade signal | Presets missing after the update | Any iPhone that ever opened a team screen carries a stream cache; the rest add the three teams through the picker. Phase 6 step 5 checks one family iPhone before publication |
| Identity drift (package, keystore, bundle id, SideStore account, versionCode, update channel) | Selections, logos, TV keys and the Google session are lost, or the update is never seen or is refused | Phase 0 rule at `AI_RULES.md:62`; the bundle-id assertion (`tests/app-update/run.mjs:324`) plus a package-id assertion; the signing-certificate check in `release.yml`; the Phase 4 upgrade test |
| An APK signed with the public debug key is installed as an update | It can read the app's WebView cookies and Google sessions | Install only from the in-app update or this repository's releases (TV sign-in copy, `release/IPHONE_SETUP.md`) |
| The gap between the Worker v2 deploy and phone updates | `v1.4.16` phones have no Play or Get video | The release is built and checked before the deploy and published right after it; scores and schedules keep working because they come directly from ESPN and statsapi |
| Durable Objects or the rate-limit binding are not available on the Free plan | Worker v2 deploy fails | The Phase 2b staging deploy proves it; the fallback is a per-isolate gate with the same `[vars]` |
| The app key is extracted from a build | Strangers dispatch runs | The key check before any external call; event-window check; per-game cooldown and cap; IP+team and IP limits; global and in-flight caps; concurrency groups; files created only on `published` |
| The PAT expires or is drained | `/streams` and Get video stop for everyone | Reads mostly cost nothing against the PAT; `worker-health.yml` opens an issue; the expiry date is in the owner's private record |
| A browser exploit on a listing or player page | Code pushed to `main` and shipped in the next release | The `extract` job has a read-only token and no stored credentials; `publish` has no browser and re-validates |
| The primary listing site sits behind a Cloudflare challenge | A 403 or 503 first response | The challenge stage waits for the listing link as today before classifying; source 1 keeps its 90 s navigation |
| Listing sites change or go down | Get video finds nothing | Ordered backups, structured failover, provider table, step summary per source |
| A host leaks into a public log | Listing URL exposed permanently | `::add-mask::` before any output; `redact.mjs`; no traces or screenshots uploaded; the masking test |
| Bad ESPN data shrinks or corrupts the catalog | The picker loses teams, or tiles get `bad_team` | 90% shrink guard; append-only allowlist with `retired`; preset guards; `validate.mjs` before every catalog commit and in CI |
| GitHub secrets are write-only | The listing URLs cannot be read back | The owner keeps the full secret JSON in a private record |
| AsyncStorage fails at launch | No tiles, or tiles overwritten | Read-only mode for that session; the key is never deleted; migrations write the new key before removing the old |

## Where the owner pastes backup listing URLs

1. On GitHub, open the `Danner_App` repository, then Settings → Secrets and variables → Actions → Repository secrets.
2. Create `STREAM_PIPELINE_CONFIG` before the Phase 1 merge, or choose Update on it later.
3. Paste the JSON below. Listing URL 1 is the current listing site, and the backups follow in the order they should be tried. Take URL 1 from the private record, because the old secrets cannot be read back. Up to 5 sources are allowed. Labels use lowercase letters, digits and `-` only. Do not add `timing` unless the private record of the old secrets differs from `config.defaults.json`.
4. Save. Keep the full JSON in the same private record for later edits. Adding, removing or reordering a backup only needs a secret update: no code change and no app release.
5. To check a backup while a game is on: before the cutover, open Actions → `<Team> stream pipeline` → Run workflow; after the cutover, open Actions → `Stream pipeline` → Run workflow and enter `team` (for example `nfl-17`). Check `dry_run` and `force`, and set `source` to `2`. The step summary names sources only by number and label.

```json
{
  "schemaVersion": 2,
  "sources": [
    { "label": "primary",  "baseUrl": "<paste listing URL 1>" },
    { "label": "backup-1", "baseUrl": "<paste listing URL 2>" },
    { "label": "backup-2", "baseUrl": "<paste listing URL 3>" }
  ]
}
```

Optional per-source fields: `"timeoutSeconds": 120` (30-300; backups default to 120, source 1 has no cap unless set) and `"matching"` when a site spells a team's link differently, for example `"matching": { "teams": { "nfl-17": { "hrefNeedles": ["<slug used by this site>"] } } }`. Do not paste the URLs anywhere else, including issues, docs or chat.
