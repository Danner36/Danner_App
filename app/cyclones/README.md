# cyclones

Iowa State Cyclones dashboard for college football, men's basketball, and women's basketball, plus the authorized playback list and isolated players.

Playback URLs are not stored here. Phones fetch root `cyclones_streams.json` from GitHub `main`.

## Behavior

- Loads leftover preseason, regular-season, and postseason games from ESPN for team 66 across all three sports, plus three regular-season records, with a ten-minute schedule refresh and pull-to-refresh.
- Promotes a live game, today's next kickoff, or today's last recap above the schedule. The card shows the sport name. Same-day games in other sports stay in the schedule.
- Counts down every second when the start time is known, states delays and `Time TBA` directly, and enables approved icon-only Play controls 15 minutes before game time.
- A live featured game shows a football board, men's basketball halves, or women's basketball quarters and refreshes that board every five seconds.
- Official dates are the America/Chicago calendar date of kickoff. Entries in `cyclones_streams.json` match that date, game number, and `sport`.
- Get video uses the shared Cloudflare Worker with `{ pin, module: "cyclones", sport }`. The phone polls `GET /streams?module=cyclones`.
