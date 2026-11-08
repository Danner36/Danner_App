import type { RelayStartFailure } from '../modules/danner-live-hls/src/liveRelay';

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

/** A per-load secret the page injection stamps on every message it posts. */
export function newDiscoveryNonce(): string {
  const bytes = new Uint8Array(16);
  const random = (
    globalThis as {
      crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array };
    }
  ).crypto;
  if (typeof random?.getRandomValues === 'function') {
    random.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

/**
 * Reports the media URL an approved player page is actually loading, together with the
 * content type that identified it. A provider playlist is often served from a path with no
 * file extension, so the page hooks take the type from the hls.js entry point and from
 * response headers instead of inferring it from the URL alone.
 *
 * The nonce stays in the script's closure. Android opens the message bridge to every frame,
 * and a message without it did not come from this script.
 */
export function webMediaDiscoveryInjection(nonce: string): string {
  return `
(function () {
  if (window.__dannerMediaDiscovery) {
    return;
  }
  window.__dannerMediaDiscovery = true;

  var HLS = '${HLS_CONTENT_TYPE}';
  var DASH = '${DASH_CONTENT_TYPE}';
  var MP4 = '${MP4_CONTENT_TYPE}';
  var nonce = ${JSON.stringify(nonce)};
  var reported = {};
  var playerType = '';
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
    if (playerType) {
      // A player MP4 is often a bumper or ad in front of the game, so the player's
      // later HLS or DASH URL is still reported.
      if (!fromPlayer || playerType !== MP4 || contentType === MP4) {
        return;
      }
    } else if (!fromPlayer && networkLocked) {
      return;
    }
    var key = url + '|' + contentType;
    if (reported[key]) {
      return;
    }
    reported[key] = true;
    if (fromPlayer) {
      playerType = contentType;
    } else {
      networkLocked = true;
    }
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            contentType: contentType,
            nonce: nonce,
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
          window.__dannerHls = this;
          send(String(url || ''), HLS, true);
          var result = original.apply(this, arguments);
          if (window.__dannerPlaybackHeld && this.stopLoad) {
            try {
              this.stopLoad();
            } catch (_) {}
          }
          return result;
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

  // While a Cast receiver has the relay, pause the page and stop hls.js so the
  // phone radio is not also downloading the on-screen copy.
  var applyPlaybackHold = function (releasing) {
    var nodes = document.querySelectorAll('video, audio');
    for (var index = 0; index < nodes.length; index += 1) {
      try {
        if (window.__dannerPlaybackHeld) {
          nodes[index].pause();
        } else if (releasing) {
          var pending = nodes[index].play();
          if (pending && pending.catch) {
            pending.catch(function () {});
          }
        }
      } catch (_) {}
    }
    var hls = window.__dannerHls;
    if (!hls) {
      return;
    }
    try {
      if (window.__dannerPlaybackHeld && hls.stopLoad) {
        hls.stopLoad();
      } else if (releasing && hls.startLoad) {
        hls.startLoad();
      }
    } catch (_) {}
  };

  window.__dannerSetPlaybackHeld = function (held) {
    var next = !!held;
    if (next === !!window.__dannerPlaybackHeld) {
      return;
    }
    window.__dannerPlaybackHeld = next;
    if (window.__dannerHoldTimer) {
      clearInterval(window.__dannerHoldTimer);
      window.__dannerHoldTimer = 0;
    }
    applyPlaybackHold(true);
    if (!window.__dannerPlaybackHeld) {
      return;
    }
    window.__dannerHoldTimer = setInterval(function () {
      applyPlaybackHold(false);
    }, 1000);
  };

  document.addEventListener(
    'play',
    function (event) {
      if (!window.__dannerPlaybackHeld) {
        return;
      }
      var target = event.target;
      if (target && target.pause) {
        try {
          target.pause();
        } catch (_) {}
      }
      var hls = window.__dannerHls;
      if (hls && hls.stopLoad) {
        try {
          hls.stopLoad();
        } catch (_) {}
      }
    },
    true,
  );

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
}

/**
 * Accepts a `media-url` message only when it carries this load's nonce and names a
 * castable URL and content type for this source's transport policy.
 */
export function parseDiscoveredMediaMessage(
  data: string,
  nonce: string,
  allowInsecureHttp: boolean,
): DiscoveredMedia | undefined {
  if (typeof data !== 'string' || typeof nonce !== 'string' || !nonce) {
    return undefined;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const message = payload as Record<string, unknown>;
  if (
    message.type !== 'media-url' ||
    message.nonce !== nonce ||
    typeof message.url !== 'string'
  ) {
    return undefined;
  }
  if (message.source !== 'player' && message.source !== 'network') {
    return undefined;
  }
  const contentType = castableDiscoveredContentType(
    message.url,
    message.contentType,
    allowInsecureHttp,
  );
  if (!contentType) {
    return undefined;
  }
  return { contentType, source: message.source, url: message.url };
}

/** Asks the isolated page to pause or resume the on-screen player. */
export function pagePlaybackHoldScript(held: boolean): string {
  return `window.__dannerSetPlaybackHeld && window.__dannerSetPlaybackHeld(${
    held ? 'true' : 'false'
  }); true;`;
}

/**
 * The first TV press opens the Cast dialog only when no receiver is connected.
 * A later press opens it again so the connected dialog can stop the session or
 * change the volume.
 */
export function showCastDialogOnTvPress(
  alreadyRelaying: boolean,
  hasClient: boolean,
): boolean {
  return alreadyRelaying || !hasClient;
}

/**
 * The phone pauses its page while the receiver is buffering, playing, or paused.
 * Idle means the receiver dropped the stream, so the page may play again.
 */
export function phoneHoldForReceiverState(state: unknown): boolean | undefined {
  if (typeof state !== 'string') {
    return undefined;
  }
  switch (state.toLowerCase()) {
    case 'playing':
    case 'buffering':
    case 'loading':
    case 'paused':
      return true;
    case 'idle':
      return false;
    default:
      return undefined;
  }
}

/** The receiver dropped the stream because it could not fetch or decode it. */
export function receiverPlaybackFailed(
  state: unknown,
  idleReason: unknown,
): boolean {
  return (
    typeof state === 'string' &&
    state.toLowerCase() === 'idle' &&
    typeof idleReason === 'string' &&
    idleReason.toLowerCase() === 'error'
  );
}

type ReceiverStatusLike =
  | {
      mediaInfo?: { contentId?: unknown; contentUrl?: unknown } | null;
      playerState?: unknown;
    }
  | null
  | undefined;

/**
 * True when the receiver is already on this URL and has not gone idle, so a resumed or
 * reopened session does not restart it.
 */
export function receiverHasMedia(
  status: ReceiverStatusLike,
  playbackUrl: string,
): boolean {
  const info = status?.mediaInfo;
  if (!info || !playbackUrl) {
    return false;
  }
  if (info.contentUrl !== playbackUrl && info.contentId !== playbackUrl) {
    return false;
  }
  return phoneHoldForReceiverState(status?.playerState) === true;
}

/**
 * A TV press with a running relay reloads the receiver unless it is already playing or
 * paused, so opening the dialog for the volume does not restart the game.
 */
export function tvPressForcesReload(receiverState: unknown): boolean {
  if (typeof receiverState !== 'string') {
    return true;
  }
  const state = receiverState.toLowerCase();
  return state !== 'playing' && state !== 'paused';
}

export const TV_PLAYBACK_FAILED_MESSAGE =
  'The TV could not play the stream. Press TV to try again.';

export function tvRelayFailureMessage(reason: RelayStartFailure): string {
  switch (reason) {
    case 'no-network':
      return 'Connect this phone to the same Wi-Fi as the TV.';
    case 'source-unavailable':
      return 'The game stream is not answering right now. Try again in a minute.';
    case 'unsupported':
      return "This page's video can't be sent to the TV.";
    default:
      return 'Could not send to the TV.';
  }
}
