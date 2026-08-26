# scripts

Repository tools that do not run on the phone.

- `guardians-stream-pipeline/` extracts an approved player URL for the current Guardians game and publishes root `guardians_streams.json`. Local `config.json` is gitignored. GitHub Actions reads `GUARDIANS_STREAM_PIPELINE_CONFIG`.
