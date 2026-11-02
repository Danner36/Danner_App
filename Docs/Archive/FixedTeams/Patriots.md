Status: ARCHIVED
Snapshot: 823d2be (2026-10-31)

# New England Patriots module (fixed-team design)

The Patriots screen was a sibling of the Guardians screen, built by copying it and swapping the data layer: ESPN's public NFL site JSON for team 17 instead of MLB statsapi, a computed regular-season record instead of standings, a football scoreboard instead of the park board, and `patriots_streams.json` with Worker `module: "patriots"`. Playback reused the Guardians components by import. `AI_Framework/AI_RULES.md:53` stated it was "a sibling of Guardians, not a parameterized sports engine." This record pins every rule to commit `823d2be562d252c9f3b0da305275adc6d8498f55` (2026-10-31).

Permalink base: `https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/<path>#L<a>-L<b>`.

Shared behavior that this record does not repeat in full (isolated WebView rules, Listen, Cast, TV send, the live relay) is in [Guardians.md](Guardians.md) sections 13.1–13.7. Shell, tile, env vars, and identity are in [Hub.md](Hub.md).

---

## 1. File inventory

| File | Lines | Role |
|---|---|---|
| `app/patriots/PatriotsScreen.tsx` | 1976 | ESPN snapshot fetch, sources chain, copies of the player stack, featured card, screen, styles |
| `app/patriots/patriotsSnapshot.ts` | 481 | `PatriotsGame` model, ESPN event parse, record, featured pick, live-summary merge |
| `app/patriots/espnNfl.ts` | 64 | Schedule fetch across season types 1, 2, 3 |
| `app/patriots/espnScoreboard.ts` | 286 | Summary fetch and football board parse |
| `app/patriots/PatriotsScoreboard.tsx` | 219 | Football LED board |
| `app/patriots/espnWinChance.ts` | 165 | `useWinChance` with the ESPN event id used directly |
| `app/patriots/WinChanceBar.tsx` | 97 | Copy of the Guardians bar (`teamName="Patriots"`) |
| `app/patriots/patriotsGetVideo.ts` | 113 | Worker POST with `module: 'patriots'` and poll |
| `app/patriots/patriotsSources.ts` | 6 | Pure re-export of `../guardians/guardiansSources` (renamed exports) |
| `app/patriots/README.md` | 17 | Tier README |

Imported from `app/guardians/` (`app/patriots/PatriotsScreen.tsx:21-39`): `GuardiansAudioPlayer`, `GuardiansCastButton` with `castContentTypeForUrl` and `castStreamTypeForUrl`, `GuardiansTvRouteButton` with `DiscoveredMedia`, `WEB_AIRPLAY_INJECTION`, `newDiscoveryNonce`, `pagePlaybackHoldScript`, `parseDiscoveredMediaMessage`, `preferDiscoveredMedia`, `webMediaDiscoveryInjection`, `webPlayerUserAgent`; plus `stopHlsProxy` from `app/modules/danner-live-hls/src`.

Copied in-file (not imported), with Patriots names: `withHarnessScoreboard` (`:114-128`), `snapshotWithPreservedScoreboard` (`:133-174`), the sources helpers (`:237-362`), `gameDateLabel` (`:364-374`), `isAllowedPlayerNavigation` (`:376`), `DirectStreamPlayer` (`:398`), `youtubePlayerHtml` (`:420`, iframe `title="Patriots video"` at `:438`), `IsolatedWebStreamPlayer` (`:444`), `StreamPlayer` (`:594`, header `Patriots game` at `:644`), `countdownLabel` (`:699-718`), `gameBlocksVideo` (`:720-728`), `interruptionMessage` (`:730-741`), `FeaturedGameCard` (`:743-1023`), `PatriotsScreen` (`:1024-1567`), styles (`:1569-1976`). The `StyleSheet` was byte-identical to the Guardians one, so the accent stayed Guardians red `#E31937` and navy `#0B2B4C`.

---

## 2. Entry and lifecycle

- Hub tile row 1 right, `accessibilityLabel="New England Patriots"` (`app/hub/HubScreen.tsx:293-308`) → `setAppScreen('patriots')` → `<PatriotsScreen onBack={openMenu} />` (`app/App.tsx:36,41-42`).
- Hero: `accessibilityLabel="New England Patriots"`, bundled `new-england-patriots-logo.jpg` (Flying Elvis on `#091932`), title `Patriots`, record text from `recordLabel` with `accessibilityLabel="Season record <W–L[–T]>"` (`app/patriots/PatriotsScreen.tsx:1437-1455`).
- Error text `Patriots information is temporarily unavailable.` (`:1105-1109`); harness errors `The Patriots test harness is unavailable.` and `The Patriots test fixture is invalid.` (`:183,205`).
- Android Back: Play modal first, then the hub (`:1332-1350`).
- Unmount aborted Get video (`:1330`) and stopped Listen.

---

## 3. ESPN NFL data

### 3.1 Endpoints

| Purpose | Request | Timeout | Source |
|---|---|---|---|
| Schedule | `GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/17/schedule?season=<nflSeasonYear>&seasontype=<1\|2\|3>`, header `Accept: application/json`, three requests in parallel | 10 s shared (`SCHEDULE_TIMEOUT_MS`) | `app/patriots/espnNfl.ts:3-5,13-37` |
| Live summary | `GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=<gamePk>` | 6 s (`SUMMARY_TIMEOUT_MS`) | `app/patriots/espnScoreboard.ts:26,263-286` |
| Win chance (pre-game) | `GET https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/<id>/competitions/<id>/predictor` | 6 s | `app/patriots/espnWinChance.ts:11-12,87-95` |
| Win chance (live) | `.../probabilities?limit=1`, then `&page=<pageCount>` | 6 s | `app/patriots/espnWinChance.ts:97-119` |

### 3.2 Ids, season year, and season types

- `PATRIOTS_TEAM_ID = 17` (`app/patriots/patriotsSnapshot.ts:6`); the pipeline mirrored it (`scripts/guardians-stream-pipeline/lib/nflSchedule.mjs:1`).
- The ESPN event id was the game id: `gamePk = Number(event.id)` (`patriotsSnapshot.ts:342`). It fed the summary and win-chance URLs directly; no event mapping was needed (contrast Guardians' scoreboard lookup).
- `nflSeasonYear(now)`: January and February used the previous year, otherwise the current year (`now.getMonth() <= 1`, `patriotsSnapshot.ts:57-59`).
- Season types `[1, 2, 3]` = preseason, regular season, playoffs (`espnNfl.ts:3`). Each event was tagged with the schedule list it came from, not its own `seasonType` field (`espnNfl.ts:7-11,59`; `patriotsSnapshot.ts:326-327`).
- Failure policy (`espnNfl.ts:39-45`): a failed preseason or playoff list was tolerated; a failed regular-season list (`REGULAR_SEASON_TYPE = 2`) failed the whole refresh, because it carried the record. Duplicate events across lists were collapsed by `String(id)` (`:47-63`).

### 3.3 Game model (`app/patriots/patriotsSnapshot.ts`)

`PatriotsGame` (`:8-24`) differed from `GuardiansGame` by `patriotsScore` (instead of `guardiansScore`), `scoreboard?: LiveFootballScoreboard`, `scoresKnown: boolean`, and `seasonType: number`. `PatriotsSnapshot` (`:26-32`) added `ties`.

`patriotsGameFromEspnEvent(event, seasonType)` (`:328-426`):

| Field | Rule |
|---|---|
| Validity | positive integer `id`, parseable `date`, a first competition, and two sides whose `team.id` (or side `id`) is an integer and whose `team.displayName` is a string; one side must be team 17 |
| `abstractState` | `abstractStateFromEspn(status.type.state, status.type.completed)`: `completed === true` or `post` → `Final`; `in` → `Live`; else `Preview` (`:225-236`) |
| `gameNumber` | always `1` |
| `isHome` | Patriots side `homeAway === 'home'` |
| `officialDate` | `easternDateString(new Date(event.date))`, the America/New_York calendar date of kickoff (`:44-55,417`) |
| `opponentName` | opponent `team.displayName` |
| Scores | `finiteScore` read numbers, numeric strings, or ESPN `{ value, displayValue }` objects (`:208-223`); missing → 0 on screen |
| `scoresKnown` | both scores parsed (`:421`) |
| `status` | `espnContestStatus` (`:288-324`): an interruption found in `name description detail shortDetail` returned ESPN's description (or `Canceled`/`Delayed`/`Postponed`/`Suspended`); `pre`, `STATUS_SCHEDULED`, or `Scheduled` returned `Scheduled` (ESPN put the kickoff clock in `detail`); else `detail`, `shortDetail`, or `description` |
| `timeValid` | `event.timeValid !== false && competition.timeValid !== false` (`:407`) |

`gameInterruption`, `isCompletedGame`, and `recapResult` were copies of the Guardians rules (`:65-94`). Video blocking lived in the screen (`gameBlocksVideo`, `PatriotsScreen.tsx:720-728`) with the same rule.

### 3.4 Record

- `regularSeasonRecord(games)` (`patriotsSnapshot.ts:96-121`) counted only games with `seasonType === 2`, completed, and `scoresKnown`. A Final whose scores did not parse stayed out of the record instead of counting as a tie.
- `recordLabel(w, l, t)` = `W–L` when `t === 0`, else `W–L–T` (`:61-63`). The hero showed `0–0` until a regular-season game was Final.
- No standings endpoint was used.

---

## 4. Official date and "today"

- Stream matching used the America/New_York date of kickoff, so phones and the GitHub Action (which ran with `TZ: America/New_York`, `.github/workflows/patriots-stream-pipeline.yml:36`, and the pipeline `MODULES.patriots.timeZone = 'America/New_York'`, `scripts/guardians-stream-pipeline/lib/pipeline.mjs:55-60`) agreed.
- The app's "today" stayed phone-local (`localDateString(now)`, `patriotsSnapshot.ts:37-42,174`).
- A game without a kickoff time was an all-day game on its Eastern official date; ESPN's placeholder could fall on the previous local day west of Eastern (`:131-137`).
- Labels: `gameDayLabel` (`:139-154`) formatted a known time in the phone's zone and a TBA game as the official date at `T12:00:00Z` in `timeZone: 'UTC'`. The schedule row read `<weekday, month day> <h:mm>` or `<weekday, month day> · Time TBA` (`PatriotsScreen.tsx:364-374`). The remaining schedule showed each game's phone-local date and time once (`release/RELEASE_NOTES.md`).

---

## 5. Featured game and schedule (`snapshotFromGames`, `patriotsSnapshot.ts:162-206`)

Simpler than Guardians:

1. Remaining: not completed, and Live or starting today or later (known time ≥ local midnight; TBA by official date).
2. Sort: start time, then game number (`compareGames`, `:156-160`). No doubleheader rule.
3. Recap: last completed game whose `officialDate` equals the phone-local today.
4. Featured: first Live remaining game, else first remaining game on the local day, else the recap. No carried-over delay rule and no suspended-but-Live demotion.
5. Upcoming: remaining games with a different `gamePk` from the featured game.
6. Schedule rows (`PatriotsScreen.tsx:1512-1547`): `Upcoming games`; date label; status unless `Scheduled`; `vs`/`at` plus `displayName`; `NextGameWinChance` under the first row when nothing was featured; `No upcoming games are scheduled.` when empty. Bye weeks produced no row (`Docs/Domain/Patriots.md:18`).

Featured identity key in the screen: `` `${gamePk}:${officialDate}:${gameNumber}` `` (`PatriotsScreen.tsx:1313-1316`). A change aborted Get video and stopped Listen (`:1317-1322`).

---

## 6. Featured card differences from Guardians

The card (`PatriotsScreen.tsx:743-1023`) used the same badge, interruption box, win-chance bar, score box, countdown, `Time TBA`, Play/Listen, and Get video layout described in [Guardians.md](Guardians.md) section 6, with these differences:

| Item | Patriots | Guardians |
|---|---|---|
| Video window | `!blocks && timeValid && (Live \|\| now ≥ start − 15 min)`: a Live game with an invalid kickoff time never opened video (`:776-780`) | Live opened video even without a valid time |
| Matchup when Live or interrupted | `Patriots vs <opponent>` / `Patriots at <opponent>` (`:804`) | `Guardians …` |
| Live board | `PatriotsScoreboard` (football) | park board |
| Score box first row | `Patriots` (`:864`) | `Guardians` |
| Status line while Live | `game.status`, which the summary poll set to the board's `detail` | board inning text |
| Get video hint | `Finds the approved Patriots video for this game` (`:984`) | Guardians |
| Win-chance `teamName` | `Patriots` (`:851`) | `Guardians` |
| Recap status | ESPN `detail` (for example `Final`, `Final/OT`) | MLB `Final`, `Final/10` |

Countdown tick (`:1146-1183`): 1 s before kickoff, 30 s when delayed, none when Live, Final, or another interruption. Unlike Guardians, the tick did not stop for an invalid time; the countdown text itself was gated by `timeValid`.

---

## 7. Football scoreboard and live refresh

### 7.1 Board (`app/patriots/PatriotsScoreboard.tsx`)

- Columns: quarters `1`–`4`, then `OT`, `2OT`, … up to `MAX_QUARTERS = 10` columns (`:5,49-60`), then `T` (total).
- Labels: `PATRIOTS` for the Patriots side, the opponent's last name word in capitals (`:7-13`). Patriots label red `#E31937` (`:190`); digits amber `#FFCF4A` (`:201`); text `#F4F7FA`.
- Possession: `▸ ` before the side with the ball. `possessionTeamId` compared with 17 decided which row (`:63-68,103,120`).
- Situation bar: `Q<n> <clock>` (or `OT`, `<n>OT`, `periodLabel`, `:15-23`) and, when present, `<down and distance> · <possession text>` (`:132-139`).
- LED cells showed up to 3 characters.
- `accessibilityLabel`: away points, home points, status, clock line, situation (`:72-80`).

### 7.2 Parse (`app/patriots/espnScoreboard.ts`)

- Competition from `header.competitions[0]` (summary document) or `competitions[0]` (schedule event) (`:95-104`).
- Sides by `homeAway`, `points` from `score`, per-quarter values from `linescores[].value ?? displayValue` (`:45-70,123-149`).
- `situation` from the document top level, falling back to the competition (`:151-157`); `down`, `distance`, `possession` (team id, only when > 0); text from `downDistanceText` or `shortDownDistanceText` plus `possessionText` (`:72-93,158-190`).
- `clock` = `status.displayClock`; `period` = `status.period`; `status` = `type.detail`, `type.shortDetail`, or `Live` (`:166-176`).
- `liveSummaryFromEspn` (`:241-261`): `{ completed, scoreboard, state: 'pre'|'in'|'post'|undefined }`.

### 7.3 Poll and merge (`app/patriots/PatriotsScreen.tsx`)

- Poll ran while the featured game was Live, or after its valid kickoff time while still pre-game and not blocked (`pollsLiveSummary`, `:1185-1200`). Interval 5,000 ms (`:84`), immediate run, run on foreground; a tick was skipped while in flight or backgrounded; requests applied in order (`latestRequest`/`appliedRequest`, `:1225-1297`). Skipped in harness mode (`:1229-1231`).
- `gameWithLiveSummary` (`patriotsSnapshot.ts:245-282`) only moved state forward (rank `Preview` 0 < `Live` 1 < `Final` 2, `:238-243`). A post-game summary without a board left Final to the schedule refresh (ESPN also reported postponed and canceled games as post). A live summary without a board still turned the card Live. A board set scores, `scoresKnown: true`, and `status = board.status`.
- A summary reporting Final triggered one schedule refresh per game (`finalRefreshGamePkRef`, `:1270-1276`).
- Kickoff refresh (`:1202-1223`): when the countdown reached a valid kickoff and the last snapshot predated it, `refreshSnapshotNow()` reset `lastSnapshotAtRef` to 0 and ran `load()` once per game (`kickoffRefreshGamePkRef`).
- Snapshot merge (`snapshotWithPreservedScoreboard`, `:133-174`): for the same `gamePk`, a snapshot with a lower state rank never replaced the polled state, and a polled Live board stayed while the last poll was under `LIVE_BOARD_FRESH_MS = 30_000` old (`:86`, `:1079-1080`); otherwise the snapshot's board, falling back to the previous board.

### 7.4 Cadences

| What | Cadence | Source |
|---|---|---|
| `load()` tick (streams always; schedule when older than 10 min) | 60,000 ms while active | `PatriotsScreen.tsx:79,83,1128-1144`; staleness `:1060-1064` |
| Schedule | 10 min, pull-to-refresh, kickoff, Final | `:83` |
| Live summary | 5 s | `:84` |
| Countdown | 1 s; 30 s delayed | `:87-89` |
| Win chance | 10 min pre-game, 30 s live | `app/patriots/espnWinChance.ts` (same constants as Guardians) |
| Get video poll | 5 s for up to 5 min | `app/patriots/patriotsGetVideo.ts:9-10` |

`load(showRefresh, sourceOptions)` (`:1050-1118`) had no `forceSnapshot` parameter; the pull-to-refresh spinner cleared only for the load that started it (`:1110-1114`), unlike Guardians, which always cleared it.

---

## 8. Win chance

`app/patriots/espnWinChance.ts` was the Guardians hook without `findEspnEventId`: the event id was the `gamePk` (`:87-119`), so no scoreboard lookup and no tolerance window. Same predictor and probability parsing, same 6 s timeout, same 10 min / 30 s refresh, same `wanted` rule (Preview or Live, not postponed or canceled) (`:123-165`). ESPN's two football percentages could total slightly under 100 because a tie was possible; the bar split by their ratio (`Docs/Domain/Patriots.md:16`). Bar text `Win chance: Patriots N percent, <opponent> M percent`.

---

## 9. Streams document and fetch chain

### 9.1 File

- Root `patriots_streams.json` on `main`; same `HOW_TO_GUIDE` keys and the same six-field entry schema and validation as Guardians, because `app/patriots/patriotsSources.ts:1-6` re-exported `guardiansStreamsFromDocument` (as `patriotsStreamsFromDocument`), `authorizedStreamsForGame`, and the types. The `GOOZ_HOST` provider-path rule therefore applied identically.
- Contents at the snapshot: 3 items: the `INACTIVE EXAMPLE` string, the inactive `direct` example, and one `web` entry for 2026-10-18 game 1 (URL not reproduced).
- Matching: `gameDates` includes the Eastern official date and `gameNumbers` includes `1`.

### 9.2 Chain (`fetchPatriotsSources`, `PatriotsScreen.tsx:309-362`)

| Constant | Value | Source |
|---|---|---|
| `REMOTE_PATRIOTS_SOURCES_URL` | `https://raw.githubusercontent.com/Danner36/Danner_App/main/patriots_streams.json` | `:92-93` |
| `SOURCES_STORAGE_KEY` | `danner.patriots.sources.v1` | `:94` |
| `SOURCES_FETCH_TIMEOUT_MS` | 8,000 per attempt | `:91` |
| Dev overrides | `EXPO_PUBLIC_PATRIOTS_TEST_URL`, `EXPO_PUBLIC_PATRIOTS_SOURCES_URL` (only in `__DEV__`) | `:95-100` |

Order: Worker `GET {GET_VIDEO_URL}/streams?module=patriots` (`app/patriots/patriotsGetVideo.ts:17-22`) → for `preferLive` production loads, the latest commit SHA for `patriots_streams.json` (`commits?path=patriots_streams.json&per_page=1`, `:242-260`) then raw by SHA (`:340-349`) → raw `main` → cached `danner.patriots.sources.v1`. Cache-bust, no-cache headers, per-attempt timeouts, raw-text caching, and the sticky "no-match never wipes a known URL" rule (`:1089-1104`) matched Guardians.

Difference: the one-lookup-per-session SHA was a shared promise in `SourcesSession.latestCommitSha` (`:104-112`, `:295-307`) instead of Guardians' `CommitShaLookup { done, sha }`.

---

## 10. Get video

`app/patriots/patriotsGetVideo.ts`, diffed against Guardians:

| Item | Patriots | Guardians |
|---|---|---|
| Streams URL | `{base}/streams?module=patriots` (`:21`) | `{base}/streams` |
| POST body | `{ module: 'patriots', pin }` (`:49`) | `{ pin }` |
| Caller abort | `requestGetVideo(signal?)` linked the caller's signal to the 20 s request controller (`:29-55`) | no caller signal |
| 429 comment | "The Worker rate-limits presses per address. A recent press already started the pipeline…" (`:60-61`) | "a run for this module is already in progress" |

Screen (`handleGetVideo`, `PatriotsScreen.tsx:1352-1401`): `sourceOptions = { allowStaleCache: false, preferLive: true, session: {} }`, then `requestGetVideo(signal)`, `pollForStream`, append on a match, `load(true, sourceOptions)`, and `idle` or `failed`. Same card strings as Guardians except the hint.

Server side: the Worker accepted `module: 'patriots'` (`workers/guardians-get-video/src/index.js:147-155`) and dispatched `event_type: 'patriots-get-video'` with `client_payload: { module: 'patriots', source: 'phone' }` (`:12-16`, `:217-245`). `.github/workflows/patriots-stream-pipeline.yml` listened for `types: [patriots-get-video]` (`:17`), ran with `TZ: America/New_York` (`:36`), read repo secret `PATRIOTS_STREAM_PIPELINE_CONFIG` (`:51`), and set `PIPELINE_MODULE: patriots` (`:64,97`). The pipeline config selected NFL with `sport: 'nfl'` and default team 17. The same Worker secrets (`FAMILY_PIN`, `GITHUB_TOKEN`) and app build values (`EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL`, `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN`) served all three teams (`AI_Framework/AI_RULES.md:53`).

---

## 11. Playback

Same components and rules as Guardians (Play modal, `direct` native player, YouTube wrapper at base `https://danner.app/`, isolated `web` WebView, Listen, Cast, TV send, relay), with:

- Player header `Patriots game` (`:644`), iframe `title="Patriots video"` (`:438`).
- `incognito={Platform.OS === 'ios'}` with the comment "Android incognito clears every WebView's cookies app-wide, which signs TV Location out" (`:519-521`); `cacheEnabled={false}` (`:517`), `sharedCookiesEnabled={false}` (`:568`), `thirdPartyCookiesEnabled={false}` (`:581`).
- Listen metadata `artist="New England Patriots"`, `title="Patriots game"` (`:1555-1563`). Starting a video stopped Listen audio and Listen always offered a Stop control (`release/RELEASE_NOTES.md`).

---

## 12. Test harness (`tests/patriots/`)

| Command (from `app/`) | Script | What it did |
|---|---|---|
| `test:patriots:android` / `:ready` / `:delayed` / `:final` / `:live` | `run-android.mjs` (86 lines) | Same launcher as Guardians with `/patriots?scenario=` and `/patriots-sources.json` on port 8108 and env `EXPO_PUBLIC_PATRIOTS_TEST_URL`, `EXPO_PUBLIC_PATRIOTS_SOURCES_URL` |
| `test:patriots:server` | `server.mjs` (215 lines) | `PATRIOTS_HARNESS_PORT ?? 8108` (`:4`); routes `/health`, `/patriots`, `/patriots-sources.json`, `/http-media/`, `/popup-player` (`:97-197`); Eastern dates (`:19`); score key `patriotsScore` |
| `test:patriots:android:get-video` | `run-get-video.mjs` (488 lines) | Worker mock on port 8112 with a fixed debug PIN (`:27-28`); rejected any body whose `module` was not `patriots` (`:293`); env at `:355-358`; tapped `content-desc="New England Patriots"` (`:450`) |
| `test:patriots:snapshot` | `run-snapshot.mjs` (586 lines) | Imported `patriotsSnapshot.ts` and `espnScoreboard.ts`; season type from the requested list (B50, `:282`); unparsed Final scores out of the record (`:305`); ESPN state mapping (`:320`); stale summary never moved a game backwards (`:419-441`); the "today" rule and TBA dates under nine phone zones (`PHONE_TIME_ZONES`: New York, Chicago, Denver, Los Angeles, Honolulu, UTC, Berlin, Tokyo, Auckland, `:33-43`, `:442`); the shipped schedule fetch with `fetch` stubbed and a resolve hook for extensionless imports (`:512-526`) |

Fixture `live-game.fixture.json`: `wins`, `losses`, `ties`, `liveGame`, `upcomingGames`, four streams (`direct` ×2, `youtube`, `web`), football board, `seasonType`, `timeValid`.

---

## 13. Rules and docs that pinned this module

- `AI_Framework/AI_RULES.md:53` (sibling rule, ESPN team 17, W–L or W–L–T, football board, Eastern official dates, `module: "patriots"`, "Do not reuse `guardians-get-video` dispatch, `guardians-stream-pipeline.yml`, or `GUARDIANS_STREAM_PIPELINE_CONFIG`. Missing or legacy module stays `guardians`."), `:54` (fixtures, port 8112, `EXPO_PUBLIC_PATRIOTS_TEST_URL`), `:57` (win chance).
- `Docs/Domain/Patriots.md` (32 lines), `app/patriots/README.md`, `tests/patriots/README.md`, `Docs/Anchor/Vision.md:14-16`.
- Validation rows `Docs/Production/Validation.md:26` (hub tile Pass on the emulator harness), `:48-52`, `:94`.

---

## 14. Permalinks

- Schedule fetch: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/patriots/espnNfl.ts#L1-L64
- Game model, record, featured pick, live merge: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/patriots/patriotsSnapshot.ts#L1-L481
- Summary and board parse: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/patriots/espnScoreboard.ts#L1-L286
- Football board: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/patriots/PatriotsScoreboard.tsx#L1-L219
- Win chance: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/patriots/espnWinChance.ts#L1-L165
- Get video client: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/patriots/patriotsGetVideo.ts#L1-L113
- Sources re-export: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/patriots/patriotsSources.ts#L1-L6
- Snapshot and sources fetch: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/patriots/PatriotsScreen.tsx#L78-L362
- Featured card: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/patriots/PatriotsScreen.tsx#L743-L1023
- Screen orchestration: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/patriots/PatriotsScreen.tsx#L1024-L1567
- Domain doc: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/Docs/Domain/Patriots.md#L1-L32
