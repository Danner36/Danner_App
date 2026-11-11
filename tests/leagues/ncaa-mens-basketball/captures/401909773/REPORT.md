# ESPN live capture ncaa-mens-basketball 401909773

- Adapter: `ncaa/mens-basketball`
- Event: `401909773`
- Polls: 99 (summary failures: 0)
- Committed polls: 13 (001, 010, 020, 030, 035, 040, 050, 051, 060, 070, 080, 090, 099)
- First committed capture: 2026-11-11T01:19:11.094Z; last: 2026-11-11T02:57:11.107Z

## Keys seen across all polls

- Summary top level: `againstTheSpread`, `boxscore`, `broadcasts`, `format`, `gameInfo`, `header`, `leaders`, `meta`, `news`, `odds`, `pickcenter`, `plays`, `standings`, `videos`, `wallclockAvailable`, `winprobability`
- `header.competitions[0].status`: `displayClock`, `displayPeriod`, `period`, `type`
- `header.competitions[0].status.type`: `completed`, `description`, `detail`, `id`, `name`, `shortDetail`, `state`, `statusPrimary`, `statusSecondary`
- `header.competitions[0].competitors[]`: `fouls`, `homeAway`, `id`, `linescores`, `order`, `possession`, `record`, `score`, `team`, `timeoutsRemaining`, `timeoutsUsed`, `uid`, `winner`
- `boxscore.players[].statistics[].athletes[]`: `active`, `athlete`, `didNotPlay`, `ejected`, `starter`, `stats`
- `boxscore.players[].statistics[].athletes[].athlete`: `displayName`, `guid`, `headshot`, `id`, `jersey`, `links`, `position`, `shortName`, `uid`

## Poll 001

- Captured at: 2026-11-11T01:19:11.094Z
- Status: name `STATUS_IN_PROGRESS`, detail `12:35 - 1st Half`, period `1`, clock `12:35`
- Plays: 98; substitutions (type.id 584): 28; type.text contains "Foul": 6; type.text contains "Timeout": 0
- Team `SOU`: active true 5, starter true 5, foul plays 3, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 3, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (SOU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`

## Poll 010

- Captured at: 2026-11-11T01:28:11.098Z
- Status: name `STATUS_IN_PROGRESS`, detail `8:53 - 1st Half`, period `1`, clock `8:53`
- Plays: 139; substitutions (type.id 584): 44; type.text contains "Foul": 8; type.text contains "Timeout": 0
- Team `SOU`: active true 5, starter true 5, foul plays 3, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 5, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (SOU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`

## Poll 020

- Captured at: 2026-11-11T01:38:11.134Z
- Status: name `STATUS_IN_PROGRESS`, detail `4:40 - 1st Half`, period `1`, clock `4:40`
- Plays: 196; substitutions (type.id 584): 66; type.text contains "Foul": 11; type.text contains "Timeout": 0
- Team `SOU`: active true 5, starter true 5, foul plays 6, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 5, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (SOU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`

## Poll 030

- Captured at: 2026-11-11T01:48:11.126Z
- Status: name `STATUS_IN_PROGRESS`, detail `2:36 - 1st Half`, period `1`, clock `2:36`
- Plays: 247; substitutions (type.id 584): 81; type.text contains "Foul": 16; type.text contains "Timeout": 0
- Team `SOU`: active true 4, starter true 5, foul plays 8, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 8, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (SOU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`

## Poll 035

- Captured at: 2026-11-11T01:53:11.122Z
- Status: name `STATUS_HALFTIME`, detail `Halftime`, period `1`, clock `0:00`
- Plays: 282; substitutions (type.id 584): 92; type.text contains "Foul": 18; type.text contains "Timeout": 0
- Team `SOU`: active true 5, starter true 5, foul plays 10, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 8, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (SOU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`

## Poll 040

- Captured at: 2026-11-11T01:58:11.127Z
- Status: name `STATUS_HALFTIME`, detail `Halftime`, period `1`, clock `0:00`
- Plays: 282; substitutions (type.id 584): 92; type.text contains "Foul": 18; type.text contains "Timeout": 0
- Team `SOU`: active true 5, starter true 5, foul plays 10, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 8, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (SOU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`

## Poll 050

- Captured at: 2026-11-11T02:08:11.133Z
- Status: name `STATUS_HALFTIME`, detail `Halftime`, period `1`, clock `0:00`
- Plays: 294; substitutions (type.id 584): 104; type.text contains "Foul": 18; type.text contains "Timeout": 0
- Team `SOU`: active true 5, starter true 5, foul plays 10, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 8, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (SOU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`

## Poll 051

- Captured at: 2026-11-11T02:09:11.127Z
- Status: name `STATUS_IN_PROGRESS`, detail `19:13 - 2nd Half`, period `2`, clock `19:13`
- Plays: 298; substitutions (type.id 584): 104; type.text contains "Foul": 18; type.text contains "Timeout": 0
- Team `SOU`: active true 5, starter true 5, foul plays 10, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 8, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (SOU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`

## Poll 060

- Captured at: 2026-11-11T02:18:11.126Z
- Status: name `STATUS_IN_PROGRESS`, detail `14:43 - 2nd Half`, period `2`, clock `14:43`
- Plays: 343; substitutions (type.id 584): 116; type.text contains "Foul": 21; type.text contains "Timeout": 0
- Team `SOU`: active true 5, starter true 5, foul plays 11, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 10, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (SOU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`

## Poll 070

- Captured at: 2026-11-11T02:28:11.134Z
- Status: name `STATUS_IN_PROGRESS`, detail `11:43 - 2nd Half`, period `2`, clock `11:43`
- Plays: 389; substitutions (type.id 584): 134; type.text contains "Foul": 23; type.text contains "Timeout": 0
- Team `SOU`: active true 5, starter true 5, foul plays 12, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 11, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (SOU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`

## Poll 080

- Captured at: 2026-11-11T02:38:11.110Z
- Status: name `STATUS_IN_PROGRESS`, detail `7:55 - 2nd Half`, period `2`, clock `7:55`
- Plays: 431; substitutions (type.id 584): 148; type.text contains "Foul": 28; type.text contains "Timeout": 0
- Team `SOU`: active true 5, starter true 5, foul plays 15, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 13, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (SOU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`

## Poll 090

- Captured at: 2026-11-11T02:48:11.134Z
- Status: name `STATUS_IN_PROGRESS`, detail `3:50 - 2nd Half`, period `2`, clock `3:50`
- Plays: 479; substitutions (type.id 584): 160; type.text contains "Foul": 33; type.text contains "Timeout": 0
- Team `SOU`: active true 5, starter true 5, foul plays 20, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 13, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (SOU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`

## Poll 099

- Captured at: 2026-11-11T02:57:11.107Z
- Status: name `STATUS_FINAL`, detail `Final`, period (none), clock (none)
- Plays: 546; substitutions (type.id 584): 180; type.text contains "Foul": 36; type.text contains "Timeout": 0
- Team `SOU`: active true 5, starter true 5, foul plays 20, timeout plays 0
- Team `ISU`: active true 5, starter true 5, foul plays 16, timeout plays 0
- `header.competitions[0].timeoutsAvailable`: `false`
- `header.competitions[0].possessionArrowAvailable`: `false`
- `header.competitions[0].competitors[0].possession` (ISU): `false`
- `header.competitions[0].competitors[1].possession` (SOU): `false`

Top-level `timeouts`: absent

Core situation: HTTP `200`; top-level keys: `$ref`, `awayFouls`, `awayTimeouts`, `homeFouls`, `homeTimeouts`, `lastPlay`

- `homeTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `awayTimeouts`: `{"timeoutsCurrent":0,"timeoutsRemainingCurrent":0}`
- `homeFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
- `awayFouls`: `{"teamFouls":0,"teamFoulsCurrent":0,"foulsToGive":0,"bonusState":"NONE"}`
