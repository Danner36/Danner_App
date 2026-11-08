import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = path.join(HERE, '..');
const REPO_ROOT = path.join(WORKER_DIR, '..', '..');

function read(...segments) {
  return readFileSync(path.join(...segments), 'utf8').replaceAll('\r\n', '\n');
}

const WRANGLER = read(WORKER_DIR, 'wrangler.toml');
const WORKFLOW = read(REPO_ROOT, '.github', 'workflows', 'worker-deploy.yml');
const PACKAGE = JSON.parse(read(WORKER_DIR, 'package.json'));

function job(name) {
  const body = WORKFLOW.slice(WORKFLOW.indexOf('\njobs:\n') + 7);
  const start = body.search(new RegExp(`^  ${name}:$`, 'm'));
  assert.notEqual(start, -1, `job ${name} exists`);
  const rest = body.slice(start + 1);
  const next = rest.search(/^ {2}[a-z-]+:$/m);
  return next === -1 ? rest : rest.slice(0, next);
}

test('wrangler.toml keeps the frozen name, the entry and the O8 limits', () => {
  assert.match(WRANGLER, /^name = "guardians-get-video"$/m);
  assert.match(WRANGLER, /^main = "src\/index\.js"$/m);
  for (const [name, value] of [
    ['COOLDOWN_SECONDS', 180],
    ['GAME_DISPATCH_MAX', 10],
    ['IP_TEAM_DISPATCH_PER_10_MIN', 3],
    ['IP_DISPATCH_PER_HOUR', 20],
    ['IP_FAILED_KEY_PER_HOUR', 10],
    ['GLOBAL_DISPATCH_PER_HOUR', 60],
    ['GLOBAL_IN_FLIGHT_MAX', 15],
  ]) {
    assert.match(WRANGLER, new RegExp(`^${name} = ${value}$`, 'm'), name);
  }
  assert.match(WRANGLER, /^GITHUB_REPO = "Danner36\/Danner_App"$/m);
});

test('wrangler.toml declares both gate bindings, one migration and the read limiter', () => {
  assert.match(WRANGLER, /name = "TEAM_GATE"\nclass_name = "TeamGate"/);
  assert.match(WRANGLER, /name = "GLOBAL_GATE"\nclass_name = "GlobalGate"/);
  assert.match(WRANGLER, /tag = "v2-gates"\nnew_sqlite_classes = \["TeamGate", "GlobalGate"\]/);
  assert.match(WRANGLER, /\[\[ratelimits\]\]\nname = "READ_LIMITER"\nnamespace_id = "\d+"\nsimple = \{ limit = 120, period = 60 \}/);
});

test('the deploy workflow has no automatic trigger', () => {
  const on = WORKFLOW.slice(WORKFLOW.indexOf('\non:\n'), WORKFLOW.indexOf('\npermissions:'));
  assert.match(on, /workflow_dispatch:/);
  assert.doesNotMatch(on, /\n {2}(push|pull_request|schedule|repository_dispatch|workflow_call|workflow_run):/);
});

test('the deploy workflow takes target, rotate_key and rollback, with staging as the default', () => {
  assert.match(WORKFLOW, /target:\n(?: {8}.*\n)*? {8}options:\n {10}- staging\n {10}- production\n {8}default: staging\n/);
  assert.match(WORKFLOW, /rotate_key:\n(?: {8}.*\n)*? {8}type: boolean\n {8}default: false\n/);
  assert.match(WORKFLOW, /rollback:\n(?: {8}.*\n)*? {8}type: boolean\n {8}default: false\n/);
});

test('the workflow is read-only and every checkout drops credentials', () => {
  assert.match(WORKFLOW, /^permissions:\n {2}contents: read\n/m);
  const checkouts = WORKFLOW.match(/uses: actions\/checkout@v\d+/g);
  const dropped = WORKFLOW.match(/persist-credentials: false/g);
  assert.equal(checkouts.length, dropped.length);
});

test('the deploy pins wrangler to one version and names the Worker on both commands', () => {
  const pinned = WORKFLOW.match(/WRANGLER_VERSION: (\S+)/)[1];
  assert.equal(PACKAGE.devDependencies.wrangler, pinned);
  const deploy = job('deploy');
  assert.match(deploy, /needs: test/);
  assert.match(deploy, /uses: cloudflare\/wrangler-action@v3/);
  assert.match(deploy, /secret bulk \$\{\{ runner\.temp \}\}\/worker-secrets\.json --name \$\{\{ steps\.worker\.outputs\.name \}\}/);
  assert.match(deploy, /deploy --name \$\{\{ steps\.worker\.outputs\.name \}\}/);
  assert.match(deploy, /working-directory: workers\/team-worker\n {8}run: npm ci/);
  assert.match(deploy, /workingDirectory: workers\/team-worker/);
  assert.doesNotMatch(deploy, /^\s+secrets:/m);
});

test('the app key is refused unless its hash matches or rotate_key is set, and is never printed', () => {
  const deploy = job('deploy');
  assert.match(deploy, /if \[ "\$ROTATE_KEY" = 'true' \]/);
  assert.match(deploy, /release\/app-key\.sha256/);
  assert.match(deploy, /printf '%s' "\$APP_KEY" \| sha256sum/);
  assert.doesNotMatch(WORKFLOW, /set -x/);
  assert.doesNotMatch(WORKFLOW, /echo[^\n]*\$\{?APP_KEY/);
  assert.match(deploy, /umask 077/);
  assert.match(deploy, /Remove the Worker secrets file\n {8}if: always\(\)/);
});

test('staging and production map to the two Worker names only', () => {
  for (const name of ['deploy', 'rollback']) {
    const text = job(name);
    assert.match(text, /staging\)\s+echo 'name=guardians-get-video-staging'/);
    assert.match(text, /production\)\s+echo 'name=guardians-get-video'/);
    assert.match(text, /TARGET: \$\{\{ inputs\.target \}\}/);
  }
});

test('only staging deploys with a global cap of 0, and the deploy line uses it', () => {
  const deploy = job('deploy');
  const staging = deploy.slice(deploy.indexOf('staging)'), deploy.indexOf('production)'));
  const production = deploy.slice(deploy.indexOf('production)'), deploy.indexOf('*) echo'));
  assert.match(staging, /deploy_vars=--var GLOBAL_DISPATCH_PER_HOUR:0/);
  assert.match(production, /echo 'deploy_vars=' >>/);
  assert.doesNotMatch(production, /GLOBAL_DISPATCH_PER_HOUR/);
  assert.match(deploy, /deploy --name \$\{\{ steps\.worker\.outputs\.name \}\} \$\{\{ steps\.worker\.outputs\.deploy_vars \}\}/);
  assert.match(WRANGLER, /^GLOBAL_DISPATCH_PER_HOUR = 60$/m);
});

function secretsFor(env) {
  const deploy = job('deploy');
  const start = deploy.indexOf("node -e '") + "node -e '".length;
  const script = deploy.slice(start, deploy.indexOf(`' "$RUNNER_TEMP/worker-secrets.json"`));
  const directory = mkdtempSync(path.join(tmpdir(), 'worker-secrets-'));
  try {
    const file = path.join(directory, 'secrets.json');
    execFileSync(process.execPath, ['-e', script, file], {
      env: {
        APP_KEY: 'new',
        RUN_PROGRESS_KEY: 'p',
        RUN_STATUS_KEY: 's',
        WORKER_GITHUB_PAT: 't',
        ...env,
      },
    });
    return JSON.parse(readFileSync(file, 'utf8'));
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

test('rotate_key with an empty previous key deletes it from the Worker', () => {
  const secrets = secretsFor({ APP_KEY_PREVIOUS: '', ROTATE_KEY: 'true' });
  assert.equal(secrets.APP_KEY_PREVIOUS, null);
  assert.ok(Object.hasOwn(secrets, 'APP_KEY_PREVIOUS'));
  assert.equal(secrets.APP_KEY, 'new');
  assert.equal(secrets.GITHUB_TOKEN, 't');
});

test('rotate_key with a previous key writes it, and a plain deploy leaves it alone', () => {
  assert.equal(secretsFor({ APP_KEY_PREVIOUS: 'old', ROTATE_KEY: 'true' }).APP_KEY_PREVIOUS, 'old');
  for (const value of ['', 'old']) {
    const secrets = secretsFor({ APP_KEY_PREVIOUS: value, ROTATE_KEY: 'false' });
    assert.equal(Object.hasOwn(secrets, 'APP_KEY_PREVIOUS'), false);
  }
});

test('rollback deploys the v1 folder with a deleted_classes migration', () => {
  const rollback = job('rollback');
  assert.match(rollback, /if: \$\{\{ inputs\.rollback \}\}/);
  assert.match(rollback, /deleted_classes = \["TeamGate", "GlobalGate"\]/);
  assert.match(rollback, /tag = "v2-gates"\n {10}new_sqlite_classes = \["TeamGate", "GlobalGate"\]/);
  assert.match(rollback, /workingDirectory: workers\/guardians-get-video/);
  assert.doesNotMatch(rollback, /needs:/);
  assert.match(job('test'), /if: \$\{\{ !inputs\.rollback \}\}/);
  assert.match(job('deploy'), /if: \$\{\{ !inputs\.rollback \}\}/);
});

test('the entry module re-exports both Durable Object classes', () => {
  assert.match(read(WORKER_DIR, 'src', 'index.js'), /export \{ GlobalGate, TeamGate \} from '\.\/durable\.js';/);
});

test('the pure modules never import the Cloudflare runtime module', () => {
  for (const file of ['app.js', 'catalog.js', 'events.js', 'gates.js', 'github.js', 'streams.js']) {
    assert.doesNotMatch(read(WORKER_DIR, 'src', file), /cloudflare:workers/, file);
  }
});
