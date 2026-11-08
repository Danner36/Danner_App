// Probes every league and college sport against ESPN (and statsapi for MLB) and writes
// catalog/probe-report.json. Network errors and shape errors are kept apart for each check. An
// empty current-season schedule is a valid shape, so a league in its off-season still passes as
// long as the most recent live or final event is found in an earlier season. Raw bodies go to
// .probe-output/ for the `espn-probe-<run id>` artifact.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateBoardFlags } from './board-flags.mjs';
import { fetchJson, parseArgs } from './http.mjs';
import {
  ADAPTERS,
  adapterDirName,
  adaptersFromInput,
  coreCompetitionUrl,
  REPORT_SCHEMA_VERSION,
  scheduleUrl,
  scoreboardUrl,
  seasonYearFor,
  standingsUrl,
  STATSAPI,
  summaryUrl,
  teamsUrl,
} from './leagues.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const REQUIRED_PATHS = JSON.parse(readFileSync(path.join(SCRIPT_DIR, 'required-paths.json'), 'utf8'));
const SEASONS_BACK = 2;

function tokenize(pathText) {
  const tokens = [];
  for (const part of pathText.split('.')) {
    const match = /^([^[\]]+)((?:\[[^\]]*\])*)$/.exec(part);
    if (!match) {
      throw new Error(`invalid path ${pathText}`);
    }
    tokens.push({ key: match[1] });
    for (const bracket of match[2].matchAll(/\[([^\]]*)\]/g)) {
      tokens.push({ index: bracket[1] });
    }
  }
  return tokens;
}

function holds(value, tokens) {
  if (tokens.length === 0) {
    return value !== undefined && value !== null;
  }
  const [token, ...rest] = tokens;
  if (token.key !== undefined) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) && holds(value[token.key], rest);
  }
  if (!Array.isArray(value)) {
    return false;
  }
  if (token.index === '' || token.index === '+') {
    if (value.length === 0) {
      return token.index === '';
    }
    return rest.length === 0 || value.every((element) => holds(element, rest));
  }
  return holds(value[Number(token.index)], rest);
}

// The paths in `paths` that `body` does not satisfy. Syntax is defined in required-paths.json.
export function missingPaths(body, paths) {
  return paths.filter((pathText) => !holds(body, tokenize(pathText)));
}

function eventState(event) {
  return event?.competitions?.[0]?.status?.type?.state;
}

// The most recent live event, else the most recent final event, from a list of schedule events.
// Order: state "in" first; within a state, the latest date.
export function pickRecentEvent(events) {
  const usable = events.filter((event) => ['in', 'post'].includes(eventState(event)));
  usable.sort((a, b) => {
    const live = Number(eventState(b) === 'in') - Number(eventState(a) === 'in');
    if (live !== 0) {
      return live;
    }
    return String(b?.date ?? '').localeCompare(String(a?.date ?? ''));
  });
  return usable[0] ?? null;
}

function reportPath(url) {
  return new URL(url).pathname + new URL(url).search;
}

function checkResult(name, url, response, shapePaths, { optional = false } = {}) {
  const check = {
    latencyMs: response.latencyMs ?? null,
    name,
    networkError: response.networkError ?? null,
    path: reportPath(url),
    shapeErrors: [],
    status: response.status ?? null,
  };
  if (check.networkError) {
    return check;
  }
  if (response.jsonError) {
    check.shapeErrors = ['response is not JSON'];
    return check;
  }
  if (!response.ok) {
    // A 404 on an optional resource means ESPN has no such data for this event.
    if (!optional) {
      check.networkError = `HTTP ${response.status}`;
    }
    return check;
  }
  check.shapeErrors = missingPaths(response.body, shapePaths).map((missing) => `missing ${missing}`);
  return check;
}

function reportedPaths(body, paths) {
  const missing = new Set(missingPaths(body, paths));
  return Object.fromEntries(paths.map((pathText) => [pathText, !missing.has(pathText)]));
}

function writeRaw(rawDir, dirName, name, body) {
  if (rawDir && body !== undefined) {
    const dir = path.join(rawDir, dirName);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${name}.json`), `${JSON.stringify(body)}\n`);
  }
}

// Probes one adapter. Returns the adapter's report entry; `passed` is true when every required
// check has no network error and no shape error. `now` is a Date.
export async function probeAdapter(adapterKey, { fetchJson: getJson = fetchJson, now = new Date(), rawDir = null } = {}) {
  const row = ADAPTERS[adapterKey];
  const dirName = adapterDirName(adapterKey);
  const season = seasonYearFor(row.seasonYear, now);
  const checks = [];

  const run = async (name, url, shapeKey, options = {}) => {
    const response = await getJson(url);
    checks.push(checkResult(name, url, response, REQUIRED_PATHS[shapeKey] ?? [], options));
    writeRaw(rawDir, dirName, name, response.body);
    return response;
  };

  await run('teams', teamsUrl(row), 'teams');
  for (const group of row.standingsGroups ?? []) {
    await run(`standings-${group}`, standingsUrl(row, group), 'standings');
  }
  await run('scoreboard', scoreboardUrl(row), 'scoreboard');

  // Current season: every season type. Earlier seasons are searched only for a recent event.
  let recent = null;
  for (let back = 0; back <= SEASONS_BACK; back += 1) {
    const year = season - back;
    const events = [];
    for (const seasonType of row.seasonTypes) {
      const name = `schedule-${year}-${seasonType}`;
      const response = await run(name, scheduleUrl(row, row.presetEspnId, year, seasonType), 'schedule');
      if (response.ok && Array.isArray(response.body?.events)) {
        events.push(...response.body.events);
      }
    }
    recent = pickRecentEvent(events);
    if (recent) {
      break;
    }
  }

  let summaryPaths;
  if (recent) {
    const event = String(recent.id);
    const summary = await run('summary', summaryUrl(row, event), 'summary');
    if (row.basketball && summary.ok) {
      summaryPaths = reportedPaths(summary.body, REQUIRED_PATHS.boardPaths);
    }
    await run('predictor', coreCompetitionUrl(row, event, 'predictor'), 'predictor', { optional: true });
    await run('probabilities', `${coreCompetitionUrl(row, event, 'probabilities')}?limit=1`, 'probabilities', {
      optional: true,
    });
  } else {
    checks.push({
      latencyMs: null,
      name: 'summary',
      networkError: null,
      path: null,
      shapeErrors: [`no live or final event in seasons ${season - SEASONS_BACK} to ${season}`],
      status: null,
    });
  }

  if (row.league === 'mlb') {
    await run('statsapi-teams', `${STATSAPI}/teams?sportId=1`, 'statsapiTeams');
    await run(
      'statsapi-schedule',
      `${STATSAPI}/schedule?sportId=1&teamId=114&season=${season}&gameType=R`,
      'statsapiSchedule',
    );
  }

  const networkErrors = checks.filter((check) => check.networkError).map((check) => `${check.name}: ${check.networkError}`);
  const shapeErrors = checks.flatMap((check) => check.shapeErrors.map((error) => `${check.name}: ${error}`));
  return {
    boardPaths: summaryPaths ?? null,
    checkedAt: now.toISOString(),
    checks,
    networkErrors,
    passed: networkErrors.length === 0 && shapeErrors.length === 0,
    season,
    shapeErrors,
  };
}

// Runs the probe for `adapters`, merging into any previous report at `reportFile` so a filtered run
// keeps the other adapters' last results.
export async function runProbe({
  adapters,
  fetchJson: getJson = fetchJson,
  log = console.log,
  now = () => new Date(),
  rawDir = null,
  reportFile,
  root = REPO_ROOT,
}) {
  let previous = {};
  if (existsSync(reportFile)) {
    try {
      previous = JSON.parse(readFileSync(reportFile, 'utf8'))?.adapters ?? {};
    } catch {
      previous = {};
    }
  }
  const results = { ...previous };
  for (const adapter of adapters) {
    const entry = await probeAdapter(adapter, { fetchJson: getJson, now: now(), rawDir });
    results[adapter] = entry;
    log(
      `${adapter}: ${entry.passed ? 'pass' : 'FAIL'} (checks ${entry.checks.length}, network ${entry.networkErrors.length}, shape ${entry.shapeErrors.length})`,
    );
  }
  const report = {
    adapters: results,
    boardFlags: await evaluateBoardFlags(root),
    generatedAt: now().toISOString(),
    schemaVersion: REPORT_SCHEMA_VERSION,
  };
  mkdirSync(path.dirname(reportFile), { recursive: true });
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const adapters = adaptersFromInput(args.leagues ?? process.env.LEAGUES ?? '');
  if (!adapters) {
    console.log('probe: --leagues must name league or adapter keys');
    return 1;
  }
  const catalogDir = path.resolve(args.catalog ?? path.join(REPO_ROOT, 'catalog'));
  const rawDir = args.raw === 'none' ? null : path.resolve(args.raw ?? path.join(SCRIPT_DIR, '.probe-output'));
  const report = await runProbe({
    adapters,
    rawDir,
    reportFile: path.join(catalogDir, 'probe-report.json'),
  });
  const failed = Object.entries(report.adapters).filter(([, entry]) => !entry.passed);
  console.log(`probe: ${failed.length} of ${Object.keys(report.adapters).length} adapters failing`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
