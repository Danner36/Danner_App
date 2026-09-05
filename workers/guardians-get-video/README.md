# guardians-get-video

Shared Cloudflare Worker that Guardians, Patriots, and Cyclones call when **Get video** is tapped. It checks the family PIN, then starts the matching GitHub Action. Missing or `guardians` `module` dispatches `guardians-get-video` and serves `guardians_streams.json`. `module: "patriots"` dispatches `patriots-get-video` and serves `patriots_streams.json`. `module: "cyclones"` requires `sport` (`football`, `mens-basketball`, or `womens-basketball`), dispatches `cyclones-get-video`, and serves `cyclones_streams.json`. Game dates come from MLB or ESPN, not from this file. `GET /streams` returns the current GitHub file for that module with no store cache. Live `GET /streams?module=cyclones` reads `cyclones_streams.json` from `main` after the 2026-09-04 deploy.

## Deploy

```powershell
cd workers/guardians-get-video
npx wrangler login
npx wrangler deploy
npx wrangler secret put FAMILY_PIN
npx wrangler secret put GITHUB_TOKEN
```

`GITHUB_REPO` is already `Danner36/Danner_App` in `wrangler.toml`.

## Secrets

| Name | Where | Purpose |
|------|--------|---------|
| `FAMILY_PIN` | Cloudflare Worker secret | Must match the app build PIN |
| `GITHUB_TOKEN` | Cloudflare Worker secret | PAT that can send `repository_dispatch` to `Danner_App` (classic `repo` scope, or fine-grained Actions write on that repo) |
| `GUARDIANS_STREAM_PIPELINE_CONFIG` | GitHub repo secret | JSON with `extract.baseUrl` and `extract.hrefNeedle`. Copy from `scripts/guardians-stream-pipeline/config.example.json` and set the real listing URL |
| `PATRIOTS_STREAM_PIPELINE_CONFIG` | GitHub repo secret | Same listing `extract.baseUrl` as Guardians, with `sport: "nfl"`, `hrefNeedle: "new-england-patriots"`, and `streamsPath: "patriots_streams.json"` |
| `CYCLONES_STREAM_PIPELINE_CONFIG` | GitHub repo secret | Same listing `extract.baseUrl` as Guardians, with `sport: "cyclones"`, per-sport `hrefNeedles`, and `streamsPath: "cyclones_streams.json"` |
| `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` | GitHub Actions secret for `release.yml` | Worker origin, for example `https://guardians-get-video.<account>.workers.dev` with no trailing slash |
| `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` | GitHub Actions secret for `release.yml` | Same value as `FAMILY_PIN` |

## Check

```powershell
curl https://guardians-get-video.<account>.workers.dev/health
curl https://guardians-get-video.<account>.workers.dev/streams
curl "https://guardians-get-video.<account>.workers.dev/streams?module=patriots"
curl "https://guardians-get-video.<account>.workers.dev/streams?module=cyclones"
curl -X POST https://guardians-get-video.<account>.workers.dev/get-video -H "Content-Type: application/json" -d "{\"pin\":\"YOUR_PIN\"}"
curl -X POST https://guardians-get-video.<account>.workers.dev/get-video -H "Content-Type: application/json" -d "{\"pin\":\"YOUR_PIN\",\"module\":\"patriots\"}"
curl -X POST https://guardians-get-video.<account>.workers.dev/get-video -H "Content-Type: application/json" -d "{\"pin\":\"YOUR_PIN\",\"module\":\"cyclones\",\"sport\":\"football\"}"
```

A 200 response starts the Action. The phone reloads the stream list from `GET /streams` until Play appears.
