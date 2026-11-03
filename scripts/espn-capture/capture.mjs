// Live ESPN capture of Iowa State college basketball games for the basketball arena board.
// `find` picks a live (or dispatched) event; `capture` polls it every 60 s and writes a
// trimmed selection of the polls under tests/leagues/<adapter>/captures/<event>/, which the
// `ESPN live capture` workflow commits.
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

export const TEAM_ID = 66;
export const TIME_ZONE = 'America/Chicago';
export const USER_AGENT = 'danner-app-espn-capture';
export const ADAPTER_LEAGUES = {
  'ncaa/mens-basketball': 'mens-college-basketball',
  'ncaa/womens-basketball': 'womens-college-basketball',
};
export const MAX_CAPTURED_EVENTS = 2;
export const MAX_COMMITTED_POLLS = 30;
export const POLL_INTERVAL_MS = 60_000;
export const MAX_SUMMARY_FAILURES = 10;
export const DEFAULT_MAX_MINUTES = 180;
const REQUEST_TIMEOUT_MS = 20_000;
const TRIMMED_TEXT_LIMIT = 4096;
const SUBSTITUTION_TYPE_ID = '584';
const REPORT_FIELD_PATTERN = /timeout|foul|bonus|possession/i;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// Basketball seasons are named by the year they end: July through December belong to the
// next year. The month is read in America/Chicago, independent of the process time zone.
export function basketballSeasonYear(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    timeZone: TIME_ZONE,
    year: 'numeric',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  return values.month >= 7 ? values.year + 1 : values.year;
}

export function adapterDirName(adapter) {
  return adapter.replaceAll('/', '-');
}

export function validEventId(value) {
  return typeof value === 'string' && /^\d{1,12}$/.test(value);
}

export function adaptersFor(input) {
  if (input === 'auto') {
    return Object.keys(ADAPTER_LEAGUES);
  }
  return Object.hasOwn(ADAPTER_LEAGUES, input) ? [input] : [];
}

export function clampMinutes(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_MINUTES;
  }
  return Math.min(240, Math.max(10, parsed));
}

export function scheduleUrl(adapter, season) {
  return `https://site.api.espn.com/apis/site/v2/sports/basketball/${ADAPTER_LEAGUES[adapter]}/teams/${TEAM_ID}/schedule?season=${season}`;
}

export function summaryUrl(adapter, event) {
  return `https://site.api.espn.com/apis/site/v2/sports/basketball/${ADAPTER_LEAGUES[adapter]}/summary?event=${event}`;
}

export function situationUrl(adapter, event) {
  return `https://sports.core.api.espn.com/v2/sports/basketball/leagues/${ADAPTER_LEAGUES[adapter]}/events/${event}/competitions/${event}/situation`;
}

export function capturesRoot(root, adapter) {
  return path.join(root, 'tests', 'leagues', adapterDirName(adapter), 'captures');
}

export function captureDir(root, adapter, event) {
  return path.join(capturesRoot(root, adapter), event);
}

// Captured events are the digit-named directories under the adapter's captures folder.
export function capturedEvents(root, adapter) {
  const dir = capturesRoot(root, adapter);
  if (!existsSync(dir)) {
    return new Set();
  }
  return new Set(
    readdirSync(dir).filter(
      (name) => /^\d+$/.test(name) && statSync(path.join(dir, name)).isDirectory(),
    ),
  );
}

function eventState(event) {
  return event?.competitions?.[0]?.status?.type?.state;
}

// Returns the event id to capture, or '' when there is none. A dispatched event must be in the
// schedule and may be in any state; otherwise the first in-progress event is taken. Captured
// events are skipped in both cases.
export function pickEvent(schedule, { event = '', captured = new Set() } = {}) {
  const events = asArray(schedule?.events);
  if (event) {
    const match = events.find((entry) => String(entry?.id) === event);
    return match && !captured.has(event) ? event : '';
  }
  const live = events.find((entry) => {
    const id = String(entry?.id);
    return eventState(entry) === 'in' && validEventId(id) && !captured.has(id);
  });
  return live ? String(live.id) : '';
}

// The phase text of status.type.detail with clock values removed ("12:34 - 1st Half" and
// "57.1 - 1st Half" both become "1st Half").
export function phaseFromDetail(detail) {
  if (typeof detail !== 'string') {
    return '';
  }
  return detail
    .replace(/\b\d{1,2}:\d{2}(?:\.\d+)?\b/g, ' ')
    .replace(/(^|\s)\d{1,2}\.\d+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s-]+|[\s-]+$/g, '')
    .trim();
}

function headerStatus(summary) {
  return summary?.header?.competitions?.[0]?.status;
}

export function pollMeta(summary) {
  const status = headerStatus(summary);
  return {
    clock: status?.displayClock ?? '',
    period: status?.period ?? null,
    phase: phaseFromDetail(status?.type?.detail),
    playsCount: Array.isArray(summary?.plays) ? summary.plays.length : 0,
    state: status?.type?.state ?? '',
    statusName: status?.type?.name ?? '',
  };
}

// Keeps k items of list at evenly spaced positions, first and last included when k >= 2.
function evenlySpaced(list, k) {
  if (k <= 0) {
    return [];
  }
  if (k >= list.length) {
    return [...list];
  }
  if (k === 1) {
    return [list[Math.floor((list.length - 1) / 2)]];
  }
  const kept = new Set();
  for (let i = 0; i < k; i += 1) {
    kept.add(list[Math.round((i * (list.length - 1)) / (k - 1))]);
  }
  return [...kept];
}

// polls: [{ pollIndex, ok, state, statusName, phase, period }]. Only ok polls are selectable.
// Kept: the first in-progress poll, each poll whose status name, phase or period differs from
// the previous ok poll, every 10th poll, and the last ok poll. Over the limit, every-10th polls
// are thinned evenly first, then status changes; the first in-progress and last polls stay.
export function selectPolls(polls, limit = MAX_COMMITTED_POLLS) {
  const ok = polls.filter((poll) => poll.ok);
  if (ok.length === 0) {
    return [];
  }
  const fixed = new Set();
  const firstIn = ok.find((poll) => poll.state === 'in');
  if (firstIn) {
    fixed.add(firstIn.pollIndex);
  }
  fixed.add(ok[ok.length - 1].pollIndex);

  const changes = [];
  for (let i = 1; i < ok.length; i += 1) {
    const previous = ok[i - 1];
    const current = ok[i];
    if (
      current.statusName !== previous.statusName ||
      current.phase !== previous.phase ||
      current.period !== previous.period
    ) {
      if (!fixed.has(current.pollIndex)) {
        changes.push(current.pollIndex);
      }
    }
  }
  const changeSet = new Set(changes);
  const tenths = ok
    .map((poll) => poll.pollIndex)
    .filter((index) => index % 10 === 0 && !fixed.has(index) && !changeSet.has(index));

  let room = Math.max(0, limit - fixed.size);
  const keptChanges = evenlySpaced(changes, Math.min(changes.length, room));
  room -= keptChanges.length;
  const keptTenths = evenlySpaced(tenths, Math.min(tenths.length, room));

  return [...fixed, ...keptChanges, ...keptTenths].sort((a, b) => a - b).slice(0, limit);
}

function trimmedBody(body) {
  if (typeof body === 'string' && body.length > TRIMMED_TEXT_LIMIT) {
    return body.slice(0, TRIMMED_TEXT_LIMIT);
  }
  return body ?? null;
}

const TRIMMED_KEYS = ['header', 'format', 'boxscore', 'plays', 'timeouts', 'situation'];

export function trimSummary(summary, { capturedAt, pollIndex, coreSituation }) {
  const trimmed = {};
  for (const key of TRIMMED_KEYS) {
    if (summary && Object.hasOwn(summary, key) && summary[key] !== undefined) {
      trimmed[key] = summary[key];
    }
  }
  trimmed.capturedAt = capturedAt;
  trimmed.pollIndex = pollIndex;
  trimmed.coreSituation = {
    status: coreSituation?.status ?? null,
    body: trimmedBody(coreSituation?.body),
  };
  if (coreSituation?.error) {
    trimmed.coreSituation.error = coreSituation.error;
  }
  return trimmed;
}

export function emptyKeySets() {
  return {
    athleteEntry: new Set(),
    athleteObject: new Set(),
    competitor: new Set(),
    status: new Set(),
    statusType: new Set(),
    topLevel: new Set(),
  };
}

function addKeys(target, value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(value)) {
      target.add(key);
    }
  }
}

export function collectKeys(summary, sets) {
  addKeys(sets.topLevel, summary);
  const competition = summary?.header?.competitions?.[0];
  addKeys(sets.status, competition?.status);
  addKeys(sets.statusType, competition?.status?.type);
  for (const competitor of asArray(competition?.competitors)) {
    addKeys(sets.competitor, competitor);
  }
  for (const team of asArray(summary?.boxscore?.players)) {
    for (const group of asArray(team?.statistics)) {
      for (const entry of asArray(group?.athletes)) {
        addKeys(sets.athleteEntry, entry);
        addKeys(sets.athleteObject, entry?.athlete);
      }
    }
  }
  return sets;
}

function sortedKeys(set) {
  const keys = [...set].sort();
  return keys.length ? keys.map((key) => `\`${key}\``).join(', ') : '(none)';
}

function jsonSection(label, owner, key) {
  if (!owner || !Object.hasOwn(owner, key)) {
    return ['', `${label}: absent`];
  }
  return ['', `${label}:`, '', '```json', JSON.stringify(owner[key], null, 2) ?? 'null', '```'];
}

// Every field (at any depth) whose name matches timeout, foul, bonus or possession. A matched
// object is printed whole and not searched further.
export function matchingFields(value, prefix = '', found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => matchingFields(item, `${prefix}[${index}]`, found));
    return found;
  }
  if (!value || typeof value !== 'object') {
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    if (REPORT_FIELD_PATTERN.test(key)) {
      found.push({ path: fieldPath, value: child });
    } else {
      matchingFields(child, fieldPath, found);
    }
  }
  return found;
}

function teamLabel(team) {
  return String(team?.abbreviation ?? team?.displayName ?? team?.id ?? '?');
}

function playTypeText(play) {
  return typeof play?.type?.text === 'string' ? play.type.text : '';
}

// Athlete entries of one team across its statistics groups, each athlete id counted once.
function teamAthletes(team) {
  const seen = new Set();
  const athletes = [];
  for (const group of asArray(team?.statistics)) {
    for (const entry of asArray(group?.athletes)) {
      const id = entry?.athlete?.id;
      if (id !== undefined && id !== null) {
        if (seen.has(String(id))) {
          continue;
        }
        seen.add(String(id));
      }
      athletes.push(entry);
    }
  }
  return athletes;
}

export function pollStats(trimmed) {
  const plays = asArray(trimmed?.plays);
  const teams = asArray(trimmed?.boxscore?.players).map((team) => {
    const athletes = teamAthletes(team);
    const teamId = team?.team?.id === undefined ? undefined : String(team.team.id);
    const teamPlays = plays.filter(
      (play) => teamId !== undefined && String(play?.team?.id) === teamId,
    );
    return {
      active: athletes.filter((entry) => entry?.active === true).length,
      fouls: teamPlays.filter((play) => playTypeText(play).includes('Foul')).length,
      label: teamLabel(team?.team),
      starters: athletes.filter((entry) => entry?.starter === true).length,
      timeouts: teamPlays.filter((play) => playTypeText(play).includes('Timeout')).length,
    };
  });
  return {
    fouls: plays.filter((play) => playTypeText(play).includes('Foul')).length,
    plays: plays.length,
    substitutions: plays.filter((play) => String(play?.type?.id) === SUBSTITUTION_TYPE_ID)
      .length,
    teams,
    timeouts: plays.filter((play) => playTypeText(play).includes('Timeout')).length,
  };
}

function code(value) {
  return value === undefined || value === null || value === '' ? '(none)' : `\`${value}\``;
}

export function buildReport({ adapter, event, pollCount, failedSummaryPolls = 0, keys, committed }) {
  const lines = [
    `# ESPN live capture ${adapterDirName(adapter)} ${event}`,
    '',
    `- Adapter: \`${adapter}\``,
    `- Event: \`${event}\``,
    `- Polls: ${pollCount} (summary failures: ${failedSummaryPolls})`,
    `- Committed polls: ${committed.length} (${committed.map((poll) => String(poll.pollIndex).padStart(3, '0')).join(', ') || 'none'})`,
  ];
  if (committed.length) {
    lines.push(
      `- First committed capture: ${committed[0].capturedAt}; last: ${committed[committed.length - 1].capturedAt}`,
    );
  }
  lines.push(
    '',
    '## Keys seen across all polls',
    '',
    `- Summary top level: ${sortedKeys(keys.topLevel)}`,
    `- \`header.competitions[0].status\`: ${sortedKeys(keys.status)}`,
    `- \`header.competitions[0].status.type\`: ${sortedKeys(keys.statusType)}`,
    `- \`header.competitions[0].competitors[]\`: ${sortedKeys(keys.competitor)}`,
    `- \`boxscore.players[].statistics[].athletes[]\`: ${sortedKeys(keys.athleteEntry)}`,
    `- \`boxscore.players[].statistics[].athletes[].athlete\`: ${sortedKeys(keys.athleteObject)}`,
  );

  for (const poll of committed) {
    const competition = poll.header?.competitions?.[0];
    const status = competition?.status;
    const stats = pollStats(poll);
    lines.push(
      '',
      `## Poll ${String(poll.pollIndex).padStart(3, '0')}`,
      '',
      `- Captured at: ${poll.capturedAt}`,
      `- Status: name ${code(status?.type?.name)}, detail ${code(status?.type?.detail)}, period ${code(status?.period)}, clock ${code(status?.displayClock)}`,
      `- Plays: ${stats.plays}; substitutions (type.id 584): ${stats.substitutions}; type.text contains "Foul": ${stats.fouls}; type.text contains "Timeout": ${stats.timeouts}`,
    );
    for (const team of stats.teams) {
      lines.push(
        `- Team ${code(team.label)}: active true ${team.active}, starter true ${team.starters}, foul plays ${team.fouls}, timeout plays ${team.timeouts}`,
      );
    }
    if (competition && Object.hasOwn(competition, 'timeoutsAvailable')) {
      lines.push(`- \`header.competitions[0].timeoutsAvailable\`: ${code(JSON.stringify(competition.timeoutsAvailable))}`);
    }
    if (competition && Object.hasOwn(competition, 'possessionArrowAvailable')) {
      lines.push(
        `- \`header.competitions[0].possessionArrowAvailable\`: ${code(JSON.stringify(competition.possessionArrowAvailable))}`,
      );
    }
    for (const [index, competitor] of asArray(competition?.competitors).entries()) {
      if (competitor && Object.hasOwn(competitor, 'possession')) {
        lines.push(
          `- \`header.competitions[0].competitors[${index}].possession\` (${teamLabel(competitor.team)}): ${code(JSON.stringify(competitor.possession))}`,
        );
      }
    }
    lines.push(...jsonSection('Top-level `timeouts`', poll, 'timeouts'));
    if (Object.hasOwn(poll, 'situation')) {
      lines.push(...jsonSection('Top-level `situation`', poll, 'situation'));
    }
    const core = poll.coreSituation ?? {};
    const coreKeys =
      core.body && typeof core.body === 'object' && !Array.isArray(core.body)
        ? sortedKeys(new Set(Object.keys(core.body)))
        : '(no JSON object)';
    lines.push(
      '',
      `Core situation: HTTP ${code(core.status)}${core.error ? `, error ${code(core.error)}` : ''}; top-level keys: ${coreKeys}`,
    );
    const fields = matchingFields(core.body);
    if (fields.length) {
      lines.push('');
      for (const field of fields) {
        lines.push(`- \`${field.path}\`: ${code(JSON.stringify(field.value))}`);
      }
    }
  }
  lines.push('');
  return lines.join('\n');
}

function shortError(error) {
  const cause = error?.cause;
  return String(cause?.code ?? cause?.message ?? error?.name ?? 'error').slice(0, 80);
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    try {
      const body = JSON.parse(text);
      return {
        body,
        error: response.ok ? undefined : `HTTP ${response.status}`,
        ok: response.ok,
        status: response.status,
      };
    } catch {
      return {
        body: text,
        error: response.ok ? 'invalid JSON' : `HTTP ${response.status}`,
        ok: false,
        status: response.status,
      };
    }
  } catch (error) {
    return { body: null, error: shortError(error), ok: false, status: null };
  }
}

function writeOutputs(file, adapter, event) {
  if (file) {
    appendFileSync(file, `adapter=${adapter}\nevent=${event}\n`);
  }
}

// Writes outputs adapter and event to GITHUB_OUTPUT; an empty event means nothing to capture.
// Request and parse failures are logged on the single summary line and return 0.
export async function runFind({
  env = process.env,
  fetchJson: getJson = fetchJson,
  log = console.log,
  now = Date.now,
  root = REPO_ROOT,
} = {}) {
  const adapterInput = env.ADAPTER || 'auto';
  const event = (env.EVENT ?? '').trim();
  const adapters = adaptersFor(adapterInput);
  if (adapters.length === 0) {
    log('find: ADAPTER must be auto, ncaa/mens-basketball or ncaa/womens-basketball');
    writeOutputs(env.GITHUB_OUTPUT, '', '');
    return 1;
  }
  if (event && !validEventId(event)) {
    log('find: EVENT must be 1 to 12 digits');
    writeOutputs(env.GITHUB_OUTPUT, '', '');
    return 1;
  }

  const season = basketballSeasonYear(new Date(now()));
  const notes = [];
  for (const adapter of adapters) {
    const captured = capturedEvents(root, adapter);
    if (!event && captured.size >= MAX_CAPTURED_EVENTS) {
      notes.push(`${adapter} has ${captured.size} captures`);
      continue;
    }
    const response = await getJson(scheduleUrl(adapter, season));
    if (!response.ok || !response.body || typeof response.body !== 'object') {
      notes.push(`${adapter} schedule ${season} failed (${response.error ?? 'no body'})`);
      continue;
    }
    const picked = pickEvent(response.body, { captured, event });
    if (picked) {
      log(`find: capture ${adapter} event ${picked}`);
      writeOutputs(env.GITHUB_OUTPUT, adapter, picked);
      return 0;
    }
    if (event && captured.has(event)) {
      notes.push(`${adapter} event ${event} already captured`);
    } else {
      notes.push(event ? `${adapter} has no event ${event}` : `${adapter} has no live event`);
    }
  }
  log(`find: nothing to capture; ${notes.join('; ')}`);
  writeOutputs(env.GITHUB_OUTPUT, '', '');
  return 0;
}

function pad(index) {
  return String(index).padStart(3, '0');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readRawPoll(rawDir, pollIndex) {
  return JSON.parse(
    gunzipSync(readFileSync(path.join(rawDir, `${pad(pollIndex)}.json.gz`))).toString('utf8'),
  );
}

// Polls the summary and the Core situation every POLL_INTERVAL_MS. Every poll is stored gzipped
// under RUNNER_TEMP/espn-capture-raw/<adapter>/<event>/. The loop stops after the first poll in
// state "post", once MAX_MINUTES have passed, or after MAX_SUMMARY_FAILURES summary failures in
// a row; a Core situation failure is recorded and never stops it. The selected polls, trimmed,
// and REPORT.md are written to a staging directory that is renamed into the captures folder.
export async function runCapture({
  env = process.env,
  fetchJson: getJson = fetchJson,
  log = console.log,
  now = Date.now,
  root = REPO_ROOT,
  sleep: wait = sleep,
} = {}) {
  const adapter = env.ADAPTER ?? '';
  const event = (env.EVENT ?? '').trim();
  if (!Object.hasOwn(ADAPTER_LEAGUES, adapter) || !validEventId(event)) {
    log('capture: ADAPTER must name one NCAA basketball adapter and EVENT must be 1 to 12 digits');
    return 1;
  }
  const maxMinutes = clampMinutes(env.MAX_MINUTES);
  const finalDir = captureDir(root, adapter, event);
  const relativeDir = path.relative(root, finalDir).split(path.sep).join('/');
  if (existsSync(finalDir)) {
    log(`capture: ${relativeDir} already exists`);
    return 0;
  }

  const rawDir = path.join(
    env.RUNNER_TEMP || os.tmpdir(),
    'espn-capture-raw',
    adapterDirName(adapter),
    event,
  );
  mkdirSync(rawDir, { recursive: true });
  log(`capture: ${adapter} event ${event}, up to ${maxMinutes} min`);

  const start = now();
  const deadline = start + maxMinutes * 60_000;
  const keys = emptyKeySets();
  const polls = [];
  let consecutiveFailures = 0;
  let failedSummaryPolls = 0;

  for (let pollIndex = 1; ; pollIndex += 1) {
    const capturedAt = new Date(now()).toISOString();
    const [summary, coreSituation] = await Promise.all([
      getJson(summaryUrl(adapter, event)),
      getJson(situationUrl(adapter, event)),
    ]);
    const record = { capturedAt, coreSituation, pollIndex, summary };
    writeFileSync(path.join(rawDir, `${pad(pollIndex)}.json.gz`), gzipSync(JSON.stringify(record)));

    const summaryOk =
      summary?.ok === true &&
      summary.body !== null &&
      typeof summary.body === 'object' &&
      !Array.isArray(summary.body);
    if (summaryOk) {
      consecutiveFailures = 0;
      collectKeys(summary.body, keys);
      const meta = pollMeta(summary.body);
      polls.push({ ...meta, capturedAt, ok: true, pollIndex });
      log(
        `poll ${pad(pollIndex)} state=${meta.state || '-'} period=${meta.period ?? '-'} clock=${meta.clock || '-'} plays=${meta.playsCount}`,
      );
      if (meta.state === 'post') {
        break;
      }
    } else {
      consecutiveFailures += 1;
      failedSummaryPolls += 1;
      polls.push({ ok: false, pollIndex });
      log(`poll ${pad(pollIndex)} summary failed (${summary?.error ?? 'no body'})`);
      if (consecutiveFailures >= MAX_SUMMARY_FAILURES) {
        log(`capture: stopping after ${MAX_SUMMARY_FAILURES} consecutive summary failures`);
        break;
      }
    }

    const nextAt = start + pollIndex * POLL_INTERVAL_MS;
    if (nextAt > deadline) {
      log(`capture: ${maxMinutes} min reached`);
      break;
    }
    await wait(Math.max(0, nextAt - now()));
  }

  const selected = selectPolls(polls);
  if (selected.length === 0) {
    log('capture: no summary received; nothing committed');
    return 1;
  }

  const stagingDir = `${finalDir}.partial`;
  rmSync(stagingDir, { force: true, recursive: true });
  mkdirSync(stagingDir, { recursive: true });
  const committed = [];
  for (const pollIndex of selected) {
    const record = readRawPoll(rawDir, pollIndex);
    const trimmed = trimSummary(record.summary.body, {
      capturedAt: record.capturedAt,
      coreSituation: record.coreSituation,
      pollIndex,
    });
    writeFileSync(path.join(stagingDir, `${pad(pollIndex)}.json.gz`), gzipSync(JSON.stringify(trimmed)));
    committed.push(trimmed);
  }
  let report;
  try {
    report = buildReport({
      adapter,
      committed,
      event,
      failedSummaryPolls,
      keys,
      pollCount: polls.length,
    });
  } catch (error) {
    // The trimmed polls are kept even when the report cannot be built.
    report = `# ESPN live capture ${adapterDirName(adapter)} ${event}\n\nReport not built: ${String(error?.name ?? 'error')}\n`;
    log(`capture: report not built (${String(error?.name ?? 'error')})`);
  }
  writeFileSync(path.join(stagingDir, 'REPORT.md'), report);
  writeFileSync(path.join(rawDir, 'REPORT.md'), report);
  renameSync(stagingDir, finalDir);
  log(`capture: ${polls.length} polls, ${committed.length} written to ${relativeDir}`);
  return 0;
}

async function main(command) {
  if (command === 'find') {
    try {
      return await runFind();
    } catch (error) {
      console.log(`find: nothing to capture; ${shortError(error)}`);
      writeOutputs(process.env.GITHUB_OUTPUT, '', '');
      return 0;
    }
  }
  if (command === 'capture') {
    return runCapture();
  }
  console.log('usage: node capture.mjs find|capture');
  return 1;
}

function executedDirectly() {
  try {
    return (
      Boolean(process.argv[1]) &&
      path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    );
  } catch {
    return false;
  }
}

if (executedDirectly()) {
  process.exitCode = await main(process.argv[2]);
}
