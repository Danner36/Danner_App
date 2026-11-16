// Starts Get video runs before anyone taps. Every cron tick reads the most requested team and
// sport pairs, keeps a cached schedule for each, and starts a run for any game whose Get video
// window has opened and that has no entry yet. Runs go through the same gates as a phone's run,
// under the rate-limit key `prefetch`, so they share the hourly and in-flight caps.

import { fetchEspnGames } from '../../../scripts/stream-pipeline/lib/schedule/espn.mjs';
import { fetchMlbGames } from '../../../scripts/stream-pipeline/lib/schedule/mlbStatsapi.mjs';
import { checkedTeamSpec } from '../../../scripts/stream-pipeline/lib/teamSpec.mjs';
import { splitTeamKey } from './catalog.js';
import { readLimits } from './gates.js';
import { hasReadyEntry } from './streams.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export const PREFETCH_DEFAULTS = Object.freeze({
  // A minute inside the pipeline's 15-minute lead, so a run never lands as too_early.
  leadMinutes: 14,
  maxAttempts: 4,
  maxDispatchesPerTick: 3,
  maxRefreshesPerTick: 4,
  retryMinutes: 10,
  scheduleTtlMs: 6 * HOUR_MS,
  // A schedule with a game this close is re-read sooner, to catch a moved or postponed start.
  scheduleNearTtlMs: 30 * MINUTE_MS,
  scheduleNearWindowMs: 3 * HOUR_MS,
  scheduleFailedTtlMs: 30 * MINUTE_MS,
  tailMinutes: 45,
  topTeams: 10,
});

export const PREFETCH_IP = 'prefetch';

const SCHEDULE_PROVIDERS = { espn: fetchEspnGames, 'mlb-statsapi': fetchMlbGames };
const KEEP_PAST_MS = 6 * HOUR_MS;
const KEEP_AHEAD_MS = 48 * HOUR_MS;

function wholeNumberOr(value, fallback) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

// The Worker var PREFETCH_TOP_TEAMS sets how many of the most requested pairs are watched; 0 turns
// prefetch off. Prefetch is also off wherever no run may start at all, such as the staging Worker.
export function readPrefetchSettings(env) {
  return {
    ...PREFETCH_DEFAULTS,
    enabled: readLimits(env).globalDispatchPerHour > 0,
    topTeams: Math.min(wholeNumberOr(env.PREFETCH_TOP_TEAMS, PREFETCH_DEFAULTS.topTeams), 50),
  };
}

// The few fields the window check needs, for games from KEEP_PAST_MS ago to KEEP_AHEAD_MS ahead.
export function compactGames(games, nowMs) {
  return games
    .map((game) => ({
      blocked: /cancel|postpon|suspend/i.test(String(game.status ?? '')),
      eventId: String(game.gamePk),
      final: game.abstractState === 'Final',
      live: game.abstractState === 'Live',
      officialDate: game.officialDate,
      startMs: Date.parse(game.gameDate),
      timeValid: game.timeValid !== false,
    }))
    .filter((game) => !Number.isNaN(game.startMs) && game.startMs >= nowMs - KEEP_PAST_MS && game.startMs <= nowMs + KEEP_AHEAD_MS)
    .sort((first, second) => first.startMs - second.startMs);
}

export function scheduleIsStale(schedule, nowMs, settings = PREFETCH_DEFAULTS) {
  if (!schedule) {
    return true;
  }
  const age = nowMs - schedule.fetchedAt;
  if (schedule.failed) {
    return age >= settings.scheduleFailedTtlMs;
  }
  const near = (schedule.games ?? []).some(
    (game) => game.startMs > nowMs && game.startMs - nowMs <= settings.scheduleNearWindowMs,
  );
  return age >= (near ? settings.scheduleNearTtlMs : settings.scheduleTtlMs);
}

// Games whose prefetch window is open: from `leadMinutes` before a published start to
// `tailMinutes` after it. A cancelled, postponed, suspended or final game never qualifies.
export function gamesInPrefetchWindow(schedule, nowMs, settings = PREFETCH_DEFAULTS) {
  return (schedule?.games ?? []).filter(
    (game) =>
      !game.blocked &&
      !game.final &&
      (game.timeValid || game.live) &&
      nowMs >= game.startMs - settings.leadMinutes * MINUTE_MS &&
      nowMs <= game.startMs + settings.tailMinutes * MINUTE_MS,
  );
}

export function createPrefetcher({ catalog, fetchImpl, globalGate, log, now, startRun, streams, teamGate }) {
  async function readSchedule(env, row, nowMs) {
    const { league } = splitTeamKey(row.team);
    const [entry, leagueRow] = await Promise.all([catalog.team(env, row.team), catalog.leagueRow(env, league)]);
    const spec = checkedTeamSpec(leagueRow, entry, row.sport);
    const fetchGames = spec ? SCHEDULE_PROVIDERS[spec.schedule.provider] : undefined;
    if (!fetchGames) {
      return { failed: true, fetchedAt: nowMs, games: [] };
    }
    try {
      return { fetchedAt: nowMs, games: compactGames(await fetchGames(spec, new Date(nowMs), fetchImpl), nowMs) };
    } catch (error) {
      log('prefetch schedule read failed', row.key, error instanceof Error ? error.name : 'error');
      return { failed: true, fetchedAt: nowMs, games: [] };
    }
  }

  async function alreadyReady(env, row, game) {
    try {
      const { espnId, league } = splitTeamKey(row.team);
      const document = await streams.readParsed(env, league, espnId);
      return hasReadyEntry(document, { eventId: game.eventId, officialDate: game.officialDate, sport: row.sport });
    } catch {
      // Unknown: the run's own readiness check answers video_ready if the entry is there.
      return false;
    }
  }

  return {
    settings: readPrefetchSettings,

    // One tick. Returns a summary with team keys, event ids and codes only.
    async run(env) {
      const settings = readPrefetchSettings(env);
      const summary = { dispatched: [], refreshed: 0, skipped: [], watched: 0 };
      if (!settings.enabled || settings.topTeams === 0) {
        return { ...summary, off: true };
      }
      const nowMs = now();
      const { value: rows } = await globalGate(env, 'topDemand', settings.topTeams, { withSchedules: true });
      summary.watched = rows.length;

      const refreshed = [];
      for (const row of rows) {
        if (refreshed.length >= settings.maxRefreshesPerTick || !scheduleIsStale(row.schedule, nowMs, settings)) {
          continue;
        }
        row.schedule = await readSchedule(env, row, nowMs);
        refreshed.push({ key: row.key, schedule: row.schedule });
      }
      if (refreshed.length > 0) {
        await globalGate(env, 'storeSchedules', refreshed);
        summary.refreshed = refreshed.length;
      }

      for (const row of rows) {
        for (const game of gamesInPrefetchWindow(row.schedule, nowMs, settings)) {
          if (summary.dispatched.length >= settings.maxDispatchesPerTick) {
            return summary;
          }
          const { value: claim } = await teamGate(env, row.team, 'claimPrefetch', game.eventId, {
            maxAttempts: settings.maxAttempts,
            retryMs: settings.retryMinutes * MINUTE_MS,
          });
          if (!claim.ok) {
            continue;
          }
          if (await alreadyReady(env, row, game)) {
            summary.skipped.push({ eventId: game.eventId, reason: 'video_ready', team: row.team });
            continue;
          }
          const started = await startRun(env, {
            eventId: game.eventId,
            ip: PREFETCH_IP,
            origin: 'prefetch',
            sport: row.sport,
            teamKey: row.team,
          });
          summary.dispatched.push({ attempt: claim.attempt, code: started.code, eventId: game.eventId, team: row.team });
        }
      }
      return summary;
    },
  };
}
