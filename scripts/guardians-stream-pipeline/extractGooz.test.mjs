import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  EXTRACT_USER_AGENT,
  isIgnoredPlayerFrame,
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
