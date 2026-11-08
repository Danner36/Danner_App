import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadCatalog } from '../lib/catalog.mjs';
import {
  configProblem,
  defaultsPath,
  graceMinutesFor,
  hrefNeedlesFor,
  leagueHintsFor,
  mergeConfig,
  readDefaults,
  readSecretConfig,
  requireOpponentFor,
} from '../lib/config.mjs';
import { HOSTS, secretConfig, withWorkspace, writeCatalog } from './fixtures.mjs';

const nflTeam = { hrefNeedles: ['new-england-patriots'], key: 'nfl-17', league: 'nfl' };
const womenTeam = {
  hrefNeedles: ['iowa-state-cyclones'],
  key: 'ncaa-66',
  league: 'ncaa',
  sport: 'womens-basketball',
};

test('the committed defaults reproduce today\'s per-team settings', async () => {
  const defaults = JSON.parse(await readFile(defaultsPath, 'utf8'));
  assert.deepEqual(defaults.timing, {
    backup: { navigationTimeoutSeconds: 30, timeoutSeconds: 120 },
    extractDeadlineSeconds: 600,
    leadMinutes: 15,
    postStartGraceMinutes: { default: 240, mlb: 180 },
    primary: { navigationTimeoutSeconds: 90 },
  });
  assert.deepEqual(defaults.matching.leagues.mlb.leagueHints, ['/mlb/']);
  assert.deepEqual(defaults.matching.leagues.nfl.leagueHints, ['/nfl/']);
  assert.deepEqual(defaults.matching.defaultLeagueHints, ['/stream/']);
  assert.equal(defaults.schemaVersion, 2);
  assert.equal(defaults.github, undefined, 'the repo comes from GITHUB_REPOSITORY');
});

test('the secret merges over the defaults key by key', () => {
  const merged = mergeConfig(
    { matching: { leagues: { nfl: { leagueHints: ['/nfl/'] } } }, timing: { backup: { timeoutSeconds: 120 }, leadMinutes: 15 } },
    { matching: { leagues: { ncaa: { requireOpponent: false } } }, sources: [1], timing: { leadMinutes: 20 } },
  );
  assert.equal(merged.timing.leadMinutes, 20);
  assert.equal(merged.timing.backup.timeoutSeconds, 120);
  assert.deepEqual(merged.matching.leagues.nfl.leagueHints, ['/nfl/']);
  assert.equal(merged.matching.leagues.ncaa.requireOpponent, false);
  assert.deepEqual(merged.sources, [1]);
});

async function problemFor(mutate) {
  return withWorkspace(async ({ catalogDir }) => {
    const secret = secretConfig();
    mutate(secret);
    const merged = mergeConfig(await readDefaults(), secret);
    return configProblem(secret, merged, await loadCatalog(catalogDir));
  });
}

test('a valid config passes', async () => {
  assert.equal(await problemFor(() => {}), undefined);
  assert.equal(
    await problemFor((secret) => {
      secret.matching = {
        leagues: { ncaa: { requireOpponent: false } },
        teams: { 'ncaa-66/womens-basketball': { hrefNeedles: ['a-slug'] } },
      };
      secret.sources[2].matching = { teams: { 'nfl-17': { hrefNeedles: ['new-england'] } } };
      secret.sources[1].timeoutSeconds = 120;
    }),
    undefined,
  );
});

test('the example config has no real host and passes', async () => {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const example = JSON.parse(await readFile(path.join(dir, 'config.example.json'), 'utf8'));
  await withWorkspace(async ({ catalogDir }) => {
    const merged = mergeConfig(await readDefaults(), example);
    assert.equal(configProblem(example, merged, await loadCatalog(catalogDir)), undefined);
    for (const source of example.sources) {
      assert.match(new URL(source.baseUrl).hostname, /\.example\.invalid$/);
    }
  });
});

const INVALID = [
  ['schemaVersion other than 2', (secret) => { secret.schemaVersion = 1; }, /schemaVersion/],
  ['no sources', (secret) => { secret.sources = []; }, /1 to 5 sources/],
  ['six sources', (secret) => { secret.sources = Array.from({ length: 6 }, (_, index) => ({ label: `s${index}`, baseUrl: `https://s${index}.test/` })); }, /1 to 5 sources/],
  ['a repeated origin and path', (secret) => { secret.sources[1].baseUrl = secret.sources[0].baseUrl; }, /source 2 repeats/],
  ['a non-http URL', (secret) => { secret.sources[1].baseUrl = 'ftp://listing-two.test/'; }, /source 2 baseUrl/],
  ['a dotted label', (secret) => { secret.sources[0].label = 'listing.test'; }, /source 1 label/],
  ['a source timeout too small', (secret) => { secret.sources[1].timeoutSeconds = 29; }, /source 2 timeoutSeconds/],
  ['a source timeout too large', (secret) => { secret.sources[1].timeoutSeconds = 301; }, /source 2 timeoutSeconds/],
  ['navigation too small', (secret) => { secret.timing = { primary: { navigationTimeoutSeconds: 14 } }; }, /navigationTimeoutSeconds/],
  ['navigation too large', (secret) => { secret.timing = { backup: { navigationTimeoutSeconds: 121 } }; }, /navigationTimeoutSeconds/],
  ['backup timeout out of range', (secret) => { secret.timing = { backup: { timeoutSeconds: 10 } }; }, /timing\.backup\.timeoutSeconds/],
  ['deadline too small', (secret) => { secret.timing = { extractDeadlineSeconds: 119 }; }, /extractDeadlineSeconds/],
  ['deadline too large', (secret) => { secret.timing = { extractDeadlineSeconds: 661 }; }, /extractDeadlineSeconds/],
  ['lead too small', (secret) => { secret.timing = { leadMinutes: 4 }; }, /leadMinutes/],
  ['lead too large', (secret) => { secret.timing = { leadMinutes: 61 }; }, /leadMinutes/],
  ['grace too small', (secret) => { secret.timing = { postStartGraceMinutes: { default: 59 } }; }, /postStartGraceMinutes/],
  ['grace too large', (secret) => { secret.timing = { postStartGraceMinutes: { nfl: 361 } }; }, /postStartGraceMinutes/],
  ['an unknown team key', (secret) => { secret.matching = { teams: { 'nfl-999': { hrefNeedles: ['x-y'] } } }; }, /matching\.teams entry 1/],
  ['an unknown sport on a team key', (secret) => { secret.matching = { teams: { 'ncaa-66/hockey': { hrefNeedles: ['x-y'] } } }; }, /matching\.teams entry 1/],
  ['an unknown key on a source', (secret) => { secret.sources[1].matching = { teams: { 'nfl-999': { hrefNeedles: ['x-y'] } } }; }, /source 2 matching\.teams entry 1/],
  ['a needle with a dot', (secret) => { secret.matching = { teams: { 'nfl-17': { hrefNeedles: ['listing.test'] } } }; }, /hrefNeedles/],
  ['an empty needle list', (secret) => { secret.matching = { teams: { 'nfl-17': { hrefNeedles: [] } } }; }, /hrefNeedles/],
  ['a text requireOpponent', (secret) => { secret.matching = { leagues: { ncaa: { requireOpponent: 'yes' } } }; }, /requireOpponent/],
];

for (const [name, mutate, pattern] of INVALID) {
  test(`--check-config rule: ${name}`, async () => {
    const problem = await problemFor(mutate);
    assert.match(problem, pattern);
    for (const host of HOSTS) {
      assert.equal(problem.includes(host), false);
    }
  });
}

test('a missing catalog fails the config check', async () => {
  const secret = secretConfig();
  const merged = mergeConfig(await readDefaults(), secret);
  assert.match(configProblem(secret, merged, undefined), /catalog/);
});

test('the secret is read without quoting it and an empty one fails', async () => {
  await withWorkspace(async ({ directory }) => {
    assert.match((await readSecretConfig(undefined)).problem, /not set/);
    assert.match((await readSecretConfig(path.join(directory, 'absent.json'))).problem, /could not be read/);

    const empty = path.join(directory, 'empty.json');
    await writeFile(empty, ' \n');
    assert.match((await readSecretConfig(empty)).problem, /is empty/);

    const broken = path.join(directory, 'broken.json');
    await writeFile(broken, '{"baseUrl": "https://listing-one.test/live",}');
    const { problem } = await readSecretConfig(broken);
    assert.equal(problem, 'Pipeline config is not valid JSON.');
  });
});

test('needle precedence is source key/sport, source key, global key/sport, global key, catalog', () => {
  const source = { number: 1 };
  const config = {
    matching: {
      teams: {
        'ncaa-66': { hrefNeedles: ['global-key'] },
        'ncaa-66/womens-basketball': { hrefNeedles: ['global-sport'] },
      },
    },
    sources: [
      {
        matching: {
          teams: {
            'ncaa-66': { hrefNeedles: ['source-key'] },
            'ncaa-66/womens-basketball': { hrefNeedles: ['source-sport'] },
          },
        },
      },
    ],
  };
  assert.deepEqual(hrefNeedlesFor(config, source, womenTeam), ['source-sport']);
  delete config.sources[0].matching.teams['ncaa-66/womens-basketball'];
  assert.deepEqual(hrefNeedlesFor(config, source, womenTeam), ['source-key']);
  delete config.sources[0].matching.teams['ncaa-66'];
  assert.deepEqual(hrefNeedlesFor(config, source, womenTeam), ['global-sport']);
  delete config.matching.teams['ncaa-66/womens-basketball'];
  assert.deepEqual(hrefNeedlesFor(config, source, womenTeam), ['global-key']);
  delete config.matching.teams['ncaa-66'];
  assert.deepEqual(hrefNeedlesFor(config, source, womenTeam), ['iowa-state-cyclones']);
});

test('a needle rule on one source does not touch another source', () => {
  const config = { sources: [{}, { matching: { teams: { 'nfl-17': { hrefNeedles: ['site-two'] } } } }] };
  assert.deepEqual(hrefNeedlesFor(config, { number: 1 }, nflTeam), ['new-england-patriots']);
  assert.deepEqual(hrefNeedlesFor(config, { number: 2 }, nflTeam), ['site-two']);
});

test('the opponent rule resolves team rules before the league rule and defaults off', () => {
  const source = { number: 1 };
  assert.equal(requireOpponentFor({}, source, womenTeam), false);
  const config = { matching: { leagues: { ncaa: { requireOpponent: true } } }, sources: [{}] };
  assert.equal(requireOpponentFor(config, source, womenTeam), true);
  config.matching.teams = { 'ncaa-66': { requireOpponent: false } };
  assert.equal(requireOpponentFor(config, source, womenTeam), false);
});

test('league hints and grace come from the league, then the default', () => {
  const config = {
    matching: { defaultLeagueHints: ['/stream/'], leagues: { nfl: { leagueHints: ['/nfl/'] } } },
    timing: { postStartGraceMinutes: { default: 240, mlb: 180 } },
  };
  assert.deepEqual(leagueHintsFor(config, nflTeam), ['/nfl/']);
  assert.deepEqual(leagueHintsFor(config, womenTeam), ['/stream/']);
  assert.equal(graceMinutesFor(config, { league: 'mlb' }), 180);
  assert.equal(graceMinutesFor(config, { league: 'nfl' }), 240);
});

test('writeCatalog fixture matches the builder shape the pipeline reads', async () => {
  await withWorkspace(async ({ directory }) => {
    const target = path.join(directory, 'second');
    await writeCatalog(target);
    const leagues = JSON.parse(await readFile(path.join(target, 'leagues.json'), 'utf8'));
    assert.equal(leagues.schemaVersion, 1);
    assert.deepEqual(leagues.leagues.map((row) => row.key), ['mlb', 'nfl', 'ncaa']);
  });
});
