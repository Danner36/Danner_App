import type { TeamKey } from '../leagues/types.ts';
import { isAllowedLogoUrl } from '../picker/catalogModel.ts';
import { PRESET_TILES } from '../selection/presets.ts';
import type { Tile } from '../selection/types.ts';

export type LogoIndex = Record<TeamKey, { href: string; name: string }>;

export function logoFileName(key: TeamKey): string {
  return `logos/${key}.png`;
}

// A preset tile saved by v2.0.1 has no logo of its own.
function logoUrlFor(tile: Tile): string | undefined {
  return (
    tile.team.logo ??
    PRESET_TILES.find((preset) => preset.key === tile.key)?.team.logo
  );
}

// The tiles that need a download: the file is missing, or the catalog changed the logo. Hosts
// outside the allowed one are never fetched.
export function logosToFetch(
  tiles: readonly Tile[],
  index: LogoIndex,
  fileExists: (key: TeamKey) => boolean,
): { href: string; key: TeamKey }[] {
  return tiles.flatMap((tile) => {
    const href = logoUrlFor(tile);
    if (!isAllowedLogoUrl(href)) {
      return [];
    }
    return fileExists(tile.key) && index[tile.key]?.href === href
      ? []
      : [{ href, key: tile.key }];
  });
}
