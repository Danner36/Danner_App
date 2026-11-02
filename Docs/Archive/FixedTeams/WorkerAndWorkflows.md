Status: ARCHIVED
Snapshot: 823d2be (2026-10-31)

# Worker and Workflows (Fixed Teams)

This is the record of the cloud side of the fixed three-team design at commit `823d2be562d252c9f3b0da305275adc6d8498f55` (`main`, 2026-10-31): the one shared Cloudflare Worker, the three stream-pipeline GitHub Actions workflows, the release workflow, and every secret and environment name they used. Values of secrets, the family PIN, the listing site, the Worker's account subdomain, and the provider player host (`GOOZ_HOST`) are withheld.

Every `path:line` below is at the pinned commit.

Permalink base: `https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/`

| Section | Permalink |
|---|---|
| Worker source | [workers/guardians-get-video/src/index.js:1-334](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/workers/guardians-get-video/src/index.js#L1-L334) |
| Worker `MODULES` | [index.js:6-22](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/workers/guardians-get-video/src/index.js#L6-L22) |
| Worker request handler | [index.js:247-334](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/workers/guardians-get-video/src/index.js#L247-L334) |
| `wrangler.toml` | [workers/guardians-get-video/wrangler.toml:1-15](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/workers/guardians-get-video/wrangler.toml#L1-L15) |
| Worker README (deploy, secrets) | [workers/guardians-get-video/README.md:1-42](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/workers/guardians-get-video/README.md#L1-L42) |
| Guardians workflow | [.github/workflows/guardians-stream-pipeline.yml:1-100](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/.github/workflows/guardians-stream-pipeline.yml#L1-L100) |
| Patriots workflow | [.github/workflows/patriots-stream-pipeline.yml:1-100](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/.github/workflows/patriots-stream-pipeline.yml#L1-L100) |
| Cyclones workflow | [.github/workflows/cyclones-stream-pipeline.yml:1-104](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/.github/workflows/cyclones-stream-pipeline.yml#L1-L104) |
| Release workflow | [.github/workflows/release.yml:1-253](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/.github/workflows/release.yml#L1-L253) |
| Release asset writer | [release/build-update-assets.mjs:1-88](https://github.com/Danner36/Danner_App/blob/823d2be562d252c9f3b0da305275adc6d8498f55/release/build-update-assets.mjs#L1-L88) |

---

## 1. End-to-end path

1. A team screen on the phone showed **Get video** inside the 15-minute window when the build had both `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` and `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN`.
2. The phone POSTed `{ pin }`, `{ module: "patriots", pin }`, or `{ module: "cyclones", pin, sport }` to `<Worker origin>/get-video`.
3. The Worker validated module and sport, rate-limited, checked the PIN, and sent a `repository_dispatch` with the module's event type.
4. The module's workflow ran `scripts/guardians-stream-pipeline/run.mjs`, which published the module's root streams file through the contents API.
5. Meanwhile the phone polled `<Worker origin>/streams[?module=...]` every 5 s for up to 5 minutes. The Worker read the file from `main` through the contents API with an ETag cache.
6. A matching entry turned Get video into Play.

The Worker was the only cloud component the phone called. It had no storage bindings (no KV, R2, D1, or Durable Objects). The streams files in the public repo were the data store.

---

## 2. Cloudflare Worker `guardians-get-video`

### 2.1 Files

| File | Content |
|---|---|
| `workers/guardians-get-video/src/index.js` | 334 lines, ES module default export `{ fetch(request, env) }` |
| `workers/guardians-get-video/wrangler.toml` | `name = "guardians-get-video"`, `main = "src/index.js"`, `compatibility_date = "2026-08-25"` (comment: "Cloudflare runtime pin only. Does not limit Guardians game dates."), `[vars] GITHUB_REPO = "Danner36/Danner_App"`, and a commented-out `RATE_LIMITER` binding |
| `workers/guardians-get-video/package.json` | `"type": "module"`, scripts `deploy: wrangler deploy`, `dev: wrangler dev`, devDependency `wrangler ^4.28.0`, no runtime dependencies |
| `workers/guardians-get-video/README.md` | Deploy commands, secrets table, curl checks |
| `workers/README.md` | One line per Worker: "Missing or `guardians` module starts the Guardians pipeline. `patriots` starts the Patriots pipeline. `cyclones` starts the Cyclones pipeline and requires `sport`." |

The Worker kept its original Guardians name after Patriots and Cyclones were added; the origin `https://guardians-get-video.<account>.workers.dev` was baked into every installed build. There were no Worker tests in the repo; the per-team app harnesses mocked its contract (see [TestsAndRules.md](TestsAndRules.md)).

### 2.2 Constants (`index.js:1-28`)

| Name | Value |
|---|---|
| `RATE_WINDOW_MS` | `10 * 60 * 1000` (10 minutes) |
| `RATE_MAX` | `3` |
| `RATE_BUCKET_MAX` | `10_000` |
| `rateBuckets` | `new Map()` in isolate memory |
| `CYCLONES_SPORTS` | `football`, `mens-basketball`, `womens-basketball` |
| `streamsCache` | `new Map()` in isolate memory, keyed by module (`index.js:177-178`) |

### 2.3 `MODULES` (`index.js:6-22`)

| Module | `eventType` (dispatch type) | `streamsPath` | `userAgent` header |
|---|---|---|---|
| `guardians` | `guardians-get-video` | `guardians_streams.json` | `danner-guardians-get-video` |
| `patriots` | `patriots-get-video` | `patriots_streams.json` | `danner-patriots-get-video` |
| `cyclones` | `cyclones-get-video` | `cyclones_streams.json` | `danner-cyclones-get-video` |

### 2.4 Validation helpers

| Helper | Lines | Behavior |
|---|---|---|
| `resolveModule(value)` | 147-155 | `undefined`, `null`, or `''` returned `guardians` (builds that sent only `{ pin }` and Guardians `/streams` with no query). `guardians`, `patriots`, `cyclones` returned themselves. Anything else returned `undefined` and the caller answered 400. This allowlist was the only thing between a request and a GitHub path or event type |
| `resolveCyclonesSport(value)` | 157-161 | String membership in `CYCLONES_SPORTS` |
| `readJsonObjectBody(request)` | 163-175 | Invalid JSON, `null`, and arrays returned `undefined`, answered with a JSON 400 instead of Cloudflare's HTML error page |
| `pinMatches(candidate, expected)` | 132-145 | Constant-time compare: XOR of lengths, then XOR of every char code over the expected length |
| `json(data, status)` | 30-38 | Body `JSON.stringify(data) + "\n"`, headers `Cache-Control: no-store`, `Content-Type: application/json; charset=utf-8`. No CORS headers (callers were native apps) |

### 2.5 Routes

| Method and path | Request | Success | Errors |
|---|---|---|---|
| `GET /health` (251-255) | none | `200 text/plain` body `ok` | none |
| `GET /streams?module=<m>` (257-281) | Optional `module` query; missing meant `guardians`. No PIN, no rate limit | `200`, body = the raw streams file text from GitHub, `Cache-Control: no-store`, `Content-Type: application/json; charset=utf-8` | `400 {"error":"Unknown module."}`; `500 {"error":"Worker secrets are not configured."}` when `GITHUB_TOKEN` was unset; `502 {"error":"GitHub streams read failed with <status>: <GitHub body>"}`. A missing file answered 502, not 404 |
| `POST /get-video` (283-332) | JSON object `{ pin: string, module?: "guardians" \| "patriots" \| "cyclones", sport?: <Cyclones sport> }` | `200 {"message":"Pipeline started.","module":"<m>","ok":true}` plus `"sport":"<s>"` for Cyclones | See 2.6 |
| anything else (283-285) | none | none | `404 {"error":"Not found."}` |

### 2.6 `POST /get-video` check order (`index.js:287-332`)

| Order | Check | Response on failure |
|---|---|---|
| 1 | `FAMILY_PIN` and `GITHUB_TOKEN` are set | `500 {"error":"Worker secrets are not configured."}` |
| 2 | Body is a JSON object | `400 {"error":"Request body must be a JSON object."}` |
| 3 | `resolveModule(body.module)` | `400 {"error":"Unknown module."}` |
| 4 | Cyclones only: `resolveCyclonesSport(body.sport)` | `400 {"error":"Unknown sport."}` |
| 5 | Rate limit by client key | `429 {"error":"Too many requests."}` |
| 6 | `pinMatches(pin, FAMILY_PIN)`; a non-string `pin` counted as `''` | `401 {"error":"Unauthorized."}` |
| 7 | `dispatchGetVideo` returned 204 | `502 {"error":"GitHub dispatch failed with <status>: <GitHub body>"}` |

The rate limit ran before the PIN on purpose. The comment (306-307): "Rate limit before checking the PIN. The other way round, a wrong PIN costs nothing and the family PIN can be guessed without limit."

`sport` was ignored for Guardians and Patriots.

### 2.7 Rate limiting (`index.js:40-130`)

Client key (`rateLimitKey`, 79-93) from `CF-Connecting-IP`:

| Address | Key |
|---|---|
| empty header | `unknown` |
| IPv4, or IPv4-mapped `::ffff:a.b.c.d` | `v4:<a.b.c.d>` (each octet at most 255) |
| IPv6 that parsed | `v6:<first four hextets, zero-padded>::/64` (embedded IPv4 tails and `::` compression handled; zone id after `%` dropped) |
| anything else | `raw:<lower-cased address>` |

The comment (79-80): "One bucket per IPv4 address and per IPv6 /64, the block a single subscriber is normally given. Keying on the full IPv6 address would let one client rotate through its /64." The key did not include the module or sport, so all three teams shared one bucket per household address.

`rateLimited(env, key)` (120-130) used `env.RATE_LIMITER.limit({ key })` when that binding existed and fell back to the in-memory limiter on absence or error. The binding was commented out in `wrangler.toml:9-15` (`[[unsafe.bindings]]`, `name = "RATE_LIMITER"`, `type = "ratelimit"`, `namespace_id = "1001"`, `simple = { limit = 3, period = 60 }`), so production ran the in-memory limiter.

In-memory limiter (`rateLimitedInMemory`, 106-118): sliding window of timestamps per key; three accepted presses per 10 minutes per key per isolate; a fourth answered 429 without recording. `pruneRateBuckets` (95-104) ran only when the map reached `RATE_BUCKET_MAX` entries and deleted keys whose stamps were all older than the window.

### 2.8 `GET /streams` source (`fetchStreamsDocument`, `index.js:180-215`)

- `GET https://api.github.com/repos/<GITHUB_REPO>/contents/<streamsPath>?ref=main`, `GITHUB_REPO` defaulting to `Danner36/Danner_App`.
- Headers: `Accept: application/vnd.github.raw`, `Authorization: Bearer <GITHUB_TOKEN>`, the module's `User-Agent`, `X-GitHub-Api-Version: 2022-11-28`, and `If-None-Match: <etag>` when the isolate had a cached body for that module.
- `304` with a cached body returned the cached body. The comment (197-199): "A 304 does not count against the token's rate limit, and GitHub only sends one when the file genuinely has not changed. So this cuts quota use without adding any staleness -- unlike a TTL cache, which would undo the Get video freshness fix this endpoint exists for."
- Non-OK threw `GitHub streams read failed with <status>: <body>`.
- `200` stored `{ body, etag }` per module when an `ETag` header was present.
- The branch was always `main`; the Worker did not read `github.branch` from any config.

### 2.9 Dispatch (`dispatchGetVideo`, `index.js:217-245`)

```http
POST https://api.github.com/repos/Danner36/Danner_App/dispatches
Accept: application/vnd.github+json
Authorization: Bearer <GITHUB_TOKEN>
User-Agent: danner-<module>-get-video
X-GitHub-Api-Version: 2022-11-28

{"client_payload":{"module":"<module>","source":"phone","sport":"<only for cyclones>"},"event_type":"<module>-get-video"}
```

Only `204` counted as success. The same personal access token served both the contents reads and the dispatch.

### 2.10 Phone clients of the Worker

| Module | Streams URL | Get video body | Source |
|---|---|---|---|
| Guardians | `<origin>/streams` | `{ "pin": "<family PIN>" }` | `app/guardians/guardiansGetVideo.ts:17-22`, `44` |
| Patriots | `<origin>/streams?module=patriots` | `{ "module": "patriots", "pin": "<family PIN>" }` | `app/patriots/patriotsGetVideo.ts:21`, `49` |
| Cyclones | `<origin>/streams?module=cyclones` | `{ "module": "cyclones", "pin": "<family PIN>", "sport": "<sport>" }` | `app/cyclones/cyclonesGetVideo.ts:22`, `53-57` |

Shared client constants (each module's `*GetVideo.ts`): `POLL_INTERVAL_MS = 5_000`, `POLL_TIMEOUT_MS = 300_000`, `REQUEST_TIMEOUT_MS = 20_000`. The phone treated `401` as "Get video is not authorized.", `429` as "a run is already in progress" and kept polling, and any other non-OK as "Get video could not start." Because the Worker's 429 bucket was per address across all modules, a 429 caused by another team's press still led to a 5-minute poll.

The trailing slash on the origin was stripped before `/streams` and `/get-video` were appended.

### 2.11 Deploy (`workers/guardians-get-video/README.md:5-15`)

Deploy was manual, run in PowerShell on the owner's Windows development PC (`AI_Framework/AI_RULES.md:13`):

```powershell
cd workers/guardians-get-video
npx wrangler login
npx wrangler deploy
npx wrangler secret put FAMILY_PIN
npx wrangler secret put GITHUB_TOKEN
```

`GITHUB_REPO` came from `wrangler.toml`. The README's checks:

```powershell
curl https://guardians-get-video.<account>.workers.dev/health
curl https://guardians-get-video.<account>.workers.dev/streams
curl "https://guardians-get-video.<account>.workers.dev/streams?module=patriots"
curl "https://guardians-get-video.<account>.workers.dev/streams?module=cyclones"
curl -X POST https://guardians-get-video.<account>.workers.dev/get-video -H "Content-Type: application/json" -d "{\"pin\":\"YOUR_PIN\"}"
curl -X POST https://guardians-get-video.<account>.workers.dev/get-video -H "Content-Type: application/json" -d "{\"pin\":\"YOUR_PIN\",\"module\":\"patriots\"}"
curl -X POST https://guardians-get-video.<account>.workers.dev/get-video -H "Content-Type: application/json" -d "{\"pin\":\"YOUR_PIN\",\"module\":\"cyclones\",\"sport\":\"football\"}"
```

The README recorded that live `GET /streams?module=cyclones` read `cyclones_streams.json` from `main` after the 2026-09-04 deploy.

---

## 3. Stream pipeline workflows

Three files, one per module, identical apart from about six parameters.

### 3.1 Shared skeleton (Guardians and Patriots line numbers; Cyclones is offset by 2 to 4 lines)

| Part | Content | Lines |
|---|---|---|
| Triggers | `workflow_dispatch` with inputs `dry_run` (boolean, default false, "Extract and log without writing `<file>`") and `force` (boolean, default false, "Run even outside the 15-minute pregame window"); `repository_dispatch` with `types: [<module>-get-video]` | 3-17 |
| Permissions | `contents: write` | 19-20 |
| Concurrency | `group: <module>-stream-pipeline`, `cancel-in-progress: false` | 25-27 |
| Job | `extract`, name `Extract and publish <Team> stream`, `runs-on: ubuntu-latest`, `timeout-minutes: 15` | 29-33 |
| Job env | `TZ` (comment: "Official dates are `<zone>` calendar dates; the pipeline also computes them explicitly.") | 34-36 |

Steps:

| # | Name | Content | Lines |
|---|---|---|---|
| 1 | Check out source | `actions/checkout@v5` | 38-39 |
| 2 | Set up Node | `actions/setup-node@v6`, `node-version: 24`, `cache: npm`, `cache-dependency-path: scripts/guardians-stream-pipeline/package-lock.json` | 41-46 |
| 3 | Write pipeline config | In `scripts/guardians-stream-pipeline`, env `<MODULE>_STREAM_PIPELINE_CONFIG: ${{ secrets.<MODULE>_STREAM_PIPELINE_CONFIG }}`; if empty, `echo "<SECRET> secret is not set; using <example>."` and `cp <example> config.json`; else `printf '%s' "$<SECRET>" > config.json` | 48-58 |
| 4 | Check pipeline config | env `GUARDIANS_STREAM_CONFIG: config.json`, `PIPELINE_MODULE: <module>` (Cyclones also `DISPATCH_SPORT`); `node run.mjs --check-config` | 60-65 |
| 5 | Install pipeline packages | `npm ci` | 67-69 |
| 6 | Restore Playwright browser | `actions/cache@v4`, `path: ~/.cache/ms-playwright`, `key: ${{ runner.os }}-playwright-${{ hashFiles('scripts/guardians-stream-pipeline/package-lock.json') }}` | 71-76 |
| 7 | Install Playwright browser | On cache miss: `npx playwright install chromium --with-deps` | 78-81 |
| 8 | Install Playwright system dependencies | On cache hit: `npx playwright install-deps chromium` | 83-86 |
| 9 | Install xvfb | `sudo apt-get update && sudo apt-get install -y xvfb` | 88-89 |
| 10 | Run pipeline | env `EXTRACT_HEADED: '1'`, `GITHUB_TOKEN: ${{ github.token }}`, `GUARDIANS_STREAM_CONFIG: config.json`, `PIPELINE_MODULE: <module>`, `DRY_RUN: ${{ github.event_name == 'workflow_dispatch' && inputs.dry_run && '1' \|\| '0' }}`, `FORCE:` same pattern with `inputs.force` (Cyclones also `DISPATCH_SPORT`); `xvfb-run -a node run.mjs` | 91-100 |

The secret was passed through `env:` and written with `printf`, never interpolated into the script. `DISPATCH_SPORT` used the same `env:` pattern, so a payload value never reached the shell as code. `DRY_RUN` and `FORCE` could be set only by a manual run; a phone dispatch always ran a normal publish.

Commits made with `github.token` did not trigger other workflows.

### 3.2 Differences between the three files

| Item | Guardians | Patriots | Cyclones |
|---|---|---|---|
| `name` | `Guardians stream pipeline` | `Patriots stream pipeline` | `Cyclones stream pipeline` |
| `dry_run` description file | `guardians_streams.json` | `patriots_streams.json` | `cyclones_streams.json` |
| Extra input | none | none | `sport` (string, default `football`, "Featured sport to extract (football, mens-basketball, womens-basketball)") at 16-20 |
| `repository_dispatch` type | `guardians-get-video` (17) | `patriots-get-video` (17) | `cyclones-get-video` (22) |
| Concurrency group | `guardians-stream-pipeline` (26) | `patriots-stream-pipeline` (26) | `cyclones-stream-pipeline` (28) |
| Concurrency comment | "Caps this pipeline at one running plus one queued run, no matter how many dispatches arrive. GitHub keeps only the newest pending run per group and cancels the rest, so a flood of triggers collapses instead of queueing 15-minute Playwright jobs." (22-24) | "Kept separate from the Guardians group: the two write different files through the contents API, so they can safely run at the same time." (22-24) | none |
| Job name | `Extract and publish Guardians stream` | `... Patriots stream` | `... Cyclones stream` |
| `TZ` | `America/New_York` (36) | `America/New_York` (36) | `America/Chicago` (38) |
| Config secret | `GUARDIANS_STREAM_PIPELINE_CONFIG` (51) | `PATRIOTS_STREAM_PIPELINE_CONFIG` (51) | `CYCLONES_STREAM_PIPELINE_CONFIG` (53) |
| Fallback example | `config.example.json` | `config.patriots.example.json` | `config.cyclones.example.json` |
| `PIPELINE_MODULE` | `guardians` (64, 97) | `patriots` (64, 97) | `cyclones` (66, 100) |
| `DISPATCH_SPORT` | none | none | `${{ github.event.client_payload.sport \|\| inputs.sport \|\| 'football' }}` (67, 101) |
| File length | 100 lines | 100 lines | 104 lines |

Cyclones used one concurrency group for all three sports, so a pending football run could be replaced by a newer basketball dispatch.

### 3.3 Observed run times

From the Actions run list at the snapshot: successful `repository_dispatch` runs took about 45-70 s end to end (for example Cyclones 2026-10-31 22:49:42Z to 22:50:38Z). A Guardians run on 2026-10-05 failed at the 15-minute job timeout and the retry took about 12 minutes. Patriots had seven failed runs between 02:42Z and 03:08Z on 2026-09-10 before a success at 03:23Z. Release runs took about 10-12 minutes.

### 3.4 Other registered workflow

The Actions API listed an active workflow named `iOS compile check` at `.github/workflows/ios-compile-check.yml` that last ran on 2026-10-04. The file was not in the tree at the snapshot.

---

## 4. `release.yml` (Build and publish Danner Apps)

### 4.1 Triggers and top level (`release.yml:1-18`)

- `push` of tags matching `v*`, or `workflow_dispatch` with required string input `release_tag` ("Existing release tag to build and publish").
- Top-level `permissions: contents: read`.
- `env.RELEASE_TAG: ${{ inputs.release_tag || github.ref_name }}`.

### 4.2 Jobs

| Job | Runner | Steps |
|---|---|---|
| `android` "Build Android APK" (21-83) | `ubuntu-latest`, default working directory `app` | Validate the tag against `^v(0\|[1-9][0-9]{0,4})\.(0\|[1-9][0-9]?)\.(0\|[1-9][0-9]?)$`; checkout `refs/tags/<tag>` with `persist-credentials: false`; Node 24 with npm cache on `app/package-lock.json`; Java Temurin 17; `npm ci`; `npx expo prebuild --platform android --clean`; `./android/gradlew --no-daemon -p android app:assembleRelease`; copy `android/app/build/outputs/apk/release/app-release.apk` to `Danner-Apps-Android.apk`; upload artifact `android-release` |
| `ios` "Build SideStore IPA" (85-178) | `macos-latest`, default working directory `app` | Same tag validation and checkout; Node 24; `npm ci`; `npx expo prebuild --platform ios --clean`; `xcodebuild` on the first non-`Pods-` scheme of the workspace with `-configuration Release -sdk iphoneos -destination 'generic/platform=iOS'`, `CODE_SIGNING_ALLOWED=NO`, `CODE_SIGNING_REQUIRED=NO`, errors surfaced as `::error::` lines; package `Payload/<app>.app` with `ditto -c -k --sequesterRsrc --keepParent` into `Danner-Apps-iOS.ipa` and `unzip -t`; upload artifact `ios-release` |
| `release` "Publish GitHub release" (180-253) | `ubuntu-latest`, `needs: [android, ios]`, `permissions: contents: write` | Checkout the tag; download both artifacts into `release-assets`; copy `release/IPHONE_SETUP.md`; `node release/build-update-assets.mjs "<tag>" <apk> <ipa> release-assets` (env `GITHUB_REPOSITORY`, `RELEASE_TAG`); `sha256sum` both binaries into `SHA256SUMS.txt`; decide Latest; `gh release create` |

Env passed to both prebuild and build steps of both platform jobs (`release.yml:59-73`, `117-130`):

| Name | Source |
|---|---|
| `EXPO_PUBLIC_APP_VERSION` | `env.RELEASE_TAG` |
| `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` | `secrets.EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` |
| `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` | `secrets.EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` |
| `RELEASE_TAG` | `env.RELEASE_TAG` |

`app/app.config.js:18` read `RELEASE_TAG`; `app/hub/releaseVersion.js:9` held the same tag pattern with an optional leading `v` and computed `versionCode = major * 10000 + minor * 100 + patch`. `tests/app-update/run.mjs:270` read `release.yml` to keep the shell regex equal to the JavaScript one.

Decide Latest (220-236): the highest `v*` tag from `git ls-remote --tags --refs origin`, filtered by the same pattern and `sort -V`. Equal to the release tag: `--latest`; otherwise `--latest=false` with a notice.

Create release (238-253), with `GH_TOKEN: ${{ github.token }}`:

```bash
gh release create "${RELEASE_TAG}" \
  release-assets/Danner-Apps-Android.apk \
  release-assets/Danner-Apps-iOS.ipa \
  release-assets/IPHONE_SETUP.md \
  release-assets/SHA256SUMS.txt \
  release-assets/version-manifest.json \
  release-assets/sidestore-source.json \
  --verify-tag "${LATEST_FLAG}" \
  --title "Danner Apps ${RELEASE_TAG}" \
  --notes-file release/RELEASE_NOTES.md
```

### 4.3 Release assets

| Asset | Origin |
|---|---|
| `Danner-Apps-Android.apk` | `android` job (release build signed with the Expo debug keystore, per `AI_Framework/AI_RULES.md:62`) |
| `Danner-Apps-iOS.ipa` | `ios` job, unsigned; SideStore signed it on the phone |
| `IPHONE_SETUP.md` | Copy of `release/IPHONE_SETUP.md` |
| `SHA256SUMS.txt` | `sha256sum` of the APK and IPA |
| `version-manifest.json` | `release/build-update-assets.mjs` |
| `sidestore-source.json` | `release/build-update-assets.mjs` |
| Release body | `release/RELEASE_NOTES.md` |

### 4.4 `version-manifest.json` (`build-update-assets.mjs:37-52`, `81-84`)

```json
{
  "version": "<major.minor.patch>",
  "tag": "<vMAJOR.MINOR.PATCH>",
  "android": { "versionCode": <code>, "url": "https://github.com/<repo>/releases/download/<tag>/Danner-Apps-Android.apk", "sha256": "<hex>", "size": <bytes> },
  "ios": { "versionCode": <code>, "url": "https://github.com/<repo>/releases/download/<tag>/Danner-Apps-iOS.ipa", "sha256": "<hex>", "size": <bytes> }
}
```

`<repo>` was `GITHUB_REPOSITORY`, falling back to `Danner36/Danner_App`. The script refused a tag that did not start with `v` or failed `parseReleaseVersion`. The phone read this file from `https://github.com/Danner36/Danner_App/releases/latest/download/version-manifest.json` unless `EXPO_PUBLIC_APP_UPDATE_MANIFEST_URL` overrode it (`app/hub/appUpdate.ts:5-7`).

### 4.5 `sidestore-source.json` (`build-update-assets.mjs:54-79`, `85-88`)

```json
{
  "name": "Danner Apps",
  "identifier": "com.danner.locationhelper.source",
  "sourceURL": "https://github.com/<repo>/releases/latest/download/sidestore-source.json",
  "apps": [{
    "name": "Danner Apps",
    "bundleIdentifier": "com.danner.locationhelper",
    "developerName": "Danner",
    "subtitle": "Danner family tools",
    "localizedDescription": "Guardians, Patriots, and TV Location.",
    "iconURL": "https://raw.githubusercontent.com/<repo>/main/Docs/Art/media/ic_launcher_danner.jpg",
    "tintColor": "1F6F55",
    "versions": [{ "version": "<version>", "buildVersion": "<versionCode>", "date": "<YYYY-MM-DD>", "localizedDescription": "Danner Apps <tag>", "downloadURL": "<ipa url>", "size": <bytes> }]
  }]
}
```

The SideStore description still named only Guardians, Patriots, and TV Location at the snapshot.

---

## 5. Secrets and environment inventory

Names only. No values appear in this archive.

### 5.1 Secrets

| Name | Kind | Where it lived | Read by | Purpose |
|---|---|---|---|---|
| `FAMILY_PIN` | Cloudflare Worker secret | Worker `guardians-get-video` | `index.js:287`, `312` | Family PIN checked on `POST /get-video` |
| `GITHUB_TOKEN` (Worker) | Cloudflare Worker secret | Worker `guardians-get-video` | `index.js:189`, `230`, `262`, `287` | Personal access token for contents reads and `repository_dispatch`. Classic `repo` scope, or fine-grained Contents read and write on `Danner_App` (`workers/guardians-get-video/README.md:22`) |
| `GUARDIANS_STREAM_PIPELINE_CONFIG` | GitHub Actions repository secret | `Danner36/Danner_App` | `guardians-stream-pipeline.yml:51` | Guardians pipeline config JSON, including `extract.baseUrl` |
| `PATRIOTS_STREAM_PIPELINE_CONFIG` | GitHub Actions repository secret | `Danner36/Danner_App` | `patriots-stream-pipeline.yml:51` | Patriots pipeline config JSON (`sport: "nfl"`) |
| `CYCLONES_STREAM_PIPELINE_CONFIG` | GitHub Actions repository secret | `Danner36/Danner_App` | `cyclones-stream-pipeline.yml:53` | Cyclones pipeline config JSON (`sport: "cyclones"`, per-sport needles) |
| `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` | GitHub Actions repository secret | `Danner36/Danner_App` | `release.yml:63`, `71`, `121`, `129` | Worker origin without a trailing slash, baked into builds. Used by all three modules despite the name |
| `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` | GitHub Actions repository secret | `Danner36/Danner_App` | `release.yml:62`, `70`, `120`, `128` | Same value as `FAMILY_PIN`, baked into builds. As an `EXPO_PUBLIC_` value it was compiled into the JavaScript bundle |
| `github.token` | Built-in Actions token | per run | stream workflows as `GITHUB_TOKEN` (95/98); release as `GH_TOKEN` (240) | Contents read and PUT for the pipeline; `gh release create` |

### 5.2 Non-secret configuration

| Name | Kind | Where | Purpose |
|---|---|---|---|
| `GITHUB_REPO` | Worker `[vars]` | `wrangler.toml:6-7` | `Danner36/Danner_App`; also the code default |
| `RATE_LIMITER` | Optional Worker rate-limit binding | `wrangler.toml:9-15` (commented out) | Cross-isolate limit; not bound at the snapshot |
| `compatibility_date` | Worker config | `wrangler.toml:4` | `2026-08-25` |

### 5.3 Workflow and pipeline environment

| Name | Set by | Read by |
|---|---|---|
| `TZ` | Each stream workflow (job env) | Node process |
| `GUARDIANS_STREAM_CONFIG` | Stream workflows (`config.json`) | `run.mjs:38` |
| `PIPELINE_MODULE` | Stream workflows | `run.mjs:80`, `pipeline.mjs:407-408` |
| `DISPATCH_SPORT` | Cyclones workflow | `run.mjs:75`, `pipeline.mjs:405-406` |
| `DRY_RUN`, `FORCE` | Stream workflows (manual runs only) | `run.mjs:39-40` |
| `EXTRACT_HEADED` | Stream workflows (`'1'`) | `extractGooz.mjs:522` |
| `EXTRACT_HEADLESS` | Local use | `extractGooz.mjs:519` |
| `GITHUB_ACTIONS` | Actions runner | `extractGooz.mjs:525` |
| `GUARDIANS_PIPELINE_PORT` | Local use | `control-server.mjs:13` |
| `RELEASE_TAG` | `release.yml` | `app/app.config.js:18`, `build-update-assets.mjs` (as argv) |
| `GITHUB_REPOSITORY` | `release.yml` step env | `build-update-assets.mjs:27` |
| `GH_TOKEN`, `LATEST_FLAG` | `release.yml:239-241` | `gh release create` |

### 5.4 App build-time and development environment

| Name | Set by | Read at | Notes |
|---|---|---|---|
| `EXPO_PUBLIC_APP_VERSION` | `release.yml` (tag) | `app/hub/appUpdate.ts:37` | Embedded version for the update prompt |
| `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` | `release.yml` (secret) | `app/guardians/guardiansGetVideo.ts:7`, `app/patriots/patriotsGetVideo.ts:7`, `app/cyclones/cyclonesGetVideo.ts:8` | Shared Worker origin |
| `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` | `release.yml` (secret) | `guardiansGetVideo.ts:8`, `patriotsGetVideo.ts:8`, `cyclonesGetVideo.ts:9` | Shared PIN |
| `EXPO_PUBLIC_APP_UPDATE_MANIFEST_URL` | not set by the release | `app/hub/appUpdate.ts:5-7` | Override for the manifest URL |
| `EXPO_PUBLIC_GUARDIANS_TEST_URL`, `EXPO_PUBLIC_GUARDIANS_SOURCES_URL` | Test drivers | `app/guardians/GuardiansScreen.tsx:97-103` | Honored only under `__DEV__` |
| `EXPO_PUBLIC_PATRIOTS_TEST_URL`, `EXPO_PUBLIC_PATRIOTS_SOURCES_URL` | Test drivers | `app/patriots/PatriotsScreen.tsx:95-96` | Honored only under `__DEV__` |
| `EXPO_PUBLIC_CYCLONES_TEST_URL`, `EXPO_PUBLIC_CYCLONES_SOURCES_URL` | Test drivers | `app/cyclones/CyclonesScreen.tsx:100-101` | Honored only under `__DEV__` |
| `GUARDIANS_HARNESS_PORT`, `PATRIOTS_HARNESS_PORT`, `CYCLONES_HARNESS_PORT` | Local use | `tests/<team>/server.mjs:4` | Fixture server port, default `8108` |

---

## 6. Fixed-design facts that shaped behavior

- The Worker allowlist, the dispatch event types, the workflow files, the config secrets, the concurrency groups, the `TZ` values, and the streams paths were all one-per-module constants. A fourth team needed a Worker redeploy, a new workflow, a new secret, a new root file, and an app release.
- `GET /streams` had no PIN and no rate limit; `POST /get-video` was limited per address across all modules.
- A missing streams file made `GET /streams` answer 502.
- The Worker name, its origin, the `module` values, and the raw root file paths were compiled into installed builds.
- No CI job ran any test; `release.yml` built whatever the tag held.
