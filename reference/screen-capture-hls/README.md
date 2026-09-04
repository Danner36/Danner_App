# Screen-capture HLS converter

Isolated bundle. Nothing here is compiled into the app.

These sources captured the on-screen web player and republished it as a sliding MPEG-2 TS
HLS window from a phone origin, so a Cast receiver or AirPlay target could play a page that
exposed no usable media URL.

## Why it is disconnected

TV send now relays the page's own HLS playlist from the phone and passes the provider's
segments through untouched, which reaches the receiver at the original resolution with no
projection permission, no encoder, and no battery cost. Every approved page in
`guardians_streams.json` reports a media URL, so the converter was never reached, and it
never had a physical TV pass. It is kept because a future source may expose no URL at all.

## Contents

| File | Role |
|------|------|
| `android/LiveHlsService.kt` | Foreground service owning projection, capture, and the local server |
| `android/LiveHlsRuntime.kt` | Cross-process start/ready/stop state for that service |
| `android/ScreenHlsPipeline.kt` | Virtual display, H.264 encode, playback audio capture, AAC encode |
| `android/MpegTsMuxer.kt` | Hand-rolled MPEG-2 TS muxer |
| `android/HlsWindow.kt` | Sliding segment window and playlist text |
| `android/HlsHttpServer.kt` | Local HTTP server for that window |
| `ios/LiveHlsEngine.swift` | ReplayKit capture, encode, and AirPlay entry point |
| `ios/HlsWindow.swift`, `ios/HlsHttpServer.swift` | iOS window and server |
| `ios/MpegTsMuxer.swift`, `ios/PcmToAacEncoder.swift` | iOS muxing and audio encoding |
| `tests/run-live-hls.mjs` | Emulator harness for the local capture origin |
| `tests/run-cast-convert.mjs` | Emulator harness for the capture TV path |

## Reconnecting

1. Move `android/*.kt` back to
   `app/modules/danner-live-hls/android/src/main/java/expo/modules/dannerlivehls/` and
   `ios/*.swift` back to `app/modules/danner-live-hls/ios/`. Both build systems compile by
   directory, so the move is the whole wiring step.
2. `ios/LiveHlsEngine.swift` carries its own `lanIPv4()`. `HlsProxyServer.swift` now has a
   private copy; drop one of them to avoid a duplicate symbol.
3. Restore in `app/modules/danner-live-hls/android/src/main/AndroidManifest.xml`: the
   `LiveHlsService` entry with `android:foregroundServiceType="mediaProjection"`, plus the
   `RECORD_AUDIO` and `FOREGROUND_SERVICE_MEDIA_PROJECTION` permissions.
4. Restore the same two permissions in `app/app.json` under `expo.android.permissions`.
5. Re-add `start`, `stop`, and `getStatus` to both `DannerLiveHlsModule` files, and
   `startLiveHls` / `stopLiveHls` / `getLiveHlsStatus` to
   `app/modules/danner-live-hls/src/index.ts`.
6. Re-add the capture fallback to `GuardiansTvRouteButton`, which needs the runtime
   permission request and the player-view crop measurement it used to pass to `start`.
7. Move `tests/*.mjs` back to `tests/guardians/` and restore their
   `test:guardians:android:live-hls` and `test:guardians:android:cast-convert` scripts in
   `app/package.json`. Both harnesses resolve `../../app/` and `./server.mjs` relative to
   their own directory, so they only run from `tests/guardians/`.

Git history for these files is under their former module and test paths.
