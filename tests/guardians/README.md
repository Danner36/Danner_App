# Guardians test harness

Simulates Guardians timing and playback states without packaging fixture data or video into Danner Apps. Video remains hosted by its provider.

## Run on Android

From `app/` with an Android emulator running:

```powershell
npm run test:guardians:android
npm run test:guardians:android:ready
npm run test:guardians:android:delayed
npm run test:guardians:android:live
```

| Command | State |
|---------|-------|
| `npm run test:guardians:android` | Game today, starts in 45 minutes, no Watch actions |
| `npm run test:guardians:android:ready` | Game today, starts in 10 minutes, Watch actions visible |
| `npm run test:guardians:android:delayed` | Delayed game with direct delay text |
| `npm run test:guardians:android:live` | Live game with score and Watch actions |

The runner starts the local fixture server on port 8108. It launches an Expo development build with fixture-data and fixture-source URLs set to the emulator host address. Production builds ignore both development overrides and fetch MLB plus root `guardians_streams.json` from GitHub.

## Fixture

`live-game.fixture.json` controls the simulated score, remaining schedule, and test URLs. The server assigns the current date and game number to its emitted source document. The direct HTTPS entry tests native playback without webpage code. The direct HTTP entry tests the same player through the fixed `/http-media/` proxy. The YouTube entry tests the isolated embed. The local HTTP web entry tests approved and rejected popup and redirect requests. Every HTTP fixture uses the same explicit opt-in required by production entries.

The HTTP media route can request only files beneath the fixed Apple HLS example path. It does not accept an arbitrary upstream URL.

Production-approved links belong in root `guardians_streams.json`.
