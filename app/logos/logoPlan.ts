import type { TeamKey } from '../leagues/types.ts';
import { isAllowedLogoUrl } from '../picker/catalogModel.ts';
import type { Tile } from '../selection/types.ts';

export type LogoIndex = Record<TeamKey, { href: string; name: string }>;

export function logoFileName(key: TeamKey): string {
  return `logos/${key}.png`;
}

// The tiles that need a download: the file is missing, or the catalog changed the logo. Bundled
// art and hosts outside the allowed one are never fetched.
export function logosToFetch(
  tiles: readonly Tile[],
  index: LogoIndex,
  fileExists: (key: TeamKey) => boolean,
  hasBundledArt: (key: TeamKey) => boolean,
): { href: string; key: TeamKey }[] {
  return tiles.flatMap((tile) => {
    const href = tile.team.logo;
    if (!isAllowedLogoUrl(href) || hasBundledArt(tile.key)) {
      return [];
    }
    return fileExists(tile.key) && index[tile.key]?.href === href
      ? []
      : [{ href, key: tile.key }];
  });
}
