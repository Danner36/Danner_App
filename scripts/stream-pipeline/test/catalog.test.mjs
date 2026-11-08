import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { checkRequest, loadCatalog, streamsPathForKey, validationForTeam } from '../lib/catalog.mjs';
import { writeCatalog } from './fixtures.mjs';

const run = promisify(execFile);
const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function withCatalog(body) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'stream-catalog-'));
  try {
    await writeCatalog(directory);
    return await body(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

const REJECTED = [
  ['a missing key', { team: '' }, 'bad_team'],
  ['a key with path characters', { team: '../../etc' }, 'bad_team'],
  ['an uppercase key', { team: 'MLB-5' }, 'bad_team'],
  ['a key with too many digits', { team: 'mlb-123456789' }, 'bad_team'],
  ['a league the catalog has no row for', { team: 'xfl-5' }, 'bad_team'],
  ['a team the catalog does not list', { team: 'nfl-999' }, 'bad_team'],
  ['a school with no sport', { team: 'ncaa-66' }, 'bad_sport'],
  ['a school with a sport it does not offer', { sport: 'hockey', team: 'ncaa-66' }, 'bad_sport'],
  ['a pro team with a sport', { sport: 'football', team: 'nfl-17' }, 'bad_sport'],
  ['an event id with letters', { eventId: '12a', team: 'nfl-17' }, 'bad_event'],
  ['an event id that is too long', { eventId: '1234567890123', team: 'nfl-17' }, 'bad_event'],
];

for (const [name, request, code] of REJECTED) {
  test(`${name} is rejected as ${code}`, async () => {
    await withCatalog(async (directory) => {
      const checked = await checkRequest(request, directory);
      assert.equal(checked.code, code);
      assert.equal(checked.spec, undefined);
      for (const value of Object.values(request)) {
        if (value) {
          assert.equal(checked.message.includes(value), false, 'the message echoes a payload value');
        }
      }
    });
  });
}

test('a catalog that cannot be read rejects every key', async () => {
  const checked = await checkRequest({ team: 'mlb-5' }, path.join(os.tmpdir(), 'no-such-catalog-dir'));
  assert.equal(checked.code, 'bad_team');
  assert.match(checked.message, /could not be read/);
});

test('a pro request resolves to a spec with its streams path and schedule', async () => {
  await withCatalog(async (directory) => {
    const { eventId, spec } = await checkRequest({ eventId: '401', team: 'nfl-17' }, directory);
    assert.equal(eventId, '401');
    assert.equal(spec.streamsPath, 'streams/nfl/17.json');
    assert.equal(spec.adapter, 'nfl');
    assert.equal(spec.schedule.sitePath, 'football/nfl');
    assert.equal(spec.officialDateZone, 'America/New_York');
    assert.equal(spec.sport, undefined);
    assert.deepEqual(validationForTeam(spec), {});
  });
});

test('MLB reads statsapi and defaults its zone to America/New_York', async () => {
  await withCatalog(async (directory) => {
    const { spec } = await checkRequest({ team: 'mlb-5' }, directory);
    assert.equal(spec.schedule.provider, 'mlb-statsapi');
    assert.equal(spec.statsapi.teamId, 114);
    assert.equal(spec.officialDateZone, 'America/New_York');
  });
});

test('a school request resolves to the sport\'s own schedule row', async () => {
  await withCatalog(async (directory) => {
    const { spec } = await checkRequest({ sport: 'womens-basketball', team: 'ncaa-66' }, directory);
    assert.equal(spec.adapter, 'ncaa/womens-basketball');
    assert.equal(spec.schedule.sitePath, 'basketball/womens-college-basketball');
    assert.equal(spec.streamsPath, 'streams/ncaa/66.json');
    assert.deepEqual(validationForTeam(spec).sports, ['football', 'mens-basketball', 'womens-basketball']);
  });
});

test('retired entries and retired sports stay valid', async () => {
  await withCatalog(async (directory) => {
    const { spec } = await checkRequest({ sport: 'football', team: 'ncaa-9001' }, directory);
    assert.equal(spec.key, 'ncaa-9001');
  });
});

test('an entry whose espnId disagrees with its key is refused', async () => {
  await withCatalog(async (directory) => {
    await writeFile(
      path.join(directory, 'teams', 'nfl.json'),
      JSON.stringify({ teams: [{ espnId: '99', key: 'nfl-17', name: 'x' }] }),
    );
    assert.equal((await checkRequest({ team: 'nfl-17' }, directory)).code, 'bad_team');
  });
});

test('loadCatalog holds every league\'s teams', async () => {
  await withCatalog(async (directory) => {
    const catalog = await loadCatalog(directory);
    assert.deepEqual([...catalog.teams.keys()].sort(), ['mlb-5', 'ncaa-66', 'ncaa-9001', 'nfl-17']);
  });
});

test('the streams path comes from the key alone', () => {
  assert.equal(streamsPathForKey('ncaa-66'), 'streams/ncaa/66.json');
});

async function checkRequestCli(env, catalogDir) {
  const merged = { ...process.env, STREAM_CATALOG_DIR: catalogDir, ...env };
  return run(process.execPath, ['run.mjs', '--check-request'], { cwd: packageDir, env: merged });
}

test('--check-request accepts a catalog key and rejects an unknown one with its code', async () => {
  await withCatalog(async (directory) => {
    const accepted = await checkRequestCli({ EVENT_ID: '', TEAM_KEY: 'mlb-5', TEAM_SPORT: '' }, directory);
    assert.match(accepted.stdout, /Request is valid for mlb-5/);

    await assert.rejects(checkRequestCli({ EVENT_ID: '', TEAM_KEY: 'mlb-777', TEAM_SPORT: '' }, directory), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /^bad_team: /);
      assert.equal(error.stdout.includes('mlb-777'), false);
      return true;
    });
    await assert.rejects(checkRequestCli({ EVENT_ID: 'x', TEAM_KEY: 'mlb-5', TEAM_SPORT: '' }, directory), (error) => {
      assert.match(error.stdout, /^bad_event: /);
      return true;
    });
    await assert.rejects(checkRequestCli({ EVENT_ID: '', TEAM_KEY: 'ncaa-66', TEAM_SPORT: 'hockey' }, directory), (error) => {
      assert.match(error.stdout, /^bad_sport: /);
      return true;
    });
  });
});

test('--check-request runs from a clean environment with no secret and no packages', async () => {
  await withCatalog(async (directory) => {
    const nested = path.join(directory, 'empty');
    await mkdir(nested);
    const { stdout } = await run(process.execPath, [path.join(packageDir, 'run.mjs'), '--check-request'], {
      cwd: nested,
      env: { PATH: process.env.PATH, STREAM_CATALOG_DIR: directory, TEAM_KEY: 'nfl-17' },
    });
    assert.match(stdout, /Request is valid/);
  });
});
