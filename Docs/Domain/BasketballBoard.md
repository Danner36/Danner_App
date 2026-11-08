Status: ACTIVE
Phase: MVP

# Basketball arena board

A gym-style board for a live basketball game: a center panel with both team names, team fouls, bonus pills and the last foul, and each team's five players with jersey (`#`), fouls (`FL`) and points (`PTS`). Team names are text; the board carries no logos or other branding.

The card's score header (`app/team/GameScoreHeader.tsx`) holds the score, clock, period, phase and possession. A school tile's featured card draws the board for a live men's or women's basketball game, as the card's last item, after the Play and Listen row and Get video. It is not drawn before the game is Live or after Final: the countdown comes before, and the Final recap keeps its score box. Football keeps its own board.

## Code

| Path | Contents |
|---|---|
| `app/leagues/espn/basketballBoard.ts` | `basketballBoardFromSummary` (live summary) and `basketballBoardFromScheduleEvent` (schedule event) build a `BasketballBoardModel`. Pure |
| `app/leagues/espn/basketballRules.ts` | Per adapter (`ncaa/mens-basketball`, `ncaa/womens-basketball`): capability flags, foul window, bonus thresholds and player foul limit. Pure |
| `app/scoreboards/basketball/BasketballArenaBoard.tsx` | The board, its three accessibility elements and the stale note |
| `app/scoreboards/basketball/arenaLayout.ts`, `arenaText.ts`, `arenaTokens.ts`, `types.ts` | Layout sizes, board text and spoken summaries, colors, and the model types. Pure |
| `app/leagues/espn/summary.ts` | The summary and schedule boards per adapter, and the stale-note time |

## Cells

Every cell comes from the ESPN `summary?event=` body that the five-second live poll already fetches. The parser recomputes the board from the full arrays of each response, so late-inserted plays and corrections apply.

| Cell | Source | Missing |
|---|---|---|
| Clock | `header.competitions[0].status.displayClock`, shown as sent; no local ticking | `-:--` |
| Period well | `status.period`, else the last play's period: `1` to the regulation count, then `OT`, `2OT` | `–` |
| Phase text | `status.type.name` (`3RD QTR`, `2ND HALF`, `HALFTIME`, `END OF Q1`, `END OF REG`, `OVERTIME`, `2ND OT`), else the status detail; without a status name, the last play (`412` ends a period) | Empty |
| Regulation periods | `format.regulation.periods` (2 or 4), else the adapter row | — |
| Scores | `competitors[].score` | `–` |
| Players | Lineup below; box columns found by `keys` (`points`, `fouls`, `rebounds`), else `labels` (`PTS`, `PF`, `REB`), never by position | `–` |
| Jersey | `athlete.jersey` as text, so `0` and `00` differ | `–` |
| Team fouls (`FOULS`) | The team's foul plays in the current foul window. NCAA: types `519` and `521`. NBA and WNBA: `type.text` with `foul` and none of `offensive`, `technical`, `double`, `turnover`, `free throw` | `–` |
| Bonus pill | `BONUS` or `2× BONUS` under the team that shoots, from the opponent's count in the window; only while the ball is in play and when the game's `format.regulation.periods`, if present, equals the adapter row's | Hidden |
| Last foul | The newest play whose `type.text` has `foul` or `charge` and not `turnover` or `free throw`; `participants[0]` committed it. Jersey and box PF wells, with an arrow toward the fouling team | `–` wells, no arrow |
| Timeouts left (`T.O.L.`) | Only an ESPN field that holds each team's remaining timeouts (read from `situation.homeTimeouts` and `awayTimeouts` when the flag is on); never counted from timeout plays | Row omitted |
| Possession arrow | `possessionArrowAvailable` true with exactly one `competitors[].possession` true | Not drawn |

A player at the foul limit minus one shows foul trouble: the `FL` cell inverts to amber with a black digit. A player at the limit, or named by an Ejection play (`517`), is out: a red cell with a white digit, a struck jersey and dimmed digits. The box `ejected` flag is not read.

## Lineup

Each team starts from its five `starter: true` box athletes, then applies each substitution play (`584`) in array order. Two participants (NBA, WNBA): the first enters and the second leaves. One participant (NCAA): the text says `subbing in` or `subbing out`. While the substitution plays after the last other play leave a team with other than five, that team shows its set as of that last other play.

The replay passes when there are exactly five starters; no swap adds a player already in, removes one not in, or names an unknown player; the set has five at every other play; every player named in a later play is in the set, and a player id that is not in the box fails the play's team (both teams when it is not the first participant or the play has no team); late inserts, whose `wallclock` precedes the previous play's, are skipped here, and so are technical-foul and ejection plays under rules where technicals do not count toward the foul limit, because those can name a player on the bench; and no player who reached the foul limit or was ejected is still in the set after the game clock has run past that play.

| Result | Table | Caption |
|---|---|---|
| Replay passes | The five on the floor, in jersey order | `PLAYERS ON THE FLOOR` (one team: `ON THE FLOOR`) |
| Replay fails, `activeLineup` on, exactly five `active: true` athletes covering the team's players since its last substitution | Those five | As above |
| Replay fails otherwise | The team's five top scorers, by points then jersey | `TOP SCORERS (LINEUP UNKNOWN)` (one team: `TOP SCORERS`) |
| Before the tip: pregame, or the first period with no play and no points | The five starters | `STARTERS` |
| No plays after the tip | The team's five top scorers; team fouls `–`, no bonus | As for a failed replay |
| No player data | Dash rows | `PLAYER STATS NOT AVAILABLE` (one team: `NO PLAYER STATS`) |

The check rejects inconsistent data; it cannot prove the lineup. A substitution ESPN never logs keeps every swap valid, so the wrong five show as on the floor until a later play contradicts the set.

## Capability flags and rules

A flag that is off omits its row or cell instead of dashing it; with `players` off the board is the center panel only, and with every detail flag off only the stale note is drawn. A flag turns on only after a live capture for that adapter holds the paths it needs. The men's row has `players`, `rebounds`, `teamFouls`, `bonus` and `lastFoul` on, from the live capture of event 401909771; every women's flag is off until a women's live capture, so a women's game shows the team names, scores, clock, phase and period.

| Flag or rule | `ncaa/mens-basketball` | `ncaa/womens-basketball` |
|---|---|---|
| `players`, `rebounds`, `teamFouls`, `bonus`, `lastFoul` | On | Off |
| `activeLineup`, `timeouts`, `possessionArrow` | Off | Off |
| Foul window | Each half; overtime continues the second half | Each quarter; overtime continues the fourth |
| Bonus | 6 opponent fouls `BONUS`, 9 `2× BONUS` | 4 `BONUS` |
| Player foul limit | 5 | 5 |
| Technicals toward the foul limit | Yes | Yes |

`REB` is drawn only on tables of 180 dp or more with `rebounds` on. Limits and thresholds are rule-book values that ESPN data does not confirm.

## Polling

The live summary poll and the schedule refresh share one board per featured game.

- Score, clock, period, phase and status always apply from the newest summary, so Live to Final and the score are never held back.
- A summary whose `plays` array is shorter than the last applied one for the same game, or that lacks a team's box players, keeps the previous player tables, team fouls, bonus and last foul for up to 30 s after they were applied; after that the new response applies and its length becomes the baseline.
- The schedule refresh builds a board with scores, clock and period only, with regulation periods from the sport. The polled board stays while it is under 30 s old; after that the schedule board replaces it, and the tables show `PLAYER STATS NOT AVAILABLE`. A schedule board takes the stripe colors of the previous board of the same game.

## Layout

The board's inner width is W = min(window width, 720) − 76; the board reaches 12 dp into the card's padding. `split` (236 ≤ W < 612, phones in portrait): the center panel spans the board and the two tables sit side by side under it. `arena` (W ≥ 612): away table, center panel and home table in one row. `stacked` (W < 236): center panel, then each table at full width. With `players` off the board is the center panel alone, scaled to the full width in every mode. Nothing scrolls sideways.

Away is left and home right. The followed team's 4 dp stripe is its accent color at 3:1 or more against the panel, else its alternate color, else the muted label color; the opponent's stripe is its ESPN color at 3:1 or more against the panel, else its alternate color, else `#C7D2DD`. Colors live in `arenaTokens.ts`: navy `#07264A` panel, black `#05070A` wells, amber `#FFCF4A` score, clock and points digits, white stat digits, 12 dp labels, system tabular digits.

## States

| State | Board |
|---|---|
| Not yet Live; Final | Not drawn |
| Live | Full board for the flags that are on |
| Halftime, end of a period | `HALFTIME`, `END OF Q1`, `END OF REG`; the clock as sent; bonus pills hidden |
| Overtime | `OVERTIME`, `2ND OT`; period well `OT`, `2OT` |
| Interruption while Live | Board unchanged under the amber box |
| No successful poll for 30 s | `Not updated for 30 s`, then `Not updated for N min`, under the board in the card's grey text |

## Accessibility

Three elements, the center panel and each table, each read one spoken summary with role `text`, for example "Cyclones 36, Jayhawks 9. Third quarter, 2 minutes 9 seconds left. Team fouls: Cyclones 6, Jayhawks 3. Jayhawks in the bonus. Last foul: Cyclones number 41, 4 fouls, foul trouble." Each table reads its heading, then "Number 3, <short name>, 8 points, 2 fouls." per row. A clause whose flag is off is dropped. Nothing is touchable and no live region is set. Digits do not scale with the system font size; labels grow up to 1.3 times and shrink to fit. Foul trouble, fouled out, the bonus and the followed team each have a text or shape cue besides color.

## Tests

`npm run test:scoreboards` runs the parser on 17 trimmed archived ESPN games under `tests/scoreboards/archived/` and synthetic summaries, and the layout and text modules. `npm run test:team-engine` covers the summary, schedule and merge paths on the `live-basketball` harness fixture, which `npm run test:team:android -- --team ncaa-66 --scenario live-basketball` opens on an emulator.
