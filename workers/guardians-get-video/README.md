# guardians-get-video

Cloudflare Worker that the Guardians app calls when **Get video** is tapped. It checks the family PIN, then starts the GitHub Actions workflow `guardians-get-video`. The Action extracts a gooz URL and publishes `guardians_streams.json`. Game dates come from MLB, not from this file.

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
| `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` | EAS / production app env | Worker origin, for example `https://guardians-get-video.<account>.workers.dev` with no trailing slash |
| `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` | EAS / production app env | Same value as `FAMILY_PIN` |

## Check

```powershell
curl https://guardians-get-video.<account>.workers.dev/health
curl -X POST https://guardians-get-video.<account>.workers.dev/get-video -H "Content-Type: application/json" -d "{\"pin\":\"YOUR_PIN\"}"
```

A 200 response starts the Action. The phone then reloads `guardians_streams.json` until Play appears.
