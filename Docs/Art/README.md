# Art

## Current interface

- Warm app background: `#F7F7F2`
- Primary Danner green: `#1F6F55`
- Heading navy: `#15354A`
- Logo-only main menu with the 210dp Danner script logo centered one-third down the usable screen
- Two-row 2×2 grid of 101.2dp image tiles with 28dp gaps, centered so the cluster sits on the two-thirds line
- Row 1: Cleveland Guardians then New England Patriots
- Row 2: Iowa State Cyclones under Guardians, then YouTube TV under Patriots
- No tile titles or descriptions
- White cards with an emphasized green border around the current step
- Large body copy, 58dp minimum primary actions, numbered step markers, and a four-part progress bar
- Maximum 720dp content column for readable phone and tablet layouts
- Destination summaries use the nearest city and state; coordinates are not shown
- Offline map uses pale land and water, navy place labels, gold major roads, a fixed green pin, large zoom controls, and an offline city search
- Completion, retry, and validation states use text in addition to color

Only the current step exposes its primary action. Step 3 contains no explanatory or technical status copy. A completed step changes appearance, each transition automatically scrolls the next highlighted card into view, and activating YouTube's `Next` control automatically returns to step 4. The app hub anchors the Danner logo at one-third screen height and its two-row tile grid at two-thirds screen height.

The Guardians dashboard uses its navy and red palette, a prominent today/live/recap card, a large countdown, a compact season record under the Guardians title, and one scroll containing the remaining schedule. The park-style scoreboard appears only while a game is live. A completed today game reuses the featured card with a `WIN`, `LOSS`, or `TIE` badge, the final score, and optional pitcher decisions. The Patriots dashboard follows the same card layout with a football scoreboard while live and a regular-season W–L or W–L–T under the Patriots title. The Cyclones dashboard follows that card layout with three compact records, a sport name on the featured card and schedule rows, a football board or basketball halves/quarters while live, and cardinal `#AE192D` accents. Direct sources expose a 68dp Listen control beside Play; it turns into a stop control while audio is playing. Delayed, postponed, suspended, and canceled states use amber plus direct text. Controls and status text do not rely on color alone.

## Media

- `media/ic_launcher_danner.jpg` is the canonical 1079 by 1079 Danner green and white launcher image.
- `app/assets/youtube-tv-logo-vecteezy.jpg` is the requested [YouTube TV artwork by Sagor Roy on Vecteezy](https://www.vecteezy.com/vector-art/72969349-youtube-tv-logo-icon-high-resolution). Its source page marks the asset as attribution-required and editorial-use-only.
- `app/assets/cleveland-guardians-logo.jpg` is the requested winged-baseball mark sourced from the [official Cleveland Guardians page](https://www.mlb.com/guardians/fans/cleteamname).
- `app/assets/new-england-patriots-logo.jpg` is the bundled Flying Elvis mark on the owner-supplied Patriots navy field (`#091932`).
- `app/assets/iowa-state-cyclones-logo.jpg` is the bundled Iowa State mark from ESPN NCAA team 66 artwork.

The Danner image is copied into `app/assets/` for Android and iOS launcher and splash builds. Both sub-app marks are packaged locally and do not require menu-time network access. The legacy APK's visual inventory is isolated in [../../reference/Apk_Inventory.md](../../reference/Apk_Inventory.md) and is not part of the current interface specification.
