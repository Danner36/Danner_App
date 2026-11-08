// The publish half of a run. It has a write token and no browser, and it trusts nothing in
// candidate.json that it does not re-check against the catalog and the provider table.

import { readFile } from 'node:fs/promises';

import { checkRequest, requestFromEnv, validationForTeam } from './catalog.mjs';
import { providerForUrl } from './extract/providers.mjs';
import { officialDateInZone } from './gameWindow.mjs';
import { ENTRY_EXISTS, EXTRACT_FAILED, SUCCESS_CODES, isCandidateCode } from './outcomes.mjs';
import { EVENT_ID_PATTERN, isPlayableStream, isValidGameDate } from './playableStream.mjs';
import { canonicalPlayerUrl } from './playerUrl.mjs';
import { STREAMS_BRANCH, publishStreamsUpdate, readRemoteStreamsDocument } from './publishGithub.mjs';
import { isResumedMlbGame } from './schedule/mlbStatsapi.mjs';
import { epochSeconds, postSignedWithRetry } from './signedPost.mjs';
import { formatRunSummary } from './sources.mjs';
import {
  findPlayableStreamForGame,
  newStreamsDocument,
  planStreamUpdate,
  readTemplate,
} from './streamsDocument.mjs';

export const STATUS_PATH = '/run-status';

const LABEL = /^[a-z0-9-]{1,24}$/;
const STAGE = /^(listing|link|game|player|entry)$/;
const RESULT = /^[a-z0-9_]{1,40}$/;

const sameList = (first, second) =>
  Array.isArray(first) && first.length === second.length && first.every((value, index) => value === second[index]);

// The game key from a candidate, checked against the request, in the shape the streams match
// reads. Resumed state is not carried over: publish asks statsapi for that itself.
function validatedGame(candidate, team, eventId) {
  const { game } = candidate;
  if (
    candidate.schemaVersion !== 1 ||
    candidate.team !== team.key ||
    candidate.sport !== team.sport ||
    (candidate.eventId ?? undefined) !== eventId ||
    typeof game !== 'object' ||
    game === null ||
    typeof game.eventId !== 'string' ||
    !EVENT_ID_PATTERN.test(game.eventId) ||
    (eventId && game.eventId !== eventId) ||
    !isValidGameDate(game.officialDate) ||
    !Number.isInteger(game.gameNumber) ||
    game.gameNumber < 1 ||
    game.gameNumber > 9
  ) {
    return undefined;
  }
  return {
    gameNumber: game.gameNumber,
    gamePk: game.eventId,
    officialDate: game.officialDate,
    ...(team.sport ? { sport: team.sport } : {}),
  };
}

// Returns { game, entry } rebuilt from checked values, or undefined. The path never comes from
// the candidate: publish derives it from the catalog entry for the validated key.
export function validateFoundCandidate(candidate, team, eventId) {
  const { entry, game } = candidate;
  const checkedGame = validatedGame(candidate, team, eventId);
  if (!checkedGame || typeof entry !== 'object' || entry === null) {
    return undefined;
  }

  const url = canonicalPlayerUrl(entry.url);
  const provider = url ? providerForUrl(url) : undefined;
  if (
    !provider ||
    entry.kind !== 'web' ||
    entry.allowInsecureHttp !== false ||
    entry.source !== 'pipeline' ||
    entry.eventId !== game.eventId ||
    entry.sport !== team.sport ||
    !sameList(entry.gameDates, [game.officialDate]) ||
    !sameList(entry.gameNumbers, [game.gameNumber]) ||
    !sameList(entry.trustedHosts, provider.trustedHosts)
  ) {
    return undefined;
  }

  const rebuilt = {
    ...(team.sport ? { sport: team.sport } : {}),
    eventId: game.eventId,
    gameDates: [game.officialDate],
    gameNumbers: [game.gameNumber],
    kind: 'web',
    url,
    allowInsecureHttp: false,
    trustedHosts: [...provider.trustedHosts],
    source: 'pipeline',
  };
  return isPlayableStream(rebuilt, validationForTeam(team)) ? { entry: rebuilt, game: checkedGame } : undefined;
}

// The extract job saw an entry for this game; only the file on the branch can confirm it.
async function confirmExistingEntry({ candidate, eventId, fetchImpl, repository, team, token }) {
  const failed = { code: EXTRACT_FAILED, message: 'The extract job reported an entry the branch does not hold.' };
  const game = validatedGame(candidate, team, eventId);
  const [owner, repo] = String(repository ?? '').split('/');
  if (!game || !owner || !repo || !token) {
    return failed;
  }
  try {
    const remote = await readRemoteStreamsDocument({
      branch: STREAMS_BRANCH,
      fetchImpl,
      owner,
      path: team.streamsPath,
      repo,
      token,
    });
    return remote && findPlayableStreamForGame(remote.document, game, validationForTeam(team))
      ? { code: 'video_ready', message: 'Video entry is already loaded for this game.' }
      : failed;
  } catch {
    return failed;
  }
}

// The per-source table, with every field re-checked so nothing but numbers, labels and codes can
// reach the public summary or artifact.
function safeListing(listing) {
  if (typeof listing !== 'object' || listing === null || !Array.isArray(listing.attempts)) {
    return undefined;
  }
  const attempts = listing.attempts.filter(
    (attempt) =>
      Number.isInteger(attempt?.number) &&
      Number.isInteger(attempt?.seconds) &&
      LABEL.test(attempt?.label) &&
      STAGE.test(attempt?.stage) &&
      RESULT.test(attempt?.result),
  );
  return {
    attempts: attempts.map(({ label, number, result, seconds, stage }) => ({ label, number, result, seconds, stage })),
    total: Number.isInteger(listing.total) ? listing.total : attempts.length,
    ...(Number.isInteger(listing.winnerNumber) ? { winner: { number: listing.winnerNumber } } : {}),
  };
}

export function commitMessage(team, game) {
  const sport = team.sport ? ` ${team.sport}` : '';
  return `streams: ${team.key}${sport} ${game.officialDate} game ${game.gameNumber}.`;
}

export async function readCandidate(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function runPublish(options) {
  const request = options.request ?? requestFromEnv();
  const now = options.now ?? new Date();
  const checked = await checkRequest(request, options.catalogDir);
  if (checked.code) {
    return { code: checked.code, message: checked.message, posted: false, success: false };
  }
  const { eventId, spec: team } = checked;
  const candidate = await readCandidate(options.candidatePath);

  let code;
  let message;
  let validated;
  let listing;
  if (!candidate) {
    code = EXTRACT_FAILED;
    message = 'The extract job left no readable candidate.';
  } else {
    listing = safeListing(candidate.listing);
    code = isCandidateCode(candidate.outcome) ? candidate.outcome : EXTRACT_FAILED;
    message = `The extract job reported ${code}.`;
    if (code === 'found') {
      validated = validateFoundCandidate(candidate, team, eventId);
      if (!validated) {
        code = 'invalid_entry';
        message = 'The candidate failed re-validation; nothing was published.';
      }
    } else if (code === ENTRY_EXISTS) {
      ({ code, message } = await confirmExistingEntry({ ...options, candidate, eventId, team }));
    }
  }

  if (validated && !options.dryRun) {
    ({ code, message } = await publishCandidate({ ...options, now, team, validated }));
  } else if (validated) {
    code = 'dry_run';
    message = `Dry run complete; ${team.streamsPath} was not written.`;
  }

  const result = {
    code,
    game: validated?.game ?? gameKey(candidate),
    listing,
    message,
    posted: false,
    success: SUCCESS_CODES.has(code),
    team,
  };
  if (eventId && !options.dryRun && code !== 'dry_run') {
    const posted = await postRunStatus({ ...options, code, eventId, now, team });
    result.posted = posted.ok;
  }
  return result;
}

async function publishCandidate({
  fetchImpl,
  force,
  now,
  repository,
  sleep,
  team,
  token,
  validated: { entry, game },
}) {
  const [owner, repo] = String(repository ?? '').split('/');
  if (!owner || !repo || !token) {
    return { code: 'publish_failed', message: 'GITHUB_REPOSITORY and GITHUB_TOKEN are required to publish.' };
  }
  const validation = validationForTeam(team);
  const today = officialDateInZone(now, team.officialDateZone);
  // A resumed game keeps its first day's key, so its older entry is replaced.
  const replace = Boolean(
    force ||
      (team.schedule.provider === 'mlb-statsapi' &&
        (await isResumedMlbGame(team, game.gamePk, game.officialDate, fetchImpl))),
  );
  try {
    const published = await publishStreamsUpdate({
      branch: STREAMS_BRANCH,
      fallbackDocument: newStreamsDocument(await readTemplate(), team),
      fetchImpl,
      message: commitMessage(team, game),
      owner,
      path: team.streamsPath,
      repo,
      ...(sleep ? { sleep } : {}),
      token,
      update: (current) => planStreamUpdate(current, { entry, force: replace, game, today, validation }),
    });
    if (published.published) {
      return { code: 'published', message: commitMessage(team, game) };
    }
    return published.change.outcome === 'video_ready'
      ? { code: 'video_ready', message: 'Video entry is already loaded for this game.' }
      : { code: 'unchanged', message: 'Stream entry is already up to date; nothing to publish.' };
  } catch (error) {
    return { code: 'publish_failed', message: `Publish failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function gameKey(candidate) {
  const game = candidate?.game;
  return game && isValidGameDate(game.officialDate) && Number.isInteger(game.gameNumber) && EVENT_ID_PATTERN.test(game.eventId)
    ? { gameNumber: game.gameNumber, gamePk: game.eventId, officialDate: game.officialDate }
    : undefined;
}

async function postRunStatus({ code, eventId, fetchImpl, now, runId, sleep, statusKey, team, workerUrl }) {
  if (!statusKey || !workerUrl) {
    return { ok: false };
  }
  return postSignedWithRetry({
    ...(sleep ? { sleep } : {}),
    fetchImpl,
    key: statusKey,
    path: STATUS_PATH,
    payload: {
      at: epochSeconds(now),
      code,
      eventId,
      runId,
      ...(team.sport ? { sport: team.sport } : {}),
      team: team.key,
    },
    workerUrl,
  });
}

export function publishSummary(result) {
  return formatRunSummary({
    moduleName: result.team.sport ? `${result.team.key} ${result.team.sport}` : result.team.key,
    result: { game: result.game, listing: result.listing, outcome: result.code },
  });
}

export function resultDocument(result) {
  return {
    code: result.code,
    message: result.message,
    success: result.success,
    ...(result.team ? { team: result.team.key, ...(result.team.sport ? { sport: result.team.sport } : {}) } : {}),
    ...(result.game ? { game: result.game } : {}),
    ...(result.listing ? { listing: result.listing } : {}),
    ...(result.code === 'published' && result.team ? { streamsPath: result.team.streamsPath } : {}),
  };
}
