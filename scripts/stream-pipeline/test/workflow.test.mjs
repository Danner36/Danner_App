import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOW = readFileSync(path.join(REPO_ROOT, '.github/workflows/stream-pipeline.yml'), 'utf8').replaceAll('\r\n', '\n');
const HEADER = WORKFLOW.slice(0, WORKFLOW.indexOf('\njobs:\n'));

// The text of one job, from its key under `jobs:` to the next job key.
function job(name) {
  const body = WORKFLOW.slice(WORKFLOW.indexOf('\njobs:\n') + 7);
  const start = body.search(new RegExp(`^  ${name}:$`, 'm'));
  assert.notEqual(start, -1, `job ${name} exists`);
  const rest = body.slice(start + 1);
  const next = rest.search(/^ {2}[a-z-]+:$/m);
  return next === -1 ? rest : rest.slice(0, next);
}

function stepNames(jobText) {
  return [...jobText.matchAll(/^ {6}- name: (.+)$/gm)].map((match) => match[1]);
}

function step(jobText, name) {
  const start = jobText.indexOf(`      - name: ${name}\n`);
  assert.notEqual(start, -1, `step ${name} exists`);
  const next = jobText.indexOf('\n      - name: ', start + 1);
  return next === -1 ? jobText.slice(start) : jobText.slice(start, next);
}

function runBlocks(jobText) {
  return [...jobText.matchAll(/^ {8}run: (\|\n(?: {10}.*\n?)+|.*)$/gm)].map((match) => match[1]);
}

test('the workflow runs only on team-get-video and manual dispatch', () => {
  assert.match(HEADER, /repository_dispatch:\n {4}types: \[team-get-video\]/);
  assert.match(HEADER, /workflow_dispatch:/);
  assert.doesNotMatch(HEADER, /\n {2}schedule:/);
  assert.doesNotMatch(HEADER, /\n {2}push:/);
  assert.doesNotMatch(HEADER, /\n {2}pull_request/);
  const types = [...HEADER.matchAll(/types: \[(.+)\]/g)].map((match) => match[1]);
  assert.deepEqual(types, ['team-get-video']);
});

test('the manual inputs are the plan\'s six', () => {
  const inputs = HEADER.slice(HEADER.indexOf('inputs:'));
  for (const name of ['team', 'sport', 'event', 'dry_run', 'force', 'source']) {
    assert.match(inputs, new RegExp(`\\n {6}${name}:\\n`));
  }
  assert.match(inputs, /\n {6}team:\n {8}description: [^\n]+\n {8}required: true/);
});

test('the default token is read-only and each team and sport has its own group', () => {
  assert.match(HEADER, /\npermissions:\n {2}contents: read\n/);
  assert.match(
    HEADER,
    /group: stream-pipeline-\$\{\{ github\.event\.client_payload\.team \|\| inputs\.team \}\}-\$\{\{ github\.event\.client_payload\.sport \|\| inputs\.sport \|\| 'all' \}\}/,
  );
  assert.match(HEADER, /cancel-in-progress: false/);
});

test('the extract job has a read-only token and no stored credentials', () => {
  const extract = job('extract');
  assert.match(extract, /\n {4}permissions:\n {6}contents: read\n/);
  assert.doesNotMatch(extract, /: write/);
  assert.match(extract, /uses: actions\/checkout@v5\n {8}with:\n {10}persist-credentials: false/);
  assert.match(extract, /timeout-minutes: 15/);
  assert.equal(extract.match(/actions\/checkout/g).length, 1, 'a second checkout would need its own flag');
  assert.doesNotMatch(extract, /secrets\.GITHUB_TOKEN/);
  assert.doesNotMatch(extract, /RUN_STATUS_KEY/, 'the result key stays out of the job that opens pages');
  assert.doesNotMatch(extract, /WORKER_GITHUB_PAT/);
});

test('the extract job checks the request first, then masks, then installs and opens pages', () => {
  const names = stepNames(job('extract'));
  assert.deepEqual(names.slice(0, 5), [
    'Check out source',
    'Set up Node',
    'Check request',
    'Write pipeline config',
    'Check pipeline config',
  ]);
  for (const later of ['Install pipeline packages', 'Install xvfb', 'Run pipeline']) {
    assert.ok(names.indexOf(later) > names.indexOf('Write pipeline config'), later);
  }
  assert.ok(names.indexOf('Run pipeline') > names.indexOf('Check pipeline config'));
});

test('nothing before the mask step holds the secret, and only that step ever does', () => {
  const extract = job('extract');
  for (const name of ['Check out source', 'Set up Node', 'Check request']) {
    assert.equal(step(extract, name).includes('secrets.'), false, name);
  }
  const write = step(extract, 'Write pipeline config');
  assert.match(write, /STREAM_PIPELINE_CONFIG: \$\{\{ secrets\.STREAM_PIPELINE_CONFIG \}\}/);
  assert.match(write, /umask 077\n/);
  assert.match(write, /node scripts\/stream-pipeline\/run\.mjs --write-config/);
  assert.equal(WORKFLOW.match(/secrets\.STREAM_PIPELINE_CONFIG/g).length, 1, 'the secret reached another step');
  assert.match(step(extract, 'Check request'), /run: node scripts\/stream-pipeline\/run\.mjs --check-request/);
});

test('the pipeline step runs headed under xvfb with the read-only token and the progress key', () => {
  const run = step(job('extract'), 'Run pipeline');
  assert.match(run, /xvfb-run -a node scripts\/stream-pipeline\/run\.mjs/);
  assert.match(run, /EXTRACT_HEADED: '1'/);
  assert.match(run, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(run, /RUN_PROGRESS_KEY: \$\{\{ secrets\.RUN_PROGRESS_KEY \}\}/);
  assert.equal(job('extract').match(/secrets\.RUN_PROGRESS_KEY/g).length, 1);
});

test('the candidate is uploaded even when the run failed, and no trace or screenshot is', () => {
  const extract = job('extract');
  const upload = step(extract, 'Upload candidate');
  assert.match(upload, /if: always\(\)/);
  assert.match(upload, /name: candidate-\$\{\{ github\.run_id \}\}/);
  assert.match(upload, /candidate\.json/);
  assert.doesNotMatch(WORKFLOW, /trace|screenshot|\.png/i);
});

test('the publish job has a write token, no stored credentials and a sparse checkout', () => {
  const publish = job('publish');
  assert.match(publish, /\n {4}needs: extract\n/);
  assert.match(publish, /\n {4}if: always\(\)\n/);
  assert.match(publish, /timeout-minutes: 15/);
  assert.match(publish, /\n {4}permissions:\n {6}contents: write\n/);
  const checkout = step(publish, 'Check out the pipeline and catalog');
  assert.match(checkout, /persist-credentials: false/);
  assert.match(checkout, /sparse-checkout: \|\n {12}scripts\/stream-pipeline\n {12}catalog\n?/);
  assert.equal(publish.match(/actions\/checkout/g).length, 1);
});

test('the publish job has no browser and installs nothing', () => {
  const publish = job('publish');
  assert.doesNotMatch(publish, /playwright|xvfb|chromium|npm ci|npx |apt-get|actions\/cache|EXTRACT_HEADED|cache: npm/i);
  assert.doesNotMatch(publish, /run\.mjs/);
  assert.doesNotMatch(publish, /STREAM_PIPELINE_CONFIG/, 'the listing sites never reach the write job');
  assert.doesNotMatch(publish, /RUN_PROGRESS_KEY/);
});

test('publish re-validates through publish.mjs, which alone holds the write token and result key', () => {
  const publish = job('publish');
  const run = step(publish, 'Publish and report');
  assert.match(run, /run: node scripts\/stream-pipeline\/publish\.mjs/);
  assert.match(run, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(run, /RUN_STATUS_KEY: \$\{\{ secrets\.RUN_STATUS_KEY \}\}/);
  assert.equal(publish.match(/github\.token/g).length, 1);
  assert.match(step(publish, 'Download candidate'), /continue-on-error: true/);
  const upload = step(publish, 'Upload run result');
  assert.match(upload, /name: pipeline-result\.json/);
  assert.match(upload, /retention-days: 7/);
});

test('payload values and inputs reach the shell only through env', () => {
  for (const jobName of ['extract', 'publish']) {
    const text = job(jobName);
    assert.match(text, /TEAM_KEY: \$\{\{ github\.event\.client_payload\.team \|\| inputs\.team \}\}/);
    assert.match(text, /TEAM_SPORT: \$\{\{ github\.event\.client_payload\.sport \|\| inputs\.sport \}\}/);
    assert.match(text, /EVENT_ID: \$\{\{ github\.event\.client_payload\.eventId \|\| inputs\.event \}\}/);
    for (const block of runBlocks(text)) {
      assert.doesNotMatch(block, /\$\{\{/, `an expression in a run block: ${block}`);
    }
  }
});

test('DRY_RUN, FORCE and SOURCE_ONLY come from manual inputs only', () => {
  const extract = job('extract');
  assert.match(extract, /DRY_RUN: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.dry_run && '1' \|\| '0' \}\}/);
  assert.match(extract, /FORCE: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.force && '1' \|\| '0' \}\}/);
  assert.match(extract, /SOURCE_ONLY: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.source \|\| '' \}\}/);
  assert.doesNotMatch(WORKFLOW, /client_payload\.(dry_run|force|source)/);
});

test('the workflow sets no TZ and never names the old root files or package', () => {
  assert.doesNotMatch(WORKFLOW, /\bTZ:/);
  assert.doesNotMatch(WORKFLOW, /_streams\.json|guardians-stream-pipeline/);
  assert.doesNotMatch(WORKFLOW, /https?:\/\//);
});

test('the package never names a root streams file as a write target', () => {
  for (const file of ['lib/pipeline.mjs', 'lib/publishRun.mjs', 'run.mjs', 'publish.mjs']) {
    const text = readFileSync(path.join(REPO_ROOT, 'scripts/stream-pipeline', file), 'utf8');
    assert.doesNotMatch(text, /(guardians|patriots|cyclones)_streams\.json/, file);
  }
});

test('the local config, packages and captures are git-ignored', () => {
  const ignore = readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8').replaceAll('\r\n', '\n');
  for (const entry of [
    'scripts/stream-pipeline/config.json',
    'scripts/stream-pipeline/node_modules/',
    'scripts/stream-pipeline/.probe-output/',
    'scripts/team-catalog/.probe-output/',
  ]) {
    assert.ok(ignore.split('\n').includes(entry), entry);
  }
});

test('the three Phase 1 modules are carried over byte for byte', () => {
  for (const file of ['lib/sources.mjs', 'lib/redact.mjs', 'lib/extract/providers.mjs']) {
    const carried = readFileSync(path.join(REPO_ROOT, 'scripts/stream-pipeline', file));
    const original = readFileSync(path.join(REPO_ROOT, 'scripts/guardians-stream-pipeline', file));
    assert.ok(carried.equals(original), file);
  }
});
