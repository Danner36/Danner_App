# Guardians test harness

Simulates Guardians timing and playback states without packaging fixture data or video into Danner Apps. Video remains hosted by its provider.

## Run on Android

From `app/` with an Android emulator running:

```powershell
npm run test:guardians:android
npm run test:guardians:android:ready
npm run test:guardians:android:delayed
npm run test:guardians:android:live
npm run test:guardians:android:live-hls
```

| Command | State |
|---------|-------|
| `npm run test:guardians:android` | Game today, starts in 45 minutes, no Watch actions |
| `npm run test:guardians:android:ready` | Game today, starts in 10 minutes, Watch actions visible |
| `npm run test:guardians:android:delayed` | Delayed game with direct delay text |
| `npm run test:guardians:android:live` | Live game with park-style scoreboard and Watch actions |
| `npm run test:guardians:android:live-hls` | Live game plus capture-pattern page; taps TV and checks a local MPEG-TS playlist |

The runner starts the local fixture server on port 8108. It launches an Expo development build with fixture-data and fixture-source URLs set to the emulator host address. Production builds ignore both development overrides and fetch MLB plus root `guardians_streams.json` from GitHub.

## Fixture

`live-game.fixture.json` controls the simulated score, remaining schedule, and test URLs. The server assigns the current date and game number to its emitted source document. The direct HTTPS entry tests native playback without webpage code. The direct HTTP entry tests the same player through the fixed `/http-media/` proxy. The YouTube entry tests the isolated embed. The local HTTP web entry tests approved and rejected popup and redirect requests. Every HTTP fixture uses the same explicit opt-in required by production entries.

`GET /native-hls-player` is a single HTML5 `<video>` of the Apple bipbop HLS example so iPhone AirPlay can be checked on a page that uses a real media URL. `GET /capture-pattern` is a moving canvas used to prove live conversion without a production webpage. Production `web` entries are the exact page URLs in root `guardians_streams.json` and are not assumed to match these pages. The HTTP media route can request only files beneath the fixed Apple HLS example path. It does not accept an arbitrary upstream URL.

Production-approved links belong in root `guardians_streams.json`.
