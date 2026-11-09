# ESPN live capture ncaa-womens-basketball 401916017

- Adapter: `ncaa/womens-basketball`
- Event: `401916017`
- Polls: 16 (summary failures: 0)
- Committed polls: 4 (001, 010, 013, 016)
- First committed capture: 2026-11-09T00:14:16.252Z; last: 2026-11-09T00:29:16.292Z

## Keys seen across all polls

- Summary top level: `againstTheSpread`, `boxscore`, `broadcasts`, `format`, `gameInfo`, `header`, `leaders`, `meta`, `news`, `odds`, `pickcenter`, `plays`, `standings`, `videos`, `wallclockAvailable`, `winprobability`
- `header.competitions[0].status`: `displayClock`, `displayPeriod`, `period`, `type`
- `header.competitions[0].status.type`: `completed`, `description`, `detail`, `id`, `name`, `shortDetail`, `state`, `statusPrimary`, `statusSecondary`
- `header.competitions[0].competitors[]`: `fouls`, `homeAway`, `id`, `linescores`, `order`, `possession`, `record`, `score`, `team`, `timeoutsRemaining`, `timeoutsUsed`, `uid`
- `boxscore.players[].statistics[].athletes[]`: `active`, `athlete`, `didNotPlay`, `ejected`, `starter`, `stats`
- `boxscore.players[].statistics[].athletes[].athlete`: `displayName`, `guid`, `headshot`, `id`, `jersey`, `links`, `position`, `shortName`, `uid`

## Poll 001

- Captured at: 2026-11-09T00:14:16.252Z
- Status: name `STATUS_IN_PROGRESS`, detail `5:20 - 3rd Quarter`, period `3`, clock `5:20`
- Plays: 275; substitutions (type.id 584): 78; type.text contains "Foul": 18; type.text contains "Timeout": 0
- Team `JMU`: active true 5, starter true 5, foul plays 11, timeout plays 0
- Team `VT`: active true 5, starter true 5, foul plays 7, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (VT): `false`
- `header.competitions[0].competitors[1].possession` (JMU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 010

- Captured at: 2026-11-09T00:23:16.280Z
- Status: name `STATUS_IN_PROGRESS`, detail `1:44 - 3rd Quarter`, period `3`, clock `1:44`
- Plays: 312; substitutions (type.id 584): 86; type.text contains "Foul": 21; type.text contains "Timeout": 0
- Team `JMU`: active true 5, starter true 5, foul plays 12, timeout plays 0
- Team `VT`: active true 5, starter true 5, foul plays 9, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (VT): `false`
- `header.competitions[0].competitors[1].possession` (JMU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 013

- Captured at: 2026-11-09T00:26:16.293Z
- Status: name `STATUS_END_PERIOD`, detail `End of 3rd Quarter`, period `3`, clock `0:00`
- Plays: 332; substitutions (type.id 584): 92; type.text contains "Foul": 22; type.text contains "Timeout": 0
- Team `JMU`: active true 5, starter true 5, foul plays 12, timeout plays 0
- Team `VT`: active true 5, starter true 5, foul plays 10, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (VT): `false`
- `header.competitions[0].competitors[1].possession` (JMU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`

## Poll 016

- Captured at: 2026-11-09T00:29:16.292Z
- Status: name `STATUS_END_PERIOD`, detail `End of 3rd Quarter`, period `3`, clock `0:00`
- Plays: 332; substitutions (type.id 584): 92; type.text contains "Foul": 22; type.text contains "Timeout": 0
- Team `JMU`: active true 5, starter true 5, foul plays 12, timeout plays 0
- Team `VT`: active true 5, starter true 5, foul plays 10, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (VT): `false`
- `header.competitions[0].competitors[1].possession` (JMU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
