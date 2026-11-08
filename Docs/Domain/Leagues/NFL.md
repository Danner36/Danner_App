Status: ACTIVE
Phase: MVP

# NFL adapter

The `nfl` adapter reads ESPN's public site JSON (`football/nfl`). New England Patriots (`nfl-17`) is the worked example.

## Schedule and record

The adapter requests preseason, regular-season, and playoff lists (`seasontype` 1, 2, 3) for the team. January and February load the previous season year. The season type of a game is the list that returned it, not the event's own field.

The hero record is regular-season W–L, or W–L–T when ties exist. It stays `0–0` until a regular-season game is Final. A Final whose score does not parse stays out of the record. Bye weeks have no row.

Official dates are the America/New_York calendar date of kickoff. They only label which day a hand-written streams entry belongs to and are never displayed. A game without a kickoff time is an all-day game on that date and shows `Time TBA`.

## Live board

A live featured game shows the football board: quarters, total, clock, down and distance, possession. It refreshes from the ESPN summary every five seconds. The same poll runs from the scheduled kickoff until ESPN reports the game started.

## Streams

The streams file is `streams/nfl/<espnId>.json`.
