# team-worker

Source for the Worker v2 contract: `GET /health`, `GET /catalog[/<league>]`, `GET /streams?team=<key>[&event=<id>]`, `POST /get-video`, `POST /run-status` and `POST /run-progress`. The contract, codes and limits are in `Docs/Production/ModularTeams.md` under Worker v2.

- `src/index.js` is the Cloudflare entry. It exports the handler and the two Durable Object classes.
- `src/app.js` holds the routes and the order of checks. `catalog.js`, `streams.js`, `events.js`, `gates.js` and `github.js` are pure modules that run under plain Node.
- `src/durable.js` holds the `TeamGate` and `GlobalGate` shells and imports `cloudflare:workers`, so the Node tests do not load it.
- `/get-video` checks the app key before any GitHub, ESPN or statsapi call. Shape checks run first; the catalog entry and sport are checked right after the key.
- `/run-status` and `/run-progress` take the hex HMAC-SHA256 of the exact body in header `X-Signature`, and an `at` field (epoch seconds, epoch milliseconds or ISO 8601) within 300 s. A team outside the catalog is refused before any Durable Object call.
- Without Durable Object bindings, the same gates run in memory per isolate with the same limits. A bound Durable Object that fails on a key attempt or a reservation answers `503 busy`. Without the `READ_LIMITER` binding, or when it fails, reads use a per-isolate count of 120 per 60 s per IP.

## Tests

```powershell
node --test "workers/team-worker/test/*.test.mjs"
```

The tests use a fake GitHub, ESPN and statsapi and need no Cloudflare account. `test/world.mjs` holds the fixtures, in the shape `scripts/team-catalog/build.mjs` writes.

## Deploy

`.github/workflows/worker-deploy.yml`, started by hand. `target=staging` deploys `guardians-get-video-staging`; `target=production` replaces `guardians-get-video`. Staging deploys with `GLOBAL_DISPATCH_PER_HOUR` set to 0, so a press there stops at `503 busy` after the key, catalog and window checks and never dispatches. Secrets go up before the code. `[vars]` come from `wrangler.toml`, so a limit change is an edit there and a redeploy.

| Worker secret | From repository secret |
|---|---|
| `APP_KEY` | `EXPO_PUBLIC_DANNER_APP_KEY`, refused unless its SHA-256 matches `release/app-key.sha256` or `rotate_key` is set |
| `APP_KEY_PREVIOUS` | Optional `APP_KEY_PREVIOUS`, changed only with `rotate_key`; an empty repository secret deletes it from the Worker |
| `RUN_STATUS_KEY` | `RUN_STATUS_KEY` |
| `RUN_PROGRESS_KEY` | `RUN_PROGRESS_KEY` |
| `GITHUB_TOKEN` | `WORKER_GITHUB_PAT` |

The workflow also uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
