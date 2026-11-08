# ESPN live capture ncaa-womens-basketball 401917928

- Adapter: `ncaa/womens-basketball`
- Event: `401917928`
- Polls: 1 (summary failures: 0)
- Committed polls: 1 (001)
- First committed capture: 2026-11-08T23:05:43.698Z; last: 2026-11-08T23:05:43.698Z

## Keys seen across all polls

- Summary top level: `againstTheSpread`, `boxscore`, `broadcasts`, `format`, `gameInfo`, `header`, `leaders`, `meta`, `news`, `odds`, `pickcenter`, `plays`, `standings`, `videos`, `wallclockAvailable`, `winprobability`
- `header.competitions[0].status`: `type`
- `header.competitions[0].status.type`: `completed`, `description`, `detail`, `id`, `name`, `shortDetail`, `state`
- `header.competitions[0].competitors[]`: `homeAway`, `id`, `linescores`, `order`, `possession`, `record`, `score`, `team`, `uid`, `winner`
- `boxscore.players[].statistics[].athletes[]`: `active`, `athlete`, `didNotPlay`, `ejected`, `starter`, `stats`
- `boxscore.players[].statistics[].athletes[].athlete`: `displayName`, `guid`, `headshot`, `id`, `jersey`, `links`, `position`, `shortName`, `uid`

## Poll 001

- Captured at: 2026-11-08T23:05:43.698Z
- Status: name `STATUS_FINAL`, detail `Final`, period (none), clock (none)
- Plays: 413; substitutions (type.id 584): 126; type.text contains "Foul": 32; type.text contains "Timeout": 0
- Team `EIU`: active true 5, starter true 5, foul plays 23, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 9, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (EIU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"DOUBLE"}`
