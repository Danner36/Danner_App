# workers

Cloudflare Workers that the phone app can call without a home PC.

- `guardians-get-video/` is the shared Get video Worker. Missing or `guardians` module starts the Guardians pipeline. `patriots` starts the Patriots pipeline. `cyclones` starts the Cyclones pipeline and requires `sport`.
