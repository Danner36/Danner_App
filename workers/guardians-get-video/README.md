# guardians-get-video

Cloudflare Worker that the Guardians app calls when **Get video** is tapped. It checks the family PIN, then starts `.github/workflows/guardians-stream-pipeline.yml` through `repository_dispatch` type `guardians-get-video`. The Action extracts a gooz URL and publishes `guardians_streams.json`. Game dates come from MLB, not from this file. `GET /streams` returns the current GitHub file with no store cache so phones do not wait on raw.githubusercontent.com. That route exists on the phone and in this Worker source; it is live only after this Worker version is deployed.

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
| `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` | GitHub Actions secret for `release.yml` | Worker origin, for example `https://guardians-get-video.<account>.workers.dev` with no trailing slash |
| `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` | GitHub Actions secret for `release.yml` | Same value as `FAMILY_PIN` |

## Check

```powershell
curl https://guardians-get-video.<account>.workers.dev/health
curl https://guardians-get-video.<account>.workers.dev/streams
curl -X POST https://guardians-get-video.<account>.workers.dev/get-video -H "Content-Type: application/json" -d "{\"pin\":\"YOUR_PIN\"}"
```

A 200 response starts the Action. The phone reloads the stream list from `GET /streams` until Play appears.
