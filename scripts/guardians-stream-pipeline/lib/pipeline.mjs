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
  return config.sport === 'nfl'
    ? 'No Patriots game is scheduled for today.'
    : 'No Guardians game is scheduled for today.';
}

async function fetchConfiguredGames(config, now) {
  const teamId =
    config.teamId ?? (config.sport === 'nfl' ? 17 : 114);
  return config.sport === 'nfl'
    ? fetchPatriotsGames(teamId, now)
    : fetchGuardiansGames(teamId, now);
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
  const teamId = config.teamId ?? 114;
  const leadMinutes = config.leadMinutes ?? 15;
  const timeoutSeconds =
    config.extract?.timeoutSeconds ?? config.probeTimeoutSeconds ?? 90;
  const streamsPath = streamsPathForConfig(config);
  const now = new Date();
  const steps = [];

  const games = await fetchConfiguredGames(config, now);
  const game = featuredGame(games, now);
  if (!game) {
    return {
      outcome: 'no_game',
      message: noGameMessage(config),
      steps,
      success: true,
    };
  }

  steps.push({
    step: config.sport === 'nfl' ? 'espn_schedule' : 'mlb_schedule',
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

  const hrefNeedle =
    typeof config.extract?.hrefNeedle === 'string' &&
    config.extract.hrefNeedle.trim()
      ? config.extract.hrefNeedle.trim()
      : 'cleveland-guardians';

  steps.push({
    step: 'extract_gooz',
    message: `Extracting gooz URL from ${baseUrl} using href "${hrefNeedle}".`,
  });

  const extraction = await extractGoozFromBasePage(baseUrl, {
    hrefNeedle,
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
