// Team allowlist and league rows, read from catalog/ on main. Retired entries, retired sports and
// entries hidden from the picker stay valid here; only `remove` in overrides.json deletes one.

import { BlobCache, FolderIndex, UpstreamError } from './github.js';

export const TEAM_KEY_PATTERN = /^[a-z]{2,8}-\d{1,8}$/;
export const LEAGUE_KEY_PATTERN = /^[a-z]{2,8}$/;

const CATALOG_REFRESH_MS = 3600 * 1000;
const CATALOG_MISSING_MS = 60 * 1000;
const PARSED_LEAGUES_MAX = 16;

export function splitTeamKey(teamKey) {
  const separator = teamKey.indexOf('-');
  return { espnId: teamKey.slice(separator + 1), league: teamKey.slice(0, separator) };
}

export function isSchool(entry) {
  return Array.isArray(entry?.sports);
}

export function createCatalogStore({ blobs, client, log, now }) {
  const rootIndex = new FolderIndex({
    client,
    log,
    missingTtlMs: CATALOG_MISSING_MS,
    now,
    path: 'catalog',
    ttlMs: CATALOG_REFRESH_MS,
  });
  const teamsIndex = new FolderIndex({
    client,
    log,
    missingTtlMs: CATALOG_MISSING_MS,
    now,
    path: 'catalog/teams',
    ttlMs: CATALOG_REFRESH_MS,
  });
  const teamMaps = new Map();

  async function teamMap(env, league) {
    const sha = (await teamsIndex.read(env)).get(`${league}.json`);
    if (!sha) {
      return undefined;
    }
    const known = teamMaps.get(sha);
    if (known) {
      return known;
    }
    const document = await blobs.json(env, sha);
    if (!Array.isArray(document?.teams)) {
      log('catalog league file is malformed', league);
      throw new UpstreamError('catalog', league);
    }
    if (teamMaps.size >= PARSED_LEAGUES_MAX) {
      teamMaps.delete(teamMaps.keys().next().value);
    }
    const map = new Map(
      document.teams.filter((entry) => typeof entry?.key === 'string').map((entry) => [entry.key, entry]),
    );
    teamMaps.set(sha, map);
    return map;
  }

  async function leaguesSha(env) {
    return (await rootIndex.read(env)).get('leagues.json');
  }

  return {
    // { sha, text } of catalog/leagues.json, or undefined when it is not committed.
    async leaguesFile(env) {
      const sha = await leaguesSha(env);
      return sha ? { sha, text: await blobs.text(env, sha) } : undefined;
    },

    // { sha, text } of catalog/teams/<league>.json, or undefined for an unknown league.
    async teamsFile(env, league) {
      const sha = (await teamsIndex.read(env)).get(`${league}.json`);
      return sha ? { sha, text: await blobs.text(env, sha) } : undefined;
    },

    async team(env, teamKey) {
      const { league } = splitTeamKey(teamKey);
      return (await teamMap(env, league))?.get(teamKey);
    },

    // The league row from catalog/leagues.json, or undefined when it cannot be read. Used only by
    // the event check, which is skipped without it.
    async leagueRow(env, league) {
      try {
        const sha = await leaguesSha(env);
        const document = sha ? await blobs.json(env, sha) : undefined;
        return Array.isArray(document?.leagues)
          ? document.leagues.find((row) => row?.key === league)
          : undefined;
      } catch (error) {
        log('catalog league row unavailable', league, error instanceof Error ? error.message : 'error');
        return undefined;
      }
    },
  };
}

export function createBlobs({ client, log, now }) {
  return new BlobCache({ client, log, now });
}
