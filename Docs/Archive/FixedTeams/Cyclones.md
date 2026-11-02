Status: ARCHIVED
Snapshot: 823d2be (2026-10-31)

# Iowa State Cyclones module (fixed-team design)

The Cyclones screen was one hub tile covering three ESPN leagues for Iowa State (ESPN team 66): college football, men's basketball, and women's basketball. It was forked from the Patriots screen (`AI_Framework/AI_RULES.md:55`: "a sibling of Patriots, not a parameterized sports engine"), merged the three schedules into one featured card and one schedule, showed three regular-season records with postseason status lines, used `America/Chicago` official dates, and carried a required `sport` field through `cyclones_streams.json`, Get video, and the Worker. Playback reused the Guardians components by import. This record pins every rule to commit `823d2be562d252c9f3b0da305275adc6d8498f55` (2026-10-31).

Permalink base: `https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/<path>#L<a>-L<b>`.

Shared playback (isolated WebView rules, Listen, Cast, TV send, the live relay) is in [Guardians.md](Guardians.md) sections 13.1–13.7. The football board and ESPN parsing that Cyclones inherited are in [Patriots.md](Patriots.md). Shell and identity are in [Hub.md](Hub.md).

---

## 1. File inventory

| File | Lines | Role |
|---|---|---|
| `app/cyclones/CyclonesScreen.tsx` | 2153 | Three-sport snapshot with per-sport carry-forward, sources chain, player copies, featured card, hero records, styles |
| `app/cyclones/cyclonesSnapshot.ts` | 717 | `CyclonesGame`, season-year rules, records, postseason statuses, featured pick, ESPN event parse |
| `app/cyclones/espnCyclones.ts` | 92 | 3 sports × 3 season types schedule fetch with per-sport failure isolation |
| `app/cyclones/espnCyclonesScoreboard.ts` | 406 | Summary fetch; football and basketball board parsers with a `kind` discriminator |
| `app/cyclones/CyclonesFootballScoreboard.tsx` | 217 | Fork of the Patriots football board (`CYCLONES` label, cardinal) |
| `app/cyclones/CyclonesBasketballScoreboard.tsx` | 214 | Halves or quarters board |
| `app/cyclones/espnWinChance.ts` | 186 | Win chance with a per-sport core path |
| `app/cyclones/WinChanceBar.tsx` | 97 | Copy of the bar (`teamName="Cyclones"`) |
| `app/cyclones/cyclonesGetVideo.ts` | 119 | Worker POST with `module` and `sport` |
| `app/cyclones/cyclonesSources.ts` | 281 | Fork of the Guardians parser with a required `sport` |
| `app/cyclones/README.md` | 20 | Tier README |

Imported from `app/guardians/` (`app/cyclones/CyclonesScreen.tsx:21-40`): `GuardiansAudioPlayer`, `GuardiansCastButton` (with `castContentTypeForUrl`, `castStreamTypeForUrl`), `GuardiansTvRouteButton`, `WEB_AIRPLAY_INJECTION`, the media discovery helpers, `webPlayerUserAgent`; plus `stopHlsProxy`.

Copied in-file: `withHarnessScoreboard` (`:130-147`), `snapshotWithPreservedScoreboard` (`:149-199`), sources helpers (`:311-457`), `gameDateLabel` (`:459-475`), `isAllowedPlayerNavigation` (`:477`), `DirectStreamPlayer` (`:499`), `youtubePlayerHtml` (`:521`, iframe `title="Cyclones video"` at `:539`), `IsolatedWebStreamPlayer` (`:545`), `PlayerKeepAwake` (`:684`), `StreamPlayer` (`:689`, header `Cyclones game` at `:740`), `gameTimeLabel`, `countdownLabel`, `interruptionMessage` (`:787-826`), `LiveScoreboard` dispatcher (`:828-852`), `FeaturedGameCard` (`:854-1133`), `CyclonesScreen` (`:1135-1714`), styles (`:1716-2153`).

---

## 2. Entry, hero, and identity

- Hub tile row 2 left (under Guardians), `accessibilityLabel="Iowa State Cyclones"` (`app/hub/HubScreen.tsx:312-327`) → `setAppScreen('cyclones')` → `<CyclonesScreen onBack={openMenu} />` (`app/App.tsx:34,43-44`).
- Hero (`app/cyclones/CyclonesScreen.tsx:1563-1595`): bundled `iowa-state-cyclones-logo.jpg` (`accessibilityLabel="Iowa State Cyclones"`), title `Cyclones`, then one block per sport in fixed order football, men's basketball, women's basketball: `<Sport label> <W–L[–T]>` (`accessibilityLabel` the same text), and under it the sport's status label (amber `#8A4B00`, 13pt) when one existed. A sport in `unavailableSports` had no block.
- Accent cardinal `ACCENT = '#AE192D'` (`:106`) replaced Guardians red on the refresh control, spinners, live-card border, live dot, Play buttons, and primary buttons (`:660,1540,1543,1599,1819,1833,1872,1994`) and on the boards' `CYCLONES` label (`CyclonesFootballScoreboard.tsx:188`, `CyclonesBasketballScoreboard.tsx:186`). The rest of the palette (navy `#0B2B4C`, `#07264A` boards, amber `#FFCF4A` digits) matched Guardians.
- Error text `Cyclones information is temporarily unavailable.` (`:95-96`).
- Android Back: Play modal first, then the hub (`:1454-1472`).

Sport labels (`sportLabel`, `app/cyclones/cyclonesSnapshot.ts:127-135`): `football` → `Football`, `mens-basketball` → `Men's basketball`, `womens-basketball` → `Women's basketball`. `CYCLONES_SPORTS = ['football', 'mens-basketball', 'womens-basketball']` (`:8-12`).

---

## 3. ESPN NCAA data

### 3.1 Endpoints

| Purpose | Request | Timeout | Source |
|---|---|---|---|
| Schedule | `GET https://site.api.espn.com/apis/site/v2/sports/<SPORT_PATH>/teams/66/schedule?season=<season year for sport>&seasontype=<1\|2\|3>`, header `Accept: application/json`; 9 requests in parallel under one controller | 12 s shared (`SCHEDULE_TIMEOUT_MS`) | `app/cyclones/espnCyclones.ts:8-15,35-61` |
| Live summary | `GET https://site.api.espn.com/apis/site/v2/sports/<SUMMARY_PATH>/summary?event=<gamePk>` | 6 s | `app/cyclones/espnCyclonesScoreboard.ts:30-36,382-406` |
| Win chance | `https://sports.core.api.espn.com/v2/sports/<EVENT_PATH>/events/<id>/competitions/<id>/predictor` and `.../probabilities?limit=1[&page=N]` | 6 s | `app/cyclones/espnWinChance.ts:15-19,94-120` |

Path tables:

| Sport | Site path (`SPORT_PATHS`, `SUMMARY_PATHS`) | Core path (`EVENT_PATHS`) |
|---|---|---|
| `football` | `football/college-football` | `football/leagues/college-football` |
| `mens-basketball` | `basketball/mens-college-basketball` | `basketball/leagues/mens-college-basketball` |
| `womens-basketball` | `basketball/womens-college-basketball` | `basketball/leagues/womens-college-basketball` |

`SPORT_PATHS` (`espnCyclones.ts:11-15`) and `SUMMARY_PATHS` (`espnCyclonesScoreboard.ts:32-36`) were duplicate tables.

### 3.2 Ids and season years

- `CYCLONES_TEAM_ID = 66` for all three sports (`app/cyclones/cyclonesSnapshot.ts:6`); mirrored in the pipeline (`scripts/guardians-stream-pipeline/lib/ncaaSchedule.mjs:3`).
- `gamePk = Number(event.id)`, the ESPN event id, fed summary and win-chance URLs directly (`cyclonesSnapshot.ts:546`).
- `footballSeasonYear(now)`: January used the previous year (`now.getMonth() === 0`), otherwise the current year (`:115-117`).
- `basketballSeasonYear(now)`: July through December used `year + 1` (`now.getMonth() >= 6`), otherwise the current year (`:119-121`). The basketball season was named for the year it ended.

### 3.3 Three-sport merge and failure isolation

`fetchEspnCyclonesEvents` (`app/cyclones/espnCyclones.ts:33-92`):

- Built 9 requests (3 sports × season types `[1, 2, 3]`) and ran them with `Promise.allSettled`.
- A sport with any failed request was left out whole (`failedSports`), so its record and postseason status were never computed from part of its schedule. Only a failure of every sport threw.
- Events were de-duplicated by `` `${sport}:${id}` `` (`:84`).

`fetchCyclonesSnapshot(previous)` (`app/cyclones/CyclonesScreen.tsx:254-309`):

- Parsed events with `cyclonesGameFromEspnEvent(event, sport)` and attached a board from the schedule competition (`liveFootballScoreboardFromEspn` or `liveBasketballScoreboardFromEspn`).
- For each failed sport: if the previous snapshot had that sport, its record, its games (featured and upcoming), and its status were carried forward; if not, the sport went into `unavailableSports`, which hid its hero block.
- Returned `complete: failedSports.length === 0`. `lastSnapshotAtRef` advanced only on a complete snapshot (`:1187-1190`), so the 60 s tick kept retrying the schedule until every sport succeeded.

### 3.4 Game model (`app/cyclones/cyclonesSnapshot.ts`)

`CyclonesGame` (`:16-33`): `abstractState`, `cyclonesScore`, `gameDate`, `gameNumber`, `gamePk`, `isHome`, `neutralSite`, `notes`, `officialDate`, `opponentName`, `opponentScore`, `scoreboard?` (`LiveBasketballScoreboard | LiveFootballScoreboard`), `seasonType`, `sport`, `status`, `timeValid`. `CyclonesSnapshot` (`:52-58`): `featuredGame?`, `records` per sport, `statuses` per sport (partial), `unavailableSports?`, `upcomingGames`.

`cyclonesGameFromEspnEvent(event, sport)` (`:528-649`):

| Field | Rule | Difference from Patriots |
|---|---|---|
| Sides | same competitor parse; one side must be team 66 | — |
| Scores | `finiteScore` returned 0 for anything unparsable (`:439-454`) | Patriots kept `undefined` and `scoresKnown`; Cyclones had no `scoresKnown`, so an unparsable Final counted with 0 |
| `abstractState` | `in` → `Live`, `post` → `Final`, else `Preview`; `completed` was ignored (`:456-464`) | Patriots also honored `completed` |
| `seasonType` | the event's own `seasonType.type` (integer), default 2 (`:612-616`) | Patriots used the requested list |
| `status` | same `espnContestStatus` as Patriots (`:492-526`) | — |
| `timeValid` | `event.timeValid !== false && competition.timeValid !== false` (`:617`) | — |
| `officialDate` | valid time → `America/Chicago` date of kickoff; TBA → `America/New_York` date of ESPN's placeholder (`:639-641`, helpers `:75-95`) | Patriots always Eastern |
| `neutralSite` | `competition.neutralSite === true` (`:637`) | new |
| `notes` | joined `event.name`, `event.shortName`, `event.seasonType.name`, `competition.type.text`, `competition.type.abbreviation`, and `notes[].headline`/`text` from event and competition (`:470-490`, `:618-628`) | new; used by postseason rules |
| `gameNumber` | always 1 | — |

ESPN stored a game without a start time at midnight Eastern of its calendar day, which was still the previous day in Chicago; reading TBA dates in New York kept the calendar day (`:92-95`; pipeline comment `ncaaSchedule.mjs:133-137`).

---

## 4. Official date and "today"

| Rule | Value | Source |
|---|---|---|
| Stream-matching date, known time | `America/Chicago` calendar date of kickoff | `cyclonesSnapshot.ts:88-90,639-640` |
| Stream-matching date, TBA | `America/New_York` calendar date of ESPN's placeholder | `:92-95,641` |
| Pipeline zone | `MODULES.cyclones.timeZone = 'America/Chicago'`; `CYCLONES_TIME_ZONE`; workflow `TZ: America/Chicago` | `scripts/guardians-stream-pipeline/lib/pipeline.mjs:61-66`; `lib/ncaaSchedule.mjs:4`; `.github/workflows/cyclones-stream-pipeline.yml:38` |
| App "today" | phone-local date | `cyclonesSnapshot.ts:68-73,406` |
| Day of a game | known time → phone-local date of start; TBA → official date (all-day game) | `gameDay`, `:102-107` |
| Sort time | known time → start; TBA → local midnight of the official date | `gameSortTime`, `:109-113`; `localDateFromOfficialDate`, `:97-100` |
| Schedule label | `<weekday, month day> <h:mm>`; TBA → local midnight of the official date formatted, then ` · Time TBA` | `CyclonesScreen.tsx:459-475` (Guardians and Patriots formatted TBA at UTC noon) |

---

## 5. Records and postseason statuses

### 5.1 Records

- `regularSeasonRecord` (`cyclonesSnapshot.ts:197-214`): completed games with `seasonType === 2`; wins, losses, ties by score.
- `recordsFromGames` (`:216-230`): one record per sport. Each stayed `0–0` until that sport had a regular-season Final. `recordLabel` = `W–L`, or `W–L–T` when ties > 0 (`:123-125`).

### 5.2 Status per sport (`sportStatus`, `:302-380`)

Evaluated only when the sport had no Live game and no unfinished game on or after today (`:311-318`). Then, from the sport's last completed game and its notes haystack (`notes status opponentName`, lower-cased, `:237-239`):

| Condition, in order | Status kind | Label |
|---|---|---|
| haystack contains `selection sunday`, `pairing`, or `awaiting next` | `awaiting-next` | `Awaiting next tournament game` |
| basketball conference tournament result (`conference tournament`, `big 12 tournament`, or `big 12 [men's\|women's] [basketball] championship`, `:241-251`) within 14 days (`CONFERENCE_TOURNAMENT_WAIT_MS = 14 * 86_400_000`, `:65`) | `awaiting-next` | `Awaiting next tournament game` |
| same, older than 14 days | `season-complete` | `Season complete` (not shown) |
| knockout tournament win in a title game | `won-tournament` | `Won the <tournament>` |
| knockout tournament win, not a title game | `awaiting-next` | `Awaiting next <tournament> game` |
| knockout tournament loss | `eliminated` | `Eliminated from the <tournament>` |
| anything else | `season-complete` | `Season complete` (not shown) |

Knockout detection (`knockoutTournament`, `:253-284`):

- Football: only `college football playoff` or a word `cfp` → `College Football Playoff`. Any other bowl ended the season without an eliminated line.
- Basketball (after excluding conference tournaments): `ncaa … tournament`, `march madness`, or `men's/women's basketball championship` (`NCAA_CHAMPIONSHIP_NOTE`, `:66`) → `NCAA Tournament`; word `wnit` → `WNIT`; word `wbit` → `WBIT`; postseason (`seasonType === 3`) with word `nit` → `NIT`; postseason with `tournament` → `tournament`.

Title game (`isTitleGame`, `:286-300`): `national championship` or `championship game`; for NIT, WNIT, WBIT also `<nit|wnit|wbit> - championship|final`. ESPN wrote "Championship" in every NCAA round note, so only the final round counted as winning.

`statusesFromGames` (`:382-394`) kept every status except `season-complete`. The featured card showed the featured sport's status label under the status line (`CyclonesScreen.tsx:952-954`, 15pt amber `#8A4B00`).

---

## 6. Featured game and schedule

`snapshotFromGames(games, records, now)` (`cyclonesSnapshot.ts:396-437`):

1. Remaining: not completed, and Live or starting today or later (known time ≥ local midnight; TBA by official date), across all three sports.
2. Sort by `gameSortTime`, then game number (`:232-235`).
3. Recap: last completed game with today's official date.
4. Featured: first Live game in any sport, else the first remaining game whose `gameDay` is today, else the recap. Other same-day games in other sports stayed in the schedule.
5. Upcoming: remaining games whose `gamePk` differed from the featured one.

Screen identity key `` `${sport}:${gamePk}` `` (`CyclonesScreen.tsx:1417-1420`); a change reset Get video and Listen and aborted the Get video session in the effect cleanup (`:1424-1432`).

Schedule rows (`:1654-1696`): sport label line (`gameSport`), date label, status unless `Scheduled`, then `vs` when home or neutral site, else `at`, plus the opponent; row key `` `${sport}-${gamePk}` ``; `NextGameWinChance` under the first row when nothing was featured.

### 6.1 Featured card differences

Same structure as Guardians ([Guardians.md](Guardians.md) section 6), with:

| Item | Cyclones |
|---|---|
| Sport line | sport label in capitals above the badge (`:927`, style `sportName` 13pt `#5A6870`) |
| Matchup, today or Final | neutral site → `vs <opponent>`; else `Home vs` / `Away v` (`:910-916`) |
| Matchup, Live or interrupted | `Cyclones vs <opponent>` when home or neutral, else `Cyclones at <opponent>` (`:917`) |
| Status line | `game.status` when Live, interrupted, or Final (`:948-950`) |
| Season status | featured sport's status label (`:952-954`) |
| Video window | `isVideoWindowOpen`: not blocked, and Live (even with an unknown start) or valid time within 15 min (`cyclonesSnapshot.ts:176-185`) |
| Blocking | `playbackBlocked` = canceled, postponed, suspended, or completed (`:166-174`) |
| Live board | `LiveScoreboard` dispatch (section 7) |
| Score box first row | `Cyclones` (`CyclonesScreen.tsx:977`) |
| Win-chance `teamName` | `Cyclones` (`:968`) |
| Get video hint | `Finds the approved Cyclones video for this game` (`:1095`) |

Countdown tick (`:1250-1282`): 1 s pre-game, 30 s when delayed, none when Live, Final, or otherwise interrupted.

---

## 7. Boards and live refresh

### 7.1 Board parse (`app/cyclones/espnCyclonesScoreboard.ts`)

- `LiveFootballScoreboard` (`:8-19`): `kind: 'football'`, `away`/`home` `{ points, periods[] }`, `clock`, `period`, `down?`, `distance?`, `possessionTeamId?`, `situation?`, `status`.
- `LiveBasketballScoreboard` (`:21-28`): `kind: 'basketball'`, `away`/`home`, `clock`, `period`, `status`. No situation or possession.
- Football situation came only from the document's top-level `situation` (`:172-174`); the Patriots parser also fell back to the competition.
- `liveCyclonesSummaryFromEspn(value, sport)` (`:357-380`) chose the parser by sport and returned `{ completed, scoreboard, state }`.

### 7.2 Board components

| Board | Use | Columns | Labels | Source |
|---|---|---|---|---|
| `CyclonesFootballScoreboard` | `sport === 'football'` and board `kind === 'football'` | quarters 1–4, `OT`, `2OT`…, max 10 (`MAX_QUARTERS`), then `T` | `CYCLONES` / opponent last word; possession `▸ ` by team 66; clock line and down-and-distance | `app/cyclones/CyclonesFootballScoreboard.tsx` (92% identical to `PatriotsScoreboard.tsx`) |
| `CyclonesBasketballScoreboard` with `regulationPeriods` 2 | men's basketball | `1`, `2`, then `OT`, `2OT`…, max 10 (`MAX_PERIODS`), then `T` | clock line `H1`/`H2` or `OT`/`<n>OT` plus the clock | `app/cyclones/CyclonesBasketballScoreboard.tsx:4,14-24,50-65` |
| same with `regulationPeriods` 4 | women's basketball | `1`–`4`, then overtime | `Q1`–`Q4` | `CyclonesScreen.tsx:841-850` |

Dispatcher `LiveScoreboard` (`CyclonesScreen.tsx:828-852`). Multi-overtime college football beyond 6 OT periods was truncated by the 10-column cap.

### 7.3 Poll and merge

- Poll ran while the featured game was Live, or after its valid start time while still pre-game and not blocked (`pollsLiveSummary`, `:1284-1297`); 5,000 ms (`:90`), immediate run, run on foreground; skipped while in flight or backgrounded; out-of-order replies ignored (`latestRequest`/`latestApplied`); skipped in harness mode (`:1322-1324`).
- Apply (`:1351-1397`): `completed` or `post` → `Final`; `in`, or no state while already Live → `Live`; a `pre` report changed nothing. A board set both scores and `status = board.status`; without a board, `status` became `Final` on completion or stayed. A Live report with a board stamped `liveBoardRef = { appliedAt, gamePk }`. Any Final report forced one snapshot.
- Kickoff refresh (`:1299-1312`): armed while the start was in the future (`pendingStartGamePkRef`); when the start passed, `load(false, undefined, true)` ran once.
- Snapshot merge (`snapshotWithPreservedScoreboard`, `:149-199`, `LIVE_BOARD_FRESH_MS = 30_000` at `:93`): for the same `gamePk`, a lagging schedule (previous Final but new not Final, or previous Live but new neither Live nor Final) or a polled Live board younger than 30 s kept the previous state, scores, board, and status; otherwise the new snapshot, keeping the previous board when the new one had none.

### 7.4 Cadences

| What | Cadence | Source |
|---|---|---|
| `load()` tick (streams always; schedule when older than 10 min or incomplete) | 60,000 ms while active | `CyclonesScreen.tsx:88-89,1227-1243`; staleness `:1171-1176` |
| Live summary | 5 s | `:90` |
| Countdown | 1 s; 30 s delayed | `:91-92` |
| Win chance | 10 min pre-game, 30 s live | `app/cyclones/espnWinChance.ts` |
| Get video poll | 5 s for up to 5 min | `app/cyclones/cyclonesGetVideo.ts` |

`load(showRefresh, sourceOptions, forceSnapshot)` (`:1160-1225`) ran snapshot and streams with `Promise.allSettled`; the spinner always cleared.

---

## 8. Win chance

`app/cyclones/espnWinChance.ts` was the Patriots hook with `sport` threaded through: `eventsUrl(sport)` built the core path from `EVENT_PATHS` (`:15-19,94-97`), and the hook required `sport` (`:139-183`). Same predictor/probability parsing, `wanted` rule, timeout, and refresh. Bar text `Win chance: Cyclones N percent, <opponent> M percent`.

---

## 9. Streams document with `sport`

### 9.1 File and schema

- Root `cyclones_streams.json` on `main`. `HOW_TO_GUIDE` carried the Guardians keys plus `sport`.
- Contents at the snapshot: 4 items: the `INACTIVE EXAMPLE` string, an inactive `direct` example with `sport: 'football'`, and `web` entries for 2026-10-24 and 2026-10-31 (football, game 1). The snapshot commit itself was `cyclones: update stream for 2026-10-31 game 1`.
- Seven strict fields: the six Guardians fields plus `sport` (`app/cyclones/cyclonesSources.ts:41-49`), which had to be `football`, `mens-basketball`, or `womens-basketball` (`:216-217`). Any extra key rejected the entry. All other validation (dates, game numbers 1–9, URL length, transport, YouTube rewrite, `trustedHosts`, the `GOOZ_HOST` provider-path rule) was a copy of the Guardians parser.
- Parse kept the newest 200 objects and skipped guide strings; the de-duplication key included the sport.
- Matching (`authorizedStreamsForGame`, `:271-280`): `sport` equal to the featured game's sport, `gameDates` includes its official date, and `gameNumbers` includes the featured game number (always `1`).

### 9.2 Fetch chain (`fetchCyclonesSources`, `CyclonesScreen.tsx:385-457`)

| Constant | Value | Source |
|---|---|---|
| `REMOTE_CYCLONES_SOURCES_URL` | `https://raw.githubusercontent.com/Danner36/Danner_App/main/cyclones_streams.json` | `:97-98` |
| `SOURCES_STORAGE_KEY` | `danner.cyclones.sources.v1` | `:99` |
| `SOURCES_FETCH_TIMEOUT_MS` | 8,000 per attempt | `:94` |
| Dev overrides | `EXPO_PUBLIC_CYCLONES_TEST_URL`, `EXPO_PUBLIC_CYCLONES_SOURCES_URL` (`__DEV__` only) | `:100-105` |

Order: Worker `GET {GET_VIDEO_URL}/streams?module=cyclones` (`app/cyclones/cyclonesGetVideo.ts:18-22`) → for `preferLive` production loads, latest commit SHA for `cyclones_streams.json` (`:316-334`) then raw by SHA (`:421-439`) → raw `main` → cached `danner.cyclones.sources.v1`. The SHA lookup was a promise memoized on `session.commitSha ??=`, and every attempt also listened to an outer abort signal (`withSourcesTimeout(run, outerSignal)`, `:355-372`; `SourcesOptions.signal`, `:378-383`), so leaving the screen cancelled in-flight Get video fetches. The sticky no-wipe rule matched Guardians (`:1199-1214`). The Worker returned the whole file; the phone kept only entries whose `sport` matched the featured game.

---

## 10. Get video with module and sport

Client (`app/cyclones/cyclonesGetVideo.ts`):

- Same build-time values `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` (`:8`) and `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` (`:9`).
- `requestGetVideo(sport, signal?)`: `POST {base}/get-video`, body `{ module: 'cyclones', pin, sport }` (`:30-57`), 20 s timeout linked to the caller's signal. `401` → `Get video is not authorized.`; `429` → keep polling; other non-OK → `Get video could not start.`
- Poll 5 s for up to 5 min against `/streams?module=cyclones`, matching sport, date, and game number.

Screen (`handleGetVideo`, `CyclonesScreen.tsx:1474-1527`): `sourceOptions = { allowStaleCache: false, preferLive: true, session: {}, signal }`; `requestGetVideo(game.sport, signal)`; poll; append on a match; `load(true, sourceOptions)`; `idle` or `failed`.

Server side:

- Worker `CYCLONES_SPORTS = { football, mens-basketball, womens-basketball }` (`workers/guardians-get-video/src/index.js:24-28`). For `module: 'cyclones'` a missing or unknown `sport` returned 400 `Unknown sport.` before the rate limit and PIN check (`:300-304`). Other modules ignored `sport`.
- Dispatch `event_type: 'cyclones-get-video'`, `client_payload: { module: 'cyclones', source: 'phone', sport }` (`:17-21`, `:217-245`).
- `.github/workflows/cyclones-stream-pipeline.yml`: `repository_dispatch` `types: [cyclones-get-video]` (`:21-22`) and a manual `workflow_dispatch` with inputs `dry_run`, `force`, and `sport` (default `football`) (`:4-20`); `TZ: America/Chicago` (`:38`); repo secret `CYCLONES_STREAM_PIPELINE_CONFIG` (`:53`); `PIPELINE_MODULE: cyclones` and `DISPATCH_SPORT: ${{ github.event.client_payload.sport || inputs.sport || 'football' }}` (`:66-67,100-101`); concurrency group `cyclones-stream-pipeline`; 15 min timeout. The pipeline config used `sport: 'cyclones'` and per-sport listing-link needles (`extract.hrefNeedles` keyed by `football`, `mens-basketball`, `womens-basketball`); published entries carried `sport`.

---

## 11. Playback

Same as Guardians, with player header `Cyclones game`, iframe title `Cyclones video`, cardinal spinners, and Listen metadata `artist="Iowa State Cyclones"`, `title="Cyclones game"` (`CyclonesScreen.tsx:1701-1711`). The player WebView set `incognito={Platform.OS === 'ios'}` (`:618`) without the explanatory comment the other two screens carried; `cacheEnabled={false}` (`:616`), `sharedCookiesEnabled={false}` (`:665`), `thirdPartyCookiesEnabled={false}` (`:678`).

---

## 12. Test harness (`tests/cyclones/`)

| Command (from `app/`) | Script | What it did |
|---|---|---|
| `test:cyclones:android` / `:ready` / `:delayed` / `:final` / `:live` | `run-android.mjs` (86 lines) | Same launcher with `/cyclones?scenario=` and `/cyclones-sources.json` on 8108; env `EXPO_PUBLIC_CYCLONES_TEST_URL`, `EXPO_PUBLIC_CYCLONES_SOURCES_URL` |
| `test:cyclones:server` | `server.mjs` (216 lines) | `CYCLONES_HARNESS_PORT ?? 8108`; routes `/health`, `/cyclones`, `/cyclones-sources.json`, `/http-media/`, `/popup-player` (`:97-198`); `America/Chicago` dates (`:19`); emitted streams defaulted `sport` to `football` (`:137`); score key `cyclonesScore` |
| `test:cyclones:android:get-video` | `run-get-video.mjs` (498 lines) | Worker mock on port 8113 with a fixed debug PIN (`:27`); rejected `module !== 'cyclones'` (`:297`) and `sport !== 'football'` (`:304`); Chicago date (`:31-40`); env `:366-369`; tapped `content-desc="Iowa State Cyclones"` (`:461`); printed `Play appeared after publish without restart.` (`:481`) |
| `test:cyclones:snapshot` | `run-snapshot.mjs` (841 lines) | Imported `cyclonesSnapshot.ts`, `cyclonesSources.ts`, `espnCyclonesScoreboard.ts`; fixtures built in the machine's local zone so assertions held anywhere (`:27-28`); ESPN TBA at midnight Eastern (`:85`); unfinished game today kept the season alive (`:193`); CFP-only football knockout (`:207`); NCAA notes (`:259`); conference tournament waits (`:307`); TBA Eastern dates as all-day games (`:612`); video window (`:711`); neutral site (`:736`); summary state for Live and Final (`:758`); newest 200 streams (`:794`) |

Fixture `live-game.fixture.json`: `wins`, `losses`, `ties`, `liveGame`, `upcomingGames`, four football streams (`direct` ×2, `youtube`, `web`), a `kind: 'football'` board, `notes`. The harness snapshot also accepted per-sport records `football`, `mensBasketball`, `womensBasketball` (`CyclonesScreen.tsx:201-252`).

---

## 13. Rules and docs that pinned this module

- `AI_Framework/AI_RULES.md:55` (sibling of Patriots, ESPN team 66 in three sports, three records, one featured card, boards, elimination and `Awaiting next`, Eastern TBA dates, `cyclones_streams.json` with `sport`, Chicago official dates, `{ pin, module: "cyclones", sport }`, "Do not reuse Guardians or Patriots dispatch types, workflows, or pipeline secrets."), `:56` (fixtures, port 8113, `EXPO_PUBLIC_CYCLONES_TEST_URL`), `:57` (win chance).
- `Docs/Domain/Cyclones.md` (36 lines), `app/cyclones/README.md`, `tests/cyclones/README.md`, `Docs/Anchor/Vision.md:18-20`.
- `Docs/Production/Cyclones.md` (386 lines, `Status: ACTIVE`, phase `Implemented in source`): the delivery brief. It forbade a generic engine (`:8`, "Do not parameterize Guardians or Patriots into a generic sports engine"; `:377-386` out of scope), fixed the hub layout (`:31-38`), and recorded ESPN paths and ids (`:120-126`), season-year rules (`:130-133`), elimination rules (`:165-179`), and listing-token notes (`:327-354`).
- Family phones needed `v1.4.9` or newer to show the Cyclones tile (`Docs/Production/README.md:9`, `AI_Framework/AI_ONBOARDING.md:9`).
- Validation rows `Docs/Production/Validation.md:53-58`, `:94`.

---

## 14. Permalinks

- Three-sport schedule fetch: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/cyclones/espnCyclones.ts#L1-L92
- Game model, records, statuses, featured pick, parse: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/cyclones/cyclonesSnapshot.ts#L1-L717
- Board parsers and summary: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/cyclones/espnCyclonesScoreboard.ts#L1-L406
- Basketball board: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/cyclones/CyclonesBasketballScoreboard.tsx#L1-L214
- Football board: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/cyclones/CyclonesFootballScoreboard.tsx#L1-L217
- Sources with sport: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/cyclones/cyclonesSources.ts#L1-L281
- Get video client: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/cyclones/cyclonesGetVideo.ts#L1-L119
- Win chance: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/cyclones/espnWinChance.ts#L1-L186
- Snapshot carry-forward and sources chain: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/cyclones/CyclonesScreen.tsx#L106-L475
- Board dispatch and featured card: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/cyclones/CyclonesScreen.tsx#L828-L1133
- Screen orchestration and hero records: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/cyclones/CyclonesScreen.tsx#L1135-L1714
- Worker sport check: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/workers/guardians-get-video/src/index.js#L291-L310
- Cyclones workflow: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/.github/workflows/cyclones-stream-pipeline.yml#L1-L104
- Domain doc: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/Docs/Domain/Cyclones.md#L1-L36
