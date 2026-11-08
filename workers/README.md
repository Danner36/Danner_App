# workers

Cloudflare Workers that the phone app can call without a home PC.

- `team-worker/` is the Get video Worker that live phones use (catalog allowlist, per-team Get video, streams by team). It deploys to Cloudflare under the name `guardians-get-video` through `worker-deploy.yml`, which runs by hand.
