import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { providerForUrl } from './extract/providers.mjs';
import {
  buildBlankStreamEntry,
  extractGoozFromBasePage,
  httpsProviderUrl,
  isValidGoozPlayerUrl,
  launchExtractBrowser,
  newExtractContext,
  redactHosts,
  urlPathForLog,
} from './extractGooz.mjs';
import {
  DEFAULT_LEAD_MINUTES,
  DEFAULT_POST_START_GRACE_MINUTES,
  officialDateInZone,
} from './gameWindow.mjs';
import {
  featuredGame,
  fetchGuardiansGames,
  isBlockedGame,
} from './mlbSchedule.mjs';
import {
  featuredCyclonesGame,
  fetchCyclonesGames,
} from './ncaaSchedule.mjs';
import { fetchPatriotsGames } from './nflSchedule.mjs';
import { CYCLONES_SPORTS, isPlayableStream } from './playableStream.mjs';
import {
  publishStreamsUpdate,
  readRemoteStreamsDocument,
} from './publishGithub.mjs';
import { createRedactor } from './redact.mjs';
import {
  DEFAULT_TIMING,
  normalizeSources,
  parseSourceOnly,
  rawSourceUrls,
  runSources,
  sourcesConfigProblem,
} from './sources.mjs';
import {
  findEquivalentStream,
  findPlayableStreamForGame,
  planStreamUpdate,
  readStreamsDocument,
  writeStreamsDocument,
} from './streamsDocument.mjs';

const pipelineDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(pipelineDir, '../../..');
export const defaultConfigPath = path.join(
  path.dirname(pipelineDir),
  'config.json',
);

// Each module writes only its own root file. Official dates, and the "today" used to pick a game
// and to age out old entries, are calendar dates in the module's zone.
const MODULES = {
  guardians: {
    label: 'Guardians',
    streamsPath: 'guardians_streams.json',
    timeZone: 'America/New_York',
  },
  patriots: {
    label: 'Patriots',
    sport: 'nfl',
    streamsPath: 'patriots_streams.json',
    timeZone: 'America/New_York',
  },
  cyclones: {
    label: 'Cyclones',
    sport: 'cyclones',
    streamsPath: 'cyclones_streams.json',
    timeZone: 'America/Chicago',
  },
};

// JSON.parse errors quote part of the text, which would print extract.baseUrl.
export async function loadConfig(configPath = defaultConfigPath) {
  let text;
  try {
    text = await readFile(configPath, 'utf8');
  } catch {
    throw new Error('Pipeline config file could not be read.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Pipeline config is not valid JSON.');
  }
}

export function moduleForConfig(config) {
  if (config?.sport === undefined || config?.sport === 'mlb') {
    return 'guardians';
  }
  if (config.sport === 'nfl') {
    return 'patriots';
  }
  if (config.sport === 'cyclones') {
    return 'cyclones';
  }
  return undefined;
}

export function moduleTimeZone(config) {
  return MODULES[moduleForConfig(config) ?? 'guardians'].timeZone;
}

// Guardians predates github.streamsPath and keeps its default. Patriots and Cyclones must name
// their own file; configProblem rejects them otherwise.
export function streamsRelativePath(config) {
  const configured =
    typeof config.github?.streamsPath === 'string' ? config.github.streamsPath.trim() : '';
  if (configured) {
    return configured;
  }
  return moduleForConfig(config) === 'guardians' ? MODULES.guardians.streamsPath : undefined;
}

export function streamsPathForConfig(config) {
  const relative = streamsRelativePath(config);
  return relative ? path.resolve(repoRoot, relative) : undefined;
}

function cleanNeedles(values) {
  return Array.isArray(values)
    ? values
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.trim())
    : [];
}

// Cyclones: extract.hrefNeedles is an object keyed by sport. Guardians and Patriots:
// extract.hrefNeedles array or extract.hrefNeedle string. Only a Guardians config without
// needles falls back to its own team; no other module ever borrows a team.
export function hrefNeedlesForGame(config, game) {
  const configured = config.extract?.hrefNeedles;
  if (moduleForConfig(config) === 'cyclones') {
    if (
      !game?.sport ||
      typeof configured !== 'object' ||
      configured === null ||
      Array.isArray(configured)
    ) {
      return [];
    }
    return cleanNeedles(configured[game.sport]);
  }
  const needles = Array.isArray(configured)
    ? cleanNeedles(configured)
    : cleanNeedles([config.extract?.hrefNeedle]);
  if (needles.length === 0 && moduleForConfig(config) === 'guardians') {
    return ['cleveland-guardians'];
  }
  return needles;
}

// Returns a message naming the missing or mismatched setting, never its value.
export function configProblem(config, { dispatchSport, expectedModule } = {}) {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return 'Pipeline config is not a JSON object.';
  }
  const moduleName = moduleForConfig(config);
  if (!moduleName) {
    return 'Pipeline config sport must be omitted (Guardians), "nfl", or "cyclones".';
  }
  if (expectedModule && moduleName !== expectedModule) {
    return `Pipeline config is for ${moduleName}, but this workflow runs ${expectedModule}.`;
  }

  const expectedPath = MODULES[moduleName].streamsPath;
  const streamsPath = config.github?.streamsPath;
  if (streamsPath === undefined && moduleName !== 'guardians') {
    return `Pipeline config is missing github.streamsPath (${expectedPath}).`;
  }
  if (streamsPath !== undefined && streamsPath !== expectedPath) {
    return `Pipeline config github.streamsPath must be ${expectedPath}.`;
  }

  const baseUrl = config.extract?.baseUrl;
  let baseUrlValid = false;
  try {
    const parsed = new URL(typeof baseUrl === 'string' ? baseUrl.trim() : '');
    baseUrlValid = parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {}
  if (!baseUrlValid) {
    return 'Pipeline config extract.baseUrl is missing or is not an http(s) URL.';
  }

  if (moduleName === 'cyclones') {
    const bySport = config.extract?.hrefNeedles;
    if (typeof bySport !== 'object' || bySport === null || Array.isArray(bySport)) {
      return 'Pipeline config extract.hrefNeedles must map each Cyclones sport to href needles.';
    }
    if (dispatchSport !== undefined && !CYCLONES_SPORTS.has(dispatchSport)) {
      return 'Dispatch sport is not football, mens-basketball, or womens-basketball.';
    }
    const sports = dispatchSport ? [dispatchSport] : [...CYCLONES_SPORTS];
    const missing = sports.filter((sport) => cleanNeedles(bySport[sport]).length === 0);
    if (missing.length === sports.length || (dispatchSport && missing.length > 0)) {
      return `Pipeline config extract.hrefNeedles has no needles for ${missing.join(', ')}.`;
    }
    return undefined;
  }

  if (hrefNeedlesForGame(config, undefined).length === 0) {
    return 'Pipeline config is missing extract.hrefNeedle.';
  }
  return undefined;
}

// STREAM_PIPELINE_CONFIG_PATH is set only when the workflow wrote a non-empty secret. Without it
// `sources` stays undefined and the per-team extract.baseUrl path runs. Every problem is reported
// without the secret's values, and JSON.parse errors, which quote the text, are not passed on.
export async function loadListingSources({
  configPath = process.env.STREAM_PIPELINE_CONFIG_PATH?.trim() || undefined,
  redactor,
  sourceOnly = process.env.SOURCE_ONLY,
} = {}) {
  let text = '';
  if (configPath) {
    try {
      text = await readFile(configPath, 'utf8');
    } catch {
      return { problem: 'Listing sources config file could not be read.' };
    }
  }
  if (!text.trim()) {
    return { problem: parseSourceOnly(sourceOnly, 1).problem };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { problem: 'Listing sources config is not valid JSON.' };
  }
  for (const url of rawSourceUrls(parsed)) {
    redactor?.add(url);
  }
  const problem = sourcesConfigProblem(parsed);
  if (problem) {
    return { problem };
  }

  const allSources = normalizeSources(parsed);
  const selected = parseSourceOnly(sourceOnly, allSources.length);
  if (selected.problem) {
    return { problem: selected.problem };
  }
  return {
    allSources,
    sources: selected.sourceOnly
      ? allSources.filter((source) => source.number === selected.sourceOnly)
      : allSources,
  };
}

function noGameMessage(config) {
  return `No ${MODULES[moduleForConfig(config)].label} game is scheduled for today.`;
}

function scheduleStepName(config) {
  if (config.sport === 'nfl') {
    return 'espn_schedule';
  }
  if (config.sport === 'cyclones') {
    return 'ncaa_schedule';
  }
  return 'mlb_schedule';
}

async function fetchConfiguredGames(config, now) {
  if (config.sport === 'nfl') {
    return fetchPatriotsGames(config.teamId ?? 17, now);
  }
  if (config.sport === 'cyclones') {
    return fetchCyclonesGames(config.teamId ?? 66, now);
  }
  return fetchGuardiansGames(config.teamId ?? 114, now);
}

export function featuredGameForConfig(config, games, now, dispatchSport) {
  const options = {
    graceMinutes: config.postStartGraceMinutes ?? DEFAULT_POST_START_GRACE_MINUTES,
    leadMinutes: config.leadMinutes ?? DEFAULT_LEAD_MINUTES,
    timeZone: moduleTimeZone(config),
  };
  if (config.sport === 'cyclones') {
    const scoped = dispatchSport
      ? games.filter((game) => game.sport === dispatchSport)
      : games;
    return featuredCyclonesGame(scoped, now, options);
  }
  return featuredGame(games, now, options);
}

export function isGameOver(game) {
  return game.abstractState === 'Final';
}

export function isWithinGetVideoWindow(game, now, leadMinutes) {
  if (isGameOver(game) || isBlockedGame(game)) {
    return false;
  }
  if (game.abstractState === 'Live') {
    return true;
  }
  if (game.timeValid === false) {
    return false;
  }
  const startMs = new Date(game.gameDate).getTime();
  const leadMs = leadMinutes * 60_000;
  return now.getTime() >= startMs - leadMs;
}

function githubTarget(config) {
  const github = config.github ?? {};
  return {
    branch: github.branch ?? 'main',
    owner: github.owner ?? 'Danner36',
    path: streamsRelativePath(config),
    repo: github.repo ?? 'Danner_App',
  };
}

// Readiness is judged against the branch, not the job's checkout, which a queued run took
// before an earlier run published.
async function readCurrentStreamsDocument({ github, streamsPath, steps, token }) {
  if (token) {
    try {
      const remote = await readRemoteStreamsDocument({ ...github, token });
      if (remote) {
        return remote.document;
      }
    } catch (error) {
      steps.push({
        step: 'read_remote',
        message: `Could not read ${github.path} from GitHub (${error instanceof Error ? error.message : String(error)}); using the checkout copy.`,
        success: false,
      });
    }
  }
  return readStreamsDocument(streamsPath);
}

function skippedPublishResult({ change, game, nextEntry, steps }) {
  if (change.outcome === 'video_ready') {
    return {
      game,
      outcome: 'video_ready',
      message: 'Video entry is already loaded for this game.',
      steps,
      streamEntry: change.streamEntry,
      success: true,
    };
  }
  return {
    game,
    outcome: 'unchanged',
    message: 'Stream entry is already up to date; nothing to publish.',
    nextEntry,
    steps,
    streamEntry: change.streamEntry,
    success: true,
  };
}

// A resumed MLB game keeps the officialDate and game number of the day it was suspended, so the
// entry already under that key points at the first day's stream. It is re-extracted and
// replaced, as a forced run would.
function replacesExistingEntry(options, game) {
  return Boolean(options.force || options.forceRefresh || game.resumed);
}

async function publishStreamDocument({
  config,
  document,
  game,
  github,
  nextEntry,
  options,
  steps,
  streamsPath,
  today,
  token,
}) {
  const force = replacesExistingEntry(options, game);
  const requireSport = moduleForConfig(config) === 'cyclones';
  const plan = (current) =>
    planStreamUpdate(current, { entry: nextEntry, force, game, requireSport, today });

  if (!token) {
    const change = plan(document);
    if (!change.document) {
      return skippedPublishResult({ change, game, nextEntry, steps });
    }
    await writeStreamsDocument(streamsPath, change.document);
    steps.push({
      step: 'write_local',
      message: `Updated ${github.path}.`,
      streamEntry: nextEntry,
      success: true,
    });
    return {
      game,
      outcome: 'local_only',
      message: 'Local file updated; GITHUB_TOKEN is not set.',
      nextEntry,
      steps,
      streamEntry: nextEntry,
      success: true,
    };
  }

  const messagePrefix =
    config.github?.commitMessagePrefix ?? 'guardians: update stream for';
  const commitMessage = `${messagePrefix} ${game.officialDate} game ${game.gameNumber}`;

  const published = await publishStreamsUpdate({
    ...github,
    fallbackDocument: document,
    message: commitMessage,
    token,
    update: plan,
  });
  if (!published.published) {
    return skippedPublishResult({ change: published.change, game, nextEntry, steps });
  }

  await writeStreamsDocument(streamsPath, published.document);
  steps.push({
    step: 'write_local',
    message: `Updated ${github.path}.`,
    streamEntry: nextEntry,
    success: true,
  });
  steps.push({
    step: 'publish_github',
    commitMessage,
    message: `Published to ${github.owner}/${github.repo}@${github.branch}${published.attempts > 1 ? ` after ${published.attempts} attempts` : ''}.`,
    success: true,
  });

  return {
    game,
    outcome: 'published',
    message: commitMessage,
    nextEntry,
    steps,
    streamEntry: nextEntry,
    success: true,
  };
}

const LISTING_FAILURE_MESSAGES = {
  browser_failed: 'The browser could not be started.',
  deadline: 'The extraction deadline passed before every listing source was tried.',
  no_video: 'No video found.',
  sources_unreachable: 'No listing source could be reached.',
};

// Tries the configured sources through the same page steps as the per-team path. An attempt
// passes only with an entry the phone would accept, so an unplayable entry moves on to the next
// source. Returns { entry, listing } or { result } for a run that found nothing.
async function extractFromListingSources({
  config,
  existing,
  game,
  hrefNeedles,
  listingSources,
  options,
  redactor,
  steps,
  timeoutSeconds,
  validation,
}) {
  const extractListing = options.extractListing ?? extractGoozFromBasePage;
  const attemptSource = async ({ context, navigationTimeoutSeconds, onStage, source }) => {
    const extraction = await extractListing(source.baseUrl, {
      game,
      hrefNeedles,
      opponentName: game.opponentName,
      requireOpponent: config.extract?.requireOpponent === true,
      sourceAttempt: {
        context,
        onHost: (host) => redactor.add(host),
        onStage,
        privateHosts: redactor.hosts,
      },
      timeoutSeconds: navigationTimeoutSeconds,
    });
    for (const line of extraction.logLines ?? []) {
      steps.push({ step: 'extract_log', message: line });
    }
    if (extraction.failure) {
      return { code: extraction.failure };
    }
    const url =
      extraction.found && isValidGoozPlayerUrl(extraction.goozUrl)
        ? httpsProviderUrl(extraction.goozUrl)
        : undefined;
    if (!url) {
      return { code: 'invalid_entry' };
    }
    const entry = {
      gameDates: [game.officialDate],
      gameNumbers: [game.gameNumber],
      kind: 'web',
      url,
      allowInsecureHttp: false,
      trustedHosts: providerForUrl(url)?.trustedHosts ?? [],
      ...(game.sport ? { sport: game.sport } : {}),
    };
    return isPlayableStream(entry, validation) ? { entry } : { code: 'invalid_entry' };
  };

  const listing = await runSources({
    attemptSource,
    clock: options.clock,
    launchBrowser: options.launchBrowser ?? launchExtractBrowser,
    log: (message) => steps.push({ step: 'listing_source', message }),
    newContext: options.newContext ?? newExtractContext,
    redact: redactor.text,
    sources: listingSources.sources,
    timing: { ...DEFAULT_TIMING, primary: { navigationTimeoutSeconds: timeoutSeconds } },
    total: listingSources.allSources.length,
  });
  if (listing.entry) {
    return { entry: listing.entry, listing };
  }

  const result = {
    game,
    listing,
    outcome: listing.code,
    steps,
    success: false,
  };
  if (listing.code === 'ambiguous_link') {
    return {
      result: {
        ...result,
        message: 'More than one listing link matches this game; nothing was published.',
      },
    };
  }
  if (listing.code === 'no_video') {
    return {
      result: {
        ...result,
        message: LISTING_FAILURE_MESSAGES.no_video,
        nextEntry: buildBlankStreamEntry(game),
        streamEntry: existing,
      },
    };
  }
  return {
    result: {
      ...result,
      message: LISTING_FAILURE_MESSAGES[listing.code] ?? `Listing sources stopped: ${listing.code}.`,
    },
  };
}

// The last common stretch of a run: skips an unchanged entry, stops a dry run, otherwise
// publishes.
async function publishFoundEntry({
  config,
  document,
  game,
  github,
  nextEntry,
  options,
  steps,
  streamsPath,
  today,
  token,
  validation,
}) {
  const equivalent = findEquivalentStream(document, game, nextEntry, validation);
  if (equivalent) {
    return {
      game,
      outcome: 'unchanged',
      message: 'Stream entry is already up to date; nothing to publish.',
      nextEntry,
      steps,
      streamEntry: equivalent,
      success: true,
    };
  }

  if (options.dryRun) {
    return {
      game,
      outcome: 'dry_run',
      message: `Dry run complete; ${github.path} was not written.`,
      nextEntry,
      steps,
      success: true,
    };
  }

  return publishStreamDocument({
    config,
    document,
    game,
    github,
    nextEntry,
    options,
    steps,
    streamsPath,
    today,
    token,
  });
}

export async function runGoozPipeline(options = {}) {
  const configPath = options.configPath ?? defaultConfigPath;
  const config = await loadConfig(configPath);
  const steps = [];
  const dispatchSport =
    options.dispatchSport ?? (process.env.DISPATCH_SPORT?.trim() || undefined);
  const expectedModule =
    options.module ?? (process.env.PIPELINE_MODULE?.trim() || undefined);

  const problem = configProblem(config, { dispatchSport, expectedModule });
  if (problem) {
    return {
      outcome: 'config_missing',
      message: problem,
      steps,
      success: false,
    };
  }

  const redactor = options.redactor ?? createRedactor();
  const listingSources = await loadListingSources({
    configPath: options.sourcesConfigPath,
    redactor,
    sourceOnly: options.sourceOnly,
  });
  if (listingSources.problem) {
    return {
      outcome: 'config_invalid',
      message: listingSources.problem,
      steps,
      success: false,
    };
  }

  const moduleName = moduleForConfig(config);
  const leadMinutes = config.leadMinutes ?? DEFAULT_LEAD_MINUTES;
  const timeoutSeconds =
    config.extract?.timeoutSeconds ?? config.probeTimeoutSeconds ?? 90;
  const streamsPath = streamsPathForConfig(config);
  const github = githubTarget(config);
  const token = options.githubToken?.trim() || process.env.GITHUB_TOKEN?.trim();
  const validation = { requireSport: moduleName === 'cyclones' };
  const now = options.now ?? new Date();
  const today = officialDateInZone(now, moduleTimeZone(config));

  let games;
  try {
    games = await fetchConfiguredGames(config, now);
  } catch (error) {
    if (!listingSources.sources) {
      throw error;
    }
    return {
      outcome: 'schedule_failed',
      message: `Schedule could not be read: ${redactor.text(error instanceof Error ? error.message : String(error))}`,
      steps,
      success: false,
    };
  }
  const game = featuredGameForConfig(config, games, now, dispatchSport);
  if (!game) {
    return {
      outcome: 'no_game',
      message: noGameMessage(config),
      steps,
      success: true,
    };
  }

  steps.push({
    step: scheduleStepName(config),
    game,
    message: `Featured game ${game.officialDate} #${game.gameNumber} vs ${game.opponentName} (${game.status}).`,
  });

  if (isBlockedGame(game)) {
    return {
      game,
      outcome: 'blocked',
      message: `Game is ${game.status}; pipeline skipped.`,
      steps,
      success: true,
    };
  }

  if (isGameOver(game)) {
    return {
      game,
      outcome: 'game_over',
      message: 'Game is final; pipeline skipped.',
      steps,
      success: true,
    };
  }

  const document = await readCurrentStreamsDocument({ github, streamsPath, steps, token });
  const existing = findPlayableStreamForGame(document, game, validation);
  if (existing && game.resumed) {
    steps.push({
      step: 'resumed_game',
      message: `Resumed game; replacing the entry for ${game.officialDate} game ${game.gameNumber}.`,
    });
  }
  if (existing && !replacesExistingEntry(options, game)) {
    return {
      game,
      outcome: 'video_ready',
      message: 'Video entry is already loaded for this game.',
      steps,
      streamEntry: existing,
      success: true,
    };
  }

  if (!options.force && !isWithinGetVideoWindow(game, now, leadMinutes)) {
    return {
      game,
      outcome: 'too_early',
      message: `Get video opens ${leadMinutes} minutes before first pitch.`,
      steps,
      success: true,
    };
  }

  const baseUrl = config.extract.baseUrl.trim();
  const hrefNeedles = hrefNeedlesForGame(config, game);
  if (hrefNeedles.length === 0) {
    return {
      game,
      outcome: 'config_missing',
      message: `Pipeline config has no href needles for ${game.sport ?? moduleName}.`,
      steps,
      success: false,
    };
  }

  const shared = {
    config,
    document,
    game,
    github,
    options,
    steps,
    streamsPath,
    today,
    token,
    validation,
  };

  if (listingSources.sources) {
    const extracted = await extractFromListingSources({
      config,
      existing,
      game,
      hrefNeedles,
      listingSources,
      options,
      redactor,
      steps,
      timeoutSeconds,
      validation,
    });
    if (extracted.result) {
      return extracted.result;
    }
    try {
      const result = await publishFoundEntry({ ...shared, nextEntry: extracted.entry });
      return { ...result, listing: extracted.listing };
    } catch (error) {
      return {
        game,
        listing: extracted.listing,
        outcome: 'publish_failed',
        message: `Publish failed: ${redactor.text(error instanceof Error ? error.message : String(error))}`,
        nextEntry: extracted.entry,
        steps,
        success: false,
      };
    }
  }

  steps.push({
    step: 'extract_gooz',
    message: `Extracting gooz URL from listing path ${urlPathForLog(baseUrl)} using href "${hrefNeedles.join(' + ')}".`,
  });

  const extractListing = options.extractListing ?? extractGoozFromBasePage;
  let extraction;
  try {
    extraction = await extractListing(baseUrl, {
      game,
      hrefNeedles,
      opponentName: game.opponentName,
      requireOpponent: config.extract?.requireOpponent === true,
      timeoutSeconds,
    });
  } catch (error) {
    let listingHost;
    try {
      listingHost = new URL(baseUrl).hostname;
    } catch {}
    return {
      game,
      outcome: 'extract_failed',
      message: `Extraction failed: ${redactHosts(error instanceof Error ? error.message : String(error), [listingHost])}`,
      steps,
      success: false,
    };
  }
  for (const line of extraction.logLines ?? []) {
    steps.push({ step: 'extract_log', message: line });
  }

  if (extraction.failure === 'ambiguous_link') {
    return {
      game,
      outcome: 'ambiguous_link',
      message: 'More than one listing link matches this game; nothing was published.',
      steps,
      success: false,
    };
  }
  if (extraction.failure === 'config_missing') {
    return {
      game,
      outcome: 'config_missing',
      message: extraction.message,
      steps,
      success: false,
    };
  }

  const foundUrl =
    extraction.found && isValidGoozPlayerUrl(extraction.goozUrl)
      ? httpsProviderUrl(extraction.goozUrl)
      : undefined;
  if (!foundUrl) {
    steps.push({
      step: 'gooz_not_found',
      message: 'No video found.',
      success: false,
    });
    return {
      game,
      outcome: 'no_video',
      message: 'No video found.',
      nextEntry: buildBlankStreamEntry(game),
      steps,
      streamEntry: existing,
      success: false,
    };
  }

  const nextEntry = {
    gameDates: [game.officialDate],
    gameNumbers: [game.gameNumber],
    kind: 'web',
    url: foundUrl,
    allowInsecureHttp: false,
    trustedHosts: [],
    ...(game.sport ? { sport: game.sport } : {}),
  };

  if (!isPlayableStream(nextEntry, validation)) {
    return {
      game,
      outcome: 'invalid_entry',
      message: 'Extracted entry would be rejected by the phone; nothing was published.',
      nextEntry,
      steps,
      success: false,
    };
  }

  return publishFoundEntry({ ...shared, nextEntry });
}
