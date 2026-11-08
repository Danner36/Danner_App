Status: ACTIVE
Phase: MVP

# Streams

Each team has one file, `streams/<league>/<espnId>.json`. One school file covers all of its sports. Phones read it through the Worker, then raw GitHub.

## Fetch chain

`app/streams/fetchSources.ts`, per tile:

1. Worker `GET /streams?team=<key>` when `EXPO_PUBLIC_DANNER_WORKER_URL` is set.
2. During a Get video session, after the Worker fails: raw GitHub at the latest commit that touched the file. The lookup runs once per session.
3. Raw GitHub `main/<streams path>`.
4. The last valid document in `danner.sources.<TeamKey>.v1`.

The screen reads the file on open, pull-to-refresh and foreground, and every 60 seconds only while a game is Live or from 45 minutes before its start to the end of its grace period. A later fetch with no match for a featured game does not wipe a URL the phone already has.

## File

Edit only `streams`. Root-level `HOW_TO_GUIDE` defines every field; the phone does not display that guide. `streams` holds an `INACTIVE EXAMPLE` line followed by a complete made-up entry, then real entries. Copy the example object, paste it after, replace every value, then commit to `main`. The placeholder date keeps the example inactive.

| Field | Rule |
|---|---|
| `gameDates` | Every official date that can use the URL (`YYYY-MM-DD`). MLB official date, or the America/New_York date of an ESPN start. Never displayed |
| `gameNumbers` | Numbers 1-9; `[1]` for a normal game, `1` or `2` to distinguish doubleheader games |
| `kind` | `direct`, `youtube`, or `web` |
| `url` | Approved media or player-page URL |
| `allowInsecureHttp` | `false` for HTTPS; `true` only for an HTTP source |
| `trustedHosts` | Web-player redirect hosts; `[]` for direct, YouTube, or no redirect hosts |
| `sport` | Required in school files; absent in pro files |
| `eventId` | A string of digits, written by the pipeline; optional on hand-written entries |
| `source` | `"pipeline"` on pipeline entries only |

Unknown keys are ignored. The parser skips the guide strings and keeps the newest 200 entries.

## Match

`app/team/engine/streamMatch.ts`, sharing cases with the pipeline in `tests/fixtures/stream-match.json`. An entry with `eventId` matches when the id is equal and `gameDates` includes the game's current official date, so an entry for a postponed event that kept its id does not show Play on the new date. An entry without `eventId` matches when `gameDates` includes the official date and `gameNumbers` includes the game number. School files also require the same `sport`.

## Watch timing

Icon-only Play actions are hidden until 15 minutes before the game's scheduled start, or until the game is Live. At or after that point one Play action shows for each matching valid source. A matching `direct` source also shows an icon-only Listen control that plays the same URL with no visible video. No source name is stored or displayed. With no matching entry the card says `Video is not ready yet. The app checks again automatically.`

Postponed, suspended, and canceled games do not expose Watch actions. A delayed game states the delay; a matching source can become available after the 15-minute threshold. Final recap hides Play, Listen, and Get video.

## Get video

When the Worker origin and app key are in the build, the empty window shows **Get video**. `app/streams/getVideo.ts` POSTs `{appKey, team, sport?, eventId}` to `/get-video`, then polls `GET /streams?team=<key>&event=<id>` every 5 seconds until an entry matches, `X-Run-State` reports a final code, or 900 seconds pass. Each poll updates the line under the button:

| Moment | Phone text |
|---|---|
| Button pressed, search not yet on a site | `Looking for video…` |
| Trying a site (`k` of `n`) | `Looking for video (k of n)…` with `n` dots, one filled per site tried |
| A site is found | `Video found. Getting it ready…` |
| Saved | The Play button appears |
| No site had it, or the wait ended | `No video found. Try again in a few minutes.` |
| Nothing new for 90 s | `Still looking…` |

| Worker answer | Phone |
|---|---|
| 202 `started`, `in_progress` | Polls |
| 200 `video_ready` | Refreshes the streams once |
| 409 `not_in_window` | `Get video works from 15 minutes before the start until the game ends.` |
| 429 `rate_limited`, `game_limit`; 503 `busy` | `Get video was asked for too often. Try again in N minutes.` |
| 401 | `Get video is not authorized.` |
| Anything else | `Get video could not start.` |

The Worker checks the app key and the team against the catalog, then starts `.github/workflows/stream-pipeline.yml` through `repository_dispatch` type `team-get-video`. `scripts/stream-pipeline/` finds a stream for that game and commits the entry to the team's streams file.

Final codes `too_early`, `game_over`, `no_game` and `blocked` show a plain sentence for that case. Leaving the screen during a run and coming back picks the progress up again from the next poll.

## Playback kinds

- `direct`: HLS, MP4, DASH, or another native-player-compatible media URL. It runs in `expo-video` with caching disabled. No webpage JavaScript, popup, page storage, or page advertisement executes. Listen uses the same URL as audio-only. The player header shows a Cast control that loads that JSON URL on the default receiver.
- `youtube`: a YouTube watch, live, embed, or `youtu.be` URL. The app extracts the video identifier and uses a local wrapper around YouTube's privacy-enhanced embed. YouTube sources must use HTTPS. YouTube does not offer Listen or TV send.
- `web`: an approved player page. The initial hostname is trusted. `trustedHosts` adds exact hostnames required for top-level redirects. The player header shows a TV control. When the page reports a castable HLS, DASH, or MP4 URL that matches the source transport policy, the phone relays it under a per-send token with signed media URLs and loads it on the default Cast receiver, as a live stream when the source is live. The relay forwards the highest video variant at or under 3.5 Mbps when one exists, otherwise the lowest video variant, and prefetches the live-edge segments. HLS segment hints follow the relay's detected segment format (MPEG-TS or fMP4). If the page never reports a castable URL, the control says so. On iPhone, isolated web pages report an Android Chrome user agent so the approved page serves the same player build as Android.

HTTPS is accepted by default. HTTP is rejected unless the same entry sets `allowInsecureHttp: true`.

Web players run with file access, file-URL bridging, location, shared cookies, third-party cookies, and downloads disabled. Top-level navigation is limited to exact approved hosts and HTTPS unless that source opts into HTTP. An allowed popup replaces the content in the isolated player. Every other popup is consumed without loading its target or leaving the app.

Cleartext HTTP has no transport encryption. Its opt-in changes transport only; popup, redirect, file, location, cookie, and download controls remain active. iPhone can request local-network permission when opening a home-network source. Direct media remains the strongest isolation boundary because it does not execute a webpage.
