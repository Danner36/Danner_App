import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { missingPaths, pickRecentEvent, probeAdapter, runProbe } from '../probe.mjs';
import { espnTeam, fakeFetch, httpError, networkFailure, ok, standingsBody, teamsBody } from './fixtures.mjs';

const NOW = new Date('2026-11-08T12:00:00Z');

function event(id, state, date) {
  return {
    competitions: [{ competitors: [{ team: { id: '5' } }], status: { type: { state } } }],
    date,
    id: String(id),
  };
}

const SUMMARY_BODY = {
  header: { competitions: [{ competitors: [{ team: { id: '5' } }, { team: { id: '9' } }], status: { type: { state: 'post' } } }] },
};
const STATSAPI_TEAMS = { teams: [{ id: 114, league: { id: 103 }, name: 'Cleveland Guardians' }] };

// Routes for a full passing probe of one adapter's preset team.
function passingRoutes({ schedule = ok({ events: [event(1, 'post', '2026-09-01T00:00:00Z')] }) } = {}) {
  return [
    ['/standings', ok(standingsBody([{ ids: [66], shortName: 'Big 12' }]))],
    ['/teams?limit=1000', ok(teamsBody([espnTeam(5, 'Cleveland Guardians', 'Guardians')]))],
    ['/scoreboard', ok({ events: [] })],
    ['/schedule?season=', schedule],
    ['/summary?event=', ok(SUMMARY_BODY)],
    ['/predictor', ok({ awayTeam: { statistics: [] }, homeTeam: { statistics: [] } })],
    ['/probabilities', ok({ items: [] })],
    ['statsapi.mlb.com/api/v1/teams', ok(STATSAPI_TEAMS)],
    ['statsapi.mlb.com/api/v1/schedule', ok({ dates: [] })],
  ];
}

test('missingPaths understands [], [+] and index brackets', () => {
  const body = { a: { b: [{ c: 1 }, { c: 2 }] }, empty: [], nullish: null };
  assert.deepEqual(missingPaths(body, ['a.b[].c', 'a.b[+].c', 'a.b[0].c', 'empty[]']), []);
  assert.deepEqual(missingPaths(body, ['empty[+]', 'a.b[2].c', 'a.b[].d', 'nullish', 'gone']), [
    'empty[+]',
    'a.b[2].c',
    'a.b[].d',
    'nullish',
    'gone',
  ]);
});

test('pickRecentEvent prefers a live event, then the latest final', () => {
  const finals = [event(1, 'post', '2026-09-01T00:00:00Z'), event(2, 'post', '2026-10-01T00:00:00Z'), event(3, 'pre', '2026-12-01T00:00:00Z')];
  assert.equal(pickRecentEvent(finals).id, '2');
  assert.equal(pickRecentEvent([...finals, event(4, 'in', '2026-08-01T00:00:00Z')]).id, '4');
  assert.equal(pickRecentEvent([event(5, 'pre', '2026-12-01T00:00:00Z')]), null);
});

test('a clean probe passes', async () => {
  const entry = await probeAdapter('mlb', { fetchJson: fakeFetch(passingRoutes()), now: NOW });
  assert.equal(entry.passed, true);
  assert.deepEqual(entry.networkErrors, []);
  assert.deepEqual(entry.shapeErrors, []);
  assert.equal(entry.season, 2026);
  assert.ok(entry.checks.some((check) => check.name === 'statsapi-teams'));
});

test('the report keeps network errors and shape errors apart', async () => {
  const routes = passingRoutes();
  const entry = await probeAdapter('nfl', {
    fetchJson: fakeFetch([
      ['/scoreboard', networkFailure('ETIMEDOUT')],
      ['/teams?limit=1000', ok({ sports: [] })],
      ...routes,
    ]),
    now: NOW,
  });
  assert.equal(entry.passed, false);
  assert.deepEqual(entry.networkErrors, ['scoreboard: ETIMEDOUT']);
  assert.deepEqual(
    entry.shapeErrors,
    missingPaths({ sports: [] }, [
      'sports[+].leagues[+].teams[+].team.id',
      'sports[+].leagues[+].teams[+].team.displayName',
      'sports[+].leagues[+].teams[+].team.name',
      'sports[+].leagues[+].teams[+].team.location',
      'sports[+].leagues[+].teams[+].team.abbreviation',
    ]).map((missing) => `teams: missing ${missing}`),
  );
  const scoreboard = entry.checks.find((check) => check.name === 'scoreboard');
  assert.deepEqual(
    { network: scoreboard.networkError, shape: scoreboard.shapeErrors, status: scoreboard.status },
    { network: 'ETIMEDOUT', shape: [], status: null },
  );
  const teams = entry.checks.find((check) => check.name === 'teams');
  assert.equal(teams.networkError, null);
  assert.equal(teams.status, 200);
  assert.ok(teams.shapeErrors.length > 0);
});

test('a body that is not JSON is a shape error and a required 404 is a network error', async () => {
  const entry = await probeAdapter('nfl', {
    fetchJson: fakeFetch([
      ['/scoreboard', { body: '<html>', jsonError: true, latencyMs: 5, networkError: null, ok: false, status: 200 }],
      ['/teams?limit=1000', httpError(404)],
      ...passingRoutes(),
    ]),
    now: NOW,
  });
  assert.deepEqual(entry.networkErrors, ['teams: HTTP 404']);
  assert.deepEqual(entry.shapeErrors, ['scoreboard: response is not JSON']);
});

test('an off-season MLB probe passes: empty current season, final event found a season back', async () => {
  const seasons = [];
  const fetchJson = fakeFetch([
    [
      '/schedule?season=',
      (url) => {
        seasons.push(url);
        return url.includes('season=2026') ? ok({ events: [] }) : ok({ events: [event(9, 'post', '2025-09-28T00:00:00Z')] });
      },
    ],
    ...passingRoutes(),
  ]);
  const entry = await probeAdapter('mlb', { fetchJson, now: NOW });
  assert.equal(entry.passed, true);
  assert.deepEqual(entry.networkErrors, []);
  assert.deepEqual(entry.shapeErrors, []);
  assert.equal(entry.checks.find((check) => check.name === 'schedule-2026-2').status, 200);
  assert.ok(seasons.some((url) => url.includes('season=2025')));
  assert.equal(fetchJson.calls.some((url) => url.endsWith('/summary?event=9')), true);
});

test('no live or final event in any searched season is a shape error', async () => {
  const entry = await probeAdapter('mlb', {
    fetchJson: fakeFetch([['/schedule?season=', ok({ events: [] })], ...passingRoutes()]),
    now: NOW,
  });
  assert.equal(entry.passed, false);
  assert.deepEqual(entry.shapeErrors, ['summary: no live or final event in seasons 2024 to 2026']);
});

test('an optional predictor 404 is not an error', async () => {
  const entry = await probeAdapter('mlb', {
    fetchJson: fakeFetch([['/predictor', httpError(404)], ...passingRoutes()]),
    now: NOW,
  });
  assert.equal(entry.passed, true);
  assert.equal(entry.checks.find((check) => check.name === 'predictor').status, 404);
});

test('basketball adapters report the arena-board paths without requiring them', async () => {
  const entry = await probeAdapter('ncaa/mens-basketball', {
    fetchJson: fakeFetch(passingRoutes()),
    now: new Date('2026-11-08T12:00:00Z'),
  });
  assert.equal(entry.passed, true);
  assert.equal(entry.boardPaths['format.regulation.periods'], false);
  assert.equal(entry.season, 2027);
});

test('raw bodies are written for the probe artifact', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'team-catalog-probe-'));
  try {
    await probeAdapter('nfl', { fetchJson: fakeFetch(passingRoutes()), now: NOW, rawDir: root });
    assert.ok(existsSync(path.join(root, 'nfl', 'teams.json')));
    assert.ok(existsSync(path.join(root, 'nfl', 'summary.json')));
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('a filtered probe run keeps the other adapters and records board flags', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'team-catalog-probe-'));
  try {
    const reportFile = path.join(root, 'catalog', 'probe-report.json');
    mkdirSync(path.dirname(reportFile), { recursive: true });
    writeFileSync(reportFile, JSON.stringify({ adapters: { nfl: { kept: true, passed: true } }, schemaVersion: 1 }));
    const report = await runProbe({
      adapters: ['mlb'],
      fetchJson: fakeFetch(passingRoutes()),
      log: () => {},
      now: () => NOW,
      reportFile,
      root,
    });
    assert.deepEqual(Object.keys(report.adapters).sort(), ['mlb', 'nfl']);
    assert.equal(report.adapters.nfl.kept, true);
    assert.equal(report.schemaVersion, 1);
    assert.ok(report.boardFlags['ncaa/mens-basketball']);
    assert.equal(JSON.parse(readFileSync(reportFile, 'utf8')).adapters.mlb.passed, true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
