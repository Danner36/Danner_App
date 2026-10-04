import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import {
  EXTRACT_USER_AGENT,
  createGoozCapture,
  describeUrlForLog,
  extractGoozFromBasePage,
  extractRunsHeaded,
  httpsProviderUrl,
  isCloudflareChallengeTitle,
  isIgnoredPlayerFrame,
  opponentSlugVariants,
  redactHosts,
  selectListingLink,
  videoPlayMethod,
} from './lib/extractGooz.mjs';

const extractSourcePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'lib/extractGooz.mjs',
);

test('skips Cloudflare Turnstile and YouTube chat frames', () => {
  assert.equal(
    isIgnoredPlayerFrame(
      'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/turnstile/f/av0/rch/ryc3a/0x4AAAAAAADnPIDROrmt1Wwj/light/fbE/new/normal?lang=auto',
    ),
    true,
  );
  assert.equal(
    isIgnoredPlayerFrame(
      'https://www.youtube.com/live_chat?v=1-K8pOUDDO4&embed_domain=thestreameast.top',
    ),
    true,
  );
  assert.equal(
    isIgnoredPlayerFrame('https://gooz.aapmains.net/new-stream-embed/56072?ad=111'),
    false,
  );
  assert.equal(
    isIgnoredPlayerFrame(
      'https://thestreameast.top/nfl/seattle-seahawks-new-england-patriots/43533696',
    ),
    false,
  );
});

test('video.play() only counts when a video element exists', () => {
  assert.equal(videoPlayMethod(0), undefined);
  assert.equal(videoPlayMethod(2), 'video.play()');
});

test('extractor uses a desktop Chrome user agent', () => {
  assert.match(EXTRACT_USER_AGENT, /Windows NT 10\.0/);
  assert.match(EXTRACT_USER_AGENT, /Chrome\/\d+/);
  assert.equal(EXTRACT_USER_AGENT.includes('HeadlessChrome'), false);
  assert.equal(EXTRACT_USER_AGENT.includes('DannerGuardians'), false);
});

test('extractor source does not load the Guardians MLB schedule', async () => {
  const source = await readFile(extractSourcePath, 'utf8');
  assert.equal(source.includes('mlbSchedule'), false);
  assert.equal(source.includes('getFeaturedGuardiansGame'), false);
  assert.equal(source.includes('No featured Guardians game'), false);
});

test('detects Cloudflare challenge page titles', () => {
  assert.equal(isCloudflareChallengeTitle('Just a moment...'), true);
  assert.equal(
    isCloudflareChallengeTitle('Seattle Seahawks vs New England Patriots'),
    false,
  );
});

test('extractRunsHeaded follows EXTRACT_HEADED and GITHUB_ACTIONS', () => {
  const saved = {
    EXTRACT_HEADED: process.env.EXTRACT_HEADED,
    EXTRACT_HEADLESS: process.env.EXTRACT_HEADLESS,
    GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
  };
  try {
    process.env.EXTRACT_HEADED = '';
    process.env.EXTRACT_HEADLESS = '';
    process.env.GITHUB_ACTIONS = '';
    assert.equal(extractRunsHeaded(), false);

    process.env.GITHUB_ACTIONS = 'true';
    assert.equal(extractRunsHeaded(), true);

    process.env.EXTRACT_HEADLESS = '1';
    assert.equal(extractRunsHeaded(), false);

    process.env.GITHUB_ACTIONS = '';
    process.env.EXTRACT_HEADLESS = '';
    process.env.EXTRACT_HEADED = '1';
    assert.equal(extractRunsHeaded(), true);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test('extractor opens the inner page by clicking the listing link', async () => {
  const source = await readFile(extractSourcePath, 'utf8');
  assert.match(source, /openInnerPageFromLink/);
  assert.match(source, /waitForPlayerEmbeds/);
  assert.equal(source.includes('await basePage.close();'), false);
});

const LISTING = 'https://listing.example.test';

function link(pathname, text = '') {
  const score = /\/(mlb|nfl|stream)\//.test(pathname) ? 13 : 10;
  return { href: `${LISTING}${pathname}`, hrefNeedleMatched: true, score, text };
}

test('opponent slug variants cover full names, nicknames, and school names', () => {
  assert.deepEqual(opponentSlugVariants('Detroit Tigers'), ['detroit-tigers', 'tigers']);
  assert.equal(opponentSlugVariants('St. Louis Cardinals')[0], 'st-louis-cardinals');
  assert.ok(opponentSlugVariants('Kansas State Wildcats').includes('kansas-state'));
  assert.ok(opponentSlugVariants('Texas A&M Aggies').includes('texas-am-aggies'));
  assert.deepEqual(opponentSlugVariants('Athletics'), ['athletics']);
  assert.deepEqual(opponentSlugVariants(''), []);
});

test('link selection uses the opponent to separate same-day Cyclones sports', () => {
  const links = [
    link('/ncaaf/iowa-hawkeyes-iowa-state-cyclones/1'),
    link('/ncaab/kansas-jayhawks-iowa-state-cyclones/2'),
  ];
  const basketball = selectListingLink(links, {
    hrefNeedles: ['iowa-state-cyclones'],
    opponentName: 'Kansas Jayhawks',
  });
  assert.equal(basketball.link?.href, `${LISTING}/ncaab/kansas-jayhawks-iowa-state-cyclones/2`);
  const football = selectListingLink(links, {
    hrefNeedles: ['iowa-state-cyclones'],
    opponentName: 'Iowa Hawkeyes',
  });
  assert.equal(football.link?.href, `${LISTING}/ncaaf/iowa-hawkeyes-iowa-state-cyclones/1`);
});

test('the team needle cannot satisfy the opponent check', () => {
  const selection = selectListingLink([link('/ncaab/iowa-state-cyclones/2')], {
    hrefNeedles: ['iowa-state-cyclones'],
    opponentName: 'Iowa State Cyclones',
    requireOpponent: true,
  });
  assert.equal(selection.failure, 'opponent_not_found');
});

test('a lone needle match is accepted without the opponent unless requireOpponent is true', () => {
  const links = [link('/mlb/cleveland-guardians-live/1')];
  const options = { hrefNeedles: ['cleveland-guardians'], opponentName: 'Detroit Tigers' };
  assert.equal(selectListingLink(links, options).link?.href, `${LISTING}/mlb/cleveland-guardians-live/1`);
  assert.equal(
    selectListingLink(links, { ...options, requireOpponent: true }).failure,
    'opponent_not_found',
  );
});

test('the opponent narrows several needle matches by default', () => {
  const selection = selectListingLink(
    [
      link('/ncaaf/iowa-state-cyclones-kansas-state-wildcats/1'),
      link('/ncaab/iowa-state-cyclones-drake-bulldogs/2'),
    ],
    { hrefNeedles: ['iowa-state-cyclones'], opponentName: 'Drake Bulldogs' },
  );
  assert.equal(selection.link?.href, `${LISTING}/ncaab/iowa-state-cyclones-drake-bulldogs/2`);
});

test('a doubleheader with two links for the same opponent fails as ambiguous', () => {
  const selection = selectListingLink(
    [
      link('/mlb/detroit-tigers-cleveland-guardians/111'),
      link('/mlb/detroit-tigers-cleveland-guardians/222'),
    ],
    { hrefNeedles: ['cleveland-guardians'], opponentName: 'Detroit Tigers' },
  );
  assert.equal(selection.failure, 'ambiguous_link');
  assert.equal(selection.matches.length, 2);
});

test('duplicate anchors and team navigation links do not make the choice ambiguous', () => {
  const selection = selectListingLink(
    [
      link('/team/cleveland-guardians'),
      link('/mlb/detroit-tigers-cleveland-guardians/111', 'Tigers vs Guardians'),
      link('/mlb/detroit-tigers-cleveland-guardians/111/', 'Watch'),
    ],
    { hrefNeedles: ['cleveland-guardians'], opponentName: 'Detroit Tigers' },
  );
  assert.equal(selection.link?.href, `${LISTING}/mlb/detroit-tigers-cleveland-guardians/111`);
});

test('no matching link, no opponent, and no needles each fail clearly', () => {
  assert.equal(
    selectListingLink([link('/mlb/a-b/1')], { hrefNeedles: ['cleveland-guardians'] }).failure,
    'link_not_found',
  );
  assert.equal(
    selectListingLink([link('/mlb/boston-red-sox-cleveland-guardians/1')], {
      hrefNeedles: ['cleveland-guardians'],
      opponentName: 'Detroit Tigers',
      requireOpponent: true,
    }).failure,
    'opponent_not_found',
  );
  assert.equal(selectListingLink([link('/mlb/x/1')], { hrefNeedles: ['', '  '] }).failure, 'config_missing');
  assert.equal(selectListingLink([link('/mlb/x/1')], {}).failure, 'config_missing');
});

test('requireOpponent false accepts exactly one needle match', () => {
  const options = {
    hrefNeedles: ['cleveland-guardians'],
    opponentName: 'Detroit Tigers',
    requireOpponent: false,
  };
  assert.ok(selectListingLink([link('/mlb/tigres-cleveland-guardians/1')], options).link);
  assert.equal(
    selectListingLink([link('/x/cleveland-guardians/1'), link('/y/cleveland-guardians/2')], options).failure,
    'ambiguous_link',
  );
});

test('the extractor reports missing needles instead of assuming a team', async () => {
  const source = await readFile(extractSourcePath, 'utf8');
  assert.equal(source.includes("'cleveland-guardians'"), false);
  const result = await extractGoozFromBasePage(`${LISTING}/live`, { hrefNeedles: [] });
  assert.equal(result.found, false);
  assert.equal(result.failure, 'config_missing');
});

test('http provider URLs are upgraded to https', () => {
  assert.equal(
    httpsProviderUrl('http://gooz.aapmains.net/new-stream-embed/56072?ad=111'),
    'https://gooz.aapmains.net/new-stream-embed/56072?ad=111',
  );
  assert.equal(httpsProviderUrl('http://other.example.com/x'), 'http://other.example.com/x');
});

test('log lines never carry the listing host', () => {
  const hosts = new Set(['listing.example.test']);
  assert.equal(describeUrlForLog(`${LISTING}/mlb/a-b/1?x=1`, hosts), '/mlb/a-b/1');
  assert.equal(describeUrlForLog('https://www.listing.example.test/live', hosts), '/live');
  assert.equal(
    describeUrlForLog('https://www.youtube.com/live_chat?v=1&embed_domain=listing.example.test', hosts),
    'https://www.youtube.com/live_chat',
  );
  assert.equal(
    redactHosts('page.goto: Timeout navigating to "https://listing.example.test/live"', hosts),
    'page.goto: Timeout navigating to "https://[listing]/live"',
  );
});

class FakePage extends EventEmitter {
  constructor() {
    super();
    this.main = {};
  }

  mainFrame() {
    return this.main;
  }
}

function fakeRequest(page, url, { navigation = false } = {}) {
  return {
    frame: () => page.mainFrame(),
    isNavigationRequest: () => navigation,
    url: () => url,
  };
}

function fakeResponse(request, body, delay) {
  return {
    request: () => request,
    text: () => new Promise((resolve) => setTimeout(() => resolve(body), delay)),
    url: () => request.url(),
  };
}

test('provider URLs seen on the listing are dropped once the game page commits', async () => {
  const page = new FakePage();
  const capture = createGoozCapture(page, `${LISTING}/live`);
  const listingEmbed = 'https://gooz.aapmains.net/new-stream-embed/11111';
  const gameEmbed = 'https://gooz.aapmains.net/new-stream-embed/22222';

  page.emit('request', fakeRequest(page, listingEmbed));
  assert.deepEqual(capture.urls(), [listingEmbed]);

  // A slow listing request that finishes after the game page commits.
  const lateListing = fakeRequest(page, `${LISTING}/api/rows`);
  page.emit('request', lateListing);

  capture.armForNavigation();
  const navigation = fakeRequest(page, `${LISTING}/mlb/a-b/1`, { navigation: true });
  page.emit('request', navigation);
  page.emit('response', fakeResponse(navigation, `<iframe src="${gameEmbed}"></iframe>`, 5));
  page.emit('framenavigated', page.mainFrame());
  page.emit('response', fakeResponse(lateListing, `"${listingEmbed}?ad=111"`, 10));

  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(capture.urls(), [gameEmbed]);

  // A later same-document navigation does not reset again.
  page.emit('framenavigated', page.mainFrame());
  assert.deepEqual(capture.urls(), [gameEmbed]);
});
