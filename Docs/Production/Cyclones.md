Status: PLANNED
Phase: Not implemented

# Iowa State Cyclones — agent brief

This file is the durable brief for the next agent. Cyclones source does not exist yet. The Cursor plan `Cyclones module` (`cyclones_module_5bed3b38`) records the same lock-ins. Prefer this document over chat memory.

Do not print listing `extract.baseUrl`, family PIN values, Apple Account secrets, pairing files, or device UDIDs. Do not parameterize Guardians or Patriots into a generic sports engine. Do not create a second Cloudflare Worker or a second family PIN.

## Current repo state (2026-08-29)

| Item | State |
|------|--------|
| Cyclones Expo module `app/cyclones/` | Absent |
| Root `cyclones_streams.json` | Absent |
| GitHub Action `cyclones-stream-pipeline.yml` | Absent |
| GitHub secret `CYCLONES_STREAM_PIPELINE_CONFIG` | Not created |
| Worker `module: "cyclones"` | Absent. Live Worker source knows `guardians` and `patriots` only |
| Hub row 2 | YouTube TV under Guardians, reserved empty spacer under Patriots |
| Product rule in `AI_Framework/AI_RULES.md` | Still the spacer layout. Change only when Cyclones is implemented |
| Latest published family tag | `v1.4.2`. Installed `v1.3.3` phones still have the previous two-tile hub until that APK or IPA is installed |
| Patriots sibling | On `main` and in `v1.4.2`. Treat Patriots as the copy pattern |

Patriots is the required sibling pattern. Read `app/patriots/`, `tests/patriots/`, `Docs/Domain/Patriots.md`, `.github/workflows/patriots-stream-pipeline.yml`, and `workers/guardians-get-video/src/index.js` before writing Cyclones.

## Owner lock-ins (do not reverse)

- One module, one hub tile, one screen, one streams file, one Worker `module`, one GitHub Action, one family PIN.
- Sports on that screen: college football, men’s basketball, and women’s basketball.
- Seasons: leftover preseason, regular season, conference tournaments, bowls / CFP, March Madness, and other ESPN postseason. ESPN `seasontype` **1, 2, and 3**.
- Hub after implement:

```
Row 1:  [Guardians]   [Patriots]
Row 2:  [Cyclones]    [YouTube TV]
```

Cyclones sits under Guardians. YouTube TV moves under Patriots. The reserved spacer is removed. TV Location no longer sits under Guardians.

- Same Get video process as Patriots: reuse the existing Worker origin, `FAMILY_PIN`, `GITHUB_TOKEN`, `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL`, and `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN`.
- New secret `CYCLONES_STREAM_PIPELINE_CONFIG` only. Leave Guardians and Patriots secrets and workflows alone.
- Elimination must be an explicit parent-visible status. An empty schedule is not enough. Do not claim eliminated during Selection Sunday, CFP pairing, or TBA next game.
- Listing college hrefs are unknown. Ship the known ESPN slug as the needle. Patch the secret when those listing rows first appear. That patch does not need a family APK/IPA.

## What is already done (Patriots / shared infra)

This is the working template Cyclones copies. It is not Cyclones work.

### Phone

- `app/App.tsx` routes `'patriots'` to `PatriotsScreen`.
- `app/hub/HubScreen.tsx` is a two-row 2×2 of 101.2dp tiles, 28dp gaps, cluster on the two-thirds line (`marginTop: -115.2`). Row 1 Guardians then Patriots. Row 2 YouTube TV then spacer.
- `app/patriots/` dashboard: ESPN leftover games, countdown, `Time TBA`, football scoreboard, Play / Listen / Get video, isolated players. Reuses Guardians Cast, audio, TV capture, and AirPlay.
- Get video POSTs `{ pin, module: "patriots" }` using `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` and `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN`. Polls `GET /streams?module=patriots` for up to 5 minutes.
- Patriots parser reuses the Guardians six-field schema and **rejects extra keys**. Cyclones therefore needs its own parser (six fields plus required `sport`).
- Tests: `tests/patriots/` dashboard harness **8108**, Get video **8112**. Snapshot `npm run test:patriots:snapshot` passed. Emulator `SKIP_ANDROID_BUILD=1 npm run test:patriots:android:get-video` on `emulator-5554` passed (Play after publish, no restart). Separate today / ready / delayed / Final Metro launches were not run.
- Official Patriots dates: **America/New_York** so TNF `2026-09-10T00:20Z` is `2026-09-09` on phones and Actions.

### Pipeline and extract

- Shared package: `scripts/guardians-stream-pipeline/`.
- Guardians config sport default is MLB. Patriots sets `"sport": "nfl"`.
- Extract opens `extract.baseUrl`, finds `<a href>` containing `hrefNeedle`, opens that inner page, then captures a gooz player URL.
- Known working needles (observed on the listing, not invented from ESPN APIs):
  - Guardians: `cleveland-guardians`
  - Patriots: `new-england-patriots`
- Bonus score if the href also contains `/mlb/`, `/nfl/`, or `/stream/`. Those are listing folders, not ESPN API paths.
- Patriots example: `scripts/guardians-stream-pipeline/config.patriots.example.json`. Local `config.json` is gitignored.
- `scripts/guardians-stream-pipeline/lib/nflSchedule.mjs` fetches ESPN NFL team 17. `pipeline.mjs` branches on `config.sport === 'nfl'`.

### Cloudflare Worker (shared, keep one)

- Name: `guardians-get-video`
- Source: `workers/guardians-get-video/src/index.js`
- `wrangler.toml` `GITHUB_REPO` = `Danner36/Danner_App`
- Routes:
  - `GET /health` → `ok`
  - `GET /streams` and `GET /streams?module=guardians` → `guardians_streams.json` from GitHub `main`
  - `GET /streams?module=patriots` → `patriots_streams.json` from GitHub `main`
  - `POST /get-video` body `{ pin, module? }`. Missing / legacy module is `guardians`. Unknown module is 400.
- Dispatch body today: `{ event_type, client_payload: { module, source: "phone" } }`. It does **not** yet forward `sport`. Cyclones needs `sport` in that payload.
- Rate limit: 3 POSTs / 10 minutes / IP.
- Cloudflare secrets already set. **Do not put again:**
  - `FAMILY_PIN`
  - `GITHUB_TOKEN`
- Worker was deployed once after Patriots `module` landed in source (`npx wrangler login` then `npx wrangler deploy` from `workers/guardians-get-video`). The PC does not stay on. Redeploy once more after `cyclones` is added to `MODULES`.
- `GET /streams?module=patriots` is live and reads `patriots_streams.json` from `main`. `GET /streams?module=cyclones` will 502 until `cyclones_streams.json` exists on `main`.

### GitHub (repo `Danner36/Danner_App`)

| Name | Kind | Action |
|------|------|--------|
| `guardians-stream-pipeline.yml` | Workflow | Leave alone. `repository_dispatch` type `guardians-get-video` |
| `patriots-stream-pipeline.yml` | Workflow | Leave alone. `repository_dispatch` type `patriots-get-video`. Reads `PATRIOTS_STREAM_PIPELINE_CONFIG` |
| `release.yml` | Workflow | Leave alone. Bakes `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` and `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` into family builds |
| `GUARDIANS_STREAM_PIPELINE_CONFIG` | Repo secret | Leave alone. Has the real listing `extract.baseUrl` and `hrefNeedle` `cleveland-guardians` |
| `PATRIOTS_STREAM_PIPELINE_CONFIG` | Repo secret | Leave alone. Same `extract.baseUrl`, `sport: "nfl"`, `hrefNeedle: "new-england-patriots"`, writes `patriots_streams.json` |
| `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` | Actions secret | Leave alone. Worker origin, no trailing slash |
| `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` | Actions secret | Leave alone. Same value as Cloudflare `FAMILY_PIN` |
| `CYCLONES_STREAM_PIPELINE_CONFIG` | Repo secret | **Create after implement.** Copy only `extract.baseUrl` from an existing pipeline secret. Never print it |
| `cyclones-stream-pipeline.yml` | Workflow | **Create.** `repository_dispatch` type `cyclones-get-video` |
| `guardians_streams.json` | Root file on `main` | Production Guardians URLs. Do not change schema |
| `patriots_streams.json` | Root file | Present locally (guide + inactive example). Must be on `main` or Patriots Worker GET 502s |

## What still must be built (Cyclones)

Implement as a Patriots sibling under `app/cyclones/`. Do not fold into Patriots.

### 1. Hub and route

- `app/App.tsx`: add `'cyclones'` screen and `CyclonesScreen`.
- `app/hub/HubScreen.tsx`: row 2 index 1 = Cyclones, row 2 index 2 = YouTube TV. Remove the spacer.
- Bundle Cy artwork from ESPN NCAA team 66: `https://a.espncdn.com/i/teamlogos/ncaa/500/66.png` (same local-raster approach as Patriots).
- After implement, update the hub product rule in `AI_Framework/AI_RULES.md` and `AI_Framework/AI_ONBOARDING.md` so row 2 is Cyclones then YouTube TV.

### 2. ESPN snapshot (three sports, one featured card)

Confirmed 2026-08-29 from ESPN site JSON:

| Sport | Team id | Slug | Schedule path | Next known game |
|-------|---------|------|---------------|-----------------|
| Football | 66 | `iowa-state-cyclones` | `football/college-football/teams/66/schedule` | 2026-09-05 SEMO at Iowa State, 17:00Z, `timeValid` true |
| Men’s basketball | 66 | `iowa-state-cyclones` | `basketball/mens-college-basketball/teams/66/schedule` | 2026-11-02 Memphis vs Iowa State, `timeValid` false (TBA) |
| Women’s basketball | 66 | `iowa-state-cyclones` | `basketball/womens-college-basketball/teams/66/schedule` | 2026-12-06 Loyola Chicago at Iowa State, `timeValid` false (TBA) |

Fetch leftover games for seasontype **1, 2, 3** on each path.

Season year:

- Football: January → previous calendar year (bowls / CFP); otherwise current year (same idea as Patriots NFL).
- Basketball: July–December → championship year `calendar + 1` (August 2026 loads 2026–27 as `season=2027`); January–June → current calendar year.

Official dates: **America/Chicago** so Ames kickoffs and GitHub Actions agree.

Game tags (three sport keys, not a male/female flag):

- `football`
- `mens-basketball`
- `womens-basketball`

Football has no gender split. The two basketball teams are different ESPN leagues, different scoreboards, and will have different listing hrefs once those rows exist.

Same-day overlap is real. Football Saturday plus a hoops game that night is common in November/December. Men’s and women’s basketball share dates often. All three on one calendar day is uncommon but possible. Matching cannot be date-only.

Featured card (one card):

1. Live across any sport
2. Else today’s next kickoff across any sport
3. Else today’s last recap

The other same-day sport stays in the schedule. Card shows the sport name. `Time TBA` when ESPN `timeValid` is false.

Records: three compact regular-season W–L (or W–L–T) lines under the title. Each stays `0–0` until that sport has a regular-season Final. Preseason and postseason do not change those numbers.

Schedule: remaining non-featured games from all three sports, start-time order, `vs` / `at`, sport label on each row. No completed games.

Scoreboards (live only, 5s refresh):

- Football: Patriots-style (Q1–Q4 + OT, clock, down/distance, possession)
- Men’s basketball: halves + OT
- Women’s basketball: four quarters + OT

### 3. Elimination (explicit)

A sport is still alive if it has a Live game or any future scheduled game.

Eliminated from a knockout tournament only when all of these are true:

- last completed game is a loss
- that game’s ESPN season / notes / name identify a knockout event (CFP, bowl-as-playoff, NCAA Tournament, NIT, WBIT, WNIT, conference tournament)
- no later game exists in any fetched seasontype for that sport

Season complete: no remaining games and the last Final is not a qualifying knockout loss. Championship win → `Won the [tournament]`, not eliminated.

Do not say eliminated during Selection Sunday, CFP pairing, next opponent TBA, or a win with no next game posted yet. Show `Awaiting next [tournament] game` / `Time TBA` and keep the 60s refresh.

Show the status on the featured/recap area when that sport is the featured story, and as a short line under that sport’s record when that sport’s schedule is empty.

### 4. Watch / Get video

Same 15-minute window, icon-only Play, Listen / Cast / TV capture, isolated players.

Phone POST:

```json
{ "pin": "<FAMILY_PIN>", "module": "cyclones", "sport": "football" }
```

`sport` is the featured game’s key (`football` | `mens-basketball` | `womens-basketball`).

Worker must:

1. Accept `cyclones` in `resolveModule` / `MODULES`
2. Dispatch `event_type: "cyclones-get-video"`
3. Forward `sport` in `client_payload` (Patriots dispatch does not do this today)
4. Serve `GET /streams?module=cyclones` from `cyclones_streams.json` on `main`

Phone polls that list and keeps only entries whose `sport` matches the featured game.

### 5. Streams file and parser

New root `cyclones_streams.json`: `HOW_TO_GUIDE` plus one complete inactive example. Must be on `main` or Worker GET 502s.

Guardians / Patriots six-field parser rejects extra keys. Cyclones parser: those six fields **plus required `sport`**. Match `officialDate` + `gameNumber` + `sport`.

### 6. Pipeline and extract

- New `scripts/guardians-stream-pipeline/config.cyclones.example.json`
- `pipeline.mjs` branch `sport: "cyclones"`: load all three ESPN schedules; pick the featured game **scoped to the dispatch `sport`**
- `extractGooz.mjs`: Cyclones match requires **every** token in that sport’s `hrefNeedles` array. Do not add invented `/college-football/` scores. Keep existing `/mlb/`, `/nfl/`, `/stream/` bonuses. Add a college folder to the bonus list only after it is observed on the listing.
- New `.github/workflows/cyclones-stream-pipeline.yml` modeled on the Patriots workflow:
  - `repository_dispatch` types: `[cyclones-get-video]`
  - `workflow_dispatch` dry_run / force
  - Write `secrets.CYCLONES_STREAM_PIPELINE_CONFIG` to `config.json`
  - `node run.mjs`
  - `contents: write`, Node 24, Playwright Chromium, 15 minute timeout

Ship-now secret shape (placeholder `baseUrl` only):

```json
{
  "sport": "cyclones",
  "leadMinutes": 15,
  "postStartGraceMinutes": 240,
  "probeTimeoutSeconds": 90,
  "extract": {
    "baseUrl": "<paste extract.baseUrl from existing pipeline secret>",
    "hrefNeedles": {
      "football": ["iowa-state-cyclones"],
      "mens-basketball": ["iowa-state-cyclones"],
      "womens-basketball": ["iowa-state-cyclones"]
    },
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

### 7. Tests

- `tests/cyclones/`
- Snapshot: featured across sports, records ignore preseason, Chicago official date, elimination vs awaiting-next
- Dashboard harness port **8108**
- Get video harness port **8113** (Guardians 8111, Patriots 8112)
- Development override `EXPO_PUBLIC_CYCLONES_TEST_URL` only. Never import fixtures into the Expo asset graph
- Run snapshot + emulator Get video on this Windows PC before calling implement done

### 8. Docs after implement (owner already approved this brief; product-rule edits wait for implement)

When Cyclones source exists, update:

- `AI_Framework/AI_RULES.md` (hub row 2 + Cyclones product rules)
- `AI_Framework/AI_ONBOARDING.md`
- `Docs/Anchor/Vision.md`
- `Docs/Domain/Cyclones.md` (new current-behavior domain doc)
- `Docs/Domain/Playback.md` if hub copy lives there
- `Docs/Art/README.md`
- `Docs/Production/Validation.md`
- `Docs/Production/Roadmap.md`
- `Docs/Technical/Stack.md`
- Tier READMEs: `app/`, `app/hub/`, `app/cyclones/`, `scripts/`, `workers/`, `workers/guardians-get-video/`, `tests/`

### 9. Owner ops after source exists

1. Create GitHub secret `CYCLONES_STREAM_PIPELINE_CONFIG` (copy `extract.baseUrl` only; needles as above).
2. Commit and push `cyclones_streams.json` to `main` or Worker GET 502s.
3. `cd workers/guardians-get-video` → `npx wrangler deploy` once. Do not put `FAMILY_PIN` or `GITHUB_TOKEN` again.
4. Family phones still need a new GitHub release after Cyclones is on `main`. Needle patches later do not.

## GitHub / Cloudflare inventory for the next agent

### Reuse (do not recreate)

- Cloudflare Worker name `guardians-get-video`
- Cloudflare secrets `FAMILY_PIN`, `GITHUB_TOKEN`
- App / release env `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL`, `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN`
- Listing `extract.baseUrl` already stored in `GUARDIANS_STREAM_PIPELINE_CONFIG` and `PATRIOTS_STREAM_PIPELINE_CONFIG`
- Pipeline package `scripts/guardians-stream-pipeline/`
- Dispatch token already on the Worker (`GITHUB_TOKEN` with `repository_dispatch` to `Danner36/Danner_App`)

### Create

| Item | Where | Notes |
|------|--------|--------|
| `CYCLONES_STREAM_PIPELINE_CONFIG` | GitHub repo secret | JSON above. Writes only `cyclones_streams.json` |
| `cyclones-stream-pipeline.yml` | `.github/workflows/` | Event type `cyclones-get-video` |
| `cyclones` in `MODULES` | Worker `index.js` | `eventType: 'cyclones-get-video'`, `streamsPath: 'cyclones_streams.json'`, `userAgent: 'danner-cyclones-get-video'` |
| `sport` on dispatch | Worker `client_payload` | Required so extract does not scrape the wrong same-day Iowa State row |
| `cyclones_streams.json` | Repo root, on `main` | Guide + inactive example first |
| `config.cyclones.example.json` | Pipeline folder | Same needles as the secret |

### Leave alone

- `GUARDIANS_STREAM_PIPELINE_CONFIG`
- `PATRIOTS_STREAM_PIPELINE_CONFIG`
- `guardians-stream-pipeline.yml`
- `patriots-stream-pipeline.yml`
- Guardians six-field parser and `guardians_streams.json` schema
- Patriots six-field parser

## What is known vs what must be found

### Known (wire these)

| Fact | Value |
|------|--------|
| Listing extract method | Open `baseUrl`, substring-match `<a href>` |
| Working listing team slugs | `cleveland-guardians`, `new-england-patriots` |
| Working listing folders | `/mlb/`, `/nfl/`, `/stream/` |
| ESPN Iowa State id | **66** for football, MBB, and WBB |
| ESPN Iowa State slug | `iowa-state-cyclones` for all three |
| ESPN schedule/API paths | `/college-football/`, `/mens-college-basketball/`, `/womens-college-basketball/` — **schedule only**. Do not require these as listing tokens |
| Ship-now listing needle | `iowa-state-cyclones` in every sport’s `hrefNeedles` array |
| Official date zone | America/Chicago |
| First football kickoff that can produce a listing row | Sat 2026-09-05 SEMO at Iowa State |
| First men’s hoops date on ESPN | 2026-11-02 (time TBA) |
| First women’s hoops date on ESPN | 2026-12-06 (time TBA) |

### Unknown (find on the listing when that sport’s row exists)

Do not invent these. Do not use ESPN API paths as substitutes.

| Unknown | Why it matters | When to look |
|---------|----------------|--------------|
| Listing path folder for football | Discriminates football from hoops when both say `iowa-state-cyclones` | First football row, expected around 2026-09-05 |
| Listing path folder for men’s basketball | Same | First MBB row, November 2026 |
| Listing path folder for women’s basketball | Same | First WBB row, December 2026 |
| Distinct women’s slug, if any | Some listings use a `-w` / `women` slug instead of a folder | First WBB row |
| Whether one Iowa State pattern is shared by all three | If true, a same-day Get video can open the wrong inner page until a second token is added | First time two Cyclones rows appear the same day |

Inspect path **tokens only**. Never print the listing host, full href, or `baseUrl`.

After inspect:

1. Add the observed folder or distinct slug to that sport’s array in `CYCLONES_STREAM_PIPELINE_CONFIG`.
2. Copy the same arrays into `config.cyclones.example.json`.
3. If the listing uses a new folder, add it to the extract bonus list in `extractGooz.mjs`.
4. Do not rebuild the family app. Needles are not in the Expo binary.

Example after a football inspect (folder token is illustrative, not confirmed):

```json
"football": ["iowa-state-cyclones", "/ncaaf/"]
```

Until a second token exists, all three sports share one slug. Get video can scrape the wrong Iowa State inner page on a shared day. The phone still will not attach a basketball URL to the football Play button, because the saved entry must include matching `sport`.

## Implement order

1. Hub tile, route, bundled logo.
2. ESPN merge, Chicago dates, records, featured pick, elimination.
3. Dashboard + three boards + Get video POST `{ pin, module, sport }`.
4. `cyclones_streams.json`, Worker `cyclones` + `sport` payload, workflow, example config, extract all-tokens match.
5. Tests (snapshot + 8108 + 8113 emulator Get video).
6. Product docs and hub rule change.
7. Owner creates `CYCLONES_STREAM_PIPELINE_CONFIG`. Agent redeploys Worker once. Push `cyclones_streams.json` to `main`.
8. Later, first-listing-row patch per sport (secret + example + optional extract bonus). No phone rebuild.

## Ports

| Use | Port |
|-----|------|
| Expo / shared dashboard harness | 8108 |
| Guardians Get video harness | 8111 |
| Patriots Get video harness | 8112 |
| Cyclones Get video harness | 8113 |
| Scan if 8108 is taken | 8108–8127 |

## Out of scope

- Second Worker
- Second PIN
- Second Worker origin
- Changing Guardians MLB matching
- Changing Patriots NFL matching
- Generic multi-sport engine
- Printing or vendoring the listing URL
- Claiming listing folders that have not been seen
