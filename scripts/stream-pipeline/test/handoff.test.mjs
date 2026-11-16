import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import { checkRequest, loadCatalog } from '../lib/catalog.mjs';
import { ENTRY_PATH, postFoundEntry } from '../lib/progress.mjs';
import { checkedTeamSpec } from '../lib/teamSpec.mjs';

const KEY = 'test-progress-key';
const WORKER = 'https://worker.example.invalid/';

function foundCandidate(overrides = {}) {
  return {
    entry: { eventId: '401', kind: 'web', url: 'https://player.example.invalid/x' },
    eventId: '401',
    game: { eventId: '401', gameNumber: 1, officialDate: '2026-11-08' },
    listing: { attempts: [{ label: 'primary', number: 1, result: 'found', seconds: 9, stage: 'entry' }], total: 2 },
    outcome: 'found',
    schemaVersion: 1,
    team: 'nfl-17',
    ...overrides,
  };
}

function recorder(status = 204) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ body: init.body, headers: init.headers, url });
      return new Response(null, { status });
    },
  };
}

test('postFoundEntry signs the game key and entry, without the per-source table', async () => {
  const { calls, fetchImpl } = recorder();
  const result = await postFoundEntry({
    candidate: foundCandidate({ sport: 'football', team: 'ncaa-66' }),
    fetchImpl,
    key: KEY,
    now: () => new Date('2026-11-08T18:00:00Z'),
    runId: '42',
    workerUrl: WORKER,
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://worker.example.invalid${ENTRY_PATH}`);
  assert.equal(calls[0].headers['X-Signature'], createHmac('sha256', KEY).update(calls[0].body).digest('hex'));
  const body = JSON.parse(calls[0].body);
  assert.deepEqual(Object.keys(body).sort(), ['at', 'candidate', 'eventId', 'runId', 'sport', 'team']);
  assert.equal(body.at, Date.parse('2026-11-08T18:00:00Z') / 1000);
  assert.equal(body.candidate.listing, undefined);
  assert.deepEqual(body.candidate.game, foundCandidate().game);
  assert.equal(body.candidate.sport, 'football');
});

test('postFoundEntry sends nothing for a non-found outcome, a missing event, key or Worker', async () => {
  for (const options of [
    { candidate: foundCandidate({ outcome: 'no_video' }) },
    { candidate: foundCandidate({ eventId: undefined }) },
    { key: '' },
    { workerUrl: undefined },
  ]) {
    const { calls, fetchImpl } = recorder();
    const result = await postFoundEntry({ candidate: foundCandidate(), fetchImpl, key: KEY, runId: '1', workerUrl: WORKER, ...options });
    assert.equal(result.skipped, true);
    assert.equal(calls.length, 0);
  }
});

test('postFoundEntry retries once and never throws', async () => {
  const { calls, fetchImpl } = recorder(503);
  const result = await postFoundEntry({ candidate: foundCandidate(), fetchImpl, key: KEY, runId: '1', sleep: async () => {}, workerUrl: WORKER });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 2);
  const thrown = await postFoundEntry({
    candidate: foundCandidate(),
    fetchImpl: async () => {
      throw new TypeError('down');
    },
    key: KEY,
    runId: '1',
    sleep: async () => {},
    workerUrl: WORKER,
  });
  assert.equal(thrown.ok, false);
});

test('checkedTeamSpec builds the same spec checkRequest does for every catalog team and sport', async () => {
  const catalog = await loadCatalog();
  let checked = 0;
  for (const team of [...catalog.teams.values()].slice(0, 400)) {
    const league = catalog.leagues.find((row) => row.key === team.key.split('-')[0]);
    for (const sport of league.kind === 'school' ? team.sports : [undefined]) {
      const request = await checkRequest({ sport, team: team.key });
      assert.deepEqual(checkedTeamSpec(league, team, sport), request.spec, `${team.key} ${sport ?? ''}`);
      checked += 1;
    }
  }
  assert.ok(checked > 100);
});

test('checkedTeamSpec refuses a sport mismatch and a broken entry', async () => {
  const catalog = await loadCatalog();
  const nfl = catalog.leagues.find((row) => row.key === 'nfl');
  const ncaa = catalog.leagues.find((row) => row.key === 'ncaa');
  const patriots = catalog.teams.get('nfl-17');
  const cyclones = catalog.teams.get('ncaa-66');
  assert.equal(checkedTeamSpec(nfl, patriots, 'football'), undefined);
  assert.equal(checkedTeamSpec(ncaa, cyclones, undefined), undefined);
  assert.equal(checkedTeamSpec(ncaa, cyclones, 'hockey'), undefined);
  assert.equal(checkedTeamSpec(nfl, { ...patriots, espnId: '999' }, undefined), undefined);
  assert.equal(checkedTeamSpec(undefined, patriots, undefined), undefined);
  assert.equal(checkedTeamSpec({ ...nfl, schedule: { provider: 'other' } }, patriots, undefined), undefined);
});
