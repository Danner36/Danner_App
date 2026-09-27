import assert from 'node:assert/strict';
import test from 'node:test';

import { isWithinGetVideoWindow } from './lib/pipeline.mjs';

test('an unpublished MLB start time stays outside the get-video window', () => {
  const game = {
    abstractState: 'Preview',
    gameDate: '2026-10-03T07:33:00Z',
    status: 'Scheduled',
    timeValid: false,
  };
  const afternoon = new Date('2026-10-03T18:00:00Z');
  assert.equal(isWithinGetVideoWindow(game, afternoon, 15), false);
});

test('a published start time opens 15 minutes before first pitch', () => {
  const game = {
    abstractState: 'Preview',
    gameDate: '2026-10-03T20:08:00Z',
    status: 'Scheduled',
    timeValid: true,
  };
  const tooEarly = new Date('2026-10-03T19:00:00Z');
  const open = new Date('2026-10-03T19:53:00Z');
  assert.equal(isWithinGetVideoWindow(game, tooEarly, 15), false);
  assert.equal(isWithinGetVideoWindow(game, open, 15), true);
});

test('a game with no timeValid flag still uses its start time', () => {
  const game = {
    abstractState: 'Preview',
    gameDate: '2026-10-03T20:08:00Z',
    status: 'Scheduled',
  };
  const open = new Date('2026-10-03T19:53:00Z');
  assert.equal(isWithinGetVideoWindow(game, open, 15), true);
});
