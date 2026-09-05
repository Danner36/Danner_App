Status: ACTIVE
Phase: MVP

# Cyclones

## Dashboard

Opening the Iowa State Cyclones tile requests leftover preseason, regular-season, and postseason games from ESPN's public NCAA site JSON for team 66 in college football, men's basketball, and women's basketball. The screen fetches that snapshot again every ten minutes and on pull-to-refresh. A live featured game also refreshes its sport-specific scoreboard every five seconds while the screen is open.

One featured card is shown. An in-progress game in any sport wins. If none is live, today's next kickoff across any sport uses that card. If none remains, today's last completed game is the recap. The card names the sport. Other same-day games stay in the upcoming schedule.

Today's scheduled game shows the opponent, phone-local start time, a one-second countdown when the start time is known, and `Video starts 15 minutes before game time.` If ESPN marks the time invalid, the card says `Time TBA` and does not count down.

After today's featured game reaches Final, that same card stays through local midnight of the official date. It shows `WIN`, `LOSS`, or `TIE` and the Cyclones-first score. It does not show the live board, Play, Listen, or Get video.

Delayed, postponed, suspended, and canceled games state the condition directly. A live football game shows quarters, total, clock, down and distance, and possession. A live men's basketball game shows halves plus overtime. A live women's basketball game shows four quarters plus overtime.

Three compact regular-season records sit under the Cyclones title. Each stays `0–0` until that sport has a regular-season Final. Preseason and postseason do not change those numbers. A knockout loss with no later game shows an eliminated line. Selection Sunday, pairing, and a win with no next game posted show `Awaiting next` and are not treated as eliminated. A championship win shows `Won the [tournament]`.

The schedule contains no completed or featured game. Remaining games from all three sports are ordered by start time and display the sport label plus `vs` or `at`. Dates and times use the phone's locale and time zone. A failed ESPN request exposes Retry without discarding previously loaded information.

## Approved source file

Production playback entries belong in root [cyclones_streams.json](../../cyclones_streams.json). Installed phones fetch:

`https://raw.githubusercontent.com/Danner36/Danner_App/main/cyclones_streams.json`

The app checks the file when the Cyclones screen opens, on pull-to-refresh, and every 60 seconds. Production fetches try Worker `GET /streams?module=cyclones` first when that origin is set. A valid response is cached on the phone.

Edit only `streams`. Copy the inactive example, replace every value, then commit and push the file to `main`. Entries match the America/Chicago official date of kickoff, game number `[1]`, and `sport` (`football`, `mens-basketball`, or `womens-basketball`).

## Watch timing

Icon-only Play actions are hidden until 15 minutes before the featured game's scheduled start. Get video POSTs `{ pin, module: "cyclones", sport }` to the shared Cloudflare Worker, which starts the Cyclones GitHub Action. That Action reads `CYCLONES_STREAM_PIPELINE_CONFIG` and writes only `cyclones_streams.json`. The phone polls `GET /streams?module=cyclones` and keeps only entries whose `sport` matches the featured game.
