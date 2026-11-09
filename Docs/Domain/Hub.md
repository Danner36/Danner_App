Status: ACTIVE
Phase: MVP

# Hub

The hub, the team picker, what the phone stores, and how an upgrading phone gets its teams.

## Tiles

The hub is logo-only. Tiles are the selected teams in stored order, then any custom module, then `+`. YouTube TV, labelled `TV Location`, is the only custom module.

| Phone | Hub |
|---|---|
| First install, reinstall, new phone | `+` |
| Upgraded from `v1.x` and seeded | Guardians, Patriots, Cyclones, TV Location, `+` |

A team tile shows the team's ESPN logo, contained on light sage (`#DDEAE3`) with 12% padding, from the file `app/logos/logoStore.ts` cached on the phone, else the abbreviation in bold on the team's accent color. Every logo URL comes from the catalog. Its label is the team's full name. `+` is labelled `Add team`.

A long press opens the tile actions: `Move to front`, `Move earlier`, `Move later`, `Change sports` (schools only), `Remove from hub` with a confirmation, and `Cancel`. The same actions are exposed as accessibility actions. There is no drag reorder. Removing a tile deletes its stream cache and logo file.

A long press on YouTube TV asks to remove it. Removing it takes only the tile off the hub: its saved locations and Google sign-in stay on the phone, and it is added back from `+` under `Custom modules`.

The update prompt does not appear while a team screen, the picker, TV Location, the tile actions, or a confirmation is open.

## Grid

`app/hub/hubGrid.ts` computes the layout from the hub container's size and the number of tiles, counting any custom module and `+`. Columns are the larger of 2 and the rounded-up square root of that count, except that a lone `+` is one centered column. Tiles are at most 101.2 dp, with a gap of 28/101.2 of the tile.

In portrait, the Danner logo steps down from 210 through 180, 150 and 120 dp only while height limits the tiles and they would be under 72 dp. Below 64 dp the grid scrolls with the logo at 210 dp and as many columns as keep 64 dp. In landscape (width at least 1.1 times height) the logo takes the left 35% of the screen and the grid the rest, after the left and right insets. The signing warning or update spinner reserves 112 dp at the top. Rows fill from the left, and the block is centered on the two-thirds line while it clears the logo.

A hub holds at most 30 team tiles, and a custom module does not count toward that. At the cap, `+` stays and the picker shows `Hub is full (30 teams)` with adding teams disabled.

## Picker

| Step | Content |
|---|---|
| 1. Add a team | One row per league or college sport: MLB, NFL, NCAA football, NCAA men's basketball, and NCAA women's basketball. A row appears only when the build has its adapter and the catalog marks it `pickable`, so other leagues stay hidden until their probes and fixtures pass (`catalog/`, `tests/leagues/`). `Custom modules` is the last row and opens the list of modules; a module on the hub shows `On hub` and is disabled |
| 2. Team or school | Search over name, nickname, location and abbreviation, ignoring case and accents. `retired` and `hidden` entries are not offered. A pro team on the hub shows `On hub` and is disabled. A school on the hub shows `On hub` with its sports and opens step 3 |
| 3. Sports (schools only) | One checkbox per sport the catalog offers, plus any sport already on the tile. A sport in `retiredSports` is not offered. Pre-checked: the sports on the tile plus the sport picked in step 1. Unchecking every sport asks whether to remove the tile |

A pro team always has its own tile. Sports from one school share one tile: adding a sport merges into it, removing one keeps the tile, and the tile goes away with its last sport.

`app/picker/catalogSnapshot.json` is the catalog bundled for offline use, written from `catalog/` by `npm run build:catalog-snapshot`. The script writes nothing when `catalog/` is missing or unusable, and `ci.yml`, which a v2 release requires, fails when the committed snapshot holds no catalog. With no snapshot catalog the app compiles and runs, and the picker reads the catalog from the network and says the team list is not available when it cannot. Each file is replaced by its `danner.catalog.v1` copy when that copy has a newer `generatedAt`. The copy refreshes when the picker opens and it is older than 24 hours, from the Worker's `/catalog` routes and then raw GitHub. A refresh updates the stored tiles' display data by key and never their order or sports.

## Phone storage

| Key | Value |
|---|---|
| `danner.selection.v1` | `{schema: 1, tiles, modules, updatedAt}`. Removing every tile stores `tiles: []`, so an absent key means never initialized |
| `danner.seed.v1` | `{decision, signal, at, appVersion}`, written once |
| `danner.install.v1` | A `v1.x` install marker. Read at seeding and never written by this app |
| `danner.sources.<TeamKey>.v1` | Last valid streams document |
| `danner.catalog.v1` | `{files: {<name>: {etag, fetchedAt, text}}}` |
| `danner.logos.v1` | `{<TeamKey>: {href, name}}`, with `name` = `logos/<TeamKey>.png` |
| `danner.tv.default.v1`, `danner.destination.v1` | TV points, owned by TV Location |

Logos live under the document directory, which survives in-place updates, and the path is resolved against the current directory each time. Only `https://a.espncdn.com/` is fetched. The hub backfills missing or changed logos two at a time when it mounts or the app becomes active, and the first failure ends that run.

The splash screen holds until the selection has loaded.

## Seeding

Seeding runs only when `danner.selection.v1` and `danner.seed.v1` are both absent. If the selection is absent and the seed is present, the hub starts empty and does not seed again.

| Layer | Signal | Result |
|---|---|---|
| 1 | Any of `danner.install.v1`, `danner.guardians.sources.v2`, `danner.patriots.sources.v1`, `danner.cyclones.sources.v1`, `danner.destination.v1` | Presets, signal `legacy-keys` |
| 2 | Android `lastUpdateTime` minus `firstInstallTime` over 60 s | Presets, signal `install-times` |
| None | | Empty, decision `fresh` |

An iPhone updated from `v1.x` seeds through layer 1 when it holds any of those keys. iPhone has no layer 2. An Android update within 60 s of the first install does not meet layer 2 and does not seed. A phone the signals miss adds its teams through the picker.

A seeded phone also gets YouTube TV, and a fresh one does not. A selection stored before custom modules has no `modules` list: on its next load it keeps YouTube TV if the phone was seeded as a family phone or holds a TV point (`danner.tv.default.v1` or `danner.destination.v1`), and gets an empty list otherwise. The list is saved once, so a tile removed later stays removed.

Seeding writes `danner.selection.v1`, then `danner.seed.v1`, and only after both succeed removes the three v1 sources keys. It never writes a TV key and never touches `danner.install.v1`.

## Read-only sessions

If storage throws or does not answer within 3 s, the selection cannot be read, one of its tiles cannot be read, or its schema is newer than this build, the session is read-only. The hub shows YouTube TV, `+`, and any tiles it could read, nothing is seeded or written, and the stored key is left as it is. The next time the app comes to the foreground, or `+` is pressed, the load runs again.

An older schema is migrated through `app/selection/migrations.ts`, validated, and written back. A later key version is written first and the old key removed only after that write succeeds.
