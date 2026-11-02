Status: ARCHIVED
Snapshot: 823d2be (2026-10-31)

# Tests and Rules (Fixed Teams)

This is the record of the test harnesses and the governing AI rules at commit `823d2be562d252c9f3b0da305275adc6d8498f55` (`main`, 2026-10-31), when the app had three fixed team modules (Cleveland Guardians, New England Patriots, Iowa State Cyclones) and a fixed YouTube TV `TV Location` tile. The harnesses existed as one near-identical copy per team. The rules file explicitly forbade a parameterized sports engine.

Every `path:line` below is at the pinned commit. Fixture PIN values, the provider player host (`GOOZ_HOST`), and the listing site are withheld.

Permalink base: `https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/`

| Item | Permalink |
|---|---|
| Rules file | [AI_Framework/AI_RULES.md:1-63](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/AI_Framework/AI_RULES.md#L1-L63) |
| Product constraints block | [AI_Framework/AI_RULES.md:40-63](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/AI_Framework/AI_RULES.md#L40-L63) |
| Tests README | [tests/README.md:1-12](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/tests/README.md#L1-L12) |
| App npm scripts | [app/package.json:6-43](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/app/package.json#L6-L43) |
| Guardians fixture server | [tests/guardians/server.mjs:1-396](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/tests/guardians/server.mjs#L1-L396) |
| Patriots fixture server | [tests/patriots/server.mjs:1-215](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/tests/patriots/server.mjs#L1-L215) |
| Cyclones fixture server | [tests/cyclones/server.mjs:1-216](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/tests/cyclones/server.mjs#L1-L216) |
| Android scenario driver | [tests/guardians/run-android.mjs:1-86](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/tests/guardians/run-android.mjs#L1-L86) |
| Get video drivers | [tests/guardians/run-get-video.mjs:1-490](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/tests/guardians/run-get-video.mjs#L1-L490), [tests/patriots/run-get-video.mjs:1-488](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/tests/patriots/run-get-video.mjs#L1-L488), [tests/cyclones/run-get-video.mjs:1-498](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/tests/cyclones/run-get-video.mjs#L1-L498) |
| Snapshot tests | [tests/guardians/run-snapshot.mjs:1-605](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/tests/guardians/run-snapshot.mjs#L1-L605), [tests/patriots/run-snapshot.mjs:1-586](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/tests/patriots/run-snapshot.mjs#L1-L586), [tests/cyclones/run-snapshot.mjs:1-841](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/tests/cyclones/run-snapshot.mjs#L1-L841) |
| Pipeline tests | [scripts/guardians-stream-pipeline/package.json:11](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/scripts/guardians-stream-pipeline/package.json#L11) |

---

## 1. Layout

```text
tests/
  README.md
  guardians/
    README.md
    live-game.fixture.json      97 lines   normalized MLB snapshot + 6 streams
    server.mjs                 396 lines   fixture server, port 8108
    run-android.mjs             86 lines   scenario launcher
    run-get-video.mjs          490 lines   emulator Get video, mock Worker on 8111
    run-snapshot.mjs           605 lines   pure Node, MLB rules
    run-cast-discovery.mjs     775 lines   pure Node, Cast/relay logic
    run-cast-web.mjs           471 lines   device, Cast to a real receiver
    run-shell-fix.mjs          479 lines   device, permissions and Back
    prove-get-video.mjs        167 lines   ad hoc, port 8110, live GitHub
    extract-uidump.mjs          40 lines   uiautomator XML label helper
  patriots/
    README.md
    live-game.fixture.json      80 lines   normalized NFL snapshot + 4 streams
    server.mjs                 215 lines   fixture server, port 8108
    run-android.mjs             86 lines
    run-get-video.mjs          488 lines   mock Worker on 8112
    run-snapshot.mjs           586 lines   pure Node, ESPN NFL rules
  cyclones/
    README.md
    live-game.fixture.json      91 lines   normalized NCAA snapshot + 4 streams with sport
    server.mjs                 216 lines   fixture server, port 8108
    run-android.mjs             86 lines
    run-get-video.mjs          498 lines   mock Worker on 8113
    run-snapshot.mjs           841 lines   pure Node, ESPN NCAA rules
  offline-map/      README.md, run.mjs (221)
  provisioning-warning/  run.mjs (52)
  app-update/       README.md, run.mjs (346)
scripts/guardians-stream-pipeline/*.test.mjs   5 files, node:test
reference/screen-capture-hls/tests/            run-cast-convert.mjs, run-live-hls.mjs (archived converter)
```

`tests/README.md:3`: "Repository-only validation harnesses. Files under this directory are not imported by the Expo application and are not packaged into Android or iPhone builds."

---

## 2. Ports

| Port | Used by | Source |
|---|---|---|
| 8081 | Metro (`expo start --dev-client --android --port 8081`) for every device driver | `tests/*/run-android.mjs:68`; `tests/*/run-get-video.mjs:27` or `26` |
| 8108 | Shared dashboard fixture server for all three teams (`<TEAM>_HARNESS_PORT` default) and the AI-rules preferred preview port, scanning 8108-8127 if taken | `tests/<team>/server.mjs:4`; `AI_RULES.md:15` |
| 8109 | Pipeline `control-server.mjs` default (`GUARDIANS_PIPELINE_PORT`); `run-cast-web.mjs` probed 8109 then 8108 for a running fixture server | `scripts/guardians-stream-pipeline/control-server.mjs:13`; `tests/guardians/run-cast-web.mjs:264-271` |
| 8110 | `prove-get-video.mjs` local mock | `tests/guardians/prove-get-video.mjs:91` |
| 8111 | Guardians Get video harness (mock Worker plus fixtures) | `tests/guardians/run-get-video.mjs:28` |
| 8112 | Patriots Get video harness | `tests/patriots/run-get-video.mjs:27` |
| 8113 | Cyclones Get video harness | `tests/cyclones/run-get-video.mjs:27` |

Separate Get video ports kept the mock Worker from colliding with Expo and with the 8108 fixture server. 8109 and 8110 were not listed in the rules or in `Docs/Production/Cyclones.md:367-375`, which listed 8108, 8111, 8112, 8113, and the 8108-8127 scan.

The Android emulator reached the host as `10.0.2.2`; a physical phone used the PC's LAN address instead.

---

## 3. Fixture servers (`tests/<team>/server.mjs`)

Each server emitted the app's normalized snapshot, not provider JSON, so device runs bypassed MLB and ESPN parsing. All three set `Access-Control-Allow-Origin: *` and `Cache-Control: no-store` and listened on `0.0.0.0`.

| | Guardians | Patriots | Cyclones |
|---|---|---|---|
| Port env | `GUARDIANS_HARNESS_PORT` (default 8108) | `PATRIOTS_HARNESS_PORT` | `CYCLONES_HARNESS_PORT` |
| Snapshot route | `GET /guardians?scenario=` (122) | `GET /patriots?scenario=` (103) | `GET /cyclones?scenario=` (103) |
| Sources route | `GET /guardians-sources.json` (144-169) | `GET /patriots-sources.json` (125-150) | `GET /cyclones-sources.json` (125-150) |
| Other routes | `/health`, `/http-media/<path>` (fixed HTTP proxy to a public Apple HLS example path only, 403 outside it), `/native-hls-player` (one HTML5 `<video>` of that HLS stream, for Cast and AirPlay checks), `/capture-pattern` (moving canvas for the archived converter), `/popup-player` (approved and blocked popup buttons) | `/health`, `/http-media/`, `/popup-player` | `/health`, `/http-media/`, `/popup-player` |
| Date zone | America/New_York for official dates; host-local date for the Final recap | America/New_York | America/Chicago |
| Score key | `guardiansScore` | `patriotsScore` | `cyclonesScore` |
| Final scenario score | 7-3 | 24-17 | 24-7 |
| Source `gameDates` | Every official date a scenario could assign now (now − 90 min, now, now + 10 min, now + 45 min in New York, plus the host-local date) | Today in New York | Today in Chicago |
| Source rewrite | `10.0.2.2:8108` replaced by the request `Host`, so a physical phone on the LAN worked (158) | none | none |
| Extra source field | none | none | `sport: stream.sport ?? 'football'` (137) |

Scenarios (`today`, `ready`, `delayed`, `live`, `final`):

| Scenario | Featured state |
|---|---|
| `today` | Preview game starting in 45 minutes, status `Scheduled`, no Watch actions |
| `ready` | Preview game starting in 10 minutes, Watch actions visible |
| `delayed` | Preview game starting in 45 minutes, status `Delayed Start` |
| `live` | Fixture live game that started 90 minutes ago, with its scoreboard |
| `final` | Game that started 4 hours ago, `Final`, scoreboard removed, WIN badge |

Two upcoming games were placed one and two days ahead. `tests/patriots/server.mjs` and `tests/cyclones/server.mjs` differed only in team name, zone, Final opponent score, and the Cyclones `sport` field.

### 3.1 Fixture JSON (`tests/<team>/live-game.fixture.json`)

| Team | Shape | Streams |
|---|---|---|
| Guardians | `{ wins, losses, liveGame{ abstractState, gamePk, gameDate, gameNumber, status, isHome, guardiansScore, opponentName, opponentScore, officialDate, scoreboard{ status, balls, strikes, outs, batterNumber, pitcherNumber, innings[5], away{runs,hits,errors}, home{runs,hits,errors} } }, upcomingGames[2], streams[6] }` | `direct` over HTTP (opt-in), `direct` HTTPS, `youtube`, three `web` over HTTP (popup, redirect, native HLS page) |
| Patriots | `{ wins, losses, ties, liveGame{ ..., patriotsScore, seasonType, timeValid, scoreboard{ status, clock, period, down, distance, situation, possessionTeamId, away{points, quarters[]}, home{...} } }, upcomingGames[2], streams[4] }` | `direct` HTTP, `direct` HTTPS, `youtube`, `web` HTTP |
| Cyclones | `{ wins, losses, ties, liveGame{ ..., cyclonesScore, seasonType, sport, timeValid, notes, scoreboard{ kind, status, clock, period, down, distance, situation, possessionTeamId, away{points, periods[]}, home{...} } }, upcomingGames[2], streams[4] }` | Same four, each with `sport: "football"` |

---

## 4. Android scenario drivers (`tests/<team>/run-android.mjs`)

The three files were identical apart from the team name and env-var prefix.

1. Validate the scenario argument against `delayed`, `final`, `live`, `ready`, `today` (default `today`) (10-13).
2. Spawn `server.mjs` and poll `http://127.0.0.1:8108/health` 30 times at 200 ms (17-33).
3. Run `node <app>/node_modules/expo/bin/cli run:android --no-bundler` in `app/` with `EXPO_PUBLIC_<TEAM>_SOURCES_URL=http://10.0.2.2:8108/<team>-sources.json` and `EXPO_PUBLIC_<TEAM>_TEST_URL=http://10.0.2.2:8108/<team>?scenario=<s>` (48-64).
4. Start Metro with `start --dev-client --android --port 8081` and the same env (66-78).
5. Exit with Metro's code; kill Metro, the build, and the server in `finally`.

The app honored those env vars only under `__DEV__` (`GuardiansScreen.tsx:97-103`, `PatriotsScreen.tsx:95-100`, `CyclonesScreen.tsx:100-105`), so production bundles fetched MLB or ESPN and the root streams files.

---

## 5. Get video drivers (`tests/<team>/run-get-video.mjs`)

Each driver started its own HTTP server that played both the fixture server and the Worker, built and launched a development client on an emulator (package `com.example.location_helper`; `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or the Windows default SDK path), and drove the UI through `adb` uiautomator dumps.

| | Guardians | Patriots | Cyclones |
|---|---|---|---|
| Port | 8111 | 8112 | 8113 |
| Official date of the published stream | fixed `2026-08-28` | today in New York | today in Chicago |
| Publish delay after the first valid POST (`staleMs`) | 12 s | 12 s | 12 s |
| Mock `GET /streams` | any query | `400 {"error":"Unknown module."}` unless `module=patriots` (272-281) | `400` unless `module=cyclones` (276-285) |
| Mock `POST /get-video` | `401 {"error":"Unauthorized."}` on a wrong PIN; else `200` | `400 Unknown module.` unless `module: "patriots"` (293-299); `401` on a wrong PIN | `400 Unknown module.` unless `module: "cyclones"` (297-303); `400` unless `sport: "football"` (304-310); `401` on a wrong PIN |
| Env passed to the build | `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN`, `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL`, `EXPO_PUBLIC_GUARDIANS_SOURCES_URL`, `EXPO_PUBLIC_GUARDIANS_TEST_URL` (330-333) | the two shared `EXPO_PUBLIC_GUARDIANS_*` plus `EXPO_PUBLIC_PATRIOTS_SOURCES_URL`, `EXPO_PUBLIC_PATRIOTS_TEST_URL` (355-358) | the two shared plus `EXPO_PUBLIC_CYCLONES_SOURCES_URL`, `EXPO_PUBLIC_CYCLONES_TEST_URL` (366-369) |
| Hub tile tapped (accessibility label) | `Cleveland Guardians` (425) | `New England Patriots` (450) | `Iowa State Cyclones` (461) |

Flow: wait for the hub tile (tapping through Expo dev-client prompts such as `Continue`, `RELOAD`, and the Metro URLs), tap the tile, wait for and tap `Get video`, wait until the mock had published, then require Play during the same Get video session. Success printed `Play appeared after publish without restart.` The fixture PIN was a fixed debug value, not the family PIN.

The hub labels came from `app/hub/HubScreen.tsx:277`, `294`, `313`, and `329` (`Cleveland Guardians`, `New England Patriots`, `Iowa State Cyclones`, `TV Location`).

---

## 6. Other Guardians-folder harnesses

| File | Kind | Content |
|---|---|---|
| `run-cast-discovery.mjs` | Pure Node | Imported `app/guardians/castStreamType.ts`, `webMediaDiscoveryInjection.ts`, and `app/modules/danner-live-hls/src/*`. Page-reported Cast URL gate, per-page message nonce, MP4-then-HLS upgrade through the injection, page pause while a receiver held the relay, relay kinds and failure messages, relay origin validation, live stream type, relay variant selection. Team-agnostic logic kept in a team folder |
| `run-cast-web.mjs` | Device | Live game plus `/native-hls-player`; tapped `Cleveland Guardians` (399), tapped TV, and asserted the receiver loaded only the phone's `/<token>/live.m3u8` relay. Needed a real Cast receiver named `Living Room TV` (425-426) |
| `run-shell-fix.mjs` | Device | Package had no location permission; Back closed Play then returned to the hub (checked for the `Cleveland Guardians` label, 399); TV send proceeded with notification permission denied and no location prompt |
| `prove-get-video.mjs` | Ad hoc | Local mock on 8110 plus live requests to raw GitHub `guardians_streams.json` and the commits API; not in `package.json` |
| `extract-uidump.mjs` | Helper | Listed `content-desc` and `text` labels from a uiautomator XML dump, or searched for one |

The screen-capture converter harnesses had moved to `reference/screen-capture-hls/tests/` with the archived converter.

---

## 7. Snapshot tests (pure Node)

Each imported the app's TypeScript directly through Node type stripping (`--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`), with no device and no network.

| File | Imports | Zone handling | Coverage |
|---|---|---|---|
| `tests/guardians/run-snapshot.mjs` | `app/guardians/guardiansSnapshot.ts` (`abstractStateFromMlb`, `blocksPlayback`, `gameInterruption`, `gameWithLiveReport`, `guardiansGameFromMlb`, `recapResult`, `snapshotFromGames`), `guardiansSources.ts` (`guardiansStreamsFromDocument`), `mlbLinescore.ts` (`liveGameFromSchedule`) (3-13) | `process.env.TZ = 'America/Chicago'`, asserted (15-21) | Featured pick for live, later-today, recap, and doubleheader; `startTimeTBD`; Warmup as pre-game; rain delay; postponed makeups; suspended games; newest 200 stream entries |
| `tests/patriots/run-snapshot.mjs` | `app/patriots/patriotsSnapshot.ts`, `espnScoreboard.ts`; then `espnNfl.ts` through a `registerHooks` resolve hook scoped to `/app/patriots/` with a stubbed `fetch` (514-529) | Fixtures at `America/New_York` (21-22); zone-sensitive rules re-run under `PHONE_TIME_ZONES` = New York, Chicago, Denver, Los Angeles, Honolulu, UTC, Berlin, Tokyo, Auckland (33-43) | Featured pick, regular-season record, Eastern official dates, `Time TBA` dates across zones, ESPN state mapping, season-type tagging |
| `tests/cyclones/run-snapshot.mjs` | `app/cyclones/cyclonesSnapshot.ts`, `cyclonesSources.ts`, `espnCyclonesScoreboard.ts` (3-25) | Runs in any machine zone | Three-sport merge, records, Chicago dates, Eastern `Time TBA` dates, CFP and NCAA and conference-tournament statuses, neutral sites, video window, stream cap |

The ESPN and MLB parsers had no recorded provider fixtures; inline builders inside these files constructed provider JSON.

---

## 8. Team-agnostic tests

| File | Content |
|---|---|
| `tests/offline-map/run.mjs` | Pin coordinates, Census city labels including suburbs, offline search, and agreement between the code shipped in `app/assets/offline-us-map.html` and `app/tvLocation/offlineMapSelection.ts`. It asserted the shipped `DEFAULT_START` equaled `{ label: 'Tripoli, Iowa', latitude: 42.808371, longitude: -92.2578433 }` (48-49) |
| `tests/provisioning-warning/run.mjs` | Hidden, 48-hour, hourly, final-hour, and expired iPhone signing-warning text |
| `tests/app-update/run.mjs` | Release-tag parser, version compare, the `app.config.js` version bake, the `release.yml` tag regex (read from the workflow file, 270), manifest parse, trusted download URLs, signing-warning suppression, SideStore install URL encoding, the manifest writer |

---

## 9. Pipeline unit tests

`scripts/guardians-stream-pipeline/` held five `node:test` files run by `npm test` there: `extractGooz.test.mjs` (20), `pipelineConfig.test.mjs` (7), `pipelineWindow.test.mjs` (20), `publishGithub.test.mjs` (5), `streamsDocument.test.mjs` (13). One test read the three committed root streams files by name (`streamsDocument.test.mjs:61-78`). Details in [Pipeline.md](Pipeline.md) section 17.

---

## 10. npm scripts (`app/package.json:12-42`)

| Script | Command |
|---|---|
| `test:guardians:android` | `node ../tests/guardians/run-android.mjs` |
| `test:guardians:android:ready` / `:delayed` / `:final` / `:live` | `run-android.mjs <scenario>` |
| `test:guardians:snapshot` | `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON ../tests/guardians/run-snapshot.mjs` |
| `test:guardians:cast-discovery` | same flag, `run-cast-discovery.mjs` |
| `test:guardians:android:cast-web` | `node ../tests/guardians/run-cast-web.mjs` |
| `test:guardians:android:shell-fix` | `node ../tests/guardians/run-shell-fix.mjs` |
| `test:guardians:android:get-video` | `node ../tests/guardians/run-get-video.mjs` |
| `test:guardians:server` | `node ../tests/guardians/server.mjs` |
| `test:patriots:android` and `:ready` / `:delayed` / `:final` / `:live` | `node ../tests/patriots/run-android.mjs [scenario]` |
| `test:patriots:android:get-video` | `node ../tests/patriots/run-get-video.mjs` |
| `test:patriots:snapshot` | same flag, `../tests/patriots/run-snapshot.mjs` |
| `test:patriots:server` | `node ../tests/patriots/server.mjs` |
| `test:cyclones:android` and `:ready` / `:delayed` / `:final` / `:live` | `node ../tests/cyclones/run-android.mjs [scenario]` |
| `test:cyclones:android:get-video` | `node ../tests/cyclones/run-get-video.mjs` |
| `test:cyclones:snapshot` | same flag, `../tests/cyclones/run-snapshot.mjs` |
| `test:cyclones:server` | `node ../tests/cyclones/server.mjs` |
| `test:offline-map` | same flag, `../tests/offline-map/run.mjs` |
| `test:provisioning-warning` | same flag, `../tests/provisioning-warning/run.mjs` |
| `test:app-update` | same flag, `../tests/app-update/run.mjs` |
| `typecheck` | `tsc --noEmit` |

That was 27 team-named scripts (Guardians 11 at 12-22, Patriots 8 at 23-30, Cyclones 8 at 31-38) and four team-agnostic ones (39-42). All ran from `app/`.

---

## 11. CI coverage

No workflow ran any test. `release.yml` built and published whatever the tag held. The stream workflows ran only `node run.mjs --check-config` and the pipeline. Validation evidence lived in `Docs/Production/Validation.md`, kept in sync by hand (`AI_RULES.md:29`).

## 12. Results at the snapshot

Re-run on 2026-11-01 against `823d2be` (Node 22, Linux, no device):

| Suite | Result |
|---|---|
| Pipeline `node --test` (5 files) | 65 pass, 0 fail |
| `tests/guardians/run-snapshot.mjs` | Passed (`Guardians snapshot recap states passed.`) |
| `tests/patriots/run-snapshot.mjs` | Passed (`Patriots snapshot assertions passed.`) |
| `tests/cyclones/run-snapshot.mjs` | Passed (`Cyclones snapshot assertions passed.`) |
| Device drivers | Not run (need an Android emulator and a development build) |

---

## 13. `AI_Framework/AI_RULES.md` at the snapshot

The full file is at [AI_Framework/AI_RULES.md](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/AI_Framework/AI_RULES.md) (63 lines). `.cursor/rules/ai-rules-first.mdc` (`alwaysApply: true`) required reading it before any other work, and `AI_RULES.md:3` sent agents next to `AI_ONBOARDING.md`. The key lines that fixed the three-team design follow.

### 13.1 Lines that fixed the hub and the module set

> **42** Preserve the Danner family app hub, Guardians module, YouTube TV playback-area purpose, and parent-friendly interfaces on Android and iPhone.

> **47** Keep the main hub logo-only: center the 210dp Danner branding one-third down the usable screen, then center a two-row 2×2 grid of 101.2dp artwork tiles with 28dp gaps so the cluster sits on the two-thirds line (`marginTop: -115.2`). Row 1 is Cleveland Guardians then New England Patriots. Row 2 is Iowa State Cyclones then YouTube TV. Do not add menu headings, prompts, or tile descriptions.

> **49** (excerpt) ... Do not show it while the iPhone signing-health warning is visible, while Guardians, Patriots, Cyclones, or TV Location is open, or when the baked release version is absent. ...

`AI_Framework/AI_ONBOARDING.md:5` restated the same 2×2 hub and the three modules.

### 13.2 Lines that forbade a generic engine

> **53** (excerpt) The Patriots screen is a sibling of Guardians, not a parameterized sports engine. ... Reuse `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL`, `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN`, `FAMILY_PIN`, and `GITHUB_TOKEN`. Do not reuse `guardians-get-video` dispatch, `guardians-stream-pipeline.yml`, or `GUARDIANS_STREAM_PIPELINE_CONFIG`. Missing or legacy module stays `guardians`.

> **55** (excerpt) The Cyclones screen is a sibling of Patriots, not a parameterized sports engine. ... Do not reuse Guardians or Patriots dispatch types, workflows, or pipeline secrets.

> **57** (excerpt) The Guardians, Patriots, and Cyclones featured cards show a `WIN CHANCE` bar ... Each module keeps its own copy.

The Cyclones delivery brief carried the same prohibitions: `Docs/Production/Cyclones.md:8` "Do not parameterize Guardians or Patriots into a generic sports engine. Do not create a second Cloudflare Worker or a second family PIN." and `Docs/Production/Cyclones.md:384` listed "Generic multi-sport engine" under Out of scope.

### 13.3 Lines that fixed each module's data and streams contract

> **50** (excerpt) The Guardians screen fetches the current record, game state, score, and remaining schedule from MLB when opened, on pull-to-refresh, and every ten minutes. A live featured game also refreshes its park-style scoreboard every five seconds while the screen is open. ... A game with `startTimeTBD` shows `Time TBA` and does not count down or open Play before it is live. ... After Final, the featured card shows `WIN`, `LOSS`, or `TIE` and the score without the park-style scoreboard, Play, Listen, Get video, or pitcher decisions.

> **51** (excerpt) Guardians video playback uses `guardians_streams.json`, matched by MLB official date and game number. Fetch that file on screen open, pull-to-refresh, and every minute; cache the last valid file for network failures. Production fetches try `GET {GET_VIDEO_URL}/streams` first when that origin is set, then raw GitHub `main`. Get video and other `preferLive` loads also try raw GitHub by the latest commit SHA that touched the file when the Worker list fails. A later fetch that has no featured-game match does not wipe a URL the phone already has. Keep root-level `HOW_TO_GUIDE` and the complete inactive six-field example inside `streams`. Do not require the owner to enter an MLB identifier or source display name. Show icon-only Play actions starting 15 minutes before game time ... When `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` and `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` are set, show **Get video** in that same window. Get video POSTs `{ pin }` to `{GET_VIDEO_URL}/get-video`, then polls for a matching URL for up to 5 minutes. ... HTTPS is the default; cleartext HTTP is accepted only when that entry sets `allowInsecureHttp: true`. ...

> **53** (excerpt) ... Fetch leftover preseason, regular-season, and playoff games from ESPN NFL site JSON for team 17 ... Playback uses root `patriots_streams.json` with the same six-field schema, matched by official date and game number. Official dates are the America/New_York calendar date of kickoff so phones and GitHub Actions agree. Production fetches try `GET {GET_VIDEO_URL}/streams?module=patriots` first. Get video POSTs `{ pin, module: "patriots" }` to the shared Worker and polls that module list. ...

> **55** (excerpt) ... Fetch leftover preseason, regular-season, and postseason games from ESPN NCAA site JSON for Iowa State team 66 in college football, men's basketball, and women's basketball ... Show three compact regular-season records under the title ... One featured card picks live across any sport, else today's next kickoff, else today's last recap, and names the sport. ... A `Time TBA` game takes the America/New_York calendar date of ESPN's placeholder time. Playback uses root `cyclones_streams.json` with the six Guardians fields plus required `sport`, matched by official date, game number, and sport. Official dates are the America/Chicago calendar date of kickoff. Production fetches try `GET {GET_VIDEO_URL}/streams?module=cyclones` first. Get video POSTs `{ pin, module: "cyclones", sport }` to the shared Worker and polls that module list. ...

### 13.4 Lines that fixed the per-team test harnesses

> **52** Guardians test fixtures stay under `tests/guardians/`, are served from port 8108 (Get video harness uses 8111 so it does not collide with Expo), and can be read only by a development build with `EXPO_PUBLIC_GUARDIANS_TEST_URL` set. Never import test fixtures into the Expo asset graph or enable the harness in production.

> **54** Patriots test fixtures stay under `tests/patriots/`, are served from port 8108 (Get video harness uses 8112), and can be read only by a development build with `EXPO_PUBLIC_PATRIOTS_TEST_URL` set. Never import those fixtures into the Expo asset graph.

> **56** Cyclones test fixtures stay under `tests/cyclones/`, are served from port 8108 (Get video harness uses 8113), and can be read only by a development build with `EXPO_PUBLIC_CYCLONES_TEST_URL` set. Never import those fixtures into the Expo asset graph.

### 13.5 Lines that fixed the TV Location tile

> **44** Default the selected destination to Tripoli, Iowa at `42.808371, -92.2578433`.

> **45** Let the destination be chosen from the bundled U.S. map or offline city search, display the nearest town or city rather than coordinates, and save the point locally for later launches.

> **43** Allowed verification URL: `https://tv.youtube.com/verify` and redirects initiated by that page.

Lines 46, 58, and 59 covered the WebView Geolocation injection, the Android cookie flush, and the four guided steps. `tests/offline-map/run.mjs:48-49` enforced line 44 in code.

### 13.6 General lines that governed the work

| Line | Rule |
|---|---|
| 15 | "If a local preview server is added, prefer port 8108, then scan 8108 through 8127." |
| 17 | "Do not print Apple Account emails, passwords, 2FA codes, pairing files, or device UDIDs." |
| 21-23 | No troubleshooting or best-practice asides; no stock filler, hype, or slanted text; drop abandoned work silently |
| 27-29 | "Comments are not conversational and do not use `we` or `user`." "Comments and docs describe current behavior only." Keep `Docs/Production/Validation.md` in sync |
| 34 | "Documentation writes require owner approval." |
| 60-61 | Android and iPhone from one Expo app; direct installation only (signed APK and SideStore-compatible IPA); each release carries both artifacts, `release/IPHONE_SETUP.md`, `version-manifest.json`, and `sidestore-source.json` |
| 62 | Release tag baked into `expo.version`, Android `versionCode`, and iOS `buildNumber` as `major * 10000 + minor * 100 + patch`; tags `vMAJOR.MINOR.PATCH`; "Do not rotate the Expo debug keystore used by family APKs." |
| 63 | Branding: `Docs/Art/media/ic_launcher_danner.jpg` |

### 13.7 What the rules meant for the design

| Area | Constraint at the snapshot |
|---|---|
| Hub | Exactly four tiles in a fixed 2×2 order with exact dp values |
| Modules | Three sibling copies; each kept its own snapshot code, screen, Get video client, win-chance code, and fetch chain |
| Data sources | MLB statsapi team 114; ESPN NFL team 17; ESPN NCAA team 66 in three sports |
| Official dates | MLB official date; New York kickoff date; Chicago kickoff date with New York for TBA |
| Streams | One root file per module, six fields, plus `sport` for Cyclones |
| Cloud | One shared Worker and one family PIN, but a separate dispatch type, workflow, and config secret per module |
| Tests | One fixture folder and one Get video port per module |
| TV Location | Tripoli, Iowa compiled in as the default destination |
