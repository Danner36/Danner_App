# cyclones

Iowa State Cyclones dashboard for college football, men's basketball, and women's basketball, plus the authorized playback list and isolated players.

Playback URLs are not stored here. Phones fetch root `cyclones_streams.json` from GitHub `main`.

## Behavior

- Loads leftover preseason, regular-season, and postseason games from ESPN for team 66 across all three sports, plus three regular-season records, with a ten-minute schedule refresh and pull-to-refresh.
- Promotes a live game, today's next kickoff, or today's last recap above the schedule. The card shows the sport name. Same-day games in other sports stay in the schedule.
- Counts down every second when the start time is known, states delays and `Time TBA` directly, and enables approved icon-only Play controls 15 minutes before game time, or as soon as a game is live. A delayed game that has not started keeps a 30-second clock so that window still opens.
- A live featured game shows a football board, men's basketball halves, or women's basketball quarters and refreshes that board every five seconds. The same summary poll also runs from the scheduled start until ESPN reports the game started, and its state moves the card to Live and Final within seconds; a Final, and the countdown reaching start time, refresh the schedule at once. The card never moves backwards to an older state.
- Official dates are the America/Chicago calendar date of kickoff. A `Time TBA` game takes the America/New_York calendar date of ESPN's placeholder time and is treated as an all-day game. Entries in `cyclones_streams.json` match that date, game number, and `sport`. The parser skips the guide strings and keeps the newest 200 entries.
- Neutral-site games read `vs` the opponent without a home or away label.
- Postseason: only College Football Playoff games are knockout; any other bowl ends the season. ESPN's NCAA tournament notes are recognized. A basketball conference-tournament result shows `Awaiting next` until a later game is posted, or until 14 days pass with none. `Won the …` appears only for a championship final.
- A sport whose ESPN request fails keeps its previous games, record, and status while the other sports update. A failed refresh does not hold back a newly published stream URL. The 60-second refresh and the countdown pause while the app is in the background.
- Listen shows a stop control whenever audio is playing, stops when the game goes Final or the featured game changes, and stops when video starts.
- Get video uses the shared Cloudflare Worker with `{ pin, module: "cyclones", sport }`. The phone polls `GET /streams?module=cyclones`; the GitHub latest-commit lookup runs only after that list fails, and leaving the screen, a new press, or a different featured game stops the poll.
- While a Cast receiver has a web relay, the page pauses and stops its own media load. The page resumes when the receiver goes idle or the load fails.
