Status: ACTIVE
Phase: MVP

# MLB adapter

MLB uses `statsapi.mlb.com` in the app and the pipeline. The team id and league id (103 AL, 104 NL) come from `TeamRef.statsapi`. Cleveland Guardians (`mlb-5`, statsapi team 114, league 103) is the worked example.

## Schedule and record

The adapter requests the season's remaining schedule (`hydrate=linescore,team`, from yesterday through December 31) and the regular-season standings. The two requests share a 10-second budget. The hero record comes from the standings.

- `officialDate` is the statsapi official date.
- `gameNumber` is MLB's doubleheader number.
- A game with `startTimeTBD` shows `Time TBA` in the schedule and on today's card, and does not count down or open Play before it is live. MLB's placeholder for an unset postseason start, 3:33 AM Eastern (`07:33Z`), is not shown. Today's check uses the official date.
- Warmup (`PW`) counts as pre-game.
- A failed schedule or standings request fails the refresh and shows Retry without discarding what is on screen.

## Live board

A live featured game, or one past its start that MLB has not yet marked live, is polled every five seconds through `schedule?gamePk=…&hydrate=linescore`. The park-style board shows innings, runs, hits, errors, balls, strikes, outs, and the current batter and pitcher numbers. Jersey numbers come from `people/{id}` and are cached.

The game status stays MLB's detailed state, so a delay or suspension remains visible; the inning text lives only on the board. The card's status line reads the board's inning unless the status names an interruption.

A postponed or suspended game can appear under each date it was scheduled with one `gamePk`. The poll takes the entry that shares the official date, then the one starting closest to the featured start. A suspended game MLB still reports as Live does not take the featured card. A postponed game's makeup stays in the schedule.

## Win chance

MLB games have no ESPN identifier. The adapter finds the ESPN game on ESPN's MLB scoreboard for the official date and takes this team's game whose start is closest to MLB's, within 30 minutes, which keeps each doubleheader game on its own number. The mapping is cached by `TeamGame.key`, so a postponed game that keeps its `gamePk` looks up its new date.

## Streams

`gameDates` hold MLB official dates. The streams file is `streams/mlb/<espnId>.json`.
