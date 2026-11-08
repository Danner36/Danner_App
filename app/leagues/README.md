# leagues

League adapters behind one `LeagueAdapter` shape (`types.ts`), found by key in `registry.ts`. Every module is pure: no runtime React Native import, siblings imported with explicit `.ts` extensions.

- `espn/` is one ESPN implementation driven by the rows in `rows.ts`, which `tests/leagues` holds equal to `scripts/team-catalog/leagues.mjs`. It also holds the basketball board parser `basketballBoard.ts` and the capability flags and foul rules in `basketballRules.ts`; `scripts/team-catalog/board-flags.mjs` reads both at these paths.
- `mlb/` is the statsapi adapter. ESPN serves MLB only for win chance.
- `sports.ts` holds the college sport order and labels.

Adapter rules are in `Docs/Domain/Leagues/`.
