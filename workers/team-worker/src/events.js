// Confirms that a Get video event belongs to the team and is Live or near its start. Runs only
// after the app key check, so a caller without the key cannot make the Worker call ESPN or statsapi.

const ESPN_SUMMARY_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const STATSAPI_SCHEDULE = 'https://statsapi.mlb.com/api/v1/schedule';
const REQUEST_TIMEOUT_MS = 5000;
const EVENT_CACHE_MS = 60 * 1000;
const EVENT_CACHE_MAX = 256;
const OFFICIAL_DATE_ZONE = 'America/New_York';
const WINDOW_LEAD_MINUTES = 20;
const POST_START_GRACE_MINUTES = { default: 240, mlb: 180 };
const INTERRUPTED_STATUS = /cancel|postpon|suspend/i;

function officialDateInZone(startMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(new Date(startMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizedEspn(summary) {
  const competition = summary?.header?.competitions?.[0];
  const state = competition?.status?.type?.state;
  const startMs = Date.parse(competition?.date ?? '');
  if (!Array.isArray(competition?.competitors) || typeof state !== 'string' || Number.isNaN(startMs)) {
    return undefined;
  }
  return {
    competitorIds: competition.competitors.map((item) => String(item?.team?.id ?? item?.id ?? '')),
    interrupted: INTERRUPTED_STATUS.test(String(competition.status.type.name ?? '')),
    startMs,
    state,
    timeValid: competition.timeValid !== false && competition.status.isTBDFlex !== true,
  };
}

function normalizedStatsapi(schedule) {
  if (!Array.isArray(schedule?.dates)) {
    return undefined;
  }
  const game = schedule.dates.flatMap((date) => date?.games ?? [])[0];
  if (!game) {
    return { missing: true };
  }
  const startMs = Date.parse(game.gameDate ?? '');
  const abstract = game.status?.abstractGameState;
  if (Number.isNaN(startMs) || typeof abstract !== 'string') {
    return undefined;
  }
  return {
    competitorIds: [game.teams?.home?.team?.id, game.teams?.away?.team?.id].map(String),
    interrupted: INTERRUPTED_STATUS.test(String(game.status.detailedState ?? '')),
    officialDate: typeof game.officialDate === 'string' ? game.officialDate : undefined,
    startMs,
    state: abstract === 'Live' ? 'in' : abstract === 'Final' ? 'post' : 'pre',
    timeValid: game.status.startTimeTBD !== true,
  };
}

function eventSource(leagueRow, sport) {
  const schedule =
    sport === undefined
      ? leagueRow?.schedule
      : leagueRow?.sports?.find((row) => row?.key === sport)?.schedule;
  if (schedule?.provider === 'mlb-statsapi') {
    return { provider: 'mlb' };
  }
  if (typeof schedule?.sitePath === 'string') {
    return { provider: 'espn', sitePath: schedule.sitePath };
  }
  return undefined;
}

function eventUrl(source, eventId) {
  return source.provider === 'mlb'
    ? `${STATSAPI_SCHEDULE}?gamePk=${eventId}`
    : `${ESPN_SUMMARY_BASE}/${source.sitePath}/summary?event=${eventId}`;
}

function inWindow(event, league, nowMs) {
  if (event.interrupted || event.state === 'post') {
    return false;
  }
  if (event.state === 'in') {
    return true;
  }
  if (!event.timeValid) {
    return false;
  }
  const graceMinutes = POST_START_GRACE_MINUTES[league] ?? POST_START_GRACE_MINUTES.default;
  return (
    nowMs >= event.startMs - WINDOW_LEAD_MINUTES * 60_000 &&
    nowMs <= event.startMs + graceMinutes * 60_000
  );
}

// Results: { outcome: 'ok', officialDate }, { outcome: 'bad_event' }, { outcome: 'not_in_window' },
// or { outcome: 'skipped' } when the provider did not give a usable answer.
export function createEventChecker({ fetchImpl, log, now }) {
  const cache = new Map();

  async function load(source, eventId) {
    const key = `${source.provider}|${source.sitePath ?? ''}|${eventId}`;
    const cached = cache.get(key);
    if (cached && now() < cached.expiresAt) {
      return cached.event;
    }

    let response;
    try {
      response = await fetchImpl(eventUrl(source, eventId), {
        headers: { Accept: 'application/json', 'User-Agent': 'danner-team-worker' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      log('event provider unreachable', source.provider, error instanceof Error ? error.name : 'error');
      return undefined;
    }

    let event;
    if (response.status === 400 || response.status === 404) {
      event = { missing: true };
    } else if (!response.ok) {
      log('event provider error', source.provider, String(response.status));
      return undefined;
    } else {
      let body;
      try {
        body = await response.json();
      } catch {
        log('event provider sent an unreadable body', source.provider);
        return undefined;
      }
      event = source.provider === 'mlb' ? normalizedStatsapi(body) : normalizedEspn(body);
      if (!event) {
        log('event provider sent an unexpected shape', source.provider);
        return undefined;
      }
    }

    if (cache.size >= EVENT_CACHE_MAX) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(key, { event, expiresAt: now() + EVENT_CACHE_MS });
    return event;
  }

  return {
    async check({ entry, eventId, league, leagueRow, sport }) {
      const source = eventSource(leagueRow, sport);
      const teamId = source?.provider === 'mlb' ? entry.statsapi?.teamId : entry.espnId;
      if (!source || teamId === undefined) {
        return { outcome: 'skipped' };
      }
      const event = await load(source, eventId);
      if (!event) {
        return { outcome: 'skipped' };
      }
      if (event.missing || !event.competitorIds.includes(String(teamId))) {
        return { outcome: 'bad_event' };
      }
      if (!inWindow(event, league, now())) {
        return { outcome: 'not_in_window' };
      }
      const officialDate =
        event.officialDate ??
        officialDateInZone(event.startMs, leagueRow?.officialDateZone ?? OFFICIAL_DATE_ZONE);
      return { officialDate, outcome: 'ok' };
    },
  };
}
