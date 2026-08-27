# danner-live-hls

Local Expo module that captures the on-screen Guardians web player, encodes H.264 and AAC, and serves a sliding HLS playlist on a LAN port in 8108–8127.

## Behavior

- Android uses MediaProjection, a `mediaProjection` foreground service, and MediaCodec. iOS uses ReplayKit, VideoToolbox, and a muted `AVPlayer` for AirPlay of the local playlist.
- `start` returns `{ origin, port }` after the first playable segments exist. `stop` ends capture, encoding, and the HTTP server.
- The playlist is `http://<phone-lan-ip>:<port>/live.m3u8`. The phone remains the origin for every segment.
- Frames are captured after decode. The module does not read or substitute media playlists from the WebView.
