import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOW = readFileSync(path.join(REPO_ROOT, '.github/workflows/team-catalog.yml'), 'utf8').replaceAll('\r\n', '\n');

// The text of one job, from its key under `jobs:` to the next job key.
function job(name) {
  const body = WORKFLOW.slice(WORKFLOW.indexOf('\njobs:\n') + 7);
  const start = body.search(new RegExp(`^  ${name}:$`, 'm'));
  assert.notEqual(start, -1, `job ${name} exists`);
  const rest = body.slice(start + 1);
  const next = rest.search(/^ {2}[a-z-]+:$/m);
  return next === -1 ? rest : rest.slice(0, next);
}

test('the raw probe upload includes the hidden .probe-output directory', () => {
  const probe = job('probe');
  const upload = probe.slice(probe.indexOf('Upload raw bodies'));
  assert.match(upload, /path: scripts\/team-catalog\/\.probe-output/);
  assert.match(upload, /include-hidden-files: true/);
});

test('issue reporting is its own job after probe and build, with only the permissions it needs', () => {
  const report = job('report-issue');
  assert.match(report, /needs: \[probe, build\]/);
  assert.match(report, /!cancelled\(\)/);
  assert.match(report, /needs\.probe\.result != 'skipped'/);
  assert.match(report, /permissions:\n {6}contents: read\n {6}issues: write\n/);
  assert.match(report, /BUILD_RESULT: \$\{\{ needs\.build\.result \}\}/);
  assert.match(report, /PROBE_RESULT: \$\{\{ needs\.probe\.result \}\}/);
  assert.match(report, /continue-on-error: true/);
  assert.match(report, /persist-credentials: false/);
  assert.match(report, /node scripts\/team-catalog\/issue\.mjs/);
});

test('the build job no longer holds issues write or runs issue reporting', () => {
  const build = job('build');
  assert.match(build, /permissions:\n {6}contents: write\n/);
  assert.doesNotMatch(build, /issues: write/);
  assert.doesNotMatch(build, /issue\.mjs/);
});

test('live-commit runs the flag check with the candidate in place, before any commit', () => {
  const commit = job('live-commit');
  assert.match(commit, /actions\/setup-node/);
  const copied = commit.indexOf('cp -R "$source_dir"');
  const checked = commit.indexOf('scripts/team-catalog/board-flags.mjs --adapter "$ADAPTER"');
  const removed = commit.indexOf('rm -rf "$dest"');
  const noticed = commit.indexOf('::notice::');
  const added = commit.indexOf('git add -- "$dest"');
  assert.ok(copied !== -1 && checked !== -1 && removed !== -1 && noticed !== -1 && added !== -1);
  assert.ok(copied < checked && checked < removed && removed < noticed && noticed < added);
  assert.match(commit, /if \[ "\$flag_check" -eq 2 \]/);
});
