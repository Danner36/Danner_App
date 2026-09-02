import assert from 'node:assert/strict';

import {
  DASH_CONTENT_TYPE,
  HLS_CONTENT_TYPE,
  MP4_CONTENT_TYPE,
  WEB_MEDIA_DISCOVERY_INJECTION,
  castableDiscoveredContentType,
} from '../../app/guardians/webMediaDiscoveryInjection.ts';

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

console.log('cast discovery checks passed');
