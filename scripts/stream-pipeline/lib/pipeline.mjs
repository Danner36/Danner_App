// The extract half of a run: check the request, read the config, find the game, and try the
// listing sources until one yields an entry the phone would accept. Nothing here can write: the
// result goes to candidate.json for publish.mjs.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { checkRequest, loadCatalog, repoRoot, requestFromEnv, validationForTeam } from './catalog.mjs';
import {
  configProblem,
  graceMinutesFor,
  hrefNeedlesFor,
  leagueHintsFor,
  mergeConfig,
  readDefaults,
  readSecretConfig,
  requireOpponentFor,
} from './config.mjs';
import { providerForUrl } from './extract/providers.mjs';
import {
  extractFromListing,
  httpsProviderUrl,
  isValidPlayerUrl,
  launchExtractBrowser,
  newExtractContext,
} from './extract/listing.mjs';
import {
  isBlockedGame,
  isGameOver,
  isWithinGetVideoWindow,
  selectFeaturedGame,
} from './gameWindow.mjs';
import { isPlayableStream } from './playableStream.mjs';
import { createProgressReporter } from './progress.mjs';
import { STREAMS_BRANCH, readRemoteStreamsDocument } from './publishGithub.mjs';
import { createRedactor } from './redact.mjs';
import { fetchEspnGames, isCompleteEspnGame } from './schedule/espn.mjs';
import { fetchMlbGames, isCompleteMlbGame } from './schedule/mlbStatsapi.mjs';
import {
  normalizeSources,
  parseSourceOnly,
  rawSourceUrls,
  runSources,
} from './sources.mjs';
import {
  findPlayableStreamForGame,
  parseStreamsDocument,
  readTemplate,
  newStreamsDocument,
} from './streamsDocument.mjs';

const SCHEDULE_PROVIDERS = {
  espn: { fetchGames: fetchEspnGames, isComplete: isCompleteEspnGame },
  'mlb-statsapi': { fetchGames: fetchMlbGames, isComplete: isCompleteMlbGame },
};

const LISTING_FAILURE_MESSAGES = {
  ambiguous_link: 'More than one listing link matches this game; nothing was published.',
  browser_failed: 'The browser could not be started.',
  deadline: 'The extraction deadline passed before every listing source was tried.',
  no_video: 'No video found.',
  sources_unreachable: 'No listing source could be reached.',
};

// Masks every source host before anything else can run, so a config that later fails its checks
// still cannot print one. Returns { config, sources, allSources } or { problem }.
export async function loadRunConfig({ catalogDir, configPath, redactor, sourceOnly }) {
  const read = await readSecretConfig(configPath);
  if (read.problem) {
    return read;
  }
  for (const url of rawSourceUrls(read.secret)) {
    redactor.add(url);
  }
  const config = mergeConfig(await readDefaults(), read.secret ?? {});
  const problem = configProblem(read.secret, config, await loadCatalog(catalogDir));
  if (problem) {
    return { problem };
  }
  const allSources = normalizeSources(read.secret);
  const selected = parseSourceOnly(sourceOnly, allSources.length);
  if (selected.problem) {
    return { problem: selected.problem };
  }
  return {
    allSources,
    config,
    sources: selected.sourceOnly
      ? allSources.filter((source) => source.number === selected.sourceOnly)
      : allSources,
  };
}

export function gameForRequest({ eventId, games, graceMinutes, leadMinutes, now, team }) {
  if (eventId) {
    return games.find((game) => String(game.gamePk) === eventId);
  }
  return selectFeaturedGame(games, now, {
    graceMinutes,
    isBlocked: isBlockedGame,
    isComplete: SCHEDULE_PROVIDERS[team.schedule.provider].isComplete,
    leadMinutes,
    timeZone: team.officialDateZone,
  });
}

function githubTarget(team, repository) {
  const [owner, repo] = String(repository ?? '').split('/');
  return owner && repo ? { branch: STREAMS_BRANCH, owner, path: team.streamsPath, repo } : undefined;
}

// Readiness is judged against the branch, not the job's checkout, which a queued run took before
// an earlier run published. A team with no file yet starts from the template.
async function readCurrentDocument({ fetchImpl, github, log, team, token }) {
  if (token && github) {
    try {
      const remote = await readRemoteStreamsDocument({ ...github, fetchImpl, token });
      if (remote) {
        return remote.document;
      }
      return newStreamsDocument(await readTemplate(), team);
    } catch (error) {
      log(`Could not read ${team.streamsPath} from GitHub (${error instanceof Error ? error.message : String(error)}); using the checkout copy.`);
    }
  }
  try {
    return parseStreamsDocument(await readFile(path.join(repoRoot, team.streamsPath), 'utf8'));
  } catch {
    return newStreamsDocument(await readTemplate(), team);
  }
}

export function entryForGame(game, team, url) {
  return {
    ...(team.sport ? { sport: team.sport } : {}),
    eventId: String(game.gamePk),
    gameDates: [game.officialDate],
    gameNumbers: [game.gameNumber],
    kind: 'web',
    url,
    allowInsecureHttp: false,
    trustedHosts: providerForUrl(url)?.trustedHosts ?? [],
    source: 'pipeline',
  };
}

// A resumed MLB game keeps the officialDate and game number of the day it was suspended, so the
// entry under that key points at the first day's stream. It is re-extracted and replaced.
function replacesExistingEntry(force, game) {
  return Boolean(force || game.resumed);
}

export async function runPipeline(options = {}) {
  const steps = [];
  const log = (message) => steps.push({ message });
  const finish = (outcome, message, success, extra = {}) => ({ message, outcome, steps, success, ...extra });

  const request = options.request ?? requestFromEnv();
  const checked = await checkRequest(request, options.catalogDir);
  if (checked.code) {
    return finish(checked.code, checked.message, false);
  }
  const { eventId, spec: team } = checked;

  const redactor = options.redactor ?? createRedactor();
  const loaded = await loadRunConfig({
    catalogDir: options.catalogDir,
    configPath: options.configPath,
    redactor,
    sourceOnly: options.sourceOnly,
  });
  if (loaded.problem) {
    return finish('config_invalid', loaded.problem, false);
  }
  const { allSources, config, sources } = loaded;

  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const leadMinutes = config.timing.leadMinutes;
  const graceMinutes = graceMinutesFor(config, team);

  let games;
  try {
    games = await SCHEDULE_PROVIDERS[team.schedule.provider].fetchGames(team, now, fetchImpl);
  } catch (error) {
    return finish(
      'schedule_failed',
      `Schedule could not be read: ${redactor.text(error instanceof Error ? error.message : String(error))}`,
      false,
    );
  }

  const game = gameForRequest({ eventId, games, graceMinutes, leadMinutes, now, team });
  if (!game) {
    return finish('no_game', `No ${team.name} game was found for this request.`, true);
  }
  log(`Game ${game.officialDate} #${game.gameNumber} vs ${game.opponentName} (${game.status}).`);

  if (isBlockedGame(game)) {
    return finish('blocked', `Game is ${game.status}; pipeline skipped.`, true, { game });
  }
  if (isGameOver(game)) {
    return finish('game_over', 'Game is final; pipeline skipped.', true, { game });
  }

  const validation = validationForTeam(team);
  const token = options.githubToken?.trim() || undefined;
  const github = githubTarget(team, options.repository);
  const document = await readCurrentDocument({ fetchImpl, github, log, team, token });
  const existing = findPlayableStreamForGame(document, game, validation);
  if (existing && game.resumed) {
    log(`Resumed game; replacing the entry for ${game.officialDate} game ${game.gameNumber}.`);
  }
  if (existing && !replacesExistingEntry(options.force, game)) {
    return finish('video_ready', 'Video entry is already loaded for this game.', true, { game });
  }

  if (!options.force && !isWithinGetVideoWindow(game, now, leadMinutes)) {
    return finish('too_early', `Get video opens ${leadMinutes} minutes before the start.`, true, { game });
  }

  const progress =
    options.progress ??
    createProgressReporter({
      dryRun: options.dryRun,
      eventId,
      fetchImpl,
      key: options.progressKey,
      runId: options.runId,
      sport: team.sport,
      team: team.key,
      workerUrl: options.workerUrl,
    });

  const extractListing = options.extractListing ?? extractFromListing;
  const leagueHints = leagueHintsFor(config, team);
  const attemptSource = async ({
    context,
    isAbandoned,
    navigationTimeoutSeconds,
    onStage,
    requireOpponent,
    source,
  }) => {
    progress.send('source_start', source.number, allSources.length);
    const extraction = await extractListing(source.baseUrl, {
      game,
      hrefNeedles: hrefNeedlesFor(config, source, team),
      leagueHints,
      opponentName: game.opponentName,
      requireOpponent: requireOpponentFor(config, source, team) || requireOpponent,
      sourceAttempt: {
        context,
        isAbandoned,
        onHost: (host) => redactor.add(host),
        onStage,
        privateHosts: redactor.hosts,
      },
      timeoutSeconds: navigationTimeoutSeconds,
    });
    // The run has moved on; its lines would land among the next source's.
    if (isAbandoned()) {
      return { code: 'source_timeout' };
    }
    for (const line of extraction.logLines ?? []) {
      log(line);
    }
    if (extraction.failure) {
      return { code: extraction.failure === 'config_missing' ? 'link_not_found' : extraction.failure };
    }
    const url =
      extraction.found && isValidPlayerUrl(extraction.playerUrl)
        ? httpsProviderUrl(extraction.playerUrl)
        : undefined;
    if (!url) {
      return { code: 'invalid_entry' };
    }
    const entry = entryForGame(game, team, url);
    if (!isPlayableStream(entry, validation)) {
      return { code: 'invalid_entry' };
    }
    progress.send('found', source.number, allSources.length);
    return { entry };
  };

  const listing = await runSources({
    attemptSource,
    clock: options.clock,
    launchBrowser: options.launchBrowser ?? launchExtractBrowser,
    log,
    newContext: options.newContext ?? newExtractContext,
    redact: redactor.text,
    sources,
    timing: config.timing,
    total: allSources.length,
  });
  await progress.flush();

  if (!listing.entry) {
    return finish(
      listing.code,
      LISTING_FAILURE_MESSAGES[listing.code] ?? `Listing sources stopped: ${listing.code}.`,
      false,
      { game, listing },
    );
  }
  if (options.dryRun) {
    return finish('dry_run', `Dry run complete; ${team.streamsPath} was not written.`, true, {
      entry: listing.entry,
      game,
      listing,
    });
  }
  return finish('found', 'A playable entry was found.', true, { entry: listing.entry, game, listing });
}

// The hand-off file. It holds the entry or the outcome code, the game key, and the per-source
// table, which has only numbers, labels and codes.
export function candidateFromResult(result, request) {
  const { game, listing } = result;
  const team = String(request.team ?? '').trim();
  const sport = String(request.sport ?? '').trim();
  const eventId = String(request.eventId ?? '').trim();
  return {
    schemaVersion: 1,
    outcome: result.outcome,
    team,
    ...(sport ? { sport } : {}),
    ...(eventId ? { eventId } : {}),
    ...(game
      ? {
          game: {
            eventId: String(game.gamePk),
            gameNumber: game.gameNumber,
            officialDate: game.officialDate,
            ...(game.resumed ? { resumed: true } : {}),
          },
        }
      : {}),
    ...(result.outcome === 'found' ? { entry: result.entry } : {}),
    ...(listing
      ? {
          listing: {
            attempts: listing.attempts,
            total: listing.total,
            ...(listing.winner ? { winnerNumber: listing.winner.number } : {}),
          },
        }
      : {}),
  };
}
