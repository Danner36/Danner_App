import { isSportKey, SPORT_ORDER } from '../leagues/sports.ts';
import type { LeagueKey, SportKey, TeamKey, TeamRef } from '../leagues/types.ts';
import type { InstallTimes } from './installInfo.ts';
import { applyFamilyPreset, emptySelection } from './ops.ts';
import { PRESET_TILES } from './presets.ts';
import {
  decideSeed,
  LEGACY_SIGNAL_KEYS,
  LEGACY_SOURCES_KEYS,
  SEED_KEY,
  type SeedRecord,
} from './seed.ts';
import type { SelectionV1, Tile } from './types.ts';

export const SELECTION_KEY = 'danner.selection.v1';
export const SELECTION_SCHEMA = 1;

const TEAM_KEY_PATTERN = /^[a-z]{2,8}-\d{1,8}$/;
const PRO_LEAGUES: ReadonlySet<string> = new Set<LeagueKey>([
  'mlb',
  'nfl',
  'nba',
  'wnba',
  'nhl',
  'mls',
  'nwsl',
]);

export type SelectionStorage = {
  multiGet: (keys: readonly string[]) => Promise<readonly (readonly [string, string | null])[]>;
  multiRemove: (keys: readonly string[]) => Promise<void>;
  setItem: (key: string, value: string) => Promise<void>;
};

// One step per older schema: `migrations[n]` turns a schema-n document into schema n + 1.
export type SelectionMigrations = Readonly<Record<number, (document: unknown) => unknown>>;

const SELECTION_MIGRATIONS: SelectionMigrations = {};

export type LoadOptions = {
  appVersion: string;
  getInstallTimes: () => Promise<InstallTimes | undefined>;
  migrations?: SelectionMigrations;
  now: () => string;
  storage: SelectionStorage;
  // Development only: preset keys written as the selection when both keys are absent.
  testSelection?: readonly TeamKey[];
};

export type LoadedSelection = {
  readOnly: boolean;
  selection: SelectionV1;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseTeamRef(value: unknown): TeamRef | undefined {
  if (
    !isRecord(value) ||
    !isText(value.espnId) ||
    !isText(value.name) ||
    !isText(value.nickname) ||
    !isText(value.location) ||
    !isText(value.abbreviation)
  ) {
    return undefined;
  }
  const team: TeamRef = {
    abbreviation: value.abbreviation,
    espnId: value.espnId,
    location: value.location,
    name: value.name,
    nickname: value.nickname,
  };
  if (isText(value.color)) team.color = value.color;
  if (isText(value.alternateColor)) team.alternateColor = value.alternateColor;
  if (isText(value.logo)) team.logo = value.logo;
  if (isText(value.conference)) team.conference = value.conference;
  const statsapi = value.statsapi;
  if (
    isRecord(statsapi) &&
    typeof statsapi.teamId === 'number' &&
    (statsapi.leagueId === 103 || statsapi.leagueId === 104)
  ) {
    team.statsapi = { leagueId: statsapi.leagueId, teamId: statsapi.teamId };
  }
  return team;
}

function parseTile(value: unknown): Tile | undefined {
  if (!isRecord(value) || !isText(value.key) || !TEAM_KEY_PATTERN.test(value.key)) {
    return undefined;
  }
  const team = parseTeamRef(value.team);
  if (!team) {
    return undefined;
  }
  if (value.kind === 'pro' && typeof value.league === 'string' && PRO_LEAGUES.has(value.league)) {
    return {
      key: value.key,
      kind: 'pro',
      league: value.league as Exclude<LeagueKey, 'ncaa'>,
      team,
    };
  }
  if (value.kind === 'school' && value.league === 'ncaa' && Array.isArray(value.sports)) {
    const listed = value.sports.filter(isSportKey);
    const sports: SportKey[] = SPORT_ORDER.filter((sport) => listed.includes(sport));
    return sports.length > 0
      ? { key: value.key, kind: 'school', league: 'ncaa', sports, team }
      : undefined;
  }
  return undefined;
}

export type ParsedSelection = {
  // False when a tile could not be read, so the document must not be rewritten without it.
  complete: boolean;
  selection: SelectionV1;
};

// Reads the known fields of a selection document. Unknown keys are ignored.
export function parseSelectionDocument(document: unknown): ParsedSelection | undefined {
  if (!isRecord(document) || !Array.isArray(document.tiles)) {
    return undefined;
  }
  const seen = new Set<string>();
  const tiles: Tile[] = [];
  for (const entry of document.tiles) {
    const tile = parseTile(entry);
    if (tile && !seen.has(tile.key)) {
      seen.add(tile.key);
      tiles.push(tile);
    }
  }
  return {
    complete: tiles.length === document.tiles.length,
    selection: {
      schema: 1,
      tiles,
      updatedAt: isText(document.updatedAt) ? document.updatedAt : '',
    },
  };
}

function readOnlyEmpty(now: string): LoadedSelection {
  return { readOnly: true, selection: emptySelection(now) };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function runMigrations(
  document: Record<string, unknown>,
  migrations: SelectionMigrations,
): unknown {
  let current: unknown = document;
  for (let schema = Number(document.schema); schema < SELECTION_SCHEMA; schema += 1) {
    const migrate = migrations[schema];
    if (!migrate) {
      return undefined;
    }
    current = migrate(current);
  }
  return current;
}

// An unreadable document leaves the key alone and the session read-only. A newer schema is read and
// never written. An older schema is migrated, validated, and written back.
async function fromStored(text: string, options: LoadOptions): Promise<LoadedSelection> {
  const document = parseJson(text);
  if (!isRecord(document) || typeof document.schema !== 'number') {
    return readOnlyEmpty(options.now());
  }

  if (document.schema > SELECTION_SCHEMA) {
    const parsed = parseSelectionDocument(document);
    return parsed
      ? { readOnly: true, selection: parsed.selection }
      : readOnlyEmpty(options.now());
  }

  if (document.schema < SELECTION_SCHEMA) {
    let migrated: unknown;
    try {
      migrated = runMigrations(document, options.migrations ?? SELECTION_MIGRATIONS);
    } catch {
      return readOnlyEmpty(options.now());
    }
    const parsed = parseSelectionDocument(migrated);
    if (!parsed || !parsed.complete) {
      return readOnlyEmpty(options.now());
    }
    try {
      await options.storage.setItem(SELECTION_KEY, JSON.stringify(parsed.selection));
    } catch {
      return { readOnly: true, selection: parsed.selection };
    }
    return { readOnly: false, selection: parsed.selection };
  }

  const parsed = parseSelectionDocument(document);
  if (!parsed) {
    return readOnlyEmpty(options.now());
  }
  return { readOnly: !parsed.complete, selection: parsed.selection };
}

function testSelectionTiles(keys: readonly TeamKey[]): Tile[] {
  return keys.flatMap((key) => PRESET_TILES.filter((tile) => tile.key === key));
}

// Decides from the v1.x signals, then writes the selection before the seed record, so an
// interrupted launch can never leave a seed record with no selection on a family phone. The legacy
// sources keys are removed only after both writes succeed.
async function firstLaunch(options: LoadOptions): Promise<LoadedSelection> {
  const { storage } = options;
  const at = options.now();
  try {
    if (options.testSelection) {
      const selection: SelectionV1 = {
        schema: 1,
        tiles: testSelectionTiles(options.testSelection),
        updatedAt: at,
      };
      await storage.setItem(SELECTION_KEY, JSON.stringify(selection));
      return { readOnly: false, selection };
    }

    const legacy = await storage.multiGet(LEGACY_SIGNAL_KEYS);
    const legacyKeysPresent = legacy.some(([, value]) => value !== null);
    const installTimes = legacyKeysPresent ? undefined : await options.getInstallTimes();
    const decided = decideSeed(legacyKeysPresent, installTimes);
    const selection =
      decided.decision === 'legacy-family'
        ? applyFamilyPreset(emptySelection(at), at)
        : emptySelection(at);
    const record: SeedRecord = { ...decided, appVersion: options.appVersion, at };

    await storage.setItem(SELECTION_KEY, JSON.stringify(selection));
    await storage.setItem(SEED_KEY, JSON.stringify(record));

    if (decided.decision === 'legacy-family') {
      await storage.multiRemove(LEGACY_SOURCES_KEYS).catch(() => undefined);
    }
    return { readOnly: false, selection };
  } catch {
    return readOnlyEmpty(at);
  }
}

// Any storage failure answers read-only: no seeding and no writes for that session.
export async function loadSelection(options: LoadOptions): Promise<LoadedSelection> {
  let selectionText: string | null;
  let seedText: string | null;
  try {
    const pairs = await options.storage.multiGet([SELECTION_KEY, SEED_KEY]);
    const values = new Map(pairs);
    selectionText = values.get(SELECTION_KEY) ?? null;
    seedText = values.get(SEED_KEY) ?? null;
  } catch {
    return readOnlyEmpty(options.now());
  }

  if (selectionText !== null) {
    return fromStored(selectionText, options);
  }
  if (seedText !== null) {
    return { readOnly: false, selection: emptySelection(options.now()) };
  }
  return firstLaunch(options);
}
