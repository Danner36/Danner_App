// Worker routes. See `Docs/Production/ModularTeams.md`, Worker v2, for the contract.

import {
  LEAGUE_KEY_PATTERN,
  TEAM_KEY_PATTERN,
  createBlobs,
  createCatalogStore,
  isSchool,
  splitTeamKey,
} from './catalog.js';
import { createEventChecker } from './events.js';
import { createLocalGates, rateLimitKey } from './gates.js';
import { UpstreamError, createGithubClient, dispatchTeamGetVideo } from './github.js';
import { createStreamsStore, emptyDocumentText, hasReadyEntry } from './streams.js';

const CONTRACT_VERSION = 2;
const JSON_TYPE = 'application/json; charset=utf-8';
const EVENT_ID_PATTERN = /^\d{1,12}$/;
const SPORT_SHAPE_PATTERN = /^[a-z][a-z-]{0,31}$/;
const FINAL_CODE_PATTERN = /^[a-z][a-z_]{0,39}$/;
const RUN_ID_PATTERN = /^\d{1,20}$/;
const MAX_BODY_CHARS = 4096;
const SIGNATURE_HEADER = 'X-Signature';
const SIGNATURE_WINDOW_MS = 300 * 1000;
const PROGRESS_STEPS = new Set(['source_start', 'found']);
const MAX_PROGRESS_SITES = 20;
const READ_LIMIT = 120;
const READ_WINDOW_MS = 60 * 1000;
const READ_BUCKET_MAX = 10_000;

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

async function boundedText(request) {
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_CHARS) {
    return undefined;
  }
  const text = await request.text();
  return text.length <= MAX_BODY_CHARS ? text : undefined;
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
  const blobs = createBlobs({ client, log });
  const catalog = createCatalogStore({ blobs, client, log, now });
  const streams = createStreamsStore({ blobs, client, log, now });
  const events = createEventChecker({ fetchImpl, log, now });
  const localGates = createLocalGates(now);
  const readBuckets = new Map();
  let repoEtag;

  // Runs `method` on the Durable Object when it is bound and answers, otherwise on the per-isolate
  // gate. `local` on the result records which one served, so a later release goes to the same place.
  async function callGate(stubFactory, localGate, method, args) {
    if (stubFactory) {
      try {
        return { local: false, value: await stubFactory()[method](...args) };
      } catch (error) {
        log('gate call failed, using the per-isolate gate', method, error instanceof Error ? error.name : 'error');
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

  async function runStateHeaders(env, teamKey, eventId) {
    if (!EVENT_ID_PATTERN.test(eventId)) {
      return { 'X-Run-State': 'none' };
    }
    const { value } = await teamGate(env, teamKey, 'readState', eventId);
    return {
      'X-Run-State': value.state,
      ...(value.progress ? { 'X-Run-Progress': JSON.stringify(value.progress) } : {}),
    };
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
      const stateHeaders = eventId === null ? {} : await runStateHeaders(env, teamKey, eventId);
      const { espnId, league } = splitTeamKey(teamKey);
      const file = await streams.read(env, league, espnId);
      if (file) {
        return documentResponse(request, file.text, `"${file.sha}"`, stateHeaders);
      }
      const text = emptyDocumentText(entry);
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
    // Worker read GitHub, ESPN or statsapi. The lockout is IP-wide because a per-team limit alone
    // would allow guesses across about a thousand catalog keys.
    const ip = rateLimitKey(request);
    const lockout = await globalGate(env, 'checkLockout', ip);
    if (!lockout.value.ok) {
      return reply(429, 'rate_limited', 'Too many requests.', {
        ...scope,
        retryAfterSeconds: lockout.value.retryAfterSeconds,
      });
    }
    if (!appKeyMatches(body.appKey, env)) {
      await globalGate(env, 'recordFailedKey', ip);
      return reply(401, 'unauthorized', 'Unauthorized.', scope);
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

    const teamReserve = await teamGate(env, teamKey, 'reserve', ip, eventId);
    if (!teamReserve.value.ok) {
      const { code, retryAfterSeconds } = teamReserve.value;
      if (code === 'in_progress') {
        return reply(202, 'in_progress', 'A run for this game was just started.', {
          ...scope,
          retryAfterSeconds,
        });
      }
      return reply(429, code, 'Too many requests.', { ...scope, retryAfterSeconds });
    }

    const runKey = `${teamKey}|${eventId}`;
    const globalReserve = await globalGate(env, 'reserve', ip, runKey);
    const releaseTeam = () =>
      releaseQuietly(
        teamReserve.local ? localGates.team(env, teamKey) : teamStub(env, teamKey)(),
        teamReserve.value.reservation,
      );
    if (!globalReserve.value.ok) {
      await releaseTeam();
      const { code, retryAfterSeconds } = globalReserve.value;
      const status = code === 'busy' ? 503 : 429;
      return reply(status, code, 'Too many requests.', { ...scope, retryAfterSeconds });
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
          origin: 'phone',
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
      return reply(502, 'dispatch_failed', 'Could not start the run.', scope);
    }

    try {
      await teamGate(env, teamKey, 'markQueued', eventId);
    } catch (error) {
      log('could not record the queued state', error instanceof Error ? error.name : 'error');
    }
    return reply(202, 'started', 'Run started.', scope);
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

  async function handleRunStatus(request, env) {
    if (!env.RUN_STATUS_KEY) {
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
    const { value } = await teamGate(env, fields.team, 'recordStatus', {
      code: body.code,
      eventId: fields.eventId,
      runId: fields.runId,
    });
    if (value.fresh) {
      await globalGate(env, 'completeRun', `${fields.team}|${fields.eventId}`);
    }
    return new Response(null, { status: 204 });
  }

  async function handleRunProgress(request, env) {
    if (!env.RUN_PROGRESS_KEY) {
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
    await teamGate(env, fields.team, 'recordProgress', {
      eventId: fields.eventId,
      k: body.k,
      n: body.n,
      step: body.step,
    });
    return new Response(null, { status: 204 });
  }

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
  };
}
