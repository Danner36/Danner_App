# team

The one team screen. `TeamScreen.tsx` takes a tile (`app/selection/types.ts`) and shows its record, featured cards, schedule, Play, Listen, Get video, Cast and TV send. A pro tile uses one adapter; a school tile uses one per sport.

- `FeaturedGameCard.tsx` holds the card and `FeaturedGameSlot`, which owns each card's countdown, five-second poll, streams and Get video session.
- `GameScoreHeader.tsx` is the top of every card: status, clock, both teams and the win chance. `engine/scoreHeader.ts` builds its text, and each sport's board below the video controls holds only detail.
- `HeroRecords.tsx`, `ScheduleList.tsx`, `WinChanceBar.tsx` and `useWinChance.ts` are its pieces, and the hero uses `app/logos/TeamLogo.tsx`. `theme.ts` holds the accent and board-label rules.
- `engine/` is pure: the featured pick, dates, records, postseason status, video window, live merge, stream match and snapshot assembly. It imports siblings with explicit `.ts` extensions and has no runtime React Native import; `tests/imports` loads every module under plain Node.

Behavior is defined in [TeamScreen.md](../../Docs/Domain/TeamScreen.md).
