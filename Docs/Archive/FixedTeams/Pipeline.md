Status: ARCHIVED
Snapshot: 823d2be (2026-10-31)

# Stream Pipeline (Fixed Teams)

This is the record of `scripts/guardians-stream-pipeline/` as it stood at commit `823d2be562d252c9f3b0da305275adc6d8498f55` (`main`, 2026-10-31). One Node package served three fixed modules: Cleveland Guardians (MLB statsapi), New England Patriots (ESPN NFL), and Iowa State Cyclones (ESPN NCAA football, men's basketball, and women's basketball). Each module had its own GitHub Actions workflow, config secret, and root streams file. The pipeline picked the featured game, opened a private listing site in a headed Chromium, found the one link for that game, pulled the provider player URL, checked it against the phone's playable rules, and published it into the module's root streams file through the GitHub contents API.

Every `path:line` below is at the pinned commit. Paths are repo-relative. `P/` means `scripts/guardians-stream-pipeline/`. The provider player host is named only by its identifier `GOOZ_HOST`. The listing site is `<listing site>`.

Permalink base: `https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/`

| Section | Permalink |
|---|---|
| CLI entry | [P/run.mjs:1-118](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/scripts/guardians-stream-pipeline/run.mjs#L1-L118) |
| Module table | [P/lib/pipeline.mjs:47-67](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/scripts/guardians-stream-pipeline/lib/pipeline.mjs#L47-L67) |
| Config validation | [P/lib/pipeline.mjs:150-202](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/scripts/guardians-stream-pipeline/lib/pipeline.mjs#L150-L202) |
| Run sequence | [P/lib/pipeline.mjs:401-637](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/scripts/guardians-stream-pipeline/lib/pipeline.mjs#L401-L637) |
| Featured-game tiers | [P/lib/gameWindow.mjs:40-89](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/scripts/guardians-stream-pipeline/lib/gameWindow.mjs#L40-L89) |
| MLB schedule | [P/lib/mlbSchedule.mjs:1-144](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/scripts/guardians-stream-pipeline/lib/mlbSchedule.mjs#L1-L144) |
| NFL schedule | [P/lib/nflSchedule.mjs:1-160](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/scripts/guardians-stream-pipeline/lib/nflSchedule.mjs#L1-L160) |
| NCAA schedule | [P/lib/ncaaSchedule.mjs:1-221](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/scripts/guardians-stream-pipeline/lib/ncaaSchedule.mjs#L1-L221) |
| Listing link selection | [P/lib/extractGooz.mjs:459-516](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/scripts/guardians-stream-pipeline/lib/extractGooz.mjs#L459-L516) |
| Extractor main | [P/lib/extractGooz.mjs:1012-1245](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/scripts/guardians-stream-pipeline/lib/extractGooz.mjs#L1012-L1245) |
| Playable check | [P/lib/playableStream.mjs:95-182](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/scripts/guardians-stream-pipeline/lib/playableStream.mjs#L95-L182) |
| Upsert, prune, plan | [P/lib/streamsDocument.mjs:104-250](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/scripts/guardians-stream-pipeline/lib/streamsDocument.mjs#L104-L250) |
| GitHub publish | [P/lib/publishGithub.mjs:64-135](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/scripts/guardians-stream-pipeline/lib/publishGithub.mjs#L64-L135) |
| Behavior summary README | [scripts/README.md:1-9](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/scripts/README.md#L1-L9) |

Companion records in this folder: [WorkerAndWorkflows.md](WorkerAndWorkflows.md) (the Worker and the three workflows that ran this package), [StreamsFiles.md](StreamsFiles.md) (the files it wrote), [TestsAndRules.md](TestsAndRules.md) (harnesses and the governing rules).

---

## 1. File inventory

| File | Lines | Role |
|---|---|---|
| `P/run.mjs` | 118 | CI entry. Parsed flags and env, ran `--check-config`, called `runGoozPipeline`, printed steps, set the exit code |
| `P/lib/pipeline.mjs` | 637 | Orchestrator: config load and validation, module table, schedule fetch, featured game, window, extract call, playable check, publish |
| `P/lib/extractGooz.mjs` | 1245 | Playwright listing page to game page to provider embed URL extractor; link selection; log redaction |
| `P/lib/gameWindow.mjs` | 89 | `officialDateInZone`, `shiftGameDate`, `compareGames`, `selectFeaturedGame` (shared tiering) |
| `P/lib/mlbSchedule.mjs` | 144 | MLB statsapi fetch and parse (Guardians), MLB `featuredGame`, `isBlockedGame` (used by every module) |
| `P/lib/nflSchedule.mjs` | 160 | ESPN NFL fetch and parse (Patriots). No featured-game function of its own |
| `P/lib/ncaaSchedule.mjs` | 221 | ESPN NCAA football, men's and women's basketball fetch and parse (Cyclones), `featuredCyclonesGame` |
| `P/lib/playableStream.mjs` | 182 | Mirror of the phone's playable check (Guardians/Patriots schema and Cyclones schema) |
| `P/lib/streamsDocument.mjs` | 268 | Parse, serialize, match, upsert, prune, readiness, `planStreamUpdate` |
| `P/lib/publishGithub.mjs` | 135 | Contents API read plus SHA-guarded PUT with retry |
| `P/extract-gooz.mjs` | 103 | Local CLI that ran only the extractor. Not used in CI |
| `P/control-server.mjs` | 463 | Local-only HTTP harness with a Guardians-branded page. Not used in CI |
| `P/config.example.json` | 18 | Guardians example config (workflow fallback) |
| `P/config.patriots.example.json` | 19 | Patriots example config (workflow fallback) |
| `P/config.cyclones.example.json` | 22 | Cyclones example config (workflow fallback) |
| `P/config.demo.json` | 24 | Guardians example with an unused `playback` block |
| `P/package.json` | 19 | `"type": "module"`, `engines.node >=20`, one dependency `playwright ^1.55.0` (lock resolved `1.62.1`) |
| `P/package-lock.json` | 60 | Also the cache key for npm and the Playwright browser cache in the workflows |
| `P/*.test.mjs` (5 files) | 1377 | `node:test` suites, 65 tests (section 17) |
| `scripts/README.md` | 9 | Behavior summary for the folder |

`.gitignore:56-58` ignored `P/config.json`, `P/node_modules/`, and `P/.probe-output/`.

---

## 2. Entry point: `P/run.mjs`

### 2.1 Help text (`run.mjs:9-32`)

```text
Guardians, Patriots, and Cyclones stream pipeline

Usage:
  node run.mjs [--dry-run] [--force] [--config <path>] [--check-config] [--help]

Environment:
  GUARDIANS_STREAM_CONFIG  Path to config JSON
  GITHUB_TOKEN             Required to publish the module's streams file to GitHub
  PIPELINE_MODULE          guardians, patriots, or cyclones; the config must match it
  DISPATCH_SPORT           Cyclones sport to feature
  DRY_RUN=1                Same as --dry-run
  FORCE=1                  Same as --force

Steps:
  1. Read the module's featured game (MLB statsapi or ESPN).
  2. Skip unless the game is inside the 15-minute Get video window.
  3. Open the configured listing and find the one link with the team href needles and opponent.
  4. Extract a valid gooz /new-stream-embed URL with a numeric stream id.
  5. Apply the entry to the current streams file on GitHub and publish it.

--check-config validates the config for PIPELINE_MODULE and exits without fetching anything.
```

### 2.2 Flags (`run.mjs:34-61`)

| Flag | Effect |
|---|---|
| `--help`, `-h` | Printed the help text and returned |
| `--check-config` | Validated the config for `PIPELINE_MODULE` (and `DISPATCH_SPORT`) and exited without any network call |
| `--dry-run` | Same as `DRY_RUN=1` |
| `--force` | Same as `FORCE=1` |
| `--config <path>` | Config path; overrode `GUARDIANS_STREAM_CONFIG` |

Unknown arguments were ignored.

### 2.3 Flow (`run.mjs:67-118`)

1. `loadConfig(configPath)` ran first, even for `--check-config`. A read error or JSON error threw a value-free message (section 4.1).
2. `DISPATCH_SPORT` was read and trimmed (`run.mjs:75`).
3. With `--check-config`: `configProblem(config, { dispatchSport, expectedModule: PIPELINE_MODULE })`. A problem printed its message and set exit code 1. Success printed `Pipeline config is valid for <module>.` (`run.mjs:77-89`).
4. Otherwise `runGoozPipeline({ configPath, dispatchSport, dryRun, force })` (`run.mjs:91-96`). The config was loaded a second time inside.
5. Every step with a `message` was printed one per line, then `result.message` (`run.mjs:98-104`).
6. For `outcome: 'dry_run'` the would-be entry was printed as indented JSON (`run.mjs:106-108`).
7. `success: false` set exit code 1 (`run.mjs:110-112`). An uncaught throw printed its message to stderr and set exit code 1 (`run.mjs:115-118`).

---

## 3. Environment variables

| Name | Read at | Effect |
|---|---|---|
| `GUARDIANS_STREAM_CONFIG` | `run.mjs:38` | Config path. Shared by all three modules despite the name. Workflows set `config.json` |
| `PIPELINE_MODULE` | `run.mjs:80`; `pipeline.mjs:407-408` | `guardians`, `patriots`, or `cyclones`. A config for another module stopped the run as `config_missing` before any fetch |
| `DISPATCH_SPORT` | `run.mjs:75`; `pipeline.mjs:405-406` | Cyclones only. Scoped the featured game to one sport and narrowed needle validation |
| `DRY_RUN` | `run.mjs:39` | `1` stopped before publishing with `outcome: 'dry_run'` |
| `FORCE` | `run.mjs:40` | `1` skipped the window check and replaced an existing playable entry |
| `GITHUB_TOKEN` | `pipeline.mjs:426` | Present: read and publish through the contents API. Absent: read the checkout copy and write the local file only (`local_only`) |
| `EXTRACT_HEADLESS` | `extractGooz.mjs:519` | `1` forced headless Chromium |
| `EXTRACT_HEADED` | `extractGooz.mjs:522` | `1` forced headed Chromium (workflows set it and wrapped the run in `xvfb-run -a`) |
| `GITHUB_ACTIONS` | `extractGooz.mjs:525` | `true` defaulted to headed when neither of the two above was set |
| `TZ` | process-wide | Workflows set `America/New_York` (Guardians, Patriots) or `America/Chicago` (Cyclones). Official dates were computed explicitly per zone, but the NFL and NCAA season-year helpers used process-local `getMonth()` and `getFullYear()` |
| `GUARDIANS_PIPELINE_PORT` | `control-server.mjs:13` | Local harness port, default `8109` |

`runGoozPipeline` also accepted injection hooks for tests: `options.module`, `options.dispatchSport`, `options.now`, `options.githubToken`, `options.force`, `options.forceRefresh`, `options.dryRun`, `options.configPath` (`pipeline.mjs:401-430`, `317-319`).

---

## 4. Config file

### 4.1 Location and loading

- Path precedence: `--config <path>`, then `GUARDIANS_STREAM_CONFIG`, then `defaultConfigPath` = `P/config.json` (`pipeline.mjs:42-45`; `run.mjs:37-38`, `54-56`).
- In Actions, the "Write pipeline config" step wrote `P/config.json` from the module's repository secret with `printf '%s'`. An empty secret copied the module's committed example file instead (see [WorkerAndWorkflows.md](WorkerAndWorkflows.md)).
- `loadConfig` (`pipeline.mjs:69-82`) caught both errors and threw only `Pipeline config file could not be read.` or `Pipeline config is not valid JSON.`, because a `JSON.parse` error quotes part of the text and would have printed `extract.baseUrl`.

### 4.2 Keys

| Key | Type | Default when absent | Read at | Notes |
|---|---|---|---|---|
| `sport` | omitted, `"mlb"`, `"nfl"`, `"cyclones"` | omitted = Guardians | `pipeline.mjs:84-95` and every module switch | Chose the module, not a league. Any other value failed validation |
| `teamId` | number | `114` (MLB), `17` (NFL), `66` (Cyclones) | `pipeline.mjs:218-226` | Not validated |
| `leadMinutes` | number | `DEFAULT_LEAD_MINUTES = 15` (`gameWindow.mjs:1`) | `pipeline.mjs:231`, `421` | Window lead and featured-game tier 2 |
| `postStartGraceMinutes` | number | `DEFAULT_POST_START_GRACE_MINUTES = 180` (`gameWindow.mjs:2`) | `pipeline.mjs:230` | Examples used 180 (Guardians) and 240 (Patriots, Cyclones) |
| `probeTimeoutSeconds` | number | none | `pipeline.mjs:423` | Legacy. Only a fallback for `extract.timeoutSeconds`; no probe existed |
| `extract.baseUrl` | string | required | validated `pipeline.mjs:172-180`; used `pipeline.mjs:497` | `<listing site>`. Secret |
| `extract.hrefNeedle` | string | Guardians only: `cleveland-guardians` | `pipeline.mjs:141-147` | Single needle for Guardians and Patriots |
| `extract.hrefNeedles` | string array (Guardians, Patriots) or object keyed by sport (Cyclones) | none | `pipeline.mjs:128-148` | Shape depended on the module |
| `extract.requireOpponent` | boolean | `false` | `pipeline.mjs:520` | Demanded the opponent slug even on a single needle match |
| `extract.timeoutSeconds` | number | `probeTimeoutSeconds`, then `90` | `pipeline.mjs:422-423` | Per-navigation Playwright timeout |
| `github.owner` | string | `Danner36` | `pipeline.mjs:266` | |
| `github.repo` | string | `Danner_App` | `pipeline.mjs:268` | |
| `github.branch` | string | `main` | `pipeline.mjs:265` | |
| `github.streamsPath` | string | Guardians only: `guardians_streams.json` | `pipeline.mjs:101-110` | Had to equal the module's fixed file exactly |
| `github.commitMessagePrefix` | string | `guardians: update stream for` | `pipeline.mjs:361-362` | The default was the Guardians prefix even for the other modules |
| `playback.*` | object | none | none | Present only in `config.demo.json:11-16`. No reader existed |

Unknown keys were ignored. `configProblem` did not check `teamId`, numeric ranges, `github.owner`, `github.repo`, `github.branch`, `commitMessagePrefix`, `requireOpponent`, or `timeoutSeconds`.

### 4.3 Per-module config (committed examples; the secrets held the same shape)

| Key | Guardians (`config.example.json`) | Patriots (`config.patriots.example.json`) | Cyclones (`config.cyclones.example.json`) |
|---|---|---|---|
| `sport` | omitted | `"nfl"` | `"cyclones"` |
| `teamId` | `114` | `17` | omitted (default `66`) |
| `leadMinutes` | `15` | `15` | `15` |
| `postStartGraceMinutes` | `180` | `240` | `240` |
| `probeTimeoutSeconds` | `90` | `90` | `90` |
| `extract.baseUrl` | `<listing site>` | `<listing site>` (same value) | `<listing site>` (same value) |
| needles | `hrefNeedle: "cleveland-guardians"` | `hrefNeedle: "new-england-patriots"` | `hrefNeedles: { "football": ["iowa-state-cyclones"], "mens-basketball": ["iowa-state-cyclones"], "womens-basketball": ["iowa-state-cyclones"] }` |
| `extract.timeoutSeconds` | `90` | `90` | `90` |
| `github.owner` / `repo` / `branch` | `Danner36` / `Danner_App` / `main` | same | same |
| `github.streamsPath` | `guardians_streams.json` | `patriots_streams.json` | `cyclones_streams.json` |
| `github.commitMessagePrefix` | `guardians: update stream for` | `patriots: update stream for` | `cyclones: update stream for` |
| Secret that held the real config | `GUARDIANS_STREAM_PIPELINE_CONFIG` | `PATRIOTS_STREAM_PIPELINE_CONFIG` | `CYCLONES_STREAM_PIPELINE_CONFIG` |

The committed examples carried a reserved `example.com` placeholder in `extract.baseUrl`, so a run that fell back to an example could pass `--check-config` but never found a link. The three secrets carried the same listing URL; only the needles, `sport`, `teamId`, `streamsPath`, and commit prefix differed (`workers/guardians-get-video/README.md:23-25`).

Config shape for rebuilding (values are placeholders):

```json
{
  "sport": "cyclones",
  "teamId": 66,
  "leadMinutes": 15,
  "postStartGraceMinutes": 240,
  "probeTimeoutSeconds": 90,
  "extract": {
    "baseUrl": "<listing site>",
    "hrefNeedles": { "football": ["iowa-state-cyclones"], "mens-basketball": ["iowa-state-cyclones"], "womens-basketball": ["iowa-state-cyclones"] },
    "requireOpponent": false,
    "timeoutSeconds": 90
  },
  "github": {
    "owner": "Danner36",
    "repo": "Danner_App",
    "branch": "main",
    "streamsPath": "cyclones_streams.json",
    "commitMessagePrefix": "cyclones: update stream for"
  }
}
```

---

## 5. Module selection by sport

### 5.1 `MODULES` (`pipeline.mjs:47-67`)

The comment read: "Each module writes only its own root file. Official dates, and the "today" used to pick a game and to age out old entries, are calendar dates in the module's zone."

| Module | `label` | `sport` | `streamsPath` | `timeZone` |
|---|---|---|---|---|
| `guardians` | `Guardians` | none | `guardians_streams.json` | `America/New_York` |
| `patriots` | `Patriots` | `nfl` | `patriots_streams.json` | `America/New_York` |
| `cyclones` | `Cyclones` | `cyclones` | `cyclones_streams.json` | `America/Chicago` |

### 5.2 `config.sport` to module (`moduleForConfig`, `pipeline.mjs:84-95`)

| `config.sport` | Module |
|---|---|
| omitted or `"mlb"` | `guardians` |
| `"nfl"` | `patriots` |
| `"cyclones"` | `cyclones` |
| anything else | `undefined` (validation failure) |

`moduleTimeZone` fell back to the Guardians zone for an unknown module (`pipeline.mjs:97-99`).

### 5.3 Everything that switched on the module

| Behavior | Guardians | Patriots | Cyclones | Location |
|---|---|---|---|---|
| Schedule fetcher | `fetchGuardiansGames(teamId ?? 114)` | `fetchPatriotsGames(teamId ?? 17)` | `fetchCyclonesGames(teamId ?? 66)` | `pipeline.mjs:218-226` |
| Step name | `mlb_schedule` | `espn_schedule` | `ncaa_schedule` | `pipeline.mjs:208-216` |
| Featured-game function | `mlbSchedule.featuredGame` | `mlbSchedule.featuredGame` (NFL reused MLB's) | `featuredCyclonesGame` after optional `DISPATCH_SPORT` filter | `pipeline.mjs:228-241` |
| Official-date zone for "today" | New York | New York | Chicago | `pipeline.mjs:429` |
| Needles | `hrefNeedles` array, else `hrefNeedle`, else `cleveland-guardians` | `hrefNeedles` array, else `hrefNeedle`; no fallback | `hrefNeedles[game.sport]`; no fallback | `pipeline.mjs:125-148` |
| `streamsPath` when omitted | `guardians_streams.json` | validation failure | validation failure | `pipeline.mjs:101-110`, `163-170` |
| Playable schema | six fields, `sport` rejected | six fields, `sport` rejected | six fields plus required `sport` | `pipeline.mjs:334`, `427` |
| `noGameMessage` | `No Guardians game is scheduled for today.` | `No Patriots game ...` | `No Cyclones game ...` | `pipeline.mjs:204-206` |

The comment at `pipeline.mjs:125-127` stated the needle rule: "Only a Guardians config without needles falls back to its own team; no other module ever borrows a team."

---

## 6. `--check-config` and `configProblem` (`pipeline.mjs:150-202`)

The function returned the first problem as a message that named the setting, never its value. Checks ran in this order:

| # | Check | Message |
|---|---|---|
| 1 | Config is a plain object | `Pipeline config is not a JSON object.` |
| 2 | `moduleForConfig` is defined | `Pipeline config sport must be omitted (Guardians), "nfl", or "cyclones".` |
| 3 | `PIPELINE_MODULE` matches | `Pipeline config is for <module>, but this workflow runs <expected>.` |
| 4 | Non-Guardians module has `github.streamsPath` | `Pipeline config is missing github.streamsPath (<file>).` |
| 5 | `github.streamsPath`, when present, equals the module file | `Pipeline config github.streamsPath must be <file>.` |
| 6 | `extract.baseUrl` parses with protocol `http:` or `https:` | `Pipeline config extract.baseUrl is missing or is not an http(s) URL.` |
| 7 | Cyclones: `extract.hrefNeedles` is a non-array object | `Pipeline config extract.hrefNeedles must map each Cyclones sport to href needles.` |
| 8 | Cyclones: `DISPATCH_SPORT`, when set, is in `CYCLONES_SPORTS` | `Dispatch sport is not football, mens-basketball, or womens-basketball.` |
| 9 | Cyclones: with a dispatch sport, that sport has needles; without one, at least one sport has needles | `Pipeline config extract.hrefNeedles has no needles for <sports>.` |
| 10 | Guardians and Patriots: `hrefNeedlesForGame(config, undefined)` is non-empty | `Pipeline config is missing extract.hrefNeedle.` |

Each workflow ran `node run.mjs --check-config` before `npm ci`, so a bad secret failed in seconds. `runGoozPipeline` ran the same function again and returned `outcome: 'config_missing'` (`pipeline.mjs:410-418`).

---

## 7. Schedule libraries

All three returned an array of normalized game objects. Any non-OK HTTP response threw; the pipeline did not catch it, so the run exited 1.

### 7.1 MLB statsapi (`P/lib/mlbSchedule.mjs`)

| Item | Value | Line |
|---|---|---|
| Team | `GUARDIANS_TEAM_ID = 114` | 7 |
| Zone | `GUARDIANS_TIME_ZONE = 'America/New_York'` | 8 |
| Endpoint | `https://statsapi.mlb.com/api/v1/schedule` | 10 |
| Timeout | `SCHEDULE_TIMEOUT_MS = 15_000` via `AbortSignal.timeout` | 11, 106-108 |
| Query | `endDate=<season>-12-31`, `hydrate=team`, `sportId=1`, `startDate=<yesterday NY>`, `teamId=<id>` | 94-103 |
| Season | Year of today's New York date | 95-96 |
| Error | `MLB schedule request failed with <status>.` | 109-111 |

Parsing (`guardiansGameFromMlb`, 46-79): skipped entries without a numeric `gamePk`, a parseable `gameDate`, or both team objects; skipped games where neither side had the team id or the opponent had no name.

| Field | Source |
|---|---|
| `abstractState` | `status.abstractGameState ?? 'Preview'` |
| `gamePk` | `gamePk` |
| `gameDate` | `gameDate` (UTC ISO) |
| `gameNumber` | `gameNumber ?? 1` (doubleheaders gave 1 and 2) |
| `status` | `status.detailedState ?? 'Scheduled'` |
| `isHome` | home team id equals the team id |
| `opponentName` | opponent `team.name` |
| `officialDate` | MLB `officialDate` when it is `YYYY-MM-DD`, else the New York date of `gameDate` |
| `resumed` | `true` when `resumedFrom`, `resumedFromDate`, `resumeDate`, or `resumeGameDate` was present, or the schedule date differed from `officialDate` (`isResumedGame`, 31-44) |
| `timeValid` | `status.startTimeTBD !== true` |

Interruptions (`gameInterruption`, 13-25): status containing `cancel`, `postpon`, or `suspend` (case-insensitive). `isBlockedGame` (137-144) was true for any of the three. `isCompleteGame` (116-118) was `Final` without an interruption. `featuredGame` (122-130) called `selectFeaturedGame` with those two and the zone from options (default New York). `getFeaturedGuardiansGame` (132-135) was exported but not used by the pipeline.

### 7.2 ESPN NFL (`P/lib/nflSchedule.mjs`)

| Item | Value | Line |
|---|---|---|
| Team | `PATRIOTS_TEAM_ID = 17` | 1 |
| Season types | `[1, 2, 3]` (pre, regular, post) fetched in parallel | 3, 136-143 |
| Endpoint | `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/<id>/schedule?season=<y>&seasontype=<t>` | 139 |
| Timeout | `15_000` ms per request | 4, 140 |
| Season year | January and February used the previous year (`now.getMonth() <= 1`), process-local time | 17-19 |
| Error | `ESPN NFL schedule request failed.` when any of the three failed | 144-146 |
| Dedup | by `gamePk` | 149-157 |

Parsing (`patriotsGameFromEspnEvent`, 79-131): `competitions[0].competitors`, id from `team.id ?? id`, name from `team.displayName`. Fields: `abstractState` (`in` to `Live`, `post` to `Final`, else `Preview`), `gameDate = event.date`, `gameNumber = 1`, `gamePk = Number(event.id)`, `isHome`, `officialDate` = New York date of `event.date`, `opponentName`, `opponentScore`, `patriotsScore`, `seasonType` (`event.seasonType.type` or `2`), `status` (`espnContestStatus`), `timeValid` (`event.timeValid !== false && competition.timeValid !== false`).

`espnContestStatus` (51-77) searched name, description, detail, and shortDetail for `cancel`, then `delay`, then `postpon`, then `suspend`, and returned the description (or `Canceled`, `Delayed`, `Postponed`, `Suspended`); a `pre` state or `STATUS_SCHEDULED` returned `Scheduled`; anything else returned detail, shortDetail, or description. Scores went through `finiteScore` (21-35): non-negative integers, `0` when missing.

The pipeline used MLB's `featuredGame` and `isBlockedGame` for Patriots games.

### 7.3 ESPN NCAA (`P/lib/ncaaSchedule.mjs`)

| Item | Value | Line |
|---|---|---|
| Team | `CYCLONES_TEAM_ID = 66` | 3 |
| Zone | `CYCLONES_TIME_ZONE = 'America/Chicago'` | 4 |
| Sports | `football` = `football/college-football`; `mens-basketball` = `basketball/mens-college-basketball`; `womens-basketball` = `basketball/womens-college-basketball` | 9-13 |
| Requests | 3 sports times season types `[1, 2, 3]` = 9 parallel requests on every run | 189-198 |
| Endpoint | `https://site.api.espn.com/apis/site/v2/sports/<path>/teams/<id>/schedule?season=<y>&seasontype=<t>` | 200 |
| Football season | January used the previous year | 26-28 |
| Basketball season | July or later used the next year | 30-32 |
| Error | `ESPN NCAA schedule request failed.` when any of the nine failed | 205-207 |
| Dedup | by `<sport>:<gamePk>` | 210-219 |

`cyclonesGameFromEspnEvent` (96-155) produced the same fields as the NFL parser with `cyclonesScore` instead of `patriotsScore` and an added `sport`. The official date was the Chicago date of `event.date` when `timeValid`, and the New York date when the start time was unset, because ESPN's placeholder is midnight Eastern, which is still the previous day in Chicago (comment at 133-134).

Cyclones interruption rules (157-176): `isBlockedCyclonesGame` was true for `cancel`, `postpon`, `suspend`. Completion excluded `cancel`, `delay`, `postpon`, `suspend` (MLB's excluded only three). `featuredCyclonesGame` (178-187) always used the Chicago zone.

### 7.4 Normalized game object

| Field | Guardians | Patriots | Cyclones |
|---|---|---|---|
| `abstractState` | `Preview` / `Live` / `Final` | same | same |
| `gameDate` | UTC ISO start | same | same |
| `gameNumber` | 1 or 2 | always 1 | always 1 |
| `gamePk` | statsapi `gamePk` | ESPN event id | ESPN event id |
| `officialDate` | MLB `officialDate` | New York date | Chicago date, or New York date when TBA |
| `opponentName` | statsapi team name | ESPN `displayName` | ESPN `displayName` |
| `status` | statsapi `detailedState` | ESPN derived | ESPN derived |
| `timeValid` | `!startTimeTBD` | ESPN `timeValid` | ESPN `timeValid` |
| extras | `resumed?` | `patriotsScore`, `opponentScore`, `seasonType` | `cyclonesScore`, `opponentScore`, `seasonType`, `sport` |

---

## 8. Featured-game selection and the Get video window

### 8.1 `selectFeaturedGame` (`gameWindow.mjs:40-89`)

The run served the same game the phone featured. The comment block (40-47) described the rule. With `today` = official date in the module zone and `yesterday` = `today − 1`:

1. Drop complete games and games with an unparseable start; sort with `compareGames`.
2. Tier 1: a `Live` game that is not blocked. Today's official date won over an older one; otherwise the first live game. A suspended game that MLB reported as `Live` never counted (blocked).
3. Tier 2: games with `timeValid !== false` whose start is in `[now − graceMinutes, now + leadMinutes]`.
4. Tier 3: games not in tier 2 whose official date is today, or a `Preview` game with `delay` in its status whose official date is yesterday (a pre-game delay carried past midnight).
5. Return the first unblocked tier-2 game, else the first unblocked tier-3 game, else the first tier-2 game, else the first tier-3 game.

`compareGames` (26-38): start time, then game number. When two games shared an official date and either had `timeValid === false`, the game number decided, because a placeholder time could sort ahead of an earlier game.

Defaults: `leadMinutes` 15, `graceMinutes` 180 (`gameWindow.mjs:1-2`). Configs set grace to 180 for Guardians and 240 for Patriots and Cyclones.

### 8.2 Cyclones dispatch sport

`featuredGameForConfig` (`pipeline.mjs:228-241`) filtered Cyclones games to `game.sport === DISPATCH_SPORT` before tiering. The workflow passed `client_payload.sport || inputs.sport || 'football'`, so a run always had a sport.

### 8.3 `isWithinGetVideoWindow` (`pipeline.mjs:247-260`)

| Condition | Result |
|---|---|
| `abstractState === 'Final'` or `isBlockedGame` | false |
| `abstractState === 'Live'` | true |
| `timeValid === false` | false |
| otherwise | `now >= start − leadMinutes` |

There was no upper bound: a late, non-live `Preview` game stayed in the window. `--force` skipped this check. A failed check returned `too_early` with `Get video opens <lead> minutes before first pitch.` for every module, including football and basketball (`pipeline.mjs:491`).

---

## 9. Run sequence (`runGoozPipeline`, `pipeline.mjs:401-637`)

1. Load the config; resolve `dispatchSport` and `expectedModule`; run `configProblem`. Problem: `config_missing` (402-418).
2. Derive `moduleName`, `leadMinutes`, `timeoutSeconds` (`extract.timeoutSeconds ?? probeTimeoutSeconds ?? 90`), absolute `streamsPath` under `repoRoot` (`pipeline.mjs:41`), GitHub target, token, `validation = { requireSport: module === 'cyclones' }`, `now`, and `today` in the module zone (420-429).
3. Fetch the schedule (431).
4. Pick the featured game (432). None: `no_game` (433-440).
5. Push the schedule step: `Featured game <date> #<n> vs <opponent> (<status>).` (442-446).
6. MLB `isBlockedGame` for every module: `blocked` (448-456).
7. `Final`: `game_over` (458-466).
8. Read the current streams document (468). With a token, the contents API on the branch; a read error pushed a `read_remote` step (`Could not read <path> from GitHub (<error>); using the checkout copy.`) and fell back; a 404 or no token read the checkout copy. The comment at 272-273: "Readiness is judged against the branch, not the job's checkout, which a queued run took before an earlier run published."
9. Readiness: `findPlayableStreamForGame` (469). A resumed MLB game pushed `resumed_game` (470-475). A playable match without force or resume: `video_ready` (476-485).
10. Window check unless `--force`: `too_early` (487-495).
11. Needles for the game; empty: `config_missing` with `Pipeline config has no href needles for <sport or module>.` (497-507).
12. Push `extract_gooz`: `Extracting gooz URL from listing path <path only> using href "<needle + needle>".` (509-512).
13. `extractGoozFromBasePage(baseUrl, { game, hrefNeedles, opponentName, requireOpponent, timeoutSeconds })` (514-522). A throw: `extract_failed`, with the listing host redacted (523-535).
14. Copy extractor log lines into `extract_log` steps (536-538).
15. `ambiguous_link`: stop (540-548). Extractor `config_missing`: stop (549-557). Every other failure (`link_not_found`, `opponent_not_found`, `gooz_not_found`) fell through.
16. `foundUrl` = a valid provider URL upgraded to `https:`. None: push `gooz_not_found`, return `no_video` with a blank entry (559-578).
17. Build `nextEntry` (580-588):
    ```json
    { "gameDates": ["<officialDate>"], "gameNumbers": [<gameNumber>], "kind": "web", "url": "https://<GOOZ_HOST>/new-stream-embed/<id>?...", "allowInsecureHttp": false, "trustedHosts": [], "sport": "<only when game.sport>" }
    ```
18. Playable check with the module's schema: `invalid_entry` (590-599).
19. Same target already playable for this game: `unchanged` (601-612).
20. `--dry-run`: `dry_run` (614-623).
21. Publish (625-636, section 14).

### 9.1 Resumed MLB games and force

`replacesExistingEntry` (`pipeline.mjs:314-319`) returned true for `force`, `forceRefresh`, or `game.resumed`. A resumed game kept the suspended day's official date and game number, so the existing entry pointed at the first day's stream; the pipeline re-extracted and replaced it as a forced run would.

---

## 10. Outcome codes

| Outcome | `success` | Exit | Message | Source |
|---|---|---|---|---|
| `config_missing` | false | 1 | `configProblem` text, `Pipeline config has no href needles for <x>.`, or `No listing href needles are configured.` | `pipeline.mjs:410-418`, `499-507`, `549-557` |
| `no_game` | true | 0 | `No <Label> game is scheduled for today.` | 433-440 |
| `blocked` | true | 0 | `Game is <status>; pipeline skipped.` | 448-456 |
| `game_over` | true | 0 | `Game is final; pipeline skipped.` | 458-466 |
| `video_ready` | true | 0 | `Video entry is already loaded for this game.` | 476-485, 292-301 |
| `too_early` | true | 0 | `Get video opens <lead> minutes before first pitch.` | 487-495 |
| `extract_failed` | false | 1 | `Extraction failed: <message with listing host redacted>` | 523-535 |
| `ambiguous_link` | false | 1 | `More than one listing link matches this game; nothing was published.` | 540-548 |
| `no_video` | false | 1 | `No video found.` | 559-578 |
| `invalid_entry` | false | 1 | `Extracted entry would be rejected by the phone; nothing was published.` | 590-599 |
| `unchanged` | true | 0 | `Stream entry is already up to date; nothing to publish.` | 601-612, 303-311 |
| `dry_run` | true | 0 | `Dry run complete; <path> was not written.` | 614-623 |
| `local_only` | true | 0 | `Local file updated; GITHUB_TOKEN is not set.` | 338-359 |
| `published` | true | 0 | The commit message | 390-398 |

Thrown errors (exit 1, message on stderr): `Pipeline config file could not be read.`, `Pipeline config is not valid JSON.`, `MLB schedule request failed with <status>.`, `ESPN NFL schedule request failed.`, `ESPN NCAA schedule request failed.`, `GitHub read failed with <status>.`, `GitHub read returned no base64 content for the streams file.`, `Streams file is missing a streams array.`, `Streams file does not exist on the branch.`, `GitHub publish failed with <status>: <body>`, and a local `ENOENT` when neither the branch nor the checkout had the file.

Extractor failure codes (`extractGooz.mjs`): `config_missing` (1052-1057), `link_not_found` (485-487, 1109), `opponent_not_found` (498-500), `ambiguous_link` (506-511), `gooz_not_found` (1232).

---

## 11. Listing extraction (`P/lib/extractGooz.mjs`)

### 11.1 Constants

| Name | Value | Line |
|---|---|---|
| `GOOZ_HOST` | provider player host (value withheld) | 1 |
| `GOOZ_EMBED_PATH` | `/\/new-stream-embed\/([^/?#]+)/` | 2 |
| `GOOZ_URL_PATTERN` | `https?://` plus any subdomains of `GOOZ_HOST`, up to whitespace, quote, `<`, `>`, `)` | 3-4 |
| `EXTRACT_USER_AGENT` | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36` | 5-6 |
| `PLAYER_EMBED_WAIT_MS` | `20_000` | 7 |
| `GOOZ_IFRAME_WAIT_MS` | `8_000` | 8 |
| `POST_PLAY_WAIT_MS` | `5_000` | 9 |
| `LINK_NAVIGATION_WAIT_MS` | `15_000` | 10 |
| `LISTING_HOST_LABEL` | `[listing]` | 58 |
| Link poll deadline | `15_000` ms (default argument) | 550 |

### 11.2 Browser

- `launchExtractBrowser` (528-537): `chromium.launch({ args: ['--disable-blink-features=AutomationControlled'], headless })`. Headed by `extractRunsHeaded` (518-526) so Cloudflare-protected pages passed in Actions; the workflows ran it under `xvfb-run -a`.
- `newExtractContext` (539-546): `locale: 'en-US'`, `timezoneId: 'America/New_York'`, the desktop Chrome UA above, viewport 1280 by 720.
- One browser per call; closed in `finally` (1242-1244).

### 11.3 Listing page

1. `openPageWithGoozCapture` (925-937): new page, attach the network capture, `page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: timeoutSeconds * 1000 })`, then a 5 s settle. The HTTP status of the response was discarded, so a 4xx or 5xx listing page looked like a page with no matching links.
2. The post-redirect listing host was also added to the private hosts (1076).
3. `waitForListingLink` (548-562) polled every second for up to 15 s. It stopped early on a selected link or on `ambiguous_link`.

### 11.4 Link discovery (`findInnerLinkByHref`, 712-764)

Inside the page, every `a[href]` (skipping `#` and `javascript:`) was resolved to an absolute URL. A link qualified only when the lower-cased absolute URL contained every needle. Each qualifying link scored 10, plus 3 when the URL contained `/mlb/`, `/nfl/`, or `/stream/`. The result carried `href`, `hrefNeedleMatched: true`, `score`, and the anchor text, sorted by score.

### 11.5 Link selection (`selectListingLink`, 459-516)

The comment (459-464): "Chooses the one listing link for this game. Every needle must appear in the href. When more than one link matches and an opponent is known, the opponent narrows them (the longest matching variant wins); requireOpponent: true also demands the opponent on a lone match. More than one remaining link fails as ambiguous_link unless exactly one carries the highest listing-folder score, so a football link is never published for a basketball game or game 1 for game 2."

1. Needles were trimmed and lower-cased (`hrefNeedlesFromOptions`, 387-395). None: `config_missing`.
2. Links were deduplicated by `origin + pathname` without trailing slashes, lower-cased (`listingLinkKey`, 450-457).
3. No match: `link_not_found`.
4. Opponent narrowing ran when an opponent name was known and either `requireOpponent` was true or more than one link matched:
   - `opponentSlugVariants` (407-426): `slugifyName` of the opponent (NFKD, strip diacritics, lower-case, drop `& ' ’ .`, non-alphanumerics to `-`), then the full slug, every word suffix of at least 4 characters (`tigers`, `red-sox`), and every prefix of at least two words (`kansas-state`), longest first.
   - `opponentMatchLength` (428-448): decoded `pathname + search`, lower-cased, with each team needle replaced by a space first, so `iowa-state-cyclones` could not satisfy an opponent variant `iowa-state`. The first variant that matched on a non-alphanumeric boundary gave its length.
   - The longest match length won. Best length 0 with `requireOpponent`: `opponent_not_found`. Best length 0 without it: no narrowing.
5. More than one link left: keep the links with the top `score`. Exactly one: selected. Otherwise `ambiguous_link`.

Failure log lines (`linkFailureLines`, 997-1010): ambiguous printed `More than one listing link matches this game: <paths>. Add a distinguishing href needle for this sport.`; opponent missing printed `No matching listing link names <opponent>. Matching paths: <paths>.` Paths were listing paths only.

### 11.6 Game page and player

1. `openInnerPageFromLink` (667-693): armed the capture for the next main-frame document, started waiting for a URL change (`min(timeout, 15 s)`), clicked the matching anchor in the page; if there was no click or no URL change, `page.goto(link.href)` with the full timeout; then a 3 s settle. The same tab was reused.
2. `waitForPlayerEmbeds` (615-628), up to 20 s, polled for a provider URL on the network, a provider frame, any iframe, or more than one frame. Informational only (`embeds_ready` or `embeds_missing`, plus the Cloudflare title when the challenge was still showing).
3. `activateVideoPlayer` (766-849) with the embed wait skipped: scroll to half height and click the center (640, 360); then for each frame not ignored (provider frames first, then the main frame, then others) try these selectors with a forced click and a 4 s timeout: `.media-control-button.media-control-icon.paused`, `button[aria-label*="Play" i]`, `button[title*="Play" i]`, `.plyr__control--overlaid`, `.vjs-big-play-button`, `.play-button`, `[class*="big-play" i]`, `[class*="play-btn" i]`, `[class*="play_button" i]`, `.jw-icon-playback`, `video`; fall back to muting and calling `video.play()` on every `video`. Then wait up to 8 s for an iframe whose `src` contained `GOOZ_HOST`, then 5 s.
4. Ignored frames (`isIgnoredPlayerFrame`, 151-180): `/cdn-cgi/challenge-platform/` paths, `challenges.cloudflare.com`, YouTube and youtube-nocookie hosts, `recaptcha.net`.
5. `extractGoozWithRetries` (851-859): scan, and if nothing was found wait 3 s and scan once more.

### 11.7 Player host recognition

- `isGoozHost` (12-18) matched `GOOZ_HOST` or any subdomain on a label boundary, so a sibling host with the same suffix but no dot was rejected.
- `goozEmbedId` and `isValidGoozPlayerUrl` (20-42): the host passed `isGoozHost` and the path matched `/new-stream-embed/<segment>` with at least one digit in the segment.
- `extractGoozFromLoadedPage` (324-365) collected candidates in priority order: provider frame URLs, frame DOM and HTML matches, main DOM matches (`iframe[src]`, `iframe[data-src]`, `a[href]`, `[src]`, `[data-url]`, `[data-stream]`), main HTML regex matches, then network URLs of the current document.
- `scoreGoozUrl` (186-202): `-1` when invalid; `+10` for `/new-stream-embed/`, `+2` for an `ad` query parameter, `+1` for `https:`. `pickBestGoozUrl` (204-210) took the highest score; ties went to the earliest candidate.
- `httpsProviderUrl` (44-56) upgraded an `http:` provider URL to `https:` because entries were published with `allowInsecureHttp: false`.

### 11.8 Network capture scoping (`createGoozCapture`, 861-923)

Every provider URL seen in a request, response URL, or response body was tagged with the main-frame document it belonged to. `armForNavigation()` made the next main-frame commit start a new document, and `urls()` returned only the current document's URLs. A listing page's requests, including responses that finished after the game page committed, never counted as the game page's player.

### 11.9 Log redaction

- `privateHosts` held the `baseUrl` host, the post-redirect listing host, the selected link host, and the game page host (1028-1029, 1076, 1114, 1134).
- `redactHosts` (92-101) replaced each private host with `[listing]`. `describeUrlForLog` (111-127) printed only the path for a private host and `origin + path` without query for any other host.
- `urlPathForLog` (103-109) printed only the path of `baseUrl`.
- A throw inside the extractor was rethrown with every private host redacted (1237-1241). The pipeline redacted the `baseUrl` host again in `extract_failed` (`pipeline.mjs:524-531`).
- The provider player URL itself was logged (`Inner gooz URL is: <url>`, 1192-1196); only listing hosts were treated as private.

### 11.10 Every consumer of `extract.baseUrl`

| Location | Use |
|---|---|
| Workflow "Write pipeline config" step | Secret JSON to `P/config.json` |
| `pipeline.mjs:69-82` | `loadConfig` hid JSON errors |
| `pipeline.mjs:172-180` | Validated as http(s) |
| `pipeline.mjs:497` | `config.extract.baseUrl.trim()`, the single consumption point per run |
| `pipeline.mjs:511` | Logged as path only |
| `pipeline.mjs:516` | Passed to the extractor |
| `pipeline.mjs:524-531` | Host derived for redaction |
| `extractGooz.mjs:1029`, `1067-1075` | Added to private hosts; logged as path; `page.goto` |
| `extractGooz.mjs:1037`, `1220` | Echoed in the extractor result as `baseUrl` (never printed by the pipeline; printed by the local CLI and harness) |

### 11.11 Extractor log lines (in order)

`Running headed browser for Cloudflare-protected pages.`, `Opening listing path <path>`, `Base page loaded.`, `Searching page elements for href containing "<needles>" and opponent <name>...`, then either the failure branch (`No video found.`, link failure lines, `Listing page at <path> has <n> links.`, `Cloudflare challenge page title: "<title>".`, `Challenge frame present: <path>`, `Using game date <date> game <n> vs <opponent>.`) or the success branch (`Found link element: "<text>"`, `Link path is: <path>`, `Opening video page: <path>`, `Video page loaded.`, `Player embeds are present on the video page.` or `Player embeds did not appear on the video page.`, `Pressing play on the video player...`, `Play activated using: <method>` or `No play control was found; scanning anyway.`, `Scanning video page for gooz player URL...`, `Using game date ...`, then `Inner gooz URL is: <url>` and `Stream entry ready.`, or `No video found.` with `Player page frames: ...` and `Player page iframes: ...`).

### 11.12 Worst-case time per run

Listing `goto` up to `timeoutSeconds` (90 s), 5 s settle, up to 15 s link polling, up to 15 s click navigation then a fallback `goto` up to 90 s, 3 s settle, up to 20 s embed wait, play attempts (frames times 11 selectors times up to 4 s), up to 8 s iframe wait, 5 s, scan, 3 s, scan. Successful Actions runs at the snapshot took about 45-70 s end to end; the job timeout was 15 minutes; the phone polled for 5 minutes.

---

## 12. Playable check (`P/lib/playableStream.mjs`)

The header comment (3-5): "Mirrors playableGuardiansStream / playableCyclonesStream in app/guardians/guardiansSources.ts and app/cyclones/cyclonesSources.ts. An entry that fails here is discarded by the phone, so the pipeline must not report it as ready or publish it."

| Rule | Value |
|---|---|
| Allowed keys, Guardians and Patriots | `allowInsecureHttp`, `gameDates`, `gameNumbers`, `kind`, `trustedHosts`, `url`. Any other key, including `sport`, rejected |
| Allowed keys, Cyclones (`requireSport: true`) | The six plus `sport`, which had to be in `CYCLONES_SPORTS` = `football`, `mens-basketball`, `womens-basketball` |
| `allowInsecureHttp` | boolean |
| `gameDates` | 1 to `MAX_GAME_DATES = 200` unique valid `YYYY-MM-DD` dates that round-trip through `Date` |
| `gameNumbers` | at least one unique integer from 1 to 9 |
| `kind` | `direct`, `web`, or `youtube` |
| `trustedHosts` | strings; only `web` could have any; at most `MAX_TRUSTED_HOSTS = 10`; every host and the URL host matched `^[a-z0-9.-]+$` |
| `url` | string up to `MAX_URL_LENGTH = 2048` |
| `youtube` | `https:` only; `youtu.be/<id>`, `youtube.com/watch?v=<id>`, `/live/<id>`, `/embed/<id>` on `youtube.com`, `m.youtube.com`, `youtube-nocookie.com` (leading `www.` stripped); id `^[A-Za-z0-9_-]{11}$` |
| `direct`, `web` protocol | `https:`, or `http:` only with `allowInsecureHttp: true` |
| `web` on `GOOZ_HOST` | Had to pass `isValidGoozPlayerUrl`. A `web` URL on any other host passed this part |
| Phone scope | The phone read only the last `MAX_REMOTE_STREAMS = 200` object entries of `streams` (`entriesInPhoneScope`, 30-34) |

---

## 13. Streams document handling (`P/lib/streamsDocument.mjs`)

- `parseStreamsDocument` (67-73) required an object with a `streams` array, else `Streams file is missing a streams array.`
- `serializeStreamsDocument` (79-81): `JSON.stringify(document, null, 2)` plus a trailing newline. Keys kept their insertion order, so pipeline-written Cyclones entries had `sport` last.
- `streamFromUnknown` (23-65): structural parse; allowed the six keys plus an optional `sport` in `CYCLONES_SPORTS`.
- `streamMatchesGame` (83-94): `gameDates` includes `officialDate` and `gameNumbers` includes `gameNumber`; with `game.sport` the entry's `sport` had to equal it; without it the entry had to have no `sport`.
- `isProviderEntry` (96-102): `kind: 'web'` on `GOOZ_HOST`. Only these entries were "owned" by the pipeline.
- `upsertStream` (119-158): for each entry that matched the game and was either provider-owned or unplayable, `withoutGameKey` (104-117) removed only this date and game number and kept the remaining date pieces and the remaining game-number piece; the new entry went where the first such entry stood, or at the end. Other playable sources for the game (direct, YouTube, non-provider web) stayed. If the new entry fell outside the phone's last-200 window it moved to the end (147-152).
- `pruneStaleStreams` (167-185): dropped object entries whose every date was a valid date more than `STALE_ENTRY_DAYS = 7` days before `today` (module zone). Strings, non-objects, entries without dates, and the inactive example (its `YYYY-MM-DD` placeholder does not parse) were kept. `HOW_TO_GUIDE` was never touched. Pruning ran only on a write.
- `playableStreamsForGame`, `findPlayableStreamForGame` (187-204): playable matches within the phone's window.
- `findEquivalentStream` (216-230): same `kind`, `url`, `allowInsecureHttp`, `trustedHosts` (joined), and `sport`.
- `planStreamUpdate` (232-250): without force, any playable match returned `video_ready`; an equivalent entry returned `unchanged`; otherwise `upsertStream(pruneStaleStreams(document, today), entry, game)` with `outcome: 'update'`. Pruning ran before the upsert so a resumed game's old date was never aged out by its own write.
- `writeStreamsDocument` (252-256): `writeFile` without creating directories.
- `buildStreamEntry` (258-268) was exported but unused.

---

## 14. GitHub publish (`P/lib/publishGithub.mjs`)

| Item | Value | Line |
|---|---|---|
| API base | `https://api.github.com` | 7 |
| Timeout per request | `GITHUB_TIMEOUT_MS = 20_000` | 8 |
| Retries on conflict | `PUBLISH_MAX_RETRIES = 3` | 9 |
| Backoff base | `PUBLISH_BACKOFF_MS = 1_000` | 10 |
| Path encoding | each segment `encodeURIComponent`, joined with `/` | 12-17 |
| Headers | `Accept: application/vnd.github+json`, `Authorization: Bearer <token>`, `X-GitHub-Api-Version: 2022-11-28` | 23-29 |

Read (`readRemoteStreamsDocument`, 31-62): `GET /repos/<owner>/<repo>/contents/<path>?ref=<branch>`. `404` returned `undefined`. Other non-OK threw `GitHub read failed with <status>.` The body had to be `encoding: 'base64'` with string `content`, else `GitHub read returned no base64 content for the streams file.` It returned the parsed document and the blob `sha`.

Write (`publishStreamsUpdate`, 64-135), a read-modify-write loop:

1. Read the remote copy and SHA. Base = remote document, else `fallbackDocument` (the copy read in step 8 of the run). Neither: throw `Streams file does not exist on the branch.`
2. `update(base)` = `planStreamUpdate` with the run's entry. No `document` in the result (video_ready or unchanged): return unpublished.
3. `PUT /repos/<owner>/<repo>/contents/<path>` with JSON `{ branch, content: <base64 of the serialized document>, message, sha }` (the `sha` only when a remote copy existed).
4. OK: return `{ attempts, change, commit, document, published: true }`.
5. `409` or `422` with `attempt < 3`: sleep `1000 * 2^attempt + random(0..249)` ms (1 s, 2 s, 4 s plus jitter) and run the whole cycle again. Because the plan was recomputed on the newer copy, an entry published by a concurrent run was respected and could turn the retry into `video_ready`.
6. Anything else: throw `GitHub publish failed with <status>: <response body>`.

After a publish the run also wrote the new document to the checkout path, pushed `write_local` (`Updated <path>.`) and `publish_github` (`Published to Danner36/Danner_App@main[ after <n> attempts].`) (`pipeline.mjs:376-388`).

Without `GITHUB_TOKEN` the plan was applied to the checkout copy and written locally: `local_only` (`pipeline.mjs:338-359`).

A brand-new streams file could not be created: a missing remote file with no checkout copy threw `ENOENT` at `pipeline.mjs:289` or `Streams file does not exist on the branch.` at `publishGithub.mjs:91-93`.

---

## 15. Commit messages

Format (`pipeline.mjs:361-363`): `` `${prefix} ${game.officialDate} game ${game.gameNumber}` ``.

| Module | Prefix | Example from history |
|---|---|---|
| Guardians | `guardians: update stream for` (also the code default) | `guardians: update stream for 2026-10-18 game 1` (`f33a679`) |
| Patriots | `patriots: update stream for` | `patriots: update stream for 2026-10-18 game 1` (`43027c4`) |
| Cyclones | `cyclones: update stream for` | `cyclones: update stream for 2026-10-31 game 1` (`823d2be`, the snapshot commit itself) |

The commits were authored by `github-actions[bot]` through the workflow's `github.token`. Releases were tag-triggered only, so these commits on `main` did not start builds.

---

## 16. Local helpers

### 16.1 `P/extract-gooz.mjs`

| Mode | Command | Behavior |
|---|---|---|
| Base (default) | `node extract-gooz.mjs <base-url>` or `--base <base-url>` | `extractGoozFromBasePage` with `--href` (default `cleveland-guardians`), optional `--opponent`, `--timeout` (default 90) |
| Direct | `node extract-gooz.mjs --page <inner-page-url>` | `extractGoozFromPage`: open one page, press play, scan |

It printed the formatted log, then the full result JSON (which included `baseUrl`), and exited 1 when nothing was found (`extract-gooz.mjs:75-98`).

### 16.2 `P/control-server.mjs`

A local HTTP harness titled `Guardians Extract Harness`, listening on `127.0.0.1:<GUARDIANS_PIPELINE_PORT>` (default `8109`) (`control-server.mjs:13`, `448-452`).

| Route | Behavior |
|---|---|
| any | `403 {"error":"Requests must come from the local harness page."}` unless `Host` was `127.0.0.1:<port>` or `localhost:<port>` and `Origin` was absent or the same local origin (DNS-rebinding and cross-site guard, 19-31) |
| `GET /` | The HTML page: base URL input, href search (default `cleveland-guardians`), optional opponent, status log, stream object, test playback (340-347) |
| `POST /api/extract-gooz` | `{ baseUrl, hrefNeedle, opponentName? }`; `409` while busy; `400` when a field was missing; ran the extractor with 90 s and returned the result plus `displayStreamEntry` and `formattedLog` (349-385) |
| `POST /api/preview-gooz` | `{ url }`; `409` while busy; `400` unless a valid provider embed URL; opened a headed Chromium player window with play pressed (387-420) |
| `GET /play?url=` | `302` to a valid provider embed URL, else `400` (422-436) |
| `GET /health` | `ok` (438-442) |
| other | `404 Not found` |

SIGINT and SIGTERM closed the preview browser and the server.

### 16.3 npm scripts (`P/package.json:5-12`)

| Script | Command |
|---|---|
| `start` | `node run.mjs` |
| `control` | `node control-server.mjs` |
| `extract-gooz` | `node extract-gooz.mjs` |
| `dry-run` | `node run.mjs --dry-run` |
| `help` | `node run.mjs --help` |
| `test` | `node --test extractGooz.test.mjs pipelineWindow.test.mjs pipelineConfig.test.mjs publishGithub.test.mjs streamsDocument.test.mjs` |

---

## 17. Tests

Run from `P/`: `npm test` (or the `node --test` line above). The suites needed no browser, no network, and no `node_modules`; Playwright was imported lazily. At the snapshot commit, `node --test` on Node 22 passed **65 of 65** (re-run 2026-11-01 against `823d2be`; `Docs/Production/Validation.md:11` also recorded 65 of 65). No workflow ran these tests; the stream workflows ran only `--check-config` and the pipeline itself.

| File | Tests | Coverage |
|---|---|---|
| `extractGooz.test.mjs` | 20 | Ignored Cloudflare and YouTube frames; `video.play()` only with a video; desktop UA; `EXTRACT_HEADED` and `GITHUB_ACTIONS`; Cloudflare title; opponent slug variants; link selection for same-day Cyclones sports, team needle versus opponent, lone match with and without `requireOpponent`, opponent narrowing, doubleheader `ambiguous_link`, duplicate anchors, failure codes; https upgrade; log lines without the listing host; capture discards listing-page URLs after the game page commits; source-text guards: no `mlbSchedule` or `getFeaturedGuardiansGame` in the extractor (64-69), uses `openInnerPageFromLink` and `waitForPlayerEmbeds` (112-117), no `'cleveland-guardians'` literal and `config_missing` on empty needles (236-242) |
| `pipelineConfig.test.mjs` | 7 | Value-free config problems; valid module configs; needles never fall back to another team; generic unreadable-config error; readiness judged on the branch copy with a fake `fetch`; wrong module stops before fetching; an evening game on a UTC runner reports `too_early` |
| `pipelineWindow.test.mjs` | 20 | Window with `startTimeTBD`, 15-minute lead, missing `timeValid`; UTC-midnight edge cases; delays past midnight; live over windowed; suspended-as-Live; today's live wins; carried-over delay; resumed game; TBA ordering; New York DST; Cyclones Chicago dates around DST; Cyclones TBA New York date; dispatch-sport scoping; Patriots Thursday night date; grace bound |
| `publishGithub.test.mjs` | 5 | SHA on PUT; 409 re-read and re-apply; ready entry on retry stops; gives up after three retries; no retry on 500 |
| `streamsDocument.test.mjs` | 13 | 7-day prune keeps the guide; the three committed root files keep `HOW_TO_GUIDE`, the marker, and only the inactive example when pruned at 2030-01-01 (61-78); multi-date and doubleheader splitting; keep other sources and replace broken ones; readiness on any playable match; validator parity; plan outcomes; 200-entry window; Cyclones sport isolation; resumed and ordinary MLB official dates |

Gaps at the snapshot: no test of the post-extraction paths of `runGoozPipeline` (`no_video`, `ambiguous_link`, `extract_failed` redaction, `invalid_entry`, `unchanged`, `dry_run`, `published`, `local_only`); no NFL parser test; no nine-request NCAA fetch test; no `control-server` test.

---

## 18. Fixed-design facts that shaped behavior

- One package served three hard-coded modules; adding a team meant editing `MODULES`, `moduleForConfig`, `configProblem`, `fetchConfiguredGames`, `scheduleStepName`, the Worker, a workflow, a secret, and a root file.
- The extractor accepted only `GOOZ_HOST` embeds (`extractGooz.mjs:1-4`, `842`; `streamsDocument.mjs:96-102`). A listing site that embedded another player could only ever produce `no_video`.
- One listing URL per config; no backup site.
- The listing score bonus knew only `/mlb/`, `/nfl/`, and `/stream/` (`extractGooz.mjs:745-751`).
- MLB's `isBlockedGame` gated all three modules (`pipeline.mjs:248`, `448`).
- Cyclones fetched nine ESPN endpoints on every run regardless of the dispatched sport.
- A missing streams file was fatal; the pipeline never created one.
- `too_early` said "first pitch" for every sport.
