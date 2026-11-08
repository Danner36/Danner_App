import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  applyAppendOnly,
  applyOverrides,
  buildSchools,
  fixturesExist,
  joinStatsapi,
  mapTeam,
  nextPickable,
  presetErrors,
  runBuild,
  shrinkErrors,
  slugifyName,
  sortTeams,
  standingsIndex,
  teamsFromList,
} from '../build.mjs';
import { ADAPTERS, adaptersFromInput, seasonYearFor } from '../leagues.mjs';
import { buildFetch, espnTeam, schoolLists, standingsBody, statsapiTeams, teamsBody } from './fixtures.mjs';

function tempRoot() {
  return mkdtempSync(path.join(os.tmpdir(), 'team-catalog-build-'));
}

test('slugifyName drops accents and punctuation and joins words', () => {
  assert.equal(slugifyName('Iowa State Cyclones'), 'iowa-state-cyclones');
  assert.equal(slugifyName("St. John's Red Storm"), 'st-johns-red-storm');
  assert.equal(slugifyName('São Paulo & Co.'), 'sao-paulo-co');
});

test('mapTeam follows the field mapping, with colors prefixed and the default light logo', () => {
  const entry = mapTeam(espnTeam(66, 'Iowa State Cyclones', 'Cyclones', { abbreviation: 'ISU', location: 'Iowa State' }), 'ncaa');
  assert.equal(entry.key, 'ncaa-66');
  assert.equal(entry.espnId, '66');
  assert.equal(entry.name, 'Iowa State Cyclones');
  assert.equal(entry.nickname, 'Cyclones');
  assert.equal(entry.location, 'Iowa State');
  assert.equal(entry.abbreviation, 'ISU');
  assert.equal(entry.color, '#ae192d');
  assert.equal(entry.alternateColor, '#ffffff');
  assert.equal(entry.logo, 'https://a.espncdn.com/i/teamlogos/500/66.png');
  assert.deepEqual(entry.hrefNeedles, ['iowa-state-cyclones']);
});

test('mapTeam leaves out colors and logo when ESPN does not send them', () => {
  const entry = mapTeam({ displayName: 'Plain Team', id: '9', location: 'Plain', name: 'Team', abbreviation: 'PT' }, 'nfl');
  assert.equal(Object.hasOwn(entry, 'color'), false);
  assert.equal(Object.hasOwn(entry, 'logo'), false);
  const badColor = mapTeam(espnTeam(1, 'A B', 'B', { color: 'zzz', alternateColor: '12' }), 'nfl');
  assert.equal(Object.hasOwn(badColor, 'color'), false);
  assert.equal(Object.hasOwn(badColor, 'alternateColor'), false);
});

test('teamsFromList skips All-Star and inactive teams and rejects an unknown shape', () => {
  const teams = teamsFromList(
    teamsBody([
      espnTeam(1, 'Real Team', 'Team'),
      espnTeam(2, 'AL Stars', 'Stars', { isAllStar: true }),
      espnTeam(3, 'Gone Team', 'Team', { isActive: false }),
    ]),
  );
  assert.deepEqual(teams.map((team) => team.id), ['1']);
  assert.throws(() => teamsFromList({ sports: [] }));
  assert.throws(() => teamsFromList(teamsBody([])));
});

test('standingsIndex names the conference for every school, including divisions', () => {
  const index = standingsIndex([
    standingsBody([
      { ids: [66], shortName: 'Big 12' },
      { divisions: [{ ids: [1] }, { ids: [2] }], shortName: 'Sun Belt' },
    ]),
  ]);
  assert.equal(index.get('66'), 'Big 12');
  assert.equal(index.get('1'), 'Sun Belt');
  assert.equal(index.get('2'), 'Sun Belt');
  assert.equal(index.has('3'), false);
});

test('buildSchools merges lists by id, filters football to Division I, and prefers the basketball conference', () => {
  const lists = schoolLists();
  const standings = standingsIndex([standingsBody(lists.conferences)]);
  const football = new Map(standings);
  football.set('66', 'Independents');
  const { counts, entries } = buildSchools([
    { adapter: 'ncaa/football', standings: football, teams: lists.football },
    { adapter: 'ncaa/mens-basketball', standings, teams: lists.mens.slice(0, 5) },
    { adapter: 'ncaa/womens-basketball', standings, teams: lists.womens.slice(1, 3) },
  ]);
  assert.deepEqual(counts, { football: 10, 'mens-basketball': 5, 'womens-basketball': 2 });
  assert.equal(entries.length, 10);
  assert.equal(entries.some((entry) => entry.espnId === '900'), false);
  const cyclones = entries.find((entry) => entry.key === 'ncaa-66');
  assert.deepEqual(cyclones.sports, ['football', 'mens-basketball']);
  assert.equal(cyclones.conference, 'Big 12');
  const school101 = entries.find((entry) => entry.key === 'ncaa-101');
  assert.deepEqual(school101.sports, ['football', 'mens-basketball', 'womens-basketball']);
  const school108 = entries.find((entry) => entry.key === 'ncaa-108');
  assert.equal(school108.conference, 'Sun Belt');
});

test('joinStatsapi joins by normalized full name and reports teams without a match', () => {
  const entries = [mapTeam(espnTeam('5', 'Cleveland Guardians', 'Guardians'), 'mlb'), mapTeam(espnTeam('99', 'Athletics', 'Athletics'), 'mlb')];
  assert.deepEqual(joinStatsapi(entries, statsapiTeams(), {}), []);
  assert.deepEqual(entries[0].statsapi, { leagueId: 103, teamId: 114 });
  assert.deepEqual(entries[1].statsapi, { leagueId: 103, teamId: 133 });

  const unmatched = [mapTeam(espnTeam('11', 'Somewhere Else', 'Else'), 'mlb')];
  assert.deepEqual(joinStatsapi(unmatched, statsapiTeams(), {}), ['Somewhere Else']);
  assert.deepEqual(joinStatsapi(unmatched, statsapiTeams(), { 'mlb-11': { statsapi: { leagueId: 104, teamId: 1 } } }), []);
});

test('shrink guard fails under 90% of the committed active count', () => {
  const previous = Array.from({ length: 10 }, (_, index) => ({ key: `nfl-${index}` }));
  assert.deepEqual(shrinkErrors('nfl', { nfl: 9 }, previous), []);
  assert.equal(shrinkErrors('nfl', { nfl: 8 }, previous).length, 1);
  assert.match(shrinkErrors('nfl', { nfl: 8 }, previous)[0], /under 90%/);
  // A retired entry does not count toward the committed figure.
  const withRetired = [...previous.slice(0, 8), { key: 'nfl-98', retired: true }, { key: 'nfl-99', retired: true }];
  assert.deepEqual(shrinkErrors('nfl', { nfl: 8 }, withRetired), []);
  // First run: nothing is committed.
  assert.deepEqual(shrinkErrors('nfl', { nfl: 1 }, []), []);
});

test('shrink guard checks each college sport separately', () => {
  const schools = Array.from({ length: 10 }, (_, index) => ({ key: `ncaa-${index}`, sports: ['football', 'mens-basketball'] }));
  assert.deepEqual(shrinkErrors('ncaa', { football: 10, 'mens-basketball': 9 }, schools), []);
  const errors = shrinkErrors('ncaa', { football: 8, 'mens-basketball': 10 }, schools);
  assert.deepEqual(errors, ['ncaa/football: 8 teams is under 90% of the committed 10']);
});

test('append-only keeps a missing entry as retired and clears retired when it returns', () => {
  const previous = [
    { key: 'nfl-1', name: 'Gone' },
    { key: 'nfl-2', name: 'Returned', retired: true },
  ];
  const merged = applyAppendOnly([{ key: 'nfl-2', name: 'Returned Fresh' }], previous, {});
  assert.deepEqual(merged, [
    { key: 'nfl-2', name: 'Returned Fresh' },
    { key: 'nfl-1', name: 'Gone', retired: true },
  ]);
});

test('append-only keeps a missing sport in sports and lists it in retiredSports', () => {
  const previous = [{ key: 'ncaa-1', sports: ['football', 'mens-basketball'] }];
  const [merged] = applyAppendOnly([{ key: 'ncaa-1', sports: ['mens-basketball'] }], previous, {});
  assert.deepEqual(merged, { key: 'ncaa-1', retiredSports: ['football'], sports: ['football', 'mens-basketball'] });

  // A sport that comes back is no longer retired.
  const [restored] = applyAppendOnly(
    [{ key: 'ncaa-1', sports: ['football', 'mens-basketball'] }],
    [{ key: 'ncaa-1', retiredSports: ['football'], sports: ['football', 'mens-basketball'] }],
    {},
  );
  assert.equal(Object.hasOwn(restored, 'retiredSports'), false);
});

test('only an override remove drops an entry', () => {
  const previous = [{ key: 'nfl-1', name: 'One' }, { key: 'nfl-2', name: 'Two' }];
  const merged = applyAppendOnly([], previous, { 'nfl-1': { remove: true } });
  assert.deepEqual(merged, [{ key: 'nfl-2', name: 'Two', retired: true }]);
});

test('overrides merge last and hidden and remove behave', () => {
  const entries = [
    { hidden: true, hrefNeedles: ['a'], key: 'mlb-1', name: 'A', nickname: 'A' },
    { hrefNeedles: ['b'], key: 'mlb-2', name: 'B', nickname: 'B' },
    { hrefNeedles: ['c'], key: 'mlb-3', name: 'C', nickname: 'C' },
  ];
  const out = applyOverrides(entries, {
    'mlb-1': { hidden: false, name: 'Renamed' },
    'mlb-2': { hidden: true, hrefNeedles: ['custom'], nickname: 'Bee' },
    'mlb-3': { remove: true },
  });
  assert.deepEqual(out, [
    { hrefNeedles: ['a'], key: 'mlb-1', name: 'Renamed', nickname: 'A' },
    { hidden: true, hrefNeedles: ['custom'], key: 'mlb-2', name: 'B', nickname: 'Bee' },
  ]);
});

function presetTeams() {
  return {
    mlb: [{ key: 'mlb-5', nickname: 'Guardians', statsapi: { leagueId: 103, teamId: 114 } }],
    ncaa: [{ key: 'ncaa-66', nickname: 'Cyclones', sports: ['football', 'mens-basketball', 'womens-basketball'] }],
    nfl: [{ key: 'nfl-17', nickname: 'Patriots' }],
  };
}

test('preset guards pass only for the three teams as expected', () => {
  assert.deepEqual(presetErrors(presetTeams()), []);
});

test('preset guards report a missing, retired or wrong team', () => {
  const missing = presetTeams();
  missing.nfl = [];
  assert.deepEqual(presetErrors(missing), ['preset nfl-17 is missing']);

  const retired = presetTeams();
  retired.ncaa[0].retired = true;
  assert.deepEqual(presetErrors(retired), ['preset ncaa-66 is retired']);

  const statsapi = presetTeams();
  statsapi.mlb[0].statsapi = { leagueId: 104, teamId: 114 };
  assert.match(presetErrors(statsapi)[0], /statsapi must be 114\/103/);

  const sports = presetTeams();
  sports.ncaa[0].sports = ['football'];
  assert.deepEqual(presetErrors(sports), [
    'preset ncaa-66 is missing sport mens-basketball',
    'preset ncaa-66 is missing sport womens-basketball',
  ]);
});

test('nickname guard rejects a preset whose nickname changed', () => {
  const renamed = presetTeams();
  renamed.mlb[0].nickname = 'Indians';
  assert.deepEqual(presetErrors(renamed), ['preset mlb-5 nickname is "Indians", expected Guardians']);
  const lowercase = presetTeams();
  lowercase.nfl[0].nickname = 'patriots';
  assert.equal(presetErrors(lowercase).length, 1);
});

test('nextPickable is sticky and needs both a passing probe and fixtures', () => {
  assert.equal(nextPickable({ hasFixtures: true, previous: undefined, probePassed: true }), true);
  assert.equal(nextPickable({ hasFixtures: false, previous: undefined, probePassed: true }), false);
  assert.equal(nextPickable({ hasFixtures: true, previous: false, probePassed: false }), false);
  // Sticky: a failing probe never turns a shipped league off.
  assert.equal(nextPickable({ hasFixtures: false, previous: true, probePassed: false }), true);
});

test('fixturesExist needs a file under tests/leagues/<adapter>', () => {
  const root = tempRoot();
  try {
    assert.equal(fixturesExist(root, 'ncaa/mens-basketball'), false);
    mkdirSync(path.join(root, 'tests/leagues/ncaa-mens-basketball/captures/1'), { recursive: true });
    assert.equal(fixturesExist(root, 'ncaa/mens-basketball'), false);
    writeFileSync(path.join(root, 'tests/leagues/ncaa-mens-basketball/captures/1/REPORT.md'), 'x');
    assert.equal(fixturesExist(root, 'ncaa/mens-basketball'), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('adaptersFromInput expands league keys, keeps order and rejects unknown names', () => {
  assert.deepEqual(adaptersFromInput(''), Object.keys(ADAPTERS));
  assert.deepEqual(adaptersFromInput('ncaa'), ['ncaa/football', 'ncaa/mens-basketball', 'ncaa/womens-basketball']);
  assert.deepEqual(adaptersFromInput('mlb, ncaa/football'), ['mlb', 'ncaa/football']);
  assert.equal(adaptersFromInput('nba'), null);
});

test('seasonYearFor applies the shift rules in the official date zone', () => {
  assert.equal(seasonYearFor({}, new Date('2027-01-15T12:00:00Z')), 2027);
  assert.equal(seasonYearFor({ shiftBackThroughMonth: 2 }, new Date('2027-02-15T12:00:00Z')), 2026);
  assert.equal(seasonYearFor({ shiftBackThroughMonth: 2 }, new Date('2027-03-15T12:00:00Z')), 2027);
  assert.equal(seasonYearFor({ shiftForwardFromMonth: 7 }, new Date('2026-11-08T12:00:00Z')), 2027);
});

function passingReport() {
  const adapters = {};
  for (const adapter of Object.keys(ADAPTERS)) {
    adapters[adapter] = { passed: true };
  }
  return { adapters };
}

test('runBuild writes the league and team files and a second run keeps generatedAt', async () => {
  const root = tempRoot();
  try {
    const catalogDir = path.join(root, 'catalog');
    mkdirSync(catalogDir);
    const reportFile = path.join(catalogDir, 'probe-report.json');
    writeFileSync(reportFile, JSON.stringify(passingReport()));
    mkdirSync(path.join(root, 'tests/leagues/nfl/captures/1'), { recursive: true });
    writeFileSync(path.join(root, 'tests/leagues/nfl/captures/1/poll.json'), '{}');

    const lines = [];
    const first = await runBuild({
      catalogDir,
      fetchJson: buildFetch(),
      log: (line) => lines.push(line),
      now: () => new Date('2026-11-08T10:00:00Z'),
      reportFile,
      root,
      selected: Object.keys(ADAPTERS),
    });
    assert.deepEqual(first, { code: 0, errors: [] });

    const leagues = JSON.parse(readFileSync(path.join(catalogDir, 'leagues.json'), 'utf8'));
    assert.equal(leagues.schemaVersion, 1);
    assert.equal(leagues.generatedAt, '2026-11-08T10:00:00.000Z');
    assert.deepEqual(leagues.leagues.map((row) => row.key), ['mlb', 'nfl', 'ncaa']);
    assert.equal(leagues.leagues[0].pickable, false, 'MLB has no fixtures yet');
    assert.equal(leagues.leagues[1].pickable, true, 'NFL has a passing probe and fixtures');
    assert.equal(Object.hasOwn(leagues.leagues[0], 'officialDateZone'), false);
    assert.equal(leagues.leagues[2].sports.every((sport) => sport.pickable === false), true);

    const mlb = JSON.parse(readFileSync(path.join(catalogDir, 'teams/mlb.json'), 'utf8'));
    assert.equal(mlb.league, 'mlb');
    assert.equal(mlb.teams.length, 10);
    assert.deepEqual(mlb.teams.find((team) => team.key === 'mlb-5').statsapi, { leagueId: 103, teamId: 114 });

    const ncaa = JSON.parse(readFileSync(path.join(catalogDir, 'teams/ncaa.json'), 'utf8'));
    assert.equal(ncaa.teams.length, 10);
    assert.deepEqual(ncaa.teams.find((team) => team.key === 'ncaa-66').sports, [
      'football',
      'mens-basketball',
      'womens-basketball',
    ]);
    assert.equal(ncaa.teams.find((team) => team.key === 'ncaa-66').conference, 'Big 12');

    const second = await runBuild({
      catalogDir,
      fetchJson: buildFetch(),
      log: () => {},
      now: () => new Date('2026-11-15T10:00:00Z'),
      reportFile,
      root,
      selected: Object.keys(ADAPTERS),
    });
    assert.equal(second.code, 0);
    assert.equal(JSON.parse(readFileSync(path.join(catalogDir, 'leagues.json'), 'utf8')).generatedAt, '2026-11-08T10:00:00.000Z');
    assert.equal(JSON.parse(readFileSync(path.join(catalogDir, 'teams/mlb.json'), 'utf8')).generatedAt, '2026-11-08T10:00:00.000Z');
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('a shrinking league is not rewritten and the build fails', async () => {
  const root = tempRoot();
  try {
    const catalogDir = path.join(root, 'catalog');
    const reportFile = path.join(catalogDir, 'probe-report.json');
    mkdirSync(path.join(catalogDir, 'teams'), { recursive: true });
    const options = { catalogDir, log: () => {}, reportFile, root, selected: Object.keys(ADAPTERS) };
    assert.equal((await runBuild({ ...options, fetchJson: buildFetch() })).code, 0);
    const before = readFileSync(path.join(catalogDir, 'teams/nfl.json'), 'utf8');

    const shrunk = await runBuild({
      ...options,
      fetchJson: buildFetch({ nfl: [espnTeam('17', 'New England Patriots', 'Patriots')] }),
    });
    assert.equal(shrunk.code, 1);
    assert.match(shrunk.errors.join(), /nfl: 1 teams is under 90% of the committed 10/);
    assert.equal(readFileSync(path.join(catalogDir, 'teams/nfl.json'), 'utf8'), before);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('a missing preset or an MLB team without a statsapi match fails the build and writes nothing', async () => {
  const root = tempRoot();
  try {
    const catalogDir = path.join(root, 'catalog');
    const reportFile = path.join(catalogDir, 'probe-report.json');
    mkdirSync(catalogDir, { recursive: true });
    const options = { catalogDir, log: () => {}, reportFile, root, selected: Object.keys(ADAPTERS) };

    const lists = schoolLists();
    const missingPreset = await runBuild({
      ...options,
      fetchJson: buildFetch({ mens: lists.mens.filter((team) => team.id !== '66') }),
    });
    assert.equal(missingPreset.code, 1);
    assert.match(missingPreset.errors.join(), /preset ncaa-66 is missing sport mens-basketball/);
    assert.equal(existsSync(path.join(catalogDir, 'leagues.json')), false);
    assert.equal(existsSync(path.join(catalogDir, 'teams/ncaa.json')), false);

    const noStatsapi = await runBuild({ ...options, fetchJson: buildFetch({ statsapi: statsapiTeams(1) }) });
    assert.equal(noStatsapi.code, 1);
    assert.match(noStatsapi.errors.join(), /mlb teams without a statsapi match/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('a filtered run keeps committed leagues and always builds a league with no file', async () => {
  const root = tempRoot();
  try {
    const catalogDir = path.join(root, 'catalog');
    const reportFile = path.join(catalogDir, 'probe-report.json');
    mkdirSync(path.join(catalogDir, 'teams'), { recursive: true });
    writeFileSync(path.join(catalogDir, 'teams/nfl.json'), JSON.stringify({ generatedAt: '2026-01-01T00:00:00.000Z', league: 'nfl', schemaVersion: 1, teams: [{ key: 'nfl-17', nickname: 'Patriots' }] }));

    const getJson = buildFetch();
    const result = await runBuild({ catalogDir, fetchJson: getJson, log: () => {}, reportFile, root, selected: ['mlb'] });
    assert.equal(result.code, 0);
    assert.equal(getJson.calls.some((url) => url.includes('/football/nfl/')), false);
    assert.ok(existsSync(path.join(catalogDir, 'teams/ncaa.json')));
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(catalogDir, 'teams/nfl.json'), 'utf8')).teams,
      [{ key: 'nfl-17', nickname: 'Patriots' }],
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('sortTeams orders by name then key and writes fields in the documented order', () => {
  const sorted = sortTeams([
    { key: 'nfl-2', name: 'Zed', espnId: '2', retired: true },
    { name: 'Alpha', key: 'nfl-1', espnId: '1' },
  ]);
  assert.deepEqual(sorted.map((entry) => entry.key), ['nfl-1', 'nfl-2']);
  assert.deepEqual(Object.keys(sorted[1]), ['key', 'espnId', 'name', 'retired']);
});
