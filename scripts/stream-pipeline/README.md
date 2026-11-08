# stream-pipeline

Finds a playable stream for one catalog team's game and publishes it to `streams/<league>/<espnId>.json` (`Docs/Production/ModularTeams.md`, Backend). Workflow `Stream pipeline` (`.github/workflows/stream-pipeline.yml`) runs it on dispatch type `team-get-video` and on Run workflow.

- `extract` job: read-only token, no stored git credentials. `run.mjs --check-request` checks `TEAM_KEY`, `TEAM_SPORT` and `EVENT_ID` against the checkout catalog before any secret or fetch; `--write-config` masks every source URL, origin and host in `STREAM_PIPELINE_CONFIG` and writes it under `$RUNNER_TEMP`; `--check-config` applies the bounds. `run.mjs` then reads the schedule and tries the listing sources, and writes `candidate.json`, the entry or an outcome code, to artifact `candidate-<run id>`. It posts `source_start` and `found` to `POST /run-progress`, signed with `RUN_PROGRESS_KEY`, holding only `k` and `n`.
- `publish` job: write token, no browser, no packages. `publish.mjs` re-checks the request and every field of the candidate against the catalog and the provider table, derives the path from the key, makes one commit, posts the final code to `POST /run-status` signed with `RUN_STATUS_KEY` (not on a dry run or a run without an event id), and uploads `pipeline-result.json`.
- A run that names an event serves that event; a manual run with a blank `event` takes today's game by the featured-game tiers.
- `config.defaults.json` holds the `timing` and `matching` defaults; the secret merges over it. There is no in-repo fallback: an empty or missing secret fails the run. `config.example.json` shows the secret's shape.
- Modules `lib/sources.mjs`, `lib/redact.mjs` and `lib/extract/providers.mjs` are copied unchanged from `scripts/guardians-stream-pipeline/`. `lib/extract/listing.mjs` reads player hosts and embed paths only from `providers.mjs`; adding a player is one row there.
- Signed bodies carry header `X-Signature` (lowercase hex HMAC-SHA256 of the raw body); `at` is seconds since the epoch.
- Logs, the step summary and both artifacts name sources only as `source 2/3 (backup-1)`. Traces and screenshots are never uploaded.

Run workflow inputs: `team` (required), `sport` (schools), `event`, `dry_run`, `force`, `source` (1-based; blank tries all).

Tests: `npm test` (fixtures, an injected extractor and fake `fetch`; no browser and no network). `STREAM_CATALOG_DIR` points the scripts at another catalog folder.
