Status: ACTIVE
Phase: MVP

# Guardians

## Dashboard

Opening the Cleveland Guardians tile requests the current season record and schedule from MLB's `statsapi.mlb.com` service. The screen fetches that snapshot again every ten minutes and on pull-to-refresh. A live featured game also refreshes its park-style scoreboard every five seconds while the screen is open.

An in-progress game is shown in the prominent top card. If no game is live and a game is scheduled today, today's game uses that card and is removed from the upcoming schedule. It shows the opponent, phone-local start time, a one-second countdown, and `Video starts 15 minutes before game time.`

After today's game reaches Final, that same card stays through local midnight of the MLB official date. It shows `WIN`, `LOSS`, or `TIE`, `Home vs` or `Away v`, `Final` or `Final/10`, the Guardians-first score, and Win / Loss / Save last names when MLB returns them. It does not show the park-style scoreboard, Play, Listen, or Get video. A later game still today keeps the featured card. A doubleheader recap is the last completed game of that official date.

Delayed, postponed, suspended, and canceled games state the condition directly. A live game shows the current score, MLB game-state label, and the park-style scoreboard (innings, R/H/E, count, outs, batter and pitcher numbers). The season record and remaining schedule stay below the featured card.

The schedule contains no completed or featured game. Remaining games are ordered by start time and display `vs` or `at`. Dates and times use the phone's locale and time zone. A failed MLB request exposes Retry without discarding previously loaded information.

## Approved source file

Production playback entries belong in root [guardians_streams.json](../../guardians_streams.json). Installed phones fetch:

`https://raw.githubusercontent.com/Danner36/Danner_App/main/guardians_streams.json`

The app checks the file when the Guardians screen opens, on pull-to-refresh, and every 60 seconds. Production builds also try `GET {GET_VIDEO_URL}/streams` first when that Worker origin is set. Get video and other freshness-first loads also try raw GitHub at the latest commit SHA that touched the file. A later fetch that has no featured-game match does not wipe a URL the phone already has. A valid response is cached on the phone. The cache is used if every live fetch fails.

Edit only `streams`. Root-level `HOW_TO_GUIDE` defines every field; the phone does not display that guide. `streams` contains an `INACTIVE EXAMPLE` line followed by a complete made-up stream object, then dated production entries. Copy the example object, paste the copy after it, put a comma between the two objects, replace every value in the copy, then commit and push the file to `main`. The placeholder date keeps the example inactive.

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

Icon-only Play actions are hidden until 15 minutes before the featured game's scheduled start. At or after that point, one Play action is shown for each matching valid source. A matching `direct` source also shows an icon-only Listen control that plays the same URL with no visible video. No source name is stored or displayed. If the source file has no matching entry, the card says `Video is not ready yet. The app checks again automatically.` The next automatic source check occurs within 60 seconds.

When the worker origin and family PIN are present in the build, that same empty window also shows **Get video**. The phone POSTs `{ pin }` to `{GET_VIDEO_URL}/get-video`. The Worker starts `.github/workflows/guardians-stream-pipeline.yml` through GitHub `repository_dispatch` type `guardians-get-video`. While it runs, the card says `Getting video. This could take a minute.` and polls for a matching URL every 5 seconds for up to 5 minutes. A matching `web` URL turns Get video into Play.

Postponed, suspended, and canceled games do not expose Watch actions. A delayed game states the delay; a matching source can become available after the 15-minute threshold. Final recap hides Play, Listen, and Get video.

## Playback kinds

- `direct`: HLS, MP4, DASH, or another native-player-compatible media URL. It runs in `expo-video` with caching disabled. No webpage JavaScript, popup, page storage, or page advertisement executes. Listen uses the same URL as audio-only. The player header shows a Cast control that loads that JSON URL on the default receiver.
- `youtube`: a YouTube watch, live, embed, or `youtu.be` URL. The app extracts the video identifier and uses a local wrapper around YouTube's privacy-enhanced embed. YouTube sources must use HTTPS. YouTube does not offer Listen or TV send.
- `web`: an approved player page. The initial hostname is trusted. `trustedHosts` adds exact hostnames required for top-level redirects. The player header shows a TV control. When the page reports a castable HLS, DASH, or MP4 URL that matches the source transport policy, that URL loads on the default Cast receiver. Otherwise the control captures the on-screen player into a local HLS origin and Casts that playlist. MPEG-TS is declared only for the captured playlist. On iPhone, isolated web pages report an Android Chrome user agent so the approved page serves the same player build as Android.

HTTPS is accepted by default. HTTP is rejected unless the same entry sets `allowInsecureHttp: true`.

Web players run incognito with file access, file-URL bridging, location, shared cookies, third-party cookies, and downloads disabled. Top-level navigation is limited to exact approved hosts and HTTPS unless that source opts into HTTP. An allowed popup replaces the content in the isolated player. Every other popup is consumed without loading its target or leaving the app.

Cleartext HTTP has no transport encryption. Its opt-in changes transport only; popup, redirect, file, location, cookie, and download controls remain active. iPhone can request local-network permission when opening a home-network source. Direct media remains the strongest isolation boundary because it does not execute a webpage.

## Test harness

`tests/guardians/` contains repository-only fixtures for today, video-ready, delayed, live, Final recap, live HLS capture, and Get video. The shared fixture server runs on port 8108. Get video uses port 8111 so it does not collide with Expo. Both supply fixture data and source JSON only to a React Native development build. The harness also provides fixed HTTPS and HTTP media tests plus approved and rejected popup and redirect checks.

Harness URLs, game data, and test video references are not imported into the application and are absent from production Android and iOS bundles.
