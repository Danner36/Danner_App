import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { PROVIDERS, providerForHost, providerForUrl, providerShowsOffline } from '../lib/extract/providers.mjs';
import {
  extractFromListing,
  httpFailureCode,
  isChallengeFrameUrl,
  navigationFailureCode,
  playerFailureCode,
} from '../lib/extract/listing.mjs';

const LISTING_URL = 'https://listing-one.test/live';
const GAME_URL = 'https://listing-one.test/stream/cleveland-guardians-detroit-tigers';
const EMBED_URL = 'https://gooz.aapmains.net/new-stream-embed/57001';

function timeoutError() {
  const error = new Error('Timeout exceeded');
  error.name = 'TimeoutError';
  return error;
}

class FakeFrame {
  constructor(url) {
    this.urlValue = url;
  }
  url() {
    return this.urlValue;
  }
  async evaluate() {
    return [];
  }
  async content() {
    return '';
  }
  locator() {
    return { first: () => ({ count: async () => 0 }) };
  }
}

// Plays back one scripted load: listing response, title, links, game response, frames.
class FakePage extends EventEmitter {
  constructor(script) {
    super();
    this.script = script;
    this.currentUrl = 'about:blank';
    this.mainFrameValue = new FakeFrame('about:blank');
    this.extraFrames = [];
    this.titleValue = script.listingTitle ?? 'Listing';
    this.mouse = { click: async () => {} };
    this.gameLoaded = false;
  }
  mainFrame() {
    return this.mainFrameValue;
  }
  frames() {
    return [this.mainFrameValue, ...this.extraFrames];
  }
  url() {
    return this.currentUrl;
  }
  isClosed() {
    return this.script.closed === true;
  }
  commit(url, frames = []) {
    this.currentUrl = url;
    this.mainFrameValue.urlValue = url;
    this.extraFrames = frames.map((frameUrl) => new FakeFrame(frameUrl));
    this.emit('framenavigated', this.mainFrameValue);
  }
  respond(url, { headers = {}, navigation = true, status = 200 }) {
    const page = this;
    const response = {
      frame: () => page.mainFrameValue,
      headers: () => headers,
      request: () => ({
        frame: () => page.mainFrameValue,
        isNavigationRequest: () => navigation,
        url: () => url,
      }),
      status: () => status,
      text: async () => '',
      url: () => url,
    };
    this.emit('response', response);
    return response;
  }
  async goto(url) {
    if (url === LISTING_URL) {
      if (this.script.listingThrows) {
        throw this.script.listingThrows;
      }
      const redirected = this.script.redirectTo ?? url;
      const response = this.respond(redirected, this.script.listing ?? {});
      this.commit(redirected, this.script.listingFrames ?? []);
      return response;
    }
    if (this.script.gameThrows) {
      throw this.script.gameThrows;
    }
    return this.loadGame(url);
  }
  loadGame(url) {
    const response = this.respond(url, this.script.game ?? {});
    this.titleValue = this.script.gameTitle ?? 'Game';
    this.commit(url, this.script.gameFrames ?? []);
    this.gameLoaded = true;
    if (this.script.embedResponse) {
      this.respond(EMBED_URL, { ...this.script.embedResponse, navigation: false });
    }
    return response;
  }
  async title() {
    return this.titleValue;
  }
  async content() {
    return this.gameLoaded ? (this.script.gameHtml ?? '') : '';
  }
  async waitForTimeout() {
    if (this.gameLoaded && this.script.clearGameChallenge) {
      this.respond(this.currentUrl, { status: 200 });
      this.titleValue = 'Game';
      this.script.clearGameChallenge = false;
    }
  }
  async waitForURL(_predicate) {
    throw new Error('no click navigation');
  }
  async waitForSelector() {}
  locator() {
    return { first: () => ({ count: async () => 0 }) };
  }
  async evaluate(fn, arg) {
    const source = fn.toString();
    if (arg && typeof arg === 'object' && 'hrefNeedles' in arg) {
      this.linkPolls = (this.linkPolls ?? 0) + 1;
      this.script.onLinkPoll?.(this.linkPolls);
      return this.script.links ?? [];
    }
    if (source.includes('anchorCount')) {
      return { anchorCount: 0, title: this.titleValue, url: this.currentUrl };
    }
    if (source.includes('iframes')) {
      return {
        iframes: this.script.iframes ?? [],
        title: this.titleValue,
        url: this.currentUrl,
      };
    }
    if (source.includes("querySelectorAll('video').length")) {
      return this.script.videoCount ?? 0;
    }
    if (source.includes('document.querySelectorAll(\'video\')')) {
      return this.script.videoCount ?? 0;
    }
    return Array.isArray(arg) ? [] : false;
  }
}

function goodLink() {
  return { href: GAME_URL, hrefNeedleMatched: true, score: 13, text: 'Tigers at Guardians' };
}

async function attempt(script) {
  const page = new FakePage(script);
  const hosts = [];
  const stages = [];
  const result = await extractFromListing(LISTING_URL, {
    hrefNeedles: ['cleveland-guardians'],
    opponentName: script.opponentName ?? 'Detroit Tigers',
    requireOpponent: script.requireOpponent === true,
    sourceAttempt: {
      context: { newPage: async () => page },
      embedWaitMs: 0,
      linkWaitMs: 0,
      onHost: (host) => hosts.push(host),
      onStage: (stage) => stages.push(stage),
      privateHosts: new Set(),
    },
    timeoutSeconds: 30,
  });
  return { hosts, page, result, stages };
}

test('a listing that throws is nav_error and a listing that times out is nav_timeout', async () => {
  assert.equal((await attempt({ listingThrows: new Error('net::ERR_FAILED') })).result.failure, 'nav_error');
  assert.equal((await attempt({ listingThrows: timeoutError() })).result.failure, 'nav_timeout');
});

test('navigationFailureCode reads Playwright timeouts by name', () => {
  assert.equal(navigationFailureCode(timeoutError()), 'nav_timeout');
  assert.equal(navigationFailureCode(new Error('x')), 'nav_error');
  assert.equal(navigationFailureCode(undefined), 'nav_error');
});

test('httpFailureCode separates client and server errors', () => {
  assert.equal(httpFailureCode(200), undefined);
  assert.equal(httpFailureCode(399), undefined);
  assert.equal(httpFailureCode(undefined), undefined);
  assert.equal(httpFailureCode(404), 'http_4xx');
  assert.equal(httpFailureCode(403), 'http_4xx');
  assert.equal(httpFailureCode(500), 'http_5xx');
  assert.equal(httpFailureCode(503), 'http_5xx');
});

test('a listing error with no challenge marker is classified at once', async () => {
  const client = await attempt({ listing: { status: 404 } });
  assert.equal(client.result.failure, 'http_4xx');
  const server = await attempt({ listing: { status: 500 } });
  assert.equal(server.result.failure, 'http_5xx');
  const forbidden = await attempt({ listing: { status: 403 } });
  assert.equal(forbidden.result.failure, 'http_4xx');
  assert.deepEqual(server.stages, []);
});

test('a 500 carrying a challenge title is still an HTTP error', async () => {
  const { result } = await attempt({ listing: { status: 500 }, listingTitle: 'Just a moment...' });
  assert.equal(result.failure, 'http_5xx');
});

const CHALLENGE_LOADS = [
  ['a cf-mitigated header', { listing: { headers: { 'cf-mitigated': 'challenge' }, status: 403 } }],
  ['a Just a moment title', { listing: { status: 503 }, listingTitle: 'Just a moment...' }],
  ['a challenge frame', { listing: { status: 403 }, listingFrames: ['https://challenges.cloudflare.com/turnstile/v0/x'] }],
];

for (const [name, script] of CHALLENGE_LOADS) {
  test(`${name} waits for links and reports bot_challenge only when none appear`, async () => {
    const blocked = await attempt(script);
    assert.equal(blocked.result.failure, 'bot_challenge');
    assert.deepEqual(blocked.stages, ['link']);

    const passed = await attempt({ ...script, links: [goodLink()], gameHtml: EMBED_URL });
    assert.equal(passed.result.failure, undefined);
    assert.equal(passed.result.playerUrl, EMBED_URL);
  });
}

test('a challenge with ambiguous links stays ambiguous_link', async () => {
  const links = [
    { href: `${GAME_URL}-a`, score: 10, text: 'a' },
    { href: `${GAME_URL}-b`, score: 10, text: 'b' },
  ];
  const { result } = await attempt({ ...CHALLENGE_LOADS[0][1], links });
  assert.equal(result.failure, 'ambiguous_link');
});

test('a challenge page served with 200 and no links is bot_challenge', async () => {
  const { result } = await attempt({ listingTitle: 'Just a moment...' });
  assert.equal(result.failure, 'bot_challenge');
});

test('isChallengeFrameUrl does not count video embeds', () => {
  assert.equal(isChallengeFrameUrl('https://challenges.cloudflare.com/x'), true);
  assert.equal(isChallengeFrameUrl('https://listing-one.test/cdn-cgi/challenge-platform/x'), true);
  assert.equal(isChallengeFrameUrl('https://www.youtube.com/embed/x'), false);
  assert.equal(isChallengeFrameUrl('not a url'), false);
});

async function attemptWithLongLinkWait(script, isAbandoned) {
  const page = new FakePage(script);
  const startedAt = Date.now();
  const result = await extractFromListing(LISTING_URL, {
    hrefNeedles: ['cleveland-guardians'],
    sourceAttempt: {
      context: { newPage: async () => page },
      isAbandoned,
      linkWaitMs: 60_000,
      privateHosts: new Set(),
    },
  });
  return { elapsedMs: Date.now() - startedAt, page, result };
}

test('the link wait ends at once on a closed page instead of spinning', async () => {
  const script = {
    onLinkPoll: () => {
      script.closed = true;
    },
  };
  const { elapsedMs, page } = await attemptWithLongLinkWait(script);
  assert.equal(page.linkPolls, 1);
  assert.ok(elapsedMs < 5_000);
});

test('the link wait ends when the attempt is abandoned', async () => {
  let abandoned = false;
  const script = {
    onLinkPoll: (count) => {
      abandoned = count >= 2;
    },
  };
  const { elapsedMs, page } = await attemptWithLongLinkWait(script, () => abandoned);
  assert.equal(page.linkPolls, 2);
  assert.ok(elapsedMs < 5_000);
});

test('an empty listing is link_not_found', async () => {
  const { result, stages } = await attempt({});
  assert.equal(result.failure, 'link_not_found');
  assert.deepEqual(stages, ['link']);
});

test('requireOpponent with no opponent match is opponent_not_found', async () => {
  const { result } = await attempt({
    links: [{ href: 'https://listing-one.test/stream/cleveland-guardians', score: 13, text: 'x' }],
    requireOpponent: true,
  });
  assert.equal(result.failure, 'opponent_not_found');
});

test('tied links are ambiguous_link', async () => {
  const { result } = await attempt({
    links: [
      { href: 'https://listing-one.test/a/cleveland-guardians-detroit-tigers', score: 13, text: 'a' },
      { href: 'https://listing-one.test/b/cleveland-guardians-detroit-tigers', score: 13, text: 'b' },
    ],
  });
  assert.equal(result.failure, 'ambiguous_link');
});

test('a game page that throws, times out, or answers HTTP errors is game_nav', async () => {
  const base = { links: [goodLink()] };
  for (const script of [
    { ...base, gameThrows: new Error('net::ERR_FAILED') },
    { ...base, gameThrows: timeoutError() },
    { ...base, game: { status: 404 } },
    { ...base, game: { status: 500 } },
  ]) {
    const { result, stages } = await attempt(script);
    assert.equal(result.failure, 'game_nav');
    assert.deepEqual(stages, ['link', 'game']);
  }
});

test('a game-page challenge that clears during the embed wait is not a failure', async () => {
  const { result } = await attempt({
    links: [goodLink()],
    game: { headers: { 'cf-mitigated': 'challenge' }, status: 403 },
    gameHtml: EMBED_URL,
    clearGameChallenge: true,
  });
  assert.equal(result.failure, undefined);
  assert.equal(result.playerUrl, EMBED_URL);
});

test('a game-page challenge that never clears is game_nav', async () => {
  const { result } = await attempt({
    links: [goodLink()],
    game: { headers: { 'cf-mitigated': 'challenge' }, status: 403 },
  });
  assert.equal(result.failure, 'game_nav');
});

test('a page with no player is player_not_found', async () => {
  const { result, stages } = await attempt({ links: [goodLink()] });
  assert.equal(result.failure, 'player_not_found');
  assert.deepEqual(stages, ['link', 'game', 'player']);
});

test('a player no provider matches is unknown_provider', async () => {
  const iframe = await attempt({ links: [goodLink()], iframes: ['https://other-player.test/embed/1'] });
  assert.equal(iframe.result.failure, 'unknown_provider');
  const video = await attempt({ links: [goodLink()], videoCount: 1 });
  assert.equal(video.result.failure, 'unknown_provider');
  const frame = await attempt({ links: [goodLink()], gameFrames: ['https://other-player.test/embed/1'] });
  assert.equal(frame.result.failure, 'unknown_provider');
});

test('an unrelated YouTube frame alone is not a player', async () => {
  const { result } = await attempt({ links: [goodLink()], iframes: ['https://www.youtube.com/embed/x'] });
  assert.equal(result.failure, 'player_not_found');
});

test('playerFailureCode counts frames, iframes and videos', () => {
  assert.equal(playerFailureCode({ frameCount: 0, iframeCount: 0, videoCount: 0 }), 'player_not_found');
  assert.equal(playerFailureCode({ frameCount: 1, iframeCount: 0, videoCount: 0 }), 'unknown_provider');
  assert.equal(playerFailureCode({ frameCount: 0, iframeCount: 1, videoCount: 0 }), 'unknown_provider');
  assert.equal(playerFailureCode({ frameCount: 0, iframeCount: 0, videoCount: 1 }), 'unknown_provider');
});

test('an embed that answers an HTTP error is unplayable', async () => {
  const { result, stages } = await attempt({
    links: [goodLink()],
    gameHtml: EMBED_URL,
    embedResponse: { status: 404 },
  });
  assert.equal(result.failure, 'unplayable');
  assert.deepEqual(stages, ['link', 'game', 'player', 'entry']);
});

test('a provider offline marker makes an embed unplayable', async () => {
  const provider = PROVIDERS[0];
  provider.offlineMarkers.push('stream offline');
  try {
    const script = { links: [goodLink()], gameHtml: EMBED_URL, gameFrames: [EMBED_URL] };
    const page = new FakePage(script);
    FakeFrame.prototype.content = async function content() {
      return this.urlValue === EMBED_URL ? '<p>Stream Offline</p>' : '';
    };
    try {
      const result = await extractFromListing(LISTING_URL, {
        hrefNeedles: ['cleveland-guardians'],
        opponentName: 'Detroit Tigers',
        sourceAttempt: {
          context: { newPage: async () => page },
          embedWaitMs: 0,
          linkWaitMs: 0,
          privateHosts: new Set(),
        },
      });
      assert.equal(result.failure, 'unplayable');
    } finally {
      FakeFrame.prototype.content = async function content() {
        return '';
      };
    }
  } finally {
    provider.offlineMarkers.length = 0;
  }
});

test('a found embed succeeds and upgrades http to https', async () => {
  const { result, stages } = await attempt({
    links: [goodLink()],
    gameHtml: EMBED_URL.replace('https:', 'http:'),
  });
  assert.equal(result.failure, undefined);
  assert.equal(result.found, true);
  assert.equal(result.playerUrl, EMBED_URL);
  assert.deepEqual(stages, ['link', 'game', 'player', 'entry']);
});

test('a source attempt reports every listing, redirect and game host and logs none', async () => {
  const redirected = 'https://listing-redirect.test/live';
  const { hosts, result } = await attempt({
    redirectTo: redirected,
    links: [{ href: 'https://game-host.test/stream/cleveland-guardians-detroit-tigers', score: 13, text: 'x' }],
    iframes: ['https://frame-host.test/embed/1'],
  });
  for (const host of ['listing-one.test', 'listing-redirect.test', 'game-host.test']) {
    assert.ok(hosts.includes(host));
  }
  const log = result.logLines.join('\n');
  for (const host of ['listing-one.test', 'listing-redirect.test', 'game-host.test', 'frame-host.test']) {
    assert.equal(log.includes(host), false);
  }
});

test('the provider table starts with the one row and matches by label', () => {
  assert.equal(PROVIDERS.length, 1);
  assert.equal(providerForHost('gooz.aapmains.net')?.id, 'gooz');
  assert.equal(providerForHost('a.gooz.aapmains.net')?.id, 'gooz');
  assert.equal(providerForHost('notgooz.aapmains.net'), undefined);
  assert.equal(providerForUrl('https://gooz.aapmains.net/new-stream-embed/57001')?.id, 'gooz');
  assert.equal(providerForUrl('https://gooz.aapmains.net/new-stream-embed/none'), undefined);
  assert.equal(providerForUrl('not a url'), undefined);
  assert.equal(providerShowsOffline(PROVIDERS[0], 'anything'), false);
});

class DomPage extends FakePage {
  constructor(script, anchors) {
    super(script);
    this.anchors = anchors;
  }
  async evaluate(fn, arg) {
    if (arg && typeof arg === 'object' && 'hrefNeedles' in arg) {
      globalThis.document = { querySelectorAll: () => this.anchors };
      globalThis.window = { location: { href: LISTING_URL } };
      try {
        return fn(arg);
      } finally {
        delete globalThis.document;
        delete globalThis.window;
      }
    }
    return super.evaluate(fn, arg);
  }
}

async function attemptWithHints(leagueHints) {
  const anchors = ['/mlb/cleveland-guardians-a', '/other/cleveland-guardians-b'].map((pathname) => ({
    getAttribute: () => `https://listing-one.test${pathname}`,
    textContent: 'x',
  }));
  const page = new DomPage({ gameHtml: EMBED_URL }, anchors);
  const result = await extractFromListing(LISTING_URL, {
    hrefNeedles: ['cleveland-guardians'],
    leagueHints,
    sourceAttempt: {
      context: { newPage: async () => page },
      embedWaitMs: 0,
      linkWaitMs: 0,
      privateHosts: new Set(),
    },
    timeoutSeconds: 30,
  });
  return { page, result };
}

test('the configured league hints, not a fixed list, set the listing-folder score', async () => {
  const mlb = await attemptWithHints(['/mlb/']);
  assert.equal(mlb.page.url(), 'https://listing-one.test/mlb/cleveland-guardians-a');
  const other = await attemptWithHints(['/other/']);
  assert.equal(other.page.url(), 'https://listing-one.test/other/cleveland-guardians-b');
  const none = await attemptWithHints([]);
  assert.equal(none.result.failure, 'ambiguous_link');
});
