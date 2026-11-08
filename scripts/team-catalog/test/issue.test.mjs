import assert from 'node:assert/strict';
import test from 'node:test';
import { ISSUE_TITLE, issueBody, openIssue } from '../issue.mjs';

const FAILING = {
  adapters: {
    mlb: { networkErrors: [], passed: true, shapeErrors: [] },
    nfl: { networkErrors: ['scoreboard: ETIMEDOUT'], passed: false, shapeErrors: ['teams: missing sports[+]'] },
  },
};

test('issueBody is null when the probe and build are clean', () => {
  assert.equal(issueBody({ buildOutcome: 'success', report: { adapters: { mlb: { passed: true } } } }), null);
  assert.equal(issueBody({ report: null }), null);
});

test('issueBody lists failing adapters with network and shape errors apart', () => {
  const body = issueBody({ report: FAILING, runUrl: 'https://github.com/x/actions/runs/1' });
  assert.match(body, /## nfl/);
  assert.match(body, /- scoreboard: ETIMEDOUT/);
  assert.match(body, /- teams: missing sports\[\+\]/);
  assert.doesNotMatch(body, /## mlb/);
});

test('issueBody reports a failed build even with a clean probe', () => {
  const body = issueBody({ buildOutcome: 'failure', report: { adapters: {} } });
  assert.match(body, /build or validate step failed/);
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
