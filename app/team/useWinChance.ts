import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { WinChance } from '../leagues/espn/winChance.ts';
import { adapterFor } from '../leagues/registry.ts';
import type { TeamRef } from '../leagues/types.ts';
import type { TeamGame } from './engine/types.ts';
import { gameInterruption } from './engine/videoWindow.ts';

const PREGAME_REFRESH_MS = 600_000;
const LIVE_REFRESH_MS = 30_000;

// The win chance for a game: ESPN's pre-game prediction, then the live probability once the game
// starts. Nothing is returned after Final, for a postponed or canceled game, or when ESPN has no
// number. A failed request keeps the last number.
export function useWinChance(
  game: TeamGame | undefined,
  team: TeamRef,
): WinChance | undefined {
  const key = game?.key;
  const state = game?.abstractState;
  const interruption = game ? gameInterruption(game.status) : undefined;
  const wanted =
    (state === 'Preview' || state === 'Live') &&
    interruption !== 'postponed' &&
    interruption !== 'canceled';
  const [found, setFound] = useState<{ chance: WinChance; key: string }>();
  // The fetch below outlives many live polls and needs the current score.
  const latestGame = useRef(game);

  useEffect(() => {
    latestGame.current = game;
  }, [game]);

  useEffect(() => {
    if (!wanted || !game || key === undefined) {
      return;
    }
    const adapter = adapterFor(game.adapter);
    if (!adapter) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      if (AppState.currentState !== 'active') {
        return;
      }
      const chance = await adapter.fetchWinChance(
        latestGame.current ?? game,
        team,
        state === 'Live',
      );
      if (cancelled) {
        return;
      }
      if (chance === null) {
        setFound(undefined);
      } else if (chance) {
        setFound({ chance, key });
      }
    };
    void load();
    const timer = setInterval(
      () => void load(),
      state === 'Live' ? LIVE_REFRESH_MS : PREGAME_REFRESH_MS,
    );
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // The game object changes on every poll; the key and state identify what is fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, state, team, wanted]);

  return wanted && found && found.key === key ? found.chance : undefined;
}
