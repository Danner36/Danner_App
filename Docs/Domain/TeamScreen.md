Status: ACTIVE
Phase: MVP

# Team screen

`app/team/TeamScreen.tsx` is one engine for every team. A tile is a team key plus catalog display data (`TeamRef`). A pro tile uses one league adapter; a school tile uses one adapter per sport. The presets are defined in `app/selection/presets.ts`: Guardians `mlb-5`, Patriots `nfl-17`, Cyclones `ncaa-66`.

Adapter specifics are in [Leagues/MLB.md](Leagues/MLB.md), [Leagues/NFL.md](Leagues/NFL.md), and [Leagues/NCAA.md](Leagues/NCAA.md). Stream files, playback kinds and Get video are in [Streams.md](Streams.md). The basketball board is in [BasketballBoard.md](BasketballBoard.md).

## Screen

Every screen shows, top to bottom: the back control, the hero logo, the nickname, the record or records, the featured card or cards, and the schedule. Android Back closes the player first.

- Identity: catalog `nickname` replaces the short team name, and `name` is the full name (hero accessibility label, audio artist). The board label is the nickname in upper case when it is 10 characters or fewer, else the abbreviation. The accent is the preset color, else the catalog `color` when its contrast with white is at least 3:1, else `alternateColor` when it passes, else the Danner green.
- Sport labels on the hero, card and schedule rows appear only when a tile has more than one sport.
- A stored tile whose adapter is missing shows `This team needs a newer app version.`

## Featured games

The featured pick is in `app/team/engine/featured.ts`.

- A game in progress is Live unless its status names a suspension, postponement or cancellation. Of two Live games on a pro tile, today's official date wins.
- A start delayed past local midnight keeps its card until the game goes Live.
- Another entry with a featured game's id is a makeup or resumption when it starts later, and stays in the schedule; an earlier one is the same game's interrupted first date.
- A pro tile shows one card: Live, else today's next game, else today's last Final.
- A school tile shows one card per game today: Live, then today's not-finished games, then today's Finals, each group in start order.

## Card

| State | Card |
|---|---|
| Today, known start | Opponent, phone-local start time, one-second countdown, `Video starts 15 minutes before game time.` |
| Today, unknown start | `Time TBA`, no countdown. Video opens when the game is Live |
| Live | Score or live board, Play, Listen, Get video |
| Interrupted | The state named in a badge and a sentence |
| Final | `WIN`, `LOSS`, or `TIE`, `Home vs` or `Away v` (`vs` at a neutral site), the status, and the team-first score. No board, Play, Listen, or Get video |

A Final stays as today's recap through local midnight of the recap day: the phone-local date of the start when it is known, else the official date. MLB uses the statsapi official date.

Every date and time on screen is shown in the phone's time zone. The official date is a hidden matching key.

A delayed game that has not started keeps a 30-second clock, so its video window still opens. The countdown reaching zero refreshes the schedule once.

## Win chance

The featured card's score header shows a `WIN CHANCE` bar with each team's name and percentage. Before the game it reads ESPN's pre-game prediction; while Live it reads the newest entry of ESPN's probabilities list. A live game ESPN keeps no probabilities for shows the prediction until someone scores, then no bar. Shown percentages and the bar stay between 1% and 99%. It refreshes every ten minutes before the game and every 30 seconds while live. It is hidden after Final, for postponed and canceled games, and whenever ESPN returns no number. A failed request keeps the last number and never holds back the countdown, Play, or Get video. ESPN's percentages can total under 100 when a tie is possible, so the bar splits by their ratio. With no featured game, the first schedule row shows the same bar under it.

## Schedule

The schedule contains no completed or featured game, ordered by start time, with `vs` or `at`. A failed refresh exposes Retry without discarding previously loaded information.

## Refresh

| Surface | Cadence |
|---|---|
| Schedule | 60-second tick with ten-minute staleness; on open, pull-to-refresh, foreground, at the start time, and on Final |
| Live board | Five seconds while Live or past the start time. A poll still in flight skips the tick, and an older response never replaces a newer one |
| Streams | On open, pull-to-refresh and foreground; every 60 seconds around a game ([Streams.md](Streams.md)) |
| Win chance | Ten minutes before the game, 30 seconds while live |

All of it stops when the app is not active and on unmount.

A failed season-type list carries that adapter's previous games, record and postseason status forward and marks the snapshot incomplete, and the next tick retries, so a record is never computed from part of a schedule. A refresh where no list answered, and a first load with every adapter incomplete, shows the error card.

`liveMerge.ts` keeps the previous state, score and board when its state rank is higher or the last live poll was requested after the snapshot request, keeps the polled board while Live and polled within 30 s, and fills missing jersey numbers and stripe colors from the previous board.

## Test harness

`tests/team-harness/` serves today, ready, delayed, live, Final, live-basketball and two-games fixtures on port 8108, by team key, to a development build with `EXPO_PUBLIC_TEAM_TEST_URL` and `EXPO_PUBLIC_TEAM_SOURCES_URL` set. Get video runs against a Worker v2 mock on port 8111. Harness URLs, game data, and test video references are not imported into the application and are absent from production Android and iOS bundles.
