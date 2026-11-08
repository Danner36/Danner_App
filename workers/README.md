# workers

Cloudflare Workers that the phone app can call without a home PC.

- `guardians-get-video/` is the shared Get video Worker. Missing or `guardians` module starts the Guardians pipeline. `patriots` starts the Patriots pipeline. `cyclones` starts the Cyclones pipeline and requires `sport`. It is the code live phones use.
- `team-worker/` is the Worker v2 source (catalog allowlist, per-team Get video, streams by team). It deploys to the same Cloudflare Worker only through `worker-deploy.yml`, which runs by hand.
