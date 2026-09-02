export const HLS_CONTENT_TYPE = 'application/x-mpegURL';
export const DASH_CONTENT_TYPE = 'application/dash+xml';
export const MP4_CONTENT_TYPE = 'video/mp4';

/**
 * Accepts a media URL reported by the page injection only when the injection also named a
 * castable content type and the URL matches this source's transport policy. The path is not
 * required to carry a media extension: a provider serves its playlist from an extensionless
 * path, and the content type is what identifies it.
 */
export function castableDiscoveredContentType(
  url: unknown,
  contentType: unknown,
  allowInsecureHttp: boolean,
): string | undefined {
  if (typeof url !== 'string' || typeof contentType !== 'string') {
    return undefined;
  }
  if (
    contentType !== HLS_CONTENT_TYPE &&
    contentType !== DASH_CONTENT_TYPE &&
    contentType !== MP4_CONTENT_TYPE
  ) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' &&
      !(allowInsecureHttp && parsed.protocol === 'http:')
    ) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return contentType;
}

export type DiscoveredMediaSource = 'player' | 'network';

export type DiscoveredMedia = {
  contentType: string;
  source?: DiscoveredMediaSource;
  url: string;
};

/**
 * Keeps the URL the player itself named. Network-only playlist variants and audio
 * renditions that appear after that are ignored. A later player HLS or DASH URL
 * replaces a player MP4.
 */
export function preferDiscoveredMedia(
  current: DiscoveredMedia | undefined,
  next: DiscoveredMedia,
): DiscoveredMedia {
  if (!current) {
    return next;
  }
  if (next.source === 'player' && current.source !== 'player') {
    return next;
  }
  if (current.source === 'player' && next.source !== 'player') {
    return current;
  }
  if (
    current.source === 'player' &&
    next.source === 'player' &&
    current.contentType === MP4_CONTENT_TYPE &&
    next.contentType !== MP4_CONTENT_TYPE
  ) {
    return next;
  }
  return current;
}

/**
 * Reports the media URL an approved player page is actually loading, together with the
 * content type that identified it. A provider playlist is often served from a path with no
 * file extension, so the page hooks take the type from the hls.js entry point and from
 * response headers instead of inferring it from the URL alone.
 */
export const WEB_MEDIA_DISCOVERY_INJECTION = `
(function () {
  if (window.__dannerMediaDiscovery) {
    return;
  }
  window.__dannerMediaDiscovery = true;

  var HLS = '${HLS_CONTENT_TYPE}';
  var DASH = '${DASH_CONTENT_TYPE}';
  var MP4 = '${MP4_CONTENT_TYPE}';
  var reported = {};
  var playerNamed = false;
  var networkLocked = false;

  var typeFromPath = function (value) {
    var path = String(value).split('#')[0].split('?')[0].toLowerCase();
    if (path.indexOf('.m3u8') !== -1) {
      return HLS;
    }
    if (path.indexOf('.mpd') !== -1) {
      return DASH;
    }
    if (path.indexOf('.mp4') !== -1) {
      return MP4;
    }
    return '';
  };

  var typeFromHeader = function (value) {
    var header = String(value || '').toLowerCase();
    if (header.indexOf('mpegurl') !== -1) {
      return HLS;
    }
    if (header.indexOf('dash+xml') !== -1) {
      return DASH;
    }
    if (header.indexOf('video/mp4') !== -1) {
      return MP4;
    }
    return '';
  };

  var send = function (value, knownType, fromPlayer) {
    if (typeof value !== 'string' || !value) {
      return;
    }
    if (value.indexOf('blob:') === 0 || value.indexOf('data:') === 0) {
      return;
    }
    var url = '';
    try {
      url = new URL(value, document.baseURI).href;
    } catch (_) {
      return;
    }
    if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
      return;
    }
    var contentType = knownType || typeFromPath(url);
    if (!contentType) {
      return;
    }
    if (playerNamed) {
      return;
    }
    if (!fromPlayer && networkLocked) {
      return;
    }
    var key = url + '|' + contentType;
    if (reported[key]) {
      return;
    }
    reported[key] = true;
    if (fromPlayer) {
      playerNamed = true;
    } else {
      networkLocked = true;
    }
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            contentType: contentType,
            source: fromPlayer ? 'player' : 'network',
            type: 'media-url',
            url: url,
          }),
        );
      }
    } catch (_) {}
  };

  var scanMedia = function () {
    var nodes = document.querySelectorAll('video, audio, source');
    for (var index = 0; index < nodes.length; index += 1) {
      var node = nodes[index];
      send(node.getAttribute && node.getAttribute('src'), '', true);
      send(node.src, '', true);
      send(node.currentSrc, '', true);
    }
  };

  var scanResources = function () {
    try {
      var entries = performance.getEntriesByType('resource');
      for (var index = 0; index < entries.length; index += 1) {
        send(entries[index].name);
      }
    } catch (_) {}
  };

  // The URL handed to hls.js is a playlist by definition, including the extensionless
  // paths a provider serves it from.
  var hookHls = function () {
    try {
      if (
        window.Hls &&
        window.Hls.prototype &&
        window.Hls.prototype.loadSource &&
        !window.Hls.prototype.__dannerHooked
      ) {
        var original = window.Hls.prototype.loadSource;
        window.Hls.prototype.loadSource = function (url) {
          send(String(url || ''), HLS, true);
          return original.apply(this, arguments);
        };
        window.Hls.prototype.__dannerHooked = true;
      }
    } catch (_) {}
  };

  try {
    var originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      var requested = String(url || '');
      try {
        this.addEventListener('load', function () {
          var header = '';
          try {
            header = this.getResponseHeader('content-type');
          } catch (_) {}
          send(this.responseURL || requested, typeFromHeader(header));
        });
      } catch (_) {}
      send(requested);
      return originalOpen.apply(this, arguments);
    };
  } catch (_) {}

  try {
    var originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = function (input, init) {
        var requested = '';
        if (typeof input === 'string') {
          requested = input;
        } else if (input && typeof input.url === 'string') {
          requested = input.url;
        }
        send(requested);
        var pending = originalFetch.apply(this, arguments);
        try {
          pending.then(
            function (response) {
              try {
                send(
                  response.url || requested,
                  typeFromHeader(response.headers.get('content-type')),
                );
              } catch (_) {}
            },
            function () {},
          );
        } catch (_) {}
        return pending;
      };
    }
  } catch (_) {}

  hookHls();
  scanMedia();
  scanResources();
  setInterval(function () {
    hookHls();
    scanMedia();
    scanResources();
  }, 1000);
})();
true;
`;
