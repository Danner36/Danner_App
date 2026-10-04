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
- Cyclones and Patriots Final recaps read ESPN `{value, displayValue}` scores so a completed game shows the real score instead of `TIE 0-0`
- Cyclones Get video POSTs `{ pin, module: "cyclones", sport }` to the shared Worker
- Cleveland Guardians record, current game, countdown, remaining schedule, and approved playback
- New England Patriots leftover schedule, regular-season record, football scoreboard, countdown, and the same Play, Listen, Get video, and TV send controls
- Patriots remaining schedule shows each game's phone-local date and time once
- Post-game recap on the featured card after Final: WIN, LOSS, or TIE and the score. No park board, Play, or pitcher names
- Guardians Final recap no longer shows MLB Win / Loss / Save last names
- Guardians games without a published start time show Time TBA instead of 3:33 AM
- Android Cast of a web game follows the live stream and prefetches the next pieces so the TV does not keep pausing
- TV send says when the TV could not play the stream, and pressing TV again reloads it or restarts the phone relay. Ending the Cast session stops the relay. Android keeps sending with the screen off and shows a Stop button in its notification. The phone relay serves only the game it is sending
- Live and Final appear within seconds of the game changing state, a rain delay stays on the card during a live game, and a delayed game still opens Play 15 minutes before the scheduled start
- The phone screen sleeps normally on the sports dashboards and stays on only while a game player is open
- Watching a game on Android no longer signs TV Location out of Google
- Starting a video stops Listen audio on Patriots and Cyclones, and Listen always has a Stop control
- Cyclones bowls, conference tournaments, and NCAA tournament games show the right season status, and neutral-site games read `vs`
- Get video no longer uses up the home network's GitHub request allowance, and stops when the screen closes
- TV Location stays on YouTube and Google pages, returns to step 4 only after the TV update goes through, and names suburbs instead of the nearby big city
- Update downloads on Android no longer stall the TV button or map, and a failed install no longer loops back to the update prompt
- Get video on a live or soon-to-start game when no approved stream is ready yet
- Live park-style scoreboard during a game, with faster score updates
- Listen control for approved direct streams
- TV control on web games that relays the page's HLS, DASH, or MP4 through the phone because the provider will not answer the TV directly
- iPhone web player pages use the Android Chrome user agent so they receive the same player build as Android
- YouTube TV location workflow
- Offline United States location map
- iPhone SideStore expiration warning
- Launch check for a newer GitHub release, with Yes installing the Android APK or opening SideStore for the iPhone IPA
