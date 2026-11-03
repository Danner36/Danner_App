import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import {
  adapterDirName,
  adaptersFor,
  basketballSeasonYear,
  buildReport,
  captureDir,
  capturedEvents,
  clampMinutes,
  collectKeys,
  emptyKeySets,
  matchingFields,
  phaseFromDetail,
  pickEvent,
  pollMeta,
  pollStats,
  runCapture,
  runFind,
  scheduleUrl,
  selectPolls,
  situationUrl,
  summaryUrl,
  trimSummary,
  validEventId,
} from './capture.mjs';

function scheduleEvent(id, state) {
  return { competitions: [{ status: { type: { state } } }], id };
}

const SCHEDULE = {
  events: [
    scheduleEvent('401800001', 'post'),
    scheduleEvent('401800002', 'in'),
    scheduleEvent('401800003', 'pre'),
  ],
};

test('season year follows the basketball rule in America/Chicago', () => {
  assert.equal(basketballSeasonYear(new Date('2026-11-03T18:00:00Z')), 2027);
  assert.equal(basketballSeasonYear(new Date('2027-03-20T18:00:00Z')), 2027);
  assert.equal(basketballSeasonYear(new Date('2026-06-30T18:00:00Z')), 2026);
  // 03:00 UTC on July 1 is still June 30 in Chicago.
  assert.equal(basketballSeasonYear(new Date('2026-07-01T03:00:00Z')), 2026);
  assert.equal(basketballSeasonYear(new Date('2026-07-01T06:00:00Z')), 2027);
  // 03:00 UTC on January 1 is still December 31 in Chicago.
  assert.equal(basketballSeasonYear(new Date('2027-01-01T03:00:00Z')), 2027);
  assert.equal(basketballSeasonYear(new Date('2027-01-01T07:00:00Z')), 2027);
});

test('adapter keys map to dashed directory names and ESPN leagues', () => {
  assert.equal(adapterDirName('ncaa/mens-basketball'), 'ncaa-mens-basketball');
  assert.equal(adapterDirName('ncaa/womens-basketball'), 'ncaa-womens-basketball');
  assert.deepEqual(adaptersFor('auto'), ['ncaa/mens-basketball', 'ncaa/womens-basketball']);
  assert.deepEqual(adaptersFor('ncaa/womens-basketball'), ['ncaa/womens-basketball']);
  assert.deepEqual(adaptersFor('nba'), []);
  assert.deepEqual(adaptersFor('toString'), []);
  assert.equal(
    captureDir('/repo', 'ncaa/mens-basketball', '401800002'),
    path.join('/repo', 'tests', 'leagues', 'ncaa-mens-basketball', 'captures', '401800002'),
  );
  assert.equal(
    scheduleUrl('ncaa/womens-basketball', 2027),
    'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/teams/66/schedule?season=2027',
  );
  assert.equal(
    summaryUrl('ncaa/mens-basketball', '401800002'),
    'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=401800002',
  );
  assert.equal(
    situationUrl('ncaa/mens-basketball', '401800002'),
    'https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/events/401800002/competitions/401800002/situation',
  );
});

test('EVENT accepts 1 to 12 digits only', () => {
  assert.equal(validEventId('401800002'), true);
  assert.equal(validEventId('1'), true);
  assert.equal(validEventId('123456789012'), true);
  assert.equal(validEventId('1234567890123'), false);
  assert.equal(validEventId(''), false);
  assert.equal(validEventId(' 401800002'), false);
  assert.equal(validEventId('401800002\n'), false);
  assert.equal(validEventId('40180;ls'), false);
  assert.equal(validEventId('4e5'), false);
  assert.equal(validEventId(401800002), false);
  assert.equal(validEventId(undefined), false);
});

test('MAX_MINUTES defaults to 180 and stays within 10 to 240', () => {
  assert.equal(clampMinutes(undefined), 180);
  assert.equal(clampMinutes(''), 180);
  assert.equal(clampMinutes('abc'), 180);
  assert.equal(clampMinutes('5'), 10);
  assert.equal(clampMinutes('90'), 90);
  assert.equal(clampMinutes('1000'), 240);
});

test('event pick takes the in-progress event, a dispatched event, and skips captured ones', () => {
  assert.equal(pickEvent(SCHEDULE), '401800002');
  assert.equal(pickEvent(SCHEDULE, { captured: new Set(['401800002']) }), '');
  assert.equal(pickEvent({ events: [scheduleEvent('401800003', 'pre')] }), '');
  assert.equal(pickEvent({}), '');
  assert.equal(pickEvent(null), '');
  assert.equal(pickEvent(SCHEDULE, { event: '401800003' }), '401800003');
  assert.equal(pickEvent(SCHEDULE, { event: '401800001' }), '401800001');
  assert.equal(pickEvent(SCHEDULE, { event: '401899999' }), '');
  assert.equal(
    pickEvent(SCHEDULE, { captured: new Set(['401800003']), event: '401800003' }),
    '',
  );
  assert.equal(pickEvent({ events: [{ ...scheduleEvent(401800004, 'in') }] }), '401800004');
  assert.equal(
    pickEvent({ events: [scheduleEvent('x1', 'in'), scheduleEvent('401800005', 'in')] }),
    '401800005',
  );
  assert.equal(pickEvent({ events: { id: '1' } }), '');
});

test('captured events are the digit-named directories under the adapter captures folder', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'espn-capture-test-'));
  try {
    assert.equal(capturedEvents(root, 'ncaa/mens-basketball').size, 0);
    mkdirSync(captureDir(root, 'ncaa/mens-basketball', '401800001'), { recursive: true });
    mkdirSync(captureDir(root, 'ncaa/mens-basketball', '401800002.partial'), { recursive: true });
    writeFileSync(path.join(root, 'tests/leagues/ncaa-mens-basketball/captures/401800009'), '');
    assert.deepEqual([...capturedEvents(root, 'ncaa/mens-basketball')], ['401800001']);
    assert.equal(capturedEvents(root, 'ncaa/womens-basketball').size, 0);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('phase drops clock values from status detail', () => {
  assert.equal(phaseFromDetail('12:34 - 1st Half'), '1st Half');
  assert.equal(phaseFromDetail('57.1 - 2nd Half'), '2nd Half');
  assert.equal(phaseFromDetail('0.0 - 4th Quarter'), '4th Quarter');
  assert.equal(phaseFromDetail('Halftime'), 'Halftime');
  assert.equal(phaseFromDetail('End of 1st Quarter'), 'End of 1st Quarter');
  assert.equal(phaseFromDetail('Final/OT'), 'Final/OT');
  assert.equal(phaseFromDetail(undefined), '');
});

function summaryAt({ state, name, detail, period, clock, plays = 0 }) {
  return {
    header: {
      competitions: [
        { status: { displayClock: clock, period, type: { detail, name, state } } },
      ],
    },
    plays: Array.from({ length: plays }, (_, index) => ({ id: String(index) })),
  };
}

test('poll meta reads state, status name, phase, period, clock and plays', () => {
  assert.deepEqual(
    pollMeta(
      summaryAt({
        clock: '12:34',
        detail: '12:34 - 1st Half',
        name: 'STATUS_IN_PROGRESS',
        period: 1,
        plays: 3,
        state: 'in',
      }),
    ),
    {
      clock: '12:34',
      period: 1,
      phase: '1st Half',
      playsCount: 3,
      state: 'in',
      statusName: 'STATUS_IN_PROGRESS',
    },
  );
  assert.equal(pollMeta({}).state, '');
});

function poll(pollIndex, state, statusName, phase, period, ok = true) {
  return { ok, period, phase, pollIndex, state, statusName };
}

// Men's game: 2 pregame polls, first half, halftime, second half, final.
function mensGame() {
  const polls = [];
  for (let i = 1; i <= 2; i += 1) polls.push(poll(i, 'pre', 'STATUS_SCHEDULED', 'Tue', 0));
  for (let i = 3; i <= 24; i += 1) polls.push(poll(i, 'in', 'STATUS_IN_PROGRESS', '1st Half', 1));
  for (let i = 25; i <= 33; i += 1) polls.push(poll(i, 'in', 'STATUS_HALFTIME', 'Halftime', 1));
  for (let i = 34; i <= 56; i += 1) polls.push(poll(i, 'in', 'STATUS_IN_PROGRESS', '2nd Half', 2));
  polls.push(poll(57, 'post', 'STATUS_FINAL', 'Final', 2));
  return polls;
}

test('poll selection keeps first live, status changes, every 10th and the last poll', () => {
  assert.deepEqual(selectPolls(mensGame()), [3, 10, 20, 25, 30, 34, 40, 50, 57]);
});

test('poll selection catches end-of-period changes and skips failed polls', () => {
  const polls = [
    poll(1, 'in', 'STATUS_IN_PROGRESS', '1st Quarter', 1),
    poll(2, 'in', 'STATUS_IN_PROGRESS', '1st Quarter', 1),
    poll(3, 'in', 'STATUS_END_PERIOD', 'End of 1st Quarter', 1),
    poll(4, '', '', '', null, false),
    poll(5, 'in', 'STATUS_IN_PROGRESS', '2nd Quarter', 2),
    poll(6, 'in', 'STATUS_IN_PROGRESS', '2nd Quarter', 2),
    poll(7, '', '', '', null, false),
  ];
  assert.deepEqual(selectPolls(polls), [1, 3, 5, 6]);
  assert.deepEqual(selectPolls([poll(1, '', '', '', null, false)]), []);
  assert.deepEqual(selectPolls([]), []);
});

test('poll selection caps at 30 and thins every-10th polls evenly first', () => {
  const polls = [];
  for (let i = 1; i <= 240; i += 1) {
    const quarter = Math.min(4, Math.ceil(i / 50));
    polls.push(poll(i, 'in', 'STATUS_IN_PROGRESS', `Q${quarter}`, quarter));
  }
  polls.push(poll(241, 'post', 'STATUS_FINAL', 'Final', 4));
  // Changes at 51, 101, 151 and 241 (also last); first live 1; every 10th: 24 polls.
  const tenths = Array.from({ length: 24 }, (_, index) => (index + 1) * 10);
  const full = selectPolls(polls, 1000);
  assert.deepEqual(full, [1, ...tenths, 51, 101, 151, 241].sort((a, b) => a - b));
  const capped = selectPolls(polls, 20);
  assert.equal(capped.length, 20);
  for (const required of [1, 51, 101, 151, 241]) {
    assert.ok(capped.includes(required), `poll ${required} kept`);
  }
  const keptTenths = capped.filter((index) => ![1, 51, 101, 151, 241].includes(index));
  assert.equal(keptTenths.length, 15);
  assert.equal(keptTenths[0], 10);
  assert.equal(keptTenths[keptTenths.length - 1], 240);
  const gaps = keptTenths.slice(1).map((value, index) => value - keptTenths[index]);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 10, 'every-10th polls thinned evenly');

  const many = [];
  for (let i = 1; i <= 300; i += 1) {
    many.push(poll(i, 'in', 'STATUS_IN_PROGRESS', `P${Math.ceil(i / 3)}`, Math.ceil(i / 3)));
  }
  const cappedChanges = selectPolls(many);
  assert.equal(cappedChanges.length, 30);
  assert.equal(cappedChanges[0], 1);
  assert.equal(cappedChanges[cappedChanges.length - 1], 300);
  assert.equal(new Set(cappedChanges).size, 30);
});

test('default cap of 30 keeps every status change and thins only every-10th polls', () => {
  // 241 polls (240 min): status changes at polls 15, 35, ..., 195 (10 changes) and the final
  // poll; with the first live poll that is 12 fixed or change polls plus 24 every-10th polls.
  const polls = [];
  let phase = 0;
  for (let i = 1; i <= 240; i += 1) {
    if (i % 20 === 15 && i <= 195) phase += 1;
    polls.push(poll(i, 'in', 'STATUS_IN_PROGRESS', `P${phase}`, phase));
  }
  polls.push(poll(241, 'post', 'STATUS_FINAL', 'Final', phase));
  const changes = [15, 35, 55, 75, 95, 115, 135, 155, 175, 195];
  const selected = selectPolls(polls);
  assert.equal(selected.length, 30);
  for (const required of [1, ...changes, 241]) {
    assert.ok(selected.includes(required), `poll ${required} kept`);
  }
  const keptTenths = selected.filter((index) => index % 10 === 0);
  assert.equal(keptTenths.length, 18);
  assert.equal(keptTenths[0], 10);
  assert.equal(keptTenths[keptTenths.length - 1], 240);
});

test('trim keeps the board keys and adds capture fields', () => {
  const summary = {
    article: { body: 'x' },
    boxscore: { players: [] },
    format: { regulation: { periods: 2 } },
    gameInfo: {},
    header: { id: '1' },
    news: {},
    pickcenter: [],
    plays: [{ id: '1' }],
    timeouts: [],
    winprobability: [],
  };
  const trimmed = trimSummary(summary, {
    capturedAt: '2026-11-03T01:00:00.000Z',
    coreSituation: { body: { homeTimeouts: 3 }, ok: true, status: 200 },
    pollIndex: 7,
  });
  assert.deepEqual(Object.keys(trimmed), [
    'header',
    'format',
    'boxscore',
    'plays',
    'timeouts',
    'capturedAt',
    'pollIndex',
    'coreSituation',
  ]);
  assert.deepEqual(trimmed.coreSituation, { body: { homeTimeouts: 3 }, status: 200 });

  const withSituation = trimSummary(
    { header: {}, situation: { lastPlay: {} } },
    { capturedAt: 'now', coreSituation: { body: null, error: 'ENOTFOUND', status: null }, pollIndex: 1 },
  );
  assert.deepEqual(Object.keys(withSituation), [
    'header',
    'situation',
    'capturedAt',
    'pollIndex',
    'coreSituation',
  ]);
  assert.deepEqual(withSituation.coreSituation, { body: null, error: 'ENOTFOUND', status: null });
});

function liveSummary() {
  const athlete = (id, jersey, starter, active) => ({
    active,
    athlete: { id, jersey },
    starter,
    stats: [],
  });
  return {
    boxscore: {
      players: [
        {
          statistics: [
            {
              athletes: [
                athlete('1', '0', true, true),
                athlete('2', '1', true, true),
                athlete('3', '2', true, false),
                athlete('4', '3', true, true),
                athlete('5', '4', true, true),
                athlete('6', '5', false, true),
              ],
            },
          ],
          team: { abbreviation: 'ISU', id: '66' },
        },
        {
          statistics: [{ athletes: [athlete('7', '10', true, true), athlete('8', '11', false, false)] }],
          team: { abbreviation: 'OPP', id: '99' },
        },
      ],
    },
    format: { regulation: { periods: 2 } },
    header: {
      competitions: [
        {
          competitors: [
            { homeAway: 'home', possession: true, team: { abbreviation: 'ISU', id: '66' } },
            { homeAway: 'away', team: { abbreviation: 'OPP', id: '99' } },
          ],
          possessionArrowAvailable: true,
          status: {
            displayClock: '11:02',
            period: 1,
            type: { detail: '11:02 - 1st Half', name: 'STATUS_IN_PROGRESS', state: 'in' },
          },
          timeoutsAvailable: false,
        },
      ],
    },
    plays: [
      { team: { id: '66' }, type: { id: '584', text: 'Substitution' } },
      { team: { id: '66' }, type: { id: '584', text: 'Substitution' } },
      { team: { id: '99' }, type: { id: '519', text: 'PersonalFoul' } },
      { team: { id: '66' }, type: { id: '519', text: 'PersonalFoul' } },
      { team: { id: '99' }, type: { id: '521', text: 'Technical Foul' } },
      { team: { id: '66' }, type: { id: '16', text: 'Full Timeout' } },
      { type: { id: '17', text: 'Official TV Timeout' } },
      { team: { id: '66' }, type: { id: '558', text: 'JumpShot' } },
    ],
    situation: { lastPlay: { id: '8' } },
    timeouts: [{ team: '66', remaining: 3 }],
  };
}

test('poll stats count each athlete once across statistics groups', () => {
  const entry = (id, active, starter) => ({ active, athlete: { id }, starter });
  const stats = pollStats({
    boxscore: {
      players: [
        {
          statistics: [
            { athletes: [entry('1', true, true), entry('2', true, false)] },
            { athletes: [entry('1', true, true), entry('2', true, false)] },
          ],
          team: { id: '66' },
        },
      ],
    },
    plays: { not: 'an array' },
  });
  assert.equal(stats.plays, 0);
  assert.deepEqual(stats.teams, [{ active: 2, fouls: 0, label: '66', starters: 1, timeouts: 0 }]);
  assert.deepEqual(pollStats({ boxscore: { players: { bad: true } } }).teams, []);
});

test('poll stats count plays, substitutions, fouls, active and starters per team', () => {
  const stats = pollStats(liveSummary());
  assert.equal(stats.plays, 8);
  assert.equal(stats.substitutions, 2);
  assert.equal(stats.fouls, 3);
  assert.equal(stats.timeouts, 2);
  assert.deepEqual(stats.teams, [
    { active: 5, fouls: 1, label: 'ISU', starters: 5, timeouts: 1 },
    { active: 1, fouls: 2, label: 'OPP', starters: 1, timeouts: 0 },
  ]);
});

test('matching fields finds timeout, foul, bonus and possession names at any depth', () => {
  const fields = matchingFields({
    $ref: 'x',
    awayTimeouts: 4,
    homeFouls: { bonusState: 'NONE', teamFouls: 3 },
    lastPlay: { $ref: 'y' },
    nested: [{ possessionText: 'ISU' }],
  });
  assert.deepEqual(fields, [
    { path: 'awayTimeouts', value: 4 },
    { path: 'homeFouls', value: { bonusState: 'NONE', teamFouls: 3 } },
    { path: 'nested[0].possessionText', value: 'ISU' },
  ]);
  assert.deepEqual(matchingFields(null), []);
  assert.deepEqual(matchingFields('text'), []);
});

test('report lists keys and per-poll facts', () => {
  const summary = liveSummary();
  const keys = collectKeys(summary, emptyKeySets());
  collectKeys({ extraKey: true }, keys);
  assert.deepEqual([...keys.athleteEntry].sort(), ['active', 'athlete', 'starter', 'stats']);
  const first = trimSummary(summary, {
    capturedAt: '2026-11-03T01:00:00.000Z',
    coreSituation: {
      body: { $ref: 'x', awayTimeouts: 4, homeFouls: { bonusState: 'NONE' } },
      status: 200,
    },
    pollIndex: 3,
  });
  const second = trimSummary(
    { header: summary.header },
    {
      capturedAt: '2026-11-03T01:01:00.000Z',
      coreSituation: { body: null, error: 'ETIMEDOUT', status: null },
      pollIndex: 12,
    },
  );
  const report = buildReport({
    adapter: 'ncaa/mens-basketball',
    committed: [first, second],
    event: '401800002',
    failedSummaryPolls: 1,
    keys,
    pollCount: 12,
  });
  const lines = report.split('\n');
  assert.equal(lines[0], '# ESPN live capture ncaa-mens-basketball 401800002');
  assert.ok(lines.includes('- Polls: 12 (summary failures: 1)'));
  assert.ok(lines.includes('- Committed polls: 2 (003, 012)'));
  assert.ok(
    lines.includes(
      '- Summary top level: `boxscore`, `extraKey`, `format`, `header`, `plays`, `situation`, `timeouts`',
    ),
  );
  assert.ok(
    lines.includes(
      '- `boxscore.players[].statistics[].athletes[]`: `active`, `athlete`, `starter`, `stats`',
    ),
  );
  assert.ok(lines.includes('- `header.competitions[0].competitors[]`: `homeAway`, `possession`, `team`'));
  assert.ok(lines.includes('## Poll 003'));
  assert.ok(
    lines.includes(
      '- Status: name `STATUS_IN_PROGRESS`, detail `11:02 - 1st Half`, period `1`, clock `11:02`',
    ),
  );
  assert.ok(
    lines.includes(
      '- Plays: 8; substitutions (type.id 584): 2; type.text contains "Foul": 3; type.text contains "Timeout": 2',
    ),
  );
  assert.ok(
    lines.includes('- Team `ISU`: active true 5, starter true 5, foul plays 1, timeout plays 1'),
  );
  assert.ok(
    lines.includes('- Team `OPP`: active true 1, starter true 1, foul plays 2, timeout plays 0'),
  );
  assert.ok(lines.includes('- `header.competitions[0].timeoutsAvailable`: `false`'));
  assert.ok(lines.includes('- `header.competitions[0].possessionArrowAvailable`: `true`'));
  assert.ok(lines.includes('- `header.competitions[0].competitors[0].possession` (ISU): `true`'));
  assert.ok(report.includes('Top-level `timeouts`:\n\n```json\n[\n  {\n    "team": "66",'));
  assert.ok(report.includes('Top-level `situation`:\n\n```json\n{\n  "lastPlay"'));
  assert.ok(
    lines.includes(
      'Core situation: HTTP `200`; top-level keys: `$ref`, `awayTimeouts`, `homeFouls`',
    ),
  );
  assert.ok(lines.includes('- `awayTimeouts`: `4`'));
  assert.ok(lines.includes('- `homeFouls`: `{"bonusState":"NONE"}`'));
  assert.ok(lines.includes('## Poll 012'));
  assert.ok(lines.includes('Top-level `timeouts`: absent'));
  assert.ok(
    lines.includes('Core situation: HTTP (none), error `ETIMEDOUT`; top-level keys: (no JSON object)'),
  );
  assert.equal(report.split('## Poll 012')[1].includes('Top-level `situation`'), false);
});

function tempRoot() {
  return mkdtempSync(path.join(os.tmpdir(), 'espn-capture-run-'));
}

function fakeClock(startIso = '2026-11-04T01:00:00.000Z') {
  let t = Date.parse(startIso);
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  };
}

// Answers summary and Core situation requests from per-poll lists; the last entry repeats.
function fakeEspn({ summaries, situations = [] }) {
  const calls = { situation: 0, summary: 0 };
  const fetchJson = async (url) => {
    if (url.includes('/summary?event=')) {
      const index = Math.min(calls.summary, summaries.length - 1);
      calls.summary += 1;
      return summaries[index];
    }
    if (url.endsWith('/situation')) {
      const index = Math.min(calls.situation, Math.max(0, situations.length - 1));
      calls.situation += 1;
      return situations[index] ?? { body: { $ref: 'x', homeTimeouts: 3 }, ok: true, status: 200 };
    }
    throw new Error(`unexpected url ${url}`);
  };
  return { calls, fetchJson };
}

function okSummary(fields) {
  return { body: { ...summaryAt(fields), news: { text: 'BODY_MARKER' } }, ok: true, status: 200 };
}

const FAILED = { body: null, error: 'ECONNRESET', ok: false, status: null };

function readPoll(dir, name) {
  return JSON.parse(gunzipSync(readFileSync(path.join(dir, name))).toString('utf8'));
}

test('capture keeps polling through halftime, stops after the final poll, and writes gzipped polls', async () => {
  const root = tempRoot();
  try {
    const clock = fakeClock();
    const espn = fakeEspn({
      situations: [
        { body: { $ref: 'x', awayTimeouts: 4 }, ok: true, status: 200 },
        FAILED,
        { body: { error: 'not found' }, error: 'HTTP 404', ok: false, status: 404 },
        { body: { $ref: 'x', awayTimeouts: 2 }, ok: true, status: 200 },
      ],
      summaries: [
        okSummary({ clock: '12:00', detail: '12:00 - 1st Half', name: 'STATUS_IN_PROGRESS', period: 1, plays: 10, state: 'in' }),
        okSummary({ clock: '11:00', detail: '11:00 - 1st Half', name: 'STATUS_IN_PROGRESS', period: 1, plays: 12, state: 'in' }),
        okSummary({ clock: '0:00', detail: 'Halftime', name: 'STATUS_HALFTIME', period: 1, plays: 40, state: 'in' }),
        okSummary({ clock: '19:30', detail: '19:30 - 2nd Half', name: 'STATUS_IN_PROGRESS', period: 2, plays: 42, state: 'in' }),
        okSummary({ clock: '0:00', detail: 'Final', name: 'STATUS_FINAL', period: 2, plays: 80, state: 'post' }),
        okSummary({ clock: '0:00', detail: 'Final', name: 'STATUS_FINAL', period: 2, plays: 80, state: 'post' }),
      ],
    });
    const lines = [];
    const code = await runCapture({
      env: { ADAPTER: 'ncaa/mens-basketball', EVENT: '401800002', RUNNER_TEMP: path.join(root, 'tmp') },
      fetchJson: espn.fetchJson,
      log: (line) => lines.push(line),
      now: clock.now,
      root,
      sleep: clock.sleep,
    });
    assert.equal(code, 0);
    assert.equal(espn.calls.summary, 5);
    assert.equal(espn.calls.situation, 5);

    const dir = captureDir(root, 'ncaa/mens-basketball', '401800002');
    assert.deepEqual(readdirSync(dir).sort(), [
      '001.json.gz',
      '003.json.gz',
      '004.json.gz',
      '005.json.gz',
      'REPORT.md',
    ]);
    assert.equal(existsSync(`${dir}.partial`), false);
    const rawDir = path.join(root, 'tmp', 'espn-capture-raw', 'ncaa-mens-basketball', '401800002');
    assert.equal(readdirSync(rawDir).filter((name) => name.endsWith('.json.gz')).length, 5);
    assert.ok(existsSync(path.join(rawDir, 'REPORT.md')));
    assert.equal(readPoll(rawDir, '002.json.gz').coreSituation.error, 'ECONNRESET');

    const halftime = readPoll(dir, '003.json.gz');
    assert.deepEqual(Object.keys(halftime), ['header', 'plays', 'capturedAt', 'pollIndex', 'coreSituation']);
    assert.equal(halftime.pollIndex, 3);
    assert.equal(halftime.capturedAt, '2026-11-04T01:02:00.000Z');
    assert.deepEqual(halftime.coreSituation, { body: { error: 'not found' }, status: 404, error: 'HTTP 404' });
    assert.equal(readPoll(dir, '005.json.gz').header.competitions[0].status.type.state, 'post');

    const report = readFileSync(path.join(dir, 'REPORT.md'), 'utf8');
    assert.ok(report.includes('- Polls: 5 (summary failures: 0)'));
    assert.ok(report.includes('- Committed polls: 4 (001, 003, 004, 005)'));
    assert.ok(report.includes('- Summary top level: `header`, `news`, `plays`'));
    assert.ok(report.includes('- `awayTimeouts`: `2`'));

    assert.equal(lines.some((line) => line.includes('BODY_MARKER')), false);
    assert.ok(lines.every((line) => line.length <= 120 && !line.includes('\n')));
    assert.ok(lines.includes('poll 003 state=in period=1 clock=0:00 plays=40'));
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('capture exits at once when the event is already captured', async () => {
  const root = tempRoot();
  try {
    mkdirSync(captureDir(root, 'ncaa/womens-basketball', '401800002'), { recursive: true });
    const espn = fakeEspn({ summaries: [FAILED] });
    const lines = [];
    const code = await runCapture({
      env: { ADAPTER: 'ncaa/womens-basketball', EVENT: '401800002', RUNNER_TEMP: path.join(root, 'tmp') },
      fetchJson: espn.fetchJson,
      log: (line) => lines.push(line),
      root,
      sleep: async () => {},
    });
    assert.equal(code, 0);
    assert.equal(espn.calls.summary, 0);
    assert.deepEqual(lines, ['capture: tests/leagues/ncaa-womens-basketball/captures/401800002 already exists']);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('capture stops after 10 consecutive summary failures and at MAX_MINUTES', async () => {
  const root = tempRoot();
  try {
    const env = { ADAPTER: 'ncaa/mens-basketball', EVENT: '401800002', RUNNER_TEMP: path.join(root, 'tmp') };
    const quiet = () => {};

    const failing = fakeEspn({ summaries: [FAILED] });
    let clock = fakeClock();
    assert.equal(
      await runCapture({ env, fetchJson: failing.fetchJson, log: quiet, now: clock.now, root, sleep: clock.sleep }),
      1,
    );
    assert.equal(failing.calls.summary, 10);
    assert.equal(existsSync(captureDir(root, 'ncaa/mens-basketball', '401800002')), false);

    const live = okSummary({ clock: '5:00', detail: '5:00 - 1st Half', name: 'STATUS_IN_PROGRESS', period: 1, state: 'in' });
    const flaky = fakeEspn({ summaries: [live, ...Array(10).fill(FAILED)] });
    clock = fakeClock();
    assert.equal(
      await runCapture({ env, fetchJson: flaky.fetchJson, log: quiet, now: clock.now, root, sleep: clock.sleep }),
      0,
    );
    assert.equal(flaky.calls.summary, 11);
    const dir = captureDir(root, 'ncaa/mens-basketball', '401800002');
    assert.deepEqual(readdirSync(dir).sort(), ['001.json.gz', 'REPORT.md']);
    rmSync(dir, { force: true, recursive: true });

    const endless = fakeEspn({ summaries: [live] });
    clock = fakeClock();
    const start = clock.now();
    assert.equal(
      await runCapture({
        env: { ...env, MAX_MINUTES: '5' },
        fetchJson: endless.fetchJson,
        log: quiet,
        now: clock.now,
        root,
        sleep: clock.sleep,
      }),
      0,
    );
    // MAX_MINUTES 5 is raised to 10: polls at minutes 0 through 10.
    assert.equal(endless.calls.summary, 11);
    assert.equal(clock.now() - start, 10 * 60_000);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('capture rejects an unknown adapter or a bad event id', async () => {
  const espn = fakeEspn({ summaries: [FAILED] });
  for (const env of [
    { ADAPTER: 'nba', EVENT: '1' },
    { ADAPTER: 'ncaa/mens-basketball', EVENT: '1;ls' },
    { ADAPTER: 'ncaa/mens-basketball' },
  ]) {
    assert.equal(await runCapture({ env, fetchJson: espn.fetchJson, log: () => {}, root: '/nonexistent' }), 1);
  }
  assert.equal(espn.calls.summary, 0);
});

function readOutputs(file) {
  return readFileSync(file, 'utf8');
}

test('find logs one line, writes empty outputs and exits 0 when ESPN cannot be reached', async () => {
  const root = tempRoot();
  try {
    const output = path.join(root, 'out');
    writeFileSync(output, '');
    const urls = [];
    const lines = [];
    const code = await runFind({
      env: { ADAPTER: 'auto', GITHUB_OUTPUT: output },
      fetchJson: async (url) => {
        urls.push(url);
        return { body: null, error: 'ENOTFOUND', ok: false, status: null };
      },
      log: (line) => lines.push(line),
      now: () => Date.parse('2026-11-04T01:00:00Z'),
      root,
    });
    assert.equal(code, 0);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^find: nothing to capture; /);
    assert.equal(readOutputs(output), 'adapter=\nevent=\n');
    assert.deepEqual(urls, [
      scheduleUrl('ncaa/mens-basketball', 2027),
      scheduleUrl('ncaa/womens-basketball', 2027),
    ]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('find skips an adapter with 2 captures and picks the other adapter live event', async () => {
  const root = tempRoot();
  try {
    for (const id of ['401700001', '401700002']) {
      mkdirSync(captureDir(root, 'ncaa/mens-basketball', id), { recursive: true });
    }
    const output = path.join(root, 'out');
    const urls = [];
    const code = await runFind({
      env: { GITHUB_OUTPUT: output },
      fetchJson: async (url) => {
        urls.push(url);
        return { body: SCHEDULE, ok: true, status: 200 };
      },
      log: () => {},
      now: () => Date.parse('2027-02-10T02:00:00Z'),
      root,
    });
    assert.equal(code, 0);
    assert.deepEqual(urls, [scheduleUrl('ncaa/womens-basketball', 2027)]);
    assert.equal(readOutputs(output), 'adapter=ncaa/womens-basketball\nevent=401800002\n');

    // A dispatched event passes the 2-capture limit but must be in the schedule.
    const dispatched = path.join(root, 'out-dispatched');
    await runFind({
      env: { ADAPTER: 'ncaa/mens-basketball', EVENT: '401800003', GITHUB_OUTPUT: dispatched },
      fetchJson: async () => ({ body: SCHEDULE, ok: true, status: 200 }),
      log: () => {},
      root,
    });
    assert.equal(readOutputs(dispatched), 'adapter=ncaa/mens-basketball\nevent=401800003\n');

    const missing = path.join(root, 'out-missing');
    await runFind({
      env: { ADAPTER: 'ncaa/mens-basketball', EVENT: '401899999', GITHUB_OUTPUT: missing },
      fetchJson: async () => ({ body: SCHEDULE, ok: true, status: 200 }),
      log: () => {},
      root,
    });
    assert.equal(readOutputs(missing), 'adapter=\nevent=\n');

    const invalid = path.join(root, 'out-invalid');
    assert.equal(
      await runFind({
        env: { ADAPTER: 'auto', EVENT: '40180;ls', GITHUB_OUTPUT: invalid },
        fetchJson: async () => assert.fail('no request for an invalid event'),
        log: () => {},
        root,
      }),
      1,
    );
    assert.equal(readOutputs(invalid), 'adapter=\nevent=\n');
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
