// Re-checks a found candidate against the catalog spec and the provider table. Pure, with no
// Node-only imports, so the publish job and the Worker's fast path apply the exact same rules.

import { providerForUrl } from './extract/providers.mjs';
import { EVENT_ID_PATTERN, isPlayableStream, isValidGameDate } from './playableStream.mjs';
import { canonicalPlayerUrl } from './playerUrl.mjs';
import { validationForTeam } from './teamSpec.mjs';

const sameList = (first, second) =>
  Array.isArray(first) && first.length === second.length && first.every((value, index) => value === second[index]);

// The game key from a candidate, checked against the request, in the shape the streams match
// reads. Resumed state is not carried over: publish asks statsapi for that itself.
export function validatedGame(candidate, team, eventId) {
  const { game } = candidate;
  if (
    candidate.schemaVersion !== 1 ||
    candidate.team !== team.key ||
    candidate.sport !== team.sport ||
    (candidate.eventId ?? undefined) !== eventId ||
    typeof game !== 'object' ||
    game === null ||
    typeof game.eventId !== 'string' ||
    !EVENT_ID_PATTERN.test(game.eventId) ||
    (eventId && game.eventId !== eventId) ||
    !isValidGameDate(game.officialDate) ||
    !Number.isInteger(game.gameNumber) ||
    game.gameNumber < 1 ||
    game.gameNumber > 9
  ) {
    return undefined;
  }
  return {
    gameNumber: game.gameNumber,
    gamePk: game.eventId,
    officialDate: game.officialDate,
    ...(team.sport ? { sport: team.sport } : {}),
  };
}

// Returns { game, entry } rebuilt from checked values, or undefined. The path never comes from
// the candidate: publish derives it from the catalog entry for the validated key.
export function validateFoundCandidate(candidate, team, eventId) {
  if (typeof candidate !== 'object' || candidate === null) {
    return undefined;
  }
  const { entry, game } = candidate;
  const checkedGame = validatedGame(candidate, team, eventId);
  if (!checkedGame || typeof entry !== 'object' || entry === null) {
    return undefined;
  }

  const url = canonicalPlayerUrl(entry.url);
  const provider = url ? providerForUrl(url) : undefined;
  if (
    !provider ||
    entry.kind !== 'web' ||
    entry.allowInsecureHttp !== false ||
    entry.source !== 'pipeline' ||
    entry.eventId !== game.eventId ||
    entry.sport !== team.sport ||
    !sameList(entry.gameDates, [game.officialDate]) ||
    !sameList(entry.gameNumbers, [game.gameNumber]) ||
    !sameList(entry.trustedHosts, provider.trustedHosts)
  ) {
    return undefined;
  }

  const rebuilt = {
    ...(team.sport ? { sport: team.sport } : {}),
    eventId: game.eventId,
    gameDates: [game.officialDate],
    gameNumbers: [game.gameNumber],
    kind: 'web',
    url,
    allowInsecureHttp: false,
    trustedHosts: [...provider.trustedHosts],
    source: 'pipeline',
  };
  return isPlayableStream(rebuilt, validationForTeam(team)) ? { entry: rebuilt, game: checkedGame } : undefined;
}
