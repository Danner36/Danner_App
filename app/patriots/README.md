# patriots

New England Patriots dashboard, authorized playback list, and isolated players.

Playback URLs are not stored here. Phones fetch root `patriots_streams.json` from GitHub `main`.

## Behavior

- Loads leftover preseason, regular-season, and playoff games from ESPN, plus the regular-season record, with a ten-minute schedule refresh and pull-to-refresh. The regular-season record sits as compact win–loss (and tie when needed) text under the Patriots title.
- Promotes today's game above the schedule, counts down every second when the kickoff time is known, states delays and `Time TBA` directly, and enables approved icon-only Play controls 15 minutes before game time. A delayed game that has not kicked off keeps a 30-second clock so that window still opens. A `Time TBA` game is an all-day game on its America/New_York official date for its schedule label and the today check.
- A live featured game shows a football scoreboard (quarters, clock, down and distance, possession) and refreshes that board every five seconds. The same summary poll also runs from the scheduled kickoff until ESPN reports the game started, and its state moves the card to Live and Final within seconds; a Final, and the countdown reaching kickoff, refresh the schedule at once. A poll still in flight skips the next tick, and the card never moves backwards to an older state.
- A failed preseason or playoff schedule request is tolerated. A failed ESPN refresh does not hold back a newly published stream URL, and the error card shows a plain message. The 60-second refresh and the countdown pause while the app is in the background.
- Listen shows a stop control whenever audio is playing, stops when the game goes Final or the featured game changes, and stops when video starts.
- Fetches approved playback URLs from root `patriots_streams.json` on GitHub on screen open and every minute, with the last valid file cached on the phone. Entries match the America/New_York official date of kickoff and game number `1`.
- Get video uses the shared Cloudflare Worker with `module: patriots`, which starts the Patriots stream pipeline. The phone polls `GET /streams?module=patriots`; the GitHub latest-commit lookup runs only after that list fails, and leaving the screen, a new press, or a different featured game stops the poll.
- While a Cast receiver has a web relay, the page pauses and stops its own media load. The page resumes when the receiver goes idle or the load fails.
