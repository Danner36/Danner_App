# Patriots test harness

Simulates Patriots timing and playback states without packaging fixture data or video into Danner Apps.

## Run on Android

From `app/` with an Android emulator running:

```powershell
npm run test:patriots:snapshot
npm run test:patriots:android
npm run test:patriots:android:ready
npm run test:patriots:android:delayed
npm run test:patriots:android:live
npm run test:patriots:android:get-video
```

| Command | State |
|---------|-------|
| `npm run test:patriots:android` | Game today, starts in 45 minutes, no Watch actions |
| `npm run test:patriots:android:ready` | Game today, starts in 10 minutes, Watch actions visible |
| `npm run test:patriots:android:delayed` | Delayed game with direct delay text |
| `npm run test:patriots:android:final` | Today's completed game with WIN badge and score |
| `npm run test:patriots:android:live` | Live game with football scoreboard and Watch actions |
| `npm run test:patriots:android:get-video` | Live card with no matching URL, Get video, delayed publish, then Play |

The fixture runner starts on port 8108. `test:patriots:android:get-video` uses port 8112 so it does not collide with Expo. Production builds ignore the development overrides and fetch ESPN plus root `patriots_streams.json` from GitHub. Get video POSTs `{ pin, module: "patriots" }` and polls `/streams?module=patriots`.
