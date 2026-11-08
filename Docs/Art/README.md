# Art

## Current interface

- Warm app background: `#F7F7F2`
- Primary Danner green: `#1F6F55`
- Heading navy: `#15354A`
- Logo-only main menu with the Danner script logo centered one-third down the usable screen, 210dp unless height requires 180, 150, or 120dp
- Tile grid: the selected teams, then YouTube TV, then `+`. Columns are the rounded-up square root of the tile count, at least 2. Tiles are 101.2dp at most with gaps of 28/101.2 of the tile, rows fill from the left, and the block is centered on the two-thirds line. The grid scrolls rather than go below 64dp, and landscape puts the logo in the left 35%. The values live in `app/hub/hubGrid.ts`
- Tiles keep a 2dp `#A9CEBB` border, radius 14, and the soft shadow. Every team shows its downloaded ESPN PNG contained with 12% padding on white, else its abbreviation in bold on the accent color, in white or black by contrast
- The `+` tile is white with a `#1F6F55` glyph
- No tile titles or descriptions
- White cards with an emphasized green border around the current step
- Large body copy, 58dp minimum primary actions, numbered step markers, and a four-part progress bar
- Maximum 720dp content column for readable phone and tablet layouts
- Destination summaries use the nearest city and state; coordinates are not shown
- Offline map uses pale land and water, navy place labels, gold major roads, a fixed green pin, large zoom controls, and an offline city search
- Completion, retry, and validation states use text in addition to color

Only the current step exposes its primary action. Step 3 contains no explanatory or technical status copy. A completed step changes appearance, each transition automatically scrolls the next highlighted card into view, and activating YouTube's `Next` control automatically returns to step 4. The app hub anchors the Danner logo at one-third screen height and its tile grid at two-thirds screen height.

A team screen uses the team's accent color, a prominent today/live/recap card, a large countdown, a compact record under the title (one per sport for a school, with a sport name on the featured card and schedule rows), and one scroll containing the remaining schedule. A live board appears only while a game is live: the park-style baseball board, the football board, or the basketball arena board. A completed today game reuses the featured card with a `WIN`, `LOSS`, or `TIE` badge and the final score. The arena board keeps the navy `#07264A` panel, black `#05070A` wells, and amber `#FFCF4A` system tabular digits with no glow or animation, uses 12dp labels, and marks the followed team with a 4dp stripe in its accent color instead of colored text; the opponent's stripe is its ESPN color when it reaches 3:1 against the panel, else its alternate color, else `#C7D2DD`. Foul trouble inverts the fouls cell to amber with a black digit, and a fouled-out player gets a red `#B20D27` cell with a white digit, a struck jersey, and dimmed digits. The tokens live in `app/scoreboards/basketball/arenaTokens.ts`. Direct sources expose a 68dp Listen control beside Play; it turns into a stop control while audio is playing. Delayed, postponed, suspended, and canceled states use amber plus direct text. The win chance bar sits under the matchup line: a 12dp letter-spaced `WIN CHANCE` label, `Us` and `Them` percentages in 17dp bold navy, and an 8dp bar with the team's share in navy `#0B2B4C` on a `#D7DEE5` track. The first schedule row shows the same bar when no game is featured. Controls and status text do not rely on color alone. A team's accent is the preset color (Guardians and Patriots `#E31937`, Cyclones `#AE192D`), else the catalog color when its contrast with white is at least 3:1, else the alternate color when it passes, else `#1F6F55`.

## Media

- `media/ic_launcher_danner.jpg` is the canonical 1079 by 1079 Danner green and white launcher image.
- `app/assets/youtube-tv-logo-vecteezy.jpg` is the requested [YouTube TV artwork by Sagor Roy on Vecteezy](https://www.vecteezy.com/vector-art/72969349-youtube-tv-logo-icon-high-resolution). Its source page marks the asset as attribution-required and editorial-use-only.

The Danner image is copied into `app/assets/` for Android and iOS launcher and splash builds. Bundled art is only the Danner logo and the YouTube TV logo. Every team's mark is an ESPN PNG from the catalog, downloaded once to the phone. The legacy APK's visual inventory is isolated in [../../reference/Apk_Inventory.md](../../reference/Apk_Inventory.md) and is not part of the current interface specification.
