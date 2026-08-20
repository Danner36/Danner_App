Status: ACTIVE
Phase: MVP

# Guardians

## Dashboard

Opening the Cleveland Guardians tile requests the current season record and schedule from MLB's `statsapi.mlb.com` service. The screen fetches again every 60 seconds and on pull-to-refresh.

An in-progress game is shown in the prominent top card. If no game is live and a game is scheduled today, today's game uses that card and is removed from the upcoming schedule. It shows the opponent, phone-local start time, a one-second countdown, and `Video starts 15 minutes before game time.`

Delayed, postponed, suspended, and canceled games state the condition directly. A live game shows the current score and MLB game-state label. The season record and remaining schedule stay below the featured card.

The schedule contains no completed or featured game. Remaining games are ordered by start time and display `vs` or `at`. Dates and times use the phone's locale and time zone. A failed MLB request exposes Retry without discarding previously loaded information.

## Approved source file

Production playback entries belong in root [guardians_streams.json](../../guardians_streams.json). Installed phones fetch:

`https://raw.githubusercontent.com/Danner36/Danner_App/main/guardians_streams.json`

The app checks the file when the Guardians screen opens, on pull-to-refresh, and every 60 seconds. A valid response is cached on the phone. The cache is used if GitHub is temporarily unavailable.

Edit only `streams`. It contains an `INACTIVE EXAMPLE` line followed by a complete made-up stream object. Copy that object, paste the copy after it, put a comma between the two objects, replace every value in the copy, then commit and push the file to `main`. The placeholder date keeps the example inactive. The embedded `HOW_TO_GUIDE` defines every field.

Every entry requires exactly these fields:

- `gameDates`: every `YYYY-MM-DD` game date that can use the URL
- `gameNumbers`: `[1]` for a normal game; use `1` or `2` to distinguish doubleheader games
- `kind`: `direct`, `youtube`, or `web`
- `url`: approved media or player-page URL
- `allowInsecureHttp`: `false` for HTTPS; `true` only for an HTTP source
- `trustedHosts`: web-player redirect hosts; `[]` for direct, YouTube, or no redirect hosts

One URL can cover multiple dates:

```json
{
  "gameDates": [
    "2026-08-20",
    "2026-08-21"
  ],
  "gameNumbers": [
    1
  ],
  "kind": "direct",
  "url": "https://media.example.com/game/master.m3u8",
  "allowInsecureHttp": false,
  "trustedHosts": []
}
```

The app gets game identity from MLB. The approved file uses only date and game number. Entries with missing, extra, malformed, or unsafe fields are ignored.

## Watch timing

Icon-only Play actions are hidden until 15 minutes before the featured game's scheduled start. At or after that point, one Play action is shown for each matching valid source. No source name is stored or displayed. If the source file has no matching entry, the card says `Video is not ready yet. The app checks again automatically.` The next automatic source check occurs within 60 seconds.

Postponed, suspended, and canceled games do not expose Watch actions. A delayed game states the delay; a matching source can become available after the 15-minute threshold.

## Playback kinds

- `direct`: HLS, MP4, DASH, or another native-player-compatible media URL. It runs in `expo-video` with caching disabled. No webpage JavaScript, popup, page storage, or page advertisement executes.
- `youtube`: a YouTube watch, live, embed, or `youtu.be` URL. The app extracts the video identifier and uses a local wrapper around YouTube's privacy-enhanced embed. YouTube sources must use HTTPS.
- `web`: an approved player page. The initial hostname is trusted. `trustedHosts` adds exact hostnames required for top-level redirects.

HTTPS is accepted by default. HTTP is rejected unless the same entry sets `allowInsecureHttp: true`.

Web players run incognito with file access, file-URL bridging, location, shared cookies, third-party cookies, and downloads disabled. Top-level navigation is limited to exact approved hosts and HTTPS unless that source opts into HTTP. An allowed popup replaces the content in the isolated player. Every other popup is consumed without loading its target or leaving the app.

Cleartext HTTP has no transport encryption. Its opt-in changes transport only; popup, redirect, file, location, cookie, and download controls remain active. iPhone can request local-network permission when opening a home-network source. Direct media remains the strongest isolation boundary because it does not execute a webpage.

## Test harness

`tests/guardians/` contains repository-only fixtures for today, video-ready, delayed, and live states. The local server runs on port 8108 and supplies fixture data and source JSON only to a React Native development build. It also provides fixed HTTPS and HTTP media tests plus approved and rejected popup and redirect checks.

Harness URLs, game data, and test video references are not imported into the application and are absent from production Android and iOS bundles.
