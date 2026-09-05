import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBlankStreamEntry,
  extractGoozFromBasePage,
  isGoozHost,
  isValidGoozPlayerUrl,
} from './extractGooz.mjs';
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
import { publishStreamsFile } from './publishGithub.mjs';
import {
  entryChanged,
  findStreamForGame,
  readStreamsDocument,
  upsertStream,
  writeStreamsDocument,
} from './streamsDocument.mjs';

const pipelineDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(pipelineDir, '../../..');
export const defaultConfigPath = path.join(
  path.dirname(pipelineDir),
  'config.json',
);

export async function loadConfig(configPath = defaultConfigPath) {
  const text = await readFile(configPath, 'utf8');
  return JSON.parse(text);
}

export function streamsPathForConfig(config) {
  return path.resolve(
    repoRoot,
    config.github?.streamsPath ?? 'guardians_streams.json',
  );
}

function noGameMessage(config) {
  if (config.sport === 'nfl') {
    return 'No Patriots game is scheduled for today.';
  }
  if (config.sport === 'cyclones') {
    return 'No Cyclones game is scheduled for today.';
  }
  return 'No Guardians game is scheduled for today.';
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

function featuredGameForConfig(config, games, now, dispatchSport) {
  if (config.sport === 'cyclones') {
    const scoped = dispatchSport
      ? games.filter((game) => game.sport === dispatchSport)
      : games;
    return featuredCyclonesGame(scoped, now);
  }
  return featuredGame(games, now);
}

function hrefNeedlesForGame(config, game) {
  const bySport = config.extract?.hrefNeedles;
  if (game?.sport && bySport && typeof bySport === 'object') {
    const needles = bySport[game.sport];
    if (Array.isArray(needles) && needles.length > 0) {
      return needles;
    }
  }
  if (typeof config.extract?.hrefNeedle === 'string' && config.extract.hrefNeedle.trim()) {
    return [config.extract.hrefNeedle.trim()];
  }
  return ['cleveland-guardians'];
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
  const startMs = new Date(game.gameDate).getTime();
  const leadMs = leadMinutes * 60_000;
  return now.getTime() >= startMs - leadMs;
}

export function isValidStreamEntry(stream) {
  if (
    !stream ||
    typeof stream.url !== 'string' ||
    !stream.url.trim() ||
    (stream.kind !== 'direct' &&
      stream.kind !== 'web' &&
      stream.kind !== 'youtube')
  ) {
    return false;
  }

  try {
    const parsed = new URL(stream.url);
    const protocolAllowed =
      parsed.protocol === 'https:' ||
      (parsed.protocol === 'http:' && stream.allowInsecureHttp === true);
    if (!protocolAllowed) {
      return false;
    }
    if (isGoozHost(parsed.hostname)) {
      return isValidGoozPlayerUrl(stream.url);
    }
    return true;
  } catch {
    return false;
  }
}

async function publishStreamDocument({
  config,
  document,
  game,
  nextEntry,
  options,
  steps,
  streamsPath,
}) {
  const updated = upsertStream(document, nextEntry, game);
  await writeStreamsDocument(streamsPath, updated);
  steps.push({
    step: 'write_local',
    message: `Updated ${path.relative(repoRoot, streamsPath)}.`,
    streamEntry: nextEntry,
    success: true,
  });

  const token = options.githubToken?.trim() || process.env.GITHUB_TOKEN?.trim();
  if (!token) {
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

  const github = config.github ?? {};
  const owner = github.owner ?? 'Danner36';
  const repo = github.repo ?? 'Danner_App';
  const branch = github.branch ?? 'main';
  const messagePrefix =
    github.commitMessagePrefix ?? 'guardians: update stream for';
  const commitMessage = `${messagePrefix} ${game.officialDate} game ${game.gameNumber}`;

  await publishStreamsFile({
    branch,
    localPath: streamsPath,
    message: commitMessage,
    owner,
    path: github.streamsPath ?? 'guardians_streams.json',
    repo,
    token,
  });

  steps.push({
    step: 'publish_github',
    commitMessage,
    message: `Published to ${owner}/${repo}@${branch}.`,
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

export async function runGoozPipeline(options = {}) {
  const configPath = options.configPath ?? defaultConfigPath;
  const config = await loadConfig(configPath);
  const leadMinutes = config.leadMinutes ?? 15;
  const timeoutSeconds =
    config.extract?.timeoutSeconds ?? config.probeTimeoutSeconds ?? 90;
  const streamsPath = streamsPathForConfig(config);
  const now = new Date();
  const steps = [];
  const dispatchSport =
    options.dispatchSport ?? process.env.DISPATCH_SPORT?.trim() ?? undefined;

  const games = await fetchConfiguredGames(config, now);
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

  const document = await readStreamsDocument(streamsPath);
  const existing = findStreamForGame(document, game);
  if (
    isValidStreamEntry(existing) &&
    !options.force &&
    !options.forceRefresh
  ) {
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

  const baseUrl =
    typeof config.extract?.baseUrl === 'string'
      ? config.extract.baseUrl.trim()
      : '';
  if (!baseUrl) {
    return {
      game,
      outcome: 'config_missing',
      message: 'extract.baseUrl is missing from pipeline config.',
      steps,
      success: false,
    };
  }

  const hrefNeedles = hrefNeedlesForGame(config, game);

  steps.push({
    step: 'extract_gooz',
    message: `Extracting gooz URL from ${baseUrl} using href "${hrefNeedles.join(' + ')}".`,
  });

  const extraction = await extractGoozFromBasePage(baseUrl, {
    hrefNeedles,
    timeoutSeconds,
  });
  for (const line of extraction.logLines ?? []) {
    steps.push({ step: 'extract_log', message: line });
  }

  const foundUrl =
    extraction.found && isValidGoozPlayerUrl(extraction.goozUrl)
      ? extraction.goozUrl
      : undefined;
  const nextEntry = foundUrl
    ? {
        gameDates: [game.officialDate],
        gameNumbers: [game.gameNumber],
        kind: 'web',
        url: foundUrl,
        allowInsecureHttp: false,
        trustedHosts: [],
        ...(game.sport ? { sport: game.sport } : {}),
      }
    : buildBlankStreamEntry(game);

  if (!foundUrl) {
    steps.push({
      step: 'gooz_not_found',
      message: 'No video found.',
      success: false,
    });
  }

  if (!entryChanged(existing, nextEntry)) {
    return {
      game,
      outcome: foundUrl ? 'unchanged' : 'no_video',
      message: foundUrl
        ? 'Stream entry is already up to date; nothing to publish.'
        : 'No video found.',
      nextEntry,
      steps,
      streamEntry: existing,
      success: Boolean(foundUrl),
    };
  }

  if (options.dryRun) {
    return {
      game,
      outcome: 'dry_run',
      message: `Dry run complete; ${config.github?.streamsPath ?? 'guardians_streams.json'} was not written.`,
      nextEntry,
      steps,
      success: true,
    };
  }

  const published = await publishStreamDocument({
    config,
    document,
    game,
    nextEntry,
    options,
    steps,
    streamsPath,
  });

  if (!foundUrl) {
    return {
      ...published,
      outcome: 'no_video',
      message: 'No video found.',
      success: false,
    };
  }

  return published;
}
