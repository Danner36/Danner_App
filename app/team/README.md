# team

The one team screen. `TeamScreen.tsx` takes a tile (`app/selection/types.ts`) and shows its record, featured cards, schedule, Play, Listen, Get video, Cast and TV send. A pro tile uses one adapter; a school tile uses one per sport.

- `FeaturedGameCard.tsx` holds the card and `FeaturedGameSlot`, which owns each card's countdown, five-second poll, streams and Get video session.
- `HeroRecords.tsx`, `ScheduleList.tsx`, `WinChanceBar.tsx`, `useWinChance.ts` and `heroLogo.ts` are its pieces. `theme.ts` holds the accent and board-label rules.
- `engine/` is pure: the featured pick, dates, records, postseason status, video window, live merge, stream match and snapshot assembly. It imports siblings with explicit `.ts` extensions and has no runtime React Native import; `tests/imports` loads every module under plain Node.

Behavior is defined in [TeamScreen.md](../../Docs/Domain/TeamScreen.md).
