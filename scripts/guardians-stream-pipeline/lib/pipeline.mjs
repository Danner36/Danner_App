import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBlankStreamEntry,
  extractGoozFromBasePage,
  isValidGoozPlayerUrl,
} from './extractGooz.mjs';
import { resolvePlayerPageUrl } from './indexPage.mjs';
import {
  featuredGame,
  fetchGuardiansGames,
  isBlockedGame,
  isWithinProbeWindow,
} from './mlbSchedule.mjs';
import { probePlayerPage } from './probePlayer.mjs';
import { publishStreamsFile } from './publishGithub.mjs';
import {
  buildStreamEntry,
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

export function isGameOver(game) {
  return game.abstractState === 'Final';
}

export function isWithinGetVideoWindow(game, now, leadMinutes) {
  if (isGameOver(game) || isBlockedGame(game)) {
    return false;
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
    if (parsed.hostname.toLowerCase().endsWith('gooz.aapmains.net')) {
      return isValidGoozPlayerUrl(stream.url);
    }
    return true;
  } catch {
    return false;
  }
}

export function getButtonState(game, streamEntry, now, config) {
  const leadMinutes = config.leadMinutes ?? 15;

  if (!game) {
    return {
      enabled: false,
      message: 'No Guardians game is scheduled for today.',
      phase: 'no_game',
      visible: false,
    };
  }

  if (isBlockedGame(game)) {
    return {
      enabled: false,
      game,
      message: `Game is ${game.status}. Get video is unavailable.`,
      phase: 'blocked',
      visible: false,
    };
  }

  if (isGameOver(game)) {
    return {
      enabled: false,
      game,
      message: 'Game is final. Get video is closed.',
      phase: 'game_over',
      visible: false,
    };
  }

  if (isValidStreamEntry(streamEntry)) {
    return {
      enabled: false,
      game,
      message: 'Video entry is loaded for this game.',
      phase: 'video_ready',
      streamEntry,
      visible: true,
    };
  }

  const opensAt = new Date(
    new Date(game.gameDate).getTime() - leadMinutes * 60_000,
  );
  if (!isWithinGetVideoWindow(game, now, leadMinutes)) {
    return {
      enabled: false,
      game,
      message: `Get video opens ${leadMinutes} minutes before first pitch.`,
      opensAt: opensAt.toISOString(),
      phase: 'too_early',
      visible: true,
    };
  }

  return {
    enabled: true,
    game,
    message: 'Ready to find the Guardians stream.',
    phase: 'ready_to_fetch',
    visible: true,
  };
}

export async function getPipelineStatus(configPath = defaultConfigPath) {
  const config = await loadConfig(configPath);
  const now = new Date();
  const teamId = config.teamId ?? 114;
  const games = await fetchGuardiansGames(teamId, now);
  const game = featuredGame(games, now);
  const streamsPath = streamsPathForConfig(config);
  const document = await readStreamsDocument(streamsPath);
  const streamEntry = game ? findStreamForGame(document, game) : undefined;
  const button = getButtonState(game, streamEntry, now, config);

  return {
    button,
    configPath,
    game,
    now: now.toISOString(),
    streamEntry,
    streamsPath: path.relative(repoRoot, streamsPath),
  };
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

  const games = await fetchGuardiansGames(teamId, now);
  const game = featuredGame(games, now);
  if (!game) {
    return {
      outcome: 'no_game',
      message: 'No Guardians game is scheduled for today.',
      steps,
      success: true,
    };
  }

  steps.push({
    step: 'mlb_schedule',
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
      message: 'Dry run complete; guardians_streams.json was not written.',
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

export async function runPipeline(options = {}) {
  const configPath = options.configPath ?? defaultConfigPath;
  const config = await loadConfig(configPath);
  const teamId = config.teamId ?? 114;
  const leadMinutes = config.leadMinutes ?? 15;
  const postStartGraceMinutes = config.postStartGraceMinutes ?? 180;
  const probeTimeoutSeconds = config.probeTimeoutSeconds ?? 90;
  const streamsPath = streamsPathForConfig(config);
  const now = new Date();
  const steps = [];

  const games = await fetchGuardiansGames(teamId, now);
  const game = featuredGame(games, now);
  if (!game) {
    return {
      outcome: 'no_game',
      message: 'No Guardians game is scheduled for today.',
      steps,
      success: true,
    };
  }

  steps.push({
    step: 'mlb_schedule',
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
  if (existing && !options.forceRefresh) {
    return {
      game,
      outcome: 'video_ready',
      message: 'Video entry is already loaded for this game.',
      steps,
      streamEntry: existing,
      success: true,
    };
  }

  if (
    !options.force &&
    !isWithinGetVideoWindow(game, now, leadMinutes)
  ) {
    return {
      game,
      outcome: 'too_early',
      message: `Get video opens ${leadMinutes} minutes before first pitch.`,
      steps,
      success: true,
    };
  }

  if (
    !options.force &&
    !isWithinProbeWindow(game, now, leadMinutes, postStartGraceMinutes)
  ) {
    return {
      game,
      outcome: 'outside_probe_window',
      message: `Outside probe window (${leadMinutes} minutes before start through ${postStartGraceMinutes} minutes after start).`,
      steps,
      success: true,
    };
  }

  const playerPageUrl = await resolvePlayerPageUrl(game, config.resolver);
  if (!playerPageUrl) {
    steps.push({
      step: 'resolve_page',
      message: 'No matching player page was found on the configured index.',
      success: false,
    });
    return {
      game,
      outcome: 'resolve_failed',
      message: 'No matching player page was found on the configured index.',
      steps,
      success: false,
    };
  }

  steps.push({
    step: 'resolve_page',
    message: 'Resolved player page URL.',
    playerPageUrl,
    success: true,
  });

  const probeResult = await probePlayerPage(playerPageUrl, {
    allowInsecureHttp: config.playback?.allowInsecureHttp === true,
    defaultKind: config.playback?.defaultKind ?? 'web',
    preferDirectMedia: config.playback?.preferDirectMedia === true,
    timeoutSeconds: probeTimeoutSeconds,
    trustedHosts: config.playback?.trustedHosts ?? [],
  });

  steps.push({
    step: 'probe_page',
    message: probeResult.active
      ? 'Active media signals detected.'
      : 'No active media signals detected.',
    probeResult,
    success: probeResult.active,
  });

  if (!probeResult.active) {
    return {
      game,
      outcome: 'probe_inactive',
      message: 'Player page loaded but no active media signals were detected.',
      probeResult,
      steps,
      success: false,
    };
  }

  const nextEntry = buildStreamEntry(game, probeResult, config.playback ?? {});
  if (!entryChanged(existing, nextEntry)) {
    return {
      game,
      outcome: 'unchanged',
      message: 'Stream entry is already up to date; nothing to publish.',
      steps,
      streamEntry: existing,
      success: true,
    };
  }

  if (options.dryRun) {
    return {
      game,
      outcome: 'dry_run',
      message: 'Dry run complete; guardians_streams.json was not written.',
      nextEntry,
      probeResult,
      steps,
      success: true,
    };
  }

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
      probeResult,
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
    probeResult,
    steps,
    streamEntry: nextEntry,
    success: true,
  };
}

export async function runDemoProbe(pageUrl, playback = {}) {
  const probeResult = await probePlayerPage(pageUrl, {
    allowInsecureHttp: playback.allowInsecureHttp === true,
    defaultKind: playback.defaultKind ?? 'web',
    preferDirectMedia: playback.preferDirectMedia === true,
    timeoutSeconds: playback.probeTimeoutSeconds ?? 90,
    trustedHosts: playback.trustedHosts ?? [],
  });

  return {
    message: probeResult.active
      ? 'Demo probe detected active media signals.'
      : 'Demo probe did not detect active media signals.',
    pageUrl,
    probeResult,
    success: probeResult.active,
  };
}
