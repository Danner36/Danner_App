# Cyclones test harness

Simulates Cyclones timing and playback states without packaging fixture data or video into Danner Apps.

## Run on Android

From `app/` with an Android emulator running:

```powershell
npm run test:cyclones:snapshot
npm run test:cyclones:android
npm run test:cyclones:android:ready
npm run test:cyclones:android:delayed
npm run test:cyclones:android:live
npm run test:cyclones:android:live-basketball
npm run test:cyclones:android:get-video
```

| Command | State |
|---------|-------|
| `test:cyclones:android` | Game today, starts in 45 minutes, no Watch actions |
| `test:cyclones:android:ready` | Game today, starts in 10 minutes, Watch actions visible |
| `test:cyclones:android:delayed` | Delayed game with direct delay text |
| `test:cyclones:android:final` | Today's completed game with WIN badge and score |
| `test:cyclones:android:live` | Live football game with scoreboard and Watch actions |
| `test:cyclones:android:live-basketball` | Live women's basketball game with Play and Listen above the basketball arena board |
| `test:cyclones:android:get-video` | Live card with no matching URL, Get video, delayed publish, then Play in the same session |

`live-basketball.fixture.json` embeds a trimmed ESPN summary of women's game 401827429 (Iowa State at Kansas State) at 1:17 of the third quarter: header, format, box points, rebounds and fouls as of that play, the substitution and foul plays, and every third-quarter play. The harness parses it with the live parser, using the fixture's `boardFlags` in place of the adapter row's flags, so the player tables, team fouls, bonus, and last foul appear. The harness does not poll, so the stale note appears under the board 30 seconds after the screen loads.

The fixture runner starts on port 8108. `test:cyclones:android:get-video` uses port 8113 so it does not collide with Expo. Production builds ignore the development overrides and fetch ESPN plus root `cyclones_streams.json` from GitHub. Get video POSTs `{ pin, module: "cyclones", sport }` and polls `/streams?module=cyclones`.
