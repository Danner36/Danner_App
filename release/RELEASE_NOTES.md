# Danner Apps

## Install

### Android

1. Download `Danner-Apps-Android.apk`.
2. Open the file on the Android phone.
3. Allow installation from the current file app when Android requests it.
4. Tap `Install`.

### iPhone

1. Download `IPHONE_SETUP.md`.
2. Follow every section in order.

## Included

- Logo-only two-row hub: Cleveland Guardians and New England Patriots on row 1, Iowa State Cyclones under Guardians, YouTube TV under Patriots
- Patriots hub tile uses the Flying Elvis on Patriots navy
- Iowa State Cyclones leftover football, men's basketball, and women's basketball, three regular-season records, one featured card, sport-named schedule rows, and the same Play, Listen, Get video, and TV send controls
- Cyclones Get video POSTs `{ pin, module: "cyclones", sport }` to the shared Worker
- Cleveland Guardians record, current game, countdown, remaining schedule, and approved playback
- New England Patriots leftover schedule, regular-season record, football scoreboard, countdown, and the same Play, Listen, Get video, and TV send controls
- Patriots remaining schedule shows each game's phone-local date and time once
- Post-game recap on the featured card after Final: WIN, LOSS, or TIE, the score, and pitcher decisions. No park board or Play
- Get video on a live or soon-to-start game when no approved stream is ready yet
- Live park-style scoreboard during a game, with faster score updates
- Listen control for approved direct streams
- TV control on web games that Casts the page's HLS, DASH, or MP4 URL when the player reports one, and otherwise captures the on-screen player into a local live playlist
- iPhone web player pages use the Android Chrome user agent so they receive the same player build as Android
- YouTube TV location workflow
- Offline United States location map
- iPhone SideStore expiration warning
- Launch check for a newer GitHub release, with Yes installing the Android APK or opening SideStore for the iPhone IPA
