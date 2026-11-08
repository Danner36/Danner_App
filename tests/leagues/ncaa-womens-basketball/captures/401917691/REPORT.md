# ESPN live capture ncaa-womens-basketball 401917691

- Adapter: `ncaa/womens-basketball`
- Event: `401917691`
- Polls: 100 (summary failures: 0)
- Committed polls: 16 (001, 010, 015, 020, 030, 032, 040, 050, 059, 060, 062, 070, 080, 090, 099, 100)
- First committed capture: 2026-11-08T21:43:21.714Z; last: 2026-11-08T23:22:21.745Z

## Keys seen across all polls

- Summary top level: `againstTheSpread`, `boxscore`, `broadcasts`, `format`, `gameInfo`, `header`, `leaders`, `meta`, `news`, `odds`, `pickcenter`, `plays`, `standings`, `videos`, `wallclockAvailable`, `winprobability`
- `header.competitions[0].status`: `displayClock`, `displayPeriod`, `period`, `type`
- `header.competitions[0].status.type`: `completed`, `description`, `detail`, `id`, `name`, `shortDetail`, `state`, `statusPrimary`, `statusSecondary`
- `header.competitions[0].competitors[]`: `fouls`, `homeAway`, `id`, `linescores`, `order`, `possession`, `record`, `score`, `team`, `timeoutsRemaining`, `timeoutsUsed`, `uid`, `winner`
- `boxscore.players[].statistics[].athletes[]`: `active`, `athlete`, `didNotPlay`, `ejected`, `starter`, `stats`
- `boxscore.players[].statistics[].athletes[].athlete`: `displayName`, `guid`, `headshot`, `id`, `jersey`, `links`, `position`, `shortName`, `uid`

## Poll 001

- Captured at: 2026-11-08T21:43:21.714Z
- Status: name `STATUS_IN_PROGRESS`, detail `5:27 - 2nd Quarter`, period `2`, clock `5:27`
- Plays: 231; substitutions (type.id 584): 76; type.text contains "Foul": 15; type.text contains "Timeout": 0
- Team `PORT`: active true 5, starter true 5, foul plays 9, timeout plays 0
- Team `MTST`: active true 5, starter true 5, foul plays 6, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (MTST): `false`
- `header.competitions[0].competitors[1].possession` (PORT): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 010

- Captured at: 2026-11-08T21:52:21.719Z
- Status: name `STATUS_IN_PROGRESS`, detail `2:31 - 2nd Quarter`, period `2`, clock `2:31`
- Plays: 275; substitutions (type.id 584): 92; type.text contains "Foul": 17; type.text contains "Timeout": 0
- Team `PORT`: active true 5, starter true 5, foul plays 9, timeout plays 0
- Team `MTST`: active true 5, starter true 5, foul plays 8, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (MTST): `false`
- `header.competitions[0].competitors[1].possession` (PORT): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 015

- Captured at: 2026-11-08T21:57:21.735Z
- Status: name `STATUS_HALFTIME`, detail `Halftime`, period `2`, clock `0:00`
- Plays: 315; substitutions (type.id 584): 106; type.text contains "Foul": 19; type.text contains "Timeout": 0
- Team `PORT`: active true 4, starter true 5, foul plays 10, timeout plays 0
- Team `MTST`: active true 5, starter true 5, foul plays 9, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (MTST): `false`
- `header.competitions[0].competitors[1].possession` (PORT): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 020

- Captured at: 2026-11-08T22:02:21.729Z
- Status: name `STATUS_HALFTIME`, detail `Halftime`, period `2`, clock `0:00`
- Plays: 315; substitutions (type.id 584): 106; type.text contains "Foul": 19; type.text contains "Timeout": 0
- Team `PORT`: active true 4, starter true 5, foul plays 10, timeout plays 0
- Team `MTST`: active true 5, starter true 5, foul plays 9, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (MTST): `false`
- `header.competitions[0].competitors[1].possession` (PORT): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 030

- Captured at: 2026-11-08T22:12:21.740Z
- Status: name `STATUS_HALFTIME`, detail `Halftime`, period `2`, clock `0:00`
- Plays: 321; substitutions (type.id 584): 112; type.text contains "Foul": 19; type.text contains "Timeout": 0
- Team `PORT`: active true 5, starter true 5, foul plays 10, timeout plays 0
- Team `MTST`: active true 5, starter true 5, foul plays 9, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (MTST): `false`
- `header.competitions[0].competitors[1].possession` (PORT): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 032

- Captured at: 2026-11-08T22:14:21.753Z
- Status: name `STATUS_IN_PROGRESS`, detail `9:46 - 3rd Quarter`, period `3`, clock `9:46`
- Plays: 326; substitutions (type.id 584): 112; type.text contains "Foul": 21; type.text contains "Timeout": 0
- Team `PORT`: active true 5, starter true 5, foul plays 11, timeout plays 0
- Team `MTST`: active true 5, starter true 5, foul plays 10, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (MTST): `false`
- `header.competitions[0].competitors[1].possession` (PORT): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 040

- Captured at: 2026-11-08T22:22:21.753Z
- Status: name `STATUS_IN_PROGRESS`, detail `6:49 - 3rd Quarter`, period `3`, clock `6:49`
- Plays: 352; substitutions (type.id 584): 118; type.text contains "Foul": 22; type.text contains "Timeout": 0
- Team `PORT`: active true 4, starter true 5, foul plays 12, timeout plays 0
- Team `MTST`: active true 5, starter true 5, foul plays 10, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (MTST): `false`
- `header.competitions[0].competitors[1].possession` (PORT): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 050

- Captured at: 2026-11-08T22:32:21.753Z
- Status: name `STATUS_IN_PROGRESS`, detail `4:15 - 3rd Quarter`, period `3`, clock `4:15`
- Plays: 410; substitutions (type.id 584): 140; type.text contains "Foul": 27; type.text contains "Timeout": 0
- Team `PORT`: active true 5, starter true 5, foul plays 15, timeout plays 0
- Team `MTST`: active true 5, starter true 5, foul plays 12, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (MTST): `false`
- `header.competitions[0].competitors[1].possession` (PORT): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 059

- Captured at: 2026-11-08T22:41:21.754Z
- Status: name `STATUS_END_PERIOD`, detail `End of 3rd Quarter`, period `3`, clock `0:00`
- Plays: 467; substitutions (type.id 584): 154; type.text contains "Foul": 32; type.text contains "Timeout": 0
- Team `PORT`: active true 5, starter true 5, foul plays 17, timeout plays 0
- Team `MTST`: active true 5, starter true 5, foul plays 15, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (MTST): `false`
- `header.competitions[0].competitors[1].possession` (PORT): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 060

- Captured at: 2026-11-08T22:42:21.745Z
- Status: name `STATUS_END_PERIOD`, detail `End of 3rd Quarter`, period `3`, clock `0:00`
- Plays: 467; substitutions (type.id 584): 154; type.text contains "Foul": 32; type.text contains "Timeout": 0
- Team `PORT`: active true 5, starter true 5, foul plays 17, timeout plays 0
- Team `MTST`: active true 5, starter true 5, foul plays 15, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (MTST): `false`
- `header.competitions[0].competitors[1].possession` (PORT): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 062

- Captured at: 2026-11-08T22:44:21.753Z
- Status: name `STATUS_IN_PROGRESS`, detail `9:45 - 4th Quarter`, period `4`, clock `9:45`
- Plays: 473; substitutions (type.id 584): 160; type.text contains "Foul": 32; type.text contains "Timeout": 0
- Team `PORT`: active true 5, starter true 5, foul plays 17, timeout plays 0
- Team `MTST`: active true 5, starter true 5, foul plays 15, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (MTST): `false`
- `header.competitions[0].competitors[1].possession` (PORT): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 070

- Captured at: 2026-11-08T22:52:21.753Z
- Status: name `STATUS_IN_PROGRESS`, detail `8:07 - 4th Quarter`, period `4`, clock `8:07`
- Plays: 503; substitutions (type.id 584): 170; type.text contains "Foul": 36; type.text contains "Timeout": 0
- Team `PORT`: active true 5, starter true 5, foul plays 18, timeout plays 0
- Team `MTST`: active true 5, starter true 5, foul plays 18, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (MTST): `false`
- `header.competitions[0].competitors[1].possession` (PORT): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 080

- Captured at: 2026-11-08T23:02:21.748Z
- Status: name `STATUS_IN_PROGRESS`, detail `4:54 - 4th Quarter`, period `4`, clock `4:54`
- Plays: 563; substitutions (type.id 584): 190; type.text contains "Foul": 44; type.text contains "Timeout": 0
- Team `PORT`: active true 5, starter true 5, foul plays 21, timeout plays 0
- Team `MTST`: active true 5, starter true 5, foul plays 23, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (MTST): `false`
- `header.competitions[0].competitors[1].possession` (PORT): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 090

- Captured at: 2026-11-08T23:12:21.727Z
- Status: name `STATUS_IN_PROGRESS`, detail `1:56 - 4th Quarter`, period `4`, clock `1:56`
- Plays: 613; substitutions (type.id 584): 202; type.text contains "Foul": 50; type.text contains "Timeout": 0
- Team `PORT`: active true 4, starter true 5, foul plays 25, timeout plays 0
- Team `MTST`: active true 5, starter true 5, foul plays 25, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (MTST): `false`
- `header.competitions[0].competitors[1].possession` (PORT): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 099

- Captured at: 2026-11-08T23:21:21.754Z
- Status: name `STATUS_END_PERIOD`, detail `End of 4th Quarter`, period `4`, clock `0:00`
- Plays: 636; substitutions (type.id 584): 204; type.text contains "Foul": 52; type.text contains "Timeout": 0
- Team `PORT`: active true 4, starter true 5, foul plays 26, timeout plays 0
- Team `MTST`: active true 5, starter true 5, foul plays 26, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (MTST): `false`
- `header.competitions[0].competitors[1].possession` (PORT): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 100

- Captured at: 2026-11-08T23:22:21.745Z
- Status: name `STATUS_FINAL`, detail `Final`, period (none), clock (none)
- Plays: 637; substitutions (type.id 584): 204; type.text contains "Foul": 52; type.text contains "Timeout": 0
- Team `PORT`: active true 4, starter true 5, foul plays 26, timeout plays 0
- Team `MTST`: active true 5, starter true 5, foul plays 26, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (MTST): `false`
- `header.competitions[0].competitors[1].possession` (PORT): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
