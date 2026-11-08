import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { LEAGUE_ROWS } from '../leagues.mjs';
import { appendOnlyErrors, overrideResolutionErrors, runValidate, streamsFileErrors, validateLeagues, validateOverrides, validateReport, validateTeam, validateTeamsDocument } from '../validate.mjs';

function goodPro() {
  return {
    abbreviation: 'NE',
    alternateColor: '#c60c30',
    color: '#002a5c',
    espnId: '17',
    hrefNeedles: ['new-england-patriots'],
    key: 'nfl-17',
    location: 'New England',
    logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ne.png',
    name: 'New England Patriots',
    nickname: 'Patriots',
  };
}

function goodSchool() {
  return {
    abbreviation: 'ISU',
    conference: 'Big 12',
    espnId: '66',
    hrefNeedles: ['iowa-state-cyclones'],
    key: 'ncaa-66',
    location: 'Iowa State',
    name: 'Iowa State Cyclones',
    nickname: 'Cyclones',
    sports: ['football', 'mens-basketball', 'womens-basketball'],
  };
}

function goodMlb() {
  return {
    abbreviation: 'CLE',
    espnId: '5',
    hrefNeedles: ['cleveland-guardians'],
    key: 'mlb-5',
    location: 'Cleveland',
    name: 'Cleveland Guardians',
    nickname: 'Guardians',
    statsapi: { leagueId: 103, teamId: 114 },
  };
}

test('a valid entry produces no errors', () => {
  assert.deepEqual(validateTeam(goodPro(), 'nfl'), []);
  assert.deepEqual(validateTeam(goodSchool(), 'ncaa'), []);
  assert.deepEqual(validateTeam(goodMlb(), 'mlb'), []);
  assert.deepEqual(validateTeam({ ...goodSchool(), retired: true, retiredSports: ['football'] }, 'ncaa'), []);
});

test('entry rules reject bad keys, colors, logos and needles', () => {
  const errorsFor = (changes, league = 'nfl') => validateTeam({ ...goodPro(), ...changes }, league);
  assert.match(errorsFor({ key: 'NFL-17' }).join(), /key does not match/);
  assert.match(errorsFor({ key: 'nfl-18' }).join(), /key does not equal/);
  assert.match(errorsFor({ espnId: '18' }).join(), /key does not equal/);
  assert.match(errorsFor({ color: 'ae192d' }).join(), /color is not #RRGGBB/);
  assert.match(errorsFor({ logo: 'https://evil.example/x.png' }).join(), /logo is not/);
  assert.match(errorsFor({ logo: 'http://a.espncdn.com/x.png' }).join(), /logo is not/);
  assert.match(errorsFor({ hrefNeedles: ['Bad Needle'] }).join(), /hrefNeedles/);
  assert.match(errorsFor({ hrefNeedles: [] }).join(), /hrefNeedles/);
  assert.match(errorsFor({ nickname: '' }).join(), /nickname is missing/);
  assert.match(errorsFor({ retired: false }).join(), /retired may only be true/);
});

test('entry rules tie sports and conference to schools and statsapi to MLB', () => {
  assert.match(validateTeam({ ...goodPro(), sports: ['football'] }, 'nfl').join(), /sports is only for schools/);
  assert.match(validateTeam({ ...goodPro(), conference: 'x' }, 'nfl').join(), /conference is only for schools/);
  assert.match(validateTeam({ ...goodPro(), statsapi: { leagueId: 103, teamId: 1 } }, 'nfl').join(), /statsapi is only for MLB/);
  assert.match(validateTeam({ ...goodMlb(), statsapi: undefined }, 'mlb').join(), /statsapi must hold/);
  assert.match(validateTeam({ ...goodMlb(), statsapi: { leagueId: 105, teamId: 1 } }, 'mlb').join(), /statsapi must hold/);
  assert.match(validateTeam({ ...goodSchool(), sports: [] }, 'ncaa').join(), /sports must be a non-empty/);
  assert.match(validateTeam({ ...goodSchool(), sports: ['mens-basketball', 'football'] }, 'ncaa').join(), /in order/);
  assert.match(validateTeam({ ...goodSchool(), sports: ['football', 'nba'] }, 'ncaa').join(), /known and in order/);
  assert.match(validateTeam({ ...goodSchool(), retiredSports: ['nba'] }, 'ncaa').join(), /subset of sports/);
});

test('a teams document needs its wrapper, entries and unique keys', () => {
  assert.deepEqual(validateTeamsDocument({ league: 'nfl', schemaVersion: 1, teams: [goodPro()] }, 'nfl'), []);
  assert.match(validateTeamsDocument({ teams: [] }, 'nfl').join(), /schemaVersion/);
  assert.match(validateTeamsDocument({ league: 'nfl', schemaVersion: 1, teams: [] }, 'nfl').join(), /empty/);
  assert.match(validateTeamsDocument({ league: 'nfl', schemaVersion: 1, teams: [goodPro(), goodPro()] }, 'nfl').join(), /duplicate/);
});

function goodLeagues() {
  return {
    leagues: LEAGUE_ROWS.map((row) =>
      row.kind === 'school'
        ? { ...row, sports: row.sports.map((sport) => ({ ...sport, pickable: false })) }
        : { ...row, pickable: false },
    ),
    schemaVersion: 1,
  };
}

test('leagues.json rules', () => {
  assert.deepEqual(validateLeagues(goodLeagues()), []);
  const reordered = goodLeagues();
  reordered.leagues = [reordered.leagues[1], reordered.leagues[0], reordered.leagues[2]];
  assert.match(validateLeagues(reordered).join(), /in that order/);
  const noPick = goodLeagues();
  delete noPick.leagues[0].pickable;
  assert.match(validateLeagues(noPick).join(), /pickable/);
  const zone = goodLeagues();
  zone.leagues[0].officialDateZone = 'America/New_York';
  assert.match(validateLeagues(zone).join(), /mlb: officialDateZone must be absent/);
  const missingZone = goodLeagues();
  delete missingZone.leagues[1].officialDateZone;
  assert.match(validateLeagues(missingZone).join(), /nfl: officialDateZone/);
  const sportsWrong = goodLeagues();
  sportsWrong.leagues[2].sports = sportsWrong.leagues[2].sports.slice(0, 2);
  assert.match(validateLeagues(sportsWrong).join(), /sports must be/);
  assert.match(validateLeagues({ schemaVersion: 2 }).join(), /schemaVersion/);
});

test('overrides accept only allowed fields and team keys', () => {
  assert.deepEqual(validateOverrides({ 'mlb-5': { hrefNeedles: ['x'], hidden: true }, 'nfl-1': { remove: true } }), []);
  assert.match(validateOverrides({ 'mlb-5': { color: '#000000' } }).join(), /field color is not allowed/);
  assert.match(validateOverrides({ notakey: {} }).join(), /not a team key/);
  assert.match(validateOverrides([]).join(), /object keyed/);
});

test('overrides must resolve to a real entry; a remove target may already be gone', () => {
  const teams = { mlb: [goodMlb()], ncaa: [goodSchool()], nfl: [goodPro()] };
  assert.deepEqual(overrideResolutionErrors({ 'mlb-5': { nickname: 'G' }, 'nfl-99': { remove: true } }, teams), []);
  assert.deepEqual(overrideResolutionErrors({ 'nfl-99': { nickname: 'X' } }, teams), [
    'overrides: nfl-99 does not resolve to a catalog entry',
  ]);
  assert.deepEqual(overrideResolutionErrors({ 'nba-1': { remove: true } }, teams), ['overrides: nba-1 names an unknown league']);
});

test('the report must keep network and shape errors apart', () => {
  const good = {
    adapters: {
      nfl: {
        checks: [{ latencyMs: 5, name: 'teams', networkError: null, shapeErrors: [], status: 200 }],
        networkErrors: [],
        shapeErrors: [],
      },
    },
    schemaVersion: 1,
  };
  assert.deepEqual(validateReport(good), []);
  assert.match(validateReport({ schemaVersion: 2, adapters: {} }).join(), /schemaVersion/);
  const merged = JSON.parse(JSON.stringify(good));
  delete merged.adapters.nfl.networkErrors;
  assert.match(validateReport(merged).join(), /networkErrors/);
  const noSplit = JSON.parse(JSON.stringify(good));
  delete noSplit.adapters.nfl.checks[0].shapeErrors;
  assert.match(validateReport(noSplit).join(), /shapeErrors/);
});

test('append-only: a prior entry may leave only through an override remove', () => {
  const prior = [{ key: 'nfl-1' }, { key: 'nfl-2' }];
  const current = [{ key: 'nfl-1' }];
  assert.deepEqual(appendOnlyErrors(prior, current, {}, 'nfl'), ['nfl: nfl-2 left the catalog without an override remove']);
  assert.deepEqual(appendOnlyErrors(prior, current, { 'nfl-2': { remove: true } }, 'nfl'), []);
  assert.deepEqual(appendOnlyErrors(prior, [{ key: 'nfl-1' }, { key: 'nfl-2', retired: true }], {}, 'nfl'), []);
  assert.deepEqual(appendOnlyErrors([{ key: 'ncaa-1', sports: ['football'] }], [{ key: 'ncaa-1', sports: ['mens-basketball'] }], {}, 'ncaa'), [
    'ncaa: ncaa-1 lost sport football',
  ]);
});

function writeCatalog(dir, { mlb = [goodMlb()], nfl = [goodPro()], ncaa = [goodSchool()], leagues = goodLeagues() } = {}) {
  mkdirSync(path.join(dir, 'teams'), { recursive: true });
  writeFileSync(path.join(dir, 'leagues.json'), JSON.stringify(leagues));
  const write = (league, teams) =>
    writeFileSync(path.join(dir, 'teams', `${league}.json`), JSON.stringify({ league, schemaVersion: 1, teams }));
  write('mlb', mlb);
  write('nfl', nfl);
  write('ncaa', ncaa);
}

const AGREEING_FLAGS = { 'ncaa/mens-basketball': { agrees: true, newestCapture: '1', onWithoutEvidence: [] } };

test('runValidate passes a complete catalog and runs the preset guards', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'team-catalog-validate-'));
  try {
    const catalogDir = path.join(root, 'catalog');
    writeCatalog(catalogDir);
    assert.deepEqual(await runValidate({ catalogDir, flagsReport: AGREEING_FLAGS, root }), []);

    writeCatalog(catalogDir, { nfl: [{ ...goodPro(), key: 'nfl-18', espnId: '18', nickname: 'Other' }] });
    assert.deepEqual(await runValidate({ catalogDir, flagsReport: AGREEING_FLAGS, root }), ['preset nfl-17 is missing']);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

function goodStreams(key = 'nfl-17') {
  return { HOW_TO_GUIDE: {}, schemaVersion: 2, streams: ['marker', { kind: 'direct' }], team: { key, name: 'A team' } };
}

function writeStreamsFile(streamsDir, relative, content) {
  const file = path.join(streamsDir, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}

const STREAM_TEAMS = { mlb: [goodMlb()], ncaa: [goodSchool()], nfl: [goodPro(), { key: 'nfl-2', retired: true }] };

test('streams files: no folder passes, and valid files for current and retired teams pass', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'team-catalog-streams-'));
  try {
    const streamsDir = path.join(root, 'streams');
    assert.deepEqual(streamsFileErrors(streamsDir, STREAM_TEAMS), []);
    writeStreamsFile(streamsDir, 'nfl/17.json', goodStreams());
    writeStreamsFile(streamsDir, 'nfl/2.json', goodStreams('nfl-2'));
    writeStreamsFile(streamsDir, 'mlb/5.json', { schemaVersion: 2, streams: [], team: { key: 'mlb-5', name: 'A team' } });
    writeStreamsFile(streamsDir, 'ncaa/66.json', goodStreams('ncaa-66'));
    assert.deepEqual(streamsFileErrors(streamsDir, STREAM_TEAMS), []);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('streams files: each broken document or path is reported by path', () => {
  const cases = [
    ['nfl/17.json', { ...goodStreams(), schemaVersion: 1 }, 'streams/nfl/17.json: schemaVersion is not 2'],
    ['nfl/17.json', { ...goodStreams(), team: { key: 'nfl-18', name: 'A team' } }, 'streams/nfl/17.json: team.key does not equal nfl-17'],
    ['nfl/17.json', { ...goodStreams(), team: { key: 'nfl-17' } }, 'streams/nfl/17.json: team.name is missing'],
    ['nfl/17.json', { ...goodStreams(), streams: {} }, 'streams/nfl/17.json: streams is not a list'],
    ['nfl/17.json', { ...goodStreams(), streams: [1] }, 'streams/nfl/17.json: streams holds an item that is neither a marker string nor an object'],
    ['nfl/17.json', [], 'streams/nfl/17.json: is not a JSON object'],
    ['nfl/18.json', goodStreams('nfl-18'), 'streams/nfl/18.json: nfl-18 is not in the catalog'],
    ['nhl/1.json', goodStreams('nhl-1'), 'streams/nhl/1.json: nhl-1 is not in the catalog'],
    ['17.json', goodStreams(), 'streams/17.json: path is not streams/<league>/<espnId>.json'],
    ['nfl/x.json', goodStreams(), 'streams/nfl/x.json: path is not streams/<league>/<espnId>.json'],
    ['nfl/17.txt', goodStreams(), 'streams/nfl/17.txt: path is not streams/<league>/<espnId>.json'],
    ['nfl/a/17.json', goodStreams(), 'streams/nfl/a/17.json: path is not streams/<league>/<espnId>.json'],
  ];
  for (const [relative, content, expected] of cases) {
    const root = mkdtempSync(path.join(os.tmpdir(), 'team-catalog-streams-'));
    try {
      const streamsDir = path.join(root, 'streams');
      writeStreamsFile(streamsDir, relative, content);
      assert.deepEqual(streamsFileErrors(streamsDir, STREAM_TEAMS), [expected]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

test('streams files: a document with no team reports both team fields', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'team-catalog-streams-'));
  try {
    const streamsDir = path.join(root, 'streams');
    writeStreamsFile(streamsDir, 'nfl/17.json', { schemaVersion: 2, streams: [] });
    assert.deepEqual(streamsFileErrors(streamsDir, STREAM_TEAMS), [
      'streams/nfl/17.json: team.key does not equal nfl-17',
      'streams/nfl/17.json: team.name is missing',
    ]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('streams files: invalid JSON is reported without any of its text', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'team-catalog-streams-'));
  try {
    const streamsDir = path.join(root, 'streams');
    writeStreamsFile(streamsDir, 'nfl/17.json', 'https://listing-one.test/live');
    assert.deepEqual(streamsFileErrors(streamsDir, STREAM_TEAMS), ['streams/nfl/17.json: is not readable JSON']);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('runValidate reports a streams file for a team outside the catalog', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'team-catalog-validate-'));
  try {
    const catalogDir = path.join(root, 'catalog');
    writeCatalog(catalogDir);
    writeStreamsFile(path.join(root, 'streams'), 'nfl/17.json', goodStreams());
    assert.deepEqual(await runValidate({ catalogDir, flagsReport: AGREEING_FLAGS, root }), []);
    writeStreamsFile(path.join(root, 'streams'), 'nfl/18.json', goodStreams('nfl-18'));
    assert.deepEqual(await runValidate({ catalogDir, flagsReport: AGREEING_FLAGS, root }), ['streams/nfl/18.json: nfl-18 is not in the catalog']);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('runValidate rejects a retired preset sport and an unresolved override', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'team-catalog-validate-'));
  try {
    const catalogDir = path.join(root, 'catalog');
    writeCatalog(catalogDir, { ncaa: [{ ...goodSchool(), retiredSports: ['football'] }] });
    writeFileSync(path.join(catalogDir, 'overrides.json'), JSON.stringify({ 'nfl-99': { hidden: true } }));
    assert.deepEqual(await runValidate({ catalogDir, flagsReport: AGREEING_FLAGS, root }), [
      'preset ncaa-66 sport football is retired',
      'overrides: nfl-99 does not resolve to a catalog entry',
    ]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('runValidate fails when a capability flag is on without live evidence', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'team-catalog-validate-'));
  try {
    const catalogDir = path.join(root, 'catalog');
    writeCatalog(catalogDir);
    const errors = await runValidate({
      catalogDir,
      flagsReport: {
        'ncaa/womens-basketball': { agrees: false, newestCapture: null, onWithoutEvidence: ['players'] },
      },
      root,
    });
    assert.deepEqual(errors, ['ncaa/womens-basketball: board flags on without evidence in any live capture: players']);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('runValidate reports missing files and checks the append-only rule against --prior', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'team-catalog-validate-'));
  try {
    const catalogDir = path.join(root, 'catalog');
    assert.deepEqual(await runValidate({ catalogDir, flagsReport: AGREEING_FLAGS, root }), ['leagues.json is missing']);

    const priorDir = path.join(root, 'prior');
    writeCatalog(priorDir, { nfl: [goodPro(), { ...goodPro(), espnId: '3', key: 'nfl-3', nickname: 'Old' }] });
    writeCatalog(catalogDir);
    const errors = await runValidate({ catalogDir, flagsReport: AGREEING_FLAGS, priorDir, root });
    assert.deepEqual(errors, ['nfl: nfl-3 left the catalog without an override remove']);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('runValidate rejects a report that does not separate error kinds', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'team-catalog-validate-'));
  try {
    const catalogDir = path.join(root, 'catalog');
    writeCatalog(catalogDir);
    writeFileSync(path.join(catalogDir, 'probe-report.json'), JSON.stringify({ adapters: { nfl: { checks: [] } }, schemaVersion: 1 }));
    const errors = await runValidate({ catalogDir, flagsReport: AGREEING_FLAGS, root });
    assert.deepEqual(errors, ['nfl: networkErrors, shapeErrors and checks must be arrays']);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
