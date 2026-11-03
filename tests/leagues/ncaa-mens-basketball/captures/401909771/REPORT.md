# ESPN live capture ncaa-mens-basketball 401909771

- Adapter: `ncaa/mens-basketball`
- Event: `401909771`
- Polls: 21 (summary failures: 0)
- Committed polls: 5 (001, 010, 019, 020, 021)
- First committed capture: 2026-11-03T02:11:42.337Z; last: 2026-11-03T02:31:42.365Z

## Keys seen across all polls

- Summary top level: `againstTheSpread`, `boxscore`, `broadcasts`, `format`, `gameInfo`, `header`, `leaders`, `meta`, `news`, `odds`, `pickcenter`, `plays`, `standings`, `videos`, `wallclockAvailable`, `winprobability`
- `header.competitions[0].status`: `displayClock`, `displayPeriod`, `period`, `type`
- `header.competitions[0].status.type`: `completed`, `description`, `detail`, `id`, `name`, `shortDetail`, `state`, `statusPrimary`, `statusSecondary`
- `header.competitions[0].competitors[]`: `fouls`, `homeAway`, `id`, `linescores`, `order`, `possession`, `rank`, `record`, `score`, `team`, `timeoutsRemaining`, `timeoutsUsed`, `uid`, `winner`
- `boxscore.players[].statistics[].athletes[]`: `active`, `athlete`, `didNotPlay`, `ejected`, `starter`, `stats`
- `boxscore.players[].statistics[].athletes[].athlete`: `displayName`, `guid`, `headshot`, `id`, `jersey`, `links`, `position`, `shortName`, `uid`

## Poll 001

- Captured at: 2026-11-03T02:11:42.337Z
- Status: name `STATUS_IN_PROGRESS`, detail `3:36 - 2nd Half`, period `2`, clock `3:36`
- Plays: 487; substitutions (type.id 584): 156; type.text contains "Foul": 43; type.text contains "Timeout": 0
- Team `MEM`: active true 5, starter true 5, foul plays 25, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 18, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (MEM): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`

## Poll 010

- Captured at: 2026-11-03T02:20:42.352Z
- Status: name `STATUS_IN_PROGRESS`, detail `1:35 - 2nd Half`, period `2`, clock `1:35`
- Plays: 527; substitutions (type.id 584): 176; type.text contains "Foul": 46; type.text contains "Timeout": 0
- Team `MEM`: active true 5, starter true 5, foul plays 27, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 19, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (MEM): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`

## Poll 019

- Captured at: 2026-11-03T02:29:42.374Z
- Status: name `STATUS_END_PERIOD`, detail `End of 2nd Half`, period `2`, clock `0:00`
- Plays: 565; substitutions (type.id 584): 192; type.text contains "Foul": 50; type.text contains "Timeout": 0
- Team `MEM`: active true 5, starter true 5, foul plays 29, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 21, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (MEM): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`

## Poll 020

- Captured at: 2026-11-03T02:30:42.363Z
- Status: name `STATUS_END_PERIOD`, detail `End of 2nd Half`, period `2`, clock `0:00`
- Plays: 565; substitutions (type.id 584): 192; type.text contains "Foul": 50; type.text contains "Timeout": 0
- Team `MEM`: active true 5, starter true 5, foul plays 29, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 21, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (MEM): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`

## Poll 021

- Captured at: 2026-11-03T02:31:42.365Z
- Status: name `STATUS_FINAL`, detail `Final`, period (none), clock (none)
- Plays: 565; substitutions (type.id 584): 192; type.text contains "Foul": 50; type.text contains "Timeout": 0
- Team `MEM`: active true 5, starter true 5, foul plays 29, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 21, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (MEM): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
