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
} from './lib/redact.mjs';
import { formatRunSummary, runSources } from './lib/sources.mjs';

const run = promisify(execFile);
const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDir, '../..');
const HOSTS = ['listing-one.test', 'listing-two.test', 'listing-three.test'];

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
  print(formatRunSummary({ moduleName: 'patriots', redact: redactor.text, result: { listing: result, outcome: 'dry_run' } }));

  const output = printed.join('\n');
  for (const host of HOSTS) {
    assert.equal(output.includes(host), false, 'a host reached the printed log');
    assert.ok(log.includes(`MASK ::add-mask::${host}`));
  }
  assert.match(output, /Trying source 2\/3 \(backup-1\)\./);
  assert.match(output, /Source 1\/3 \(primary\): nav_error at listing/);
  assert.match(output, /dry_run from source 3 of 3/);
});

async function withRunnerDirs(body) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pipeline-sources-'));
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

function writeSourcesConfig(env) {
  return run(process.execPath, ['run.mjs', '--write-sources-config'], { cwd: packageDir, env });
}

test('the write step masks every source host before printing anything else', async () => {
  await withRunnerDirs(async (dirs) => {
    const secret = JSON.stringify({
      schemaVersion: 2,
      sources: HOSTS.map((host, index) => ({ label: `s${index}`, baseUrl: `https://${host}/live` })),
    });
    const { stdout } = await writeSourcesConfig(runnerEnv(dirs, { STREAM_PIPELINE_CONFIG: secret }));
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
  test(`an ${name} secret writes nothing and sets no path`, async () => {
    await withRunnerDirs(async (dirs) => {
      const env = runnerEnv(dirs, { STREAM_PIPELINE_CONFIG: value });
      if (value === undefined) {
        delete env.STREAM_PIPELINE_CONFIG;
      }
      const { stdout } = await writeSourcesConfig(env);
      assert.equal(stdout.includes('::add-mask::'), false);
      assert.equal(await readFile(dirs.githubEnv, 'utf8'), '');
      await assert.rejects(stat(path.join(dirs.directory, 'stream-pipeline-config.json')));
    });
  });
}

test('an unparseable secret fails the step without echoing it', async () => {
  await withRunnerDirs(async (dirs) => {
    const env = runnerEnv(dirs, { STREAM_PIPELINE_CONFIG: '{"baseUrl": "https://listing-one.test/live",}' });
    await assert.rejects(writeSourcesConfig(env), (error) => {
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
    const { stdout } = await writeSourcesConfig(runnerEnv(dirs, { STREAM_PIPELINE_CONFIG: secret }));
    assert.ok(stdout.includes('::add-mask::listing-one.test\n'));
  });
});

const WORKFLOWS = ['guardians', 'patriots', 'cyclones'];

// A Windows checkout may hold CRLF endings.
async function readWorkflow(team) {
  const text = await readFile(path.join(repoRoot, `.github/workflows/${team}-stream-pipeline.yml`), 'utf8');
  return text.replace(/\r\n/g, '\n');
}

function stepNames(text) {
  return [...text.matchAll(/^ {6}- name: (.+)$/gm)].map((match) => match[1]);
}

function stepBlock(text, name) {
  const start = text.indexOf(`      - name: ${name}\n`);
  assert.notEqual(start, -1);
  const next = text.indexOf('\n      - name: ', start + 1);
  return next === -1 ? text.slice(start) : text.slice(start, next);
}

for (const team of WORKFLOWS) {
  test(`${team} workflow masks listing hosts before any step that can print one`, async () => {
    const text = await readWorkflow(team);
    const names = stepNames(text);
    assert.deepEqual(names.slice(0, 3), ['Check out source', 'Set up Node', 'Write listing sources']);
    for (const name of ['Check out source', 'Set up Node']) {
      assert.equal(stepBlock(text, name).includes('secrets.'), false);
    }

    const block = stepBlock(text, 'Write listing sources');
    assert.match(block, /STREAM_PIPELINE_CONFIG: \$\{\{ secrets\.STREAM_PIPELINE_CONFIG \}\}/);
    assert.match(block, /run: node run\.mjs --write-sources-config/);
    assert.equal(text.match(/secrets\.STREAM_PIPELINE_CONFIG/g).length, 1, 'the secret reached another step');
  });

  test(`${team} workflow takes the source input only on a manual run`, async () => {
    const text = await readWorkflow(team);
    assert.match(text, /\n      source:\n        description: [^\n]+\n        required: false\n        type: string\n/);
    const expected = "SOURCE_ONLY: ${{ github.event_name == 'workflow_dispatch' && inputs.source || '' }}";
    assert.ok(stepBlock(text, 'Check pipeline config').includes(expected));
    assert.ok(stepBlock(text, 'Run pipeline').includes(expected));
    assert.equal(text.match(/inputs\.source/g).length, 2);
  });
}
