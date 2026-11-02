Status: ARCHIVED
Snapshot: 823d2be (2026-10-31)

# Streams Files (Fixed Teams)

This is the record of the three root streams files at commit `823d2be562d252c9f3b0da305275adc6d8498f55` (`main`, 2026-10-31): `guardians_streams.json`, `patriots_streams.json`, and `cyclones_streams.json`. Each file was the approved video list for one fixed module. The pipeline wrote them, the owner could hand-edit them, the shared Worker served them, and the phone read them. The provider player host is named only by its identifier `GOOZ_HOST`; embed URLs appear as `https://<GOOZ_HOST>/new-stream-embed/<id>?ad=111`.

Every `path:line` below is at the pinned commit.

Permalink base: `https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/`

| Item | Permalink |
|---|---|
| `guardians_streams.json` | [guardians_streams.json:1-94](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/guardians_streams.json#L1-L94) |
| `patriots_streams.json` | [patriots_streams.json:1-45](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/patriots_streams.json#L1-L45) |
| `cyclones_streams.json` | [cyclones_streams.json:1-61](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/cyclones_streams.json#L1-L61) |
| Phone parser, Guardians and Patriots | [app/guardians/guardiansSources.ts:1-266](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/guardiansSources.ts#L1-L266) |
| Phone parser, Cyclones | [app/cyclones/cyclonesSources.ts:1-281](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/cyclones/cyclonesSources.ts#L1-L281) |
| Phone fetch chain, Guardians | [app/guardians/GuardiansScreen.tsx:303-460](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/guardians/GuardiansScreen.tsx#L303-L460) |
| Phone fetch chain, Patriots | [app/patriots/PatriotsScreen.tsx:237-362](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/patriots/PatriotsScreen.tsx#L237-L362) |
| Phone fetch chain, Cyclones | [app/cyclones/CyclonesScreen.tsx:311-457](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/cyclones/CyclonesScreen.tsx#L311-L457) |
| Owner editing instructions | [Docs/Domain/Guardians.md:20-57](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/Docs/Domain/Guardians.md#L20-L57) |

---

## 1. The three files

| File | Module | Size at snapshot | Object entries (example + live) | Written by | Phone module | Official-date rule |
|---|---|---|---|---|---|---|
| `guardians_streams.json` | Guardians | 2781 bytes, 94 lines | 1 + 5 | `guardians-stream-pipeline.yml` | `app/guardians/` | MLB `officialDate` |
| `patriots_streams.json` | Patriots | 1650 bytes, 45 lines | 1 + 1 | `patriots-stream-pipeline.yml` | `app/patriots/` | America/New_York date of kickoff |
| `cyclones_streams.json` | Cyclones | 2164 bytes, 61 lines | 1 + 2 | `cyclones-stream-pipeline.yml` | `app/cyclones/` | America/Chicago date of kickoff; New York date of ESPN's placeholder when the time was TBA |

All three lived at the repository root on `main` in a public repository. The file name was the team key: no entry carried a team or league field.

---

## 2. Document shape

```text
{
  "HOW_TO_GUIDE": { ...field help, never shown on the phone... },
  "streams": [
    "INACTIVE EXAMPLE. COPY THE COMPLETE OBJECT BELOW THIS LINE.",
    { ...inactive example with gameDates ["YYYY-MM-DD"]... },
    "REAL DEAL",                      (Guardians file only)
    { ...production entry... },
    ...
  ]
}
```

- Root keys: `HOW_TO_GUIDE` (object) and `streams` (array). The phone and the pipeline required only `streams` to be an array (`guardiansSources.ts:222-233`; `P/lib/streamsDocument.mjs:67-73`).
- `streams` mixed marker strings and entry objects. Strings were skipped by every reader.
- The inactive example stayed inactive because `YYYY-MM-DD` is not a valid date, so every validator rejected it and pruning never removed it.
- The pipeline serialized with two-space indentation and a trailing newline (`streamsDocument.mjs:79-81`).

---

## 3. Entry schema

Six fields for Guardians and Patriots; the same six plus a required `sport` for Cyclones.

| Field | Type | Phone rule | Notes |
|---|---|---|---|
| `gameDates` | array of strings | 1 to 200 unique, each a real `YYYY-MM-DD` date | One URL could cover several dates |
| `gameNumbers` | array of numbers | at least 1, unique integers 1 to 9 | `[1]` normally; Guardians doubleheaders used `[1]`, `[2]`, or `[1, 2]` |
| `kind` | string | `direct`, `web`, or `youtube` | |
| `url` | string | at most 2048 characters | |
| `allowInsecureHttp` | boolean | required | `true` only for an `http://` source |
| `trustedHosts` | array of strings | `[]` unless `kind` is `web`; at most 10; each `^[a-z0-9.-]+$` after trim and lower-case | Exact hostnames for top-level redirects of a web player |
| `sport` | string (Cyclones only) | `football`, `mens-basketball`, or `womens-basketball`; required in `cyclones_streams.json` and rejected in the other two | |

Kind rules on the phone (`guardiansSources.ts:103-192`; `cyclonesSources.ts:118-205`):

| Kind | Rule | Playback URL |
|---|---|---|
| `youtube` | `https:` only; host `youtube.com`, `m.youtube.com`, `youtube-nocookie.com`, or `youtu.be` (leading `www.` ignored); `/watch?v=`, `/live/<id>`, `/embed/<id>`, or `youtu.be/<id>`; id `^[A-Za-z0-9_-]{11}$` | `https://www.youtube-nocookie.com/embed/<id>?autoplay=1&playsinline=1`, navigation limited to `www.youtube-nocookie.com` |
| `direct` | `https:`, or `http:` with `allowInsecureHttp: true` | The URL itself, no navigation hosts |
| `web` | Same protocol rule; at most 10 `trustedHosts`; a URL on `GOOZ_HOST` or a subdomain had to have `/new-stream-embed/<segment containing a digit>`; any other host passed that part | The URL; navigation allowed to the URL host plus `trustedHosts` |

Strictness: `streamFromUnknown` rejected any entry with a key outside the allowed set (`guardiansSources.ts:26-33`, `202-203`; `cyclonesSources.ts:41-49`, `215-217`). A Cyclones-style entry with `sport` was ignored by the Guardians and Patriots parser, and an entry without `sport` was ignored by the Cyclones parser.

---

## 4. `HOW_TO_GUIDE` text

### 4.1 `guardians_streams.json` (lines 2-17)

```json
"HOW_TO_GUIDE": {
  "EDIT_HERE": "streams",
  "STEP_1": "Copy the complete object below INACTIVE EXAMPLE.",
  "STEP_2": "Paste the copy after the example object.",
  "STEP_3": "Put a comma between the example object and the pasted object.",
  "STEP_4": "Replace every value in the pasted object.",
  "STEP_5": "Commit and push guardians_streams.json to main.",
  "gameDates": "Game dates for this URL. Format: YYYY-MM-DD. One date: [\"2026-08-20\"]. Reused URL: [\"2026-08-20\", \"2026-08-21\"].",
  "gameNumbers": "Normal game: [1]. Doubleheader first game: [1]. Doubleheader second game: [2]. Both games: [1, 2].",
  "kind": "direct for .m3u8, .mp4, or .mpd. youtube for a YouTube URL. web for a webpage containing a player.",
  "url": "Approved media URL or player-page URL.",
  "allowInsecureHttp": "false for https://. true for http://.",
  "trustedHosts": "web redirects only. Hostnames only. No https://. No paths. Use [] for direct, youtube, or no redirect hosts.",
  "PHONE_CHECKS_FILE": "Screen open. Pull-to-refresh. Every 60 seconds.",
  "WATCH_BUTTON_TIME": "15 minutes before game time."
}
```

### 4.2 `patriots_streams.json` (lines 2-17)

Identical keys and order to Guardians, with these values changed:

| Key | Value |
|---|---|
| `STEP_5` | `Commit and push patriots_streams.json to main.` |
| `gameDates` | `Game dates for this URL. Format: YYYY-MM-DD. One date: ["2026-09-10"]. Reused URL: ["2026-09-10", "2026-09-14"].` |
| `gameNumbers` | `Normal game: [1].` |

### 4.3 `cyclones_streams.json` (lines 2-18)

Identical to Patriots except:

| Key | Value |
|---|---|
| `STEP_5` | `Commit and push cyclones_streams.json to main.` |
| `gameDates` | `Game dates for this URL. Format: YYYY-MM-DD. One date: ["2026-09-05"]. Reused URL: ["2026-09-05", "2026-09-12"]. America/Chicago official date of kickoff.` |
| `sport` (added after `gameNumbers`) | `football, mens-basketball, or womens-basketball. Required. Same-day games in different sports need separate entries.` |

The phone never displayed the guide. `AI_Framework/AI_RULES.md:51` required keeping it and the complete inactive example.

---

## 5. Inactive example and markers

Guardians (`guardians_streams.json:19-31`) and Patriots (`patriots_streams.json:19-31`), byte for byte:

```json
"INACTIVE EXAMPLE. COPY THE COMPLETE OBJECT BELOW THIS LINE.",
{
  "gameDates": [
    "YYYY-MM-DD"
  ],
  "gameNumbers": [
    1
  ],
  "kind": "direct",
  "url": "https://media.example.com/game/master.m3u8",
  "allowInsecureHttp": false,
  "trustedHosts": []
}
```

Cyclones (`cyclones_streams.json:20-33`) added `"sport": "football"` after `gameNumbers`.

Marker strings:

| String | Files | Role |
|---|---|---|
| `INACTIVE EXAMPLE. COPY THE COMPLETE OBJECT BELOW THIS LINE.` | all three | Introduced the example. The pipeline test `streamsDocument.test.mjs:20` named it `MARKER` |
| `REAL DEAL` | `guardians_streams.json:32` only | Hand-added divider between the example and production entries |

---

## 6. Entries present at the snapshot

| File | `gameDates` | `gameNumbers` | `kind` | `sport` | `url` | `allowInsecureHttp` | `trustedHosts` |
|---|---|---|---|---|---|---|---|
| guardians | `2026-10-12` | `[1]` | `web` | | `https://<GOOZ_HOST>/new-stream-embed/<id>?ad=111` | `false` | `[]` |
| guardians | `2026-10-15` | `[1]` | `web` | | same form | `false` | `[]` |
| guardians | `2026-10-16` | `[1]` | `web` | | same form | `false` | `[]` |
| guardians | `2026-10-17` | `[1]` | `web` | | same form | `false` | `[]` |
| guardians | `2026-10-18` | `[1]` | `web` | | same form | `false` | `[]` |
| patriots | `2026-10-18` | `[1]` | `web` | | same form | `false` | `[]` |
| cyclones | `2026-10-24` | `[1]` | `web` | `football` | same form | `false` | `[]` |
| cyclones | `2026-10-31` | `[1]` | `web` | `football` | same form | `false` | `[]` |

Every production entry was pipeline-written. Pipeline-written Cyclones entries put `sport` after `trustedHosts` because the pipeline appended it last. The Guardians file still held 2026-10-12 because pruning ran only on a pipeline write and the last Guardians write (2026-10-18) kept dates within 7 days of that day.

---

## 7. Matching rules

### 7.1 Per module

| Module | Game identity on the phone | Entry matched when | Source |
|---|---|---|---|
| Guardians | MLB statsapi `officialDate` (the phone fell back to the phone-local date of `gameDate` only when MLB omitted it, `app/guardians/guardiansSnapshot.ts:288-289`) and `gameNumber` (1 or 2) | `gameDates` includes `officialDate` and `gameNumbers` includes `gameNumber` | `guardiansSources.ts:257-266` |
| Patriots | `easternDateString` of kickoff (`app/patriots/patriotsSnapshot.ts:44-55`), game number 1 | Same as Guardians (Patriots re-exported the Guardians parser, `app/patriots/patriotsSources.ts:1-6`) | `guardiansSources.ts:257-266` |
| Cyclones | `chicagoDateString` of kickoff, or `easternDateString` of ESPN's placeholder when the start was unset (`app/cyclones/cyclonesSnapshot.ts:88-95`), game number 1, and sport | `sport` equal, `gameDates` includes the date, `gameNumbers` includes the number | `cyclonesSources.ts:271-281` |

The pipeline used the same keys: `streamMatchesGame` (`P/lib/streamsDocument.mjs:83-94`) required `sport` equality when the game had a sport and the absence of `sport` otherwise. The official date had to be computed identically on the phone and in Actions, which is why each workflow fixed `TZ` and the pipeline computed dates in the module zone explicitly.

A resumed MLB game kept the suspended day's official date and game number, so the phone matched the old key; the pipeline replaced that entry instead of reporting it ready (`P/lib/pipeline.mjs:314-319`).

### 7.2 Document-level rules on the phone

- Only object entries counted; the last `MAX_REMOTE_STREAMS = 200` objects were read (`guardiansSources.ts:234-243`; `cyclonesSources.ts:248-257`).
- Valid entries were deduplicated by `<dates>:<numbers>:<kind>:<playbackUrl>` (Cyclones prefixed `<sport>:`) (`guardiansSources.ts:244-254`; `cyclonesSources.ts:258-268`).
- A document without a `streams` array was invalid and the fetch attempt failed over to the next source.
- Each matching valid entry produced its own icon-only Play action starting 15 minutes before the scheduled start; a matching `direct` entry also produced Listen (`Docs/Domain/Guardians.md:61`).

---

## 8. How the phone fetched them

### 8.1 When

| Trigger | Behavior |
|---|---|
| Team screen open | Fetch chain (Worker first in production) |
| Pull-to-refresh | Fetch chain plus a schedule refresh |
| Every 60 s while the app was active (`REFRESH_INTERVAL_MS = 60_000`: `GuardiansScreen.tsx:77`, `PatriotsScreen.tsx:79`, `CyclonesScreen.tsx:88`) | Fetch chain; schedule only every 10 minutes |
| Return to foreground | Fetch chain |
| Get video session | Fetch chain with `preferLive: true, allowStaleCache: false` every 5 s for up to 300 s |

The hub and TV Location did not fetch streams files. Only an open team screen did.

### 8.2 Order inside one fetch (`fetchGuardiansSources`, `GuardiansScreen.tsx:393-460`; the others were copies)

| Step | Request | Condition |
|---|---|---|
| 1 | Worker `GET <EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL>/streams[?module=...]` | Origin set in the build and either `preferLive` or production sources (`persistRemote`) |
| 2 | `GET https://api.github.com/repos/Danner36/Danner_App/commits?path=<file>&per_page=1` (unauthenticated, `Accept: application/vnd.github+json`, `User-Agent: danner-apps`), then raw `https://raw.githubusercontent.com/Danner36/Danner_App/<sha>/<file>` | Only for `preferLive` loads in production, only after the Worker failed, and the SHA lookup at most once per Get video session (comment: the unauthenticated commits API allows 60 calls an hour per address) |
| 3 | Raw `https://raw.githubusercontent.com/Danner36/Danner_App/main/<file>` | Always, unless a development override replaced it |
| 4 | AsyncStorage cached document text | Only when every live attempt failed and stale cache was allowed (not during Get video) |
| 5 | Empty list | Otherwise |

Every request went through `readStreamsResponse`: a `?refresh=<epoch ms>` cache-buster, `cache: 'no-store'`, headers `Accept: application/json`, `Cache-Control: no-cache`, `Pragma: no-cache` (`GuardiansScreen.tsx:303-345`). Each attempt had its own `SOURCES_FETCH_TIMEOUT_MS = 8_000` budget so a slow first source could not cancel the fallbacks (`GuardiansScreen.tsx:347-362`). Every successful production parse wrote the raw document text to AsyncStorage (`GuardiansScreen.tsx:410-414`).

### 8.3 Per-module constants

| | Guardians | Patriots | Cyclones |
|---|---|---|---|
| Raw `main` URL | `GuardiansScreen.tsx:94-95` | `PatriotsScreen.tsx:92-93` | `CyclonesScreen.tsx:97-98` |
| AsyncStorage key | `danner.guardians.sources.v2` (`:96`) | `danner.patriots.sources.v1` (`:94`) | `danner.cyclones.sources.v1` (`:99`) |
| Commits API `path=` | `guardians_streams.json` (`:312`) | `patriots_streams.json` (`:246`) | `cyclones_streams.json` (`:320`) |
| Raw-by-SHA URL | `:434` | `:345` | `:433` |
| Worker streams URL | `/streams` (`guardiansGetVideo.ts:17-22`) | `/streams?module=patriots` (`patriotsGetVideo.ts:21`) | `/streams?module=cyclones` (`cyclonesGetVideo.ts:22`) |
| SHA session holder | `CommitShaLookup { done, sha }` (`:364-391`) | `SourcesSession.latestCommitSha` (`:295-307`) | `SourcesSession.commitSha` (`:374-381`, `425-429`) |
| Development override | `EXPO_PUBLIC_GUARDIANS_SOURCES_URL` under `__DEV__` (`:98-103`) | `EXPO_PUBLIC_PATRIOTS_SOURCES_URL` (`:96`) | `EXPO_PUBLIC_CYCLONES_SOURCES_URL` (`:101`) |

With a development override active, `persistRemote` was false: the Worker was skipped unless `preferLive`, the SHA step was skipped, and nothing was cached.

### 8.4 Keeping a known URL

After each fetch the screen replaced its stream list only if the new list had a match for the featured game or the old list had none: "A later fetch that has no featured-game match does not wipe a URL the phone already has" (`GuardiansScreen.tsx:1205-1219`; `CyclonesScreen.tsx:1208-1209`; `AI_Framework/AI_RULES.md:51`). A Get video match was appended to the current list if the list still had no match (`GuardiansScreen.tsx:1492-1497`).

### 8.5 Get video polling

`pollForStream` (`guardiansGetVideo.ts:82-113` and copies) called the fetch chain, returned the first `authorizedStreamsForGame` match, otherwise waited `min(5 s, remaining)` until 300 s had passed or the session was aborted.

---

## 9. How the Worker served them

`GET /streams` resolved `module` (missing meant `guardians`), read `contents/<file>?ref=main` from the GitHub API with `Accept: application/vnd.github.raw` and the Worker's token, kept one ETag-cached body per module per isolate, and returned the file text unchanged with `Cache-Control: no-store`. A missing file answered 502. Details in [WorkerAndWorkflows.md](WorkerAndWorkflows.md) section 2.8.

---

## 10. How the pipeline wrote them

One pipeline run touched only its module's file (`P/lib/pipeline.mjs:47-67`, `163-170`). Summary (details in [Pipeline.md](Pipeline.md) sections 13-15):

1. Read the file and its blob SHA from `main` through the contents API.
2. If a playable entry already matched the featured game: stop as `video_ready` (unless forced or a resumed MLB game).
3. Otherwise extract a provider URL and build one entry `{ gameDates: [officialDate], gameNumbers: [gameNumber], kind: "web", url, allowInsecureHttp: false, trustedHosts: [], sport? }`.
4. Prune entries whose every date was more than 7 days before today in the module zone.
5. Take this game's date and number out of provider-owned (`web` on `GOOZ_HOST`) and unplayable entries, keep every other source, and insert the new entry where the first replaced entry stood, or at the end.
6. PUT the whole file with the SHA; on 409 or 422 re-read and re-plan, up to 3 retries.
7. Commit message `<module>: update stream for <officialDate> game <gameNumber>` by `github-actions[bot]`.

`HOW_TO_GUIDE`, marker strings, and the inactive example always survived a write. `P/streamsDocument.test.mjs:61-78` read the three committed files and asserted that pruning at 2030-01-01 kept `HOW_TO_GUIDE`, the marker, and exactly one object, the inactive example.

---

## 11. Hand-editing by the owner

The procedure (`HOW_TO_GUIDE`; `Docs/Domain/Guardians.md:28`; `Docs/Domain/Patriots.md:28`; `Docs/Domain/Cyclones.md:32`):

1. Open the module's root file on `main` (GitHub web editor or a local clone).
2. Edit only `streams`.
3. Copy the complete inactive example object, paste it after the example, separate with a comma.
4. Replace every value: real `gameDates` in the module's official-date rule, `gameNumbers`, `kind`, `url`, `allowInsecureHttp`, `trustedHosts`, and for Cyclones `sport`.
5. Commit and push the file to `main`.

Phones picked the change up within 60 seconds through the Worker (no TTL; the ETag changed with the commit) or on the next raw fetch.

Interaction with the pipeline:

- A hand-added playable entry for the featured game made a Get video run stop as `video_ready` without extracting.
- A forced run (`workflow_dispatch` with `force`) still left a hand-added `direct`, `youtube`, or non-provider `web` entry in place and added the provider entry beside it; the phone then showed one Play per valid source.
- A hand-added entry on `GOOZ_HOST` counted as provider-owned and could be split or replaced by a later run for the same game.
- An invalid hand-added entry (extra key, bad date, `http:` without opt-in) was ignored by the phone and replaced by the pipeline for that game's key.
- Any pipeline write pruned hand-added entries whose every date was more than 7 days old.
- Marker strings such as `REAL DEAL` were kept.

The visible history of these three files at the snapshot (a shallow clone of 55 commits) contained only `github-actions[bot]` commits with the three prefixes, from `guardians: update stream for 2026-09-06 game 1` to `cyclones: update stream for 2026-10-31 game 1`.

---

## 12. Fixed-design facts that shaped behavior

- One file per fixed module at the repository root; the path was hard-coded in the phone (raw URL, commits `path=`), the Worker (`MODULES`), and the pipeline (`MODULES`, `configProblem`).
- Two schemas: six fields, and six plus `sport` for the one multi-sport school.
- The phone's strict key allowlists meant any new field would make installed builds discard every entry that carried it.
- The guide text was per file and named the file in `STEP_5`.
- No process created a new streams file; each was committed by hand before its module shipped.
