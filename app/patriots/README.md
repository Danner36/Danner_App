# patriots

New England Patriots dashboard, authorized playback list, and isolated players.

Playback URLs are not stored here. Phones fetch root `patriots_streams.json` from GitHub `main`.

## Behavior

- Loads leftover preseason, regular-season, and playoff games from ESPN, plus the regular-season record, with one-minute and pull-to-refresh updates. The regular-season record sits as compact win–loss (and tie when needed) text under the Patriots title.
- Promotes today's game above the schedule, counts down every second when the kickoff time is known, states delays and `Time TBA` directly, and enables approved icon-only Play controls 15 minutes before game time.
- A live featured game shows a football scoreboard (quarters, clock, down and distance, possession) and refreshes that board every five seconds.
- Fetches approved playback URLs from root `patriots_streams.json` on GitHub on screen open and every minute, with the last valid file cached on the phone. Entries match the America/New_York official date of kickoff and game number `1`.
- Get video uses the shared Cloudflare Worker with `module: patriots`, which starts the Patriots stream pipeline. The phone polls `GET /streams?module=patriots`.
