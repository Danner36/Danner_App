import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  compareFlags,
  evaluateBoardFlags,
  FLAG_CONTRADICTION_EXIT,
  flagEvidence,
  newestLiveCapture,
  runFlagCheck,
} from '../board-flags.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function writePoll(root, adapterDir, event, pollIndex, poll) {
  const dir = path.join(root, 'tests', 'leagues', adapterDir, 'captures', event);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${String(pollIndex).padStart(3, '0')}.json.gz`), gzipSync(JSON.stringify(poll)));
}

function livePoll(capturedAt, extra = {}) {
  return { capturedAt, header: { competitions: [{ status: { type: { state: 'in' } } }] }, ...extra };
}

test('the committed men\'s capture supports the current flags and the women\'s have none', async () => {
  const report = await evaluateBoardFlags(REPO_ROOT);
  const mens = report['ncaa/mens-basketball'];
  assert.equal(mens.newestCapture, '401909771');
  assert.equal(mens.agrees, true);
  assert.deepEqual(mens.onWithoutEvidence, []);
  for (const flag of ['players', 'rebounds', 'teamFouls', 'bonus', 'lastFoul']) {
    assert.equal(mens.flags[flag], true, `${flag} is on`);
    assert.equal(mens.evidence[flag], true, `${flag} is backed by the capture`);
  }
  assert.equal(mens.flags.timeouts, false);
  assert.equal(mens.flags.activeLineup, false);
  assert.equal(mens.flags.possessionArrow, false);
  const womens = report['ncaa/womens-basketball'];
  assert.equal(womens.newestCapture, null);
  assert.equal(womens.agrees, true);
  assert.ok(Object.values(womens.flags).every((value) => value === false));
});

test('newestLiveCapture takes the latest in-progress poll and ignores pregame and final captures', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'team-catalog-flags-'));
  try {
    writePoll(root, 'ncaa-mens-basketball', '100', 1, livePoll('2026-11-01T00:00:00.000Z'));
    writePoll(root, 'ncaa-mens-basketball', '200', 1, livePoll('2026-11-05T00:00:00.000Z'));
    writePoll(root, 'ncaa-mens-basketball', '300', 1, {
      capturedAt: '2026-11-09T00:00:00.000Z',
      header: { competitions: [{ status: { type: { state: 'post' } } }] },
    });
    assert.equal(newestLiveCapture(root, 'ncaa/mens-basketball').event, '200');
    assert.equal(newestLiveCapture(root, 'ncaa/womens-basketball'), null);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('compareFlags fails a flag that is on without evidence and notes evidence with the flag off', () => {
  const allOff = {
    activeLineup: false,
    bonus: false,
    lastFoul: false,
    players: false,
    possessionArrow: false,
    rebounds: false,
    teamFouls: false,
    timeouts: false,
  };
  const noCapture = compareFlags({ ...allOff, players: true }, allOff, null);
  assert.equal(noCapture.agrees, false);
  assert.deepEqual(noCapture.onWithoutEvidence, ['players']);
  assert.equal(noCapture.newestCapture, null);

  const offWithEvidence = compareFlags(allOff, { ...allOff, players: true, activeLineup: true }, { event: '1', polls: [{}, {}] });
  assert.equal(offWithEvidence.agrees, true);
  assert.deepEqual(offWithEvidence.offWithEvidence, ['players']);
  assert.equal(offWithEvidence.polls, 2);
});

test('the flag check refuses a weak capture for an adapter whose flags are on', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'team-catalog-flags-'));
  try {
    writePoll(root, 'ncaa-mens-basketball', '500', 1, livePoll('2026-11-10T00:00:00.000Z'));
    const lines = [];
    assert.equal(await runFlagCheck({ adapter: 'ncaa/mens-basketball', log: (line) => lines.push(line), root }), FLAG_CONTRADICTION_EXIT);
    assert.equal(FLAG_CONTRADICTION_EXIT, 2);
    assert.match(lines[0], /capture 500 has no evidence for .*players/);

    // Women's flags are all off, so a weak capture contradicts nothing.
    writePoll(root, 'ncaa-womens-basketball', '501', 1, livePoll('2026-11-10T00:00:00.000Z'));
    assert.equal(await runFlagCheck({ adapter: 'ncaa/womens-basketball', log: () => {}, root }), 0);
    // An adapter without board flags has nothing to contradict.
    assert.equal(await runFlagCheck({ adapter: 'nfl', log: () => {}, root }), 0);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('the flag check passes the committed men\'s capture', async () => {
  assert.equal(await runFlagCheck({ adapter: 'ncaa/mens-basketball', log: () => {}, root: REPO_ROOT }), 0);
});

test('flagEvidence with no polls supports nothing', () => {
  const evidence = flagEvidence([], {}, () => assert.fail('no parser call'));
  assert.ok(Object.values(evidence).every((value) => value === false));
});

function boxTeam(id, starters = 5) {
  return {
    statistics: [
      {
        athletes: Array.from({ length: starters }, (_, index) => ({
          active: true,
          athlete: { id: `${id}${index}`, jersey: String(index) },
          starter: true,
        })),
        keys: ['points', 'fouls', 'rebounds'],
      },
    ],
    team: { id },
  };
}

function capturePoll(extra = {}) {
  return {
    boxscore: { players: [boxTeam('1'), boxTeam('2')] },
    format: { regulation: { periods: 2 } },
    header: { competitions: [{ competitors: [{}, {}] }] },
    plays: [
      { team: { id: '1' }, type: { id: '584' } },
      { participants: [{ athlete: { id: '10' } }], team: { id: '1' }, type: { id: '519', text: 'PersonalFoul' } },
    ],
    ...extra,
  };
}

const RULES = { regulationPeriods: 2, teamFoulPlays: { kind: 'typeIds', typeIds: ['519', '521'] } };
const FLOOR_MODEL = {
  away: { lineup: 'floor', players: [], teamId: '1' },
  home: { lineup: 'floor', players: [], teamId: '2' },
};

test('flagEvidence reads the board paths from a capture', () => {
  const evidence = flagEvidence([capturePoll()], RULES, () => FLOOR_MODEL);
  assert.deepEqual(
    { bonus: evidence.bonus, foul: evidence.lastFoul, players: evidence.players, rebounds: evidence.rebounds, team: evidence.teamFouls },
    { bonus: true, foul: true, players: true, rebounds: true, team: true },
  );
  assert.equal(evidence.timeouts, false);
  assert.equal(flagEvidence([capturePoll({ format: { regulation: { periods: 4 } } })], RULES, () => FLOOR_MODEL).bonus, false);

  const noSubs = capturePoll({ plays: [capturePoll().plays[1]] });
  assert.equal(flagEvidence([noSubs], RULES, () => FLOOR_MODEL).players, false, 'needs logged substitutions');

  const noFloor = flagEvidence([capturePoll()], RULES, () => ({ away: { lineup: 'top' }, home: { lineup: 'top' } }));
  assert.equal(noFloor.players, false);

  const noRebounds = capturePoll();
  noRebounds.boxscore.players[0].statistics[0].keys = ['points', 'fouls'];
  assert.equal(flagEvidence([noRebounds], RULES, () => FLOOR_MODEL).rebounds, false);
});

test('flagEvidence treats a nonzero remaining timeout field as timeout evidence', () => {
  const poll = capturePoll();
  poll.header.competitions[0].competitors = [{ timeoutsRemaining: 3 }, {}];
  assert.equal(flagEvidence([poll], RULES, () => FLOOR_MODEL).timeouts, true);
  const zeros = capturePoll({ coreSituation: { body: { homeTimeouts: { timeoutsRemainingCurrent: 0 } } } });
  assert.equal(flagEvidence([zeros], RULES, () => FLOOR_MODEL).timeouts, false);
  const coreLive = capturePoll({ coreSituation: { body: { awayTimeouts: { timeoutsRemainingCurrent: 2 } } } });
  assert.equal(flagEvidence([coreLive], RULES, () => FLOOR_MODEL).timeouts, true);
});

test('flagEvidence for activeLineup compares the parser lineup with active athletes', () => {
  const poll = capturePoll();
  const match = {
    away: { lineup: 'floor', players: ['10', '11', '12', '13', '14'].map((id) => ({ athleteId: id })), teamId: '1' },
    home: { lineup: 'top', players: [], teamId: '2' },
  };
  assert.equal(flagEvidence([poll], RULES, () => match).activeLineup, true);
  const mismatch = {
    away: { lineup: 'floor', players: ['10', '11', '12', '13', '19'].map((id) => ({ athleteId: id })), teamId: '1' },
    home: { lineup: 'top', players: [], teamId: '2' },
  };
  assert.equal(flagEvidence([poll], RULES, () => mismatch).activeLineup, false);
});
