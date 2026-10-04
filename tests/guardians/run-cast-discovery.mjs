import assert from 'node:assert/strict';
import vm from 'node:vm';

import {
  castStreamTypeForRelay,
  castStreamTypeForUrl,
} from '../../app/guardians/castStreamType.ts';
import {
  DASH_CONTENT_TYPE,
  HLS_CONTENT_TYPE,
  MP4_CONTENT_TYPE,
  TV_PLAYBACK_FAILED_MESSAGE,
  castableDiscoveredContentType,
  newDiscoveryNonce,
  pagePlaybackHoldScript,
  parseDiscoveredMediaMessage,
  phoneHoldForReceiverState,
  preferDiscoveredMedia,
  receiverHasMedia,
  receiverPlaybackFailed,
  showCastDialogOnTvPress,
  tvPressForcesReload,
  tvRelayFailureMessage,
  webMediaDiscoveryInjection,
} from '../../app/guardians/webMediaDiscoveryInjection.ts';
import {
  isPrivateLanIpv4,
  liveRelayFromNative,
  relayKindForContentType,
  relayStartFailureForCode,
  relayStatusFromNative,
  relayStillServing,
} from '../../app/modules/danner-live-hls/src/liveRelay.ts';
import {
  selectRelayVariant,
  streamInfAudioOnly,
  streamInfBandwidth,
} from '../../app/modules/danner-live-hls/src/relayVariant.ts';

const nonce = newDiscoveryNonce();
const injection = webMediaDiscoveryInjection(nonce);

assert.equal(
  castableDiscoveredContentType(
    'https://cdn.example.com/game/master.m3u8',
    HLS_CONTENT_TYPE,
    false,
  ),
  HLS_CONTENT_TYPE,
);
assert.equal(
  castableDiscoveredContentType(
    'https://cdn.example.com/live/playlist',
    HLS_CONTENT_TYPE,
    false,
  ),
  HLS_CONTENT_TYPE,
);
assert.equal(
  castableDiscoveredContentType(
    'https://cdn.example.com/manifest.mpd',
    DASH_CONTENT_TYPE,
    false,
  ),
  DASH_CONTENT_TYPE,
);
assert.equal(
  castableDiscoveredContentType(
    'https://cdn.example.com/clip.mp4',
    MP4_CONTENT_TYPE,
    false,
  ),
  MP4_CONTENT_TYPE,
);

assert.equal(
  castableDiscoveredContentType(
    'http://10.0.0.12/live/playlist',
    HLS_CONTENT_TYPE,
    false,
  ),
  undefined,
);
assert.equal(
  castableDiscoveredContentType(
    'http://10.0.0.12/live/playlist',
    HLS_CONTENT_TYPE,
    true,
  ),
  HLS_CONTENT_TYPE,
);

assert.equal(
  castableDiscoveredContentType(
    'https://cdn.example.com/live/playlist',
    'video/*',
    false,
  ),
  undefined,
);
assert.equal(
  castableDiscoveredContentType(
    'javascript:alert(1)',
    HLS_CONTENT_TYPE,
    false,
  ),
  undefined,
);
assert.equal(
  castableDiscoveredContentType('not a url', HLS_CONTENT_TYPE, false),
  undefined,
);
assert.equal(
  castableDiscoveredContentType(undefined, HLS_CONTENT_TYPE, false),
  undefined,
);
assert.equal(
  castableDiscoveredContentType(
    'https://cdn.example.com/live/playlist',
    undefined,
    false,
  ),
  undefined,
);

assert.match(injection, /Hls\.prototype\.loadSource/);
assert.match(injection, /type: 'media-url'/);
assert.match(injection, /getResponseHeader\('content-type'\)/);
assert.match(injection, /source: fromPlayer \? 'player' : 'network'/);
assert.ok(injection.includes(`var nonce = "${nonce}";`));
assert.match(nonce, /^[0-9a-f]{32}$/);
assert.notEqual(newDiscoveryNonce(), nonce);

assert.deepEqual(
  preferDiscoveredMedia(undefined, {
    contentType: HLS_CONTENT_TYPE,
    source: 'network',
    url: 'https://cdn.example.com/v5/prog_index.m3u8',
  }),
  {
    contentType: HLS_CONTENT_TYPE,
    source: 'network',
    url: 'https://cdn.example.com/v5/prog_index.m3u8',
  },
);
assert.deepEqual(
  preferDiscoveredMedia(
    {
      contentType: HLS_CONTENT_TYPE,
      source: 'network',
      url: 'https://cdn.example.com/v5/prog_index.m3u8',
    },
    {
      contentType: HLS_CONTENT_TYPE,
      source: 'player',
      url: 'https://cdn.example.com/master.m3u8',
    },
  ),
  {
    contentType: HLS_CONTENT_TYPE,
    source: 'player',
    url: 'https://cdn.example.com/master.m3u8',
  },
);
assert.deepEqual(
  preferDiscoveredMedia(
    {
      contentType: HLS_CONTENT_TYPE,
      source: 'player',
      url: 'https://cdn.example.com/master.m3u8',
    },
    {
      contentType: HLS_CONTENT_TYPE,
      source: 'network',
      url: 'https://cdn.example.com/v9/prog_index.m3u8',
    },
  ),
  {
    contentType: HLS_CONTENT_TYPE,
    source: 'player',
    url: 'https://cdn.example.com/master.m3u8',
  },
);
assert.deepEqual(
  preferDiscoveredMedia(
    {
      contentType: MP4_CONTENT_TYPE,
      source: 'player',
      url: 'https://cdn.example.com/ad.mp4',
    },
    {
      contentType: HLS_CONTENT_TYPE,
      source: 'player',
      url: 'https://cdn.example.com/game.m3u8',
    },
  ),
  {
    contentType: HLS_CONTENT_TYPE,
    source: 'player',
    url: 'https://cdn.example.com/game.m3u8',
  },
);

assert.equal(showCastDialogOnTvPress(false, false), true);
assert.equal(showCastDialogOnTvPress(false, true), false);
assert.equal(showCastDialogOnTvPress(true, true), true);
assert.equal(showCastDialogOnTvPress(true, false), true);
assert.equal(phoneHoldForReceiverState('playing'), true);
assert.equal(phoneHoldForReceiverState('BUFFERING'), true);
assert.equal(phoneHoldForReceiverState('loading'), true);
assert.equal(phoneHoldForReceiverState('paused'), true);
assert.equal(phoneHoldForReceiverState('idle'), false);
assert.equal(phoneHoldForReceiverState('none'), undefined);
assert.equal(phoneHoldForReceiverState(undefined), undefined);
assert.equal(
  pagePlaybackHoldScript(true),
  'window.__dannerSetPlaybackHeld && window.__dannerSetPlaybackHeld(true); true;',
);
assert.equal(
  pagePlaybackHoldScript(false),
  'window.__dannerSetPlaybackHeld && window.__dannerSetPlaybackHeld(false); true;',
);
assert.match(injection, /__dannerSetPlaybackHeld/);
assert.match(injection, /stopLoad/);

function bootHeldPage() {
  const videos = [];
  const listeners = [];
  function Hls() {}
  Hls.prototype.loadSource = function () {
    this.loaded = (this.loaded ?? 0) + 1;
    return 'loaded';
  };
  Hls.prototype.stopLoad = function () {
    this.stopped = (this.stopped ?? 0) + 1;
  };
  Hls.prototype.startLoad = function () {
    this.started = (this.started ?? 0) + 1;
  };
  const document = {
    baseURI: 'https://player.example/',
    querySelectorAll() {
      return videos;
    },
    addEventListener(type, fn, capture) {
      listeners.push({ type, fn, capture });
    },
  };
  const sandbox = {
    URL,
    document,
    setInterval() {
      return 1;
    },
    clearInterval() {},
    performance: {
      getEntriesByType() {
        return [];
      },
    },
    window: { Hls },
  };
  vm.createContext(sandbox);
  vm.runInContext(injection, sandbox);
  return { sandbox, videos, listeners };
}

const heldPage = bootHeldPage();
const video = {
  pauseCount: 0,
  playCount: 0,
  pause() {
    this.pauseCount += 1;
  },
  play() {
    this.playCount += 1;
  },
};
heldPage.videos.push(video);
heldPage.sandbox.window.__dannerSetPlaybackHeld(false);
assert.equal(video.pauseCount, 0);
heldPage.sandbox.window.__dannerSetPlaybackHeld(true);
assert.equal(video.pauseCount, 1);

const player = new heldPage.sandbox.window.Hls();
assert.equal(player.loadSource('https://cdn.example.com/master.m3u8'), 'loaded');
assert.equal(player.loaded, 1);
assert.equal(player.stopped, 1);
assert.equal(heldPage.sandbox.window.__dannerHls, player);

const playListener = heldPage.listeners.find((entry) => entry.type === 'play');
assert.equal(playListener.capture, true);
playListener.fn({ target: video });
assert.equal(video.pauseCount, 2);
assert.equal(player.stopped, 2);

heldPage.sandbox.window.__dannerSetPlaybackHeld(true);
assert.equal(video.playCount, 0);
heldPage.sandbox.window.__dannerSetPlaybackHeld(false);
assert.equal(video.playCount, 1);
assert.equal(player.started, 1);
player.loadSource('https://cdn.example.com/master.m3u8');
assert.equal(player.loaded, 2);
assert.equal(player.stopped, 2);
heldPage.sandbox.window.__dannerSetPlaybackHeld(false);
assert.equal(video.playCount, 1);

assert.equal(castStreamTypeForUrl('https://cdn.example.com/game.m3u8'), 'buffered');
assert.equal(castStreamTypeForRelay(true), 'live');
assert.equal(castStreamTypeForRelay(false), 'buffered');

const high = {
  audioOnly: false,
  bandwidth: 8_000_000,
  url: 'https://cdn.example.com/high.m3u8',
};
const mid = {
  audioOnly: false,
  bandwidth: 2_500_000,
  url: 'https://cdn.example.com/mid.m3u8',
};
const low = {
  audioOnly: false,
  bandwidth: 800_000,
  url: 'https://cdn.example.com/low.m3u8',
};
const audio = {
  audioOnly: true,
  bandwidth: 128_000,
  url: 'https://cdn.example.com/audio.m3u8',
};
assert.equal(selectRelayVariant([high, mid, low])?.url, mid.url);
assert.equal(selectRelayVariant([high, audio])?.url, high.url);
assert.equal(selectRelayVariant([audio, mid])?.url, mid.url);
assert.equal(
  selectRelayVariant([
    { audioOnly: false, bandwidth: -1, url: 'https://cdn.example.com/a.m3u8' },
    { audioOnly: false, bandwidth: -1, url: 'https://cdn.example.com/b.m3u8' },
  ])?.url,
  'https://cdn.example.com/a.m3u8',
);
assert.equal(selectRelayVariant([]), undefined);
assert.equal(
  streamInfBandwidth(
    '#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=1000000,BANDWIDTH=2500000',
  ),
  2_500_000,
);
assert.equal(
  streamInfBandwidth('#EXT-X-STREAM-INF:BANDWIDTH=800000'),
  800_000,
);
assert.equal(
  streamInfAudioOnly(
    '#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"',
  ),
  true,
);
assert.equal(
  streamInfAudioOnly(
    '#EXT-X-STREAM-INF:BANDWIDTH=2500000,CODECS="avc1.4d401f,mp4a.40.2"',
  ),
  false,
);

const mediaMessage = (fields) =>
  JSON.stringify({
    contentType: HLS_CONTENT_TYPE,
    nonce,
    source: 'player',
    type: 'media-url',
    url: 'https://cdn.example.com/live/playlist',
    ...fields,
  });

assert.deepEqual(parseDiscoveredMediaMessage(mediaMessage({}), nonce, false), {
  contentType: HLS_CONTENT_TYPE,
  source: 'player',
  url: 'https://cdn.example.com/live/playlist',
});
assert.deepEqual(
  parseDiscoveredMediaMessage(
    mediaMessage({ contentType: DASH_CONTENT_TYPE, source: 'network' }),
    nonce,
    false,
  ),
  {
    contentType: DASH_CONTENT_TYPE,
    source: 'network',
    url: 'https://cdn.example.com/live/playlist',
  },
);
assert.equal(
  parseDiscoveredMediaMessage(mediaMessage({ nonce: newDiscoveryNonce() }), nonce, false),
  undefined,
);
assert.equal(
  parseDiscoveredMediaMessage(mediaMessage({ nonce: undefined }), nonce, false),
  undefined,
);
assert.equal(parseDiscoveredMediaMessage(mediaMessage({}), '', false), undefined);
assert.equal(
  parseDiscoveredMediaMessage(mediaMessage({ type: 'other' }), nonce, false),
  undefined,
);
assert.equal(
  parseDiscoveredMediaMessage(mediaMessage({ source: 'frame' }), nonce, false),
  undefined,
);
assert.equal(
  parseDiscoveredMediaMessage(mediaMessage({ source: undefined }), nonce, false),
  undefined,
);
assert.equal(
  parseDiscoveredMediaMessage(mediaMessage({ url: 42 }), nonce, false),
  undefined,
);
assert.equal(
  parseDiscoveredMediaMessage(mediaMessage({ contentType: 'video/*' }), nonce, false),
  undefined,
);
assert.equal(
  parseDiscoveredMediaMessage(
    mediaMessage({ url: 'javascript:alert(1)' }),
    nonce,
    false,
  ),
  undefined,
);
assert.equal(
  parseDiscoveredMediaMessage(
    mediaMessage({ url: 'http://10.0.0.12/live/playlist' }),
    nonce,
    false,
  ),
  undefined,
);
assert.equal(
  parseDiscoveredMediaMessage(
    mediaMessage({ url: 'http://10.0.0.12/live/playlist' }),
    nonce,
    true,
  )?.url,
  'http://10.0.0.12/live/playlist',
);
assert.equal(parseDiscoveredMediaMessage('not json', nonce, false), undefined);
assert.equal(parseDiscoveredMediaMessage('null', nonce, false), undefined);
assert.equal(parseDiscoveredMediaMessage('"media-url"', nonce, false), undefined);

function bootDiscoveryPage(pageNonce, videoNodes = []) {
  const posted = [];
  const listeners = [];
  function Hls() {}
  Hls.prototype.loadSource = function () {
    return 'loaded';
  };
  const window = {
    Hls,
    ReactNativeWebView: {
      postMessage(message) {
        posted.push(message);
      },
    },
    fetch(input) {
      const url = typeof input === 'string' ? input : input.url;
      return Promise.resolve({
        headers: {
          get() {
            return url.includes('.mpd') ? DASH_CONTENT_TYPE : HLS_CONTENT_TYPE;
          },
        },
        url,
      });
    },
  };
  const sandbox = {
    URL,
    document: {
      baseURI: 'https://player.example/',
      addEventListener(type, fn, capture) {
        listeners.push({ type, fn, capture });
      },
      querySelectorAll() {
        return videoNodes;
      },
    },
    performance: {
      getEntriesByType() {
        return [];
      },
    },
    clearInterval() {},
    setInterval() {
      return 1;
    },
    window,
  };
  vm.createContext(sandbox);
  vm.runInContext(webMediaDiscoveryInjection(pageNonce), sandbox);
  return { posted, window };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

// A player MP4 bumper, then the player's HLS game stream from an extensionless path.
const adVideo = {
  currentSrc: '',
  getAttribute(name) {
    return name === 'src' ? 'https://ads.example/bumper.mp4' : null;
  },
  src: 'https://ads.example/bumper.mp4',
};
const upgradePage = bootDiscoveryPage(nonce, [adVideo]);
assert.equal(upgradePage.posted.length, 1);
new upgradePage.window.Hls().loadSource('https://cdn.example.com/live/playlist');
await upgradePage.window.fetch('https://cdn.example.com/v9/prog_index.m3u8');
await tick();
new upgradePage.window.Hls().loadSource('https://cdn.example.com/other.mpd');
new upgradePage.window.Hls().loadSource('https://ads.example/second.mp4');
assert.equal(upgradePage.posted.length, 2);
const upgradeMedia = upgradePage.posted.map((message) =>
  parseDiscoveredMediaMessage(message, nonce, false),
);
assert.deepEqual(upgradeMedia, [
  {
    contentType: MP4_CONTENT_TYPE,
    source: 'player',
    url: 'https://ads.example/bumper.mp4',
  },
  {
    contentType: HLS_CONTENT_TYPE,
    source: 'player',
    url: 'https://cdn.example.com/live/playlist',
  },
]);
assert.deepEqual(
  upgradeMedia.reduce((current, next) => preferDiscoveredMedia(current, next), undefined),
  upgradeMedia[1],
);
assert.equal(
  parseDiscoveredMediaMessage(upgradePage.posted[1], newDiscoveryNonce(), false),
  undefined,
);

// Network discovery reports one URL; the player's own URL still replaces it.
const networkPage = bootDiscoveryPage(nonce);
await networkPage.window.fetch('https://cdn.example.com/v5/prog_index.m3u8');
await networkPage.window.fetch('https://cdn.example.com/v9/prog_index.m3u8');
await tick();
new networkPage.window.Hls().loadSource('https://cdn.example.com/master.m3u8');
new networkPage.window.Hls().loadSource('https://cdn.example.com/backup.m3u8');
assert.deepEqual(
  networkPage.posted.map((message) => parseDiscoveredMediaMessage(message, nonce, false)),
  [
    {
      contentType: HLS_CONTENT_TYPE,
      source: 'network',
      url: 'https://cdn.example.com/v5/prog_index.m3u8',
    },
    {
      contentType: HLS_CONTENT_TYPE,
      source: 'player',
      url: 'https://cdn.example.com/master.m3u8',
    },
  ],
);

// A player HLS URL is not replaced by a later player MP4.
const hlsVideo = {
  currentSrc: '',
  getAttribute() {
    return null;
  },
  src: 'https://cdn.example.com/game.m3u8',
};
const hlsFirstPage = bootDiscoveryPage(nonce, [hlsVideo]);
new hlsFirstPage.window.Hls().loadSource('https://ads.example/late.mp4');
assert.equal(hlsFirstPage.posted.length, 1);
assert.equal(
  parseDiscoveredMediaMessage(hlsFirstPage.posted[0], nonce, false)?.url,
  'https://cdn.example.com/game.m3u8',
);

assert.equal(relayKindForContentType(HLS_CONTENT_TYPE), 'hls');
assert.equal(relayKindForContentType('application/vnd.apple.mpegurl'), 'hls');
assert.equal(relayKindForContentType(DASH_CONTENT_TYPE), 'dash');
assert.equal(relayKindForContentType(MP4_CONTENT_TYPE), 'mp4');
assert.equal(relayKindForContentType('video/mp4; codecs="avc1"'), 'mp4');
assert.equal(relayKindForContentType('video/*'), undefined);
assert.equal(relayKindForContentType('text/html'), undefined);
assert.equal(relayKindForContentType(''), undefined);

assert.equal(relayStartFailureForCode('ERR_NO_NETWORK'), 'no-network');
assert.equal(relayStartFailureForCode('ERR_SOURCE'), 'source-unavailable');
assert.equal(relayStartFailureForCode('ERR_UNSUPPORTED'), 'unsupported');
assert.equal(relayStartFailureForCode('ERR_RELAY'), 'failed');
assert.equal(relayStartFailureForCode(undefined), 'failed');
assert.equal(
  tvRelayFailureMessage(relayStartFailureForCode('ERR_NO_NETWORK')),
  'Connect this phone to the same Wi-Fi as the TV.',
);
assert.equal(
  tvRelayFailureMessage(relayStartFailureForCode('ERR_SOURCE')),
  'The game stream is not answering right now. Try again in a minute.',
);
assert.equal(
  tvRelayFailureMessage(relayStartFailureForCode('ERR_UNSUPPORTED')),
  "This page's video can't be sent to the TV.",
);
assert.equal(
  tvRelayFailureMessage(relayStartFailureForCode('ERR_RELAY')),
  'Could not send to the TV.',
);
assert.equal(
  TV_PLAYBACK_FAILED_MESSAGE,
  'The TV could not play the stream. Press TV to try again.',
);

const token = '0123456789abcdef0123456789abcdef';
const nativeHls = {
  contentType: HLS_CONTENT_TYPE,
  kind: 'hls',
  live: true,
  origin: 'http://192.168.1.20:8108',
  path: `/${token}/live.m3u8`,
  port: 8108,
  segmentFormat: 'fmp4',
  token,
};
assert.deepEqual(liveRelayFromNative(nativeHls, 'hls'), {
  ok: true,
  relay: {
    contentType: HLS_CONTENT_TYPE,
    kind: 'hls',
    live: true,
    mediaUrl: `http://192.168.1.20:8108/${token}/live.m3u8`,
    origin: 'http://192.168.1.20:8108',
    port: 8108,
    segmentFormat: 'fmp4',
    token,
  },
});
assert.deepEqual(
  liveRelayFromNative(
    {
      contentType: MP4_CONTENT_TYPE,
      kind: 'mp4',
      live: false,
      origin: 'http://10.0.2.16:8109/',
      path: `/${token}/media.mp4`,
      port: 8109,
      token,
    },
    'mp4',
  ),
  {
    ok: true,
    relay: {
      contentType: MP4_CONTENT_TYPE,
      kind: 'mp4',
      live: false,
      mediaUrl: `http://10.0.2.16:8109/${token}/media.mp4`,
      origin: 'http://10.0.2.16:8109',
      port: 8109,
      token,
    },
  },
);
const nativeDash = liveRelayFromNative(
  {
    ...nativeHls,
    contentType: DASH_CONTENT_TYPE,
    kind: 'dash',
    origin: 'http://172.20.0.5:8110',
    path: `/${token}/live.mpd`,
    port: 8110,
  },
  'dash',
);
assert.equal(nativeDash.ok, true);
assert.equal(nativeDash.relay.segmentFormat, undefined);
assert.equal(nativeDash.relay.mediaUrl, `http://172.20.0.5:8110/${token}/live.mpd`);
for (const origin of [
  'http://127.0.0.1:8108',
  'http://0.0.0.0:8108',
  'http://169.254.10.2:8108',
  'http://192.0.0.4:8108',
  'http://100.72.4.9:8108',
  'http://172.32.0.1:8108',
  'http://8.8.8.8:8108',
  'http://localhost:8108',
  'http://[::1]:8108',
]) {
  assert.deepEqual(
    liveRelayFromNative({ ...nativeHls, origin }, 'hls'),
    { ok: false, reason: 'no-network' },
    origin,
  );
}
assert.deepEqual(
  liveRelayFromNative({ ...nativeHls, token: 'ABC' }, 'hls'),
  { ok: false, reason: 'failed' },
);
assert.deepEqual(
  liveRelayFromNative({ ...nativeHls, path: '/live.m3u8' }, 'hls'),
  { ok: false, reason: 'failed' },
);
assert.deepEqual(
  liveRelayFromNative({ ...nativeHls, port: 8111 }, 'hls'),
  { ok: false, reason: 'failed' },
);
assert.deepEqual(liveRelayFromNative(nativeHls, 'dash'), {
  ok: false,
  reason: 'failed',
});
assert.deepEqual(liveRelayFromNative(undefined, 'hls'), {
  ok: false,
  reason: 'failed',
});
assert.equal(isPrivateLanIpv4('10.0.0.1'), true);
assert.equal(isPrivateLanIpv4('172.16.0.1'), true);
assert.equal(isPrivateLanIpv4('172.31.255.255'), true);
assert.equal(isPrivateLanIpv4('192.168.0.1'), true);
assert.equal(isPrivateLanIpv4('192.168.0.256'), false);
assert.equal(isPrivateLanIpv4('11.0.0.1'), false);

assert.deepEqual(relayStatusFromNative({ running: true, token, kind: 'hls', port: 8108 }), {
  kind: 'hls',
  port: 8108,
  running: true,
  token,
});
assert.deepEqual(relayStatusFromNative({ running: 'yes' }), { running: false });
assert.deepEqual(relayStatusFromNative(null), { running: false });
assert.equal(relayStillServing({ running: true, token }, token), true);
assert.equal(relayStillServing({ running: false, token }, token), false);
assert.equal(relayStillServing({ running: true, token: 'f'.repeat(32) }, token), false);
assert.equal(relayStillServing({ running: true }, token), false);

const relayUrl = `http://192.168.1.20:8108/${token}/live.m3u8`;
assert.equal(receiverPlaybackFailed('idle', 'error'), true);
assert.equal(receiverPlaybackFailed('IDLE', 'ERROR'), true);
assert.equal(receiverPlaybackFailed('idle', 'finished'), false);
assert.equal(receiverPlaybackFailed('idle', 'interrupted'), false);
assert.equal(receiverPlaybackFailed('playing', 'error'), false);
assert.equal(receiverPlaybackFailed(undefined, undefined), false);
assert.equal(
  receiverHasMedia({ mediaInfo: { contentUrl: relayUrl }, playerState: 'playing' }, relayUrl),
  true,
);
assert.equal(
  receiverHasMedia({ mediaInfo: { contentId: relayUrl }, playerState: 'buffering' }, relayUrl),
  true,
);
assert.equal(
  receiverHasMedia({ mediaInfo: { contentUrl: relayUrl }, playerState: 'idle' }, relayUrl),
  false,
);
assert.equal(
  receiverHasMedia(
    { mediaInfo: { contentUrl: 'https://cdn.example.com/clip.mp4' }, playerState: 'playing' },
    relayUrl,
  ),
  false,
);
assert.equal(receiverHasMedia(null, relayUrl), false);
assert.equal(receiverHasMedia({ mediaInfo: null, playerState: 'playing' }, relayUrl), false);
assert.equal(tvPressForcesReload('playing'), false);
assert.equal(tvPressForcesReload('paused'), false);
assert.equal(tvPressForcesReload('buffering'), true);
assert.equal(tvPressForcesReload('idle'), true);
assert.equal(tvPressForcesReload('none'), true);
assert.equal(tvPressForcesReload(undefined), true);

console.log('cast discovery checks passed');
