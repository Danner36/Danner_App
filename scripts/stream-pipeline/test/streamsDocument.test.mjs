import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { isPlayableStream } from '../lib/playableStream.mjs';
import {
  findEquivalentStream,
  findPlayableStreamForGame,
  newStreamsDocument,
  parseStreamsDocument,
  planStreamUpdate,
  pruneStaleStreams,
  readTemplate,
  serializeStreamsDocument,
  streamFromUnknown,
  streamMatchesGame,
  upsertStream,
} from '../lib/streamsDocument.mjs';

const MARKER = 'INACTIVE EXAMPLE. COPY THE COMPLETE OBJECT BELOW THIS LINE.';
const EXAMPLE = {
  gameDates: ['YYYY-MM-DD'],
  gameNumbers: [1],
  kind: 'direct',
  url: 'https://example.invalid/game.m3u8',
  allowInsecureHttp: false,
  trustedHosts: [],
};
const GUIDE = { COMMIT: 'x', DATES: 'y' };

function pipelineEntry(gameDates, id, extra = {}) {
  return {
    eventId: '900001',
    gameDates,
    gameNumbers: [1],
    kind: 'web',
    url: `https://gooz.aapmains.net/new-stream-embed/${id}?ad=111`,
    allowInsecureHttp: false,
    trustedHosts: [],
    source: 'pipeline',
    ...extra,
  };
}

function handEntry(gameDates, url = 'https://cdn.example.invalid/a.m3u8') {
  return { gameDates, gameNumbers: [1], kind: 'direct', url, allowInsecureHttp: false, trustedHosts: [] };
}

function documentWith(...entries) {
  return { schemaVersion: 2, HOW_TO_GUIDE: GUIDE, streams: [MARKER, EXAMPLE, ...entries] };
}

const game = { gameNumber: 1, gamePk: 900001, officialDate: '2026-09-12', opponentName: 'Detroit Tigers' };
const schoolValidation = { sports: ['football', 'mens-basketball'] };

test('the template builds a pro file with no sport on its example', async () => {
  const document = newStreamsDocument(await readTemplate(), {
    key: 'nfl-17',
    name: 'New England Patriots',
    streamsPath: 'streams/nfl/17.json',
  });
  assert.equal(document.schemaVersion, 2);
  assert.deepEqual(document.team, { key: 'nfl-17', name: 'New England Patriots' });
  assert.equal(document.HOW_TO_GUIDE.COMMIT, 'Commit streams/nfl/17.json to main.');
  assert.equal(document.streams[0], MARKER);
  assert.equal(document.streams[1].sport, undefined);
  assert.equal(document.streams.length, 2);
  assert.equal(streamFromUnknown(document.streams[1]), undefined, 'the placeholder date keeps the example inactive');
});

test('the template builds a school file with a sport on its example', async () => {
  const document = newStreamsDocument(await readTemplate(), {
    key: 'ncaa-66',
    name: 'Iowa State Cyclones',
    sport: 'football',
    streamsPath: 'streams/ncaa/66.json',
  });
  assert.equal(document.streams[1].sport, 'football');
});

test('an entry with eventId matches only that event on its current official date', () => {
  const entry = pipelineEntry(['2026-09-12'], 100);
  assert.equal(streamMatchesGame(entry, game), true);
  assert.equal(streamMatchesGame(entry, { ...game, gamePk: 999 }), false);
  assert.equal(streamMatchesGame(entry, { ...game, officialDate: '2026-09-13' }), false, 'a rescheduled event');
  assert.equal(streamMatchesGame(entry, { ...game, gameNumber: 2 }), true, 'the event id decides, not the number');
});

test('an entry without eventId matches by date and game number', () => {
  const entry = handEntry(['2026-09-12']);
  assert.equal(streamMatchesGame(entry, game), true);
  assert.equal(streamMatchesGame(entry, { ...game, gameNumber: 2 }), false);
  assert.equal(streamMatchesGame(entry, { ...game, officialDate: '2026-09-13' }), false);
});

test('school entries also need the same sport and pro entries none', () => {
  const entry = pipelineEntry(['2026-09-12'], 100, { sport: 'football' });
  assert.equal(streamMatchesGame(entry, { ...game, sport: 'football' }), true);
  assert.equal(streamMatchesGame(entry, { ...game, sport: 'mens-basketball' }), false);
  assert.equal(streamMatchesGame(entry, game), false);
});

test('a postponed event that keeps its id is not ready on the new date, so a run proceeds', () => {
  const old = pipelineEntry(['2026-09-12'], 100);
  const moved = { ...game, officialDate: '2026-09-14' };
  assert.equal(findPlayableStreamForGame(documentWith(old), moved), undefined);
});

test('a resumed game replaces its old entry under the same key', () => {
  const old = pipelineEntry(['2026-09-12'], 100);
  const next = pipelineEntry(['2026-09-12'], 200);
  const plan = planStreamUpdate(documentWith(old), {
    entry: next,
    force: true,
    game: { ...game, resumed: true },
    today: '2026-09-21',
  });
  assert.deepEqual(plan.document.streams.slice(2), [next]);
});

test('unknown keys are ignored, not rejected', () => {
  const entry = { ...pipelineEntry(['2026-09-12'], 100), futureField: 1 };
  assert.ok(streamFromUnknown(entry));
  assert.equal(isPlayableStream(entry), true);
});

test('eventId must be a string of digits', () => {
  assert.equal(streamFromUnknown(pipelineEntry(['2026-09-12'], 1, { eventId: 900001 })), undefined);
  assert.equal(streamFromUnknown(pipelineEntry(['2026-09-12'], 1, { eventId: '12a' })), undefined);
  assert.equal(isPlayableStream(pipelineEntry(['2026-09-12'], 1, { eventId: '12a' })), false);
  assert.ok(streamFromUnknown(handEntry(['2026-09-12'])), 'optional on hand-written entries');
});

test('the validator mirrors the phone\'s playable check', () => {
  const base = pipelineEntry(['2026-09-12'], 100);
  assert.equal(isPlayableStream(base), true);
  assert.equal(isPlayableStream({ ...base, url: 'http://gooz.aapmains.net/new-stream-embed/100' }), false);
  assert.equal(isPlayableStream({ ...base, url: 'https://gooz.aapmains.net/other/100' }), false);
  assert.equal(
    isPlayableStream({ ...base, kind: 'direct', url: 'https://cdn.example.com/a.m3u8', trustedHosts: ['cdn.example.com'] }),
    false,
  );
  assert.equal(isPlayableStream({ ...base, url: 'https://player.example.com/x', trustedHosts: ['https://cdn.example.com'] }), false);
  assert.equal(isPlayableStream({ ...base, url: 'https://player.example.com/x', trustedHosts: ['cdn.example.com'] }), true);
  assert.equal(isPlayableStream({ ...base, kind: 'youtube', url: 'https://www.youtube.com/shorts/abcdefghijk' }), false);
  assert.equal(isPlayableStream({ ...base, kind: 'youtube', url: 'https://youtu.be/abcdefghijk' }), true);
  assert.equal(isPlayableStream({ ...base, url: `https://player.example.com/${'a'.repeat(2048)}` }), false);
});

test('a school entry must name one of the school\'s sports and a pro entry none', () => {
  const base = pipelineEntry(['2026-09-12'], 100);
  assert.equal(isPlayableStream({ ...base, sport: 'football' }), false, 'pro file with a sport');
  assert.equal(isPlayableStream(base, schoolValidation), false, 'school file with no sport');
  assert.equal(isPlayableStream({ ...base, sport: 'football' }, schoolValidation), true);
  assert.equal(isPlayableStream({ ...base, sport: 'hockey' }, schoolValidation), false);
});

test('upsert replaces only pipeline entries and keeps hand-written ones for the game', () => {
  const hand = handEntry(['2026-09-12']);
  const brokenHand = { ...handEntry(['2026-09-12'], 'http://media.example.invalid/a.m3u8') };
  const old = pipelineEntry(['2026-09-12'], 100);
  const next = pipelineEntry(['2026-09-12'], 200);
  const updated = upsertStream(documentWith(hand, brokenHand, old), next, game);
  assert.deepEqual(updated.streams.slice(2), [hand, brokenHand, next]);
});

test('a provider entry written by hand is not the pipeline\'s to replace', () => {
  const hand = { ...pipelineEntry(['2026-09-12'], 100) };
  delete hand.source;
  const next = pipelineEntry(['2026-09-12'], 200);
  const updated = upsertStream(documentWith(hand), next, game);
  assert.deepEqual(updated.streams.slice(2), [hand, next]);
});

test('upsert takes only this game\'s date from a multi-date pipeline entry', () => {
  const shared = pipelineEntry(['2026-09-12', '2026-09-13'], 100);
  const next = pipelineEntry(['2026-09-12'], 200);
  assert.deepEqual(upsertStream(documentWith(shared), next, game).streams.slice(2), [
    { ...shared, gameDates: ['2026-09-13'] },
    next,
  ]);
});

test('upserts in a school file touch only the same sport', () => {
  const basketball = { gameNumber: 1, gamePk: 900001, officialDate: '2026-11-07', sport: 'mens-basketball' };
  const football = pipelineEntry(['2026-11-07'], 100, { sport: 'football' });
  const next = pipelineEntry(['2026-11-07'], 200, { sport: 'mens-basketball' });
  const plan = planStreamUpdate(documentWith(football), {
    entry: next,
    game: basketball,
    today: '2026-11-07',
    validation: schoolValidation,
  });
  assert.deepEqual(plan.document.streams.slice(2), [football, next]);
});

test('pruning drops entries whose every date is more than 7 days old and keeps the rest', () => {
  const eightDaysOld = handEntry(['2026-09-21']);
  const sevenDaysOld = handEntry(['2026-09-22']);
  const mixed = handEntry(['2026-08-01', '2026-09-28']);
  const unparseable = handEntry(['2026-9-1']);
  const pruned = pruneStaleStreams(documentWith(eightDaysOld, sevenDaysOld, mixed, unparseable), '2026-09-29');
  assert.deepEqual(pruned.HOW_TO_GUIDE, GUIDE);
  assert.deepEqual(pruned.streams, [MARKER, EXAMPLE, sevenDaysOld, mixed, unparseable]);
});

test('the plan reports video_ready and unchanged without writing', () => {
  const today = '2026-09-12';
  const valid = pipelineEntry(['2026-09-12'], 100);
  const next = pipelineEntry(['2026-09-12'], 200);
  assert.equal(planStreamUpdate(documentWith(valid), { entry: next, game, today }).outcome, 'video_ready');
  assert.equal(planStreamUpdate(documentWith(valid), { entry: valid, force: true, game, today }).outcome, 'unchanged');
  assert.ok(findEquivalentStream(documentWith(valid), game, valid));
  const forced = planStreamUpdate(documentWith(valid), { entry: next, force: true, game, today });
  assert.equal(forced.outcome, 'update');
  assert.deepEqual(forced.document.streams.slice(2), [next]);
});

test('past 200 entry objects only the last 200 count, as on the phone', () => {
  const today = '2026-09-12';
  const early = pipelineEntry(['2026-09-12'], 100);
  const filler = Array.from({ length: 200 }, (_, index) =>
    pipelineEntry(['2026-09-11'], 1000 + index, { eventId: String(1000 + index) }),
  );
  const document = { streams: [MARKER, early, ...filler] };
  assert.equal(findPlayableStreamForGame(document, game), undefined, 'first object is out of scope');
  const next = pipelineEntry(['2026-09-12'], 200);
  const plan = planStreamUpdate(document, { entry: next, game, today });
  assert.equal(plan.outcome, 'update');
  assert.equal(plan.document.streams.at(-1), next);
  assert.deepEqual(findPlayableStreamForGame(plan.document, game), next);
});

test('the plan prunes stale entries when it writes', () => {
  const stale = handEntry(['2026-08-01']);
  const next = pipelineEntry(['2026-09-12'], 200);
  const plan = planStreamUpdate(documentWith(stale), { entry: next, game, today: '2026-09-12' });
  assert.deepEqual(plan.document.streams, [MARKER, EXAMPLE, next]);
});

test('a document must hold a streams array', () => {
  assert.throws(() => parseStreamsDocument('{}'), /streams array/);
  assert.equal(serializeStreamsDocument({ a: 1 }), '{\n  "a": 1\n}\n');
});

test('the stream-match cases shared with the phone agree', () => {
  const { cases } = JSON.parse(
    readFileSync(new URL('../../../tests/fixtures/stream-match.json', import.meta.url), 'utf8'),
  );
  for (const { game, matches, name, stream } of cases) {
    assert.equal(streamMatchesGame(stream, game), matches, name);
  }
});
