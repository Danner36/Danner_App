import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalPlayerUrl } from '../lib/playerUrl.mjs';

const HOST = 'gooz.aapmains.net';

test('a real embed URL comes back unchanged, with or without its ad parameter', () => {
  assert.equal(canonicalPlayerUrl(`https://${HOST}/new-stream-embed/57001?ad=111`), `https://${HOST}/new-stream-embed/57001?ad=111`);
  assert.equal(canonicalPlayerUrl(`https://${HOST}/new-stream-embed/57001`), `https://${HOST}/new-stream-embed/57001`);
});

test('the URL is rebuilt, so harmless spelling differences do not survive', () => {
  assert.equal(canonicalPlayerUrl(`https://GOOZ.aapmains.net/new-stream-embed/57001?`), `https://${HOST}/new-stream-embed/57001`);
  assert.equal(canonicalPlayerUrl(`https://${HOST}:443/new-stream-embed/57001`), `https://${HOST}/new-stream-embed/57001`);
});

for (const [name, url] of [
  ['plain http', `http://${HOST}/new-stream-embed/57001`],
  ['another host', 'https://listing-one.test/new-stream-embed/57001'],
  ['a host carried as a subdomain', `https://listing-one.test.${HOST}/new-stream-embed/57001`],
  ['a squatted sibling', `https://not${HOST}/new-stream-embed/57001`],
  ['userinfo', `https://listing-one.test@${HOST}/new-stream-embed/57001`],
  ['a password', `https://a:listing-one.test@${HOST}/new-stream-embed/57001`],
  ['a port', `https://${HOST}:8443/new-stream-embed/57001`],
  ['a fragment', `https://${HOST}/new-stream-embed/57001#listing-one.test`],
  ['an empty fragment', `https://${HOST}/new-stream-embed/57001#`],
  ['an unknown query parameter', `https://${HOST}/new-stream-embed/57001?ref=listing-one.test`],
  ['a host beside ad', `https://${HOST}/new-stream-embed/57001?ad=1&ref=listing-one.test`],
  ['a non-digit ad', `https://${HOST}/new-stream-embed/57001?ad=listing-one.test`],
  ['a repeated ad', `https://${HOST}/new-stream-embed/57001?ad=1&ad=2`],
  ['an extra path segment', `https://${HOST}/new-stream-embed/57001/listing-one.test`],
  ['a trailing slash', `https://${HOST}/new-stream-embed/57001/`],
  ['a path before the embed path', `https://${HOST}/listing-one.test/new-stream-embed/57001`],
  ['a host in the embed id', `https://${HOST}/new-stream-embed/listing-one.test1`],
  ['no id', `https://${HOST}/new-stream-embed/`],
  ['not text', undefined],
  ['not a URL', 'nonsense'],
]) {
  test(`canonicalPlayerUrl refuses ${name}`, () => {
    assert.equal(canonicalPlayerUrl(url), undefined);
  });
}
