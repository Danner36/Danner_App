// Selection operations, load and migration, the seeding table, and the catalog data path, using
// the shape scripts/team-catalog/build.mjs writes. No app module here touches React Native.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_ADAPTER_KEYS } from '../../app/leagues/registry.ts';
import { logoFileName, logosToFetch } from '../../app/logos/logoPlan.ts';
import {
  hubStatusLabel,
  isAllowedLogoUrl,
  newerDocument,
  parseLeaguesDocument,
  parseTeamsDocument,
  pickerRows,
  presetSports,
  proTileFromCatalog,
  schoolTileFromCatalog,
  searchTeams,
  sportChoices,
  teamRefFromCatalog,
  teamsForRow,
} from '../../app/picker/catalogModel.ts';
import { buildSnapshot, snapshotHoldsCatalog } from '../../app/scripts/build-catalog-snapshot.mjs';
import { updatedInPlace } from '../../app/selection/installInfo.ts';
import { loadSelection, parseSelectionDocument, SELECTION_KEY } from '../../app/selection/migrations.ts';
import {
  addPro,
  addSchoolSports,
  applyFamilyPreset,
  emptySelection,
  findTile,
  isHubFull,
  MAX_TEAM_TILES,
  moveTile,
  refreshTeamRefs,
  removeTile,
  setSchoolSports,
  addModule,
  hasModule,
  removeModule,
  YOUTUBE_TV_MODULE,
} from '../../app/selection/ops.ts';
import { CYCLONES_TILE, GUARDIANS_TILE, PATRIOTS_TILE } from '../../app/selection/presets.ts';
import { decideSeed, LEGACY_SIGNAL_KEYS, LEGACY_SOURCES_KEYS, SEED_KEY } from '../../app/selection/seed.ts';
import { runBuild } from '../../scripts/team-catalog/build.mjs';
import { ADAPTERS } from '../../scripts/team-catalog/leagues.mjs';
import { buildFetch } from '../../scripts/team-catalog/test/fixtures.mjs';

const NOW = '2026-11-08T12:00:00.000Z';
const empty = () => emptySelection(NOW);
const keysOf = (selection) => selection.tiles.map((tile) => tile.key);

let cases = 0;
const test = async (name, body) => {
  try {
    await body();
    cases += 1;
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
};

function proTile(id) {
  const espnId = String(id);
  return {
    key: `nfl-${espnId}`,
    kind: 'pro',
    league: 'nfl',
    team: {
      abbreviation: `T${espnId}`,
      espnId,
      location: 'Town',
      name: `Town ${espnId}`,
      nickname: `Nick${espnId}`,
    },
  };
}

function schoolTile(id, sports) {
  const espnId = String(id);
  return {
    key: `ncaa-${espnId}`,
    kind: 'school',
    league: 'ncaa',
    sports,
    team: {
      abbreviation: `S${espnId}`,
      espnId,
      location: 'College',
      name: `College ${espnId}`,
      nickname: 'Owls',
    },
  };
}

function filledTo(count) {
  let selection = empty();
  for (let id = 1; id <= count; id += 1) {
    selection = addPro(selection, proTile(id), NOW);
  }
  return selection;
}

// A storage that records every call. `failing` names operations that reject, by name or by
// `name:key`.
function fakeStorage(initial = {}, failing = []) {
  const data = new Map(Object.entries(initial));
  const calls = [];
  const fails = (name, key) => failing.includes(name) || failing.includes(`${name}:${key}`);
  return {
    calls,
    data,
    multiGet: async (keys) => {
      calls.push(['multiGet', [...keys]]);
      if (keys.some((key) => fails('multiGet', key))) {
        throw new Error('read failed');
      }
      return keys.map((key) => [key, data.has(key) ? data.get(key) : null]);
    },
    multiRemove: async (keys) => {
      calls.push(['multiRemove', [...keys]]);
      if (keys.some((key) => fails('multiRemove', key))) {
        throw new Error('remove failed');
      }
      keys.forEach((key) => data.delete(key));
    },
    setItem: async (key, value) => {
      calls.push(['setItem', key]);
      if (fails('setItem', key)) {
        throw new Error('write failed');
      }
      data.set(key, value);
    },
  };
}

const load = (storage, options = {}) =>
  loadSelection({
    appVersion: '2.0.0',
    getInstallTimes: async () => undefined,
    now: () => NOW,
    storage,
    ...options,
  });

const writes = (storage) => storage.calls.filter(([name]) => name !== 'multiGet');
const OLD_INSTALL = { firstInstallTime: 1_000, lastUpdateTime: 1_000 + 61_000 };
const NEW_INSTALL = { firstInstallTime: 1_000, lastUpdateTime: 1_000 + 60_000 };
const PRESET_KEYS = ['mlb-5', 'nfl-17', 'ncaa-66'];

// Operations.
await test('addPro appends and ignores a duplicate', () => {
  const once = addPro(empty(), GUARDIANS_TILE, NOW);
  assert.deepEqual(keysOf(once), ['mlb-5']);
  assert.equal(addPro(once, GUARDIANS_TILE, NOW), once);
});

await test('addSchoolSports merges into one tile in sport order', () => {
  const school = schoolTile(9, ['womens-basketball']);
  const first = addSchoolSports(empty(), school, NOW);
  const merged = addSchoolSports(first, schoolTile(9, ['football']), NOW);
  assert.deepEqual(keysOf(merged), ['ncaa-9']);
  assert.deepEqual(merged.tiles[0].sports, ['football', 'womens-basketball']);
});

await test('setSchoolSports keeps the tile until its last sport is gone', () => {
  const start = addSchoolSports(empty(), schoolTile(9, ['football', 'mens-basketball']), NOW);
  const one = setSchoolSports(start, 'ncaa-9', ['mens-basketball'], NOW);
  assert.deepEqual(one.tiles[0].sports, ['mens-basketball']);
  assert.deepEqual(keysOf(setSchoolSports(one, 'ncaa-9', [], NOW)), []);
});

await test('moveTile moves to the front, earlier and later and stops at the ends', () => {
  const selection = applyFamilyPreset(empty(), NOW);
  assert.deepEqual(keysOf(moveTile(selection, 'ncaa-66', 'front', NOW)), ['ncaa-66', 'mlb-5', 'nfl-17']);
  assert.deepEqual(keysOf(moveTile(selection, 'nfl-17', 'earlier', NOW)), ['nfl-17', 'mlb-5', 'ncaa-66']);
  assert.deepEqual(keysOf(moveTile(selection, 'nfl-17', 'later', NOW)), ['mlb-5', 'ncaa-66', 'nfl-17']);
  assert.equal(moveTile(selection, 'mlb-5', 'earlier', NOW), selection);
  assert.equal(moveTile(selection, 'ncaa-66', 'later', NOW), selection);
});

await test('removeTile removes only that key', () => {
  const selection = applyFamilyPreset(empty(), NOW);
  assert.deepEqual(keysOf(removeTile(selection, 'nfl-17', NOW)), ['mlb-5', 'ncaa-66']);
});

await test('the cap refuses a 31st tile and still allows a sport merge', () => {
  let selection = filledTo(MAX_TEAM_TILES - 1);
  selection = addSchoolSports(selection, schoolTile(9, ['football']), NOW);
  assert.equal(selection.tiles.length, MAX_TEAM_TILES);
  assert.ok(isHubFull(selection));
  assert.equal(addPro(selection, proTile(99), NOW), selection);
  assert.equal(addSchoolSports(selection, schoolTile(10, ['football']), NOW), selection);
  const merged = addSchoolSports(selection, schoolTile(9, ['mens-basketball']), NOW);
  assert.deepEqual(findTile(merged, 'ncaa-9').sports, ['football', 'mens-basketball']);
});

await test('applyFamilyPreset appends only what is missing and merges Cyclones sports', () => {
  const partial = addSchoolSports(
    addPro(empty(), proTile(4), NOW),
    { ...CYCLONES_TILE, sports: ['football'] },
    NOW,
  );
  const applied = applyFamilyPreset(partial, NOW);
  assert.deepEqual(keysOf(applied), ['nfl-4', 'ncaa-66', 'mlb-5', 'nfl-17']);
  assert.deepEqual(findTile(applied, 'ncaa-66').sports, CYCLONES_TILE.sports);
});

await test('refreshTeamRefs changes display data by key and never order or sports', () => {
  const selection = applyFamilyPreset(empty(), NOW);
  const refreshed = refreshTeamRefs(
    selection,
    (key) => (key === 'ncaa-66' ? { ...CYCLONES_TILE.team, nickname: 'Clones' } : undefined),
    '2026-11-09T00:00:00.000Z',
  );
  assert.deepEqual(keysOf(refreshed), keysOf(selection));
  assert.equal(findTile(refreshed, 'ncaa-66').team.nickname, 'Clones');
  assert.deepEqual(findTile(refreshed, 'ncaa-66').sports, CYCLONES_TILE.sports);
  assert.equal(findTile(refreshed, 'mlb-5').team.statsapi.teamId, 114);
  assert.equal(refreshTeamRefs(selection, () => undefined, NOW), selection);
});

await test('a refresh without statsapi keeps the stored statsapi', () => {
  const selection = addPro(empty(), GUARDIANS_TILE, NOW);
  const { statsapi: _dropped, ...withoutStatsapi } = GUARDIANS_TILE.team;
  const refreshed = refreshTeamRefs(selection, () => withoutStatsapi, NOW);
  assert.equal(refreshed, selection);
});

// Seeding table.
await test('updatedInPlace needs more than 60 seconds', () => {
  assert.equal(updatedInPlace(OLD_INSTALL), true);
  assert.equal(updatedInPlace(NEW_INSTALL), false);
  assert.equal(updatedInPlace(undefined), false);
});

await test('decideSeed follows the layers in order', () => {
  assert.deepEqual(decideSeed(true, undefined), { decision: 'legacy-family', signal: 'legacy-keys' });
  assert.deepEqual(decideSeed(true, OLD_INSTALL), { decision: 'legacy-family', signal: 'legacy-keys' });
  assert.deepEqual(decideSeed(false, OLD_INSTALL), { decision: 'legacy-family', signal: 'install-times' });
  assert.deepEqual(decideSeed(false, NEW_INSTALL), { decision: 'fresh', signal: 'none' });
  assert.deepEqual(decideSeed(false, undefined), { decision: 'fresh', signal: 'none' });
});

await test('the legacy signal keys are exactly the plan list', () => {
  assert.deepEqual([...LEGACY_SIGNAL_KEYS].sort(), [
    'danner.cyclones.sources.v1',
    'danner.destination.v1',
    'danner.guardians.sources.v2',
    'danner.install.v1',
    'danner.patriots.sources.v1',
  ]);
});

for (const legacyKey of LEGACY_SIGNAL_KEYS) {
  await test(`${legacyKey} alone seeds the presets through layer 1`, async () => {
    const storage = fakeStorage({ [legacyKey]: 'x' });
    const loaded = await load(storage, {
      getInstallTimes: async () => assert.fail('layer 2 is not read after layer 1'),
    });
    assert.equal(loaded.readOnly, false);
    assert.deepEqual(keysOf(loaded.selection), PRESET_KEYS);
    assert.equal(JSON.parse(storage.data.get(SEED_KEY)).signal, 'legacy-keys');
    assert.equal(JSON.parse(storage.data.get(SEED_KEY)).decision, 'legacy-family');
  });
}

await test('seeding writes the new keys first, then removes only the three sources keys', async () => {
  const initial = {
    'danner.cyclones.sources.v1': '{}',
    'danner.destination.v1': '{"lat":1}',
    'danner.guardians.sources.v2': '{}',
    'danner.install.v1': '{"firstVersion":"1.5.0"}',
    'danner.patriots.sources.v1': '{}',
    'danner.tv.default.v1': '{"lat":2}',
  };
  const storage = fakeStorage(initial);
  await load(storage);
  assert.deepEqual(writes(storage), [
    ['setItem', SELECTION_KEY],
    ['setItem', SEED_KEY],
    ['multiRemove', [...LEGACY_SOURCES_KEYS]],
  ]);
  assert.equal(storage.data.get('danner.install.v1'), initial['danner.install.v1']);
  assert.equal(storage.data.get('danner.destination.v1'), initial['danner.destination.v1']);
  assert.equal(storage.data.get('danner.tv.default.v1'), initial['danner.tv.default.v1']);
  for (const key of LEGACY_SOURCES_KEYS) {
    assert.equal(storage.data.has(key), false);
  }
  const seed = JSON.parse(storage.data.get(SEED_KEY));
  assert.deepEqual(Object.keys(seed).sort(), ['appVersion', 'at', 'decision', 'signal']);
  assert.equal(seed.appVersion, '2.0.0');
  assert.equal(seed.at, NOW);
});

await test('layer 2 seeds the presets on an Android phone updated in place', async () => {
  const storage = fakeStorage();
  const loaded = await load(storage, { getInstallTimes: async () => OLD_INSTALL });
  assert.deepEqual(keysOf(loaded.selection), PRESET_KEYS);
  assert.equal(JSON.parse(storage.data.get(SEED_KEY)).signal, 'install-times');
});

await test('a first install gets an empty selection and a fresh seed', async () => {
  const storage = fakeStorage();
  const loaded = await load(storage, { getInstallTimes: async () => NEW_INSTALL });
  assert.deepEqual(keysOf(loaded.selection), []);
  assert.deepEqual(JSON.parse(storage.data.get(SELECTION_KEY)).tiles, []);
  assert.equal(JSON.parse(storage.data.get(SEED_KEY)).decision, 'fresh');
  assert.equal(JSON.parse(storage.data.get(SEED_KEY)).signal, 'none');
  assert.ok(!writes(storage).some(([name]) => name === 'multiRemove'));
});

await test('an iPhone with no signals is a first install', async () => {
  const storage = fakeStorage();
  const loaded = await load(storage);
  assert.deepEqual(keysOf(loaded.selection), []);
  assert.equal(JSON.parse(storage.data.get(SEED_KEY)).signal, 'none');
});

await test('a present seed and an absent selection never seed again', async () => {
  const storage = fakeStorage({ [SEED_KEY]: '{"decision":"fresh"}', 'danner.destination.v1': 'x' });
  const loaded = await load(storage, { getInstallTimes: async () => OLD_INSTALL });
  assert.equal(loaded.readOnly, false);
  assert.deepEqual(keysOf(loaded.selection), []);
  assert.deepEqual(writes(storage), []);
});

await test('removing every tile stays removed on the next load', async () => {
  const stored = JSON.stringify(empty());
  const storage = fakeStorage({ [SELECTION_KEY]: stored, 'danner.destination.v1': 'x' });
  const loaded = await load(storage);
  assert.deepEqual(keysOf(loaded.selection), []);
  assert.deepEqual(writes(storage), []);
});

await test('a stored selection keeps its order, sports and data', async () => {
  const selection = applyFamilyPreset(empty(), NOW);
  const moved = moveTile(selection, 'ncaa-66', 'front', NOW);
  const storage = fakeStorage({ [SELECTION_KEY]: JSON.stringify(moved) });
  const loaded = await load(storage);
  assert.deepEqual(keysOf(loaded.selection), ['ncaa-66', 'mlb-5', 'nfl-17']);
  assert.deepEqual(writes(storage), []);
});

// Read failures and read-only mode.
await test('a failed first read is read-only and writes nothing', async () => {
  const storage = fakeStorage({ 'danner.destination.v1': 'x' }, ['multiGet']);
  const loaded = await load(storage);
  assert.equal(loaded.readOnly, true);
  assert.deepEqual(keysOf(loaded.selection), []);
  assert.deepEqual(writes(storage), []);
});

await test('a failed read of the legacy keys is read-only and writes no fresh seed', async () => {
  const storage = fakeStorage({}, ['multiGet:danner.install.v1']);
  const loaded = await load(storage);
  assert.equal(loaded.readOnly, true);
  assert.deepEqual(writes(storage), []);
  assert.equal(storage.data.has(SEED_KEY), false);
  assert.equal(storage.data.has(SELECTION_KEY), false);
});

await test('a failed install-times read is read-only and writes no fresh seed', async () => {
  const storage = fakeStorage();
  const loaded = await load(storage, {
    getInstallTimes: async () => {
      throw new Error('native failure');
    },
  });
  assert.equal(loaded.readOnly, true);
  assert.deepEqual(writes(storage), []);
});

await test('a corrupt selection is read-only and the key is untouched', async () => {
  for (const text of ['{not json', '[]', '"text"', '{"schema":"one","tiles":[]}', '{"schema":1}']) {
    const storage = fakeStorage({ [SELECTION_KEY]: text, 'danner.destination.v1': 'x' });
    const loaded = await load(storage);
    assert.equal(loaded.readOnly, true, text);
    assert.deepEqual(keysOf(loaded.selection), [], text);
    assert.deepEqual(writes(storage), [], text);
    assert.equal(storage.data.get(SELECTION_KEY), text);
  }
});

await test('a tile that cannot be read leaves the document alone and the rest visible', async () => {
  const document = { schema: 1, tiles: [GUARDIANS_TILE, { key: 'bad' }], updatedAt: NOW };
  const storage = fakeStorage({ [SELECTION_KEY]: JSON.stringify(document) });
  const loaded = await load(storage);
  assert.equal(loaded.readOnly, true);
  assert.deepEqual(keysOf(loaded.selection), ['mlb-5']);
  assert.deepEqual(writes(storage), []);
});

await test('a failed selection write does not write the seed or remove old keys', async () => {
  const storage = fakeStorage({ 'danner.guardians.sources.v2': 'x' }, [`setItem:${SELECTION_KEY}`]);
  const loaded = await load(storage);
  assert.equal(loaded.readOnly, true);
  assert.equal(storage.data.has(SEED_KEY), false);
  assert.equal(storage.data.has('danner.guardians.sources.v2'), true);
});

await test('a failed seed write keeps the old keys and the next launch reads the selection', async () => {
  const storage = fakeStorage({ 'danner.guardians.sources.v2': 'x' }, [`setItem:${SEED_KEY}`]);
  const loaded = await load(storage);
  assert.equal(loaded.readOnly, true);
  assert.equal(storage.data.has('danner.guardians.sources.v2'), true);
  const next = await load(fakeStorage({ [SELECTION_KEY]: storage.data.get(SELECTION_KEY) }));
  assert.deepEqual(keysOf(next.selection), PRESET_KEYS);
});

await test('a failed removal of old keys still leaves the phone seeded', async () => {
  const storage = fakeStorage({ 'danner.guardians.sources.v2': 'x' }, ['multiRemove']);
  const loaded = await load(storage);
  assert.equal(loaded.readOnly, false);
  assert.deepEqual(keysOf(loaded.selection), PRESET_KEYS);
});

// Migrations.
await test('a newer schema is read and never written', async () => {
  const document = { extra: true, schema: 2, tiles: [GUARDIANS_TILE], updatedAt: NOW };
  const storage = fakeStorage({ [SELECTION_KEY]: JSON.stringify(document) });
  const loaded = await load(storage);
  assert.equal(loaded.readOnly, true);
  assert.deepEqual(keysOf(loaded.selection), ['mlb-5']);
  assert.deepEqual(writes(storage), []);
});

await test('an older schema is migrated, validated and written back', async () => {
  const old = { schema: 0, teams: [GUARDIANS_TILE] };
  const storage = fakeStorage({ [SELECTION_KEY]: JSON.stringify(old) });
  const loaded = await load(storage, {
    migrations: { 0: (document) => ({ schema: 1, tiles: document.teams, updatedAt: NOW }) },
  });
  assert.equal(loaded.readOnly, false);
  assert.deepEqual(keysOf(loaded.selection), ['mlb-5']);
  assert.equal(JSON.parse(storage.data.get(SELECTION_KEY)).schema, 1);
});

await test('an older schema with no migration leaves the key alone', async () => {
  const text = JSON.stringify({ schema: 0, tiles: [] });
  const storage = fakeStorage({ [SELECTION_KEY]: text });
  const loaded = await load(storage);
  assert.equal(loaded.readOnly, true);
  assert.equal(storage.data.get(SELECTION_KEY), text);
  assert.deepEqual(writes(storage), []);
});

await test('a migration that throws or yields an invalid document writes nothing', async () => {
  const text = JSON.stringify({ schema: 0, tiles: [] });
  for (const migrate of [
    () => {
      throw new Error('bad');
    },
    () => ({ schema: 1, tiles: [{ key: 'bad' }] }),
  ]) {
    const storage = fakeStorage({ [SELECTION_KEY]: text });
    const loaded = await load(storage, { migrations: { 0: migrate } });
    assert.equal(loaded.readOnly, true);
    assert.equal(storage.data.get(SELECTION_KEY), text);
  }
});

await test('a module is added once, removed, and survives tile changes', () => {
  const added = addModule(empty(), YOUTUBE_TV_MODULE, NOW);
  assert.equal(hasModule(added, YOUTUBE_TV_MODULE), true);
  assert.equal(addModule(added, YOUTUBE_TV_MODULE, NOW), added);
  const withTeam = addPro(added, GUARDIANS_TILE, NOW);
  assert.deepEqual(withTeam.modules, [YOUTUBE_TV_MODULE]);
  const removed = removeModule(withTeam, YOUTUBE_TV_MODULE, NOW);
  assert.equal(hasModule(removed, YOUTUBE_TV_MODULE), false);
  assert.deepEqual(keysOf(removed), ['mlb-5']);
  assert.equal(removeModule(removed, YOUTUBE_TV_MODULE, NOW), removed);
});

await test('a first install has no modules and a family phone keeps YouTube TV', async () => {
  const fresh = await load(fakeStorage());
  assert.deepEqual(fresh.selection.modules, []);
  const family = await load(fakeStorage({ 'danner.destination.v1': '{"label":"Home"}' }));
  assert.deepEqual(family.selection.modules, [YOUTUBE_TV_MODULE]);
});

const olderDocument = JSON.stringify({ schema: 1, tiles: [GUARDIANS_TILE], updatedAt: NOW });

await test('a phone from before modules that never used YouTube TV loses the tile, once', async () => {
  const storage = fakeStorage({
    [SELECTION_KEY]: olderDocument,
    [SEED_KEY]: JSON.stringify({ decision: 'fresh', signal: 'none' }),
  });
  const loaded = await load(storage);
  assert.equal(loaded.readOnly, false);
  assert.deepEqual(loaded.selection.modules, []);
  assert.deepEqual(keysOf(loaded.selection), ['mlb-5']);
  assert.deepEqual(JSON.parse(storage.data.get(SELECTION_KEY)).modules, []);
});

await test('a phone from before modules keeps the tile when seeded or when it used TV Location', async () => {
  for (const extra of [
    { [SEED_KEY]: JSON.stringify({ decision: 'legacy-family', signal: 'legacy-keys' }) },
    { 'danner.destination.v1': '{"label":"Home"}' },
    { 'danner.tv.default.v1': '{"label":"Home"}' },
  ]) {
    const storage = fakeStorage({ [SELECTION_KEY]: olderDocument, ...extra });
    const loaded = await load(storage);
    assert.deepEqual(loaded.selection.modules, [YOUTUBE_TV_MODULE]);
    assert.deepEqual(JSON.parse(storage.data.get(SELECTION_KEY)).modules, [YOUTUBE_TV_MODULE]);
  }
});

await test('a removed YouTube TV stays removed even with its saved location', async () => {
  const text = JSON.stringify({ modules: [], schema: 1, tiles: [], updatedAt: NOW });
  const storage = fakeStorage({
    [SELECTION_KEY]: text,
    'danner.destination.v1': '{"label":"Home"}',
  });
  const loaded = await load(storage);
  assert.deepEqual(loaded.selection.modules, []);
  assert.equal(storage.data.get(SELECTION_KEY), text);
});

await test('a session that cannot save keeps YouTube TV reachable', async () => {
  const unreadable = await load(fakeStorage({ [SELECTION_KEY]: '{not json' }));
  assert.equal(unreadable.readOnly, true);
  assert.deepEqual(unreadable.selection.modules, [YOUTUBE_TV_MODULE]);
  const partial = JSON.stringify({ schema: 1, tiles: [GUARDIANS_TILE, { key: 'bad' }], updatedAt: NOW });
  assert.deepEqual((await load(fakeStorage({ [SELECTION_KEY]: partial }))).selection.modules, [
    YOUTUBE_TV_MODULE,
  ]);
});

await test('an unknown module is dropped', () => {
  assert.deepEqual(
    parseSelectionDocument({ modules: ['other', YOUTUBE_TV_MODULE], tiles: [] }).selection.modules,
    [YOUTUBE_TV_MODULE],
  );
  assert.deepEqual(parseSelectionDocument({ modules: ['other'], tiles: [] }).selection.modules, []);
  assert.equal(parseSelectionDocument({ tiles: [] }).selection.modules, undefined);
});

await test('the parser ignores unknown keys and repeats', () => {
  const parsed = parseSelectionDocument({
    extra: 1,
    tiles: [{ ...GUARDIANS_TILE, unknown: true }, GUARDIANS_TILE, CYCLONES_TILE],
    updatedAt: NOW,
  });
  assert.deepEqual(keysOf(parsed.selection), ['mlb-5', 'ncaa-66']);
});

await test('development test selection applies only to a fresh dev install', async () => {
  const storage = fakeStorage();
  const loaded = await load(storage, { testSelection: ['nfl-17', 'ncaa-66', 'nope'] });
  assert.deepEqual(keysOf(loaded.selection), ['nfl-17', 'ncaa-66']);
  const existing = fakeStorage({ [SELECTION_KEY]: JSON.stringify(addPro(empty(), PATRIOTS_TILE, NOW)) });
  const kept = await load(existing, { testSelection: ['ncaa-66'] });
  assert.deepEqual(keysOf(kept.selection), ['nfl-17']);
});

// Catalog data path, from what build.mjs writes.
const buildRoot = mkdtempSync(path.join(tmpdir(), 'catalog-snapshot-'));
const catalogDir = path.join(buildRoot, 'catalog');
try {
  mkdirSync(catalogDir, { recursive: true });
  const built = await runBuild({
    catalogDir,
    fetchJson: buildFetch(),
    log: () => {},
    now: () => new Date(NOW),
    reportFile: path.join(catalogDir, 'probe-report.json'),
    root: buildRoot,
    selected: Object.keys(ADAPTERS),
  });
  assert.deepEqual(built, { code: 0, errors: [] });

  // A passing probe and committed fixtures turn these on; the builder test covers that rule.
  const leaguesFile = path.join(catalogDir, 'leagues.json');
  const leaguesDocument = JSON.parse(readFileSync(leaguesFile, 'utf8'));
  for (const row of leaguesDocument.leagues) {
    if (row.kind === 'pro') {
      row.pickable = true;
    } else {
      row.sports.forEach((sport) => {
        sport.pickable = true;
      });
    }
  }
  writeFileSync(leaguesFile, JSON.stringify(leaguesDocument));

  const ncaaFile = path.join(catalogDir, 'teams', 'ncaa.json');
  const ncaaDocument = JSON.parse(readFileSync(ncaaFile, 'utf8'));
  const editable = ncaaDocument.teams.filter((team) => team.key !== 'ncaa-66');
  Object.assign(editable[0], { retired: true });
  Object.assign(editable[1], { hidden: true });
  Object.assign(editable[2], { retiredSports: ['womens-basketball'] });
  const [retiredKey, hiddenKey, partialKey] = editable.map((team) => team.key);
  writeFileSync(ncaaFile, JSON.stringify(ncaaDocument));

  const snapshot = buildSnapshot(catalogDir);
  const leagues = parseLeaguesDocument(snapshot.leagues);
  const ncaa = parseTeamsDocument(snapshot.teams.ncaa, 'ncaa');
  const mlb = parseTeamsDocument(snapshot.teams.mlb, 'mlb');
  const nfl = parseTeamsDocument(snapshot.teams.nfl, 'nfl');
  const rows = pickerRows(leagues, SUPPORTED_ADAPTER_KEYS);
  const rowFor = (adapter) => rows.find((row) => row.adapter === adapter);

  await test('the snapshot holds what the builder writes', () => {
    assert.ok(snapshotHoldsCatalog(snapshot));
    assert.equal(snapshot.schemaVersion, 1);
    assert.deepEqual(Object.keys(snapshot.teams).sort(), ['mlb', 'ncaa', 'nfl']);
  });

  await test('step 1 lists the leagues and college sports in order', () => {
    assert.deepEqual(
      rows.map((row) => row.label),
      ['MLB', 'NFL', 'NCAA football', "NCAA men's basketball", "NCAA women's basketball"],
    );
    assert.deepEqual(
      rows.map((row) => row.adapter),
      ['mlb', 'nfl', 'ncaa/football', 'ncaa/mens-basketball', 'ncaa/womens-basketball'],
    );
  });

  await test('a league is offered only when supported and pickable', () => {
    assert.deepEqual(
      pickerRows(leagues, ['nfl']).map((row) => row.adapter),
      ['nfl'],
    );
    const off = JSON.parse(JSON.stringify(snapshot.leagues));
    off.leagues[1].pickable = false;
    off.leagues[2].sports[0].pickable = false;
    const labels = pickerRows(parseLeaguesDocument(off), SUPPORTED_ADAPTER_KEYS).map((row) => row.label);
    assert.deepEqual(labels, ['MLB', "NCAA men's basketball", "NCAA women's basketball"]);
    const before = JSON.parse(JSON.stringify(snapshot.leagues));
    before.leagues[1].pickable = undefined;
    assert.ok(!pickerRows(parseLeaguesDocument(before), SUPPORTED_ADAPTER_KEYS).some((row) => row.league === 'nfl'));
  });

  await test('retired and hidden schools are not offered', () => {
    const offered = teamsForRow(ncaa.teams, rowFor('ncaa/football')).map((team) => team.key);
    assert.ok(offered.includes('ncaa-66'));
    assert.ok(!offered.includes(retiredKey));
    assert.ok(!offered.includes(hiddenKey));
  });

  await test('a retired sport is not pickable anywhere', () => {
    assert.ok(!teamsForRow(ncaa.teams, rowFor('ncaa/womens-basketball')).some((team) => team.key === partialKey));
    assert.ok(teamsForRow(ncaa.teams, rowFor('ncaa/football')).some((team) => team.key === partialKey));
    const partial = ncaa.teams.find((team) => team.key === partialKey);
    assert.deepEqual(sportChoices(partial, rows, undefined), ['football', 'mens-basketball']);
  });

  await test('a retired sport already on the tile can still be unchecked', () => {
    const partial = ncaa.teams.find((team) => team.key === partialKey);
    const tile = schoolTileFromCatalog(partial, ['football', 'womens-basketball']);
    assert.deepEqual(sportChoices(partial, rows, tile), ['football', 'mens-basketball', 'womens-basketball']);
  });

  await test('step 3 pre-checks the tile sports plus the picked sport', () => {
    const tile = schoolTileFromCatalog(ncaa.teams.find((team) => team.key === 'ncaa-66'), ['football']);
    assert.deepEqual(presetSports(tile, 'womens-basketball'), ['football', 'womens-basketball']);
    assert.deepEqual(presetSports(undefined, 'mens-basketball'), ['mens-basketball']);
  });

  await test('a team needs a valid entry to appear', () => {
    const parsed = parseTeamsDocument(
      {
        league: 'nfl',
        schemaVersion: 1,
        teams: [
          { abbreviation: 'NE', espnId: '17', key: 'nfl-17', location: 'NE', name: 'A', nickname: 'B', unknown: 1 },
          { abbreviation: 'X', espnId: '9', key: 'nfl-8', location: 'X', name: 'X', nickname: 'X' },
          { espnId: '10', key: 'nfl-10' },
        ],
      },
      'nfl',
    );
    assert.deepEqual(parsed.teams.map((team) => team.key), ['nfl-17']);
    assert.equal(parseTeamsDocument({ league: 'mlb', schemaVersion: 1, teams: [] }, 'nfl'), undefined);
    assert.equal(parseLeaguesDocument({ leagues: [], schemaVersion: 1 }), undefined);
    assert.equal(parseLeaguesDocument({ leagues: [{}], schemaVersion: 2 }), undefined);
  });

  await test('an MLB entry needs its statsapi ids and every builder entry has them', () => {
    const row = rowFor('mlb');
    assert.equal(teamsForRow(mlb.teams, row).length, mlb.teams.length);
    assert.equal(mlb.teams.find((team) => team.key === 'mlb-5').statsapi.teamId, 114);
    const withoutIds = mlb.teams.map(({ statsapi: _statsapi, ...team }) => team);
    assert.equal(teamsForRow(withoutIds, row).length, 0);
  });

  await test('search ignores case and accents across four fields', () => {
    const teams = [
      { abbreviation: 'SJ', location: 'San José', name: 'San José State Spartans', nickname: 'Spartans' },
      { abbreviation: 'ISU', location: 'Iowa State', name: 'Iowa State Cyclones', nickname: 'Cyclones' },
    ];
    assert.equal(searchTeams(teams, 'jose').length, 1);
    assert.equal(searchTeams(teams, 'CYCLONES')[0].abbreviation, 'ISU');
    assert.equal(searchTeams(teams, 'isu').length, 1);
    assert.equal(searchTeams(teams, 'iowa').length, 1);
    assert.equal(searchTeams(teams, '  ').length, 2);
    assert.equal(searchTeams(teams, 'zzz').length, 0);
  });

  await test('tiles built from the catalog keep display data and statsapi', () => {
    const entry = mlb.teams.find((team) => team.key === 'mlb-5');
    const tile = proTileFromCatalog(entry, 'mlb');
    assert.deepEqual(tile.team.statsapi, { leagueId: 103, teamId: 114 });
    assert.equal(tile.team.nickname, 'Guardians');
    assert.equal(tile.team.hrefNeedles, undefined);
    assert.equal(tile.team.retired, undefined);
    assert.equal(teamRefFromCatalog(entry).name, 'Cleveland Guardians');
    assert.deepEqual(Object.keys(proTileFromCatalog(nfl.teams[0], 'nfl')).sort(), ['key', 'kind', 'league', 'team']);
  });

  await test('hub status text names the sports on a school tile', () => {
    assert.equal(hubStatusLabel(undefined), undefined);
    assert.equal(hubStatusLabel(GUARDIANS_TILE), 'On hub');
    assert.equal(hubStatusLabel(CYCLONES_TILE), "On hub · Football, Men's basketball, Women's basketball");
  });

  await test('a cached file replaces the bundled one only when newer', () => {
    const older = { generatedAt: '2026-11-01T00:00:00Z', id: 'older' };
    const newer = { generatedAt: '2026-11-08T00:00:00Z', id: 'newer' };
    assert.equal(newerDocument(older, newer), newer);
    assert.equal(newerDocument(newer, older), newer);
    assert.equal(newerDocument(newer, newer), newer);
    assert.equal(newerDocument(undefined, older), older);
    assert.equal(newerDocument(older, undefined), older);
    assert.equal(newerDocument(older, { id: 'no time' }), older);
  });

  await test('the snapshot script refuses a missing or broken source and writes nothing', () => {
    const script = fileURLToPath(new URL('../../app/scripts/build-catalog-snapshot.mjs', import.meta.url));
    const out = path.join(buildRoot, 'snapshot.json');
    writeFileSync(out, '{"untouched":true}\n');
    const missing = path.join(buildRoot, 'absent');
    assert.throws(() =>
      execFileSync(process.execPath, [script, '--catalog', missing, '--out', out], { stdio: 'pipe' }),
    );
    assert.equal(readFileSync(out, 'utf8'), '{"untouched":true}\n');
    assert.throws(() => buildSnapshot(missing), /does not exist/);

    execFileSync(process.execPath, [script, '--catalog', catalogDir, '--out', out], { stdio: 'pipe' });
    assert.ok(snapshotHoldsCatalog(JSON.parse(readFileSync(out, 'utf8'))));
    execFileSync(process.execPath, [script, '--out', out, '--check'], { stdio: 'pipe' });

    writeFileSync(out, '{"leagues":null,"schemaVersion":1,"teams":{}}\n');
    assert.throws(() =>
      execFileSync(process.execPath, [script, '--out', out, '--check'], { stdio: 'pipe' }),
    );
  });

  await test('the committed snapshot parses and an empty one offers nothing', () => {
    const committed = JSON.parse(
      readFileSync(new URL('../../app/picker/catalogSnapshot.json', import.meta.url), 'utf8'),
    );
    assert.equal(committed.schemaVersion, 1);
    assert.ok(committed.leagues === null || snapshotHoldsCatalog(committed));
    if (committed.leagues === null) {
      assert.deepEqual(pickerRows(parseLeaguesDocument(committed.leagues), SUPPORTED_ADAPTER_KEYS), []);
    }
  });
} finally {
  rmSync(buildRoot, { force: true, recursive: true });
}

// Logos.
await test('logo files are named by team key and only the allowed host is fetched', () => {
  assert.equal(logoFileName('nfl-8'), 'logos/nfl-8.png');
  assert.ok(isAllowedLogoUrl('https://a.espncdn.com/i/teamlogos/nfl/500/det.png'));
  assert.ok(!isAllowedLogoUrl('http://a.espncdn.com/i/x.png'));
  assert.ok(!isAllowedLogoUrl('https://a.espncdn.com.example.org/x.png'));
  assert.ok(!isAllowedLogoUrl('https://example.org/a.espncdn.com/x.png'));
  assert.ok(!isAllowedLogoUrl(undefined));
});

await test('the backfill plan fetches a missing file or a changed logo only', () => {
  const href = 'https://a.espncdn.com/i/x.png';
  const withLogo = (id, logo) => {
    const tile = proTile(id);
    tile.team.logo = logo;
    return tile;
  };
  const tiles = [
    withLogo(1, href),
    withLogo(2, href),
    withLogo(3, 'https://a.espncdn.com/i/new.png'),
    withLogo(4, 'https://example.org/x.png'),
    { ...proTile(5), key: 'mlb-5' },
    proTile(6),
  ];
  const index = {
    'nfl-1': { href, name: 'logos/nfl-1.png' },
    'nfl-3': { href, name: 'logos/nfl-3.png' },
  };
  const fetched = logosToFetch(tiles, index, (key) => key === 'nfl-1' || key === 'nfl-3');
  assert.deepEqual(fetched.map((entry) => entry.key), ['nfl-2', 'nfl-3', 'mlb-5']);
  assert.equal(fetched[2].href, 'https://a.espncdn.com/i/teamlogos/mlb/500/cle.png');
});

process.stdout.write(`Selection tests passed: ${cases} cases.\n`);
