# scripts

Repository tools that do not run on the phone.

- `guardians-stream-pipeline/` extracts an approved player URL for the current Guardians or Patriots game and publishes the matching root streams file. Local `config.json` is gitignored. Guardians Actions read `GUARDIANS_STREAM_PIPELINE_CONFIG`. Patriots Actions read `PATRIOTS_STREAM_PIPELINE_CONFIG` and set `sport` to `nfl`.
