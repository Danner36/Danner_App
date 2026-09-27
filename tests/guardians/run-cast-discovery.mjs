import assert from 'node:assert/strict';
import vm from 'node:vm';

import {
  castStreamTypeForContentType,
  castStreamTypeForUrl,
} from '../../app/guardians/castStreamType.ts';
import {
  DASH_CONTENT_TYPE,
  HLS_CONTENT_TYPE,
  MP4_CONTENT_TYPE,
  WEB_MEDIA_DISCOVERY_INJECTION,
  castableDiscoveredContentType,
  pagePlaybackHoldScript,
  phoneHoldForReceiverState,
  preferDiscoveredMedia,
  showCastDialogOnTvPress,
} from '../../app/guardians/webMediaDiscoveryInjection.ts';
import {
  selectRelayVariant,
  streamInfAudioOnly,
  streamInfBandwidth,
} from '../../app/modules/danner-live-hls/src/relayVariant.ts';

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

assert.match(WEB_MEDIA_DISCOVERY_INJECTION, /Hls\.prototype\.loadSource/);
assert.match(WEB_MEDIA_DISCOVERY_INJECTION, /type: 'media-url'/);
assert.match(WEB_MEDIA_DISCOVERY_INJECTION, /getResponseHeader\('content-type'\)/);
assert.match(WEB_MEDIA_DISCOVERY_INJECTION, /source: fromPlayer \? 'player' : 'network'/);

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
assert.match(WEB_MEDIA_DISCOVERY_INJECTION, /__dannerSetPlaybackHeld/);
assert.match(WEB_MEDIA_DISCOVERY_INJECTION, /stopLoad/);

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
  vm.runInContext(WEB_MEDIA_DISCOVERY_INJECTION, sandbox);
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
assert.equal(castStreamTypeForContentType(HLS_CONTENT_TYPE), 'live');

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

console.log('cast discovery checks passed');
