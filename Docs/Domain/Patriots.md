Status: ACTIVE
Phase: MVP

# Patriots

## Dashboard

Opening the New England Patriots tile requests leftover preseason, regular-season, and playoff games from ESPN's public NFL site JSON for team 17. The screen fetches again every 60 seconds and on pull-to-refresh. A live featured game also refreshes its football scoreboard every five seconds while the screen is open.

An in-progress game is shown in the prominent top card. If no game is live and a game is scheduled today, today's game uses that card and is removed from the upcoming schedule. It shows the opponent, phone-local start time, a one-second countdown when the kickoff time is known, and `Video starts 15 minutes before game time.` If ESPN marks the kickoff time invalid, the card says `Time TBA` and does not count down.

After today's game reaches Final, that same card stays through local midnight of the official date. It shows `WIN`, `LOSS`, or `TIE` and the Patriots-first score. It does not show the football scoreboard, Play, Listen, or Get video.

Delayed, postponed, suspended, and canceled games state the condition directly. A live game shows the current score and a stadium-style board (quarters, total, clock, down and distance, possession). The regular-season record and remaining schedule stay below the featured card. The hero record is regular-season W–L, or W–L–T when ties exist. It stays `0–0` until a regular-season game is final.

The schedule contains no completed or featured game. Remaining games are ordered by start time and display `vs` or `at`. Dates and times use the phone's locale and time zone. Bye weeks have no row. A failed ESPN request exposes Retry without discarding previously loaded information.

## Approved source file

Production playback entries belong in root [patriots_streams.json](../../patriots_streams.json). Installed phones fetch:

`https://raw.githubusercontent.com/Danner36/Danner_App/main/patriots_streams.json`

The app checks the file when the Patriots screen opens, on pull-to-refresh, and every 60 seconds. Production fetches try Worker `GET /streams?module=patriots` first when that origin is set. A valid response is cached on the phone.

Edit only `streams`. Copy the inactive example, replace every value, then commit and push the file to `main`. Entries match the America/New_York official date of kickoff and game number `[1]`.

## Watch timing

Icon-only Play actions are hidden until 15 minutes before the featured game's scheduled start. Get video POSTs `{ pin, module: "patriots" }` to the shared Cloudflare Worker, which starts the Patriots GitHub Action. That Action reads `PATRIOTS_STREAM_PIPELINE_CONFIG` and writes only `patriots_streams.json`.
