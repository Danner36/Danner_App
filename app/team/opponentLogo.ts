import bundledSnapshot from '../picker/catalogSnapshot.json';
import type { TeamGame } from './engine/types.ts';

// MLB schedules come from statsapi and carry no ESPN logo, so the catalog supplies it by team name.
export function opponentLogoFor(game: TeamGame): string | undefined {
  if (game.opponentLogo || game.adapter !== 'mlb') {
    return game.opponentLogo;
  }
  return bundledSnapshot.teams.mlb.teams.find(
    (team) => team.name === game.opponentName,
  )?.logo;
}
