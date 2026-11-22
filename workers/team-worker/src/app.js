// Worker routes. See `Docs/Production/ModularTeams.md`, Worker v2, for the contract.

import {
  LEAGUE_KEY_PATTERN,
  TEAM_KEY_PATTERN,
  createBlobs,
  createCatalogStore,
  isSchool,
  splitTeamKey,
} from './catalog.js';
import { validateFoundCandidate } from '../../../scripts/stream-pipeline/lib/candidateCheck.mjs';
import { checkedTeamSpec } from '../../../scripts/stream-pipeline/lib/teamSpec.mjs';
import { createEventChecker } from './events.js';
import { createLocalGates, rateLimitKey } from './gates.js';
import { UpstreamError, createGithubClient, dispatchTeamGetVideo } from './github.js';
import { createPrefetcher } from './prefetch.js';
import { createStreamsStore, emptyDocumentText, hasReadyEntry } from './streams.js';

const CONTRACT_VERSION = 2;
const JSON_TYPE = 'application/json; charset=utf-8';
const EVENT_ID_PATTERN = /^\d{1,12}$/;
const SPORT_SHAPE_PATTERN = /^[a-z][a-z-]{0,31}$/;
const FINAL_CODE_PATTERN = /^[a-z][a-z_]{0,39}$/;
const RUN_ID_PATTERN = /^\d{1,20}$/;
const MAX_BODY_BYTES = 4096;
const SIGNATURE_HEADER = 'X-Signature';
const SIGNATURE_WINDOW_MS = 300 * 1000;
const PROGRESS_STEPS = new Set(['source_start', 'found']);
const MAX_PROGRESS_SITES = 20;
const READ_LIMIT = 120;
const READ_WINDOW_MS = 60 * 1000;
const READ_BUCKET_MAX = 10_000;
const GATE_RETRY_SECONDS = 60;
// How stale the streams folder index may be once a run for the polled game has published.
const PUBLISHED_REFRESH_MS = 2 * 1000;
const DEMAND_LIST_DEFAULT = 20;
const DEMAND_LIST_MAX = 50;
const APP_KEY_HEADER = 'X-App-Key';
// Run codes that mean the sources had no video for the game, and codes that mean a video exists.
const MISS_CODES = new Set(['ambiguous_link', 'deadline', 'no_video', 'sources_unreachable']);
const FOUND_CODES = new Set(['published', 'unchanged', 'video_ready']);
const RUN_ORIGINS = new Set(['manual', 'phone', 'prefetch']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OPPONENT_PATTERN = /^[\p{L}\p{N} .&'()-]{1,60}$/u;

function reply(status, code, message, { retryAfterSeconds = null, sport = null, team = null } = {}) {
  const headers = { 'Cache-Control': 'no-store', 'Content-Type': JSON_TYPE };
  if (status >= 400 && retryAfterSeconds !== null) {
    headers['Retry-After'] = String(retryAfterSeconds);
  }
  return new Response(
    `${JSON.stringify({ code, message, ok: status < 400, retryAfterSeconds, sport, team })}\n`,
    { headers, status },
  );
}

function etagMatches(header, etag) {
  if (!header) {
    return false;
  }
  return header.split(',').some((value) => {
    const candidate = value.trim().replace(/^W\//, '');
    return candidate === '*' || candidate === etag;
  });
}

// `ETag` is always the quoted blob SHA, or the hash of the generated body for an empty document.
function documentResponse(request, text, etag, extraHeaders = {}) {
  const headers = { 'Cache-Control': 'no-store', ETag: etag, ...extraHeaders };
  if (etagMatches(request.headers.get('If-None-Match'), etag)) {
    return new Response(null, { headers, status: 304 });
  }
  return new Response(text, { headers: { ...headers, 'Content-Type': JSON_TYPE }, status: 200 });
}

function bytes(text) {
  return new TextEncoder().encode(text);
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', bytes(text)));
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    bytes(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, bytes(text)));
}

// Compares in time independent of where the first mismatch falls, so a caller cannot learn the
// value one character at a time from response timing.
function pinMatches(candidate, expected) {
  if (typeof candidate !== 'string' || typeof expected !== 'string') {
    return false;
  }
  let mismatch = candidate.length ^ expected.length;
  for (let index = 0; index < expected.length; index += 1) {
    // charCodeAt past the end is NaN, which coerces to 0 in a bitwise op; a short candidate is
    // already caught by the length check above.
    mismatch |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

function appKeyMatches(candidate, env) {
  const current = pinMatches(candidate, env.APP_KEY);
  const previous = env.APP_KEY_PREVIOUS ? pinMatches(candidate, env.APP_KEY_PREVIOUS) : false;
  return current || previous;
}

function parseJsonObject(text) {
  try {
    const value = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

// The body as text, or undefined once it passes the limit. Reading stops at the limit, so a chunked
// body with no Content-Length is never read in full.
async function boundedText(request) {
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) {
    return undefined;
  }
  if (!request.body) {
    return '';
  }
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      reader.cancel().catch(() => {});
      return undefined;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

// Accepts an ISO 8601 string or a number of seconds or milliseconds since the epoch.
function atMilliseconds(value) {
  if (typeof value === 'string') {
    return Date.parse(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 1e12 ? value : value * 1000;
  }
  return NaN;
}

function runIdText(value) {
  const text = typeof value === 'number' ? String(value) : value;
  return typeof text === 'string' && RUN_ID_PATTERN.test(text) ? text : undefined;
}

function sportField(value) {
  return value === undefined || value === null ? undefined : value;
}

export function createApp({
  fetchImpl = (...args) => fetch(...args),
  log = (...args) => console.error(...args),
  now = () => Date.now(),
} = {}) {
  const client = createGithubClient({ fetchImpl });
  const blobs = createBlobs({ client, log, now });
  const catalog = createCatalogStore({ blobs, client, log, now });
  const streams = createStreamsStore({ blobs, client, log, now });
  const events = createEventChecker({ fetchImpl, log, now });
  const localGates = createLocalGates(now);
  const readBuckets = new Map();
  let repoEtag;

  // Runs `method` on the Durable Object when it is bound, otherwise on the per-isolate gate, which
  // is the Free-plan case. `local` on the result records which one served, so a later release goes
  // to the same place. A strict call on a bound object that fails answers `unavailable`, because a
  // per-isolate count there would let a limit be evaded by reaching other isolates.
  async function callGate(stubFactory, localGate, method, args, { strict = false } = {}) {
    if (stubFactory) {
      try {
        return { local: false, value: await stubFactory()[method](...args) };
      } catch (error) {
        log('gate call failed', method, error instanceof Error ? error.name : 'error');
        if (strict) {
          return { unavailable: true };
        }
      }
    }
    return { local: true, value: await localGate[method](...args) };
  }

  function teamStub(env, teamKey) {
    if (!env.TEAM_GATE) {
      return undefined;
    }
    return () => env.TEAM_GATE.get(env.TEAM_GATE.idFromName(teamKey));
  }

  function globalStub(env) {
    if (!env.GLOBAL_GATE) {
      return undefined;
    }
    return () => env.GLOBAL_GATE.get(env.GLOBAL_GATE.idFromName('global'));
  }

  const teamGate = (env, teamKey, method, ...args) =>
    callGate(teamStub(env, teamKey), localGates.team(env, teamKey), method, args);
  const globalGate = (env, method, ...args) =>
    callGate(globalStub(env), localGates.global(env), method, args);
  const strictTeamGate = (env, teamKey, method, ...args) =>
    callGate(teamStub(env, teamKey), localGates.team(env, teamKey), method, args, { strict: true });
  const strictGlobalGate = (env, method, ...args) =>
    callGate(globalStub(env), localGates.global(env), method, args, { strict: true });

  // A release that fails leaves the slot to expire on its own; the caller still answers.
  async function releaseQuietly(gate, reservation) {
    try {
      await gate.release(reservation);
    } catch (error) {
      log('gate release failed', error instanceof Error ? error.name : 'error');
    }
  }

  function readAllowedLocally(key) {
    const nowMs = now();
    if (readBuckets.size >= READ_BUCKET_MAX) {
      for (const [bucketKey, stamps] of readBuckets) {
        if (stamps.every((stamp) => nowMs - stamp >= READ_WINDOW_MS)) {
          readBuckets.delete(bucketKey);
        }
      }
    }
    const recent = (readBuckets.get(key) ?? []).filter((stamp) => nowMs - stamp < READ_WINDOW_MS);
    if (recent.length >= READ_LIMIT) {
      readBuckets.set(key, recent);
      return false;
    }
    readBuckets.set(key, [...recent, nowMs]);
    return true;
  }

  async function readAllowed(env, request) {
    const key = rateLimitKey(request);
    if (typeof env.READ_LIMITER?.limit === 'function') {
      try {
        return (await env.READ_LIMITER.limit({ key })).success;
      } catch (error) {
        log('read limiter failed, using the per-isolate count', error instanceof Error ? error.name : 'error');
      }
    }
    return readAllowedLocally(key);
  }

  const readLimited = () =>
    reply(429, 'rate_limited', 'Too many requests.', { retryAfterSeconds: 60 });
  const notConfigured = (scope) => reply(500, 'not_configured', 'Worker secrets are not configured.', scope);
  const upstreamFailed = (scope) => reply(502, 'upstream_error', 'Upstream read failed.', scope);
  const gateUnavailable = (scope) =>
    reply(503, 'busy', 'Too many requests.', { ...scope, retryAfterSeconds: GATE_RETRY_SECONDS });

  async function githubReachable(env) {
    let response;
    try {
      response = await client.request(env, '', { etag: repoEtag });
    } catch (error) {
      log('github health read failed', error instanceof Error ? error.name : 'error');
      return false;
    }
    if (response.status === 304) {
      return true;
    }
    if (!response.ok) {
      log('github health read failed', String(response.status));
      return false;
    }
    repoEtag = response.headers.get('ETag') ?? repoEtag;
    return true;
  }

  async function handleHealth(request, env, url) {
    if (url.searchParams.get('deep') !== '1') {
      return new Response(`${JSON.stringify({ contract: CONTRACT_VERSION, ok: true })}\n`, {
        headers: { 'Cache-Control': 'no-store', 'Content-Type': JSON_TYPE },
      });
    }
    if (!(await readAllowed(env, request))) {
      return readLimited();
    }
    const reachable = Boolean(env.GITHUB_TOKEN) && (await githubReachable(env));
    return new Response(
      `${JSON.stringify({
        contract: CONTRACT_VERSION,
        github: reachable ? 'ok' : 'error',
        ok: reachable,
      })}\n`,
      { headers: { 'Cache-Control': 'no-store', 'Content-Type': JSON_TYPE } },
    );
  }

  async function handleCatalog(request, env, league) {
    if (league !== undefined && !LEAGUE_KEY_PATTERN.test(league)) {
      return reply(400, 'bad_league', 'Unknown league.');
    }
    if (!env.GITHUB_TOKEN) {
      return notConfigured();
    }
    if (!(await readAllowed(env, request))) {
      return readLimited();
    }
    try {
      const file = league === undefined ? await catalog.leaguesFile(env) : await catalog.teamsFile(env, league);
      if (!file) {
        return league === undefined
          ? upstreamFailed()
          : reply(400, 'bad_league', 'Unknown league.');
      }
      return documentResponse(request, file.text, `"${file.sha}"`);
    } catch (error) {
      if (error instanceof UpstreamError) {
        return upstreamFailed();
      }
      throw error;
    }
  }

  // { headers, state } for the game; `state` is undefined when the event id is malformed.
  async function runState(env, teamKey, eventId) {
    if (!EVENT_ID_PATTERN.test(eventId)) {
      return { headers: { 'X-Run-State': 'none' } };
    }
    const { value } = await teamGate(env, teamKey, 'readState', eventId);
    return {
      headers: {
        'X-Run-State': value.state,
        ...(value.progress ? { 'X-Run-Progress': JSON.stringify(value.progress) } : {}),
      },
      state: value,
    };
  }

  // The served document with the early entry appended, unless the file already holds a ready
  // entry for the game. The phone reads the last 200 objects, so an appended entry is in scope.
  async function withEarlyEntry(request, text, earlyEntry, headers) {
    const document = parseJsonObject(text);
    const game = { eventId: earlyEntry.eventId, officialDate: earlyEntry.gameDates[0], sport: earlyEntry.sport };
    if (!document || hasReadyEntry(document, game)) {
      return undefined;
    }
    const merged = `${JSON.stringify({
      ...document,
      streams: [...(Array.isArray(document.streams) ? document.streams : []), earlyEntry],
    })}\n`;
    const etag = `"early-${(await sha256Hex(merged)).slice(0, 32)}"`;
    return documentResponse(request, merged, etag, { ...headers, 'X-Streams-State': 'early' });
  }

  async function handleStreams(request, env, url) {
    const teamKey = url.searchParams.get('team') ?? '';
    if (!TEAM_KEY_PATTERN.test(teamKey)) {
      return reply(400, 'bad_team', 'Unknown team.');
    }
    if (!env.GITHUB_TOKEN) {
      return notConfigured({ team: teamKey });
    }
    if (!(await readAllowed(env, request))) {
      return readLimited();
    }

    const scope = { team: teamKey };
    try {
      const entry = await catalog.team(env, teamKey);
      if (!entry) {
        return reply(400, 'bad_team', 'Unknown team.', scope);
      }
      const eventId = url.searchParams.get('event');
      const { headers: stateHeaders, state } = eventId === null ? { headers: {} } : await runState(env, teamKey, eventId);
      const { espnId, league } = splitTeamKey(teamKey);
      // Right after a run publishes, the folder index is re-read instead of waiting out its cache;
      // a conditional read that finds nothing new costs no rate limit.
      const justPublished = state?.state === 'published' || state?.entry !== undefined;
      const file = await streams.read(env, league, espnId, justPublished ? { maxAgeMs: PUBLISHED_REFRESH_MS } : {});
      const text = file ? file.text : emptyDocumentText(entry);
      if (state?.entry) {
        const early = await withEarlyEntry(request, text, state.entry, stateHeaders);
        if (early) {
          return early;
        }
      }
      if (file) {
        return documentResponse(request, file.text, `"${file.sha}"`, stateHeaders);
      }
      const etag = `"empty-${(await sha256Hex(text)).slice(0, 32)}"`;
      return documentResponse(request, text, etag, {
        ...stateHeaders,
        'X-Streams-State': 'empty',
      });
    } catch (error) {
      if (error instanceof UpstreamError) {
        return upstreamFailed(scope);
      }
      throw error;
    }
  }

  async function handleGetVideo(request, env) {
    if (!env.APP_KEY || !env.RUN_STATUS_KEY || !env.GITHUB_TOKEN) {
      return notConfigured();
    }
    const text = await boundedText(request);
    const body = text === undefined ? undefined : parseJsonObject(text);
    if (!body) {
      return reply(400, 'bad_request', 'Request body must be a JSON object.');
    }

    // Shape checks cost nothing and need no external read.
    const teamKey = typeof body.team === 'string' ? body.team : '';
    if (!TEAM_KEY_PATTERN.test(teamKey)) {
      return reply(400, 'bad_team', 'Unknown team.');
    }
    const sport = sportField(body.sport);
    if (sport !== undefined && (typeof sport !== 'string' || !SPORT_SHAPE_PATTERN.test(sport))) {
      return reply(400, 'bad_sport', 'Unknown sport.', { team: teamKey });
    }
    const scope = { sport: sport ?? null, team: teamKey };
    const eventId = typeof body.eventId === 'string' ? body.eventId : '';
    if (!EVENT_ID_PATTERN.test(eventId)) {
      return reply(400, 'bad_event', 'Unknown event.', scope);
    }

    // The key check comes before any external call, so a caller without the key cannot make the
    // Worker read GitHub, ESPN or statsapi. The attempt limit is IP-wide because a per-team limit
    // alone would allow guesses across about a thousand catalog keys.
    const ip = rateLimitKey(request);
    const attempt = await strictGlobalGate(env, 'consumeKeyAttempt', ip);
    if (attempt.unavailable) {
      return gateUnavailable(scope);
    }
    if (!attempt.value.ok) {
      return reply(429, 'rate_limited', 'Too many requests.', {
        ...scope,
        retryAfterSeconds: attempt.value.retryAfterSeconds,
      });
    }
    if (!appKeyMatches(body.appKey, env)) {
      return reply(401, 'unauthorized', 'Unauthorized.', scope);
    }
    try {
      const gate = attempt.local ? localGates.global(env) : globalStub(env)();
      await gate.refundKeyAttempt(ip, attempt.value.at);
    } catch (error) {
      log('key attempt refund failed', error instanceof Error ? error.name : 'error');
    }

    let entry;
    try {
      entry = await catalog.team(env, teamKey);
    } catch (error) {
      if (error instanceof UpstreamError) {
        return upstreamFailed(scope);
      }
      throw error;
    }
    if (!entry) {
      return reply(400, 'bad_team', 'Unknown team.', scope);
    }
    if (isSchool(entry) ? !entry.sports.includes(sport) : sport !== undefined) {
      return reply(400, 'bad_sport', 'Unknown sport.', scope);
    }

    const { espnId, league } = splitTeamKey(teamKey);
    const leagueRow = await catalog.leagueRow(env, league);
    const event = await events.check({ entry, eventId, league, leagueRow, sport });
    if (event.outcome === 'bad_event') {
      return reply(400, 'bad_event', 'Unknown event.', scope);
    }
    // Every keyed request for a real game ranks its team and sport for prefetch, whatever happens
    // next. A failed count only loses one vote.
    try {
      await globalGate(env, 'recordDemand', { eventId, ip, sport, team: teamKey });
    } catch (error) {
      log('demand count failed', error instanceof Error ? error.name : 'error');
    }
    if (event.outcome === 'not_in_window') {
      return reply(409, 'not_in_window', 'The game is not inside the video window.', scope);
    }

    if (event.outcome === 'ok') {
      try {
        const document = await streams.readParsed(env, league, espnId);
        if (hasReadyEntry(document, { eventId, officialDate: event.officialDate, sport })) {
          return reply(200, 'video_ready', 'A video entry already exists.', scope);
        }
      } catch (error) {
        if (!(error instanceof UpstreamError)) {
          throw error;
        }
        log('readiness read failed, continuing to the gates');
      }
    }

    const started = await startRun(env, { eventId, ip, origin: 'phone', sport, teamKey });
    return reply(started.status, started.code, started.message, {
      ...scope,
      ...(started.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: started.retryAfterSeconds }),
    });
  }

  // Reserves the team and global gates and sends the dispatch. Shared by a phone's Get video and
  // the prefetcher, so both pass the same limits. Returns { status, code, message, retryAfterSeconds }.
  async function startRun(env, { eventId, ip, origin, sport, teamKey }) {
    const unavailable = { code: 'busy', message: 'Too many requests.', retryAfterSeconds: GATE_RETRY_SECONDS, status: 503 };
    const teamReserve = await strictTeamGate(env, teamKey, 'reserve', ip, eventId);
    if (teamReserve.unavailable) {
      return unavailable;
    }
    if (!teamReserve.value.ok) {
      const { code, retryAfterSeconds } = teamReserve.value;
      if (code === 'in_progress') {
        return { code, message: 'A run for this game was just started.', retryAfterSeconds, status: 202 };
      }
      return { code, message: 'Too many requests.', retryAfterSeconds, status: 429 };
    }

    const runKey = `${teamKey}|${eventId}`;
    const globalReserve = await strictGlobalGate(env, 'reserve', ip, runKey);
    const releaseTeam = () =>
      releaseQuietly(
        teamReserve.local ? localGates.team(env, teamKey) : teamStub(env, teamKey)(),
        teamReserve.value.reservation,
      );
    if (globalReserve.unavailable) {
      await releaseTeam();
      return unavailable;
    }
    if (!globalReserve.value.ok) {
      await releaseTeam();
      const { code, retryAfterSeconds } = globalReserve.value;
      return { code, message: 'Too many requests.', retryAfterSeconds, status: code === 'busy' ? 503 : 429 };
    }
    const releaseGlobal = () =>
      releaseQuietly(
        globalReserve.local ? localGates.global(env) : globalStub(env)(),
        globalReserve.value.reservation,
      );

    let dispatched = false;
    try {
      dispatched = await dispatchTeamGetVideo(
        client,
        env,
        {
          eventId,
          origin,
          requestedAt: new Date(now()).toISOString(),
          ...(sport === undefined ? {} : { sport }),
          team: teamKey,
        },
        log,
      );
    } catch (error) {
      log('github dispatch failed', error instanceof Error ? error.name : 'error');
    }
    if (!dispatched) {
      await releaseGlobal();
      await releaseTeam();
      return { code: 'dispatch_failed', message: 'Could not start the run.', status: 502 };
    }

    try {
      await teamGate(env, teamKey, 'markQueued', eventId);
    } catch (error) {
      log('could not record the queued state', error instanceof Error ? error.name : 'error');
    }
    return { code: 'started', message: 'Run started.', status: 202 };
  }

  // Verifies the signature before the body is parsed. Returns { body } or { response }.
  async function verifiedBody(request, secret) {
    const text = await boundedText(request);
    const header = (request.headers.get(SIGNATURE_HEADER) ?? '').replace(/^sha256=/, '');
    if (text === undefined || !pinMatches(header, await hmacHex(secret, text))) {
      return { response: reply(401, 'bad_signature', 'Signature check failed.') };
    }
    const body = parseJsonObject(text);
    if (!body) {
      return { response: reply(400, 'bad_request', 'Request body must be a JSON object.') };
    }
    const at = atMilliseconds(body.at);
    if (Number.isNaN(at) || Math.abs(now() - at) > SIGNATURE_WINDOW_MS) {
      return { response: reply(401, 'bad_signature', 'Signature check failed.') };
    }
    return { body };
  }

  function runFields(body) {
    if (
      typeof body.team !== 'string' ||
      !TEAM_KEY_PATTERN.test(body.team) ||
      typeof body.eventId !== 'string' ||
      !EVENT_ID_PATTERN.test(body.eventId)
    ) {
      return undefined;
    }
    const runId = runIdText(body.runId);
    return runId === undefined ? undefined : { eventId: body.eventId, runId, team: body.team };
  }

  // A refusal for a report whose team is not in the catalog, or undefined when it may proceed. Each
  // team key names a Durable Object, so a stolen signing key must not be able to create objects.
  async function reportTeamRefusal(env, teamKey) {
    try {
      return (await catalog.team(env, teamKey))
        ? undefined
        : reply(400, 'bad_request', 'Unknown team.', { team: teamKey });
    } catch (error) {
      if (error instanceof UpstreamError) {
        return upstreamFailed({ team: teamKey });
      }
      throw error;
    }
  }

  // Keeps the developer's missed-games list: a miss code adds the game, a later success marks it
  // found. Optional fields that fail their shape are dropped, never trusted.
  async function recordOutcome(env, body, fields) {
    const sport = typeof body.sport === 'string' && SPORT_SHAPE_PATTERN.test(body.sport) ? body.sport : undefined;
    const game = { eventId: fields.eventId, sport, team: fields.team };
    try {
      if (MISS_CODES.has(body.code)) {
        await globalGate(env, 'recordMiss', {
          ...game,
          code: body.code,
          officialDate: typeof body.officialDate === 'string' && DATE_PATTERN.test(body.officialDate) ? body.officialDate : undefined,
          opponent: typeof body.opponent === 'string' && OPPONENT_PATTERN.test(body.opponent) ? body.opponent : undefined,
          origin: RUN_ORIGINS.has(body.origin) ? body.origin : 'manual',
        });
      } else if (FOUND_CODES.has(body.code)) {
        await globalGate(env, 'resolveMiss', game);
      }
    } catch (error) {
      log('missed-games update failed', error instanceof Error ? error.name : 'error');
    }
  }

  // Checks the X-App-Key header the way Get video checks its key. Returns a refusal or undefined.
  async function keyedReadRefusal(request, env) {
    if (!env.APP_KEY) {
      return notConfigured();
    }
    if (!(await readAllowed(env, request))) {
      return readLimited();
    }
    const ip = rateLimitKey(request);
    const attempt = await strictGlobalGate(env, 'consumeKeyAttempt', ip);
    if (attempt.unavailable) {
      return gateUnavailable({});
    }
    if (!attempt.value.ok) {
      return reply(429, 'rate_limited', 'Too many requests.', { retryAfterSeconds: attempt.value.retryAfterSeconds });
    }
    if (!appKeyMatches(request.headers.get(APP_KEY_HEADER) ?? undefined, env)) {
      return reply(401, 'unauthorized', 'Unauthorized.');
    }
    try {
      const gate = attempt.local ? localGates.global(env) : globalStub(env)();
      await gate.refundKeyAttempt(ip, attempt.value.at);
    } catch (error) {
      log('key attempt refund failed', error instanceof Error ? error.name : 'error');
    }
    return undefined;
  }

  // Games whose runs found no video, with who asked (phone, prefetch, manual) and whether a later
  // run found it. `days` is 1 to 30, default 7.
  async function handleMissed(request, env, url) {
    const refusal = await keyedReadRefusal(request, env);
    if (refusal) {
      return refusal;
    }
    const asked = Number(url.searchParams.get('days') ?? 7);
    const days = Number.isInteger(asked) && asked >= 1 ? Math.min(asked, 30) : 7;
    const { value: rows } = await globalGate(env, 'listMisses', days);
    const iso = (ms) => new Date(ms).toISOString();
    const games = rows.map((row) => ({
      attempts: row.attempts,
      eventId: row.eventId,
      firstMissAt: iso(row.firstAt),
      ...(row.foundAt ? { foundLaterAt: iso(row.foundAt) } : {}),
      lastCode: row.lastCode,
      lastMissAt: iso(row.lastAt),
      ...(row.officialDate ? { officialDate: row.officialDate } : {}),
      ...(row.opponent ? { opponent: row.opponent } : {}),
      origins: row.origins,
      ...(row.sport ? { sport: row.sport } : {}),
      team: row.team,
    }));
    return new Response(`${JSON.stringify({ days, games, stillMissing: games.filter((game) => !game.foundLaterAt).length })}\n`, {
      headers: { 'Cache-Control': 'no-store', 'Content-Type': JSON_TYPE },
    });
  }

  async function handleRunStatus(request, env) {
    if (!env.RUN_STATUS_KEY || !env.GITHUB_TOKEN) {
      return notConfigured();
    }
    const { body, response } = await verifiedBody(request, env.RUN_STATUS_KEY);
    if (response) {
      return response;
    }
    const fields = runFields(body);
    if (!fields || typeof body.code !== 'string' || !FINAL_CODE_PATTERN.test(body.code)) {
      return reply(400, 'bad_request', 'Malformed run report.');
    }
    const refusal = await reportTeamRefusal(env, fields.team);
    if (refusal) {
      return refusal;
    }
    const { value } = await teamGate(env, fields.team, 'recordStatus', {
      code: body.code,
      eventId: fields.eventId,
      runId: fields.runId,
    });
    if (value.fresh) {
      await globalGate(env, 'completeRun', `${fields.team}|${fields.eventId}`);
      await recordOutcome(env, body, fields);
    }
    return new Response(null, { status: 204 });
  }

  async function handleRunProgress(request, env) {
    if (!env.RUN_PROGRESS_KEY || !env.GITHUB_TOKEN) {
      return notConfigured();
    }
    const { body, response } = await verifiedBody(request, env.RUN_PROGRESS_KEY);
    if (response) {
      return response;
    }
    const fields = runFields(body);
    const validCounts =
      Number.isInteger(body.k) &&
      Number.isInteger(body.n) &&
      body.k >= 1 &&
      body.k <= body.n &&
      body.n <= MAX_PROGRESS_SITES;
    if (!fields || !PROGRESS_STEPS.has(body.step) || !validCounts) {
      return reply(400, 'bad_request', 'Malformed progress report.');
    }
    const refusal = await reportTeamRefusal(env, fields.team);
    if (refusal) {
      return refusal;
    }
    await teamGate(env, fields.team, 'recordProgress', {
      eventId: fields.eventId,
      k: body.k,
      n: body.n,
      step: body.step,
    });
    return new Response(null, { status: 204 });
  }

  // The extract job's found entry, handed over before publish commits it. Signed with the progress
  // key, which the extract job already holds, and re-checked here with the publish job's own rules
  // against the catalog spec, so it can be no less checked than the entry publish would commit.
  async function handleRunEntry(request, env) {
    if (!env.RUN_PROGRESS_KEY || !env.GITHUB_TOKEN) {
      return notConfigured();
    }
    const { body, response } = await verifiedBody(request, env.RUN_PROGRESS_KEY);
    if (response) {
      return response;
    }
    const fields = runFields(body);
    const sport = sportField(body.sport);
    if (
      !fields ||
      (sport !== undefined && (typeof sport !== 'string' || !SPORT_SHAPE_PATTERN.test(sport))) ||
      typeof body.candidate !== 'object' ||
      body.candidate === null
    ) {
      return reply(400, 'bad_request', 'Malformed entry report.');
    }
    const refusal = await reportTeamRefusal(env, fields.team);
    if (refusal) {
      return refusal;
    }
    const { league } = splitTeamKey(fields.team);
    const [teamEntry, leagueRow] = await Promise.all([catalog.team(env, fields.team), catalog.leagueRow(env, league)]);
    const spec = checkedTeamSpec(leagueRow, teamEntry, sport);
    const validated = spec ? validateFoundCandidate(body.candidate, spec, fields.eventId) : undefined;
    if (!validated) {
      return reply(400, 'bad_entry', 'The entry failed its checks.', { team: fields.team });
    }
    const { value } = await teamGate(env, fields.team, 'recordEntry', {
      entry: validated.entry,
      eventId: fields.eventId,
      runId: fields.runId,
    });
    if (!value.ok) {
      return reply(409, 'not_running', 'No run was started for this game.', { team: fields.team });
    }
    return new Response(null, { status: 204 });
  }

  // The most requested team and sport pairs, which the prefetcher watches, and the same scores
  // summed per league and sport. Needs the app key in the X-App-Key header and counts failed keys
  // like Get video does.
  async function handleDemand(request, env, url) {
    const refusal = await keyedReadRefusal(request, env);
    if (refusal) {
      return refusal;
    }

    const asked = Number(url.searchParams.get('limit') ?? DEMAND_LIST_DEFAULT);
    const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, DEMAND_LIST_MAX) : DEMAND_LIST_DEFAULT;
    const { value: all } = await globalGate(env, 'topDemand', 1000);
    const round = (score) => Math.round(score * 100) / 100;
    const sports = new Map();
    for (const row of all) {
      const key = `${splitTeamKey(row.team).league}|${row.sport ?? ''}`;
      sports.set(key, (sports.get(key) ?? 0) + row.score);
    }
    const document = {
      halfLifeDays: 14,
      prefetchTopTeams: prefetcher.settings(env).topTeams,
      sports: [...sports]
        .map(([key, score]) => {
          const [league, sport] = key.split('|');
          return { league, score: round(score), ...(sport ? { sport } : {}) };
        })
        .sort((first, second) => second.score - first.score)
        .slice(0, limit),
      teams: all.slice(0, limit).map((row) => ({
        lastRequestedAt: new Date(row.lastAt).toISOString(),
        score: round(row.score),
        ...(row.sport ? { sport: row.sport } : {}),
        team: row.team,
      })),
    };
    return new Response(`${JSON.stringify(document)}\n`, {
      headers: { 'Cache-Control': 'no-store', 'Content-Type': JSON_TYPE },
    });
  }

  const prefetcher = createPrefetcher({
    catalog,
    fetchImpl,
    globalGate,
    log,
    now,
    startRun,
    streams,
    teamGate,
  });

  async function route(request, env) {
    const url = new URL(request.url);
    const { method } = request;
    const { pathname } = url;

    if (method === 'GET' && pathname === '/health') {
      return handleHealth(request, env, url);
    }
    if (method === 'GET' && pathname === '/catalog') {
      return handleCatalog(request, env, undefined);
    }
    if (method === 'GET' && pathname.startsWith('/catalog/')) {
      return handleCatalog(request, env, pathname.slice('/catalog/'.length));
    }
    if (method === 'GET' && pathname === '/streams') {
      return handleStreams(request, env, url);
    }
    if (method === 'POST' && pathname === '/get-video') {
      return handleGetVideo(request, env);
    }
    if (method === 'POST' && pathname === '/run-status') {
      return handleRunStatus(request, env);
    }
    if (method === 'POST' && pathname === '/run-progress') {
      return handleRunProgress(request, env);
    }
    if (method === 'POST' && pathname === '/run-entry') {
      return handleRunEntry(request, env);
    }
    if (method === 'GET' && pathname === '/demand') {
      return handleDemand(request, env, url);
    }
    if (method === 'GET' && pathname === '/missed') {
      return handleMissed(request, env, url);
    }
    return reply(404, 'not_found', 'Not found.');
  }

  return {
    async fetch(request, env) {
      try {
        return await route(request, env);
      } catch (error) {
        log('unhandled worker error', error instanceof Error ? error.name : 'error');
        return reply(500, 'internal_error', 'Worker error.');
      }
    },

    // The cron tick. Logs only team keys, event ids and codes.
    async scheduled(env) {
      if (!env.GITHUB_TOKEN || !env.RUN_STATUS_KEY) {
        return { off: true };
      }
      try {
        const summary = await prefetcher.run(env);
        if (summary.dispatched.length > 0 || summary.refreshed > 0) {
          log('prefetch tick', JSON.stringify(summary));
        }
        return summary;
      } catch (error) {
        log('prefetch tick failed', error instanceof Error ? error.name : 'error');
        return { failed: true };
      }
    },
  };
}
