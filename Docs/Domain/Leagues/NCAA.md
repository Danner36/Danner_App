Status: ACTIVE
Phase: MVP

# NCAA adapters

The `ncaa/football`, `ncaa/mens-basketball`, and `ncaa/womens-basketball` adapters read ESPN's public site JSON. A school is one tile with one sport row per selected sport. Iowa State Cyclones (`ncaa-66`, all three sports) is the worked example.

## Schedule, records and cards

Each sport requests its preseason, regular-season, and postseason lists from `teams/<id>/schedule`.

| Sport | ESPN site path | Season year | Board |
|---|---|---|---|
| Football | `football/college-football` | January → previous calendar year | Period board (four quarters + OT, down and distance, possession) |
| Men's basketball | `basketball/mens-college-basketball` | July–December → calendar year + 1 | Arena board, two halves + OT |
| Women's basketball | `basketball/womens-college-basketball` | July–December → calendar year + 1 | Arena board, four quarters + OT |

Each game today gets its own featured card naming the sport: Live games first, then today's games that have not finished, then today's finals, each group in start order. Each card has its own countdown, five-second poll, streams and Get video session, and only one stream or Listen plays at a time. Games on later days stay in the schedule, which labels each row with its sport.

A compact regular-season record per sport sits under the title. Each stays `0–0` until that sport has a regular-season Final. Preseason and postseason do not change those numbers. A sport whose ESPN request fails keeps its previous games, record, and status while the other sports update.

Official dates are the America/New_York calendar date of the start. A neutral-site game reads `vs` the opponent without a home or away label. A `Time TBA` game is an all-day game on its official date.

The arena board is defined in [BasketballBoard.md](../BasketballBoard.md).

## Postseason status

A sport is still alive if it has a Live game or any future scheduled game.

| Status | Rule |
|---|---|
| Eliminated | The last completed game is a loss in a knockout event and no later game exists |
| Season complete | No remaining games and the last Final is not a qualifying knockout loss. Not shown on screen |
| `Won the [tournament]` | A win in the championship final |
| `Awaiting next [tournament] game` | A knockout win with no next game posted |

Football has its own path: only the College Football Playoff is a knockout, and any other bowl ends the season.

For basketball, a conference tournament game is one whose notes contain `conference tournament`, or a regular-season-type game whose notes contain `tournament` or `championship`, or a game whose notes name the school's `conference` together with either word. A conference-tournament result shows `Awaiting next tournament game` for 14 days with no next game, then the season is complete. ESPN's NCAA Tournament notes and the NIT, WNIT and WBIT are named; any other postseason game whose notes contain `tournament`, such as the CBI or CIT, is a knockout named `tournament`.

Selection Sunday, pairing, a next-opponent TBA, and a win with no next game posted never read as eliminated. `Won the …` appears only for a championship final.

## Streams

The streams file is `streams/ncaa/<espnId>.json`, one per school. Each entry requires `sport` (`football`, `mens-basketball`, or `womens-basketball`), and a match needs the same sport.

Listing path tokens for the three sports are found on the listing when each sport's first row appears; only tokens are recorded, never the host or a full link. They live in the pipeline config, not the app, so they need no app release.
