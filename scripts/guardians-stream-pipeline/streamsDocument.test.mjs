import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { guardiansGamesFromSchedule } from './lib/mlbSchedule.mjs';
import { isPlayableStream } from './lib/playableStream.mjs';
import {
  findPlayableStreamForGame,
  parseStreamsDocument,
  planStreamUpdate,
  pruneStaleStreams,
  upsertStream,
} from './lib/streamsDocument.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const GUIDE = { EDIT_HERE: 'streams', STEP_1: 'Copy the complete object below INACTIVE EXAMPLE.' };
const MARKER = 'INACTIVE EXAMPLE. COPY THE COMPLETE OBJECT BELOW THIS LINE.';
const EXAMPLE = {
  gameDates: ['YYYY-MM-DD'],
  gameNumbers: [1],
  kind: 'direct',
  url: 'https://media.example.com/game/master.m3u8',
  allowInsecureHttp: false,
  trustedHosts: [],
};

function goozEntry(gameDates, id, extra = {}) {
  return {
    gameDates,
    gameNumbers: [1],
    kind: 'web',
    url: `https://gooz.aapmains.net/new-stream-embed/${id}?ad=111`,
    allowInsecureHttp: false,
    trustedHosts: [],
    ...extra,
  };
}

function documentWith(...entries) {
  return { HOW_TO_GUIDE: GUIDE, streams: [MARKER, EXAMPLE, 'REAL DEAL', ...entries] };
}

const game = { gameNumber: 1, officialDate: '2026-09-12', opponentName: 'Detroit Tigers' };

test('pruning drops entries whose every date is more than 7 days old and keeps the guide', () => {
  const eightDaysOld = goozEntry(['2026-09-21'], 1);
  const sevenDaysOld = goozEntry(['2026-09-22'], 2);
  const mixed = goozEntry(['2026-08-01', '2026-09-28'], 3);
  const unparseable = goozEntry(['2026-9-1'], 4);
  const pruned = pruneStaleStreams(
    documentWith(eightDaysOld, sevenDaysOld, mixed, unparseable),
    '2026-09-29',
  );
  assert.deepEqual(pruned.HOW_TO_GUIDE, GUIDE);
  assert.deepEqual(pruned.streams, [MARKER, EXAMPLE, 'REAL DEAL', sevenDaysOld, mixed, unparseable]);
});

test('the committed streams files keep their guide, markers, and example through pruning', async () => {
  for (const file of ['guardians_streams.json', 'patriots_streams.json', 'cyclones_streams.json']) {
    const document = parseStreamsDocument(await readFile(path.join(repoRoot, file), 'utf8'));
    const pruned = pruneStaleStreams(document, '2030-01-01');
    assert.deepEqual(pruned.HOW_TO_GUIDE, document.HOW_TO_GUIDE, file);
    const kept = pruned.streams;
    assert.ok(kept.includes(MARKER), file);
    assert.ok(
      kept.some((entry) => typeof entry === 'object' && entry.gameDates?.[0] === 'YYYY-MM-DD'),
      file,
    );
    assert.equal(
      kept.filter((entry) => typeof entry === 'object').length,
      1,
      `${file} keeps only the inactive example in 2030`,
    );
  }
});

test('upsert removes only this game\'s date from a multi-date provider entry', () => {
  const shared = goozEntry(['2026-09-12', '2026-09-13'], 100);
  const next = goozEntry(['2026-09-12'], 200);
  const updated = upsertStream(documentWith(shared), next, game);
  assert.deepEqual(updated.streams.slice(3), [
    { ...shared, gameDates: ['2026-09-13'] },
    next,
  ]);
});

test('upsert keeps the other game number of a doubleheader entry', () => {
  const both = { ...goozEntry(['2026-09-12'], 100), gameNumbers: [1, 2] };
  const next = goozEntry(['2026-09-12'], 200);
  const updated = upsertStream(documentWith(both), next, game);
  assert.deepEqual(updated.streams.slice(3), [{ ...both, gameNumbers: [2] }, next]);
});

test('upsert keeps other valid sources and replaces broken ones for the same game', () => {
  const youtube = {
    gameDates: ['2026-09-12'],
    gameNumbers: [1],
    kind: 'youtube',
    url: 'https://www.youtube.com/watch?v=abcdefghijk',
    allowInsecureHttp: false,
    trustedHosts: [],
  };
  const broken = { ...youtube, kind: 'direct', url: 'http://media.example.com/a.m3u8' };
  const oldProvider = goozEntry(['2026-09-12'], 100);
  const next = goozEntry(['2026-09-12'], 200);
  const updated = upsertStream(documentWith(youtube, broken, oldProvider), next, game);
  assert.deepEqual(updated.streams.slice(3), [youtube, next]);
});

test('readiness accepts any playable match, not only the first', () => {
  const invalid = goozEntry(['2026-09-12'], 'abc');
  const valid = goozEntry(['2026-09-12'], 300);
  assert.equal(findPlayableStreamForGame(documentWith(invalid), game), undefined);
  assert.deepEqual(findPlayableStreamForGame(documentWith(invalid, valid), game), valid);
});

test('the validator mirrors the phone\'s playable check', () => {
  const base = goozEntry(['2026-09-12'], 100);
  assert.equal(isPlayableStream(base), true);
  assert.equal(isPlayableStream({ ...base, url: 'http://gooz.aapmains.net/new-stream-embed/100' }), false);
  assert.equal(
    isPlayableStream({ ...base, kind: 'direct', url: 'https://cdn.example.com/a.m3u8', trustedHosts: ['cdn.example.com'] }),
    false,
    'direct with trustedHosts',
  );
  assert.equal(isPlayableStream({ ...base, url: 'https://player.example.com/x', trustedHosts: ['https://cdn.example.com'] }), false);
  assert.equal(isPlayableStream({ ...base, url: 'https://player.example.com/x', trustedHosts: ['cdn.example.com'] }), true);
  assert.equal(isPlayableStream({ ...base, kind: 'youtube', url: 'https://www.youtube.com/shorts/abcdefghijk' }), false);
  assert.equal(isPlayableStream({ ...base, kind: 'youtube', url: 'http://www.youtube.com/watch?v=abcdefghijk' }), false);
  assert.equal(isPlayableStream({ ...base, kind: 'youtube', url: 'https://youtu.be/abcdefghijk' }), true);
  assert.equal(isPlayableStream({ ...base, url: `https://player.example.com/${'a'.repeat(2048)}` }), false);
  assert.equal(isPlayableStream({ ...base, sport: 'football' }), false, 'Guardians schema has no sport');
  assert.equal(isPlayableStream(base, { requireSport: true }), false, 'Cyclones requires sport');
  assert.equal(isPlayableStream({ ...base, sport: 'football' }, { requireSport: true }), true);
  assert.equal(isPlayableStream({ ...base, sport: 'hockey' }, { requireSport: true }), false);
});

test('the plan reports video_ready and unchanged without writing', () => {
  const today = '2026-09-12';
  const valid = goozEntry(['2026-09-12'], 100);
  const next = goozEntry(['2026-09-12'], 200);

  assert.equal(planStreamUpdate(documentWith(valid), { entry: next, game, today }).outcome, 'video_ready');
  assert.equal(
    planStreamUpdate(documentWith(valid), { entry: valid, force: true, game, today }).outcome,
    'unchanged',
  );

  const forced = planStreamUpdate(documentWith(valid), { entry: next, force: true, game, today });
  assert.equal(forced.outcome, 'update');
  assert.deepEqual(forced.document.streams.slice(3), [next]);
});

test('past 200 entry objects only the last 200 count, as on the phone', () => {
  const today = '2026-09-12';
  const early = goozEntry(['2026-09-12'], 100);
  const filler = Array.from({ length: 200 }, (_, index) => goozEntry(['2026-09-11'], 1000 + index));
  const document = { HOW_TO_GUIDE: GUIDE, streams: [MARKER, early, ...filler] };
  assert.equal(findPlayableStreamForGame(document, game), undefined, 'first object is out of scope');

  const next = goozEntry(['2026-09-12'], 200);
  const plan = planStreamUpdate(document, { entry: next, game, today });
  assert.equal(plan.outcome, 'update');
  assert.equal(plan.document.streams.at(-1), next, 'entry moves into scope');
  assert.equal(plan.document.streams.length, 202, 'nothing is rejected for length');
  assert.deepEqual(findPlayableStreamForGame(plan.document, game), next);
});

test('the plan prunes stale entries when it writes', () => {
  const stale = goozEntry(['2026-08-01'], 50);
  const next = goozEntry(['2026-09-12'], 200);
  const plan = planStreamUpdate(documentWith(stale), { entry: next, game, today: '2026-09-12' });
  assert.deepEqual(plan.document.streams, [MARKER, EXAMPLE, 'REAL DEAL', next]);
});

test('Cyclones upserts only touch the same sport', () => {
  const cyclonesGame = { gameNumber: 1, officialDate: '2026-11-07', sport: 'mens-basketball' };
  const football = goozEntry(['2026-11-07'], 100, { sport: 'football' });
  const next = goozEntry(['2026-11-07'], 200, { sport: 'mens-basketball' });
  const plan = planStreamUpdate(documentWith(football), {
    entry: next,
    game: cyclonesGame,
    requireSport: true,
    today: '2026-11-07',
  });
  assert.deepEqual(plan.document.streams.slice(3), [football, next]);
});

function mlbRow(overrides) {
  return {
    gameDate: '2026-09-13T17:10:00Z',
    gameNumber: 1,
    gamePk: 776001,
    officialDate: '2026-09-12',
    status: { abstractGameState: 'Preview', detailedState: 'Scheduled' },
    teams: {
      away: { team: { id: 116, name: 'Detroit Tigers' } },
      home: { team: { id: 114, name: 'Cleveland Guardians' } },
    },
    ...overrides,
  };
}

test('a resumed MLB game keeps its official date and is flagged to replace the old entry', () => {
  // MLB keeps the original officialDate on the resumed copy (gamePk 777861 in 2025).
  const schedule = {
    dates: [
      {
        date: '2026-09-12',
        games: [
          mlbRow({
            gameDate: '2026-09-12T23:10:00Z',
            resumeDate: '2026-09-21',
            status: { abstractGameState: 'Preview', detailedState: 'Suspended: Rain' },
          }),
        ],
      },
      {
        date: '2026-09-21',
        games: [mlbRow({ gameDate: '2026-09-21T17:10:00Z', resumedFrom: '2026-09-12' })],
      },
      {
        date: '2026-09-22',
        games: [mlbRow({ gameDate: '2026-09-22T17:10:00Z', gamePk: 776002, officialDate: '2026-09-22' })],
      },
    ],
  };
  const [suspended, resumed, ordinary] = guardiansGamesFromSchedule(schedule, 114);
  assert.equal(suspended.officialDate, '2026-09-12');
  assert.equal(resumed.officialDate, '2026-09-12');
  assert.equal(resumed.resumed, true);
  assert.equal(ordinary.resumed, undefined);

  // A bucket date that differs from officialDate also marks the game as resumed.
  const [bucketOnly] = guardiansGamesFromSchedule(
    { dates: [{ date: '2026-09-21', games: [mlbRow({ gameDate: '2026-09-21T17:10:00Z' })] }] },
    114,
  );
  assert.equal(bucketOnly.resumed, true);

  // Nine days after the suspension the old entry is replaced under the same key and survives
  // the 7-day pruning because it is the entry being written.
  const staleProvider = goozEntry(['2026-09-12'], 100);
  const next = goozEntry(['2026-09-12'], 200);
  const plan = planStreamUpdate(documentWith(staleProvider), {
    entry: next,
    force: true,
    game: resumed,
    today: '2026-09-21',
  });
  assert.deepEqual(plan.document.streams.slice(3), [next]);
});

test('an ordinary MLB game keeps its official date', () => {
  const [row] = guardiansGamesFromSchedule(
    { dates: [{ date: '2026-09-12', games: [mlbRow({ gameDate: '2026-09-13T02:10:00Z' })] }] },
    114,
  );
  assert.equal(row.officialDate, '2026-09-12');
  assert.equal(row.resumed, undefined);
  assert.equal(row.opponentName, 'Detroit Tigers');
});
