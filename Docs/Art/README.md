# Art

## Current interface

- Warm app background: `#F7F7F2`
- Primary Danner green: `#1F6F55`
- Heading navy: `#15354A`
- Logo-only main menu with the 210dp Danner script logo centered one-third down the usable screen
- Two 101.2dp image tiles with a 28dp gap centered in a row two-thirds down the usable screen
- Active Cleveland Guardians logo tile on the left
- Active, rightmost YouTube TV artwork tile with no title or description
- White cards with an emphasized green border around the current step
- Large body copy, 58dp minimum primary actions, numbered step markers, and a four-part progress bar
- Maximum 720dp content column for readable phone and tablet layouts
- Destination summaries use the nearest city and state; coordinates are not shown
- Offline map uses pale land and water, navy place labels, gold major roads, a fixed green pin, large zoom controls, and an offline city search
- Completion, retry, and validation states use text in addition to color

Only the current step exposes its primary action. Step 3 contains no explanatory or technical status copy. A completed step changes appearance, each transition automatically scrolls the next highlighted card into view, and activating YouTube's `Next` control automatically returns to step 4. The app hub anchors the Danner logo at one-third screen height and its compact module row at two-thirds screen height.

The Guardians dashboard uses its navy and red palette, a prominent today/live card, a large countdown, a high-contrast season-record card, and one scroll containing the remaining schedule. Delayed, postponed, suspended, and canceled states use amber plus direct text. Controls and status text do not rely on color alone.

## Media

- `media/ic_launcher_danner.jpg` is the canonical 1079 by 1079 Danner green and white launcher image.
- `app/assets/youtube-tv-logo-vecteezy.jpg` is the requested [YouTube TV artwork by Sagor Roy on Vecteezy](https://www.vecteezy.com/vector-art/72969349-youtube-tv-logo-icon-high-resolution). Its source page marks the asset as attribution-required and editorial-use-only.
- `app/assets/cleveland-guardians-logo.jpg` is the requested winged-baseball mark sourced from the [official Cleveland Guardians page](https://www.mlb.com/guardians/fans/cleteamname).

The Danner image is copied into `app/assets/` for Android and iOS launcher and splash builds. Both sub-app marks are packaged locally and do not require menu-time network access. The legacy APK's visual inventory is isolated in [../../reference/Apk_Inventory.md](../../reference/Apk_Inventory.md) and is not part of the current interface specification.
