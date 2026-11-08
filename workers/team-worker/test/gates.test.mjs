import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_LIMITS,
  GlobalGateCore,
  MemoryStorage,
  TeamGateCore,
  rateLimitKey,
  readLimits,
  serialized,
} from '../src/gates.js';

const IP = 'v4:203.0.113.7';

function teamGate(limits = {}) {
  const clock = { now: 1_000_000_000 };
  const storage = new MemoryStorage();
  return { clock, gate: new TeamGateCore(storage, { ...DEFAULT_LIMITS, ...limits }, () => clock.now), storage };
}

function globalGate(limits = {}) {
  const clock = { now: 1_000_000_000 };
  const storage = new MemoryStorage();
  return { clock, gate: new GlobalGateCore(storage, { ...DEFAULT_LIMITS, ...limits }, () => clock.now), storage };
}

test('readLimits reads each var and keeps defaults for missing or malformed values', () => {
  assert.deepEqual(readLimits({}), { ...DEFAULT_LIMITS });
  const limits = readLimits({ COOLDOWN_SECONDS: '60', GLOBAL_DISPATCH_PER_HOUR: 0, GLOBAL_IN_FLIGHT_MAX: 'many', IP_DISPATCH_PER_HOUR: -2 });
  assert.equal(limits.cooldownSeconds, 60);
  assert.equal(limits.globalDispatchPerHour, 0);
  assert.equal(limits.globalInFlightMax, DEFAULT_LIMITS.globalInFlightMax);
  assert.equal(limits.ipDispatchPerHour, DEFAULT_LIMITS.ipDispatchPerHour);
});

test('the O8 defaults are the approved numbers', () => {
  assert.deepEqual({ ...DEFAULT_LIMITS }, {
    cooldownSeconds: 180,
    gameDispatchMax: 10,
    globalDispatchPerHour: 60,
    globalInFlightMax: 15,
    ipDispatchPerHour: 20,
    ipFailedKeyPerHour: 10,
    ipTeamDispatchPer10Min: 3,
  });
});

test('TeamGate cooldown answers in_progress until it ends and records the requested step', async () => {
  const { clock, gate } = teamGate({ ipTeamDispatchPer10Min: 99 });
  const first = await gate.reserve(IP, '401');
  assert.equal(first.ok, true);
  clock.now += 179_000;
  const second = await gate.reserve(IP, '401');
  assert.deepEqual(second, { code: 'in_progress', ok: false, retryAfterSeconds: 1 });
  assert.equal((await gate.readState('401')).progress.step, 'requested');
  clock.now += 1000;
  assert.equal((await gate.reserve(IP, '401')).ok, true);
});

test('TeamGate cooldown does not overwrite a newer progress step', async () => {
  const { clock, gate } = teamGate();
  await gate.reserve(IP, '401');
  await gate.recordProgress({ eventId: '401', k: 2, n: 3, step: 'source_start' });
  clock.now += 5000;
  await gate.reserve(IP, '401');
  assert.equal((await gate.readState('401')).progress.step, 'source_start');
});

test('TeamGate IP+team limit counts across events and reports Retry-After seconds', async () => {
  const { clock, gate } = teamGate();
  for (const eventId of ['1', '2', '3']) {
    assert.equal((await gate.reserve(IP, eventId)).ok, true);
  }
  const refused = await gate.reserve(IP, '4');
  assert.equal(refused.code, 'rate_limited');
  assert.equal(refused.retryAfterSeconds, 600);
  assert.equal((await gate.reserve('v4:198.51.100.2', '4')).ok, true);
  clock.now += 600_000;
  assert.equal((await gate.reserve(IP, '5')).ok, true);
});

test('TeamGate per-game cap applies after the cooldown and IP checks', async () => {
  const { clock, gate } = teamGate({ cooldownSeconds: 0, gameDispatchMax: 2, ipTeamDispatchPer10Min: 99 });
  assert.equal((await gate.reserve(IP, '401')).ok, true);
  clock.now += 1;
  assert.equal((await gate.reserve(IP, '401')).ok, true);
  clock.now += 1;
  const refused = await gate.reserve(IP, '401');
  assert.equal(refused.code, 'game_limit');
  assert.equal(refused.retryAfterSeconds > 0, true);
  assert.equal((await gate.reserve(IP, '402')).ok, true);
});

test('TeamGate release returns the cooldown, the IP count and the game count', async () => {
  const { clock, gate } = teamGate({ cooldownSeconds: 180, gameDispatchMax: 1, ipTeamDispatchPer10Min: 1 });
  const first = await gate.reserve(IP, '401');
  await gate.release(first.reservation);
  clock.now += 1;
  assert.equal((await gate.reserve(IP, '401')).ok, true);
});

test('TeamGate state moves from queued to the final code and expires', async () => {
  const { clock, gate } = teamGate();
  assert.equal((await gate.readState('401')).state, 'none');
  await gate.markQueued('401');
  assert.equal((await gate.readState('401')).state, 'queued');
  assert.deepEqual(await gate.recordStatus({ code: 'no_video', eventId: '401', runId: '1' }), { fresh: true });
  assert.equal((await gate.readState('401')).state, 'no_video');
  clock.now += 30 * 60_000;
  assert.equal((await gate.readState('401')).state, 'none');
});

test('TeamGate ignores a repeated run report', async () => {
  const { gate } = teamGate();
  await gate.markQueued('401');
  assert.deepEqual(await gate.recordStatus({ code: 'no_video', eventId: '401', runId: '9' }), { fresh: true });
  assert.deepEqual(await gate.recordStatus({ code: 'published', eventId: '401', runId: '9' }), { fresh: false });
  assert.equal((await gate.readState('401')).state, 'no_video');
});

test('an earlier unsuccessful run leaves a later dispatch queued; a publish resolves it', async () => {
  const { gate } = teamGate();
  await gate.markQueued('401');
  await gate.markQueued('401');
  await gate.recordStatus({ code: 'no_video', eventId: '401', runId: '1' });
  assert.equal((await gate.readState('401')).state, 'queued');
  await gate.recordStatus({ code: 'published', eventId: '401', runId: '2' });
  assert.equal((await gate.readState('401')).state, 'published');
  await gate.recordStatus({ code: 'no_video', eventId: '401', runId: '3' });
  assert.equal((await gate.readState('401')).state, 'published');
});

test('progress holds step k n and ages out after 30 minutes', async () => {
  const { clock, gate } = teamGate();
  await gate.recordProgress({ eventId: '401', k: 1, n: 3, step: 'source_start' });
  clock.now += 7000;
  assert.deepEqual((await gate.readState('401')).progress, { k: 1, n: 3, step: 'source_start', updatedSecondsAgo: 7 });
  clock.now += 30 * 60_000;
  assert.equal((await gate.readState('401')).progress, undefined);
});

test('TeamGate sweep deletes old games and IP lists and keeps current ones', async () => {
  const { clock, gate, storage } = teamGate();
  await gate.reserve(IP, '401');
  assert.equal(await gate.sweep(), true);
  clock.now += 48 * 60 * 60_000;
  assert.equal(await gate.sweep(), false);
  assert.equal((await storage.list()).size, 0);
});

test('GlobalGate locks an IP out at the key attempt limit, then lets it back', async () => {
  const { clock, gate } = globalGate({ ipFailedKeyPerHour: 2 });
  assert.equal((await gate.consumeKeyAttempt(IP)).ok, true);
  assert.equal((await gate.consumeKeyAttempt(IP)).ok, true);
  const locked = await gate.consumeKeyAttempt(IP);
  assert.equal(locked.code, 'rate_limited');
  assert.equal(locked.retryAfterSeconds, 3600);
  assert.equal((await gate.consumeKeyAttempt('v4:198.51.100.2')).ok, true);
  clock.now += 3_600_000;
  assert.equal((await gate.consumeKeyAttempt(IP)).ok, true);
});

test('a refunded key attempt does not count, even at the limit', async () => {
  const { gate, storage } = globalGate({ ipFailedKeyPerHour: 1 });
  const first = await gate.consumeKeyAttempt(IP);
  assert.equal((await gate.consumeKeyAttempt(IP)).ok, false);
  await gate.refundKeyAttempt(IP, first.at);
  assert.equal((await storage.list({ prefix: 'failed:' })).size, 0);
  assert.equal((await gate.consumeKeyAttempt(IP)).ok, true);
});

test('serialized runs a burst one call at a time, so the attempt count cannot be raced', async () => {
  const { gate } = globalGate({ ipFailedKeyPerHour: 3 });
  const serial = serialized(gate);
  const results = await Promise.all(Array.from({ length: 20 }, () => serial.consumeKeyAttempt(IP)));
  assert.equal(results.filter((result) => result.ok).length, 3);
});

test('GlobalGate checks the IP limit, then in-flight, then the hourly limit', async () => {
  const ipLimited = globalGate({ ipDispatchPerHour: 1 });
  await ipLimited.gate.reserve(IP, 'a');
  assert.equal((await ipLimited.gate.reserve(IP, 'b')).code, 'rate_limited');

  const flightLimited = globalGate({ globalDispatchPerHour: 1, globalInFlightMax: 1 });
  await flightLimited.gate.reserve('v4:1.1.1.1', 'a');
  const busy = await flightLimited.gate.reserve('v4:2.2.2.2', 'b');
  assert.equal(busy.code, 'busy');
  assert.equal(busy.retryAfterSeconds, 1200);

  const hourLimited = globalGate({ globalDispatchPerHour: 1 });
  await hourLimited.gate.reserve('v4:1.1.1.1', 'a');
  const hourBusy = await hourLimited.gate.reserve('v4:2.2.2.2', 'b');
  assert.equal(hourBusy.code, 'busy');
  assert.equal(hourBusy.retryAfterSeconds, 3600);
});

test('GlobalGate release and completeRun free capacity', async () => {
  const { gate } = globalGate({ globalInFlightMax: 1 });
  const first = await gate.reserve(IP, 'a');
  await gate.release(first.reservation);
  const second = await gate.reserve(IP, 'a');
  assert.equal(second.ok, true);
  await gate.completeRun('a');
  assert.equal((await gate.reserve(IP, 'b')).ok, true);
  await gate.completeRun('missing');
  assert.equal((await gate.reserve(IP, 'c')).code, 'busy');
});

test('an in-flight slot that never reports is released after 20 minutes', async () => {
  const { clock, gate } = globalGate({ globalInFlightMax: 1 });
  await gate.reserve(IP, 'a');
  clock.now += 20 * 60_000 - 1;
  assert.equal((await gate.reserve(IP, 'b')).code, 'busy');
  clock.now += 1;
  assert.equal((await gate.reserve(IP, 'b')).ok, true);
});

test('GlobalGate sweep removes expired records', async () => {
  const { clock, gate, storage } = globalGate();
  await gate.reserve(IP, 'a');
  await gate.consumeKeyAttempt(IP);
  clock.now += 3_600_000;
  assert.equal(await gate.sweep(), false);
  assert.equal((await storage.list()).size, 0);
});

function keyFor(address) {
  return rateLimitKey(new Request('https://worker.test/', { headers: { 'CF-Connecting-IP': address } }));
}

test('rateLimitKey groups IPv6 by /64 and normalizes IPv4', () => {
  assert.equal(keyFor('203.0.113.7'), 'v4:203.0.113.7');
  assert.equal(keyFor('::ffff:203.0.113.7'), 'v4:203.0.113.7');
  assert.equal(keyFor('2001:db8:1:2:3:4:5:6'), 'v6:2001:0db8:0001:0002::/64');
  assert.equal(keyFor('2001:db8:1:2:aaaa::1'), 'v6:2001:0db8:0001:0002::/64');
  assert.equal(keyFor('not-an-address'), 'raw:not-an-address');
  assert.equal(rateLimitKey(new Request('https://worker.test/')), 'unknown');
});
