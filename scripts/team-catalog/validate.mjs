// Validates the generated catalog before any commit, and from CI. Checks the leagues document,
// every team entry, the preset and nickname guards, hand-edited overrides, the report's separation
// of network and shape errors, the append-only rule against a prior copy of the catalog (--prior),
// every committed streams file, and the NCAA basketball capability flags against the newest
// committed live capture.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateBoardFlags } from './board-flags.mjs';
import { presetErrors } from './build.mjs';
import { parseArgs } from './http.mjs';
import { LEAGUE_ROWS, SPORT_ORDER, TEAM_KEY_PATTERN } from './leagues.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const COLOR = /^#[0-9a-fA-F]{6}$/;
const NEEDLE = /^[a-z0-9-]+$/;
const LOGO_HOST = 'a.espncdn.com';
const STREAMS_FILE = /^([a-z]{2,8})\/(\d{1,8})\.json$/;
const OVERRIDE_FIELDS =new Set(['statsapi', 'hrefNeedles', 'name', 'nickname', 'conference', 'hidden', 'remove']);

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function logoAllowed(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === LOGO_HOST;
  } catch {
    return false;
  }
}

export function validateTeam(entry, league) {
  const errors = [];
  const where = entry?.key ?? JSON.stringify(entry);
  const fail = (message) => errors.push(`${league}: ${where}: ${message}`);
  if (typeof entry?.key !== 'string' || !TEAM_KEY_PATTERN.test(entry.key)) {
    fail('key does not match <league>-<espnId>');
    return errors;
  }
  if (entry.key !== `${league}-${entry.espnId}`) {
    fail('key does not equal <league>-<espnId>');
  }
  for (const field of ['name', 'nickname', 'location', 'abbreviation']) {
    if (!nonEmptyString(entry[field])) {
      fail(`${field} is missing`);
    }
  }
  for (const field of ['color', 'alternateColor']) {
    if (entry[field] !== undefined && !COLOR.test(entry[field])) {
      fail(`${field} is not #RRGGBB`);
    }
  }
  if (entry.logo !== undefined && !logoAllowed(entry.logo)) {
    fail('logo is not an https image on the allowed host');
  }
  if (!Array.isArray(entry.hrefNeedles) || entry.hrefNeedles.length === 0 || !entry.hrefNeedles.every((needle) => NEEDLE.test(needle))) {
    fail('hrefNeedles must be slugs only');
  }
  for (const field of ['retired', 'hidden']) {
    if (entry[field] !== undefined && entry[field] !== true) {
      fail(`${field} may only be true`);
    }
  }
  const isSchool = league === 'ncaa';
  if (isSchool) {
    if (!Array.isArray(entry.sports) || entry.sports.length === 0) {
      fail('sports must be a non-empty list');
    } else {
      const ordered = SPORT_ORDER.filter((sport) => entry.sports.includes(sport));
      if (ordered.length !== entry.sports.length || ordered.join() !== entry.sports.join()) {
        fail('sports must be known and in order');
      }
    }
    if (entry.retiredSports !== undefined) {
      const retiredOk =
        Array.isArray(entry.retiredSports) &&
        entry.retiredSports.length > 0 &&
        entry.retiredSports.every((sport) => (entry.sports ?? []).includes(sport));
      if (!retiredOk) {
        fail('retiredSports must be a non-empty subset of sports');
      }
    }
    if (entry.conference !== undefined && !nonEmptyString(entry.conference)) {
      fail('conference must be text');
    }
  } else {
    for (const field of ['sports', 'retiredSports', 'conference']) {
      if (entry[field] !== undefined) {
        fail(`${field} is only for schools`);
      }
    }
  }
  if (league === 'mlb') {
    if (!Number.isInteger(entry.statsapi?.teamId) || ![103, 104].includes(entry.statsapi?.leagueId)) {
      fail('statsapi must hold teamId and leagueId 103 or 104');
    }
  } else if (entry.statsapi !== undefined) {
    fail('statsapi is only for MLB');
  }
  return errors;
}

export function validateTeamsDocument(document, league) {
  if (document?.schemaVersion !== 1 || document?.league !== league || !Array.isArray(document?.teams)) {
    return [`${league}: teams file must have schemaVersion 1, league and teams`];
  }
  if (document.teams.length === 0) {
    return [`${league}: teams list is empty`];
  }
  const errors = document.teams.flatMap((entry) => validateTeam(entry, league));
  const keys = document.teams.map((entry) => entry?.key);
  if (new Set(keys).size !== keys.length) {
    errors.push(`${league}: duplicate team keys`);
  }
  return errors;
}

export function validateLeagues(document) {
  const errors = [];
  if (document?.schemaVersion !== 1 || !Array.isArray(document?.leagues)) {
    return ['leagues.json must have schemaVersion 1 and leagues'];
  }
  if (document.leagues.map((row) => row?.key).join() !== LEAGUE_ROWS.map((row) => row.key).join()) {
    errors.push('leagues.json must list mlb, nfl and ncaa in that order');
    return errors;
  }
  for (const row of document.leagues) {
    if (row.kind === 'school') {
      if (row.pickable !== undefined) {
        errors.push(`${row.key}: league-level pickable is not used for schools`);
      }
      const sports = Array.isArray(row.sports) ? row.sports : [];
      if (sports.map((sport) => sport?.key).join() !== SPORT_ORDER.join()) {
        errors.push(`${row.key}: sports must be ${SPORT_ORDER.join(', ')}`);
      }
      for (const sport of sports) {
        if (typeof sport?.pickable !== 'boolean' || !nonEmptyString(sport?.label) || !sport?.schedule?.provider) {
          errors.push(`${row.key}/${sport?.key}: pickable, label and schedule are required`);
        }
      }
    } else if (typeof row.pickable !== 'boolean' || !nonEmptyString(row.label) || !row.schedule?.provider) {
      errors.push(`${row.key}: pickable, label and schedule are required`);
    }
    if (row.key === 'mlb' && row.officialDateZone !== undefined) {
      errors.push('mlb: officialDateZone must be absent');
    }
    if (row.key !== 'mlb' && row.officialDateZone !== 'America/New_York') {
      errors.push(`${row.key}: officialDateZone must be America/New_York`);
    }
  }
  return errors;
}

export function validateOverrides(overrides) {
  const errors = [];
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return ['overrides.json must be an object keyed by team key'];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!TEAM_KEY_PATTERN.test(key)) {
      errors.push(`overrides: ${key} is not a team key`);
      continue;
    }
    for (const field of Object.keys(value ?? {})) {
      if (!OVERRIDE_FIELDS.has(field)) {
        errors.push(`overrides: ${key}: field ${field} is not allowed`);
      }
    }
  }
  return errors;
}

// Every override must name a known league, and every override other than `remove` must name a
// real entry. A `remove` target is legitimately absent once a build has applied it.
export function overrideResolutionErrors(overrides, teamsByLeague) {
  const errors = [];
  const leagues = new Set(LEAGUE_ROWS.map((row) => row.key));
  for (const [key, value] of Object.entries(overrides ?? {})) {
    const league = key.split('-')[0];
    if (!leagues.has(league)) {
      errors.push(`overrides: ${key} names an unknown league`);
    } else if (value?.remove !== true && teamsByLeague[league] && !teamsByLeague[league].some((entry) => entry.key === key)) {
      errors.push(`overrides: ${key} does not resolve to a catalog entry`);
    }
  }
  return errors;
}

// The report must keep network and shape errors apart for every adapter and check.
export function validateReport(report) {
  const errors = [];
  if (report?.schemaVersion !== 1 || typeof report?.adapters !== 'object' || report.adapters === null) {
    return ['probe-report.json must have schemaVersion 1 and adapters'];
  }
  for (const [adapter, entry] of Object.entries(report.adapters)) {
    if (!Array.isArray(entry?.networkErrors) || !Array.isArray(entry?.shapeErrors) || !Array.isArray(entry?.checks)) {
      errors.push(`${adapter}: networkErrors, shapeErrors and checks must be arrays`);
      continue;
    }
    for (const check of entry.checks) {
      if (!Object.hasOwn(check, 'status') || !Object.hasOwn(check, 'latencyMs') || !Array.isArray(check.shapeErrors) || !Object.hasOwn(check, 'networkError')) {
        errors.push(`${adapter}: check ${check?.name} must keep status, latencyMs, networkError and shapeErrors`);
      }
    }
  }
  return errors;
}

// Every committed entry must still exist unless overrides removed it. A sport may not disappear
// from an entry.
export function appendOnlyErrors(priorTeams, currentTeams, overrides, league) {
  const errors = [];
  const byKey = new Map(currentTeams.map((entry) => [entry.key, entry]));
  for (const prior of priorTeams) {
    const current = byKey.get(prior.key);
    if (!current) {
      if (overrides[prior.key]?.remove !== true) {
        errors.push(`${league}: ${prior.key} left the catalog without an override remove`);
      }
      continue;
    }
    for (const sport of prior.sports ?? []) {
      if (!(current.sports ?? []).includes(sport)) {
        errors.push(`${league}: ${prior.key} lost sport ${sport}`);
      }
    }
  }
  return errors;
}

function readJson(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
}

// Every file under streams/ must be a v2 document at streams/<league>/<espnId>.json for a catalog
// team, retired ones included. Messages name only the path: a file's text can hold a listing URL.
export function streamsFileErrors(streamsDir, teamsByLeague) {
  if (!existsSync(streamsDir)) {
    return [];
  }
  const errors = [];
  const files = readdirSync(streamsDir, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
  for (const file of files) {
    const relative = path.relative(streamsDir, file).split(path.sep).join('/');
    const where = `streams/${relative}`;
    const match = STREAMS_FILE.exec(relative);
    if (!match) {
      errors.push(`${where}: path is not streams/<league>/<espnId>.json`);
      continue;
    }
    const key = `${match[1]}-${match[2]}`;
    if (!(teamsByLeague[match[1]] ?? []).some((team) => team.key === key)) {
      errors.push(`${where}: ${key} is not in the catalog`);
    }
    let document;
    try {
      document = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      errors.push(`${where}: is not readable JSON`);
      continue;
    }
    if (document === null || typeof document !== 'object' || Array.isArray(document)) {
      errors.push(`${where}: is not a JSON object`);
      continue;
    }
    if (document.schemaVersion !== 2) {
      errors.push(`${where}: schemaVersion is not 2`);
    }
    if (document.team?.key !== key) {
      errors.push(`${where}: team.key does not equal ${key}`);
    }
    if (!nonEmptyString(document.team?.name)) {
      errors.push(`${where}: team.name is missing`);
    }
    if (!Array.isArray(document.streams)) {
      errors.push(`${where}: streams is not a list`);
    } else if (!document.streams.every((item) => typeof item === 'string' || (item !== null && typeof item === 'object' && !Array.isArray(item)))) {
      errors.push(`${where}: streams holds an item that is neither a marker string nor an object`);
    }
  }
  return errors;
}

// Validates catalogDir. priorDir, when given, is the committed copy of catalog/ before this build.
export async function runValidate({ catalogDir, flagsReport, priorDir, root = REPO_ROOT }) {
  const errors = [];
  const leagues = readJson(path.join(catalogDir, 'leagues.json'));
  if (!leagues) {
    return ['leagues.json is missing'];
  }
  errors.push(...validateLeagues(leagues));
  const overrides = readJson(path.join(catalogDir, 'overrides.json')) ?? {};
  errors.push(...validateOverrides(overrides));

  const teamsByLeague = {};
  for (const row of LEAGUE_ROWS) {
    const document = readJson(path.join(catalogDir, 'teams', `${row.key}.json`));
    if (!document) {
      errors.push(`${row.key}: teams file is missing`);
      continue;
    }
    errors.push(...validateTeamsDocument(document, row.key));
    teamsByLeague[row.key] = document.teams ?? [];
    if (priorDir) {
      const prior = readJson(path.join(priorDir, 'teams', `${row.key}.json`));
      if (prior) {
        errors.push(...appendOnlyErrors(prior.teams ?? [], teamsByLeague[row.key], overrides, row.key));
      }
    }
  }
  errors.push(...presetErrors(teamsByLeague));
  errors.push(...overrideResolutionErrors(overrides, teamsByLeague));
  errors.push(...streamsFileErrors(path.join(root, 'streams'), teamsByLeague));

  const report = readJson(path.join(catalogDir, 'probe-report.json'));
  if (report) {
    errors.push(...validateReport(report));
  }

  const flags = flagsReport ?? (await evaluateBoardFlags(root));
  for (const [adapter, entry] of Object.entries(flags)) {
    if (!entry.agrees) {
      errors.push(
        `${adapter}: board flags on without evidence in ${entry.newestCapture ? `capture ${entry.newestCapture}` : 'any live capture'}: ${entry.onWithoutEvidence.join(', ')}`,
      );
    }
  }
  return errors;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalogDir = path.resolve(args.catalog ?? path.join(REPO_ROOT, 'catalog'));
  const errors = await runValidate({
    catalogDir,
    priorDir: args.prior ? path.resolve(args.prior) : undefined,
  });
  if (errors.length > 0) {
    for (const error of errors) {
      console.log(`validate: ${error}`);
    }
    console.log(`validate: ${errors.length} error(s)`);
    return 1;
  }
  console.log('validate: ok');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
