Status: ARCHIVED
Snapshot: 823d2be (2026-10-31)

# Cleveland Guardians module (fixed-team design)

The Guardians screen was the first and reference team module: Cleveland only, MLB data from `statsapi.mlb.com`, a win-chance bar from ESPN, approved playback from root `guardians_streams.json`, and the shared playback stack (Play, Listen, Cast, TV send with a phone-side live relay, isolated player WebViews) that the Patriots and Cyclones screens imported from `app/guardians/`. This record pins every rule to commit `823d2be562d252c9f3b0da305275adc6d8498f55` (2026-10-31).

Permalink base: `https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/<path>#L<a>-L<b>`.

Related records: [Hub.md](Hub.md) (route, tile, env vars, identity), [Patriots.md](Patriots.md), [Cyclones.md](Cyclones.md), [TvLocation.md](TvLocation.md).

---

## 1. File inventory

| File | Lines | Role | Shared with other teams |
|---|---|---|---|
| `app/guardians/GuardiansScreen.tsx` | 2091 | MLB snapshot fetch, sources fetch chain, players, featured card, screen orchestration, styles | Its player and card code was copied (not imported) into the Patriots and Cyclones screens |
| `app/guardians/guardiansSnapshot.ts` | 343 | `GuardiansGame` model, MLB parse, featured-game selection | No |
| `app/guardians/mlbLinescore.ts` | 426 | Linescore parse, 5 s live poll, jersey-number lookup | No |
| `app/guardians/GuardiansScoreboard.tsx` | 285 | Park-style LED scoreboard | No |
| `app/guardians/espnWinChance.ts` | 222 | MLB→ESPN event mapping, predictor and probability fetch, `useWinChance` | Patriots and Cyclones had their own copies |
| `app/guardians/WinChanceBar.tsx` | 97 | `WIN CHANCE` bar and `NextGameWinChance` | Copies in Patriots and Cyclones |
| `app/guardians/guardiansSources.ts` | 266 | Streams schema, validation, matching | Patriots re-exported it (`app/patriots/patriotsSources.ts:1-6`); Cyclones forked it |
| `app/guardians/guardiansGetVideo.ts` | 113 | Worker POST and poll | Copies in Patriots and Cyclones |
| `app/guardians/GuardiansAudioPlayer.tsx` | 79 | Listen (audio-only) player | Imported by Patriots and Cyclones |
| `app/guardians/GuardiansCastButton.tsx` | 256 | Cast control for `direct` sources and relays | Imported |
| `app/guardians/GuardiansTvRouteButton.tsx` | 422 | `TV` send for `web` sources through the LAN relay | Imported |
| `app/guardians/castStreamType.ts` | 15 | Cast `streamType` choice | Imported |
| `app/guardians/webMediaDiscoveryInjection.ts` | 531 | Page media discovery script, nonce, receiver-state helpers, TV messages | Imported |
| `app/guardians/webAirPlayInjection.ts` | 44 | iPhone AirPlay opt-in script | Imported |
| `app/guardians/webPlayerUserAgent.ts` | 18 | Android Chrome `userAgent` for iPhone web players | Imported |
| `app/guardians/README.md` | 19 | Tier README | — |
| `app/modules/danner-live-hls/**` | — | Native LAN relay (Android Kotlin, iOS Swift) | Used by all three via `GuardiansTvRouteButton` |

---

## 2. Entry, layout, and lifecycle

- Route: hub tile `Cleveland Guardians` → `setAppScreen('guardians')` → `<GuardiansScreen onBack={openMenu} />` (`app/App.tsx:35,39-40`). The screen unmounted on return, which aborted Get video (`app/guardians/GuardiansScreen.tsx:1444`) and stopped Listen audio (the audio player unmounted).
- Header: `‹ Apps` button, `accessibilityLabel="Return to Danner Apps"` (`:1539-1552`).
- Hero: `Image accessibilityLabel="Cleveland Guardians"`, `resizeMode="cover"`, the bundled `cleveland-guardians-logo.jpg`, 118×118 radius 22 (`:1554-1560`, style `:1723-1727`); title `Guardians` (32, weight 900, navy `#0B2B4C`, `:1561-1563`, `:1728-1734`); record `W–L` with `accessibilityLabel="Season record N wins, M losses"` (`:1564-1571`).
- Loading card `Loading the latest games…` with a red spinner until the first snapshot (`:1574-1579`). Error card: title `Couldn’t update the games`, body `Guardians information is temporarily unavailable.`, button `Try again` (`:1581-1596`, message constant `:89-90`).
- Then the featured card (section 6) and the `Upcoming games` schedule (section 8).
- Pull-to-refresh: `RefreshControl` in red `#E31937` calling `load(true)` (`:1529-1536`).
- Content column `maxWidth: 720`, horizontal padding 18 (`:1693-1697`).
- Android Back: closes the Play modal first, otherwise `onBack()` (`:1446-1464`).

---

## 3. MLB data sources

### 3.1 Endpoints

| Purpose | Request | Parse | Timeout | Source |
|---|---|---|---|---|
| Season schedule | `GET https://statsapi.mlb.com/api/v1/schedule?endDate=<Dec 31 of phone-local year>&hydrate=linescore,team&sportId=1&startDate=<phone-local yesterday>&teamId=114` | `dates[].games[]` → `guardiansGameFromMlb`; each game's `linescore` → `liveScoreboardFromMlb` | 10 s shared with standings (`SNAPSHOT_FETCH_TIMEOUT_MS`) | `app/guardians/GuardiansScreen.tsx:221-232,259-261,276-290` |
| Standings (record) | `GET https://statsapi.mlb.com/api/v1/standings?hydrate=team&leagueId=103&season=<phone-local year>&standingsTypes=regularSeason` | `records[].teamRecords[]` entry with `team.id === 114` → `wins`, `losses` (0 when absent) | same 10 s budget | `:233-238,262-264,291-300` |
| Live poll | `GET https://statsapi.mlb.com/api/v1/schedule?gamePk=<pk>&hydrate=linescore`, header `Accept: application/json` | `liveGameFromSchedule` | 6 s (`LINESCORE_TIMEOUT_MS`) | `app/guardians/mlbLinescore.ts:57,384-426` |
| Jersey number | `GET https://statsapi.mlb.com/api/v1/people/<id>` | `people[0].primaryNumber` (trimmed string) | 6 s | `app/guardians/mlbLinescore.ts:159-190` |

Rules:

- Team id `GUARDIANS_TEAM_ID = 114` (`app/guardians/guardiansSnapshot.ts:7`). `sportId: '1'` (MLB). `leagueId: '103'` (American League standings), so the record lookup only worked for an AL team (`GuardiansScreen.tsx:235`).
- Schedule and standings were fetched with `Promise.all` under one `AbortController`; a non-OK status from either threw `Guardians information is temporarily unavailable.` (`:240-275`).
- Season year was `now.getFullYear()` of the phone; the schedule window ran from phone-local yesterday through December 31 of that year (`:221-232`).
- The jersey lookup used the batter id from `linescore.offense.batter.id` and the pitcher id from `linescore.defense.pitcher.id` (`mlbLinescore.ts:149-153`). Results were kept in the process-lifetime `JERSEY_CACHE` map keyed by player id (`:56,160-163,183`); failures were not cached.

### 3.2 Game model (`app/guardians/guardiansSnapshot.ts`)

`GuardiansGame` (`:30-43`): `abstractState`, `gameDate` (ISO UTC), `gameNumber`, `gamePk`, `guardiansScore`, `isHome`, `officialDate` (`YYYY-MM-DD`), `opponentName`, `opponentScore`, `scoreboard?`, `status` (MLB `detailedState`), `timeValid`. `GuardiansSnapshot` (`:45-50`): `featuredGame?`, `losses`, `upcomingGames`, `wins`.

`guardiansGameFromMlb` (`:257-296`):

| Field | Rule |
|---|---|
| Validity | requires numeric `gamePk`, parseable `gameDate`, both `teams.away.team` and `teams.home.team`; the Guardians side must have `team.id === 114` and the opponent must have `team.name` |
| `isHome` | `teams.home.team.id === 114` |
| `abstractState` | `abstractStateFromMlb(status)` (below) |
| `gameNumber` | `game.gameNumber ?? 1` |
| `guardiansScore` / `opponentScore` | side `score ?? 0` |
| `officialDate` | MLB `officialDate`, else phone-local date of `gameDate` |
| `opponentName` | MLB full `team.name` (for example `San Francisco Giants`) |
| `status` | `status.detailedState ?? 'Scheduled'` |
| `timeValid` | `status.startTimeTBD !== true` |

State and identity helpers:

- `abstractStateFromMlb` (`:103-114`): `abstractGameState` (default `Preview`), except that Live with `statusCode === 'PW'`, `codedGameState === 'PW'`, or `detailedState === 'Warmup'` was treated as `Preview`. Warmup therefore stayed a pre-game card.
- `gameKey` = `` `${gamePk}:${officialDate}` `` (`:98-100`). MLB kept the same `gamePk` when a game moved to another day, so the official date was part of identity.
- `gameInterruption(status)` (`:62-77`): case-insensitive substring match in this order: `cancel` → `canceled`, `delay` → `delayed`, `postpon` → `postponed`, `suspend` → `suspended`.
- `isCompletedGame` (`:79-81`): `Final` with no interruption.
- `blocksPlayback` (`:84-92`): canceled, postponed, suspended, or completed. A delayed game did not block playback.
- `recapResult` (`:138-146`): `WIN`, `LOSS`, or `TIE` from the two scores.
- `gameWithLiveReport` (`:120-136`): applied a poll: runs from the board (or the side scores) mapped to Guardians and opponent, new `abstractState` via the Warmup rule, the board, and `status = report.status.detailedState` (the inning text stayed on the board, so a rain delay stayed visible in the status line).

### 3.3 Linescore parse (`app/guardians/mlbLinescore.ts`)

`LiveScoreboard` (`:13-23`): `away`/`home` `{ errors, hits, runs }`, `innings[] { num, away?, home? }`, `balls`, `strikes`, `outs`, `status`, `batterNumber?`, `pitcherNumber?`.

`liveScoreboardFromMlb` (`:95-157`): required `teams.away` and `teams.home`; counts truncated to non-negative integers (`finiteCount`, `:59-63`); innings with `num < 1` dropped; `balls` capped at 4, `strikes` at 3, `outs` at 3; `status` = `` `${inningState} ${currentInningOrdinal}` `` (for example `Top 7th`), else `Live`.

`liveGameFromSchedule` (`:300-382`): a postponed or suspended game appeared under every date it was scheduled with the same `gamePk`. The entry with the featured official date won, then the one whose start was closest to the featured start; an entry with another official date still answered when it was the only one. A report without `abstractGameState` was dropped, because it could not move the card between pre-game, Live, and Final.

---

## 4. Official date and "today"

- The app's "today" was the phone-local calendar date (`localDateString(now)`, `guardiansSnapshot.ts:55-60,190`). Known start times were displayed in the phone's time zone.
- MLB's own `officialDate` field was the stream-matching date. For a game without a published start (`startTimeTBD`), MLB sent a placeholder timestamp of 3:33 AM Eastern (`07:33Z`, `Docs/Domain/Guardians.md:18`); that placeholder could fall on the previous local day west of Eastern time, so the today check and the schedule label used `officialDate` for TBA games (`guardiansSnapshot.ts:156-162`; `GuardiansScreen.tsx:462-472`).
- The extract pipeline's "today" for Guardians was `America/New_York` (`scripts/guardians-stream-pipeline/lib/mlbSchedule.mjs:8`, `GUARDIANS_TIME_ZONE`; workflow `TZ: America/New_York`, `.github/workflows/guardians-stream-pipeline.yml:36`). For Central-time family phones the two agreed except around midnight.

---

## 5. Featured-game selection (`snapshotFromGames`, `guardiansSnapshot.ts:179-255`)

1. `todayStart` = phone-local midnight; `todayOfficial` and `yesterdayOfficial` = phone-local dates (`:185-193`).
2. Carried-over delay: a `Preview` game whose status contains `delay` and whose `officialDate` is yesterday (`:195-198`). A start delayed past local midnight kept its card until MLB marked the game Live.
3. Remaining games (`:199-211`): not completed, and Live, or starting today or later (known time: start ≥ local midnight; TBA: `officialDate ≥ today`), or a carried-over delay. Sorted by `compareGames`.
4. `compareGames` (`:164-177`): on the same official date, when either game had no valid time and the game numbers differed, order by `gameNumber` (MLB's placeholder could sort game 2 ahead of game 1); otherwise by start, then game number.
5. Today's recap (`:212-217`): the last completed game whose `officialDate` equals today.
6. Live candidates (`:220-228`): remaining games reported `Live` whose status is not canceled, postponed, or suspended. A suspended game MLB still reported as Live never took the card.
7. Featured (`:229-235`), first match wins:
   1. a Live candidate with today's official date;
   2. any Live candidate;
   3. a remaining game that is a carried-over delay or falls on the local day (TBA games by official date);
   4. today's recap.
8. Upcoming list (`:239-252`): remaining games minus the featured game, and minus any other entry with the featured `gamePk` that starts earlier (an interrupted first date of the same game). A later entry with the same `gamePk` (makeup or resumption) stayed in the schedule.
9. Completed games never appeared in the schedule. The recap card lasted through local midnight of the official date; a later game the same day replaced it; in a doubleheader the recap was the last completed game of that date.

---

## 6. Featured card (`FeaturedGameCard`, `GuardiansScreen.tsx:842-1132`)

### 6.1 Derived flags

| Flag | Rule | Source |
|---|---|---|
| `interruption` | `gameInterruption(game.status)` | `:870` |
| `isLive` | `abstractState === 'Live'` | `:871` |
| `isFinal` | `abstractState === 'Final'` and no interruption | `:872` |
| `blocksVideo` | `blocksPlayback(game)` | `:874` |
| `videoWindowOpen` | not blocked, and (Live, or (`timeValid` and now ≥ start − 15 min)). Live opened video even with `timeValid` false, because MLB kept `startTimeTBD` on doubleheader game 2 after it started | `:875-881`, `VIDEO_LEAD_TIME_MS = 15 * 60_000` at `:86` |
| `isTodayScheduled` | not Live, not interrupted, not Final | `:898` |

### 6.2 Visible elements, top to bottom

| Element | Text or rule | Source |
|---|---|---|
| Badge | interruption in capitals (`CANCELED`, `DELAYED`, `POSTPONED`, `SUSPENDED`); else `LIVE` with a red dot; else `WIN`/`LOSS`/`TIE`; else `TODAY <h:mm>` (phone locale); else `TODAY TIME TBA` | `:900-908`, `:924-942` |
| Matchup | today scheduled or Final: `Home vs <opponent>` / `Away v <opponent>`; otherwise `Guardians vs <opponent>` / `Guardians at <opponent>` | `:909-914` |
| Status line | shown when Live, interrupted, or Final: the board's inning text while Live without interruption, else MLB `detailedState` (`Final`, `Final/10`, `Delayed Start: Rain`) | `:893-897`, `:945-947` |
| Interruption box (`accessibilityRole="alert"`) | `The game has been canceled.` / `The game is delayed.` / `The game has been postponed.` / `The game has been suspended.` | `:829-840`, `:949-955` |
| Win chance bar | section 9 | `:957-963` |
| Live with board | park-style scoreboard (section 7) | `:965-970` |
| Live without board, or Final | score box: `Guardians` row first, then the opponent row | `:971-983` |
| Countdown | today scheduled with a valid time: `STARTS IN` label and `countdownLabel` | `:985-992` |
| `Time TBA` | today scheduled without a valid time | `:994-996` |
| `Video starts 15 minutes before game time.` | window closed, not blocked, valid time | `:998-1002` |
| Play / Listen pairs | one pair per matching stream once the window opened (section 11) | `:1004-1064` |
| Standalone stop | `Stop audio` when audio played for a stream not shown | `:1066-1082` |
| Audio error | `Audio could not start.` | `:1084-1088`, `:1517-1520` |
| Get video block | window open and no matching stream (section 12) | `:1090-1129` |

Card styles (`:1789-1804`): live card white with a 3dp `#E31937` border, radius 20, padding 20; today and recap cards 2dp navy `#0B2B4C` border; interrupted cards 3dp amber `#C97900` border. Live badge pink `#FFE7EA` with dark red `#B20D27` text.

### 6.3 Countdown

- `countdownLabel` (`:808-827`): seconds remaining rounded up; `0` → `Starting soon`; with hours `Hh MMm SSs`; with minutes `Mm SSs`; else `Ss`. Tabular digits, 30pt navy (`:1907-1914`).
- Tick (`:1267-1302`): no tick for Live, Final, missing state, or an invalid start time; 1,000 ms before a normal start; 30,000 ms for a delayed game (the countdown hid, but the video window still opened on the clock); none for other interruptions. Ticks applied only while the app was active, and the clock snapped forward when the app returned.
- Kickoff refresh (`:1304-1325`): when the featured `Preview` game with a valid time passed its start while the screen was watching (`countdownGameRef` was armed before the start), one forced snapshot ran instead of waiting up to ten minutes. Opening the screen after the start did not count.

---

## 7. Park-style scoreboard and 5 s live refresh

### 7.1 Board (`app/guardians/GuardiansScoreboard.tsx`)

- Shown only while the featured game was Live and had a board (`GuardiansScreen.tsx:965-970`). Hidden before first pitch and after Final.
- Columns: innings 1 through `max(9, highest inning)`, capped at `MAX_INNINGS = 30` (`:4,72-82`), then `R`, `H`, `E` (`:116-118`). Horizontally scrollable without indicators.
- Rows: away above home. Labels: `GUARDIANS` for the Guardians side; the opponent as the last word of its name in capitals (`Giants`) (`:6-12`). The Guardians label was red `#E31937` (`:227`); other labels `#F4F7FA`.
- Count bar: `AT BAT` jersey cell, `BALLS` lamps (3), `STRIKES` lamps (2), `OUTS` lamps (3), `P` (pitcher) jersey cell (`:156-176`). LED cells showed at most 2 characters.
- Colors: board `#07264A` with border `#F4F7FA` (`:186-187`), cell background `#05070A`, digits amber `#FFCF4A` (`:241`), lamps off `#1A1A1A`/`#3A3A3A`, on `#FFCF4A` (`:274-283`).
- `accessibilityLabel` summary: away runs, home runs, inning status, balls, strikes, outs, `at bat <number>` (`:85-95`).

### 7.2 Live poll (`GuardiansScreen.tsx:1327-1409`)

- Ran while the featured game was Live, or past its valid start while still `Preview` and not blocked (`awaitingFirstPitch`, `:1304-1309,1338`).
- Interval `LIVE_SCOREBOARD_INTERVAL_MS = 5_000` (`:82`), plus an immediate run and a run on `AppState` `active`. A tick was skipped while a request was in flight or the app was not active (`:1357-1359`).
- Skipped entirely in harness mode (`__DEV__ && EXPO_PUBLIC_GUARDIANS_TEST_URL`, `:1346-1348`).
- Each report applied only to the same `gameKey` and only if its request started after the last applied poll (`liveReportAtRef`, `:1364-1381`).
- A poll that reported `Final` triggered one forced snapshot per game (`finalRefreshGameRef`, `:1382-1388`), so the recap appeared within seconds.

### 7.3 Snapshot versus poll ordering

`snapshotWithPreservedScoreboard` (`:129-176`): when a snapshot arrived for the same `gameKey` and a live poll had been requested after the snapshot request, the poll's state, scores, board, and status stayed. Otherwise the snapshot won, but kept the previous board's batter and pitcher numbers when the schedule's linescore lacked them. `lastSnapshotAtRef` dropped a snapshot response older than the last applied one (`:1194-1204`).

---

## 8. Schedule list and refresh cadences

Schedule (`GuardiansScreen.tsx:1628-1667`):

- Section title `Upcoming games`.
- Row: date label, MLB status under it unless it was `Scheduled`, then `vs <opponent>` or `at <opponent>` (full MLB team name).
- Date label (`gameDateLabel`, `:462-482`): known time → short weekday, month, day, hour, minute in the phone's locale and zone; TBA → the official date formatted at `T12:00:00Z` in `timeZone: 'UTC'` followed by ` · Time TBA`.
- Row key `` `${gameKey(game)}:${game.gameDate}` `` because a postponed game and its makeup shared a `gamePk` (`:1637-1638`).
- With no featured game, the first row carried `NextGameWinChance` (`:1653-1655`).
- Empty: `No upcoming games are scheduled.`

| What | Cadence | Source |
|---|---|---|
| `load()` tick: streams every time; snapshot only when older than 10 min | 60,000 ms, only while the app was active | `REFRESH_INTERVAL_MS`, `:77`, `:1233-1251`; staleness check `:1176-1181` |
| Snapshot (schedule plus standings) | 10 min (`SNAPSHOT_REFRESH_INTERVAL_MS = 10 * 60_000`), pull-to-refresh, forced | `:81` |
| Foreground return | immediate `load()` | `:1242-1246` |
| Countdown | 1 s; 30 s when delayed; none when Live, Final, or TBA | `:83-85`, `:1267-1302` |
| Live board | 5 s | `:82` |
| Win chance | 10 min before the game, 30 s live | `app/guardians/espnWinChance.ts:23-24` |
| Get video poll | 5 s for up to 5 min | `app/guardians/guardiansGetVideo.ts:9-10` |

`load(showRefresh, sourceOptions, forceSnapshot)` (`:1162-1231`) ran the snapshot and the streams fetch with `Promise.allSettled`, so a failed MLB call still applied a newly published stream and a failed streams call still refreshed the games. The error card showed only for a rejected snapshot. The pull spinner cleared at the end of every load.

---

## 9. Win chance (ESPN)

`app/guardians/espnWinChance.ts`:

| Item | Value | Source |
|---|---|---|
| ESPN team id | `ESPN_GUARDIANS_TEAM_ID = '5'` | `:11` |
| Event lookup | `GET https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=<officialDate without dashes>` | `:14-15`, `:49-51` |
| Matching | events whose `competitions[0].competitors[].team.id` is `'5'`; the one whose `date` is closest to MLB `gameDate`, accepted only within 30 min (`START_TIME_TOLERANCE_MS`); each doubleheader game kept its own event | `:16`, `:44-76` |
| Cache | module-level `Map<gamePk, espnEventId>`; misses not cached | `:19`, `:74` |
| Pre-game | `GET https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/<id>/competitions/<id>/predictor`; `homeTeam`/`awayTeam` `statistics[name=gameProjection].value` | `:12-13`, `:84-106`, `:132-140` |
| Live | `.../probabilities?limit=1` to read `pageCount`, then `&page=<pageCount>` for the newest item; `homeWinPercentage`/`awayWinPercentage` × 100; empty live result fell back to the predictor | `:108-130`, `:143-164`, `:201-205` |
| Percent rule | finite, ≥ 0, capped at 100 | `:78-82` |
| Timeout | 6 s per request (`REQUEST_TIMEOUT_MS`) | `:22` |
| Refresh | 600,000 ms pre-game, 30,000 ms live; skipped while the app was not active | `:23-24`, `:194-214` |
| Shown when | `abstractState` `Preview` or `Live` and not postponed or canceled (suspended and Final hid through state) | `:176-179` |

Known gap: the event-id map was keyed by `gamePk` only, so a postponed game rescheduled during the same process could reuse the old date's ESPN event.

Bar (`app/guardians/WinChanceBar.tsx`): label `WIN CHANCE` (12pt, weight 900, letter spacing 1.3, `#697780`); `Us N%` left and `Them N%` right (17pt weight 900 navy, tabular); 8dp track `#D7DEE5` radius 4 with a navy `#0B2B4C` fill whose width was `team / (team + opponent)`; `accessibilityLabel="Win chance: Guardians N percent, <opponent> M percent"` (`:5-39`, styles `:58-97`). `NextGameWinChance` rendered the same bar under the first schedule row when nothing was featured (`:42-56`). A failed request never blocked the countdown, Play, or Get video.

---

## 10. Approved streams document

### 10.1 File and schema

- Root `guardians_streams.json` on `main`. Top level: `HOW_TO_GUIDE` (object with keys `EDIT_HERE`, `STEP_1`…`STEP_5`, `gameDates`, `gameNumbers`, `kind`, `url`, `allowInsecureHttp`, `trustedHosts`, `PHONE_CHECKS_FILE`, `WATCH_BUTTON_TIME`) and `streams` (array).
- `streams` at the snapshot held 8 items: the string `INACTIVE EXAMPLE. COPY THE COMPLETE OBJECT BELOW THIS LINE.`, a complete `direct` example dated `YYYY-MM-DD` (kept inactive by the invalid date), the string `REAL DEAL`, then five `web` entries for 2026-10-12, 2026-10-15, 2026-10-16, 2026-10-17, and 2026-10-18, each `gameNumbers: [1]`, `trustedHosts: []`, `allowInsecureHttp: false`. Entry URLs are not reproduced here.
- Entry fields, exactly six (`STREAM_FIELDS`, `app/guardians/guardiansSources.ts:26-33`):

| Field | Type | Rule |
|---|---|---|
| `gameDates` | string[] | each a real `YYYY-MM-DD` (round-trips through `Date`), 1–200 unique values |
| `gameNumbers` | number[] | integers 1–9, at least one |
| `kind` | `direct` \| `youtube` \| `web` | — |
| `url` | string | ≤ 2048 chars |
| `allowInsecureHttp` | boolean | `http:` accepted only when `true` |
| `trustedHosts` | string[] | `web` only (must be empty otherwise), ≤ 10, each `[a-z0-9.-]+` after trim and lower-case |

Any key outside these six rejected the entry (`:203`). Wrong types rejected it (`:202-217`).

### 10.2 Validation (`playableGuardiansStream`, `:103-192`)

- `youtube`: HTTPS only; host (after dropping a leading `www.`) `youtu.be`, `youtube.com`, `m.youtube.com`, or `youtube-nocookie.com`; id from `/watch?v=`, `/live/<id>`, `/embed/<id>`, or the `youtu.be` path, exactly 11 `[A-Za-z0-9_-]` (`:46-80`). Rewritten to `playbackUrl = https://www.youtube-nocookie.com/embed/<id>?autoplay=1&playsinline=1`, `allowedNavigationHosts = ['www.youtube-nocookie.com']` (`:123-136`).
- `direct`: protocol rule only; `allowedNavigationHosts = []` (`:147-155`).
- `web`: protocol rule; provider rule below; `allowedNavigationHosts` = the URL's own host plus `trustedHosts`, de-duplicated (`:157-186`).
- Provider rule (`isValidGoozWebUrl`, `:82-101`): when the host was `GOOZ_HOST` (an in-code constant naming one player host) or a subdomain of it on a label boundary, the path had to contain `/new-stream-embed/<segment>` with at least one digit in the segment. Any other host passed this check unchanged.

### 10.3 Document parse and matching

- `guardiansStreamsFromDocument` (`:222-255`): required an object with a `streams` array; skipped non-object items (the guide strings); kept the last 200 objects (`MAX_REMOTE_STREAMS`, newest entries win because the pipeline appended); de-duplicated on `dates:numbers:kind:playbackUrl`.
- `authorizedStreamsForGame` (`:257-266`): entry matched when `gameDates` included the featured `officialDate` and `gameNumbers` included its `gameNumber`. There was no team or league key; the file name was the team key.

---

## 11. Streams fetch chain and cache

Constants (`GuardiansScreen.tsx:87,94-103`):

| Constant | Value |
|---|---|
| `REMOTE_GUARDIANS_SOURCES_URL` | `https://raw.githubusercontent.com/Danner36/Danner_App/main/guardians_streams.json` |
| `SOURCES_STORAGE_KEY` | `danner.guardians.sources.v2` |
| `SOURCES_FETCH_TIMEOUT_MS` | 8,000, per attempt |
| `GUARDIANS_SOURCES_URL` | `EXPO_PUBLIC_GUARDIANS_SOURCES_URL` in `__DEV__` when set, else the remote URL |

`fetchGuardiansSources(options)` (`:393-460`):

- `persistRemote` = the production URL was in use (`:396-397`). `allowStaleCache` defaulted to true when `persistRemote` (`:398`). `preferLive` = `options.preferLive === true` or `options.allowStaleCache === false` (`:399`).
- Every request appended `refresh=<ms>` and sent `cache: 'no-store'`, `Accept: application/json`, `Cache-Control: no-cache`, `Pragma: no-cache` (`:303-306`, `:328-345`). Each attempt had its own 8 s `AbortController`, so a slow first source could not abort the fallbacks (`:347-362`).
- Every successful parse wrote the raw document text to AsyncStorage when `persistRemote` (`:410-414`).

Order of attempts:

1. Worker `GET {EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL}/streams` (no `module` parameter; the Worker defaulted to Guardians), when the Worker URL was set and (`preferLive` or `persistRemote`) (`:420-427`; `liveStreamsUrl`, `app/guardians/guardiansGetVideo.ts:17-22`). The Worker read `guardians_streams.json` through the GitHub contents API on `main` with an ETag cache (`workers/guardians-get-video/src/index.js:177-215`).
2. Only for `preferLive` loads in production (Get video): the latest commit that touched the file, `GET https://api.github.com/repos/Danner36/Danner_App/commits?path=guardians_streams.json&per_page=1` (headers `Accept: application/vnd.github+json`, `User-Agent: danner-apps`), then `https://raw.githubusercontent.com/Danner36/Danner_App/<sha>/guardians_streams.json` (`:308-326`, `:428-440`). One lookup per Get video session through `CommitShaLookup { done, sha }` (`:364-391`), and only after the Worker failed, because the unauthenticated commits API allowed 60 calls per hour per address.
3. Raw `main` (or the dev override) (`:441-445`).
4. On total failure and `allowStaleCache`: parse the cached document from `danner.guardians.sources.v2` (`:447-457`). Otherwise an empty list.

Sticky rule (`:1205-1219`): when a new list had no match for the featured game but the current list did, the current list stayed. A fetch that missed never wiped a URL the phone already had.

---

## 12. Get video

Availability (`app/guardians/guardiansGetVideo.ts:7-15`): both build-time values `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` and `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` present. The button appeared only inside the open video window with no matching stream (`GuardiansScreen.tsx:1090-1129`).

Request (`requestGetVideo`, `:29-64`): `POST {base}/get-video` (trailing slash trimmed), headers `Accept` and `Content-Type: application/json`, body `{ pin }` with no `module`, 20 s timeout (`REQUEST_TIMEOUT_MS`), and no caller abort signal. `401` threw `Get video is not authorized.`; `429` returned normally so polling continued; other non-OK threw `Get video could not start.` The code comment said 429 meant a run was already in progress; the Worker actually returned 429 for its per-address rate limit, before the PIN check (`workers/guardians-get-video/src/index.js:306-310`).

Poll (`pollForStream`, `:83-113`): fetch, match the featured identity, else wait `min(5,000 ms, remaining)` until 300,000 ms passed or the signal aborted.

Screen orchestration (`handleGetVideo`, `GuardiansScreen.tsx:1466-1514`):

1. Ignore when nothing was featured or a session was `finding`. Abort any earlier session.
2. `sourceOptions = { allowStaleCache: false, commitSha: { done: false }, preferLive: true }` (`:1476-1480`), status `finding`.
3. `requestGetVideo()`, then `pollForStream(game, () => fetchGuardiansSources(sourceOptions), { signal })`.
4. On a match, append it unless a match already existed. Then always `load(true, sourceOptions)`. Final status `idle` on success, `failed` otherwise; a thrown error also set `failed` unless aborted.
5. Aborted when the featured `gameKey` changed (`:1428-1435`), on a new press, and on unmount (`:1444`). A matching stream arriving by any path reset the status to `idle` (`:1422-1426`).

Card text: button `Get video` (navy `#0B2B4C`, min height 52, min width 180, radius 13; busy `#41556B` with a white spinner, label `Getting video`); hint `Finds the approved Guardians video for this game`; status line `Getting video. This could take a minute.` / `Could not find video.` (`accessibilityRole="alert"`) / `Video is not ready yet. The app checks again automatically.` (`:1090-1129`, styles `:1965-1977`).

Server side: the Worker resolved a missing or empty `module` to `guardians` (`workers/guardians-get-video/src/index.js:147-155`), rate-limited 3 requests per 10 min per IPv4 address or IPv6 /64 (`:1-3`, `:79-130`), compared the PIN in constant time against Worker secret `FAMILY_PIN` (`:132-145`), and sent GitHub `repository_dispatch` with `event_type: 'guardians-get-video'` and `client_payload: { module: 'guardians', source: 'phone' }` using Worker secret `GITHUB_TOKEN` (`:217-245`). `.github/workflows/guardians-stream-pipeline.yml` listened for `types: [guardians-get-video]` (`:16-17`), ran with `TZ: America/New_York` (`:36`), read repo secret `GUARDIANS_STREAM_PIPELINE_CONFIG` (`:51`), set `PIPELINE_MODULE: guardians` (`:64,97`), allowed one running plus one queued run (`concurrency.group: guardians-stream-pipeline`, `:25-27`), and timed out after 15 min (`:33`). The pipeline committed a new `web` entry to `guardians_streams.json` with subject `guardians: update stream for <date> game <n>`.

---

## 13. Playback

### 13.1 Play modal (`StreamPlayer`, `GuardiansScreen.tsx:703-799`)

- Full-screen slide `Modal`, black background, safe-area padding. Header (white, min height 58): `Close` (`accessibilityLabel="Close video"`), title `Guardians game`, and on the right a Cast control for `direct`, a `TV` control for `web`, or a spacer for `youtube` (`:739-775`).
- Closing stopped the HLS relay (`stopHlsProxy`) (`:714-718`). A TV error line rendered under the header with `accessibilityRole="alert"` (`:776-780`).
- `PlayerKeepAwake` (`useKeepAwake`) mounted only while a stream was open; the dashboards themselves let the screen sleep (`:695-700`, `:782`).
- Memoized so the one-second countdown did not re-render an open player.
- Choosing Play stopped Listen; choosing Listen closed the player (`:1609-1622`).

Play buttons: 68dp red `#E31937` circles with `▶`, label `Play video` or `Play video N`, hint `Plays the approved video inside the app` (`:1013-1028`, style `:1936-1943`).

### 13.2 `direct`

`DirectStreamPlayer` (`:506-526`): `expo-video` `useVideoPlayer({ uri, useCaching: false })`, auto-play, `VideoView` with native controls, `contentFit="contain"`, fullscreen enabled. No page JavaScript ran. On iPhone the system controls offered AirPlay.

### 13.3 `youtube`

`youtubePlayerHtml` (`:528-550`): local HTML with CSP `default-src 'none'; frame-src https://www.youtube-nocookie.com; style-src 'unsafe-inline'` and one iframe (`allow="autoplay; encrypted-media; fullscreen; picture-in-picture"`, `allowfullscreen`, `referrerpolicy="strict-origin-when-cross-origin"`, `title="Guardians video"`). Loaded as `{ baseUrl: 'https://danner.app/', html }` (`YOUTUBE_WRAPPER_URL`, `:93`); only that exact document was allowed as the wrapper and the host was never a navigation or popup target. YouTube had no Listen and no TV send, and its page got no injection and kept the system `userAgent`.

### 13.4 `web`: isolated WebView player rules (`IsolatedWebStreamPlayer`, `:552-693`)

| Prop or behavior | Value | Reason |
|---|---|---|
| `allowFileAccess`, `allowFileAccessFromFileURLs`, `allowUniversalAccessFromFileURLs` | `false` | No local file access |
| `cacheEnabled` | `false` | No page cache |
| `geolocationEnabled` | `false` | Pages never saw location |
| `incognito` | `Platform.OS === 'ios'` | Android implemented incognito by clearing every WebView cookie in the app, which signed TV Location out of Google (`:629-631`) |
| `sharedCookiesEnabled`, `thirdPartyCookiesEnabled` | `false` | No cookie sharing with the system or third parties |
| `onFileDownload` | no-op | Downloads swallowed |
| `mixedContentMode` | `always` only with `allowInsecureHttp`, else `never` | Transport policy per entry |
| `originWhitelist` | `['*']` | The navigation gate decided, not the whitelist |
| `onShouldStartLoadWithRequest` | `allowNavigation(url)`: `about:blank`, or host in `allowedNavigationHosts` with `https:` (or `http:` with the opt-in); for YouTube also the exact wrapper URL | Exact trusted hosts only (`:484-504`, `:576-582`) |
| `onLoadStart`, `onNavigationStateChange` | `returnToApprovedSource`: an `http(s)` URL that was not allowed → `stopLoading()`, clear any promoted popup, remount with a new `key` | Android answered `onShouldStartLoadWithRequest` on its own after 250 ms and never asked for POST navigations (`:583-593`) |
| `setSupportMultipleWindows` | `true` with `javaScriptCanOpenWindowsAutomatically={false}` | New-window requests reached `onOpenWindow` |
| `onOpenWindow` | promote the target into the same player only when it was not `about:blank` and passed the trusted-host and transport rule; every other popup was discarded without loading | `:569-575`, `:651-656` |
| `allowsInlineMediaPlayback`, `allowsFullscreenVideo`, `mediaPlaybackRequiresUserAction={false}` | on | Autoplay inline |
| `allowsAirPlayForMediaPlayback` | `web` only | iPhone AirPlay |
| `injectedJavaScriptBeforeContentLoaded`, `injectedJavaScript` | `web` only: `WEB_AIRPLAY_INJECTION` plus `webMediaDiscoveryInjection(nonce)` | `:600-602`, `:632-633` |
| `userAgent` | `web` only: `webPlayerUserAgent()` | `:690` |
| Loading view | red spinner and `Opening the game…` | `:669-674` |

`userAgent` rule (`app/guardians/webPlayerUserAgent.ts:12-17`): on iPhone the web player reported `Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36`; on Android it stayed default. Approved pages branched on the `userAgent` and served iPhone a Media Source Extensions player that AirPlay could not route; the Android branch used native HLS, which AirPlay could carry.

AirPlay injection (`app/guardians/webAirPlayInjection.ts`): every `video` and `audio` element, including ones added later (a `MutationObserver` on the document), got `disableRemotePlayback = false` and `x-webkit-airplay="allow"`.

Media discovery (`app/guardians/webMediaDiscoveryInjection.ts`):

- A fresh 16-byte hex nonce per document (`newDiscoveryNonce`, `:80-97`), regenerated when the stream URL or the promoted popup changed (`GuardiansScreen.tsx:596-599`). The nonce lived in the script closure; Android opened the message bridge to every frame, so a message without it was ignored.
- The page script hooked the player and network to report `{ type: 'media-url', nonce, url, contentType, source: 'player' | 'network' }` (`:108-380`).
- Accepted only when the nonce matched, the content type was exactly `application/x-mpegURL`, `application/dash+xml`, or `video/mp4`, and the URL met the entry's transport policy (`castableDiscoveredContentType`, `:13-40`; `parseDiscoveredMediaMessage`, `:387-424`). The path did not need a media extension.
- `preferDiscoveredMedia` kept the URL the player itself named; network-only variants and audio renditions that appeared later were ignored; a later player HLS or DASH URL replaced a player MP4 (`:50-78`).
- `pagePlaybackHoldScript(held)` called `window.__dannerSetPlaybackHeld` so the on-phone page paused and stopped loading media while a Cast receiver had the relay (`:426-431`; applied on hold changes and on every `onLoadEnd`, `GuardiansScreen.tsx:608-615,660-667`).

### 13.5 Listen (`app/guardians/GuardiansAudioPlayer.tsx`)

- Only for `direct` streams (`♪` button, labels `Listen to audio` / `Listen to audio N`, hint `Plays game audio without showing video`; while playing `■`, label `Stop audio`, navy background) (`GuardiansScreen.tsx:1029-1059`).
- A hidden 1×1 `VideoView` with `expo-video`: `contentType` `hls` for `.m3u8`, `dash` for `.mpd`, else `auto`; `metadata { artist: 'Cleveland Guardians', title: 'Guardians game' }`; `useCaching: false`; `audioMixingMode = 'doNotMix'`; `keepScreenOnWhilePlaying = false`; `showNowPlayingNotification = true`; `staysActiveInBackground = true` (`:14-47`; props at `GuardiansScreen.tsx:1672-1679`). Background audio relied on `UIBackgroundModes: [audio]` and `expo-video` `supportsBackgroundPlayback: true` (`app/app.json:27-29,89-94`).
- A player `error` status set `Audio could not start.`
- Audio stopped when the featured game changed (`:1428-1435`), when playback became blocked (Final, canceled, postponed, suspended; `:1437-1442`), when Play started, and when the screen unmounted.

### 13.6 Cast for `direct` (`app/guardians/GuardiansCastButton.tsx`)

- `react-native-google-cast` `CastButton` 44×44, tint navy, `accessibilityLabel="Cast"` (`:239-256`). Receiver: the default media receiver `CC1AD845` configured in `app/app.json:95-102`.
- Content type by path (`castContentTypeForUrl`, `:24-36`): `.m3u8` → `application/x-mpegURL`, `.mp4` → `video/mp4`, `.mpd` → `application/dash+xml`, else `video/*`. `streamType` was always `buffered` for direct URLs, because the family's TVs sat on the receiver splash screen when given `live` for those files (`app/guardians/castStreamType.ts:1-7`).
- Load (`:142-233`): keyed by session id, URL, content type, stream type, segment hint, and reload token; 500 ms after a session client appeared; skipped (and treated as active) when the receiver already reported this URL in a playing, buffering, loading, or paused state, unless a reload was forced; `client.loadMedia({ autoplay: true, mediaInfo: { contentType, contentUrl, hlsSegmentFormat?, hlsVideoSegmentFormat?, streamType } })`. Failure showed `The TV could not start the video.`
- Status listener (`:108-140`): logged `[DannerCast] playerState …`; `playing`, `buffering`, `loading`, `paused` held the phone page; `idle` released it; `idle` with `idleReason` `error` for this URL showed `The TV could not play the video.` (or the relay message below).

### 13.7 TV send for `web` and the live HLS relay

`GuardiansTvRouteButton` (`app/guardians/GuardiansTvRouteButton.tsx`) rendered a `TV` text button (`accessibilityLabel="Send to TV"`, navy 18pt weight 800) over an almost invisible (opacity 0.02) Cast button that carried the relay URL (`:351-390`). It hid (spacer) when the native relay module was unavailable.

First press (`:303-349`):

1. Clear any error. Use the page-reported media, or wait up to 6,000 ms in 250 ms steps for the page to report one (`:61-80`, `:325-327`). None → `This page did not offer a video to send.`
2. Map the content type to a relay kind (`hls`, `dash`, `mp4`); anything else → `This page's video can't be sent to the TV.` (`:187-191`).
3. Android 13+ asked for `POST_NOTIFICATIONS` once per relay start; a denial did not block the send (`:41-59`).
4. `startLiveRelay(source.url, pageReferer(pageUrl), kind)`; the `Referer` was the player page origin with a trailing slash, because the provider answered its playlists only for its own page (`:90-98`, `:201`).
5. Relay failure messages (`tvRelayFailureMessage`, `webMediaDiscoveryInjection.ts:520-531`): `Connect this phone to the same Wi-Fi as the TV.` (no network), `The game stream is not answering right now. Try again in a minute.` (source unavailable), `This page's video can't be sent to the TV.` (unsupported), `Could not send to the TV.` (other).
6. Open the Cast dialog when no receiver was connected; a connected receiver loaded the relay URL directly (`showCastDialogOnTvPress`, `:438-443`).

The relay was loaded with `streamType` `live` unless the playlist ended (`castStreamTypeForRelay`, `castStreamType.ts:9-15`) and with HLS segment hints only when the relay had probed the format (`ts` → MPEG-2 TS, `fmp4` → fMP4).

Later presses (`:247-262`): if the relay still served the same session and the page had not switched streams, reload the receiver unless it was already playing or paused (`tvPressForcesReload`, `:509-515`), then reopen the Cast dialog so the session could be stopped or the volume changed; otherwise start a new relay, whose new URL made a connected receiver reload. A receiver playback error showed `The TV could not play the stream. Press TV to try again.`

Lifecycle (`:138-180`, `:269-301`): a page change bumped a generation counter so stale presses did nothing; returning to the foreground restarted a relay that stopped while the phone was locked (iPhone suspended the listener) when a receiver was still connected, else dropped it; ending the Cast session stopped the relay (only if it was still this control's session token); closing the player stopped it.

Relay module (`app/modules/danner-live-hls/README.md`, `src/liveRelay.ts`, `src/relayVariant.ts`):

- Bound to the phone's Wi-Fi or Ethernet IPv4 address on a port in 8108–8127; `startLiveRelay` accepted only a private LAN origin.
- Each start created a random 32-hex token and signing key; every route lived under `/<token>/`; old sessions answered 404.
- HLS: `/<token>/live.m3u8` re-resolved the source on each read; from a master playlist it forwarded the highest video variant at or under `RELAY_MAX_BANDWIDTH = 3_500_000` bps, else the lowest video variant, skipping audio-only renditions (`relayVariant.ts:12-43`); separate audio became a two-entry master (`video.m3u8`, `audio.m3u8?g=<n>`); every segment and `URI="…"` was rewritten to `/<token>/s?u=<base64url>&k=<signature>`; `segmentFormat` `fmp4` when `#EXT-X-MAP` or CMAF names appeared, else `ts`; `live` false only with `#EXT-X-ENDLIST`.
- DASH: `/<token>/live.mpd` re-fetched, removed `<Location>`, and pointed `BaseURL`s and absolute templates at signed `/<token>/d/<dir>/<signature>/…`.
- MP4: `/<token>/media.mp4` passed through with `Range`.
- Only URLs signed this session (HMAC-SHA256, first 16 bytes) were fetched; others answered 403. Playlists and manifests were capped at 4 MiB and had to start with `#EXTM3U` or `<MPD`. Media bytes passed through unchanged with permissive CORS.
- Android: a `connectedDevice` foreground service with a Stop action, a partial wake lock, a Wi-Fi lock, and live-edge segment prefetch shared with the receiver's requests. iPhone: no background service; the listener stopped when suspended.
- The earlier screen-capture converter was archived unbuilt under `reference/screen-capture-hls/`.

---

## 14. Colors and strings that named the team

| Item | Value | Source |
|---|---|---|
| Accent red | `#E31937` (refresh control, spinners, primary button, live card border, live dot, Play buttons, board label) | `GuardiansScreen.tsx:671,1531,1534,1576,1777,1791,1822,1938`; `GuardiansScoreboard.tsx:227` |
| Dark red | `#B20D27` | `GuardiansScreen.tsx:1828,2015` |
| Badge pink | `#FFE7EA` | `:1808` |
| Navy | `#0B2B4C` (header text, hero title, today card, matchup and score text, Listen-active, Get video, win-chance fill, Cast tint, TV text) | `:1708,1729,1798,1945,1967`; `WinChanceBar.tsx:66,84`; `GuardiansCastButton.tsx:245,253`; `GuardiansTvRouteButton.tsx:400` |
| Board | `#07264A` with amber `#FFCF4A` digits | `GuardiansScoreboard.tsx:186,241,282` |
| Team strings | `Guardians` (hero, matchup, score row, WinChanceBar `teamName`), `Cleveland Guardians` (hero label, audio artist), `Guardians game` (player title, audio title), `Guardians video` (iframe title), `GUARDIANS` (board) | `GuardiansScreen.tsx:546,753,914,961,974,1094,1556,1562,1674,1677`; `GuardiansScoreboard.tsx:8` |

The whole `StyleSheet` (`GuardiansScreen.tsx:1684-2091`) was byte-identical to the Patriots screen's.

---

## 15. Test harness (`tests/guardians/`)

| Command (from `app/`) | Script | What it did |
|---|---|---|
| `test:guardians:android` / `:ready` / `:delayed` / `:final` / `:live` | `run-android.mjs <scenario>` (default `today`) | Started `server.mjs`, waited on `GET /health`, built with `expo run:android --no-bundler`, then ran Metro `expo start --dev-client --android --port 8081`, both with `EXPO_PUBLIC_GUARDIANS_TEST_URL=http://10.0.2.2:8108/guardians?scenario=<s>` and `EXPO_PUBLIC_GUARDIANS_SOURCES_URL=http://10.0.2.2:8108/guardians-sources.json` (`:10-15,48-78`) |
| `test:guardians:server` | `server.mjs` | Fixture server on `GUARDIANS_HARNESS_PORT ?? 8108` (`:4`) |
| `test:guardians:snapshot` | `run-snapshot.mjs` (605 lines) | Pure Node with type stripping; imported `guardiansSnapshot.ts`, `guardiansSources.ts`, `mlbLinescore.ts` directly; pinned `TZ=America/Chicago` (`:15-21`) |
| `test:guardians:cast-discovery` | `run-cast-discovery.mjs` (775 lines) | Page-reported Cast URL gate, nonce, MP4-then-HLS upgrade through the real injection, page pause while a receiver held the relay, TV press dialog rule, relay kinds and failure messages, relay origin validation, live stream type, variant selection |
| `test:guardians:android:cast-web` | `run-cast-web.mjs` (471 lines) | On a device: opened the native-HLS fixture page, tapped `TV`, asserted the receiver loaded only the phone's `/<token>/live.m3u8` and played; needed a real Cast receiver on the LAN; ports 8109 then 8108 (`:265`) |
| `test:guardians:android:shell-fix` | `run-shell-fix.mjs` (479 lines) | Package had no location permission; Back closed Play then returned to the hub; TV send proceeded with notifications denied |
| `test:guardians:android:get-video` | `run-get-video.mjs` (490 lines) | In-file Worker mock on port 8111 with a fixed debug PIN (`:28-29`); env `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN`, `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL`, `EXPO_PUBLIC_GUARDIANS_SOURCES_URL`, `EXPO_PUBLIC_GUARDIANS_TEST_URL` (`:330-333`); tapped hub `content-desc="Cleveland Guardians"` (`:425`); live card without a URL → Get video → delayed publish → Play in the same session |
| (not in `package.json`) | `prove-get-video.mjs` (167 lines) | Ad hoc proof on port 8110 against live GitHub raw and commits API, with leftover debug logging |
| (helper) | `extract-uidump.mjs` | uiautomator XML label helper |

Fixture server routes (`tests/guardians/server.mjs`): `GET /health` (`:116`); `GET /guardians?scenario=today|ready|delayed|live|final` returning a normalized app snapshot (not MLB JSON) with `wins`, `losses`, `liveGame`, `upcomingGames` (`:122-136`; `today` started in 45 min, `ready` in 10 min, `delayed` used status `Delayed Start`, `:93-102`); `GET /guardians-sources.json` assigning every official date the scenario could produce (Eastern dates around now plus the host-local date) and rewriting `10.0.2.2:8108` to the request host (`:146-170`, `:34-47`); `/http-media/` proxy limited to one public HLS example path (`:173-190`); `/native-hls-player` (`:221`); `/capture-pattern` kept for the archived converter (`:253`). Fixture `live-game.fixture.json`: six streams (`direct` ×2, `youtube`, `web` ×3) and a baseball board.

Snapshot test coverage (`run-snapshot.mjs`): live and later-today beat the recap; today's Final featured; recap ended after the local official date; Time TBA game 2 did not take the card from game 1 and a TBA game on the previous local day stayed today's game (`:234-276`); postponed makeups stayed in the schedule (`:277-321`); a resumed game's first date left the schedule (`:322-349`); suspended-but-Live did not outrank tonight (`:350-369`); today's Live won over an older Live (`:370-388`); delayed Live stayed the pick (`:389-399`); a delay past midnight kept the card, gone two days later (`:400-425`); Warmup stayed pre-game (`:426-452`); poll kept MLB's detailed state (`:453-506`); Final from the poll reached the card (`:507-515`); poll picked the featured date's entry (`:516-548`); an entry without game state was ignored (`:549-569`); guide strings skipped and newest 200 kept (`:570-604`).

No CI workflow ran these.

---

## 16. Rules and docs that pinned this module

- `AI_Framework/AI_RULES.md:42` (preserve the Guardians module), `:50` (dashboard rules), `:51` (streams, fetch order, Get video, playback, relay, isolation), `:52` (fixtures under `tests/guardians/`, ports 8108 and 8111, `EXPO_PUBLIC_GUARDIANS_TEST_URL`), `:57` (win chance; "Each module keeps its own copy").
- `Docs/Domain/Guardians.md` (83 lines), `Docs/Domain/Playback.md`, `app/guardians/README.md`, `tests/guardians/README.md`, `Docs/Anchor/Vision.md:10-12`.
- Validation rows `Docs/Production/Validation.md:25,27-47,59-60,80,94`.

---

## 17. Permalinks

- MLB snapshot fetch: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/GuardiansScreen.tsx#L216-L301
- Sources fetch chain: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/GuardiansScreen.tsx#L303-L460
- Isolated player: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/GuardiansScreen.tsx#L484-L693
- Play modal: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/GuardiansScreen.tsx#L703-L799
- Featured card: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/GuardiansScreen.tsx#L842-L1132
- Screen orchestration: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/GuardiansScreen.tsx#L1134-L1682
- Game model and featured selection: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/guardiansSnapshot.ts#L1-L343
- Linescore and live poll: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/mlbLinescore.ts#L1-L426
- Scoreboard: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/GuardiansScoreboard.tsx#L1-L285
- Win chance: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/espnWinChance.ts#L1-L222
- Streams schema: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/guardiansSources.ts#L1-L266
- Get video client: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/guardiansGetVideo.ts#L1-L113
- Cast button: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/GuardiansCastButton.tsx#L1-L256
- TV send: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/GuardiansTvRouteButton.tsx#L1-L422
- Media discovery injection: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/webMediaDiscoveryInjection.ts#L1-L531
- Relay README: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/modules/danner-live-hls/README.md#L1-L56
- Worker routes: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/workers/guardians-get-video/src/index.js#L247-L334
- Domain doc: https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/Docs/Domain/Guardians.md#L1-L83
