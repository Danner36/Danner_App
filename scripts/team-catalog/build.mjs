// Builds catalog/leagues.json and catalog/teams/<league>.json from ESPN and statsapi. The allowlist
// is append-only: an entry or sport that disappears from ESPN stays with `retired` until
// catalog/overrides.json removes it. A guard failure writes nothing and exits non-zero.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchJson, parseArgs } from './http.mjs';
import {
  ADAPTERS,
  adapterDirName,
  adaptersForLeague,
  adaptersFromInput,
  CATALOG_SCHEMA_VERSION,
  LEAGUE_ROWS,
  SPORT_ORDER,
  standingsUrl,
  STATSAPI,
  teamsUrl,
} from './leagues.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
export const SHRINK_FLOOR = 0.9;
const OVERRIDABLE = ['statsapi', 'hrefNeedles', 'name', 'nickname', 'conference'];

export const PRESET_GUARDS = [
  { key: 'mlb-5', league: 'mlb', nickname: 'Guardians', statsapi: { leagueId: 103, teamId: 114 } },
  { key: 'nfl-17', league: 'nfl', nickname: 'Patriots' },
  { key: 'ncaa-66', league: 'ncaa', nickname: 'Cyclones', sports: ['football', 'mens-basketball', 'womens-basketball'] },
];

// Listing-link needle derived from a team name: lower case, accents and punctuation dropped,
// other characters joined by hyphens ("Iowa State Cyclones" -> "iowa-state-cyclones").
export function slugifyName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[&'’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizedName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function hexColor(value) {
  const text = String(value ?? '');
  return /^[0-9a-fA-F]{6}$/.test(text) ? `#${text}` : undefined;
}

function defaultLogo(team) {
  const logo = (Array.isArray(team?.logos) ? team.logos : []).find((entry) => {
    const rel = Array.isArray(entry?.rel) ? entry.rel : [];
    return rel.includes('default') && !rel.includes('dark') && typeof entry?.href === 'string';
  });
  return logo?.href;
}

export function teamsFromList(body) {
  const teams = body?.sports?.[0]?.leagues?.[0]?.teams;
  if (!Array.isArray(teams) || teams.length === 0) {
    throw new Error('teams list is empty or has an unknown shape');
  }
  return teams.map((entry) => entry?.team).filter((team) => team && team.isAllStar !== true && team.isActive !== false);
}

// One catalog entry from an ESPN team. Optional fields are left out when ESPN does not send them.
export function mapTeam(team, leagueKey) {
  const espnId = String(team.id);
  const entry = {
    abbreviation: String(team.abbreviation ?? ''),
    espnId,
    key: `${leagueKey}-${espnId}`,
    location: String(team.location ?? ''),
    name: String(team.displayName ?? ''),
    nickname: String(team.name ?? ''),
  };
  const color = hexColor(team.color);
  const alternateColor = hexColor(team.alternateColor);
  const logo = defaultLogo(team);
  if (color) entry.color = color;
  if (alternateColor) entry.alternateColor = alternateColor;
  if (logo) entry.logo = logo;
  entry.hrefNeedles = [slugifyName(entry.name)];
  return entry;
}

// school id -> conference short name, plus every school in the standings tree. The tree is
// root -> conference -> optional division -> entries; a division reports its parent conference.
export function standingsIndex(documents) {
  const conferenceOf = new Map();
  const walk = (node, conference) => {
    for (const entry of node?.standings?.entries ?? []) {
      const id = entry?.team?.id;
      if (id !== undefined) {
        conferenceOf.set(String(id), conference);
      }
    }
    for (const child of node?.children ?? []) {
      walk(child, conference ?? child?.shortName ?? child?.name);
    }
  };
  for (const document of documents) {
    walk(document, undefined);
  }
  return conferenceOf;
}

function orderedSports(sports) {
  return SPORT_ORDER.filter((sport) => sports.includes(sport));
}

// Merges the college lists by ESPN id. `listed` is [{ adapter, teams, standings }]; a school in a
// divisionOneFilter sport counts only when it is in that sport's standings groups.
export function buildSchools(listed) {
  const schools = new Map();
  const counts = {};
  const conferences = new Map();
  for (const { adapter, teams, standings } of listed) {
    const row = ADAPTERS[adapter];
    let countInList = 0;
    for (const team of teams) {
      const id = String(team.id);
      if (row.divisionOneFilter && !standings.has(id)) {
        continue;
      }
      countInList += 1;
      const entry = schools.get(id) ?? mapTeam(team, 'ncaa');
      entry.sports = [...(entry.sports ?? []), row.sport];
      schools.set(id, entry);
      // Basketball conference wins: a school's football conference can differ (Independents).
      if (standings.has(id) && (!conferences.has(id) || row.sport !== 'football')) {
        conferences.set(id, standings.get(id));
      }
    }
    counts[row.sport] = countInList;
  }
  for (const [id, entry] of schools) {
    entry.sports = orderedSports(entry.sports);
    if (conferences.get(id)) {
      entry.conference = conferences.get(id);
    }
  }
  return { counts, entries: [...schools.values()] };
}

// Sets statsapi on each MLB entry by normalized full name; an entry whose name has no match and no
// statsapi override is returned in `unmatched`.
export function joinStatsapi(entries, statsapiTeams, overrides) {
  const byName = new Map(statsapiTeams.map((team) => [normalizedName(team.name), team]));
  const unmatched = [];
  for (const entry of entries) {
    const match = byName.get(normalizedName(entry.name));
    if (match?.id !== undefined && match?.league?.id !== undefined) {
      entry.statsapi = { teamId: match.id, leagueId: match.league.id };
    } else if (!overrides[entry.key]?.statsapi) {
      unmatched.push(entry.name);
    }
  }
  return unmatched;
}

export function activeCount(previousTeams) {
  return previousTeams.filter((entry) => entry.retired !== true).length;
}

function activeSportCount(previousTeams, sport) {
  return previousTeams.filter(
    (entry) =>
      entry.retired !== true &&
      (entry.sports ?? []).includes(sport) &&
      !(entry.retiredSports ?? []).includes(sport),
  ).length;
}

// Shrink guard: a list under SHRINK_FLOOR of what is committed for it is a list glitch, not a
// change. Returns error strings.
export function shrinkErrors(leagueKey, freshCounts, previousTeams) {
  const errors = [];
  const check = (label, fresh, committed) => {
    if (committed > 0 && fresh < committed * SHRINK_FLOOR) {
      errors.push(`${label}: ${fresh} teams is under 90% of the committed ${committed}`);
    }
  };
  for (const [sport, count] of Object.entries(freshCounts)) {
    if (sport === leagueKey) {
      check(leagueKey, count, activeCount(previousTeams));
    } else {
      check(`${leagueKey}/${sport}`, count, activeSportCount(previousTeams, sport));
    }
  }
  return errors;
}

// Merges a league's fresh entries with its committed entries. Fresh entries win. A committed entry
// missing from fresh stays with `retired: true`. A sport missing from a present school stays in
// `sports` and is listed in `retiredSports`. Entries named by an override `remove` are dropped.
export function applyAppendOnly(freshEntries, previousTeams, overrides) {
  const merged = new Map(freshEntries.map((entry) => [entry.key, entry]));
  for (const previous of previousTeams) {
    if (overrides[previous.key]?.remove === true) {
      continue;
    }
    const current = merged.get(previous.key);
    if (!current) {
      merged.set(previous.key, { ...previous, retired: true });
      continue;
    }
    const disappeared = (previous.sports ?? []).filter((sport) => !(current.sports ?? []).includes(sport));
    if (disappeared.length > 0) {
      current.sports = orderedSports([...(current.sports ?? []), ...disappeared]);
      current.retiredSports = orderedSports(disappeared);
    }
  }
  return [...merged.values()];
}

// Applies hand-edited overrides last and drops every entry an override removes.
export function applyOverrides(entries, overrides) {
  const out = [];
  for (const entry of entries) {
    const override = overrides[entry.key];
    if (override?.remove === true) {
      continue;
    }
    const merged = { ...entry };
    for (const name of OVERRIDABLE) {
      if (override && Object.hasOwn(override, name)) {
        merged[name] = override[name];
      }
    }
    if (override?.hidden === true) {
      merged.hidden = true;
    } else {
      delete merged.hidden;
    }
    out.push(merged);
  }
  return out;
}

const ENTRY_FIELD_ORDER = [
  'key',
  'espnId',
  'name',
  'nickname',
  'location',
  'abbreviation',
  'color',
  'alternateColor',
  'logo',
  'conference',
  'hrefNeedles',
  'sports',
  'retiredSports',
  'statsapi',
  'hidden',
  'retired',
];

function orderedEntry(entry) {
  const ordered = {};
  for (const name of [...ENTRY_FIELD_ORDER, ...Object.keys(entry)]) {
    if (Object.hasOwn(entry, name)) {
      ordered[name] = entry[name];
    }
  }
  return ordered;
}

// A stable order for diffs: by normalized name, then key.
export function sortTeams(entries) {
  return entries
    .map(orderedEntry)
    .sort((a, b) => {
      const nameA = normalizedName(a.name);
      const nameB = normalizedName(b.name);
      return nameA < nameB ? -1 : nameA > nameB ? 1 : a.key.localeCompare(b.key);
    });
}

// Preset guard over the entries of every built league, keyed by league. Returns error strings.
export function presetErrors(teamsByLeague) {
  const errors = [];
  for (const guard of PRESET_GUARDS) {
    const entry = (teamsByLeague[guard.league] ?? []).find((team) => team.key === guard.key);
    if (!entry) {
      errors.push(`preset ${guard.key} is missing`);
      continue;
    }
    if (entry.retired === true) {
      errors.push(`preset ${guard.key} is retired`);
    }
    if (entry.nickname !== guard.nickname) {
      errors.push(`preset ${guard.key} nickname is ${JSON.stringify(entry.nickname)}, expected ${guard.nickname}`);
    }
    if (
      guard.statsapi &&
      (entry.statsapi?.teamId !== guard.statsapi.teamId || entry.statsapi?.leagueId !== guard.statsapi.leagueId)
    ) {
      errors.push(`preset ${guard.key} statsapi must be ${guard.statsapi.teamId}/${guard.statsapi.leagueId}`);
    }
    for (const sport of guard.sports ?? []) {
      if (!(entry.sports ?? []).includes(sport)) {
        errors.push(`preset ${guard.key} is missing sport ${sport}`);
      }
    }
  }
  return errors;
}

// Whether committed fixtures exist for an adapter under tests/leagues/.
export function fixturesExist(root, adapter) {
  const dir = path.join(root, 'tests', 'leagues', adapterDirName(adapter));
  const hasFile = (current) =>
    existsSync(current) &&
    readdirSync(current).some((name) => {
      const full = path.join(current, name);
      return statSync(full).isDirectory() ? hasFile(full) : true;
    });
  return hasFile(dir);
}

// Sticky pickable: a previously pickable league or sport stays on; otherwise it turns on when its
// probe passed and fixtures exist.
export function nextPickable({ previous, probePassed, hasFixtures }) {
  return previous === true || (probePassed === true && hasFixtures === true);
}

function pickableFor(adapter, previous, { report, root }) {
  return nextPickable({
    hasFixtures: fixturesExist(root, adapter),
    previous,
    probePassed: report?.adapters?.[adapter]?.passed === true,
  });
}

function previousLeague(previous, key) {
  return previous?.leagues?.find((row) => row.key === key);
}

// The catalog/leagues.json document (without generatedAt).
export function leaguesBody({ previous, report, root }) {
  return {
    leagues: LEAGUE_ROWS.map((row) => {
      const before = previousLeague(previous, row.key);
      if (row.kind === 'school') {
        return {
          ...row,
          sports: row.sports.map((sport) => ({
            key: sport.key,
            label: sport.label,
            pickable: pickableFor(
              `ncaa/${sport.key}`,
              before?.sports?.find((entry) => entry.key === sport.key)?.pickable,
              { report, root },
            ),
            schedule: sport.schedule,
          })),
        };
      }
      const { espn, key, kind, label, officialDateZone, schedule } = row;
      return {
        key,
        label,
        kind,
        pickable: pickableFor(key, before?.pickable, { report, root }),
        ...(officialDateZone ? { officialDateZone } : {}),
        schedule,
        ...(espn ? { espn } : {}),
      };
    }),
    schemaVersion: CATALOG_SCHEMA_VERSION,
  };
}

// Keeps generatedAt when the content is unchanged, so a run with no change leaves the file alone.
export function withGeneratedAt(body, previous, nowIso) {
  const { generatedAt: previousAt, ...rest } = previous ?? {};
  const unchanged = previous && JSON.stringify(rest) === JSON.stringify(body);
  return { generatedAt: unchanged ? previousAt : nowIso, ...body };
}

function readJson(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
}

async function requiredJson(getJson, url, label) {
  const response = await getJson(url);
  if (!response.ok || response.body === null || typeof response.body !== 'object') {
    throw new Error(`${label}: ${response.networkError ?? `HTTP ${response.status}`}`);
  }
  return response.body;
}

async function freshLeague(leagueKey, { getJson, overrides }) {
  if (leagueKey === 'ncaa') {
    const listed = [];
    for (const adapter of adaptersForLeague('ncaa')) {
      const row = ADAPTERS[adapter];
      const teams = teamsFromList(await requiredJson(getJson, teamsUrl(row), `${adapter} teams`));
      const documents = [];
      for (const group of row.standingsGroups) {
        documents.push(await requiredJson(getJson, standingsUrl(row, group), `${adapter} standings ${group}`));
      }
      listed.push({ adapter, standings: standingsIndex(documents), teams });
    }
    return buildSchools(listed);
  }
  const row = ADAPTERS[leagueKey];
  const entries = teamsFromList(await requiredJson(getJson, teamsUrl(row), `${leagueKey} teams`)).map((team) =>
    mapTeam(team, leagueKey),
  );
  if (leagueKey === 'mlb') {
    const body = await requiredJson(getJson, `${STATSAPI}/teams?sportId=1`, 'statsapi teams');
    const unmatched = joinStatsapi(entries, Array.isArray(body.teams) ? body.teams : [], overrides);
    if (unmatched.length > 0) {
      throw new Error(`mlb teams without a statsapi match: ${unmatched.join(', ')}`);
    }
  }
  return { counts: { [leagueKey]: entries.length }, entries };
}

// Builds into catalogDir. `selected` adapters narrow which leagues are refreshed from ESPN; a
// league with no committed file is always built. Returns { code, errors }.
export async function runBuild({
  catalogDir,
  fetchJson: getJson = fetchJson,
  log = console.log,
  now = () => new Date(),
  reportFile,
  root = REPO_ROOT,
  selected,
}) {
  const overrides = readJson(path.join(catalogDir, 'overrides.json')) ?? {};
  const previousLeagues = readJson(path.join(catalogDir, 'leagues.json'));
  const report = readJson(reportFile);
  const nowIso = now().toISOString();

  const selectedLeagues = new Set((selected ?? Object.keys(ADAPTERS)).map((adapter) => ADAPTERS[adapter].league));
  const documents = {};
  const errors = [];
  const teamsByLeague = {};

  for (const row of LEAGUE_ROWS) {
    const leagueKey = row.key;
    const file = path.join(catalogDir, 'teams', `${leagueKey}.json`);
    const previousDoc = readJson(file);
    const previousTeams = previousDoc?.teams ?? [];
    if (previousDoc && !selectedLeagues.has(leagueKey)) {
      teamsByLeague[leagueKey] = previousTeams;
      continue;
    }
    try {
      const fresh = await freshLeague(leagueKey, { getJson, overrides });
      const shrink = shrinkErrors(leagueKey, fresh.counts, previousTeams);
      if (shrink.length > 0) {
        errors.push(...shrink);
        teamsByLeague[leagueKey] = previousTeams;
        continue;
      }
      const teams = sortTeams(applyOverrides(applyAppendOnly(fresh.entries, previousTeams, overrides), overrides));
      teamsByLeague[leagueKey] = teams;
      documents[leagueKey] = {
        file,
        previous: previousDoc,
        value: { league: leagueKey, schemaVersion: CATALOG_SCHEMA_VERSION, teams },
      };
      log(`${leagueKey}: ${teams.length} entries (${teams.filter((team) => team.retired).length} retired)`);
    } catch (error) {
      errors.push(`${leagueKey}: ${error.message}`);
      teamsByLeague[leagueKey] = previousTeams;
    }
  }

  errors.push(...presetErrors(teamsByLeague));

  if (errors.length > 0) {
    for (const error of errors) {
      log(`build: ${error}`);
    }
    log('build: nothing written');
    return { code: 1, errors };
  }

  for (const { file, previous, value } of Object.values(documents)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(withGeneratedAt(value, previous, nowIso), null, 2)}\n`);
  }
  const leaguesDoc = withGeneratedAt(leaguesBody({ previous: previousLeagues, report, root }), previousLeagues, nowIso);
  mkdirSync(catalogDir, { recursive: true });
  writeFileSync(path.join(catalogDir, 'leagues.json'), `${JSON.stringify(leaguesDoc, null, 2)}\n`);
  log('build: catalog written');
  return { code: 0, errors: [] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const selected = adaptersFromInput(args.leagues ?? process.env.LEAGUES ?? '');
  if (!selected) {
    console.log('build: --leagues must name league or adapter keys');
    return 1;
  }
  const catalogDir = path.resolve(args.catalog ?? path.join(REPO_ROOT, 'catalog'));
  const { code } = await runBuild({
    catalogDir,
    reportFile: path.resolve(args.report ?? path.join(catalogDir, 'probe-report.json')),
    selected,
  });
  return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
