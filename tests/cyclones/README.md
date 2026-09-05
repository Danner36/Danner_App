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
npm run test:cyclones:android:get-video
```

| Command | State |
|---------|-------|
| `test:cyclones:android` | Game today, starts in 45 minutes, no Watch actions |
| `test:cyclones:android:ready` | Game today, starts in 10 minutes, Watch actions visible |
| `test:cyclones:android:delayed` | Delayed game with direct delay text |
| `test:cyclones:android:final` | Today's completed game with WIN badge and score |
| `test:cyclones:android:live` | Live football game with scoreboard and Watch actions |
| `test:cyclones:android:get-video` | Live card with no matching URL, Get video, delayed publish, then Play |

The fixture runner starts on port 8108. `test:cyclones:android:get-video` uses port 8113 so it does not collide with Expo. Production builds ignore the development overrides and fetch ESPN plus root `cyclones_streams.json` from GitHub. Get video POSTs `{ pin, module: "cyclones", sport }` and polls `/streams?module=cyclones`.
