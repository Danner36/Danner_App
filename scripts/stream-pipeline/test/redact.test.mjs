import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  addMaskCommand,
  createRedactor,
  githubMaskEmitter,
  hostsOf,
  maskValuesForUrl,
  redactHosts,
} from '../lib/redact.mjs';
import { formatRunSummary, runSources } from '../lib/sources.mjs';
import { HOSTS, secretConfig, withWorkspace } from './fixtures.mjs';

const run = promisify(execFile);
const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('maskValuesForUrl covers the value as typed, its URL, origin and host', () => {
  assert.deepEqual(maskValuesForUrl(' https://Listing-One.test/live?a=1 '), [
    'https://Listing-One.test/live?a=1',
    'https://listing-one.test/live?a=1',
    'https://listing-one.test',
    'listing-one.test',
  ]);
});

test('maskValuesForUrl adds the host without www and accepts a missing scheme', () => {
  assert.ok(maskValuesForUrl('https://www.listing-one.test/').includes('listing-one.test'));
  assert.deepEqual(maskValuesForUrl('listing-one.test/live'), ['listing-one.test/live', 'listing-one.test']);
  assert.deepEqual(maskValuesForUrl(''), []);
  assert.deepEqual(maskValuesForUrl(undefined), []);
});

test('hostsOf ignores values with no host', () => {
  assert.deepEqual(hostsOf(undefined), []);
  assert.deepEqual(hostsOf('https://'), []);
});

test('addMaskCommand escapes the sequences the runner decodes', () => {
  assert.equal(addMaskCommand('https://a.test/x%0Ay'), '::add-mask::https://a.test/x%250Ay');
  assert.equal(addMaskCommand('a\r\nb'), '::add-mask::a%0D%0Ab');
});

test('masking is on only under GitHub Actions', () => {
  assert.equal(githubMaskEmitter({ env: {} }), undefined);
  assert.equal(githubMaskEmitter({ env: { GITHUB_ACTIONS: 'false' } }), undefined);
  const write = () => {};
  assert.equal(githubMaskEmitter({ env: { GITHUB_ACTIONS: 'true' }, write }), write);
});

test('the redactor emits each mask once and before the host can be printed', () => {
  const lines = [];
  const redactor = createRedactor({ emit: (line) => lines.push(line) });
  redactor.add('https://listing-one.test/live');
  redactor.add('https://listing-one.test/live');
  assert.equal(lines.filter((line) => line === '::add-mask::listing-one.test').length, 1);
  assert.equal(redactor.text('Failed at https://listing-one.test/live'), 'Failed at https://[listing]/live');
});

test('redaction replaces every host regardless of case and takes the longest first', () => {
  const text = 'www.listing-one.test LISTING-ONE.TEST listing-one.test/x';
  assert.equal(
    redactHosts(text, new Set(['listing-one.test', 'www.listing-one.test'])),
    '[listing] [listing] [listing]/x',
  );
});

test('a captured fake run log never contains the three fake hosts', async () => {
  const log = [];
  const redactor = createRedactor({ emit: (line) => log.push(`MASK ${line}`) });
  const sources = HOSTS.map((host, index) => ({
    baseUrl: `https://${host}/live`,
    label: index === 0 ? 'primary' : `backup-${index}`,
    number: index + 1,
  }));
  for (const source of sources) {
    redactor.add(source.baseUrl);
  }

  const printed = [];
  const print = (line) => printed.push(redactor.text(line));
  const result = await runSources({
    attemptSource: async ({ source }) => {
      if (source.number === 1) {
        throw new Error(`page.goto: net::ERR_FAILED at https://${HOSTS[0]}/live\nCall log:\n - ${HOSTS[1]}`);
      }
      if (source.number === 2) {
        print(`Redirected through https://${HOSTS[2]}/game`);
        return { code: 'http_5xx' };
      }
      return { entry: { url: 'https://player.test/embed/1' } };
    },
    launchBrowser: async () => ({ close: async () => {} }),
    log: print,
    newContext: async () => ({ close: async () => {} }),
    redact: redactor.text,
    sources,
  });
  print(formatRunSummary({ moduleName: 'nfl-17', redact: redactor.text, result: { listing: result, outcome: 'dry_run' } }));

  const output = printed.join('\n');
  for (const host of HOSTS) {
    assert.equal(output.includes(host), false, 'a host reached the printed log');
    assert.ok(log.includes(`MASK ::add-mask::${host}`));
  }
  assert.match(output, /Trying source 2\/3 \(backup-1\)\./);
  assert.match(output, /Source 1\/3 \(primary\): nav_error at listing/);
  assert.match(output, /nfl-17 \| dry_run from source 3 of 3/);
});

async function withRunnerDirs(body) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'stream-pipeline-runner-'));
  try {
    const githubEnv = path.join(directory, 'github-env');
    await writeFile(githubEnv, '');
    return await body({ directory, githubEnv });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function runnerEnv({ directory, githubEnv }, overrides) {
  const env = { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_ENV: githubEnv, RUNNER_TEMP: directory, ...overrides };
  delete env.STREAM_PIPELINE_CONFIG_PATH;
  delete env.SOURCE_ONLY;
  return env;
}

function writeConfig(env) {
  return run(process.execPath, ['run.mjs', '--write-config'], { cwd: packageDir, env });
}

test('the write step masks every source host before printing anything else', async () => {
  await withRunnerDirs(async (dirs) => {
    const secret = JSON.stringify(secretConfig());
    const { stdout } = await writeConfig(runnerEnv(dirs, { STREAM_PIPELINE_CONFIG: secret }));
    const lines = stdout.trim().split('\n');
    const firstOther = lines.findIndex((line) => !line.startsWith('::add-mask::'));
    assert.equal(firstOther, lines.length - 1, 'output came before the last mask');
    for (const host of HOSTS) {
      assert.ok(lines.includes(`::add-mask::${host}`));
      assert.ok(lines.includes(`::add-mask::https://${host}`));
      assert.ok(lines.includes(`::add-mask::https://${host}/live`));
      assert.equal(lines[lines.length - 1].includes(host), false);
    }

    const filePath = path.join(dirs.directory, 'stream-pipeline-config.json');
    assert.equal(await readFile(filePath, 'utf8'), secret);
    assert.equal(await readFile(dirs.githubEnv, 'utf8'), `STREAM_PIPELINE_CONFIG_PATH=${filePath}\n`);
    if (process.platform !== 'win32') {
      assert.equal((await stat(filePath)).mode & 0o777, 0o600);
    }
  });
});

for (const [name, value] of [['empty', ''], ['whitespace', ' \n '], ['unset', undefined]]) {
  test(`an ${name} secret fails the step, writes nothing and leaves a config_invalid candidate`, async () => {
    await withRunnerDirs(async (dirs) => {
      const env = runnerEnv(dirs, { STREAM_PIPELINE_CONFIG: value, TEAM_KEY: 'nfl-17' });
      if (value === undefined) {
        delete env.STREAM_PIPELINE_CONFIG;
      }
      await assert.rejects(writeConfig(env), (error) => {
        assert.equal(error.code, 1);
        assert.equal(error.stdout.includes('::add-mask::'), false);
        return true;
      });
      assert.equal(await readFile(dirs.githubEnv, 'utf8'), '');
      await assert.rejects(stat(path.join(dirs.directory, 'stream-pipeline-config.json')));
      const candidate = JSON.parse(await readFile(path.join(dirs.directory, 'stream-pipeline', 'candidate.json'), 'utf8'));
      assert.equal(candidate.outcome, 'config_invalid');
    });
  });
}

test('an unparseable secret fails the step without echoing it', async () => {
  await withRunnerDirs(async (dirs) => {
    const env = runnerEnv(dirs, { STREAM_PIPELINE_CONFIG: '{"baseUrl": "https://listing-one.test/live",}' });
    await assert.rejects(writeConfig(env), (error) => {
      assert.equal(error.code, 1);
      assert.equal(`${error.stdout}${error.stderr}`.includes('listing-one'), false);
      return true;
    });
    assert.equal(await readFile(dirs.githubEnv, 'utf8'), '');
  });
});

test('a misshapen secret still masks what it can before the check rejects it', async () => {
  await withRunnerDirs(async (dirs) => {
    const secret = JSON.stringify({ schemaVersion: 1, sources: [{ label: 'x.y', baseUrl: 'listing-one.test/live' }] });
    const { stdout } = await writeConfig(runnerEnv(dirs, { STREAM_PIPELINE_CONFIG: secret }));
    assert.ok(stdout.includes('::add-mask::listing-one.test\n'));
  });
});

test('--check-config masks first, reports no value and leaves a candidate on failure', async () => {
  await withRunnerDirs(async (dirs) => {
    await withWorkspace(async ({ catalogDir, configPath }) => {
      const env = runnerEnv(dirs, { STREAM_CATALOG_DIR: catalogDir, STREAM_PIPELINE_CONFIG_PATH: configPath, TEAM_KEY: 'nfl-17' });
      env.STREAM_PIPELINE_CONFIG_PATH = configPath;
      await assert.rejects(
        run(process.execPath, ['run.mjs', '--check-config'], { cwd: packageDir, env }),
        (error) => {
          assert.equal(error.code, 1);
          const lines = error.stdout.trim().split('\n');
          const firstOther = lines.findIndex((line) => !line.startsWith('::add-mask::'));
          assert.equal(firstOther, lines.length - 1);
          assert.match(lines.at(-1), /^config_invalid: Listing sources config source 1 label/);
          assert.equal(lines.at(-1).includes('listing-one'), false);
          return true;
        },
      );
      const candidate = JSON.parse(await readFile(path.join(dirs.directory, 'stream-pipeline', 'candidate.json'), 'utf8'));
      assert.equal(candidate.outcome, 'config_invalid');
    }, { schemaVersion: 2, sources: [{ label: 'dotted.label', baseUrl: 'https://listing-one.test/live' }] });
  });
});

test('--check-config accepts a valid secret', async () => {
  await withRunnerDirs(async (dirs) => {
    await withWorkspace(async ({ catalogDir, configPath }) => {
      const env = runnerEnv(dirs, { STREAM_CATALOG_DIR: catalogDir });
      env.STREAM_PIPELINE_CONFIG_PATH = configPath;
      const { stdout } = await run(process.execPath, ['run.mjs', '--check-config'], { cwd: packageDir, env });
      assert.match(stdout, /Pipeline config is valid: 3 listing sources\./);
    });
  });
});

test('the run reads no default config: without a path it fails', async () => {
  await withRunnerDirs(async (dirs) => {
    await withWorkspace(async ({ catalogDir }) => {
      const env = runnerEnv(dirs, { STREAM_CATALOG_DIR: catalogDir });
      await assert.rejects(run(process.execPath, ['run.mjs', '--check-config'], { cwd: packageDir, env }), (error) => {
        assert.match(error.stdout, /config_invalid: Pipeline config is not set/);
        return true;
      });
    });
  });
});
