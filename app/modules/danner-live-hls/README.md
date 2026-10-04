# danner-live-hls

Local Expo module that relays an approved page's own HLS, DASH, or MP4 stream from a LAN port
in 8108–8127, so a Cast receiver can play a stream the provider serves only to its player page.

## Behavior

- `startProxy(sourceUrl, referer, kind)` takes `kind` `hls`, `dash`, or `mp4`. It picks the
  phone's Wi-Fi or Ethernet IPv4 address, probes the source once with `referer`, and resolves
  `{ origin, port, token, kind, path, contentType, live, segmentFormat? }`. Rejection codes are
  `ERR_NO_NETWORK` (no usable LAN address), `ERR_SOURCE` (the source did not answer with a
  playlist, manifest, or media), `ERR_UNSUPPORTED` (unknown kind, a non-http(s) source, or an
  `http:` source on iPhone, where App Transport Security blocks the relay), and `ERR_RELAY`.
  `src/index.ts` wraps it as `startLiveRelay`, which maps those codes to the TV control's
  messages and accepts only a private LAN origin.
- Every start opens a new session with a random 32-hex `token` and a random signing key. Every
  route lives under `/<token>/`; an earlier session's routes answer 404. The listener binds the
  chosen LAN address, not every interface.
- HLS: `/<token>/live.m3u8` re-resolves the source on each read, because the provider returns a
  fresh variant host and time-limited segment URLs every time. A master playlist forwards the
  highest video variant at or under 3.5 Mbps, or the lowest when every variant is above that;
  selection matches `src/relayVariant.ts`. When that variant's audio is a separate rendition,
  the answer is a two-entry master pointing at `/<token>/video.m3u8` and
  `/<token>/audio.m3u8?g=<n>`. Every segment line and every `URI="…"` attribute is rewritten to
  `/<token>/s?u=<base64url>&k=<signature>`; relative URIs resolve against the URL after
  redirects. `segmentFormat` is `fmp4` when the playlist has `#EXT-X-MAP` or CMAF segment names,
  else `ts`; `live` is false only when the playlist has `#EXT-X-ENDLIST`.
- DASH: `/<token>/live.mpd` re-fetches the manifest on each read, removes `<Location>`, and
  points every `BaseURL` and absolute segment template at a signed relay directory,
  `/<token>/d/<base64url dir>/<signature>/…`. `live` follows the MPD `type="dynamic"`.
- MP4: `/<token>/media.mp4` passes the source through with `Range` forwarding.
- `/s` and `/d` serve only URLs this session signed (HMAC-SHA256, first 16 bytes); anything else
  answers 403, so the relay cannot fetch arbitrary URLs for another device on the network.
  They forward `Range` and stream bodies. The content type is the upstream media type, or is
  sniffed from the first bytes (`video/MP2T`, `video/mp4`, or `application/octet-stream`).
  An upstream failure answers 502.
- Playlist and manifest bodies are capped at 4 MiB. A body that is not `#EXTM3U` or `<MPD`
  fails as 502; a dropped stream answers 200 with an error page, which would otherwise be
  rewritten into bogus segment lines.
- Every response carries permissive CORS, including the private-network preflight answer.
- Android keeps the last few live-edge segments, plus any init map, in a short memory cache and
  starts fetching them when the playlist is built. The receiver and that prefetch share one
  download per URL.
- Media bytes are passed through unchanged. The module does not decode, encode, or capture.
- Android runs a `connectedDevice` foreground service with a Stop action, holding a partial
  wake lock and a Wi-Fi lock while the relay runs. The service is not sticky and stops itself
  when no relay is running, including after the 6-hour foreground-service timeout. The
  high-performance Wi-Fi lock keeps Wi-Fi awake with the screen off only below Android 14;
  from Android 14 it applies only while the app is in front with the screen on.
- iOS has no background service. The listener stops when the app is suspended, and
  `getProxyStatus` then reports `running: false`; the TV control restarts the relay when the
  app returns to the foreground or the TV button is pressed again. AirPlay takes the phone out
  of the media path entirely.

The screen-capture converter this module used to host is archived, unbuilt, under
`reference/screen-capture-hls/`.
