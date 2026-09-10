import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  EXTRACT_USER_AGENT,
  extractRunsHeaded,
  isCloudflareChallengeTitle,
  isIgnoredPlayerFrame,
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
