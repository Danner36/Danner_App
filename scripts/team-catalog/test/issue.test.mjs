import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ISSUE_TITLE, issueBody, jobFailed, openIssue, readReport } from '../issue.mjs';

const CLEAN = { adapters: { mlb: { passed: true } } };
const FAILING = {
  adapters: {
    mlb: { networkErrors: [], passed: true, shapeErrors: [] },
    nfl: { networkErrors: ['scoreboard: ETIMEDOUT'], passed: false, shapeErrors: ['teams: missing sports[+]'] },
  },
};

test('issueBody is null when both jobs succeeded and the report is clean', () => {
  assert.equal(issueBody({ buildResult: 'success', probeResult: 'success', report: CLEAN }), null);
});

test('issueBody lists failing adapters with network and shape errors apart', () => {
  const body = issueBody({ report: FAILING, runUrl: 'https://github.com/x/actions/runs/1' });
  assert.match(body, /## nfl/);
  assert.match(body, /- scoreboard: ETIMEDOUT/);
  assert.match(body, /- teams: missing sports\[\+\]/);
  assert.doesNotMatch(body, /## mlb/);
});

test('issueBody reports a failed build, including a failed push or report download', () => {
  const body = issueBody({ buildResult: 'failure', report: CLEAN });
  assert.match(body, /build job ended with result failure/);
  assert.match(body, /commit push/);
  assert.match(body, /report download/);
});

test('issueBody reports a failed or timed-out probe with no report', () => {
  const failed = issueBody({ buildResult: 'skipped', probeResult: 'failure', report: null });
  assert.match(failed, /probe job ended with result failure/);
  assert.match(failed, /probe report could not be read/);
  assert.doesNotMatch(failed, /build job/);
  assert.match(issueBody({ buildResult: 'skipped', probeResult: 'cancelled', report: null }), /result cancelled/);
});

test('issueBody reports an unreadable report even when both jobs succeeded', () => {
  assert.match(issueBody({ report: null }), /probe report could not be read/);
});

test('jobFailed treats only success and skipped as not failed', () => {
  assert.equal(jobFailed('success'), false);
  assert.equal(jobFailed('skipped'), false);
  assert.equal(jobFailed(undefined), false);
  assert.equal(jobFailed('failure'), true);
  assert.equal(jobFailed('cancelled'), true);
});

test('readReport returns null for an absent or corrupt file', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'team-catalog-issue-'));
  try {
    const file = path.join(root, 'report.json');
    assert.equal(readReport(file), null);
    writeFileSync(file, '{not json');
    assert.equal(readReport(file), null);
    writeFileSync(file, '{"adapters":{}}');
    assert.deepEqual(readReport(file), { adapters: {} });
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('openIssue creates one issue and skips when one is open', () => {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    return { status: 0, stdout: args[1] === 'list' ? (calls.length === 1 ? '0\n' : '1\n') : '' };
  };
  assert.equal(openIssue({ body: 'text', gh, log: () => {} }), 0);
  assert.equal(calls[1][1], 'create');
  assert.equal(calls[1][3], ISSUE_TITLE);
  assert.equal(openIssue({ body: 'text', gh, log: () => {} }), 0);
  assert.equal(calls.length, 3);
});

test('openIssue does nothing without a body and reports gh failures', () => {
  assert.equal(openIssue({ body: null, gh: () => assert.fail('no gh call'), log: () => {} }), 0);
  assert.equal(openIssue({ body: 'x', gh: () => ({ status: 1, stdout: '' }), log: () => {} }), 1);
});
