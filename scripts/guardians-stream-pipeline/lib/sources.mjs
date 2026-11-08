// Ordered listing failover. Browser and page work are injected, so this module holds only the
// source order, the budgets, the failure codes and the final outcome.

// A move-on failure: the site is down or blocked, or this game is not found or not playable there.
export const NEXT_CODES = new Set([
  'nav_error',
  'nav_timeout',
  'http_4xx',
  'http_5xx',
  'bot_challenge',
  'link_not_found',
  'opponent_not_found',
  'ambiguous_link',
  'game_nav',
  'player_not_found',
  'unknown_provider',
  'invalid_entry',
  'unplayable',
  'source_timeout',
]);

export const STOP_CODES = new Set([
  'bad_team',
  'bad_sport',
  'bad_event',
  'config_invalid',
  'browser_failed',
  'schedule_failed',
  'no_game',
  'blocked',
  'game_over',
  'too_early',
  'video_ready',
  'deadline',
  'publish_failed',
]);

const UNREACHABLE_CODES = new Set([
  'nav_error',
  'nav_timeout',
  'http_4xx',
  'http_5xx',
  'bot_challenge',
]);

export const DEFAULT_TIMING = {
  primary: { navigationTimeoutSeconds: 90 },
  backup: { navigationTimeoutSeconds: 30, timeoutSeconds: 120 },
  extractDeadlineSeconds: 600,
};

export const MIN_SECONDS_FOR_NEXT_SOURCE = 45;
// What a backup needs to reach the link stage: 30 s navigation plus the 5 s settle after it.
export const MIN_BACKUP_BUDGET_SECONDS = 35;
export const MAX_SOURCES = 5;

const LABEL_PATTERN = /^[a-z0-9-]{1,24}$/;
const MIN_SOURCE_TIMEOUT_SECONDS = 30;
const MAX_SOURCE_TIMEOUT_SECONDS = 300;

const systemClock = {
  now: () => Date.now(),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => clearTimeout(handle),
};

// A failure thrown outside the page steps is charged to the stage it interrupted.
const CODE_FOR_THROWN_STAGE = {
  listing: 'nav_error',
  link: 'link_not_found',
  game: 'game_nav',
  player: 'player_not_found',
  entry: 'invalid_entry',
};

function parseHttpUrl(value) {
  try {
    const parsed = new URL(typeof value === 'string' ? value.trim() : '');
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// Every baseUrl the config names, valid or not, so a malformed entry is still masked.
export function rawSourceUrls(config) {
  if (!Array.isArray(config?.sources)) {
    return [];
  }
  return config.sources
    .map((source) => source?.baseUrl)
    .filter((baseUrl) => typeof baseUrl === 'string' && baseUrl.trim());
}

// Each message is free of values and names a source by its number, never by URL or host.
export function sourcesConfigProblem(config) {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return 'Listing sources config is not a JSON object.';
  }
  if (config.schemaVersion !== 2) {
    return 'Listing sources config schemaVersion must be 2.';
  }
  const sources = config.sources;
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > MAX_SOURCES) {
    return `Listing sources config must list 1 to ${MAX_SOURCES} sources.`;
  }

  const seen = new Set();
  for (const [index, source] of sources.entries()) {
    const name = `source ${index + 1}`;
    if (typeof source !== 'object' || source === null || Array.isArray(source)) {
      return `Listing sources config ${name} is not an object.`;
    }
    if (typeof source.label !== 'string' || !LABEL_PATTERN.test(source.label)) {
      return `Listing sources config ${name} label must be 1 to 24 lowercase letters, digits, or hyphens.`;
    }
    const parsed = parseHttpUrl(source.baseUrl);
    if (!parsed) {
      return `Listing sources config ${name} baseUrl is missing or is not an http(s) URL.`;
    }
    const key = `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`.toLowerCase();
    if (seen.has(key)) {
      return `Listing sources config ${name} repeats the origin and path of an earlier source.`;
    }
    seen.add(key);
    if (
      source.timeoutSeconds !== undefined &&
      (!Number.isInteger(source.timeoutSeconds) ||
        source.timeoutSeconds < MIN_SOURCE_TIMEOUT_SECONDS ||
        source.timeoutSeconds > MAX_SOURCE_TIMEOUT_SECONDS)
    ) {
      return `Listing sources config ${name} timeoutSeconds must be ${MIN_SOURCE_TIMEOUT_SECONDS} to ${MAX_SOURCE_TIMEOUT_SECONDS}.`;
    }
  }
  return undefined;
}

export function normalizeSources(config) {
  return config.sources.map((source, index) => ({
    baseUrl: source.baseUrl.trim(),
    label: source.label,
    number: index + 1,
    ...(source.timeoutSeconds === undefined ? {} : { timeoutSeconds: source.timeoutSeconds }),
  }));
}

// The `source` workflow input is 1-based; blank tries every source.
export function parseSourceOnly(value, sourceCount) {
  const text = String(value ?? '').trim();
  if (!text) {
    return {};
  }
  const number = /^\d{1,2}$/.test(text) ? Number(text) : 0;
  if (number < 1 || number > sourceCount) {
    return {
      problem:
        sourceCount === 1
          ? 'The source input must be blank or 1; one listing source is configured.'
          : `The source input must be blank or a number from 1 to ${sourceCount}.`,
    };
  }
  return { sourceOnly: number };
}

export function sourceName(source, total) {
  return `source ${source.number}/${total} (${source.label})`;
}

// Source 1 runs with no cap unless its own timeoutSeconds is set. A backup takes its timeout,
// clamped to the time left before the extraction deadline minus the reserve.
export function sourceBudget(source, secondsLeft, timing = DEFAULT_TIMING) {
  if (source.number === 1) {
    return {
      navigationTimeoutSeconds: timing.primary.navigationTimeoutSeconds,
      budgetSeconds: source.timeoutSeconds,
    };
  }
  return {
    navigationTimeoutSeconds: timing.backup.navigationTimeoutSeconds,
    budgetSeconds: Math.min(
      source.timeoutSeconds ?? timing.backup.timeoutSeconds,
      secondsLeft - MIN_SECONDS_FOR_NEXT_SOURCE,
    ),
  };
}

export function outcomeForAttempts(attempts) {
  if (attempts.some((attempt) => attempt.result === 'ambiguous_link')) {
    return 'ambiguous_link';
  }
  if (attempts.length > 0 && attempts.every((attempt) => UNREACHABLE_CODES.has(attempt.result))) {
    return 'sources_unreachable';
  }
  return 'no_video';
}

async function attemptOneSource({
  attemptSource,
  budget,
  clock,
  context,
  redact,
  requireOpponent,
  source,
  total,
}) {
  let abandoned = false;
  let stage = 'listing';
  let timer;
  const attempted = attemptSource({
    context,
    isAbandoned: () => abandoned,
    navigationTimeoutSeconds: budget.navigationTimeoutSeconds,
    onStage: (next) => {
      stage = next;
    },
    requireOpponent,
    source,
  }).catch((error) => ({
    code: CODE_FOR_THROWN_STAGE[stage] ?? 'nav_error',
    detail: redact(error instanceof Error ? error.message : String(error)).split('\n')[0],
  }));

  let outcome;
  if (budget.budgetSeconds === undefined) {
    outcome = await attempted;
  } else {
    const timedOut = new Promise((resolve) => {
      timer = clock.setTimer(() => {
        abandoned = true;
        resolve({ code: 'source_timeout' });
      }, budget.budgetSeconds * 1000);
    });
    outcome = await Promise.race([attempted, timedOut]);
    clock.clearTimer(timer);
  }
  return { detail: outcome.detail, code: outcome.code, entry: outcome.entry, stage, name: sourceName(source, total) };
}

// Runs `sources` in order, one at a time, each in a fresh browser context, and stops at the first
// source that returns an entry. `total` is the configured count, which `sources` is smaller than
// when the run is limited to one source.
export async function runSources({
  attemptSource,
  clock = systemClock,
  launchBrowser,
  log = () => {},
  newContext,
  redact = (text) => text,
  sources,
  timing = DEFAULT_TIMING,
  total = sources.length,
}) {
  const startedAt = clock.now();
  const attempts = [];
  const finish = (code, extra = {}) => ({ attempts, code, total, ...extra });

  let browser;
  try {
    browser = await launchBrowser();
  } catch {
    log('The browser could not be started.');
    return finish('browser_failed');
  }

  try {
    for (const [position, source] of sources.entries()) {
      const elapsedSeconds = (clock.now() - startedAt) / 1000;
      const secondsLeft = timing.extractDeadlineSeconds - elapsedSeconds;
      // Judged on the time left, not the source's own timeoutSeconds, which may be below the minimum.
      if (position > 0 && secondsLeft - MIN_SECONDS_FOR_NEXT_SOURCE < MIN_BACKUP_BUDGET_SECONDS) {
        log(`Extraction deadline reached before ${sourceName(source, total)}.`);
        return finish('deadline');
      }

      let context;
      try {
        context = await newContext(browser);
      } catch {
        log('The browser could not open a new context.');
        return finish('browser_failed');
      }

      const name = sourceName(source, total);
      const budget = sourceBudget(source, secondsLeft, timing);
      log(`Trying ${name}.`);
      const attemptStartedAt = clock.now();
      // A site that listed several links for this game may list only the wrong one on the next
      // site, so a lone link has to name the opponent once any source was ambiguous.
      const requireOpponent = attempts.some((attempt) => attempt.result === 'ambiguous_link');
      let outcome;
      try {
        outcome = await attemptOneSource({
          attemptSource,
          budget,
          clock,
          context,
          redact,
          requireOpponent,
          source,
          total,
        });
      } finally {
        await context.close().catch(() => {});
      }
      const seconds = Math.round((clock.now() - attemptStartedAt) / 1000);

      if (outcome.entry) {
        attempts.push({ label: source.label, number: source.number, result: 'found', seconds, stage: 'entry' });
        log(`Found an entry on ${name}.`);
        return finish('found', { entry: outcome.entry, winner: source });
      }

      attempts.push({
        label: source.label,
        number: source.number,
        result: outcome.code,
        seconds,
        stage: outcome.stage,
      });
      log(`${name[0].toUpperCase()}${name.slice(1)}: ${outcome.code} at ${outcome.stage}${outcome.detail ? ` (${outcome.detail})` : ''}.`);
      if (!NEXT_CODES.has(outcome.code)) {
        return finish(outcome.code);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return finish(outcomeForAttempts(attempts));
}

// Header line and per-source table for $GITHUB_STEP_SUMMARY. Sources appear only by number and
// label. The table's rule row is what makes GitHub render it as a table.
export function formatRunSummary({ moduleName, redact = (text) => text, result }) {
  const parts = [moduleName];
  if (result.game?.gamePk !== undefined) {
    parts.push(`event ${result.game.gamePk}`);
  }
  if (result.game?.officialDate) {
    parts.push(`${result.game.officialDate} game ${result.game.gameNumber}`);
  }
  const listing = result.listing;
  parts.push(
    listing?.winner
      ? `${result.outcome} from source ${listing.winner.number} of ${listing.total}`
      : result.outcome,
  );

  const lines = [parts.join(' | '), ''];
  if (listing?.attempts?.length) {
    lines.push('| # | Label | Stage reached | Result | Seconds |', '|---|---|---|---|---|');
    for (const attempt of listing.attempts) {
      lines.push(`| ${attempt.number} | ${attempt.label} | ${attempt.stage} | ${attempt.result} | ${attempt.seconds} |`);
    }
    lines.push('');
  }
  return redact(lines.join('\n'));
}
