# hub

Logo-only Danner Apps menu, its tiles and tile actions, the iPhone signing-expiration warning, and the GitHub-release update prompt. Tiles, the grid, the picker, and seeding are defined in [Hub.md](../../Docs/Domain/Hub.md).

## Behavior

- `hubGrid.ts` is the pure layout: it takes the container size and tile count and returns the logo, the grid block, and the scroll frame when the grid scrolls. `HubTile.tsx` is one tile, and `TileActionsSheet.tsx` is the long-press sheet, a React Native `Modal` because Android `Alert` allows only three buttons.
- On SideStore-signed iPhones, reads the real provisioning-profile expiration through `modules/danner-provisioning-profile/` and shows a two-line warning above the Danner mark only during the final 48 hours, and the grid reserves room for it. The warning directs the parent to connect to Wi-Fi and charge the phone.
- Reads the profile at launch and whenever the app becomes active. A one-minute timer only advances the displayed remaining time.
- When a baked release version is present and GitHub's latest `version-manifest.json` is newer, the hub asks Yes or No. It checks on mount and when the app becomes active, not when download state changes. The prompt is not shown while the hub is off-screen, while the tile actions or a confirmation is open, or while the signing-health text is visible; the warning is recomputed after the manifest fetch. Android Yes installs the APK through `modules/danner-app-update/` and shows a small spinner, labelled `Downloading update`, under the tiles instead of text. Once the system installer opens, finishes, or is cancelled, the prompt stays dismissed for the session, and an install error alert is not replaced by a new prompt. A hub that returns mid-download follows the same install. iPhone Yes opens SideStore with the IPA URL.
- The warning's remaining time rounds down: `Expires in 1 day` at 25 hours, then hours below 24.
- `releaseVersion.js` is the one release-tag parser shared by `app.config.js`, `appUpdate.ts`, and `release/build-update-assets.mjs`: `vMAJOR.MINOR.PATCH`, digits only, minor and patch 0–99.
