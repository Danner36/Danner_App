# guardians

Cleveland Guardians dashboard, authorized playback list, and isolated players.

Playback URLs are not stored here. Phones fetch root `guardians_streams.json` from GitHub `main`.

## Behavior

- Loads the Guardians season record, today's or an active game, score, and only remaining games from MLB, with one-minute and pull-to-refresh updates. The season record sits as compact win–loss text under the Guardians title. A live featured game also refreshes its park-style scoreboard every five seconds while the screen is open.
- During a live game, the featured card shows a park-style scoreboard with inning-by-inning runs, runs/hits/errors, balls, strikes, outs, and the current batter and pitcher numbers. That board is hidden before first pitch and after the game is no longer live. Icon-only Play controls sit under the featured card.
- Promotes today's game above the schedule, counts down every second, states delays directly, and enables approved icon-only Play controls 15 minutes before game time. The today card badge includes the local start time and names the game `Home vs` or `Away v` the opponent. The upcoming schedule still uses `vs` and `at`.
- Fetches approved playback URLs from root `guardians_streams.json` on GitHub on screen open and every minute, with the last valid file cached on the phone. Entries match normal dates and MLB game numbers; one URL can cover multiple dates.
- Keeps completed games out of the schedule and formats start times in the phone's time zone.
- Uses HTTPS by default; cleartext HTTP requires `allowInsecureHttp: true` on that entry. Direct media uses the native player. A matching `direct` source also exposes an icon-only Listen control that plays the same URL with no visible video, a stop control while audio is playing, and lock-screen now-playing controls. Returning to the hub stops the audio. On iPhone, that player's system controls include AirPlay. On Android and iPhone, a header Cast control appears only for `direct` sources and loads the JSON URL on the default Cast receiver. YouTube and other approved pages use isolated WebViews that promote approved popup targets and discard all others. Those page sources do not offer Listen.
- Isolated `web` entries load the exact page URL from the JSON file. The app does not detect or require a specific website or player library. On iPhone, HTML5 `video` and `audio` tags on that page are opted into system AirPlay. YouTube embeds are not injected. The OS may black the display; the app does not keep the screen on.
