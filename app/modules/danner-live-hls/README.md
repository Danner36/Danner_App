# danner-live-hls

Local Expo module that relays an approved page's own HLS stream from a LAN port in
8108–8127, so a Cast receiver can play a stream the provider serves only to its player page.

## Behavior

- `startProxy(sourceUrl, referer)` returns `{ origin, port }`. `GET /live.m3u8` resolves the
  source down to a media playlist, fetching each playlist with `referer`, and rewrites every
  media reference to `GET /s?u=<base64url>`. `GET /s` streams that object through as
  `video/MP2T`. Every response carries permissive CORS.
- The Cast load for this origin is a live stream. A buffered load plays the current window
  once and then the receiver pauses. Direct files stay buffered; live on those files sits
  on the receiver splash.
- A master playlist forwards the highest video variant at or under 3.5 Mbps. When every
  video variant is above that, it forwards the lowest. Audio-only renditions are skipped.
  The first rendition is often the largest, and relaying it stalls the TV. Selection
  matches `src/relayVariant.ts`.
- Android keeps the last few live-edge segments, plus any init map, in a short memory cache
  and starts fetching them when the playlist is built. The receiver and that prefetch share
  one download per URL.
- The source is re-resolved on each playlist read. The provider returns a fresh variant host
  and time-limited segment URLs each time, so a cached walk goes stale within minutes.
- A body that is not `#EXTM3U` fails as 502. A dropped stream answers 200 with an error page,
  which would otherwise be rewritten into bogus segment lines.
- Media bytes are passed through unchanged. The module does not decode, encode, or capture.
- Android runs a `dataSync` foreground service holding a partial wake lock and a
  `WIFI_MODE_FULL_HIGH_PERF` Wi-Fi lock, so the receiver keeps reaching the phone once the
  screen is off. iOS has no equivalent; an iPhone sends to a TV over AirPlay instead, which
  takes the phone out of the media path entirely.
- The playlist is `http://<phone-lan-ip>:<port>/live.m3u8`. The phone stays the origin for
  the length of the send.

The screen-capture converter this module used to host is archived, unbuilt, under
`reference/screen-capture-hls/`.
