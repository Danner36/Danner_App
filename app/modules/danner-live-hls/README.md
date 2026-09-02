# danner-live-hls

Local Expo module that captures the on-screen Guardians web player, encodes H.264 and AAC, and serves a sliding HLS playlist on a LAN port in 8108–8127.

## Behavior

- Android uses MediaProjection, a `mediaProjection` foreground service, and MediaCodec. iOS uses ReplayKit and VideoToolbox. The TV control loads the local playlist on the default Cast receiver. Native AirPlay helpers remain unused by that control.
- `start` returns `{ origin, port }` after the first playable segments exist. `stop` ends capture, encoding, and the HTTP server.
- The playlist is `http://<phone-lan-ip>:<port>/live.m3u8` on Android and iPhone. Both serve a sliding MPEG-TS HLS window with H.264 and AAC. Android crops MediaProjection to the on-screen player rectangle.
- Frames are captured after decode. The module does not read or substitute media playlists from the WebView.
