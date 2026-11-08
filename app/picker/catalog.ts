import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LeagueKey, TeamKey, TeamRef } from '../leagues/types.ts';
import {
  newerDocument,
  parseLeaguesDocument,
  parseTeamsDocument,
  teamRefFromCatalog,
  type CatalogLeagues,
  type CatalogTeams,
} from './catalogModel.ts';
import bundledSnapshot from './catalogSnapshot.json';

const CACHE_KEY = 'danner.catalog.v1';
const REFRESH_AFTER_MS = 24 * 60 * 60_000;
const FETCH_TIMEOUT_MS = 12_000;
const RAW_ORIGIN = 'https://raw.githubusercontent.com/Danner36/Danner_App/main/catalog';
const WORKER_URL = process.env.EXPO_PUBLIC_DANNER_WORKER_URL;
const TEST_CATALOG_URL = __DEV__ ? process.env.EXPO_PUBLIC_TEAM_CATALOG_URL : undefined;
const LEAGUES_FILE = 'leagues';

type CachedFile = { etag?: string; fetchedAt: string; text: string };
type CatalogCache = { files: Record<string, CachedFile> };

export type CatalogData = {
  leagues?: CatalogLeagues;
  teams: Partial<Record<LeagueKey, CatalogTeams>>;
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function leagueKeysOf(leagues: CatalogLeagues | undefined): LeagueKey[] {
  return leagues ? leagues.leagues.map((league) => league.key) : [];
}

function bundledLeagues(): CatalogLeagues | undefined {
  return parseLeaguesDocument(bundledSnapshot.leagues);
}

function bundledTeams(league: LeagueKey): CatalogTeams | undefined {
  const documents = bundledSnapshot.teams as Record<string, unknown>;
  return parseTeamsDocument(documents[league], league);
}

async function readCache(): Promise<CatalogCache> {
  try {
    const stored = parseJson((await AsyncStorage.getItem(CACHE_KEY)) ?? '');
    if (
      typeof stored === 'object' &&
      stored !== null &&
      typeof (stored as CatalogCache).files === 'object' &&
      (stored as CatalogCache).files !== null
    ) {
      return stored as CatalogCache;
    }
  } catch {
    // The bundled snapshot still answers.
  }
  return { files: {} };
}

function catalogFromCache(cache: CatalogCache): CatalogData {
  const leagueText = cache.files[LEAGUES_FILE]?.text;
  const leagues = newerDocument(
    bundledLeagues(),
    leagueText ? parseLeaguesDocument(parseJson(leagueText)) : undefined,
  );
  const teams: CatalogData['teams'] = {};
  for (const league of leagueKeysOf(leagues)) {
    const text = cache.files[league]?.text;
    const chosen = newerDocument(
      bundledTeams(league),
      text ? parseTeamsDocument(parseJson(text), league) : undefined,
    );
    if (chosen) {
      teams[league] = chosen;
    }
  }
  return { leagues, teams };
}

export async function readCatalog(): Promise<CatalogData> {
  return catalogFromCache(await readCache());
}

function remoteUrls(name: string): string[] {
  const rawName = name === LEAGUES_FILE ? 'leagues.json' : `teams/${name}.json`;
  if (TEST_CATALOG_URL) {
    return [`${TEST_CATALOG_URL.replace(/\/$/, '')}/${rawName}`];
  }
  const urls = [`${RAW_ORIGIN}/${rawName}`];
  if (WORKER_URL) {
    const origin = WORKER_URL.replace(/\/$/, '');
    urls.unshift(name === LEAGUES_FILE ? `${origin}/catalog` : `${origin}/catalog/${name}`);
  }
  return urls;
}

// Fetches one file through the Worker, then raw GitHub. Undefined when every source failed or
// answered something that does not parse.
async function fetchCatalogFile(
  name: string,
  cached: CachedFile | undefined,
  accept: (value: unknown) => boolean,
  fetchedAt: string,
): Promise<CachedFile | undefined> {
  for (const url of remoteUrls(name)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...(cached?.etag ? { 'If-None-Match': cached.etag } : {}),
        },
        signal: controller.signal,
      });
      if (response.status === 304 && cached) {
        return { ...cached, fetchedAt };
      }
      if (response.ok) {
        const text = await response.text();
        if (accept(parseJson(text))) {
          return {
            etag: response.headers.get('etag') ?? undefined,
            fetchedAt,
            text,
          };
        }
      }
    } catch {
      // The next source answers.
    } finally {
      clearTimeout(timer);
    }
  }
  return undefined;
}

function isStale(file: CachedFile | undefined, now: number): boolean {
  if (TEST_CATALOG_URL) {
    return true;
  }
  const fetched = file ? Date.parse(file.fetchedAt) : Number.NaN;
  return Number.isNaN(fetched) || now - fetched >= REFRESH_AFTER_MS;
}

// Refreshes the cache when it is older than 24 hours. Answers the catalog after the refresh, or
// undefined when nothing was fetched.
export async function refreshCatalogIfStale(): Promise<CatalogData | undefined> {
  const cache = await readCache();
  const now = Date.now();
  if (!isStale(cache.files[LEAGUES_FILE], now)) {
    return undefined;
  }

  const fetchedAt = new Date(now).toISOString();
  const leaguesFile = await fetchCatalogFile(
    LEAGUES_FILE,
    cache.files[LEAGUES_FILE],
    (value) => parseLeaguesDocument(value) !== undefined,
    fetchedAt,
  );
  if (!leaguesFile) {
    return undefined;
  }

  const files: Record<string, CachedFile> = { ...cache.files, [LEAGUES_FILE]: leaguesFile };
  const leagues = parseLeaguesDocument(parseJson(leaguesFile.text));
  for (const league of leagueKeysOf(leagues)) {
    const file = await fetchCatalogFile(
      league,
      cache.files[league],
      (value) => parseTeamsDocument(value, league) !== undefined,
      fetchedAt,
    );
    if (file) {
      files[league] = file;
    }
  }

  const next: CatalogCache = { files };
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => undefined);
  return catalogFromCache(next);
}

export function teamRefLookup(catalog: CatalogData): (key: TeamKey) => TeamRef | undefined {
  const entries = new Map(
    Object.values(catalog.teams).flatMap((document) =>
      document.teams.map((team) => [team.key, team] as const),
    ),
  );
  return (key) => {
    const entry = entries.get(key);
    return entry ? teamRefFromCatalog(entry) : undefined;
  };
}
