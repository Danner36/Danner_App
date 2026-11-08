Status: ACTIVE
Phase: Approved plan. Phases 0, 1, 2a and 2b are merged with their owner runs pending; Phase 3 is in progress. Revised 2026-11-02 for the paid Apple Developer Program (Decided 20) and 2026-11-03 for the basketball arena board; O21-O27 await the owner

# Modular teams plan

This plan replaces the fixed Guardians, Patriots and Cyclones setup with a hub of teams that each phone chooses, one team-screen engine, one cloud pipeline, and a TV Location module that any person can use with their own YouTube TV account. The fixed-team design is recorded in `Docs/Archive/FixedTeams/` ("the way it used to be", pinned to `823d2be`). This plan cites current code only where it drives a decision. The owner approved this plan and every recommended default on 2026-11-02. Later the same day the owner decided to join the paid Apple Developer Program and retire the SideStore iPhone method (Decided 20). That method is recorded in `Docs/Archive/IphoneSideStore/` (pinned to `19740af`), and the open decisions O21-O26 cover what follows from it. On 2026-11-03 the owner asked for a gym-style basketball board (Basketball arena board); when it ships is the open decision O27.

Do not print listing-site URLs, the app key, Google or Apple account data (including testers' Apple Account emails), device identifiers, the Apple team id, signing certificates, `.p12` passwords, provisioning profiles, App Store Connect key ids, issuer ids and `.p8` keys, or any secret value in this plan, issues, logs or chat. Placeholders such as `<paste listing URL 1>` and `<TEAM_ID>` stand in for them.

## Summary

The owner approved every recommended default below except O21-O27, which are open; the tag in brackets names the decision.

- Family phones: the first launch of `v2.0.0` shows Guardians, Patriots, Cyclones, TV Location and `+` on every Android phone updated in place and on every iPhone updated through TestFlight from `v1.5.x`, which holds the `v1.5.0` install marker, a stream cache or a saved TV point [O22]. Any other phone shows TV Location and `+`; a family iPhone with no `v1.5.x` data adds the three teams through the normal picker. Team screens look and behave as they do today, apart from the rule fixes listed under Team screen engine.
- A first install of `v2.x` (a new phone, a reinstall, a person who never ran `v1.x`) shows only TV Location and `+`. A phone of another person that ran `v1.x` (including every TestFlight `v1.5.x` iPhone) is seeded like a family phone and can remove the three teams. `+` opens a picker: league or college sport, then team or school, then sports (schools only).
- Two or more sports from one school share one tile, with one featured card per game today and one record per sport. Adding a sport merges it into the tile, and the tile goes away only when its last sport is removed. A pro team always gets its own tile.
- The grid grows (2×2, 3×2, 3×3, 4×4) and the tiles shrink to fit. Past 4 columns on a phone the grid scrolls, and the hub holds at most 30 team tiles [O18]. A long press on a team tile moves it, changes its sports or removes it.
- Every team screen has today's preset features: record, featured game, countdown, live board, Final recap, win chance, schedule, Play, Get video, Listen, Cast and TV send.
- Basketball games get a gym-style arena board: clock, period, team names with big scores, team fouls and bonus, the last foul, and five players per team with jersey, fouls and points. A team's five are labelled as on the floor only when ESPN's substitution log passes a consistency check, else that team's table shows its top scorers; the check rejects inconsistent data but cannot prove the lineup, so a substitution ESPN never logs can show a wrong five until a later play contradicts it. Team names are text, with no logos. Timeouts left stay hidden until a live capture finds an ESPN field that holds them. The board reuses the 5 s live poll (plus one small request only if that field needs it, O27) and ships first on today's Cyclones screen, in a `v1.x` release this college season [O27].
- Leagues ship in stages [O11]: `v2.0.0` has MLB, NFL, and NCAA football, men's basketball and women's basketball; `v2.1.0` adds NBA and WNBA; `v2.2.0` adds NHL, MLS and NWSL; `v2.3.0` adds other major categories [O12]. A league is offered only after a live probe in GitHub Actions confirms its ESPN data.
- Selections, logos, the TV location and the Google session live on the phone. They survive Android in-place updates and iPhone TestFlight updates as long as the package id, bundle id, Android signing key and Apple signing team stay the same. The move from SideStore to the paid channel gives each iPhone a new empty app once, at `v1.5.0` [Decided 20, O22]. The release build checks the Android signing certificate and the iPhone bundle id.
- TV Location has no built-in location: each phone picks its default on first use, and upgraded phones that never saved a point choose once. Each person signs into their own YouTube TV account on Google's own page inside the app, and the app never sees or stores a password.
- Backend: one workflow, one dispatch type, one config secret, one pipeline package and one streams file per team (`streams/<league>/<espnId>.json`), all driven by a committed team catalog. It runs entirely in the cloud: GitHub Actions plus the existing Cloudflare Worker.
- The shared pipeline is protected by the catalog allowlist, a Worker check that the requested game is this team's and is in its video window, per-game dedupe, rate limits keyed by (IP, team), and caps on runs in flight and per hour [O8]. The app key baked into every build is not treated as a secret.
- The listing site gets ordered backups in the pipeline secret. A source is abandoned on a move-on failure (the site is down or blocked, or this game is not found or not playable there) and the next one is tried [O10]. The phone shows `Looking for video (2 of 3)…` while it waits. Backups reach today's pipeline before the cutover [O2].
- Clean cutover: one Worker deploy and one app release (`v2.0.0`) replace the old contract. Installed `v1.x` builds lose Play and Get video from the Worker deploy until they update (Android through the in-app update, iPhone through TestFlight, which the hub announces [O24]); scores and schedules keep working.
- iPhones: the owner joins the paid Apple Developer Program. CI signs every iPhone build and uploads it to TestFlight, and each person installs and updates the app from Apple's TestFlight app, with no computer, VPN, Developer Mode or weekly renewal. SideStore, LocalDevVPN, iLoader, the free per-phone Apple Accounts and the `sidestore://` update handoff are retired, and the old method is archived in `Docs/Archive/IphoneSideStore/` [Decided 20]. The channel is TestFlight internal testing; App Review rules out the App Store and external TestFlight [O21]. The move ships as `v1.5.0` of today's app, before the cutover, and each iPhone moves by hand once [O22]. Android is unchanged.

## Owner decisions

### Decided

| # | Decision | Where |
|---|---|---|
| 1 | Hub tiles are the selected teams in stored order, then TV Location (fixed), then `+`. A fresh install shows TV Location and `+`. The grid grows and the tiles scale. The fixed-layout rule (`AI_Framework/AI_RULES.md:47`) is rewritten | Hub |
| 2 | `+` picker: league or category, then team. College: school, then one or more sports. Sports from the same school share one tile (the Cyclones model). Adding a sport merges it into the tile; removing one keeps the tile until its last sport is gone. A pro team always has its own tile | Picker |
| 3 | Every selected team's screen has every preset feature | Team screen engine |
| 4 | One backend pipeline parameterized by league, team and sport. It runs on GitHub Actions and the existing Cloudflare Worker, with no home PC | Backend |
| 5 | Other people get the same build and use the same pipeline. The app key can be extracted from any build. Protection comes from the catalog allowlist, per-team and per-game dedupe, rate limits keyed by (IP, team), and bounded runs and commits | Worker v2; Abuse and quota bounds |
| 6 | Selections persist across future app updates on Android and iPhone | On-device persistence and preset seeding |
| 7 | Existing family phones get Guardians, Patriots and Cyclones automatically when they upgrade | Preset seeding (owner item 7) |
| 8 | TV Location stays a fixed tile outside the picker. Each person signs into their own YouTube TV account through an in-app Google sign-in with sign-in, switch-account and sign-out controls. No password is stored. The default location is chosen on first use, and the Tripoli default is removed | TV Location |
| 9 | Ordered backup listing sites live in the pipeline config and are tried one at a time. Scripts otherwise run as they do today: source 1 keeps today's timeouts and per-league grace | Pipeline secret and listing sources |
| 10 | `AI_Framework/AI_RULES.md` and every doc that forbids a parameterized engine or fixes the hub layout are rewritten | Rules, docs and tests |
| 11 | Clean cutover: no backward compatibility for `v1.x` (`v1.4.x`, and `v1.5.x` from Phase 1b). The Worker contract, workflows, secret, streams layout and schema may all change. Kept for future persistence: the Android package id and Expo debug keystore, the iOS bundle id and the Apple signing team (the owner's paid team from `v1.5.0`, which replaced each phone's SideStore account under Decided 20), a rising versionCode, the Worker origin, and the update manifest that `v1.4.16` reads | Delivery phases |
| 12 | The fixed-team setup is archived in `Docs/Archive/FixedTeams/`, pinned to `823d2be`. This plan points to the archive and does not repeat it | Delivery phases |
| 13 | This plan is committed as `Docs/Production/ModularTeams.md` after the owner agrees to it | Delivery phases |
| 14 | GitHub Actions deploys the Worker with repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (follows from item 4; replaces the PC deploy in `workers/guardians-get-video/README.md:5-13`). The owner picks the token scope (Edit Cloudflare Workers template, one account) | CI and deploy |
| 15 | Every date and time on screen is shown in the phone's time zone. The official date in O4 is a hidden matching key only | Team screen engine |
| 16 | No built-in TV location anywhere. Upgraded phones that never saved a point choose one on first use, like any new install | TV Location |
| 17 | The picker is the same for every install. There is no family-specific row; a family phone the seeding signals miss adds its teams through the normal picker | Preset seeding |
| 18 | Get video waits until the run reports its result, at most 900 s, and shows simple progress: `Looking for video (k of n)…` | Get video progress |
| 19 | `main` gets a ruleset that blocks force pushes and branch deletion, with no required checks or pull requests, because the pipeline and catalog bots commit straight to `main` (`scripts/guardians-stream-pipeline/lib/publishGithub.mjs:101-114`). Releases are gated by the `release.yml` `checks` job | CI and deploy |
| 20 | iPhones move to the paid Apple Developer Program (owner decision, 2026-11-02). CI signs every iPhone build with the owner's paid team. SideStore, LocalDevVPN, iLoader, Apple website iTunes, the free dedicated Apple Account per phone, the 7-day renewal and its charger automation, and the `sidestore://install` update handoff are retired. The SideStore method is archived in `Docs/Archive/IphoneSideStore/`, pinned to `19740af` ("the way it used to be"). Android is unaffected. Channel and timing are O21 and O22 | iPhone distribution; Phase 1b |

### Approved defaults

The owner approved each default in this table on 2026-11-02. The numbers stay stable; O3, O6, O7 and O19 were settled separately and appear under Decided. O5 and O16 were reworded on 2026-11-02 for the TestFlight channel (Decided 20): O5 is superseded when the owner accepts O22, and O16 moves to the TestFlight `Pilot` group. The owner confirms both with O21-O26.

| # | Question | Recommended default | Reason |
|---|---|---|---|
| O1 | Tag `823d2be` as `fixed-teams-final`? | Yes, annotated, message "Fixed three-team design archive snapshot" | Same name as the archive README's commands. It marks the archive snapshot, not the last commit before the cutover; the last `v1.x` release tag already marks the last shipped fixed build. The name avoids the `v*` release trigger (`.github/workflows/release.yml:4-6`) |
| O2 | Deliver listing backups before the cutover, in today's pipeline (Phase 1)? | Yes, using the final `STREAM_PIPELINE_CONFIG` secret so the URLs are pasted once | Family phones get backups weeks earlier, and the failover modules move into the new pipeline unchanged |
| O4 | Use the America/New_York calendar date as the hidden official-date key for every ESPN team, including Iowa State? It is never displayed (Decided 15); it only labels which day a hand-written streams entry belongs to. MLB keeps the statsapi official date | Yes | One rule for the app and the pipeline. Pipeline entries match by event id, so only hand-written `gameDates` are affected. The ESPN recap day moves to the phone-local start date (Team screen engine), so Cyclones' move off America/Chicago (`app/cyclones/cyclonesSnapshot.ts:88-95,406,418-422`) changes nothing a Central phone shows |
| O5 | Skip a `v1.4.17` bridge release that writes an install marker and proves the update paths before the cutover? | Skip. Superseded by O22 when the owner accepts it: `v1.5.0` is then that bridge, writes `danner.install.v1` and ships for the move to TestFlight. The `v1.4.17` skipped here is the install-marker bridge; the Phase 1c board release (O27) may still take that number, and it writes no marker | Owner item 11. A bridge makes every phone update twice, which O22 accepts to end the 7-day renewal. Legacy keys and Android install times cover the family phones. Under O22 the update paths are proven in Phase 1b (Android in place from `v1.4.16`, the iPhone keep-alive build installed over `v1.5.0`) and again by the draft-release installs and family updates in Phase 6. Without O22, a family iPhone with neither signal adds its teams through the picker |
| O8 | Get video limits: 180 s cooldown per game, 10 runs per game, 3 per 10 min per IP+team, 20/h per IP, 10 wrong keys/h per IP, 60/h overall, 15 in flight? | Accept | Each is a Worker `[vars]` value that changes without a code change. The (IP, team) limit counts all sports of a school together |
| O9 | Allow at most 5 listing sources in the config? | Yes | The 600 s extraction deadline gives the first three sources full budgets; sources 4 and 5 run only when earlier sites fail fast |
| O10 | Move to the next site also when a site works but this game is not found or not playable there (`link_not_found`, `opponent_not_found`, `ambiguous_link`, `player_not_found`, `unknown_provider`, `invalid_entry`, `unplayable`)? | Yes | A backup only helps if a missing game counts. Owner item 9 named site-level failures; this widens it |
| O11 | League release staging: `v2.0.0` MLB, NFL, NCAA football and basketball; `v2.1.0` NBA, WNBA; `v2.2.0` NHL, MLS, NWSL? | Yes | The cutover uses only ESPN paths already parsed in repo code. The alternative holds `v2.0.0` until all ten pass their probes and boards |
| O12 | Which "other major categories" ship in Phase 9? | NCAA baseball, NCAA softball, NCAA men's ice hockey, NCAA women's volleyball, Premier League; each only after its probe and fixtures pass | Each new board or record format is app work. The owner may name others or defer Phase 9 |
| O13 | Add team-code share and paste for setting up another phone? | Yes, in Phase 9 | The code holds no secrets, and the feature is optional |
| O14 | Show a `Signed in on this phone` status line, based on whether Google session cookie names are present (never their values)? | Yes. When the state is unknown, all three account buttons are shown | A parent can see which phones still need to sign in |
| O15 | Accept that Android `Sign out` clears all WebView cookies and web storage for the whole app? `CookieManager` has no per-domain delete | Accept | Team players do not rely on stored cookies (`cacheEnabled={false}`, `app/guardians/GuardiansScreen.tsx:627`) |
| O16 | Run the iPhone physical checks (seeding, persistence, TV sign-in and sign-out) on the `v2.0.0` TestFlight build, delivered only to the `Pilot` group and installed over `v1.5.x` on one family iPhone, before the release is published and before the build reaches the `Everyone` group? Before Decided 20 this was the draft IPA installed over `v1.4.16` through SideStore | Accept | One install proves the release itself; a failure stops the cutover before other phones see the update |
| O17 | Add a macOS `ios-build` CI job on PRs that touch native modules or `app/package.json`? | Yes | Windows has no Xcode (`AI_Framework/AI_RULES.md:16`), and the new native code needs an iPhone compile check |
| O18 | Hub size: phones scroll past 4 columns; at most 30 team tiles; at the cap `+` stays and the picker shows `Hub is full (30 teams)` with adding disabled? | Accept | Tiles stay at least 64 dp; 30 tiles fit a tablet without scrolling |
| O20 | Create a release as a draft when its major version is above the latest published release, so the owner publishes it by hand? | Yes | `v2.0.0` can then be built and installed on two phones before `v1.x` phones see the prompt. Minor and patch releases publish as today |

### Open decisions

O21-O26 follow from Decided 20, and O27 follows from the owner's basketball board request of 2026-11-03; all wait for the owner. Items marked * are Apple program rules taken from Apple pages read on 2026-11-02 or from outside knowledge; none is proven in this repo, and Phase 1b confirms each on the first signed build.

| # | Question | Recommended default | Reason |
|---|---|---|---|
| O21 | Which paid channel delivers the app to iPhones? | TestFlight internal testing only: builds exported as "TestFlight Internal Only" (`testFlightInternalTestingOnly`), and every person with an iPhone is an App Store Connect team member in an internal group. Non-family testers only within a cap the owner sets in the private record. Ad Hoc is described but not built; it would be a separate project (iPhone distribution). The App Store (public or unlisted) and external TestFlight are not used | Internal builds get no App Review*. Nothing is registered per phone: no UDID, no Developer Mode, no computer, no VPN, no hosting; TestFlight installs and updates the app. Limits: 100 internal testers per team*, each invited by Apple Account email, and each build stops launching 90 days after upload* unless a newer one replaces it (the keep-alive upload). App Review risk, plainly: the App Store and external TestFlight both need review, and rejection is near certain. The app plays third-party streams without rights (guidelines 5.2.1-5.2.3*), sets YouTube TV's playback area by injecting chosen coordinates (1.1.6, 5.2.2*), updates itself outside the store (2.5.2*) and hides Get video behind a PIN (2.5.19*). A build that slipped through could later be removed with account consequences*. Internal TestFlight skips review but not the rules: Guideline 2.2 expects TestFlight apps to be meant for public release*, internal testing is meant for the developer's own team*, and Apple can expire builds or end the membership, which could stop every iPhone at once* and stops them at the latest when their build reaches 90 days. Each non-family person added to App Store Connect stretches the internal-testing use further and adds to that risk for every family iPhone; each also sees the owner's legal name*, and the owner holds their Apple Account email. How the license agreement defines team members and internal testers was not checked. Ad Hoc needs each UDID registered, Developer Mode on each phone*, a new build for each added phone, a yearly reinstall, and private hosting, because its IPA lists every registered UDID* |
| O22 | When do iPhones move? | Phase 1b: a standalone app release `v1.5.0` of today's fixed app, tagged before Phase 3 starts (from branch `release/v1.5` off the latest `v1.4.x` tag if Phase 3 has already started). `v1.5.0` also writes the install marker `danner.install.v1` at first launch. Folding the move into `v2.0.0` is the alternative | Phase 1b ends the weekly SideStore upkeep months before the cutover, which is the owner's aim. It proves signing, upload, the channel and the first install on a known app, apart from the Worker v2 deploy and the new hub. The one-time new container on each iPhone happens on `v1.x`, where it costs caches, one TV point and one Google sign-in, and no team selection exists yet to lose. `v2.0.0` then reaches iPhones as a TestFlight update in the same container, so layer-1 seeding finds `v1.5.x` keys, Decided 7 holds for iPhones, and Phase 6 step 5 tests a real update (O16). Cost: Android phones take one extra in-app update with no visible change, the double update O5 avoided; here it buys the end of the 7-day renewal. Folding into `v2.0.0` keeps SideStore until Phase 6, stacks the first signed build and every iPhone's fresh start onto the cutover, leaves every family iPhone on TV Location and `+` with no presets (Decided 7 fails on iPhone), and makes the O16 install over the previous build impossible |
| O23 | Keep an unsigned `Danner-Apps-iOS.ipa` asset and the manifest's `ios` entry until Phase 10? | Yes. The `ios` job keeps today's unsigned build (`.github/workflows/release.yml:125-171`) for that asset only, and no card or note points anyone to it. The signed TestFlight IPA is never published | `v1.4.16` phones reject a manifest whose `ios` entry is missing or is not a GitHub HTTPS asset with SHA-256, size and versionCode (`app/hub/appUpdate.ts:68-94,158-188`), so dropping it would hide `v1.5.0` and `v2.0.0` from every `v1.4.16` Android phone. A `v1.4.16` iPhone that has not moved also prompts on the manifest's top-level `version` (`app/hub/appUpdate.ts:96-115`, `app/hub/HubScreen.tsx:166-198`), and Yes hands this IPA to SideStore (`HubScreen.tsx:150-158`). That phone then runs a SideStore copy of `v1.5.x`: still on the 7-day renewal, with no update path, and with the signing warning and the retired-copy line that tell the person to move (O24). At the Worker v2 deploy it loses Play and Get video like any `v1.x` copy. A signed IPA carries the team id in its profile and signature, and an Actions artifact in a public repo is public, so the signed IPA goes only to App Store Connect |
| O24 | What happens to the iPhone signing warning and the `sidestore://` update prompt? | Phase 1b replaces the prompt with a TestFlight notice and keeps the warning only for SideStore copies. The notice (`A new version of Danner Apps is ready in TestFlight.`, buttons `Not now` and `Open TestFlight`, which opens `itms-beta://`*) shows only when the release's `testflight.json` asset, written after the build reaches `Everyone`, names a newer version. The `danner-provisioning-profile` module and the warning stay until Phase 10: when an embedded profile is present, the hub shows `This iPhone copy is retired` (or the expiry title in the final 48 hours) over `Ask for the TestFlight invitation.`, and no notice | TestFlight installs carry no embedded provisioning profile*, so the module returns nothing there; a profile exists only on a SideStore copy, including one updated to `v1.5.x` through the `v1.4.16` prompt (O23), and that copy needs to be told to move. TestFlight updates on its own*, but automatic updates can be off and are not immediate*, and the Worker v2 deploy breaks Play and Get video on `v1.x`, so an iPhone needs an in-app sign that an update waits. Gating on `testflight.json` keeps the notice from firing before the build reaches the person's group, which a notice driven by the GitHub release alone could do. The 90-day build life is handled by the keep-alive upload, not on the phone. Alternative: no notice, and a non-updated iPhone loses Play and Get video at the cutover with no in-app explanation |
| O25 | How does the owner enroll, and how does CI sign? | Individual enrollment with a dedicated Apple Account in the owner's legal name, not the owner's everyday iCloud account. CI signs and uploads in the GitHub macOS job with an App Manager App Store Connect API key, using manual signing (an Apple Distribution certificate and an App Store profile in the `apple-release` environment's secrets). Cloud-managed automatic signing only if the owner accepts its trade-off. `app/eas.json` stays unused | About 99 USD a year*; an organization needs a D-U-N-S number*. The owner's legal name is shown as the developer to every tester*. A dedicated account keeps a termination or lockout away from the owner's personal Apple services*. The release already builds on GitHub's macOS runner (`release.yml:85-178`); EAS would hold the credentials at Expo. Cloud-managed signing drops the certificate and profile secrets and their yearly rotation, but needs an Admin-role key*, which can also create certificates and manage team members, present in CI during `npm ci`, prebuild and third-party build scripts |
| O26 | Tag `19740af` as `iphone-sidestore-final`? | Yes, annotated, message "iPhone SideStore distribution archive snapshot" | Same pattern as O1; the name avoids the `v*` release trigger (`.github/workflows/release.yml:4-6`). The tag keeps the archive's permalinks reachable after the SideStore files leave `main`. The archive links the `v1.4.16` release page and assets, the last release with the SideStore card and `sidestore-source.json` (`v1.4.17` instead if Phase 1c ships it before `v1.5.0`; Phase 1c then updates the archive and this reason), and marks its `releases/latest` source URL historical, because that URL stops resolving at `v1.5.0` |
| O27 | When does the basketball arena board ship? (a) Early, on today's Cyclones screen, in a `v1.x` release during this college basketball season (Phase 1c); (b) with the engine in `v2.0.0` (Phases 3-6); (c) with NBA and WNBA in `v2.1.0` (Phase 7) | (a) Phase 1c. The pure parser and the board are written once, at their final paths (`app/leagues/espn/`, `app/scoreboards/basketball/`), and called from `CyclonesScreen.tsx`; Phase 3 changes only the caller. One live capture per NCAA basketball adapter comes first, from a small `workflow_dispatch` job (`espn-capture.yml`, or the probe's `live-capture` job if Phase 2a has merged), because the Phase 2a probe may not exist yet. The release is `v1.4.17` when `v1.5.0` is not yet tagged, else the next `v1.5.x`, cut from the branch that Release sources (Delivery phases) names; Phase 1c never waits for `v1.5.0`. Sub-decision on timeouts left: if a live capture shows an ESPN field holding each team's remaining timeouts that tracks the timeout plays, `timeouts` turns on; when that field is only in the Core `…/competitions/{id}/situation` resource, the board makes that one extra small request on each 5 s poll. Otherwise `T.O.L.` stays hidden. NBA and WNBA get the board in Phase 7 under every option | The 2026-27 college season is underway on 2026-11-03, and its tournaments end in early April 2027 (outside knowledge). `v2.0.0` waits on Phases 1b, 2a, 2b, 3, 4 and 5, including Apple enrollment and the backend, and this plan sets no date for it, so (b) can reach phones late in the season or after it; (c) comes later still and leaves NCAA basketball on today's period board until `v2.1.0`. (a) costs one more update on each phone (Android in place; iPhones through SideStore before `v1.5.0`, TestFlight after), the capture job (deleted in Phase 2a), and the Cyclones-screen wiring that Phase 3 replaces (the touch points under Phase 1c: the game type, both board paths, the merge, the harness and the snapshot tests); the board itself is written once. It also tests the lineup derivation in live games months before the cutover, and its captures become the first basketball fixtures under `tests/leagues/`. A team whose replay fails its consistency check shows top scorers; the check rejects inconsistent data but cannot prove the lineup, so a substitution ESPN never logs can show a wrong five as on the floor until a later play contradicts it (Risks). The timeouts sub-decision is asked now because the owner asked for timeouts left, and a second request would otherwise need a separate owner decision after the capture. Under (b) Phase 3 builds the board, its flags turning on from the first live capture, and Phase 1c is dropped; under (c) Phase 7 builds it |

## Current state

This lists only what drives the plan. The full record is in `Docs/Archive/FixedTeams/`.

| Area | Today | What it drives |
|---|---|---|
| Hub | Fixed 2×2 grid of Guardians, Patriots, Cyclones and TV Location: 101.2 dp tiles, 28 dp gaps, percentage positions inside `SafeAreaView edges={['top','bottom']}` (`app/hub/HubScreen.tsx:387-395`, `app/App.tsx:31`, `AI_Framework/AI_RULES.md:47`) | Dynamic grid |
| Team screens | Three sibling copies, required by rule (`AI_RULES.md:53,55,57`): `app/guardians/` (MLB statsapi, team 114 hard-coded, `GuardiansScreen.tsx:229-238`), `app/patriots/` (ESPN NFL 17), and `app/cyclones/` (ESPN NCAA 66, three sports on one screen, `CyclonesScreen.tsx:828-853`) | One engine built from the Cyclones screen |
| Test imports | Pure-Node tests import app modules that have only `import type` siblings or explicit `.js` paths (`app/patriots/patriotsSnapshot.ts:1`, `app/hub/appUpdate.ts:1`); `app/tsconfig.json:1-6` only extends `expo/tsconfig.base` | Explicit `.ts` import rule |
| Stream match | Official date plus game number (`app/guardians/guardiansSources.ts:257-266`); the parser rejects unknown keys (`:203`) | Event-id match; lenient parser |
| Worker | One Worker, `guardians-get-video` (`workers/guardians-get-video/wrangler.toml:1`), with a three-row module table (`src/index.js:6-22`). It allows 3 presses per 10 min per IP across all teams, counted per isolate (`:1-4,106-118`). Every `/streams` call is a PAT request unless that isolate holds a matching ETag (`:178-202`). A missing streams file answers 502 (`:204-207`), and GitHub error text reaches the phone (`:205-206,242-243`). The phone reads 429 as "a run is in progress" (`app/cyclones/cyclonesGetVideo.ts:68-71`) | Worker v2 contract, gates, read index, distinct codes |
| Workflows | Three files that differ in about six parameters (`.github/workflows/cyclones-stream-pipeline.yml:16-22,37-38,50-60,66-67`), each with its own `TZ`. One job runs the headed browser and holds a `contents: write` token; checkout keeps its credentials (`guardians-stream-pipeline.yml:39`) | One workflow, split into `extract` and `publish` |
| Pipeline | `scripts/guardians-stream-pipeline/` with a fixed module table (`lib/pipeline.mjs:49-67`) and an in-package default config path (`:42-45`). A missing streams file fails the run: the checkout fallback in `readCurrentStreamsDocument` hits ENOENT (`lib/pipeline.mjs:274-290`, `lib/streamsDocument.mjs:75-77`); publish can already create a file without a `sha` (`lib/publishGithub.mjs:111`). Navigation timeout 90 s (`lib/pipeline.mjs:421-423`); grace 180 for Guardians, 240 for the others (`config.example.json`, `config.patriots.example.json`) | Catalog-driven TeamSpec; template creation; source 1 timings kept |
| Secrets | Three `*_STREAM_PIPELINE_CONFIG` secrets that hold the same `extract.baseUrl` plus per-team needles, `requireOpponent` and grace (`workers/guardians-get-video/README.md:22-26`). Build env `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL` and `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN`, shared by all teams (`release.yml:62-63,70-71,120-121,128-129`). The Worker PAT may be classic `repo` or fine-grained (`README.md:22`) | One secret; renamed env; PAT check |
| Listing | One `baseUrl` (`lib/pipeline.mjs:497`). The listing HTTP status is discarded (`lib/extractGooz.mjs:925-937`); the link wait keeps polling through a Cloudflare challenge (`:548-561`). One player host, `GOOZ_HOST` (`:1-4,842`) | Ordered sources, challenge-aware stages, provider table |
| TV Location | A Tripoli constant (`app/tvLocation/destination.ts:9-13`) is used when no point is saved (`TvLocationScreen.tsx:635`). Sign-in happens only inside the verify WebView. The cookie module only flushes, and only on Android (`app/modules/danner-webview-cookies/src/index.ts:8-13`). The injected script has no host check and runs in iPhone subframes (`geolocationInjection.ts:8-9`, `TvLocationScreen.tsx:590-592`) | First use, own-account controls, host guard |
| Persistence | Four AsyncStorage keys: three sources caches and `danner.destination.v1`. There is no selection key and no install marker (`GuardiansScreen.tsx:96`, `PatriotsScreen.tsx:94`, `CyclonesScreen.tsx:99`, `destination.ts:1`) | Selection store and seeding signals |
| Identity | Package `com.example.location_helper` (`app/app.json:33`), bundle id `com.danner.locationhelper` (`:15`), Expo debug keystore regenerated by `expo prebuild --clean` (`release.yml:59-65`), versionCode from the tag and 1 without it (`app/app.config.js:18-32`, `app/app.json:34`); update manifest URL and parser (`app/hub/appUpdate.ts:5-7,68-93`) | Frozen constants; signing-certificate check |
| iPhone delivery | An unsigned IPA from the release workflow (`.github/workflows/release.yml:125-171`, `CODE_SIGNING_ALLOWED=NO` at `:145`), installed through SideStore with a free Apple Account per phone and renewed every 7 days over Wi-Fi with LocalDevVPN and a charger automation; a final-48-hour warning read from the embedded profile (`app/hub/provisioningWarning.ts`, `app/modules/danner-provisioning-profile/`); the iPhone update prompt opens `sidestore://install?url=` (`app/hub/appUpdate.ts:129-131`, `HubScreen.tsx:149-159`). Recorded in `Docs/Archive/IphoneSideStore/` | iPhone distribution, Phase 1b |
| CI and deploy | No workflow runs a test. The Worker is deployed by hand from a PC (`workers/guardians-get-video/README.md:5-13`) with `wrangler ^4.28.0` (`package.json:10`). `.gitignore:53-56` covers only the old package's local config | `ci.yml`, `worker-deploy.yml`, new ignore entries |

## Target architecture

### Names used everywhere

| Name | Value |
|---|---|
| Team key | `<league>-<espnId>`, matching `^[a-z]{2,8}-\d{1,8}$`: `mlb-5`, `nfl-17`, `ncaa-66`. Used as is by the catalog, tiles, AsyncStorage keys, logo files, Worker allowlist, dispatch payload and concurrency group. The streams path is derived from it |
| League key | `mlb`, `nfl`, `nba`, `wnba`, `nhl`, `mls`, `nwsl`, `ncaa` |
| College sport key | `football`, `mens-basketball`, `womens-basketball` (today's values, `app/cyclones/cyclonesSources.ts:2-4`); Phase 9 adds more |
| Adapter key | The league key for pro teams; `ncaa/<sport>` for college. Every folder or file name built from an adapter key (`tests/leagues/<adapter>/`, `tests/scoreboards/archived/<adapter>/`, capture artifacts, `--league` values) uses `-` in place of `/`: `ncaa-mens-basketball` |
| Streams file | `streams/<league>/<espnId>.json`, one per pro team or school |
| Workflow | `.github/workflows/stream-pipeline.yml`, jobs `extract` and `publish`, dispatch type `team-get-video` |
| Pipeline secret | `STREAM_PIPELINE_CONFIG` |
| Other repo secrets | `RUN_STATUS_KEY`, `RUN_PROGRESS_KEY`, `WORKER_GITHUB_PAT`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| Build env | `EXPO_PUBLIC_DANNER_WORKER_URL` (today's Worker origin, value unchanged) and `EXPO_PUBLIC_DANNER_APP_KEY`, read only by `app/streams/workerConfig.ts` |
| Worker | Cloudflare name `guardians-get-video` and its workers.dev origin are kept and frozen for all future builds. Folder `workers/team-worker/`. Secrets `APP_KEY`, optional `APP_KEY_PREVIOUS`, `RUN_STATUS_KEY`, `RUN_PROGRESS_KEY` and `GITHUB_TOKEN`, all copied from repo secrets by `worker-deploy.yml` |
| Committed fingerprints | `release/app-key.sha256` (SHA-256 of the app key, never the key) and `release/android-signing-cert.sha256` (the `v1.4.16` APK certificate) |
| Apple signing secrets | Secrets of the GitHub environment `apple-release`, never repository secrets: `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`, and with manual signing `IOS_DIST_P12_BASE64`, `IOS_DIST_P12_PASSWORD`, `IOS_PROFILE_BASE64`, `IOS_PROFILE_NAME` (Phase 1b, O25) |
| TestFlight groups | Internal groups `Pilot` (automatic distribution; the owner's iPhone) and `Everyone` (a release's build is added when the release is published; a keep-alive build after 2 days in `Pilot`), in the App Store Connect record for `com.danner.locationhelper` |
| iPhone release asset | `testflight.json` (`{version, tag}`), uploaded to a release once its build is in `Everyone`; read by the iPhone TestFlight notice (O24) |
| Archive tags | `fixed-teams-final` on `823d2be` (O1); `iphone-sidestore-final` on `19740af` (O26) |

### App layout

| New path | Built from | Contents |
|---|---|---|
| `app/playback/` | `app/guardians/GuardiansAudioPlayer.tsx`, `GuardiansCastButton.tsx`, `GuardiansTvRouteButton.tsx`, `castStreamType.ts`, `web*Injection.ts`, `webPlayer*.ts`; player stack `GuardiansScreen.tsx:484-799` | `AudioPlayer`, `CastButton`, `TvRouteButton`, `StreamPlayer`. The logic moves unchanged; only team strings (`GuardiansScreen.tsx:546,753`) become props |
| `app/streams/` | `guardiansSources.ts`, fetch chain `GuardiansScreen.tsx:303-460`, three `*GetVideo.ts` files | `sources.ts` (one parser), `fetchSources.ts`, `getVideo.ts`, `workerConfig.ts` |
| `app/team/` | `CyclonesScreen.tsx:1135-1715` and `FeaturedGameCard` | `TeamScreen.tsx`, `FeaturedGameCard.tsx`, `ScheduleList.tsx`, `HeroRecords.tsx`, `WinChanceBar.tsx`, `theme.ts` |
| `app/team/engine/` | `guardiansSnapshot.ts:62-255`, `patriotsSnapshot.ts:96-121,250-282`, `cyclonesSnapshot.ts:197-437` | `featured.ts`, `liveMerge.ts`, `videoWindow.ts`, `records.ts`, `dates.ts`, `postseason.ts`, `streamMatch.ts`, `types.ts` |
| `app/leagues/espn/`, `app/leagues/mlb/` | `espnNfl.ts`, `espnCyclones.ts`, both `espnScoreboard` files, both `espnWinChance.ts`; `GuardiansScreen.tsx:216-301`, `mlbLinescore.ts` | One ESPN adapter driven by config rows; the statsapi adapter |
| `app/scoreboards/` | The four `*Scoreboard.tsx` files; `basketball/` from Phase 1c (O27) | `BaseballScoreboard.tsx`, `PeriodScoreboard.tsx`, `basketball/` (Basketball arena board) |
| `app/hub/` | `HubScreen.tsx` | Adds `hubGrid.ts`, `HubTile.tsx`, `TileActionsSheet.tsx`. `appUpdate.ts` and `releaseVersion.js` as left by Phase 1b; `provisioningWarning.ts` with the retired-copy line until Phase 10 (O24) |
| `app/selection/` | New | `types.ts` and `presets.ts` (Phase 3); `ops.ts`, `store.ts`, `migrations.ts`, `seed.ts`, `installInfo.ts` (Phase 4) |
| `app/picker/`, `app/logos/` | New | Picker screen and catalog loader; `logoStore.ts`, `TeamLogo.tsx` |

Pure modules (`app/team/engine/`, `app/leagues/`, `app/scoreboards/basketball/` except `BasketballArenaBoard.tsx`, `app/selection/` except `store.ts`, `app/hub/hubGrid.ts`, `app/streams/sources.ts`, `app/tvLocation/destination.ts`) have no runtime React Native import and import siblings with explicit `.ts` extensions, because Node's type stripping does not resolve `./dates`. `app/tsconfig.json` sets `allowImportingTsExtensions`, which `tsc --noEmit` accepts (`app/package.json:42`). The Phase 3 exit checks that Metro resolves these specifiers, and CI imports every pure module under plain Node.

`app/guardians/`, `app/patriots/` and `app/cyclones/` are deleted in Phase 3. The tests that import them by path (`tests/guardians/run-snapshot.mjs:3-13`, `tests/patriots/run-snapshot.mjs:4-16`, `tests/cyclones/run-snapshot.mjs:3-25`, `tests/guardians/run-cast-discovery.mjs:4-38`) move in the same commit.

### Backend layout

| Path | Change |
|---|---|
| `.github/workflows/stream-pipeline.yml`, `team-catalog.yml`, `worker-deploy.yml`, `worker-health.yml`, `ci.yml` | New |
| `.github/workflows/{guardians,patriots,cyclones}-stream-pipeline.yml`, root `{guardians,patriots,cyclones}_streams.json`, `scripts/guardians-stream-pipeline/`, `workers/guardians-get-video/` | Deleted after the `v2.0.0` release is published (Phase 6 step 8) |
| `catalog/leagues.json`, `catalog/teams/<league>.json`, `catalog/probe-report.json` (written by the bot); `catalog/overrides.json` (edited by hand) | New |
| `streams/<league>/<espnId>.json` | New; created by the pipeline on first publish (presets created at the cutover) |
| `scripts/stream-pipeline/` (`run.mjs`, `publish.mjs`, `lib/`, `templates/streams.template.json`, `config.defaults.json`, `config.example.json`, `test/`) | New package built from today's. `control-server.mjs`, `extract-gooz.mjs` and the per-team example configs are dropped, because they are local-only tools (`control-server.mjs:13`); `workflow_dispatch` with `dry_run` and `source` replaces them. `run.mjs` reads only `STREAM_PIPELINE_CONFIG_PATH` or `--config` and has no in-repo default |
| `scripts/team-catalog/` (`build.mjs`, `probe.mjs`, `validate.mjs`, `required-paths.json`) | New |
| `.github/workflows/espn-capture.yml`, `scripts/espn-capture/` | New in Phase 1c (O27 (a)); deleted in Phase 2a, when the probe's `live-capture` job replaces them; never added if Phase 2a merges first |
| `workers/team-worker/` (`src/index.js`, `catalog.js`, `streams.js`, `gates.js`, `durable.js`, `events.js`, `github.js`, `test/`) | New source for the same Cloudflare Worker |
| `.gitignore` | Adds `scripts/stream-pipeline/config.json`, `scripts/stream-pipeline/node_modules/`, `scripts/stream-pipeline/.probe-output/`, `scripts/team-catalog/.probe-output/` |

### Data flow

```text
team-catalog.yml (weekly): ESPN /teams + statsapi /teams -> probe -> build -> validate -> catalog/*.json on main
  catalog/*.json -> Worker allowlist + GET /catalog[/<league>] -> phone picker (bundled snapshot, 24 h cache)
  catalog/*.json -> stream-pipeline.yml TeamSpec (checkout copy)

Phone TeamScreen (only while open)
  schedule, live board, win chance ------> ESPN site/core JSON, MLB statsapi (direct, no Worker)
  GET /streams?team=<key> ---------------> Worker: league listing index (10 s, conditional) + blob cache by SHA
  POST /get-video {appKey, team, sport?, eventId} -> Worker gates (key, event in window, dedupe, limits)
                                                   -> repository_dispatch team-get-video
  stream-pipeline.yml (one concurrency group per team+sport)
    extract (read-only token): check request -> config -> schedule -> event window -> sources 1..N -> candidate
                               each step -> POST /run-progress (HMAC, progress only) -> Worker
    publish (write token, no browser): re-validate -> one commit to streams/<league>/<espnId>.json
                                       -> POST /run-status (HMAC) -> Worker
  Phone polls GET /streams?team=<key>&event=<id> every 5 s (X-Run-Progress shows site k of N) until an entry matches, X-Run-State is final, or 900 s
```

## App

### Types

```ts
// app/leagues/types.ts
export type LeagueKey = 'mlb' | 'nfl' | 'nba' | 'wnba' | 'nhl' | 'mls' | 'nwsl' | 'ncaa';
export type SportKey = 'football' | 'mens-basketball' | 'womens-basketball';
export type AdapterKey = Exclude<LeagueKey, 'ncaa'> | `ncaa/${SportKey}`;
export type TeamKey = string;                       // '<league>-<espnId>'
export type TeamRef = {                             // snapshot of catalog display data, refreshed by key
  espnId: string; name: string; nickname: string; location: string; abbreviation: string;
  color?: string; alternateColor?: string; logo?: string;     // colors '#RRGGBB'; logo https, a.espncdn.com only
  conference?: string;                                        // schools only, when the probe finds it
  statsapi?: { teamId: number; leagueId: 103 | 104 };         // MLB only
};
// app/selection/types.ts
export type ProTile = { kind: 'pro'; key: TeamKey; league: Exclude<LeagueKey, 'ncaa'>; team: TeamRef };
export type SchoolTile = { kind: 'school'; key: TeamKey; league: 'ncaa'; sports: SportKey[]; team: TeamRef };
export type Tile = ProTile | SchoolTile;            // sports non-empty, order football, mens-, womens-basketball
export type SelectionV1 = { schema: 1; tiles: Tile[]; updatedAt: string };
```

`TeamGame` (`app/team/engine/types.ts`) adds to today's game shape: `key` = `${adapter}:${gameId}:${officialDate}`, `adapter`, `gameId` (ESPN event id or MLB `gamePk`), `officialDate`, `gameNumber` (MLB doubleheader number, ESPN 1), `seasonType` (the list it came from), `scoresKnown`, and `scoreboard` (`baseball`, `periods` or `basketball`, the Basketball arena board; under O27 (c) NCAA basketball uses `periods` until Phase 7). The streams path is derived from the key by one rule shared with the pipeline, so it is not stored. Preset status (bundled logo and today's accent) is derived from the key in `app/selection/presets.ts`.

### League adapters

MLB stays on statsapi in both the app and the pipeline. The team id and league id (103 AL, 104 NL; hard-coded today at `GuardiansScreen.tsx:229-238`) come from the catalog. Statsapi already provides the doubleheader `gameNumber` (`guardiansSnapshot.ts:284`), resumed games and official dates (`scripts/guardians-stream-pipeline/lib/mlbSchedule.mjs:31-44,69-76`), Warmup and `startTimeTBD` (`guardiansSnapshot.ts:103-114,293`) and jersey numbers (`mlbLinescore.ts:138-211`). ESPN is used for MLB only for win chance (the nearest-start mapping in `app/guardians/espnWinChance.ts:42-77`, now keyed by `TeamGame.key`, which fixes the postponed-game cache at `:19,74`) and for logos.

ESPN leagues share one implementation; the rows differ only in config. The app adapter rows and the catalog league rows must agree, and `tests/leagues/run.mjs` asserts that they do.

| Adapter | ESPN path | Season year | Board | Record | Win chance | Evidence | Release |
|---|---|---|---|---|---|---|---|
| `nfl` | `football/nfl` | Jan–Feb → y−1 (`patriotsSnapshot.ts:57-59`) | periods Q4, OT, football situation | W-L-T | 2-way | in repo | `v2.0.0` |
| `ncaa/football` | `football/college-football` | Jan → y−1 (`cyclonesSnapshot.ts:115-117`) | same | W-L-T | 2-way | in repo | `v2.0.0` |
| `ncaa/mens-basketball` | `basketball/mens-college-basketball` | Jul–Dec → y+1 (`cyclonesSnapshot.ts:119-121`) | arena board (O27 (a), (b); periods under (c)), H2, OT | W-L | 2-way | in repo | `v2.0.0` |
| `ncaa/womens-basketball` | `basketball/womens-college-basketball` | same | arena board (O27 (a), (b); periods under (c)), Q4, OT | W-L | 2-way | in repo | `v2.0.0` |
| `nba`, `wnba` | `basketball/nba`, `basketball/wnba` | Jul–Dec → y+1; calendar | arena board, Q4, OT | W-L | 2-way; hidden when absent | probe | `v2.1.0` |
| `nhl` | `hockey/nhl` | Jul–Dec → y+1 | periods P3, OT, SO (new) | W-L-OTL | hidden when absent | probe | `v2.2.0` |
| `mls`, `nwsl` | `soccer/usa.1`, `soccer/usa.nwsl` | calendar | periods H2, ET, PK, minute clock (new) | W-D-L | 3-way when `tiePercentage` exists | probe | `v2.2.0` |

- Every "probe" row is confirmed by the Actions live probe before its phase starts, and its captures are committed under `tests/leagues/<adapter>/`. Captures cover the schedule per season type, the summary for a live and a final event, the predictor and probabilities, and `/teams`; soccer is captured both with and without `fixture=true`. For every basketball adapter (including the two NCAA rows) the live summary is an in-progress game with substitutions and fouls (Basketball arena board). For the two NCAA rows under O27 (a), the committed Phase 1c captures satisfy this. Phase 2a does not wait for the college season: out of season the NCAA board flags stay at their last captured state (off when no live capture exists), and a `live_capture` run follows when the season opens (Phase 2a). This sandbox cannot reach ESPN or statsapi.
- NHL record: computed from regular-season Finals when the schedule carries `period`, otherwise ESPN `team.recordSummary`. The probe decides which.
- Soccer uses `DRAW` in place of `TIE` and shows `Us N% · Draw N% · Them N%` with a grey middle segment. Today's bar is 2-way only (`app/guardians/WinChanceBar.tsx:14-17`).
- A league that the installed build does not support is hidden in the picker. A stored tile whose adapter is missing shows "This team needs a newer app version." on its screen.

### Team screen engine

`TeamScreen` is built from the Cyclones screen, which already fans out across sports, isolates per-sport failures, shows one featured card per game today (Live, then today's games not yet finished, then today's finals until local midnight; shipped for Cyclones in `v1.4.18`) and keeps a record per sport. A pro tile is a one-league tile. Sport labels on the card and schedule rows (`CyclonesScreen.tsx:927,1667-1669`) appear only when a tile has more than one sport, so Guardians and Patriots look as they do today.

Screen contract: record hero; featured game (Live, else today's next game, else today's recap until local midnight); countdown; live board every 5 s; Final recap WIN/LOSS/TIE (DRAW for soccer); win-chance bar; schedule without completed games; Play, Get video, Listen, Cast, TV send; pull-to-refresh; Android Back closes the player first (`GuardiansScreen.tsx:1446-1464`).

The three screens diverge today in seven places. The engine picks one behavior for each:

| Divergence | Chosen | Visible change |
|---|---|---|
| Seasontype source | The list the event was fetched from (`espnNfl.ts:59`), not the event field (`cyclonesSnapshot.ts:612-616`) | None expected |
| Unparseable score | Kept out of the record (`patriotsSnapshot.ts:96-121`) | Cyclones: a Final with no published score no longer counts as 0–0 (`cyclonesSnapshot.ts:439-454`) |
| Live game with a TBA time | The video window opens (`GuardiansScreen.tsx:875-881`) | Patriots now shows Play and Get video (today closed, `PatriotsScreen.tsx:776-780`) |
| Board kept on schedule refresh | `liveMerge.ts`: keep the previous state, score and board when its state rank is higher or the last live poll was requested after the snapshot request; keep the polled board while Live and polled within 30 s; fill missing jersey numbers from the previous board (`GuardiansScreen.tsx:129-176`, `PatriotsScreen.tsx:133-174`, `CyclonesScreen.tsx:149-200`) | Patriots: after a live-poll stall of more than 30 s, the schedule board shows until the next poll |
| Partial schedule failure | The Cyclones rule for every adapter: any failed season-type list carries that adapter's previous games, record and postseason status forward and marks the snapshot incomplete, and the next tick retries (`app/cyclones/espnCyclones.ts:33-34,62-75`, `CyclonesScreen.tsx:254-309`). Record and postseason status are never computed from part of a schedule | Patriots: a failed pre- or post-season list keeps the previous schedule instead of a partial one (`espnNfl.ts:39-45`) |
| Recap day (ESPN) | The phone-local date of the start time when it is known, else the official date; MLB keeps the statsapi official date. Cyclones today matches the Chicago official date to the local day (`cyclonesSnapshot.ts:406,418-422`) | None for Central phones |
| Kickoff refresh | One `pendingStartKeyRef` and a forced load; the spinner is always cleared | None |

- Featured pick: the Guardians superset (`guardiansSnapshot.ts:179-255`: carried-over delay, demotion of suspended-but-Live games, makeup de-duplication), applied across all of a tile's leagues in the Cyclones cross-sport order.
- NCAA postseason (`cyclonesSnapshot.ts:237-394`) moves to `postseason.ts`. Football keeps its own path: only the College Football Playoff is a knockout, any other bowl ends the season (`:254-259`). For basketball the Big 12 literals (`:247-248`) become: a conference tournament game is one whose notes contain `conference tournament`, or a seasontype 2 game whose notes contain `tournament` or `championship`, or a game whose notes name the school's `conference` together with either word. A seasontype 3 game whose notes contain `tournament` and are not NCAA, NIT, WBIT or WNIT stays a knockout named `tournament` (`:280-282`), which covers CBI and CIT. Fixtures add CBI, CIT, a CFP game and a non-Big 12 conference final.
- Stream match (`streamMatch.ts`, sharing fixtures with the pipeline): an entry with `eventId` matches when the event id is equal and `gameDates` includes the game's current official date, so an entry for a postponed event that kept its id does not show Play on the new date. An entry without `eventId` matches when `gameDates` includes the official date and `gameNumbers` includes the game number. School files also require the same `sport`. Official date: MLB uses the statsapi `officialDate`; ESPN uses the America/New_York date (O4). The parser ignores unknown keys. `GOOZ_HOST` path validation (`guardiansSources.ts:82-101`) stays. Fixtures add a postponed ESPN event that keeps its id and an MLB resumed game.
- Identity in the UI: catalog `nickname` (the mascot, from ESPN `team.name`) replaces the short team literals (`GuardiansScreen.tsx:89,185,206,546,753,914,961,974,1094,1562,1677`); `team.name` (ESPN `displayName`) replaces the full-name strings at `:1556` (hero accessibility label) and `:1674` (audio artist). The board label is `nickname.toUpperCase()` when it is 10 characters or fewer, else `abbreviation`. The accent is the preset color (Guardians and Patriots `#E31937`, Cyclones `#AE192D`), else the catalog `color` when its contrast with white is at least 3:1, else `alternateColor` when it passes, else `#1F6F55` (`app/app.json:10`).

### Basketball arena board

Owner request (2026-11-03): a basketball board like a gym scoreboard. A center panel holds the game clock, the period, both team names with big scores, team fouls, timeouts left and the last player foul (jersey and that player's foul count); each team's five players on the floor are listed with jersey (`#`), fouls (`FL`) and points (`PTS`). Team names are text: no logos, school marks or other branding. Today's basketball board shows per-period points, the clock and the period only (`app/cyclones/CyclonesBasketballScoreboard.tsx:39-138`; data `app/cyclones/espnCyclonesScoreboard.ts:21-28,211-252`).

`BasketballArenaBoard` replaces that board for every basketball adapter; football keeps `PeriodScoreboard` and MLB keeps `BaseballScoreboard`. Like today's boards it renders only while the featured game is Live, and the Final recap keeps the score box (`app/cyclones/CyclonesScreen.tsx:972-986`). When it ships is O27. A clickable phone mockup of the live board and its halftime, lineup-not-reported and overtime states is the owner's private Basketball Board Mockup artifact (https://claude.ai/artifact/TsjeRrQvGRp8AHHvYxYKh4), drawn to this section's launch flags (no `T.O.L.` row).

Evidence tags in this section: (R) repo code. (A) holds in every relevant sample of 17 archived post-game ESPN `summary?event=` bodies: NCAA men 401638645 (2024 final), 401851289, 401856561, 401856573, 401858385; NCAA women 401827421, 401827429, 401856504, 401856552; NBA 401584893, 401866759, 401871327, 401871329, 401873341; WNBA 401918018, 401918305, 401918310. They come from the sportsdataverse archives (`hoopR-mbb-raw`, `wehoop-wbb-raw`, `hoopR-nba-raw`, `wehoop-wnba-raw`), which keep a fixed list of top-level keys, so a missing top-level key such as `situation` proves nothing. No sample is a live response: every (A) item is unverified for live games until a live capture (Phase 1c or Phase 2a) confirms it. (U) unverified: rule-book knowledge or third-party text.

Every cell comes from the summary that the live poll already fetches; `T.O.L.` may need one more request (O27). The parser `basketballBoardFromSummary` is pure and recomputes the board from the full arrays of each response, so late-inserted plays and corrections apply. The caller keeps exactly two things per event between polls: the length of the last applied `plays` array, and the last good player-derived cells (tables, team fouls, bonus, last foul) with the time they were applied (Polling).

| Cell | Source and derivation | Fallback | Evidence |
|---|---|---|---|
| Clock | `header.competitions[0].status.displayClock`, as today (`espnCyclonesScoreboard.ts:232-235`), shown as sent. No local ticking: ESPN sends no running flag, and the clock stops on every whistle | `-:--`, spoken "not available". The last play's `clock.displayValue` is not used: during a stretch with no plays it can be minutes behind the game clock | R; live format U. Plays use `M:SS`, with tenths under a minute (`57.1`) in NBA and WNBA (A) |
| Period, phase | `status.period`; the regulation count from `format.regulation.periods` (2 or 4) in place of the sport constant (`CyclonesScreen.tsx:846`); later periods `OT`, `2OT`, … as `periodLabel` does (`CyclonesBasketballScoreboard.tsx:14-24`). Phase text (`3RD QTR`, `HALFTIME`, `END OF Q1`) from `status.type.name`, else `status.type.detail` | The last play's `period.number`; end of a period from play type `412` | `format` and play types A; status names U |
| Scores | `competitors[].score`, as today (`espnCyclonesScoreboard.ts:105-147`) | — | R |
| Players on the floor | Per team: the five `starter: true` athletes in `boxscore.players[].statistics[0].athletes[]`, then each substitution play (`type.id` `584`) in array order, never by `sequenceNumber`. Two participants (NBA, WNBA): `participants[0]` enters, `participants[1]` leaves. One participant (NCAA): the text says `subbing in` or `subbing out`, so one swap is two plays. The pending group is the run of substitution plays after the last non-substitution play; while it leaves a team with other than 5 players, that team shows its set as of the last non-substitution play, still as on the floor. The check passes when: there are exactly 5 starters; no swap adds a player already in or removes one not in; the set has 5 at every non-substitution play; every player in a later non-substitution play is in the set (plays whose `wallclock` precedes the previous play's are skipped here as late inserts); and no player whose foul plays reach the foul limit (counted with the Last foul matcher; NBA and WNBA leave out technicals), or who has an Ejection play (`517`), is still in the set at a non-substitution play after the game clock has run past that play (a lower clock in that period, or a later period). Plays are counted, not box PF, so a box that runs ahead of the plays (live ordering U) cannot fail the check. The check rejects inconsistent data; it cannot prove the lineup (below the table) | Per team: 1. With `activeLineup` on (flags table): exactly five `active: true` athletes that include every player in the team's plays since its last substitution. 2. Otherwise that team's table shows its five top scorers under `TOP SCORERS`, never as on the floor. 3. Before the first play: the starters under `STARTERS` | A: 16 of 17 samples replay 1,476 substitutions with no bad swap and end on the final `active` set. In the 8 NCAA samples that log substitutions, 8.5-19.6% of play-array prefixes end inside a substitution group (runs of up to 5 plays) with a team at 2, 3, 4 or 6 players, while every non-substitution play has 5 per team. All 12 players who foul out or are ejected leave the set before the clock runs again, one only after 7 plays at the same clock (401856552). The 2024 men's final logs no substitution and no `active` player, and the check sends it to the fallback. Mid-game `active` U |
| `PTS`, `FL`, `REB` | Box columns found by `keys` (`points`, `fouls`, `rebounds`; `labels` `PTS`, `PF`, `REB` as fallback), never by position, because the column order changed between the 2023-24 and 2025-26 seasons. String values are parsed like `finiteCount` (`espnCyclonesScoreboard.ts:38-53`) | `–` | A. NCAA box PF counts technical fouls; NBA and WNBA box PF does not |
| Jersey | `athlete.jersey`, kept a string (`0` and `00` differ). No extra request, unlike MLB (`app/guardians/mlbLinescore.ts:159-190`) | `–` | A |
| Foul trouble, fouled out | PF = limit − 1 inverts the `FL` cell. PF ≥ limit, or an `Ejection` play (`517`, `participants[0]`), marks the player out. The box `ejected` flag is not read: it is false for both players ejected in 401866759 | — | Ejection A for NBA only (401866759 is the only sample with a `517` play); NCAA and WNBA ejections U; limits U |
| Team fouls (`FOULS`) | No per-period field exists, and the box `fouls` total covers the game (A). The board counts the team's foul plays (`team.id`, always the fouler's team) in the current window. NCAA: `519` PersonalFoul and `521` Technical Foul. NBA, WNBA: `type.text` containing `foul` and none of `offensive`, `technical`, `double`, `turnover` or `free throw` | `–` | Play types A; which fouls count toward the bonus U |
| Bonus | A `BONUS` or `2× BONUS` pill under the team that shoots, from the opponent's count in the window (rules in the next table). Hidden at halftime, between periods, and when `format.regulation.periods` differs from the adapter row | Hidden; never derived from a missing count | U. The NBA and WNBA rule predicts the free throws of 169 of 172 non-shooting fouls in 8 samples, every miss an `Away from Play Foul` (A); ESPN data cannot check the NCAA rule |
| Last foul | The newest play in array order whose `type.text` matches `foul` or `charge` and not `turnover` or `free throw`, with a participant. The player is `participants[0]` (637 of 638 foul plays, A). Shows that jersey and box PF; an arrow points to the fouling team | `–` wells, no arrow | A |
| Timeouts left (`T.O.L.`) | Only an ESPN field that holds each team's remaining timeouts. No sample has one: the top-level `timeouts` key is an empty array in all 17 post-game bodies, and `header.competitions[0].timeoutsAvailable` is a boolean, true in every NBA and WNBA sample and the 2024 men's final, false in every 2025-26 NCAA sample, with no count (A). Live candidates, all U: the top-level `timeouts`, a `situation` key, and the Core `…/competitions/{id}/situation` resource (one extra request per poll, O27) | Row omitted. Never counted from timeout plays and allotments: challenge outcomes and unlogged timeouts make such counts drift (A) | U |
| Possession arrow, shot clock | Not shown. No sample has a shot-clock field (A). The arrow appears only if a capture shows `possessionArrowAvailable` true with exactly one `competitors[].possession` true, and confirms that it means the arrow | — | U |

What the lineup check cannot catch: a whole substitution pair that ESPN never logs, or a lineup change at a period start with no `584` play, keeps every swap valid and the set at 5. The wrong five then show as on the floor until the player who came in appears in a play, or the player who left is later subbed in or out. Fallback 1 can carry the same error if `active` follows the same feed. The `Basketball arena board live game` Validation row measures how often this happens in live games.

Capability flags and foul rules live in `app/leagues/espn/basketballRules.ts`, keyed by adapter key; the basketball adapter rows (League adapters) point to it, and the caller passes the row to the parser. A flag turns on only after a live capture for that adapter holds the paths it needs. A flag that is off omits its row instead of dashing it; with `players` off the board is the center panel only. `activeLineup` turns on only when, at every captured poll where the replay passes and no substitution group is pending, each team has exactly five `active: true` athletes and they equal the replay; with it off, fallback 1 is skipped.

| Flag or rule | `ncaa/mens-basketball` | `ncaa/womens-basketball` | `nba` | `wnba` |
|---|---|---|---|---|
| `players` (tables), `rebounds` (REB on tables of 180 dp or more), `teamFouls`, `bonus`, `lastFoul` | On after the first live capture (Phase 1c; under O27 (b) the first one, in Phase 2a or later) | Same | On after the Phase 7 probe | Same |
| `activeLineup` (fallback 1) | Off until live captures pass the `active` test above | Same | Same, from Phase 7 | Same |
| `timeouts` | Off until a live capture shows remaining timeouts that track the timeout plays (O27) | Same | Same | Same |
| `possessionArrow` | Off | Off | n/a | n/a |
| Foul window | Each half; overtime continues the second half (U) | Each quarter; overtime continues the fourth (U) | Each quarter; each overtime its own | As NBA |
| Bonus (opponent's count in the window) | ≥ 6 `BONUS` (one-and-one); ≥ 9 `2× BONUS` | ≥ 4 `BONUS` (two shots) | ≥ 4; overtime ≥ 3; in the last 2:00 of a period, ≥ 1 foul inside those 2:00 | As NBA; rule texts disagree on overtime and the last 2:00 (U) |
| Player foul limit | 5 | 5 | 6 | 6 |

Limits and thresholds are rule-book values (U); each tag that ships them is preceded by a check against the current NCAA, NBA and WNBA rule books.

Layout. The pure `arenaLayout(W)` picks the mode from the board's inner width W = min(window width, 720) − 76: the 720 dp column with 18 dp padding (`CyclonesScreen.tsx:1725-1729`), the card's 3 dp border and 20 dp padding (`:1831-1837`), a 12 dp bleed of the board into that padding, and the board's 1 dp border and 8 dp padding.
- `split` (236 ≤ W < 612, every phone in portrait): the center panel spans the board, and both player tables sit side by side under it, each (W − 8)/2 wide. `arena` (W ≥ 612, landscape phones and tablets): away table, center panel and home table in one row, like the gym board. `stacked` (W < 236, split screen): center panel, then each table at full width. The center scales by s = clamp(W/284, 0.8, 1.25).
- At a 360 dp window (W = 284, s = 1): score wells 82 × 56 dp with 40 dp digits, clock well 104 × 56 dp with 34 dp digits, stat wells 32 dp high with 22 dp digits, tables 138 dp wide with 28 dp rows and 20 dp digits (`#`, `FL`, `PTS`; `REB` only on tables of 180 dp or more), labels 12 dp. The floor is 16 dp table digits at W = 236. The board is about 471 dp tall, so for basketball it renders after the Play/Listen row (`CyclonesScreen.tsx:1007-1065`), which keeps Play on the first screen of a 360 × 780 dp phone.
- Kept from today's boards: the navy `#07264A` panel, black `#05070A` wells and amber `#FFCF4A` tabular digits (`CyclonesBasketballScoreboard.tsx:144-154,188-201`), with no seven-segment font, glow or animation. Today's 10 dp labels (`CyclonesBasketballScoreboard.tsx:165,172,179`) become 12 dp, toward the large-copy rule (`Docs/Art/README.md:14`). The followed team gets a 4 dp accent stripe instead of accent text, because Cyclones `#AE192D` on the navy panel is 2.15:1. The opponent's stripe uses its `color` when its contrast with the panel is at least 3:1, else its `alternateColor` when that passes, else `LABEL_MUTED` `#C7D2DD`: in Phase 1c both come from the summary's `header.competitions[0].competitors[].team` (hex without `#`, present in every NCAA sample, A), from Phase 3 from the catalog; a board built from the schedule event keeps the previous board's stripe color for the same game. Board labels in Phase 1c keep today's rule (`CYCLONES`, else the last word of the opponent's name in upper case, `CyclonesBasketballScoreboard.tsx:6-12`), moved into `arenaText.ts`; Phase 3 replaces it with the nickname rule (Team screen engine). Away is left and home right, as in today's basketball board, which lists away over home (`CyclonesBasketballScoreboard.tsx:99-129`). The period-by-period line score is dropped, and nothing scrolls sideways. The tables show jersey numbers only, like a gym board; player names are spoken.
- Lineup captions: in `split` and `stacked` modes one caption sits over the tables, `PLAYERS ON THE FLOOR` when both teams pass and `TOP SCORERS (LINEUP UNKNOWN)` when both fail; when only one team fails, each table carries its own caption (`ON THE FLOOR` or `TOP SCORERS`) in that row, so the height does not change. In `arena` mode each table already has its own title row.

Mock at 360 dp (women's game, third quarter, launch flags, so no `T.O.L.`):

```text
+----------------------------------------------+
| =============                  ~~~~~~~~~~~~~ |
| CYCLONES                            JAYHAWKS |
| +-----------+ +--------------+ +-----------+ |
| |     36    | |     2:09     | |     9     | |
| +-----------+ +--------------+ +-----------+ |
|                   3RD QTR        ( BONUS )   |
| FOULS   [ 6 ]   PERIOD [ 3 ]   [ 3 ]   FOULS |
|                 < LAST FOUL                  |
|                 [ 41 ] [*4*]                 |
| -------------------------------------------- |
|             PLAYERS ON THE FLOOR             |
| =====================  ~~~~~~~~~~~~~~~~~~~~~ |
| CYCLONES               JAYHAWKS              |
|   #      FL    PTS       #      FL    PTS    |
| [ 3  ] [ 2 ] [  8  ]   [ 1  ] [ 1 ] [  2  ]  |
| [ 11 ] [ 1 ] [  6  ]   [ 4  ] [ 0 ] [  3  ]  |
| [ 22 ] [ 0 ] [  9  ]   [ 10 ] [ 2 ] [  0  ]  |
| [ 24 ] [ 3 ] [  5  ]   [ 21 ] [ 1 ] [  4  ]  |
| [ 41 ] [*4*] [  8  ]   [ 32 ] [ 3 ] [  0  ]  |
+----------------------------------------------+
```

`=` is the followed team's stripe, `~` the opponent's, `[ ]` an LED well, `*4*` a foul-trouble cell (amber fill, black digit), `( BONUS )` the pill under the team that shoots (the Cyclones have 6 fouls, at least the women's 4; the Jayhawks' 3 put no pill under the Cyclones), and `<` points to the fouling team. A fouled-out player gets a red cell, a struck-through jersey and dimmed digits. If a live capture confirms an ESPN timeouts field, `T.O.L.` wells return on both sides of the last-foul wells, as on the gym board.

Files. The pure modules have no runtime import of a sibling (types only, through `import type`), so they run under plain Node before `allowImportingTsExtensions` (Phase 2b) and need no edit in Phase 3.

| Path | Contents |
|---|---|
| `app/leagues/espn/basketballBoard.ts` (pure) | `basketballBoardFromSummary(summary, rules)` → `BasketballBoardModel`: lineup replay and fallbacks, box columns, foul windows and bonus, last foul, clock and period fallbacks |
| `app/leagues/espn/basketballRules.ts` (pure) | Per adapter: capability flags, foul window, bonus thresholds and player foul limit (the table above); Phase 7 adds `nba` and `wnba` |
| `app/scoreboards/basketball/BasketballArenaBoard.tsx` | Center panel, player tables, LED wells, bonus pill, stale note |
| `app/scoreboards/basketball/arenaLayout.ts` (pure) | `arenaLayout(W)` → `{mode, s, tableWidth, showReb}` |
| `app/scoreboards/basketball/arenaText.ts` (pure) | Board labels (the Phase 1c rule), lineup captions, phase and period text, clock words, row order (jersey order on the floor; points, then jersey, for leaders), foul tone, bonus side, spoken summaries |
| `app/scoreboards/basketball/arenaTokens.ts`, `types.ts` (pure) | Colors; `BasketballBoardModel`, `BoardSide`, `BoardPlayer` and the capability flags |

Under O27 (a) Phase 1c writes these files at these paths, wires them into the Cyclones screen at the touch points its scope lists, renders the board in place of `CyclonesBasketballScoreboard` (`CyclonesScreen.tsx:841-850`) and deletes the old board; Phase 3 moves the call to `FeaturedGameCard`, which uses the board when `TeamGame.scoreboard` is `basketball`. Under (b) and (c) the old board leaves with `app/cyclones/` in Phase 3, and under (c) `PeriodScoreboard` serves basketball until Phase 7.

Polling: no new request, except the Core situation request under the O27 timeouts sub-decision; any other extra request is a new owner decision. The 5 s summary poll (`CyclonesScreen.tsx:90,1342`, `espnCyclonesScoreboard.ts:382-406`; `app/leagues/espn/` from Phase 3) already downloads and parses `boxscore` and `plays` (`response.json()`, `espnCyclonesScoreboard.ts:400`); the board adds a walk over at most about 600 plays per poll. Each archived body is 180-532 KB minified between mid-game and the final buzzer (A); today's poll already downloads that every 5 s, and whether the transfer is compressed is U. The `request <= latestApplied` guard stays (`CyclonesScreen.tsx:1346`). Score, clock, period, phase, status and state always apply from the newest response, as today (`:1346-1395`), so Live → Final and the score are never held back. A response whose `plays` array is shorter than the last applied one for the same event keeps the previous player, team-foul, bonus and last-foul cells for up to 30 s (`LIVE_BOARD_FRESH_MS`, `CyclonesScreen.tsx:93`; `liveMerge.ts` from Phase 3); after that the shorter array applies and its length becomes the new baseline, because ESPN corrections can delete plays. Players carry forward from the last good poll for up to 30 s the same way. If a live capture shows the summary without `boxscore.players` or `plays`, those flags stay off.

| State | Board |
|---|---|
| Not yet Live; Final | Not rendered: the countdown before (`CyclonesScreen.tsx:988-995`), the recap score box after (`:972-986`) |
| Live | Full board |
| Halftime, end of a period | Phase text `HALFTIME`, `END OF Q1`, `END OF REG`; the clock as sent; bonus pills hidden |
| Overtime | `OVERTIME`, `2ND OT`; period well `OT`, `2OT` |
| Interruption while Live | Board unchanged under the amber box (`CyclonesScreen.tsx:884,956-962`) |
| A value missing in one update | That well shows `–` (the clock `-:--`), spoken "not available" |
| Substitution group pending (the `plays` array ends between an exit and an entry) | That team's set as of the last non-substitution play, still on the floor; no label change |
| Lineup check fails for a team | That team's table shows top scorers (Lineup captions) |
| No players for 30 s | `PLAYER STATS NOT AVAILABLE` over dash rows; the height does not change |
| No successful poll for 30 s | `Not updated for 30 s`, then `Not updated for N min` with N the whole minutes since the last successful poll, under the board in the card's grey text |

Accessibility: three focus stops, the center panel and each table, each one element with `accessibilityRole="text"` and a spoken summary, extending today's single element (`CyclonesBasketballScoreboard.tsx:74-88`). Example: "Cyclones 36, Jayhawks 9. Third quarter, 2 minutes 9 seconds left. Team fouls: Cyclones 6, Jayhawks 3. Jayhawks in the bonus. Last foul: Cyclones number 41, 4 fouls, foul trouble." Each table reads "Cyclones players on the floor." (or "Cyclones top scorers, lineup not available."), then "Number 3, <short name>, 8 points, 2 fouls." per row. A clause whose flag is off is dropped. Nothing on the board is touchable, and no `accessibilityLiveRegion` is set, because 5 s updates would interrupt reading. Digits use `maxFontSizeMultiplier={1}` inside fixed wells, are already larger than the card's body text, and are all in the spoken text; labels allow 1.3 with `adjustsFontSizeToFit`. Color is never the only cue (`Docs/Art/README.md:18,22`): foul trouble inverts the cell, fouled out adds the struck-through jersey and dimmed digits, the bonus is a text pill, and the followed team is named in text. Contrast (WCAG 2.x): digits 13.71:1 (`#FFCF4A` on `#05070A`), labels at least 9.88:1 (`LABEL_MUTED` `#C7D2DD` on the `#07264A` panel), the fouled-out cell 7.05:1 (`OUT_DIGIT` `#FFFFFF` on `OUT_FILL` `#B20D27`, the screen's `liveBadgeText` red, `CyclonesScreen.tsx:1878`).

Tests (Tests table): `tests/scoreboards/run.mjs` covers the pure layout and text modules, including `arenaLayout(284)` for a 360 dp window (`split`, s = 1, 138 dp tables, no `REB`) and the spoken example above. A pure lineup-derivation test runs `basketballBoardFromSummary` on trimmed archived games (401638645: no substitutions, so the fallback; 401856573: a late-inserted foul; 401851289: NCAA technicals in PF; 401866759: ejections; 401856552: a fouled-out player on the floor for 7 plays at one clock) and on live captures replayed play by play. The archived games sit in `tests/scoreboards/archived/<adapter>/` (`/` in the adapter key written as `-`), which `tests/leagues/run.mjs` does not read, so NBA and WNBA samples need no adapter row before Phase 7. Every prefix of each NCAA capture and archived NCAA game is replayed, and no team's label flips inside a substitution group. Synthetic cases: an exit logged before its entry, a duplicate entry, an unknown id, 4 or 6 starters, an array that ends between the `subbing out` and `subbing in` plays of one NCAA swap (still on the floor, with the set before the group), one team failing while the other passes (per-table captions), and a fouled-out player left in the set after the clock runs (the check fails). Two synthetic cases pin the known gap: an unlogged substitution pair, and an unlogged change at the start of periods 2 and 3 (no `584`); each shows the wrong five as on the floor until a later play by the player who came in, then `TOP SCORERS`. Poll cases: a Final response with fewer plays than the last live one moves the card to Final with its score; a shorter live response keeps the player cells for 30 s, then applies. `tests/leagues/<adapter>/` holds, per basketball adapter, an in-progress summary with substitutions and fouls in the current period, a halftime or between-periods summary and a final, each with its expected board model. The device harness adds a basketball live scenario on a 360 dp-wide emulator.

Validation rows: `Basketball arena board (unit)`; `Basketball arena board live capture`, one per adapter (capture date, the `active`-versus-replay result and whether `activeLineup` turns on, what the top-level `timeouts`, any `situation` and the Core situation resource hold, the flags turned on); `Basketball arena board 360 dp` (emulator: no sideways scroll, Play above the board, three accessibility labels); `Basketball arena board live game` (a family phone during a live game: at two checks each team's five match the broadcast, or that team's table shows top scorers; a wrong five labelled as on the floor is recorded with the play index).

Design defaults, each held in one module: away left (the app's order, not the gym's home left), the board below the Play/Listen row, no line score, the 12 dp bleed, system tabular digits, foul trouble at limit − 1 only, and jersey numbers only on screen.

### Hub

Tile order is the selected tiles in stored order, then TV Location (fixed, cannot be removed), then `+`. A fresh install shows TV Location and `+`. A seeded family phone shows Guardians, Patriots, Cyclones, TV Location and `+` (5 tiles, 3 columns). Grid math lives in `app/hub/hubGrid.ts` (pure). W and H come from the hub container's `onLayout`, which already excludes the top and bottom insets of `SafeAreaView edges={['top','bottom']}` (`app/App.tsx:31`); in landscape the left and right insets from `useSafeAreaInsets()` are subtracted from W.

```text
n = tiles including TV and +;  cols = max(2, ceil(sqrt(n)));  rows = ceil(n / cols)
span(k) = k + (k - 1) * GAP_RATIO        GAP_RATIO = 28 / 101.2   MAX_TILE = 101.2
portrait (W < 1.1 * H):
  topReserve = (signing warning or update spinner visible) ? 112 : 16    the warning shows only on SideStore copies (O24)
  for L in [210, 180, 150, 120]:                       logo steps down only while height binds
    logoTop = max(topReserve, H/3 - 105);  regionTop = logoTop + L + 24;  regionH = H - regionTop - 16
    tile = min(MAX_TILE, (W - 32) / span(cols), regionH / span(rows))
    accept L when height does not bind or tile >= 72
  tile < 64 -> scroll mode
landscape (W >= 1.1 * H): logo pane = left 35% of W; grid in the rest; same tile formula
scroll mode: logo 210; cols = largest c <= cols with (W - 32) / span(c) >= 64; grid in a ScrollView
placement: gap = tile * GAP_RATIO; rows left-aligned so columns stay put as tiles are added;
  block centered on 2H/3 while it clears regionTop (today's anchor, HubScreen.tsx:387-395)
```

| Usable dp | n = 2 | n = 5 | n = 9 | n = 10–16 | n ≥ 17 |
|---|---|---|---|---|---|
| 412×840 phone | 2 cols, 101.2 | 3 cols, 101.2 | 3 cols, 101.2 | 4 cols, 78.7 | scroll, 4 cols, 78.7 |
| 375×647 small phone (removes today's 4–5 dp logo overlap) | 101.2 | 96.5 | 80.6 | 71.0, logo 210 → 150 at n = 16 | scroll, 4 cols, 71.0 |
| 780×380 landscape | 101.2 | 101.2 | 97.9 | 97.9 → 72.0 | 72.0; scroll below 64 |
| 800×1200 tablet | 101.2 | 101.2 | 101.2 | 101.2 | 101.2 up to 28 team tiles (n = 30); 88.7 at 29–30 team tiles (6 rows) |

Tiles (`HubTile.tsx`) keep today's 2 dp `#A9CEBB` border, radius 14, shadow and pressed style (`HubScreen.tsx:402-420`):
- Preset: the bundled JPG with `cover`. Catalog team: the cached PNG with `contain` and 12% padding on white. With no cached file, a fallback shows `abbreviation` in bold on the accent color, in white or black by contrast.
- TV Location keeps today's art and labels (`HubScreen.tsx:328-343`). The `+` tile is white with a `#1F6F55` glyph, label `Add team` and hint `Opens the team picker`. It stays at the 30-tile cap (O18).
- A team tile's label is `team.name`, which keeps today's harness tap targets (`tests/guardians/run-get-video.mjs:425`, `tests/patriots/run-get-video.mjs:450`, `tests/cyclones/run-get-video.mjs:461`).
- A long press opens `TileActionsSheet`, a React Native `Modal` (Android `Alert` allows only three buttons): `Move to front`, `Move earlier`, `Move later`, `Change sports` (schools only), `Remove from hub` (with a confirmation), `Cancel`. The same actions are exposed as `accessibilityActions`. There is no drag reorder, because it would need `react-native-gesture-handler` and `reanimated`, which are not dependencies (`app/package.json:44-58`). Removing a tile deletes its sources cache and logo file.
- Update prompt: the hub is unmounted while a team screen, the picker or TV Location is open, so `hubMounted` (`HubScreen.tsx:85-92`) still suppresses the prompt. While the actions sheet or a confirmation is open, `hubVisible` is false. From Phase 1b the install prompt is Android-only, and iPhones get the TestFlight notice under the same rules (O24).

### Picker

`app/picker/TeamPickerScreen.tsx` is its own route and has its own Android `BackHandler`.

| Step | Content | Rules |
|---|---|---|
| 1. Add a team | MLB, NFL, NCAA football, NCAA men's basketball, NCAA women's basketball; later releases add the O11 and O12 leagues. Phase 9 adds `Share these teams` and `Paste a team code` (O13). At 30 team tiles the screen shows `Hub is full (30 teams)` and disables every add row (O18) | A league appears only when it is in the build's `SUPPORTED_ADAPTERS` and `pickable` in the catalog |
| 2. Team or school | A search box (ignoring case and accents, over name, nickname, location and abbreviation) and a `FlatList` with fixed row height (NCAA lists have 360+ schools). Retired entries are not listed | A pro team already on the hub shows `On hub` and is disabled. A school already on the hub shows `On hub · Football, …` and opens step 3 |
| 3. Sports (schools only) | Checkboxes for the sports the catalog lists for the school. Pre-checked: the existing sports plus the sport picked in step 1 | Save merges the sports into the tile. Unchecking every sport asks whether to remove the tile |

Pure operations in `app/selection/ops.ts`: `addPro` (no-op when the key exists), `addSchoolSports` (union into an existing `ncaa-<id>` tile, else append), `setSchoolSports` (an empty list removes the tile), `removeTile`, `moveTile`, `applyFamilyPreset` (appends the missing presets in the order Guardians, Patriots, Cyclones; merges Cyclones' sports into an existing `ncaa-66` tile). New tiles go after the last team tile. Adding past 30 team tiles is refused.

Catalog in the app: a bundled `app/picker/catalogSnapshot.json` (a copy of `catalog/`, refreshed by a pre-release script so the picker works offline) is replaced by the cached copy in `danner.catalog.v1` when that copy is newer. The cache is refreshed when the picker opens and is older than 24 h. A refresh updates the stored tiles' `TeamRef` fields by key (rebrands), but never their order or sports. The parser ignores unknown keys.

### Logos

- New dependency `expo-file-system` (SDK 57). Files in the document directory survive in-place updates; image disk caches are evicted by size and age.
- `logoStore.ts` downloads `team.logo` (https, `a.espncdn.com` only) to `logos/<TeamKey>.png` under the document directory and indexes it in `danner.logos.v1` by that relative name only. The path is resolved against the current document directory at runtime, because iOS can move the app container path on an update. When the hub mounts, it backfills, two at a time and only while online, every logo whose file is missing (not whose index entry is missing). A changed `logo` after a catalog refresh triggers a new download.
- `TeamLogo.tsx` uses the bundled preset JPG, else the cached file, else the fallback tile. The same component feeds the hub tile and the team hero; today these are three separate `require`s (`GuardiansScreen.tsx:1558`, `PatriotsScreen.tsx:1441`, `CyclonesScreen.tsx:1567`).

### Navigation and load guard

- `app/App.tsx` uses a `Route` union of `hub`, `team {tileKey}`, `picker {start?}` and `tv-location`. `<TeamScreen key={tile.key}>` mounts fresh for each tile. A team route whose tile no longer exists renders the hub.
- `SplashScreen.preventAutoHideAsync()` holds the splash screen until the selection has loaded. `expo-splash-screen` is already a dependency (`app/package.json:51`) but is unused today. Family phones therefore never flash the fresh-install hub.
- If AsyncStorage throws or does not answer within 3 s, the hub shows TV Location and `+` read-only: no seeding and no writes for that session. The next foreground retries.

### Polling and Worker use

| Surface | Network | Cadence |
|---|---|---|
| Hub | Update manifest (existing, `HubScreen.tsx:84-239`; Android only from Phase 1b), `testflight.json` (iPhone only, from Phase 1b) and logo backfill | On mount or app active. Tiles show no live data and never fetch ESPN, statsapi or the Worker |
| Picker | `GET <worker>/catalog`, `/catalog/<league>` (ETag); raw `main` fallback | On open when the cache is older than 24 h |
| Open TeamScreen | Schedule (leagues × season types; 9 requests for a 3-sport school, as today, `espnCyclones.ts:35-60`), live board, win chance, streams | 60 s tick with 10 min snapshot staleness; 5 s live board; 10 min / 30 s win chance (`espnWinChance.ts:23-24`). Streams on open, pull-to-refresh and foreground, and every 60 s only while a game is Live or from 45 min before its start to the end of its grace period. All of it stops when the app is not active and on unmount |
| Get video | `POST <worker>/get-video` `{appKey, team, sport?, eventId}`, then `GET /streams?team=<key>&event=<id>` | Every 5 s until an entry matches, `X-Run-State` reports a final code, or 900 s (Decided 18); each poll updates the progress line (Get video progress) |

Streams fetch chain per tile: Worker `/streams?team=`, then raw `main/<streams path>` (with a commit-SHA lookup only during a Get video session, as today), then the last valid copy in `danner.sources.<TeamKey>.v1`. The phone's handling of each Get video answer and run state is in the Worker v2 code tables. Dev-only hooks (`__DEV__`): `EXPO_PUBLIC_TEAM_TEST_URL` and `EXPO_PUBLIC_TEAM_SOURCES_URL` (replacing the per-team variables, `GuardiansScreen.tsx:97-103` and siblings), and `EXPO_PUBLIC_TEST_SELECTION` (comma-separated team keys written as the selection on a fresh dev install, so device drivers can find tiles by label).

## On-device persistence and preset seeding

### Keys

| Key | Owner | Value |
|---|---|---|
| `danner.selection.v1` | `app/selection/store.ts` | `SelectionV1`. Removing every tile stores `tiles: []`; the key is never deleted, so "absent" means "never initialized" |
| `danner.seed.v1` | `app/selection/seed.ts` | `{decision: 'legacy-family' \| 'fresh', signal: 'legacy-keys' \| 'install-times' \| 'none', at, appVersion}`, written once |
| `danner.install.v1` | Written by the v1 hub in `v1.5.x` builds (Phase 1b); read by `app/selection/seed.ts` | `{firstVersion, at}`, written once at first launch. `v2.x` reads it and never writes it; Phase 10 removes the read |
| `danner.sources.<TeamKey>.v1` | `app/streams/fetchSources.ts` | Last valid streams document text (offline fallback) |
| `danner.catalog.v1` | `app/picker/catalog.ts` | `{files: {<name>: {etag, fetchedAt, text}}}` for `leagues` and each league file |
| `danner.logos.v1` | `app/logos/logoStore.ts` | `{[TeamKey]: {href, name}}`, `name` = `logos/<TeamKey>.png` |
| `danner.tv.default.v1` | `app/tvLocation/` | Default TV point (new) |
| `danner.destination.v1` | `app/tvLocation/destination.ts:1` | Current TV point; the name is kept so saved points carry forward |

Load and migrate (`app/selection/migrations.ts`):
1. `multiGet([selection, seed])`. If the selection is present, parse it. When its schema is older, run the migrations in order, validate and write back. When its schema is newer (not reachable through updates, because versionCode only rises), read the known fields and never write.
2. If the selection is absent and the seed is present, start with an empty selection and do not seed again.
3. If both are absent, run first-launch seeding and write `danner.seed.v1` and `danner.selection.v1` before the hub renders.
4. A later key version (`danner.selection.v2`) is written by migration from v1, and v1 is removed only after the v2 write succeeds.

### Identity constants that never change

| Constant | Value and source | If it changes |
|---|---|---|
| Android package | `com.example.location_helper` (`app/app.json:33`) | A second app with empty storage; the old app never updates |
| Android signing key | Expo debug keystore from `expo prebuild --clean` (`release.yml:59-65`, `AI_RULES.md:62`). `release.yml` runs `apksigner verify --print-certs` and fails unless the SHA-256 equals `release/android-signing-cert.sha256` | The installer refuses the update; uninstalling wipes the data |
| versionCode | `major·10000 + minor·100 + patch`, strictly increasing (`app/app.config.js:18-32`); `v2.0.0` = 20000 > `v1.5.0` = 10500 > `v1.4.16` = 10416. The iPhone `CFBundleVersion` is the same number, with a `.n` suffix only on keep-alive re-uploads of one tag (Phase 1b) | A lower code is refused |
| iOS bundle id | `com.danner.locationhelper` (`app/app.json:15`), registered in Phase 1b as an explicit App ID in the owner's paid team and as the bundle id of the App Store Connect app record; the release checks it in the exported IPA's `Info.plist` | A new empty app on every iPhone and a new App Store Connect record; a record's bundle id cannot change after the first upload (outside knowledge) |
| iOS signer | The owner's paid Apple Developer team `<TEAM_ID>` from `v1.5.0` (Decided 20, O25). Before it, each phone's own free Apple Account through SideStore (`Docs/Archive/IphoneSideStore/README.md`) | iOS installs the new signer's build as a different app, or refuses it over the old one, with an empty container. The move from SideStore at `v1.5.0` is this change, made once on purpose |
| Worker origin | Today's workers.dev origin, the value of `EXPO_PUBLIC_DANNER_WORKER_URL` | Installed builds lose Play and Get video |
| Update channel | Android: `releases/latest/download/version-manifest.json` (`app/hub/appUpdate.ts:5-7`), the `VersionManifest` fields and `parseVersionManifest` (`:20-32,68-93`), asset names `Danner-Apps-Android.apk` and `Danner-Apps-iOS.ipa`, github.com and githubusercontent.com hosts (`:54-66`). `tests/app-update/run.mjs:298-321` already parses the manifest that `release/build-update-assets.mjs` writes. The manifest keeps a valid `ios` entry (the unsigned compatibility IPA) until Phase 10, because `v1.4.16` rejects a manifest without one (O23). iPhone: TestFlight internal testing from the App Store Connect record, groups `Pilot` and `Everyone` (O21), announced by `releases/latest/download/testflight.json` (O24) | Installed builds never see the update and need a manual install; a broken `ios` entry hides every later release from `v1.4.16` Android phones |

What wipes selections, logos, TV keys and the Google session: uninstalling or deleting the app; Android `Clear storage`; any change in the table above, including the one-time move of each iPhone from SideStore to TestFlight at `v1.5.0`. An expired TestFlight build keeps its data but does not launch until a newer build is installed (outside knowledge; the keep-alive upload prevents it). A dev build (versionCode 1, `app/app.json:34`) cannot be installed over a release: the installer refuses it, and uninstalling to get past that wipes the data. The Google session alone is also lost on TV `Sign out` or when any Android WebView sets `incognito`. Nothing relies on Android Auto Backup.

The debug keystore is public, so any APK signed with it installs as an update and can read the app's WebView cookies, which now hold each person's Google session. From Phase 1b the Android install steps in `release/RELEASE_NOTES.md` (`:5-10`, Docs row), and from Phase 5 the TV sign-in copy, say to install the Android app only from the in-app update or this repository's releases. iPhones install only from TestFlight.

### Preset seeding (owner item 7)

There is no install marker today. iPhone exposes no installed-versus-updated signal to the app (Android does, through `PackageInfo`), so on iPhone only data left by v1.x proves an upgrade: the install marker `danner.install.v1` that `v1.5.0` writes at first launch (Phase 1b, O22), a team screen's stream cache, written whenever that screen loads its sources, or a saved TV map point. Every iPhone starts `v1.5.0` in a new, empty container (iPhone distribution), so only data written by `v1.5.x` reaches `v2.0.0`; the SideStore copy's data never does. The layers are evaluated in order, only when both `danner.selection.v1` and `danner.seed.v1` are absent:

| Layer | Signal | Reliability |
|---|---|---|
| 1. Legacy keys | Any of `danner.install.v1`, `danner.guardians.sources.v2`, `danner.patriots.sources.v1`, `danner.cyclones.sources.v1`, `danner.destination.v1` | Positive proof of a v1.x install. Present on every phone that launched `v1.5.x`; on a phone still on `v1.4.x`, missing when it never opened a team screen or saved a map point. Any phone that ran `v1.5.x`, family or not, is seeded; its v1.x hub already showed those three teams |
| 2. Android install times | `lastUpdateTime − firstInstallTime > 60 s`, from a new `getInstallTimes()` in `DannerAppUpdateModule.kt` | Covers every Android phone updated in place. False positive only when a fresh v2 install is first launched after a later update |
| 3. Picker | The normal picker: MLB → Guardians, NFL → Patriots, College → Iowa State with three sports | Always available; the same steps as any new install |

| Phone at first launch of `v2.0.0` | Result |
|---|---|
| Android family phone updated in place | Seeded (layer 1 or 2) |
| iPhone updated through TestFlight from `v1.5.x` | Seeded (layer 1, at least `danner.install.v1`) |
| iPhone whose first TestFlight build is `v2.x` (moved from SideStore after `v2.0.0` shipped) | TV Location and `+`; the parent adds the three teams through the picker |
| A phone of another person that ran `v1.5.x` (every TestFlight iPhone between Phase 1b and Phase 6) or was updated in place on Android | Seeded (layer 1 or 2), like a family phone; the person removes the teams they do not want |
| A first install of `v2.x`, a reinstall, a new phone | TV Location and `+` |

Seeding writes `mlb-5` (statsapi 114/103), `nfl-17` and `ncaa-66` (all three sports) in today's order and removes the three legacy sources keys. It never writes TV keys; TV Location is the only writer of those (Decided 16). Phase 10 removes layers 1 and 2.

## iPhone distribution

Decided 20 moves iPhones to the paid Apple Developer Program. This section is the design under the recommended defaults of O21-O26; the SideStore method it replaces is recorded in `Docs/Archive/IphoneSideStore/` and is not repeated here. Items marked * are Apple program rules or GitHub behavior from Apple or GitHub pages or outside knowledge, not proven in this repo, as under Open decisions.

### Channel

| | TestFlight internal (O21) | Ad Hoc (not built; a separate project) | External TestFlight, App Store |
|---|---|---|---|
| Who | Up to 100 App Store Connect team members*, invited by Apple Account email | Up to 100 iPhones per membership year*, each registered by UDID | Anyone with a link |
| Apple review | None for internal builds* | None | Beta App Review or full App Review*; rejection near certain (O21) |
| Install | TestFlight app, then the invitation | `itms-services://` link to an HTTPS `manifest.plist`, with Developer Mode on* | TestFlight or the App Store |
| Updates | TestFlight notification or automatic update* | In-app prompt to the same link | Automatic |
| Build life | 90 days from upload*; keep-alive re-upload | The profile's, at most about a year* | None |
| Hosting | App Store Connect | Private, because the IPA lists every registered UDID* | App Store Connect |

### Owner setup (one time, Phase 1b)

1. Enroll as an individual in the Apple Developer Program (O25) with a dedicated Apple Account in the owner's legal name, and turn on automatic renewal. The owner's legal name becomes the developer name every tester sees*.
2. Certificates, Identifiers & Profiles → Identifiers → `+`: register `com.danner.locationhelper` (`app/app.json:15`) as an explicit App ID. If Apple refuses it as taken, the one-time fallback is `io.github.danner36.dannerapps`, changed before the first upload in `app/app.json:15` and every test, rule and doc that names the bundle id (this plan's identity table, `AI_RULES.md:62`, `Docs/Technical/Stack.md`, `Docs/Anchor/Vision.md`). Capabilities are settled before step 5: `ios-testflight.yml` prints the entitlement keys of the generated `ios/<app>/<app>.entitlements` right after prebuild and before any signing step (keys only, no values), so a first dispatch with `upload` off lists them, and the owner enables each on the App ID; SideStore dropped what it could not grant, and paid signing fails on a mismatch*. Local network access, background audio and ATS are `Info.plist` keys (`app/app.json:17-29`), not capabilities. Google's Cast setup may also need Access WiFi Information and, for discovery, Apple's multicast entitlement, which is granted only on request*; the Expo Cast plugin is not known to write either*, so the pilot's Cast check decides (Phase 1b exit). Any later capability change invalidates the profile: regenerate it (step 5) and update `IOS_PROFILE_BASE64`.
3. App Store Connect → Apps → `+`: a new iOS app with that bundle id, SKU `<SKU>` and a record name that is unique across the store (`<record name>`); the home-screen name stays `Danner Apps` (`app/app.json:3`). TestFlight → internal groups `Pilot` (automatic distribution on; the owner's iPhone, which gets every build first) and `Everyone` (automatic distribution off).
4. `Users and Access` → Integrations → App Store Connect API: a team key with the App Manager role (Admin only if the owner adopts cloud-managed signing, O25)*. The `.p8` downloads only once*.
5. Manual signing only (O25), after step 2's capabilities are set: make a private key and CSR with `openssl` on any computer (no Mac is needed), upload the CSR as an Apple Distribution certificate, combine the downloaded `.cer` and the key into a `.p12` with a new password, then create an App Store provisioning profile `<PROFILE_NAME>` for the App ID and that certificate*.
6. Environment secrets: Settings → Environments → New environment `apple-release`, with Deployment branches and tags limited to `main`, `release/*` and tags `v*`*; then add to that environment (never as repository secrets): `APPLE_TEAM_ID` (`<TEAM_ID>`), `ASC_KEY_ID` (`<KEY_ID>`), `ASC_ISSUER_ID` (`<ISSUER_ID>`), `ASC_KEY_P8_BASE64` (`<paste base64 of the .p8>`), and with manual signing `IOS_DIST_P12_BASE64` (`<paste base64 of the .p12>`), `IOS_DIST_P12_PASSWORD` (`<paste .p12 password>`), `IOS_PROFILE_BASE64` (`<paste base64 of the profile>`) and `IOS_PROFILE_NAME` (`<PROFILE_NAME>`). None of these files is committed: `.gitignore:16-17,35-37` already covers `*.pem`, `*.key`, `*.p8`, `*.p12` and `*.mobileprovision`, and Phase 1b adds `*.cer` and `*.certSigningRequest`.
7. The owner's private record, never the repo: membership renewal date with a calendar reminder 30 days ahead to check the card on file, certificate and profile expiry dates, the key id, the tester list with the non-family cap (O21), and the date 80 days after the current `Everyone` build's upload with a calendar reminder (a backstop if the keep-alive stops).

### CI signing (`release.yml`)

Release jobs after Phase 1b. Phase 1b's `release.yml` stands on its own: no `checks` job, and a release is never a draft. Phase 2b adds `checks`, which then gates `android`, `ios` and `ios-testflight`, and the O20 draft output.

| Job | Runner | Does |
|---|---|---|
| `android` | ubuntu | Unchanged |
| `ios`, renamed `Build compatibility IPA` | macOS | Today's tag check, prebuild, unsigned build and `Payload` zip (`release.yml:92-178`), kept only for the manifest's `ios` entry until Phase 10 (O23) |
| `ios-testflight` | macOS, `uses: ./.github/workflows/ios-testflight.yml`, with the build secrets passed by name (no `secrets: inherit`) | Signed archive, export, identity check, upload to App Store Connect. Skipped by `android_only` |
| `release` | ubuntu | `needs: [android, ios, ios-testflight]`, and runs only when `ios-testflight` succeeded or was skipped by `android_only`, so a failed signing blocks the release. Publishes the APK, the compatibility IPA, the new `IPHONE_SETUP.md` (`:211`), `SHA256SUMS.txt` and `version-manifest.json`; `release/build-update-assets.mjs` no longer writes `sidestore-source.json` (`:34,54-79,85-88`). From Phase 2b it outputs whether the O20 rule made a draft |
| `testflight` | ubuntu, `uses: ./.github/workflows/testflight-distribute.yml` | `needs: release`; skipped for a draft or `android_only`. Adds the processed build to `Everyone`, then uploads `testflight.json` to the release |

Retries and Apple-side blocks:
- A failed run is retried by dispatching `release.yml` on the tag itself (`gh workflow run release.yml --ref <tag> -f release_tag=<tag>`), so the tag's own workflow files and env names run. App Store Connect refuses a duplicate build number*, so `ios-testflight.yml` first asks whether that version and build number already exist; when they do (the failed run's upload, already in `Pilot`), it skips every later step and succeeds, and distribution uses that build.
- `android_only` (a `workflow_dispatch` input of `release.yml`, accepted only for a patch tag): when Apple blocks uploads (a pending license agreement, the SDK floor, an expired certificate, an App Store Connect outage), an Android hotfix publishes without `ios-testflight` and `testflight`. iPhones stay on their build, and no `testflight.json` is written. Every major and minor release builds both platforms (O20).
- `.github/workflows/testflight-distribute.yml` (`workflow_call` and `workflow_dispatch` with input `tag`; environment `apple-release`; `contents: write`, `issues: write`) serves the `testflight` job, Phase 6 step 7, and a re-run when processing outlasted the wait.

`.github/workflows/ios-testflight.yml` (`workflow_call` with inputs `tag` and `build_suffix`; `workflow_dispatch` with `release_tag`, `build_suffix` and `upload`, for the dry run and the keep-alive). The job runs in environment `apple-release`, which admits only `main`, `release/*` and `v*` tags*, and checks out `refs/tags/<tag>` when called or the dispatch ref when dispatched. These inputs never change, because the keep-alive dispatches the copy at each tag. Any failure opens an issue.
1. `runs-on` a pinned macOS image with Xcode 26, chosen with `xcode-select`; uploads have needed the iOS 26 SDK since 2026-04-28*.
2. Checkout with `persist-credentials: false`, then `node release/testflight.mjs find`: when App Store Connect already has this version and build number, every later step is skipped.
3. `npm ci` and `npx expo prebuild --platform ios --clean` with the `ios` job's env, `RELEASE_TAG` and `IOS_BUILD_SUFFIX`. The env names are those of the tag's own release (`EXPO_PUBLIC_GUARDIANS_*` on `v1.x`, `EXPO_PUBLIC_DANNER_*` from `v2.0.0`). The step prints the entitlement keys of the generated `.entitlements` file (owner setup step 2).
4. A config plugin, `app/plugins/withReleaseSigning.js`, sets `DEVELOPMENT_TEAM`, `CODE_SIGN_STYLE=Manual`, `CODE_SIGN_IDENTITY=Apple Distribution` and `PROVISIONING_PROFILE_SPECIFIER` on the app target only, and only when `APPLE_TEAM_ID` is set. Command-line overrides would reach the CocoaPods resource-bundle targets and fail*.
5. A temporary keychain under `$RUNNER_TEMP` with a random password; `security import` of the `.p12`, which is deleted right after; `security set-key-partition-list`; the profile copied to `~/Library/MobileDevice/Provisioning Profiles/<UUID>.mobileprovision`*. Secret files are written under `umask 077`; each secret reaches only the step that uses it, through step `env:`; no step echoes them or uses `set -x`.
6. `xcodebuild archive` (`-quiet -configuration Release -destination 'generic/platform=iOS'`) with all output written to a file under `$RUNNER_TEMP`. A signed build log names the signing identity (the owner's legal name and `<TEAM_ID>`), the profile and the certificate, and GitHub masks only exact secret values*. On failure the step prints only `error:` lines, after dropping every line that contains `Signing Identity`, `--sign`, `Provisioning Profile`, `team-identifier` or `application-identifier`. The log and the export folder are never uploaded. This replaces today's `tee` and log-tail annotations (`release.yml:147-158`) for the signed build.
7. `xcodebuild -exportArchive` (same output rule) with an `ExportOptions.plist`: `method` `app-store-connect`, `testFlightInternalTestingOnly` `true`, `signingStyle` `manual`, `teamID`, `provisioningProfiles` (bundle id to `<PROFILE_NAME>`), `manageAppVersionAndBuildNumber` `false`*. No `manifest.plist` is produced; an Ad Hoc export would use `method` `release-testing` and the `manifest` option, which writes one*.
8. Identity check: the exported IPA's `CFBundleIdentifier` equals `app/app.json:15`, and `CFBundleVersion` equals the versionCode plus any suffix. Only those two values are printed.
9. Upload with `xcrun altool --upload-app` and the API key, written to `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8` in this step only*. The signed IPA is never an Actions artifact or a release asset (O23).
10. `if: always()`: delete the keychain and remove the profile and `.p8` files.

Cloud-managed variant (only if the owner accepts the O25 trade-off; tried in the Phase 1b dry run): automatic signing with `-allowProvisioningUpdates` and the API key flags uses Apple's cloud-managed certificates*, the `.p12` and profile secrets are not needed, and the key needs the Admin role. It is adopted only if archive and export succeed without a registered device.

`release/testflight.mjs` (Node, no dependencies) signs an App Store Connect API token from the key in memory and finds the app by bundle id. `find` reports whether a version and build number exist. `distribute` waits up to 30 min for processing, adds the build to `Everyone` and uploads `testflight.json`; on a timeout it exits non-zero, and the workflow opens an issue that names the `testflight-distribute.yml` re-run. `keepalive` returns the keep-alive decision below. `Pilot` gets every build through automatic distribution. The script prints only versions, build numbers, processing states, group names and day counts.

`.github/workflows/ios-keepalive.yml`: `schedule: cron: '37 15 * * 3,6'` (Wednesday and Saturday) plus `workflow_dispatch` (`force`); environment `apple-release`; permissions `contents: write`, `actions: write` and `issues: write`. Every TestFlight build stops launching 90 days after upload*, and the MLB off-season can pass 90 days without a release. Each run:
1. Measures the age of the newest build in `Everyone` that is not expired (`betaGroups/<Everyone>/builds`, `expired` false). A newer build that only `Pilot` has (the dry run, a draft, a rolled-back release) or an expired build never resets this clock.
2. When a keep-alive build of that version has been in `Pilot` for 2 days or more and no open issue carries the label `testflight-hold`, adds it to `Everyone`. The owner's `Pilot` iPhone installs it first; the owner adds that label to stop a bad build.
3. Otherwise, when the `Everyone` build is 70 days old or more (or on `force`), dispatches `ios-testflight.yml` on that build's tag (`gh workflow run ios-testflight.yml --ref <tag>`; a dispatch made with `GITHUB_TOKEN` starts a run*), so the tag's own workflow, env names and pinned image run, with the next free `build_suffix`: `CFBundleVersion` `<versionCode>.<n>`, `n` from 1 to 99 (`app/app.config.js` appends it to `ios.buildNumber` only). The result is a rebuild of the tag, not the same binary, so it reaches `Pilot` only until step 2 promotes it, at most about 78 days after the `Everyone` upload.
4. Opens an issue when the `Everyone` build is 85 days old, when the certificate or profile expires within 30 days (dates read from the secrets in memory; only day counts are printed), or when any step fails.
5. Heartbeat: when `main` has had no commit for 25 days, commits the run date to `release/keepalive.txt`. GitHub disables scheduled workflows in a public repository after 60 days without repository activity*, which would stop this workflow and its issues, `team-catalog.yml` and `worker-health.yml` without notice. The owner's 80-day calendar reminder (owner setup step 7) is the backstop.

It works for tags from `v1.5.0` on, which carry `ios-testflight.yml`, the plugin and the suffix.

### Install, update and the move from SideStore

First install, for any person (family or other):
1. The owner adds the person in App Store Connect → `Users and Access` with their Apple Account email (never written to GitHub), the least role that makes them eligible as an internal tester (Marketing*), and access to this app only, then adds them to `Everyone`.
2. On the iPhone: accept the App Store Connect invitation email, install TestFlight from the App Store, open the TestFlight invitation, tap Install, and turn on Automatic Updates for Danner Apps in TestFlight*.

No computer, VPN, Developer Mode or dedicated Apple Account is involved.

Updates: each published release adds its build to `Everyone`, and TestFlight installs it automatically or from its notification*. From `v1.5.0` the iPhone hub skips the version manifest and shows the TestFlight notice instead (O24): it reads `releases/latest/download/testflight.json` under the same host rules (`app/hub/appUpdate.ts:54-66`) and the same suppression as the Android prompt, and offers `Open TestFlight` when that version is newer than the embedded one and no embedded profile is present. The version manifest keeps its shape and gains no field for TestFlight. `v1.5.0`'s `parseVersionManifest` treats `ios` as optional and Android reads only `android`, so Phase 10 can drop the entry that `v1.4.16` still needs (O23). Under the Ad Hoc fallback the manifest would add `ios.manifestUrl`, an HTTPS `manifest.plist` on private hosting, and the iPhone prompt would open `itms-services://?action=download-manifest&url=<manifest URL>`.

Moving a SideStore iPhone (one time, Phase 1b, after the pilot checks in the Phase 1b exit pass on the owner's iPhone). `v1.4.16` knows only `sidestore://install` (`app/hub/HubScreen.tsx:150-158`): its prompt for `v1.5.0` hands the compatibility IPA to SideStore, which updates the SideStore copy to `v1.5.x` and does not move the phone; that copy then shows the retired-copy line (O24). The move is a manual install, carried by the "Moving from SideStore" section of the new `release/IPHONE_SETUP.md`:
1. The owner sends the invitation (first install, step 1).
2. On the iPhone: accept it, install TestFlight, open the invitation, tap Install, and turn on Automatic Updates for Danner Apps*. The new app normally appears beside the old one as a second `Danner Apps` icon. If TestFlight says the app cannot be installed because the old copy holds the same identifier*, press and hold the old Danner Apps → Remove App → Delete App, then tap Install again.
3. Open the new Danner Apps. Open Guardians, Patriots and Cyclones once each (this writes the stream caches; `danner.install.v1` is written at launch). In TV Location, save the TV point again if it was not the default, and sign in to YouTube TV in the verify step.
4. Only after the new app has signed in to YouTube TV and finished one TV verify, remove the old setup: delete the old Danner Apps, SideStore and LocalDevVPN; in Shortcuts, delete the charger automation (Automation tab) and the `Refresh SideStore` shortcut. Developer Mode can be turned off (Settings → Privacy & Security → Developer Mode); TestFlight does not need it*.
5. The owner records the phone in `Docs/Production/Validation.md` as a neutral label (`Family iPhone 2`), its iOS version, the build and the date: never a person's name, a device name, an Apple Account email or a UDID.

This order keeps the old app working until the new one is installed and signed in; once renewal stops, the old copy expires within 7 days on its own. iLoader and Apple website iTunes are no longer needed on the PC, and the dedicated free Apple Accounts are no longer used for the app.

### Adding a new iPhone

TestFlight needs no device identifier: a new phone is a new tester (first install above) or another device of an existing tester*. Nothing about the person or the phone enters GitHub, a workflow input or a log. The cap is 100 internal testers per team*, counted in the owner's private record. A phone whose person cannot be an internal tester (a child or managed Apple Account) has three options, chosen by the owner: no iPhone build; an adult tester's TestFlight install on that phone (up to 30 devices per tester*, confirmed on the pilot); or Ad Hoc, built as a separate project with UDID collection on a computer, Developer Mode, private hosting and a yearly reinstall, which brings back the signing upkeep Decided 20 retires. Under Ad Hoc, the owner reads the UDID on a computer and registers it in Certificates, Identifiers & Profiles → Devices, never in GitHub or a `workflow_dispatch` input; a regenerated profile and a new build follow, and the IPA, which lists every UDID*, cannot be a public release asset.

### Signing warning

Kept until Phase 10 for SideStore copies (O24): `app/modules/danner-provisioning-profile/`, `app/hub/provisioningWarning.ts`, their read and render in `HubScreen.tsx` (`:19,33,46-79,241-256`, styles `:366-386`), the warning gate in `shouldOfferAppUpdate` (`app/hub/appUpdate.ts:96-115`) and in the hub (`HubScreen.tsx:100-105,168,188`), and `tests/provisioning-warning/`. TestFlight installs carry no embedded profile*, so on them the module returns nothing and nothing shows; build expiry there is handled by the keep-alive upload. Phase 1b changes the text: with a profile present, the title is `This iPhone copy is retired` until the final 48 hours, then today's expiry title, and the instruction is `Ask for the TestFlight invitation.` in place of `Connect to Wi-Fi and charge phone to fix`. A present profile also suppresses the TestFlight notice. Phase 10 deletes the module, the text, its test, `test:provisioning-warning` (`app/package.json:40`) and the rule at `AI_RULES.md:48`, together with the compatibility IPA (O23). Under Ad Hoc the module would stay, with a 14-day window and the instruction `Ask for the new Danner Apps install link`.

### Yearly upkeep and lapse

| Item | Lifetime | Renewal | When missed |
|---|---|---|---|
| Membership | 1 year, about 99 USD* | Automatic renewal in the owner's developer account; date in the private record with a reminder 30 days ahead to check the card on file (a failed charge is silent*) | No uploads and no TestFlight distribution*. iPhones may stop launching at once (reported, unverified*) and stop at the latest when their build reaches 90 days. Renewing plus a keep-alive upload restores it. If Apple ends the membership, the archived SideStore method is the only fallback (Risks) |
| Program License Agreement | Apple updates it from time to time* | The Account Holder accepts each update in the developer account | Uploads fail until it is accepted*; the keep-alive issue on a failed upload names it |
| Apple minimum SDK for uploads | Raised about every April* (the iOS 26 SDK since 2026-04-28; a 2027 floor is likely) | Before the deadline, upgrade Expo SDK, React Native and the runner's Xcode, and ship a release built with them | The keep-alive cannot rebuild an older tag after the deadline; every iPhone stops launching 90 days after the last good upload |
| Pinned macOS runner image | Retired by GitHub on its own schedule* | Move `ios-testflight.yml` to a supported image in a release | The keep-alive rebuild of an older tag fails on the retired image; same outcome as above |
| Apple Distribution certificate (manual signing) | 1 year* | New CSR, certificate and `.p12`; update `IOS_DIST_P12_BASE64` and `IOS_DIST_P12_PASSWORD` | Uploads fail; installed builds keep working* |
| App Store profile (manual signing) | Ends with its certificate*; any capability change invalidates it* | Regenerate; update `IOS_PROFILE_BASE64` and `IOS_PROFILE_NAME` | Uploads fail |
| App Store Connect API key | No expiry* | Revoke and replace if exposed | Uploads and the distribute step fail |
| TestFlight build | 90 days from upload* | `ios-keepalive.yml` rebuilds at 70 days and promotes after 2 days in `Pilot` | The app stops launching until a newer build is installed |

This upkeep replaces the weekly SideStore renewal on every phone. Most of it runs on its own, but not all: each year the owner renews, accepts license updates, rotates the certificate under manual signing, and ships an Expo and Xcode upgrade before Apple's SDK deadline. The keep-alive opens an issue on every failed upload, not only at 85 days.

### Data continuity

- The move gives every iPhone a new app. SideStore installed a copy signed by that phone's free team; the paid build is signed by `<TEAM_ID>`. iOS keeps each app's data in its own container, and team-scoped app groups and keychain items are not shared*. Nothing carries over: the v1.x stream caches, `danner.destination.v1` (the TV point), the documents folder and the WebView cookie store (the Google session).
- Under O22 each iPhone starts over on `v1.5.0`: the TV point is saved again and YouTube TV is signed in again, once. The v1.x hub has no team selection to lose. `v2.0.0` then installs over `v1.5.x` in the same container and seeds the presets (Preset seeding).
- TestFlight builds with the same bundle id and team install over each other and keep the container*, as would later Ad Hoc or App Store builds from the same team*.

### Android

Unchanged: the debug-keystore APK, the in-app `PackageInstaller` update, the manifest's `android` entry and the signing-certificate check. Android phones take `v1.5.0` through the normal prompt; nothing visible changes on Android.

## Backend

### Team catalog

`catalog/leagues.json` (`ncaa` abbreviated):

```json
{ "schemaVersion": 1, "generatedAt": "<ISO time>", "leagues": [
  { "key": "mlb", "label": "MLB", "kind": "pro", "pickable": true,
    "schedule": { "provider": "mlb-statsapi", "sportId": 1 }, "espn": { "sitePath": "baseball/mlb" } },
  { "key": "nfl", "label": "NFL", "kind": "pro", "pickable": true, "officialDateZone": "America/New_York",
    "schedule": { "provider": "espn", "sitePath": "football/nfl", "corePath": "football/leagues/nfl",
                  "seasonTypes": [1, 2, 3], "seasonYear": { "shiftBackThroughMonth": 2 } } },
  { "key": "ncaa", "label": "College", "kind": "school", "officialDateZone": "America/New_York", "sports": [
    { "key": "football", "label": "NCAA football", "pickable": true,
      "schedule": { "provider": "espn", "sitePath": "football/college-football", "seasonTypes": [1, 2, 3],
                    "seasonYear": { "shiftBackThroughMonth": 1 } } },
    { "key": "mens-basketball", "label": "NCAA men's basketball", "pickable": true, "schedule": { "seasonYear": { "shiftForwardFromMonth": 7 } } },
    { "key": "womens-basketball", "label": "NCAA women's basketball", "pickable": true, "schedule": { "...": "as men's" } } ] } ] }
```

`catalog/teams/<league>.json` holds one entry per team or school:

```json
{ "key": "ncaa-66", "espnId": "66", "name": "Iowa State Cyclones", "nickname": "Cyclones", "location": "Iowa State",
  "abbreviation": "ISU", "color": "#<hex>", "alternateColor": "#<hex>", "logo": "<ESPN logo href>", "conference": "Big 12",
  "hrefNeedles": ["iowa-state-cyclones"], "sports": ["football", "mens-basketball", "womens-basketball"] }
```

Pro entries have no `sports` or `conference`. `retiredSports` (schools only, present only when non-empty) lists the entries of `sports` that ESPN no longer offers for that school; each stays in `sports` so the Worker, the pipeline and streams files keep accepting it, and is not pickable. `mlb-5` adds `"statsapi": {"teamId": 114, "leagueId": 103}`. MLB has no `officialDateZone`, because its official date comes from statsapi; every ESPN league uses America/New_York (O4). `catalog/overrides.json` holds hand-edited data that is merged last; the allowed keys are `statsapi`, `hrefNeedles`, `name`, `nickname`, `conference`, `hidden` (hidden from the picker) and `remove` (the only way an entry leaves the allowlist).

Builder (`scripts/team-catalog/build.mjs`, in Actions, because this sandbox cannot reach ESPN):
- Calls ESPN `site.api.espn.com/apis/site/v2/sports/<sitePath>/teams?limit=1000` and reads `sports[0].leagues[0].teams[].team` (shape from third-party documentation, confirmed by the probe). Field mapping: `name` ← `displayName`, `nickname` ← `name` (the mascot; ESPN's own `nickname` is often the school short name), `location` ← `location`, `abbreviation` ← `abbreviation`, `color` and `alternateColor` ← `'#' + value` (ESPN sends hex without `#`; confirmed by the probe), `logo` ← the first `logos[]` entry whose `rel` has `default` and not `dark`. `isAllStar === true` entries are skipped.
- The default `hrefNeedles` is `slugifyName(name)` (`scripts/guardians-stream-pipeline/lib/extractGooz.mjs:397-405`), which reproduces today's three needles.
- Schools: merges the three college lists by ESPN id (one id across sports, `Docs/Production/Cyclones.md:120-126`). `sports` lists the lists the school appears in. The probe chooses the D-I filter and the `conference` path. A school ESPN lists under different ids per sport (real cases: Long Island University, West Florida) appears twice until an `overrides.json` `hidden` hides one, reviewed at the first catalog commit.
- MLB: joins statsapi `/api/v1/teams?sportId=1` by normalized full name and sets `statsapi.teamId` and `leagueId`. Any MLB team without a match fails the build.
- Append-only allowlist: a team or sport that disappears from ESPN (`isActive === false`, relocation, a D-I change, a list glitch) is kept with `retired: true`. Retired entries and sports are not pickable but stay valid for the Worker, the pipeline and streams files. Only `remove` in `overrides.json` deletes an entry.
- Guards: a league whose team count drops under 90% of the committed count is not rewritten, and the job fails. The build fails unless `mlb-5` (statsapi 114/103, nickname `Guardians`), `nfl-17` (nickname `Patriots`) and `ncaa-66` (nickname `Cyclones`, sports include football, men's basketball and women's basketball) are present.
- `pickable` is sticky: a league or sport becomes pickable when its probe passes and fixtures exist in `tests/leagues/`, and the build never turns a shipped league off. A failing probe keeps the last good value and opens an issue; demotion is an owner edit.

Probe (`team-catalog.yml` job `probe`, before `build`): for each league and college sport it calls the teams list, one team's schedule per season type, today's scoreboard, `summary?event=` for the most recent live or final event in any season (an empty current-season schedule is a valid shape, so the off-season passes), and the Core `predictor` and `probabilities`. It writes HTTP status, latency, network errors and shape errors (missing paths from `scripts/team-catalog/required-paths.json`) separately to `catalog/probe-report.json`, plus the arena-board paths of each basketball summary, reported but not required (Basketball arena board), and uploads raw bodies as artifact `espn-probe-<run id>` (14 days) for fixtures. Schedule: `cron: '23 9 * * 2'` plus `workflow_dispatch` (optional inputs `leagues` and `live_capture`). `live_capture` names an adapter, and such a run is only the separate job `live-capture` (`permissions: contents: read`, no secrets): it captures that adapter's first in-progress game every 60 s until it ends or 180 min pass, writes the capture report that Phase 1c defines, and uploads artifact `espn-live-<run id>` (14 days); `probe`, `build` and the commit are skipped, so no write token waits on a three-hour loop. The other jobs hold `contents: write` and `issues: write`. Before committing it runs `scripts/team-catalog/validate.mjs` itself, because pushes made with `GITHUB_TOKEN` start no `ci.yml` run. It commits with `GITHUB_TOKEN`, rebasing and retrying up to 3 times, with message `catalog: refresh team list.`

### Streams files

Each team has one file at `streams/<league>/<espnId>.json`; one school file covers all of its sports.

```json
{ "schemaVersion": 2,
  "team": { "key": "ncaa-66", "name": "Iowa State Cyclones" },
  "HOW_TO_GUIDE": { "DATES": "gameDates are America/New_York calendar dates (MLB: MLB official date).", "COMMIT": "Commit streams/ncaa/66.json to main." },
  "streams": [
    "INACTIVE EXAMPLE. COPY THE COMPLETE OBJECT BELOW THIS LINE.",
    { "sport": "football", "gameDates": ["YYYY-MM-DD"], "gameNumbers": [1], "kind": "direct",
      "url": "https://example.invalid/game.m3u8", "allowInsecureHttp": false, "trustedHosts": [] },
    { "sport": "football", "eventId": "<ESPN event id>", "gameDates": ["2026-11-08"], "gameNumbers": [1],
      "kind": "web", "url": "<player embed URL>", "allowInsecureHttp": false, "trustedHosts": [], "source": "pipeline" } ] }
```

| Field | Rule |
|---|---|
| `sport` | Required in school files and must be one of the school's sports; absent in pro files |
| `eventId` | A string of digits. Always written by the pipeline (ESPN event id or MLB `gamePk`); optional on hand-written entries. Matching also requires `gameDates` to include the current official date |
| `gameDates`, `gameNumbers` | Required. Official dates (O4; never displayed); numbers 1-9 |
| `kind`, `url`, `allowInsecureHttp`, `trustedHosts` | Same meaning as today (`lib/playableStream.mjs:97-180`) |
| `source` | `"pipeline"` on pipeline entries only. The pipeline replaces or removes only these entries, which replaces today's provider-host ownership test (`lib/streamsDocument.mjs:96-102`) |
| Unknown keys | Ignored, not rejected (today they are rejected, `lib/streamsDocument.mjs:30-32`) |

- Creation: `templates/streams.template.json`. A 404 on read makes the publish `PUT` the template plus the entry without a `sha` (the no-`sha` create exists today, `lib/publishGithub.mjs:111`). A concurrent create answers 422, and the existing re-read retry handles it (`lib/publishGithub.mjs:126-130`). Only a `published` outcome creates a file, so fake keys cannot create files.
- Retention: every write prunes entries whose dates are all more than 7 days old (`lib/streamsDocument.mjs:20,167-185`). There is no count cap. The phone reads the last 200 objects (`MAX_REMOTE_STREAMS`, `lib/playableStream.mjs:6,30-34`), and an upsert moves its entry inside that window as today (`lib/streamsDocument.mjs:147-152`).
- Readiness and upsert use the same match as the phone: an existing pipeline entry counts for an event only when its `gameDates` include the event's current official date, so a rescheduled event gets a new run.
- Commits: one per `published` outcome, with message `streams: <teamKey>[ <sport>] <officialDate> game <n>.` Pushes made with `GITHUB_TOKEN` start no workflows.
- Cutover: the three preset files are created empty from the template. Root files and their history stay in git and under the archive tag; no entries are carried over.

### Pipeline secret and listing sources

`scripts/stream-pipeline/config.defaults.json` (committed) holds the `timing` and `matching` defaults, and the secret `STREAM_PIPELINE_CONFIG` is merged over it. There is no `github` block: the repo comes from `GITHUB_REPOSITORY`, the branch is `main`, and the path comes from the team key.

```json
{ "schemaVersion": 2,
  "timing": { "leadMinutes": 15, "postStartGraceMinutes": { "default": 240, "mlb": 180 },
              "primary": { "navigationTimeoutSeconds": 90 },
              "backup":  { "navigationTimeoutSeconds": 30, "timeoutSeconds": 120 },
              "extractDeadlineSeconds": 600 },
  "matching": { "leagues": { "mlb": { "leagueHints": ["/mlb/"] }, "nfl": { "leagueHints": ["/nfl/"] } },
                "defaultLeagueHints": ["/stream/"] } }
```

These values reproduce today's per-team settings (`config.example.json`, `config.patriots.example.json`, `config.cyclones.example.json`; `lib/extractGooz.mjs:745-751`); Phase 2b carries any difference in the owner's private record of the three old secrets (needles, `requireOpponent`, grace) into this file, the catalog `hrefNeedles` or the secret. Secret shape (reference only; the owner pastes the shorter form in the last section):

```json
{ "schemaVersion": 2,
  "sources": [
    { "label": "primary",  "baseUrl": "<paste listing URL 1>" },
    { "label": "backup-1", "baseUrl": "<paste listing URL 2>", "timeoutSeconds": 120 },
    { "label": "backup-2", "baseUrl": "<paste listing URL 3>",
      "matching": { "teams": { "nfl-17": { "hrefNeedles": ["<slug used by this site>"] } } } } ],
  "matching": { "leagues": { "ncaa": { "requireOpponent": false } },
                "teams": { "ncaa-66/womens-basketball": { "hrefNeedles": ["<slug>"] } } } }
```

- Source 1 runs as today: 90 s navigation timeout and no per-source cap below the overall limit, unless its own `timeoutSeconds` is set. It is always capped at `extractDeadlineSeconds` minus 45 s, so a hung page cannot hold the job. Backups use the `backup` timing, and each backup's budget is clamped to the time left before `extractDeadlineSeconds` minus 45 s.
- Needle precedence: the source's `matching.teams["<key>/<sport>"]`, then the source's `matching.teams["<key>"]`, then the same two in the global `matching`, then the catalog `hrefNeedles`.
- `leagueHints` replace the fixed `/mlb/`, `/nfl/`, `/stream/` score bonus (`lib/extractGooz.mjs:745-751`).
- `run.mjs --check-config` rules: `schemaVersion` is 2; 1 to 5 sources (O9); each `baseUrl` is http(s), and no two share origin plus path; `label` matches `^[a-z0-9-]{1,24}$` (no dots, so it can never be a host); `timeoutSeconds` 30-300; `navigationTimeoutSeconds` 15-120; `extractDeadlineSeconds` 120-660; `leadMinutes` 5-60; grace 60-360; 60 s setup + `extractDeadlineSeconds` + 45 s publish must stay within the phone's 900 s; `matching.teams` keys exist in the catalog; needles match `^[a-z0-9-]{2,60}$`. Every message is free of values and names "source 2", never a URL or host. An empty or missing secret fails the run; there is no fallback to an example file (today's fallback is at `cyclones-stream-pipeline.yml:55-57`).

### Listing failover

`lib/sources.mjs` runs after every pre-check passes. It launches Chromium once (today it launches once per call, `lib/extractGooz.mjs:1061,1243`), opens a fresh context for each source, tries the sources in array order one at a time, and stops at the first entry that passes the playable check. A move-on failure is any NEXT code below: the site is down or blocked, or this game is not found or not playable on that site (O10).

| Stage | Detection | Code | Action |
|---|---|---|---|
| Request, config | `--check-request`, `--check-config` | `bad_team`, `bad_sport`, `bad_event`, `config_invalid` | STOP |
| Browser launch | launch throws (`lib/extractGooz.mjs:528`) | `browser_failed` | STOP |
| Schedule | provider fetch not OK | `schedule_failed` | STOP |
| Game and window | the dispatched `eventId` in the team's schedule, else today's tiers for manual runs (`lib/gameWindow.mjs:48-89`, `lib/pipeline.mjs:247-260`) | `no_game`, `blocked`, `game_over`, `too_early` | STOP (success) |
| Already ready | a playable pipeline entry exists for the event and its current official date | `video_ready` | STOP (success) |
| Listing navigation | `page.goto` throws or times out | `nav_error`, `nav_timeout` | NEXT |
| Listing HTTP | `response.status() >= 400` with no challenge marker (discarded today, `lib/extractGooz.mjs:925-937`) | `http_4xx`, `http_5xx` | NEXT |
| Listing challenge | 403 or 503 with `cf-mitigated: challenge`, a `Just a moment` title (`isCloudflareChallengeTitle`, `:564-568`) or a challenge frame is not classified at once; the link wait runs as today (`waitForListingLink`, `:548-561`), and the code is set only when no link appears by its end | `bot_challenge` | NEXT |
| Link selection | `selectListingLink` (`lib/extractGooz.mjs:465-516`) | `link_not_found`, `opponent_not_found`, `ambiguous_link` | NEXT |
| Game page | navigation error, timeout or HTTP >= 400 | `game_nav` | NEXT |
| Player | no iframe or video / no provider matches | `player_not_found`, `unknown_provider` | NEXT |
| Entry | fails the provider pattern or playable check / embed HTTP >= 400 or an offline marker | `invalid_entry`, `unplayable` | NEXT |
| Source budget | timer fires; the context is closed | `source_timeout` | NEXT |
| Deadline | less than 45 s left before the next source | `deadline` | STOP |
| Publish | contents API error after retries | `publish_failed` | STOP |

When no source succeeds, the outcome is `ambiguous_link` if any source returned it (the pipeline never guesses), else `sources_unreachable` if every source failed at navigation, HTTP or challenge, else `no_video`. These and every STOP code not marked success exit with code 1.

| Budget | Today | New |
|---|---|---|
| Navigation, source 1 | 90 s (`lib/pipeline.mjs:421-423`) | 90 s |
| Navigation, backups | — | 30 s |
| Per source | none (one attempt takes about 2-5 min at worst) | Source 1: none unless set, and never past the deadline minus 80 s, which leaves a backup its 45 s reserve and 35 s minimum. Backups: `timeoutSeconds`, default 120 s, clamped to the time left |
| All sources | none | 600 s; a backup starts only with at least 45 s left |
| Job | 15 min (`guardians-stream-pipeline.yml:33`) | 15 min for each of `extract` and `publish` |
| Phone wait | 300 s | Until the run reports, at most 900 s, with live progress (Decided 18) |

Worst case: about 20 s queue, 30-60 s setup (run `41249897252`: 29 s setup, 19 s pipeline), 600 s extraction, about 30 s for the `publish` job (queue, sparse checkout, write with retries), 10 s Worker freshness and one 5 s poll, about 725 s in total. That fits the 900 s phone wait and each job's 900 s limit.

Player providers (`lib/extract/providers.mjs`) start with today's single row:

```js
export const PROVIDERS = [
  { id: 'gooz', host: GOOZ_HOST, embedPath: /\/new-stream-embed\/[^/?#]*\d/,
    iframeSelector: `iframe[src*="${GOOZ_HOST}"]`, trustedHosts: [], offlineMarkers: [] },
];
```

A backup site whose player is not in the table yields `unknown_provider`, and the next source runs. Adding a provider means one row plus a fixture test. The phone already accepts non-`GOOZ_HOST` `web` URLs (`app/guardians/guardiansSources.ts:82-101`); a dry run plus one check on a phone decides whether a new player needs app work.

Redaction and masking (`lib/redact.mjs`): the step that writes the config emits `::add-mask::` for every source `baseUrl`, origin and host before anything else runs, and the pipeline emits `::add-mask::` for every post-redirect listing host and game-page host before it can print one. This covers process output that `redact.mjs` never sees (Chromium and Playwright stderr under `xvfb-run`, unhandled-rejection traces). `redact.mjs` also rewrites every step message, thrown error, summary line and result file (today one host per call, `lib/pipeline.mjs:523-534`). Logs name `source 2/3 (backup-1)`. Playwright traces and screenshots are never uploaded. Each run writes this to `$GITHUB_STEP_SUMMARY` and to artifact `pipeline-result.json` (7 days):

```text
nfl-17 | event <id> | 2026-11-08 game 1 | published from source 2 of 3
| # | Label    | Stage reached | Result   | Seconds |
| 1 | primary  | listing       | http_5xx | 3       |
| 2 | backup-1 | entry         | found    | 21      |
```

### Workflow `stream-pipeline.yml`

```yaml
name: Stream pipeline
on:
  repository_dispatch: { types: [team-get-video] }
  workflow_dispatch:   # inputs: team (required, e.g. nfl-17), sport (schools), event, dry_run, force, source (1-based; blank = all)
permissions: { contents: read }
concurrency:
  group: stream-pipeline-${{ github.event.client_payload.team || inputs.team }}-${{ github.event.client_payload.sport || inputs.sport || 'all' }}
  cancel-in-progress: false
jobs:
  extract:                # ubuntu-latest, timeout-minutes: 15, permissions: contents: read
    env:                  # TEAM_KEY, TEAM_SPORT, EVENT_ID from client_payload or inputs; DRY_RUN, FORCE, SOURCE_ONLY from inputs only
    steps:                # checkout with persist-credentials: false; setup-node 24 (cache keyed on scripts/stream-pipeline/package-lock.json)
      - run: node scripts/stream-pipeline/run.mjs --check-request
      - name: Write pipeline config      # fails on an empty secret; umask 077 under $RUNNER_TEMP; ::add-mask:: every source host
        env: { STREAM_PIPELINE_CONFIG: "${{ secrets.STREAM_PIPELINE_CONFIG }}" }
      - run: node scripts/stream-pipeline/run.mjs --check-config
      # npm ci, Playwright cache, install-deps, xvfb: as today
      - run: xvfb-run -a node scripts/stream-pipeline/run.mjs    # EXTRACT_HEADED=1; GITHUB_TOKEN read-only for the readiness read
      # uploads candidate.json (entry or outcome code) as artifact candidate-<run id>
  publish:                # needs: extract, if: always(), timeout-minutes: 15, permissions: contents: write; no browser
    steps:                # sparse checkout of scripts/stream-pipeline and catalog, persist-credentials: false
      - run: node scripts/stream-pipeline/publish.mjs   # re-validates schema, provider pattern and path from the key; writes; posts run status
        env: { GITHUB_TOKEN: "${{ github.token }}", RUN_STATUS_KEY: "${{ secrets.RUN_STATUS_KEY }}" }
```

- The job that opens untrusted listing and player pages holds only a read-only token and no credentials in `.git/config`. The job that can write has no browser and trusts nothing in `candidate.json` that it does not re-check. A CI source test asserts both permission blocks and `persist-credentials: false`.
- Payload values and inputs reach the shell only through `env:` (today's `DISPATCH_SPORT` pattern, `cyclones-stream-pipeline.yml:67,101`). `--check-request` checks the key against the regex and the checkout catalog, the sport against the team, and `EVENT_ID` against `^\d{1,12}$`, before the secret is written.
- Each team+sport has its own concurrency group, so different teams run in parallel and each team+sport has at most one running and one pending run (`guardians-stream-pipeline.yml:22-27`). Two sports of one school can run together; both write `streams/ncaa/66.json` through the SHA retry.
- The pipeline fetches only the dispatched sport (today Cyclones fetches 9 lists, `lib/ncaaSchedule.mjs:189-204`) and computes the season month in America/New_York, not the process zone (`lib/nflSchedule.mjs:17-19`, `lib/ncaaSchedule.mjs:26-32`). No workflow sets `TZ`.
- The `extract` job posts each progress step to `POST /run-progress` with `RUN_PROGRESS_KEY` (Get video progress).
- `publish.mjs` posts `{team, sport, eventId, runId, code, at}` to `POST /run-status` with an HMAC-SHA256 signature made with `RUN_STATUS_KEY` (not on dry runs or runs without `eventId`).

Code map: the module table and config checks (`lib/pipeline.mjs:49-67,84-95,151-202`) become `lib/catalog.mjs` (TeamSpec) and `lib/config.mjs`; `lib/mlbSchedule.mjs` becomes `lib/schedule/mlbStatsapi.mjs` (team from `statsapi.teamId`, `eventId` = `gamePk`); the duplicated NFL and NCAA helpers (`nflSchedule.mjs:21-77` = `ncaaSchedule.mjs:38-94`) become one `lib/schedule/espn.mjs`; `lib/extractGooz.mjs` splits into `lib/extract/listing.mjs` and `lib/extract/providers.mjs`, with `lib/sources.mjs` and `lib/redact.mjs` around them; the streams and publish modules gain the v2 schema, event-id match, `source` ownership and template creation, and publishing moves to `publish.mjs`. Env `GUARDIANS_STREAM_CONFIG`, `PIPELINE_MODULE`, `DISPATCH_SPORT` and `TZ` become `STREAM_PIPELINE_CONFIG_PATH`, `TEAM_KEY`, `TEAM_SPORT`, `EVENT_ID`, `DRY_RUN`, `FORCE` and `SOURCE_ONLY`.

### Worker v2

| Route | Request | Success | Error codes |
|---|---|---|---|
| `GET /health` | `?deep=1` adds one conditional GitHub read | 200 `{ok, contract: 2, github?}` | — |
| `GET /catalog`, `GET /catalog/<league>` | league key | 200 `catalog/leagues.json` or `catalog/teams/<league>.json`, with `ETag` | 400 `bad_league`, 502 `upstream_error` |
| `GET /streams?team=<key>[&event=<id>]` | team key; `event` during a Get video wait | 200 document; 200 empty document with `X-Streams-State: empty` for an allowlisted team that has no file; 304 on a matching `If-None-Match`. With `event`, header `X-Run-State` | 400 `bad_team`, 429 `rate_limited`, 502 `upstream_error`, 500 `not_configured` |
| `POST /get-video` | `{"appKey": "<app key>", "team": "ncaa-66", "sport": "football", "eventId": "<id>"}`; `sport` only for schools | 202 `started` or `in_progress`; 200 `video_ready` | below |
| `POST /run-status` | signed body from `publish.mjs` | 204 | 401 `bad_signature`, 400 `bad_request` |
| `POST /run-progress` | signed body from the `extract` job (Get video progress) | 204 | 401 `bad_signature`, 400 `bad_request` |
| anything else | | | 404 `not_found` |

Every reply that is not a document has the same fields: `ok`, `code`, `message`, `team`, `sport`, `retryAfterSeconds`. The empty document is `schemaVersion` 2, `team` (`key`, `name`) and an empty `streams` list; today a missing file answers 502 (`index.js:204-207`).

| HTTP | `code` | Meaning | Phone |
|---|---|---|---|
| 202 | `started` | Dispatch sent | Polls |
| 202 | `in_progress` | The same game was dispatched inside the cooldown; nothing was sent | Polls |
| 200 | `video_ready` | A pipeline entry for this game already exists; nothing was sent | Refreshes the streams once |
| 409 | `not_in_window` | The game is not Live and not between 20 min before its start and the end of its grace; nothing counted | "Get video works from 15 minutes before the start until the game ends." |
| 400 | `bad_request`, `bad_team`, `bad_sport`, `bad_event` | Body is not a JSON object or a field is missing / key not in the catalog / sport missing, not offered, or sent for a pro team / the event is not this team's | Error text |
| 401 | `unauthorized` | Wrong app key | Error text |
| 429 | `rate_limited`, `game_limit` | An IP limit (with `Retry-After`) / the per-game run cap | "Get video was asked for too often. Try again in N minutes." (N from `Retry-After`) |
| 503 | `busy` | The global hourly cap or the in-flight cap (with `Retry-After`) | Same message |
| 502 | `dispatch_failed` | GitHub answered something other than 204 (`index.js:241-244`). GitHub text goes only to the Worker logs | Error text |
| 500 | `not_configured` | `APP_KEY`, `RUN_STATUS_KEY` or `GITHUB_TOKEN` is missing | Error text |

`X-Run-State` values: `queued` (dispatched, no result yet), `none`, or the run's final code. The phone stops at `published` when the entry appears, and at any other final code with "No video was found for this game yet." (`no_video`, `sources_unreachable`, `ambiguous_link`, `deadline`) or the matching message for `too_early`, `game_over` and `no_game`.

### Get video progress

The phone shows that the search is moving, in plain words, so a long wait never looks like a frozen app. Progress is keyed by team and event, so every phone waiting on the same game sees the same thing.

| Moment | Phone text (under the Get video button) |
|---|---|
| Button pressed, search not yet on a site | `Looking for video…` |
| Trying a site (`k` of `n`) | `Looking for video (k of n)…` with `n` dots, one filled per site tried |
| A site is found | `Video found. Getting it ready…` |
| Saved | The Play button appears |
| No site had it | `No video found. Try again in a few minutes.` |
| Nothing new for 90 s | `Still looking…` |
| `too_early`, `game_over`, `no_game` | Today's plain messages for those cases |

- The phone never shows why a site failed, a site name or a host. The reasons stay in the GitHub run summary for the owner (Listing failover).
- `n` comes from the run; the phone does not know the source count in advance. Leaving the screen and coming back during the run picks the progress up again from the next poll.
- Steps sent: the Worker records `requested` on `202 started` or `in_progress`; the `extract` job posts `source_start {k, n}` and `found {k, n}`; `publish.mjs` reports the final code through `/run-status`.
- `POST /run-progress` takes `{team, sport, eventId, runId, step, k, n, at}` signed with HMAC-SHA256 under `RUN_PROGRESS_KEY`, with the same 300 s replay window as `/run-status`. It can only record progress: it never sets a final code, never releases an in-flight slot and never touches a streams file. This keeps the result key (`RUN_STATUS_KEY`) out of the job that opens untrusted pages. `TeamGate` keeps the latest step for the game for 30 min.
- `GET /streams?team=<key>&event=<id>` returns the progress as header `X-Run-Progress` (compact JSON: `step`, `k`, `n`, `updatedSecondsAgo`) next to `X-Run-State`.
- Tests: Worker route, signature and replay tests for `/run-progress`; a pipeline test that no progress body carries a label or host; the Get video driver against the Worker v2 mock walks a three-site run that succeeds on site 3 and checks each phone text above.

`POST /get-video` check order: (1) the body is a JSON object; (2) the team's shape and catalog entry, retired entries included; (3) the sport against the team's kind; (4) `eventId` against `^\d{1,12}$`; (5) the `GlobalGate` wrong-key lockout for the IP; (6) a constant-time compare against `APP_KEY`, then `APP_KEY_PREVIOUS` when set (`pinMatches`, kept from `index.js:134-145`), with failures recorded in `GlobalGate`; (7) the event check in `events.js`: the event comes from ESPN `summary?event=` for the team's adapter, or statsapi `schedule?gamePk=` for MLB, cached 60 s per isolate; the team must play in it (else `bad_event`) and the game must be Live or inside the window (else `not_in_window`); when the provider does not answer, the check is skipped and the later gates still apply; (8) the readiness check against the cached streams file, with the phone's match rule (`video_ready`); (9) `TeamGate(<team>).reserve(ip, eventId)`: the per-game cooldown (`in_progress`), the IP+team limit, then the per-game cap; (10) `GlobalGate.reserve()`: the IP hourly limit, the in-flight cap and the global hourly limit, releasing the team reservation on refusal; (11) dispatch, releasing both reservations on failure, and `TeamGate` records `queued`. The key check comes before the event check, so a caller without the key cannot make the Worker call ESPN. The wrong-key limit is IP-wide, because a per-team limit alone would allow guesses across about a thousand catalog keys.

`POST /run-status` accepts a body whose HMAC matches `RUN_STATUS_KEY` and whose `at` is within 300 s, stores the code in `TeamGate` for that game, and releases the run from the `GlobalGate` in-flight count. A run that never reports is released after 20 min.

| `[vars]` limit | Default (O8) | Keyed by |
|---|---|---|
| `COOLDOWN_SECONDS` | 180 | team + event (dedupe together with the pipeline's `video_ready` exit) |
| `GAME_DISPATCH_MAX` | 10 | team + event |
| `IP_TEAM_DISPATCH_PER_10_MIN` | 3 (today's count, `index.js:1-2`, no longer shared across teams) | IP + team (all sports of a school together) |
| `IP_DISPATCH_PER_HOUR` | 20 | IP (`rateLimitKey`: IPv4, or IPv6 /64, `index.js:81-93`) |
| `IP_FAILED_KEY_PER_HOUR` | 10 | IP |
| `GLOBAL_DISPATCH_PER_HOUR` | 60 | all, counted only for requests that pass the event check |
| `GLOBAL_IN_FLIGHT_MAX` | 15 | all; leaves 5 of the account's 20 concurrent jobs for release and catalog runs |
| `READ_LIMITER` binding | 120 per 60 s | IP, on `/streams` and `/catalog` |

A caller with the extracted key can start runs only for a game that is Live or near its start and has no entry yet, at most 10 per game, so the presses that reach Actions are presses that also serve the family. A caller spread over many IPs can still fill the global hourly cap; the response is a `[vars]` change or a key rotation (CI and deploy). Dispatch: `POST https://api.github.com/repos/<owner>/Danner_App/dispatches` with `{"event_type": "team-get-video", "client_payload": {"team": "ncaa-66", "sport": "football", "eventId": "<id>", "origin": "phone", "requestedAt": "<ISO time>"}}`.

Reads (`streams.js`): per isolate, the Worker keeps an index of each league folder from `GET /repos/<repo>/contents/streams/<league>` (file name to blob SHA), refreshed every 10 s by a conditional request; a 304 does not count against the PAT's primary limit (`index.js:197-199`), and a missing folder is cached as empty for 60 s. A team with no file in the index gets the empty document with no further GitHub call. A file is read by blob SHA with `Accept: application/vnd.github.raw` and cached per isolate by that SHA, which never changes. Catalog files use the same pattern with a 3600 s refresh. A publish is visible to a polling phone within about 15 s. `caches.default` is not used, because Cloudflare documents Cache API calls as no-ops on `*.workers.dev` (outside knowledge; to be confirmed at the staging deploy).

Gates (`gates.js`) are plain classes that take an injected storage object, so `node --test` runs them. `durable.js` holds the `TeamGate` and `GlobalGate` Durable Object shells that extend `DurableObject` from `cloudflare:workers` and delegate to `gates.js`; the Node tests never import it. `wrangler.toml` keeps `name = "guardians-get-video"` and adds `[vars]` for `GITHUB_REPO = "<owner>/Danner_App"` and the limits above, Durable Object bindings `TEAM_GATE` and `GLOBAL_GATE` with `new_sqlite_classes = ["TeamGate", "GlobalGate"]`, and a `[[ratelimits]]` binding `READ_LIMITER` (today's file has only a commented `[[unsafe.bindings]]` form, `workers/guardians-get-video/wrangler.toml:9-15`). SQLite-backed Durable Objects are offered on the Workers Free plan (outside knowledge); the Phase 2b staging deploy confirms it.

The PAT behind `GITHUB_TOKEN` comes from repo secret `WORKER_GITHUB_PAT`. The README allows a classic `repo` token (`workers/guardians-get-video/README.md:22`), so Phase 2b checks it; a classic token is replaced by a fine-grained one (this repo only, Contents read and write, Metadata read) and its expiry date goes into the owner's private record.

### Abuse and quota bounds

Items marked * are outside knowledge and do not appear in repo code.

| Resource | Limit | Bound in this design |
|---|---|---|
| Actions minutes | Free for standard runners on a public repo* | Event-window check, per-game cap, `video_ready` exit before the browser starts |
| Concurrent jobs | 20 per account on the Free plan*, shared with release builds | `GLOBAL_IN_FLIGHT_MAX` 15; one group per team+sport |
| PAT primary limit | 5,000 requests/h* | League index by conditional request; blobs cached by SHA; unknown keys never reach GitHub; at most 60 dispatches/h; daily `worker-health.yml` check |
| `GITHUB_TOKEN` in Actions | 1,000 requests/h per repo* | About 2-8 contents calls per run, at most 60 runs/h |
| Workers and Durable Objects Free | 100,000 requests/day each*, 10 ms CPU* | `READ_LIMITER`; hub tiles do not fetch; streams polled every 60 s only near a game; DO calls only on presses and Get video polls; a Cloudflare usage notification at 60% (owner, Phase 2b) |
| ESPN and statsapi from the Worker | No published limit* | Only after the key check; 60 s per-isolate cache per event |
| Commits on `main` | No hard limit | One per `published` outcome; at most 10 runs per game and 60/h overall (today about 30 commits in two months for three teams) |
| Junk files | — | Catalog allowlist in the Worker and pipeline; files created only on `published`; `publish.mjs` re-validates the path |

### CI and deploy

- `ci.yml` runs on `pull_request`, on `push` to `main` (ignoring `streams/**` and `catalog/**`) and on `workflow_call` with a `ref` input. Jobs: `app` (`npm ci`, `npm run typecheck`, `npm run test:all`, `node ../tests/imports/run.mjs`, which imports every pure module listed under App layout under plain Node); `pipeline` (`TZ` matrix `UTC`, `Pacific/Honolulu`, `America/Chicago`; `npm test` with the extractor injected, no browser); `worker` (`node --test workers/team-worker/test`, gates and routes only); `catalog` (`scripts/team-catalog/validate.mjs`: schema, unique keys, preset guards, overrides resolve, every `streams/**` file parses as v2 and maps to a catalog key); `hygiene` (fails on a tracked `config.json` under `scripts/`, and checks the `stream-pipeline.yml` permission blocks); `ios-build` (macOS, on `workflow_dispatch` and on PRs touching `app/modules/**` or `app/package.json`: `expo prebuild` plus an unsigned `xcodebuild`, O17).
- `main` has no required status checks (Decided 19). `release.yml` gains job `checks: uses: ./.github/workflows/ci.yml` with the tag ref; `android`, `ios` and `ios-testflight` (Phase 1b, iPhone distribution) get `needs: checks`. `checks` also confirms that `<EXPO_PUBLIC_DANNER_WORKER_URL>/health` answers 200 and that the SHA-256 of `EXPO_PUBLIC_DANNER_APP_KEY` equals `release/app-key.sha256`. `android` verifies the signing certificate. The `release` job's Latest and create steps (`release.yml:220-253`) also creates the release as a draft when the tag's major version is above the latest published one (O20).
- `worker-deploy.yml`: `workflow_dispatch` with inputs `target` (`staging` deploys `--name guardians-get-video-staging`; `production` deploys the real name), `rotate_key` and `rollback`. Job `test` runs the Worker tests; job `deploy` runs `cloudflare/wrangler-action@v3` with `workingDirectory: workers/team-worker` after `npm ci` and an explicit `wranglerVersion` (a 4.x release with `[[ratelimits]]`, pinned in Phase 2b), and sets the Worker secrets `APP_KEY` (from `EXPO_PUBLIC_DANNER_APP_KEY`, refused unless its SHA-256 matches `release/app-key.sha256` or `rotate_key` is set), `RUN_STATUS_KEY`, `RUN_PROGRESS_KEY` and `GITHUB_TOKEN` (from `WORKER_GITHUB_PAT`). `rollback` deploys `workers/guardians-get-video/` with a `deleted_classes` migration for the two gate classes; it exists only until Phase 6 step 8. A `push` trigger on `workers/team-worker/**` and `.github/workflows/worker-deploy.yml` is added in Phase 6 step 8.
- `worker-health.yml` (from Phase 6 step 8): daily `cron: '41 14 * * *'`; calls `/health?deep=1`, `/catalog` and `/streams?team=mlb-5`, and opens an issue on any failure.
- Key rotation: a new `EXPO_PUBLIC_DANNER_APP_KEY` and hash ship in a release; the deploy runs with `rotate_key`, and `APP_KEY_PREVIOUS` holds the old key until the owner confirms every family phone has updated (iPhones from the TestFlight tester list in App Store Connect).

## TV Location

### What changes

| Today | Target |
|---|---|
| `TRIPOLI_DESTINATION`, `isTripoli`, Tripoli canonicalization (`app/tvLocation/destination.ts:9-13,44-46,59-61`); every mount starts at Tripoli (`TvLocationScreen.tsx:635`) | Deleted; no compiled location anywhere. The screen starts unloaded and reads both keys with one `multiGet` |
| `Use Tripoli default` (`TvLocationScreen.tsx:239-244`); error copy "…Tripoli is selected." (:656) | `Use my default (<label>)`, `Make this my default`; "The saved location could not be loaded. Choose a location." |
| Sign-in only inside step 3's verify WebView (`TvLocationScreen.tsx:32,619`) | `Sign in`, `Switch account`, `Sign out` in an `On this phone` panel below step 4 |
| Cookie module: Android flush only (`app/modules/danner-webview-cookies/expo-module.config.json`) | `clearYouTubeSession()` and `youTubeSessionState()` on Android and iPhone |
| The geolocation script runs on every document, including `accounts.google.com` and iPhone subframes (`geolocationInjection.ts:8-9`, `TvLocationScreen.tsx:590-592`) | The script returns at once unless the hostname is `youtube.com` or ends with `.youtube.com` |
| The map falls back to `DEFAULT_START` Tripoli (`app/scripts/offline-us-map.template.html:107,217-235`) | No start: a contiguous U.S. view with nothing selected |

### Location state and first use

| Key | Value | Written by | Removed by |
|---|---|---|---|
| `danner.tv.default.v1` | `{label, latitude, longitude}` (`destination.ts:3-7`) | First-use save; `Make this my default` | `Forget location` |
| `danner.destination.v1` | Same shape; the point YouTube receives | Any picker save; `Use my default` | `Forget location` |

`resolveTvLocation(defaultRaw, currentRaw)` in `destination.ts` (pure, unit-tested): both absent → first use; only the current point → it becomes the default, written once (this keeps every point a parent saved under v1.x, with no seeding code); only the default → current := default in memory; both → as stored; unparseable or a storage error → treated as absent, with the load-error banner. `destinationFromStored` keeps its coordinate validation (`destination.ts:15-35`).

- First use: step 1 reads `No location chosen yet` with `Choose on map`. `Use this location` (:420-425) is hidden, so steps 2-4 cannot start. The map opens on the contiguous U.S., and `Save this location` stays disabled until the page sends a `selected` event (pan, tap, `U.S.` button or a search result). Saving writes both keys.
- Once a default exists, the picker buttons are `Use this map location` (primary), plus `Use my default (<label>)` and `Make this my default` when the draft differs from the default. Step 1 shows `Use my default (<label>)` beside `Change map location` when the current point differs from the default. A moved point while on step 4 still returns to step 3 (:713-726).
- `On this phone` panel, after the step 4 card (after `TvLocationScreen.tsx:490`), with no step number, which keeps step 3 as an update-button-only step (`AI_RULES.md:59`): a status line (O14); `Sign in` (when signed out or unknown); `Switch account` and `Sign out` (when signed in or unknown); `Default: <label>` and `Forget location` (confirm, then `multiRemove` both keys and return to step 1). `Start over` (:741-746) keeps the location.

### Own-account sign-in

- `YouTubeTvWebView` is factored out of `VerifyView` (`TvLocationScreen.tsx:496-626`) with props `startUrl`, `injection?` and `onMessage?`. It keeps the navigation gate (`verifyNavigation.ts:17-34`, https `youtube.com`/`google.com` only), `sharedCookiesEnabled`, `thirdPartyCookiesEnabled`, `setSupportMultipleWindows={false}`, `geolocationEnabled={false}`, no `incognito`, and the 20 s / background / close flush (:523-539).
- `VerifyView` is `https://tv.youtube.com/verify` plus the geolocation injection, unchanged. `AccountView` has no injection. `Sign in` opens `https://tv.youtube.com/verify`, the only URL validated to send a signed-out WebView to Google sign-in (`Docs/Production/Validation.md:74`); the Phase 5 device check may replace it with an `accounts.google.com` sign-in URL whose `continue` target is on `tv.youtube.com`. `Switch account` opens Google's account chooser with a continue target on `tv.youtube.com`; its exact path is chosen in the same check, inside the existing gate. The view returns to the steps 800 ms after reaching `tv.youtube.com` from an `accounts.google.com` page.
- `Sign out`: confirm "Sign out of YouTube TV on this phone? The TV stays signed in.", then `clearYouTubeSession()`, then `flushWebViewCookies()`. Location and steps are unchanged.
- No credential fields, no password storage and no autofill. Google's pages handle 2-Step and device prompts. Passkeys are not expected to work in the embedded WebView, so the sign-in panel says: "If Google asks for a passkey, choose Try another way and use your password or phone." When the account view lands on Google's "This browser or app may not be secure" page or a `disallowed_useragent` error, the app closes it and shows "Google blocked sign-in inside the app for this account." The app never shows the account email. Whether the Android session survives a swipe-away is still open (`Validation.md:95`, Review) and is a Phase 5 exit row.

### Native module `app/modules/danner-webview-cookies/`

| Function | Android (`DannerWebViewCookiesModule.kt`) | iPhone (new `ios/DannerWebViewCookiesModule.swift`) |
|---|---|---|
| `flushCookies` | Unchanged | Not defined; a JS no-op as today |
| `clearYouTubeSession(): boolean` | `CookieManager.removeAllCookies` → `flush()` → `WebStorage.getInstance().deleteAllData()`. App-wide (O15) | `WKWebsiteDataStore.default()` records whose name contains `google` or `youtube` → `removeData`; `HTTPCookieStorage.shared` cookies on `google.com`/`youtube.com` |
| `youTubeSessionState(): 'signed-in' \| 'signed-out' \| 'unknown'` | Cookie names for `https://accounts.google.com` checked against an allowlist (`SID`, `__Secure-1PSID`, `__Secure-3PSID`; unverified) | The same names from `WKHTTPCookieStore.getAllCookies` |

Only the boolean or the enum crosses the bridge; cookie values never reach JS, logs or AsyncStorage. Any exception returns `false` or `'unknown'`. Config: `"platforms": ["apple", "android"]` (precedent `app/modules/danner-live-hls/expo-module.config.json`) and a podspec modeled on `app/modules/danner-live-hls/ios/DannerLiveHls.podspec` (the provisioning-profile module is deleted in Phase 10).

- Host guard: the first statement of the IIFE in `createGeolocationInjection` (`geolocationInjection.ts:8-9`) returns unless the hostname is `youtube.com` or a `*.youtube.com` host, so `accounts.google.com` and other `*.google.com` pages never get the shim. iPhone subframe injection (`TvLocationScreen.tsx:590-592`) stays, and YouTube subframes keep the shim. The `Pilot` TestFlight check in Phase 6 step 5 confirms the iPhone verify flow before the release is published.
- Team player WebViews in `app/playback/` keep `incognito={Platform.OS === 'ios'}` with the reason comment from `GuardiansScreen.tsx:629-631`: on Android, incognito clears every WebView cookie in the app and signs TV Location out. A source-check test enforces this.

### Offline map

| File | Change |
|---|---|
| `app/scripts/offline-us-map.template.html` | Delete `DEFAULT_START` (:107). Move the start parsing into a pure `startFromInputs(injected, hash, query)` inside `// BEGIN SELECTION RULES` (:104-211); it returns `undefined` unless latitude and longitude are both finite. With no start, fit the contiguous U.S. without `selectCenter()` (:466-476), so only `ready` is sent. `searchSelection` returns the Census point unless the label equals the saved point's label (:203-210) |
| `app/assets/offline-us-map.html` | Regenerate with `npm run build:offline-map -- --reuse-json` (`app/package.json:11`) |
| `app/tvLocation/offlineMapSelection.ts:208-224`, `OfflineUsMap.tsx:15-21,54-78` | Mirror the change: optional `savedStart`; with no destination, no hash and no start injection |
| `tests/offline-map/run.mjs` | :44 drops `DEFAULT_START` and adds `startFromInputs`; delete :48-49; rewrite :211-219 (a Tripoli search returns the Census point, and the test records its distance from the old default; a matching saved label returns the saved point); add `startFromInputs` cases |

## Rules, docs and tests

### `AI_Framework/AI_RULES.md`

`AI_RULES.md` line numbers in this plan refer to the file at `823d2be`; after Phase 0, old lines 18-40 are +1, 42-57 are +2, and 58-63 are +3. Phase 0 removes the directives that forbid planned work and marks the ones a later phase rewrites. Behavior rules are rewritten when the phase that changes the behavior lands, because docs describe current behavior (`AI_RULES.md:28`).

| Phase | Lines and action |
|---|---|
| 0 | ADD: "`Docs/Production/ModularTeams.md` is the approved delivery plan. Work inside a plan phase follows the plan where it differs from a constraint below; each phase rewrites the constraints it changes. `Docs/Archive/FixedTeams/` and tag `fixed-teams-final` are history, not constraints." REMOVE: the "…not a parameterized sports engine." and do-not-reuse dispatch, workflow and secret sentences at :53 and :55, and "Each module keeps its own copy." at :57. MARK :42, :44 and :47 with "(Superseded by `Docs/Production/ModularTeams.md`, Phase 4 or 5.)". EXTEND :17 (also Google or YouTube TV account data, every listing URL including backups, the app key); :28 (`Docs/Production/` briefs with a `Status:` header may describe planned work); :62 (the package id, bundle id and keystore never change; versionCode strictly rises; AsyncStorage keys carry a version suffix, a new version is written by migration, and the old key is removed only after the new write succeeds). ADD: Android WebViews never set `incognito`; team players use `incognito={Platform.OS === 'ios'}`. ADD: `main` has no required status checks, because bots commit to it |
| 1 | ADD: listing sources form an ordered list in the pipeline secret and are tried one at a time; a source is abandoned on a move-on failure (site down or blocked, or this game not found or not playable there); source 1 keeps today's timeouts; logs name `source k of N`, never a host |
| 1b | REWRITE :16 (iPhone installs, TestFlight invitations and recovery follow the new `AI_Framework/IPHONE_INSTALL.md`; Windows has no Xcode, so iPhone builds are signed only in the release workflow's macOS jobs). EXTEND :17 (the Apple team id, signing certificates and `.p12` passwords, provisioning profiles, App Store Connect key ids, issuer ids and `.p8` keys, testers' Apple Account emails, the owner's legal name in signed build logs; Apple signing secrets live only in the `apple-release` environment, and signed build output goes to a file, with only filtered `error:` lines printed). REWRITE :48 (the warning shows only when an embedded profile exists, which means a SideStore copy: `This iPhone copy is retired` or the final-48-hour title, over `Ask for the TestFlight invitation.`; removed in Phase 10). REWRITE the iPhone half of :49 (iPhone shows the TestFlight notice when `testflight.json` names a newer version and no embedded profile exists; `Open TestFlight` opens TestFlight) and drop its LocalDevVPN sentence. REWRITE :61: the Android APK path is unchanged; iPhone builds are signed in CI by the owner's paid Apple Developer team and delivered only through TestFlight internal testing; each release carries the APK, the unsigned compatibility IPA until Phase 10, `IPHONE_SETUP.md`, `SHA256SUMS.txt`, `version-manifest.json` and, once its build is in `Everyone`, `testflight.json`, and no `sidestore-source.json`; the paid membership is required; App Store Connect work is limited to the app record, internal groups, testers and uploads; no App Store or external TestFlight submission (O21). This replaces "Do not require paid Apple Developer membership or add app-store submission work." EXTEND :62 (the Apple team and the App Store Connect app record never change; iOS `CFBundleVersion` adds `.n` only on keep-alive re-uploads; the move from SideStore was the one deliberate signer change) |
| 1c | REWRITE the board sentence of :55 ("A live featured game refreshes a football board, men's basketball halves, or women's basketball quarters every five seconds.") to name the football board and the basketball arena board, both refreshed every five seconds. ADD: the arena board shows only values derived from the ESPN summary the live poll already fetches, plus the Core situation resource when the O27 timeouts sub-decision turns it on; a team's players are labelled as on the floor only when its substitution replay passes the consistency check, or, with the adapter's `activeLineup` flag on, the `active` check, else that team's table shows top scorers under a `TOP SCORERS` caption; timeouts left come only from an ESPN field that holds them, never from timeout plays and allotments; a cell whose capability flag is off is omitted; the board carries no logos or other branding, and team names are text. EXTEND :56 (ESPN captures for board tests live under `tests/leagues/<adapter>/` and `tests/scoreboards/archived/` and never enter the Expo asset graph) |
| 2b | ADD: one pipeline (one workflow, one dispatch type, one secret); team, sport and event come from the dispatch and are checked against the committed catalog; the job that runs the browser never holds a write token; dedupe per game; rate limits per (IP, team); the allowlist is append-only |
| 3 | SPLIT :50-51 into a shared team-screen rule plus MLB adapter specifics; streams per team key through Worker v2 and `EXPO_PUBLIC_DANNER_*`, with the playback, Cast, TV relay and isolation sentences kept for all screens. REPLACE :52, :54, :56 with one fixture rule (`tests/leagues/`, `tests/team-harness/`, dev-only `EXPO_PUBLIC_TEAM_*` and `EXPO_PUBLIC_TEST_SELECTION`, never in the asset graph). GENERALIZE the rest of :53, :55 into NFL and NCAA adapter rules, the Phase 1c arena-board rule to every basketball adapter, and :57 to every featured card (3-way bar when ESPN gives a draw share). ADD the explicit `.ts` import rule for pure modules. EXTEND :15 (ports: 8108 fixture server, 8109 Cast web, 8111 Get video mock) |
| 4 | GENERALIZE :42 (hub, selected-team screens, fixed TV Location tile) and :49 (prompt suppressed while a team screen, the picker or TV Location is open). REPLACE :47 with the dynamic-hub rule (logo-only; selected teams, TV Location, `+`; the grid grows and scales; 30-tile cap; values live in `app/hub/hubGrid.ts` and `Docs/Art/README.md`). ADD picker, school-tile merge and removal, preset seeding, and logo rules |
| 5 | EXTEND :43 (app-opened sign-in and account-chooser URLs, inside the same gate, with no injection). REPLACE :44 (no compiled default; first use requires a choice; default and current stored on the phone). EXTEND :45, :58 (`Sign out` on both platforms), :59 (the `On this phone` panel outside the cards; no credential fields; injection only on `youtube.com` hosts) |

### Docs

| Path | Action | Phase |
|---|---|---|
| `Docs/Production/ModularTeams.md` | This plan, with header `Status: ACTIVE` | 0 |
| `Docs/Archive/FixedTeams/` | As indexed in its `README.md`: Hub, Guardians, Patriots, Cyclones, TvLocation, Pipeline, WorkerAndWorkflows, StreamsFiles and TestsAndRules, `Status: ARCHIVED`, pinned to `823d2be`. Its tag commands already use `fixed-teams-final`; the tag message changes to "Fixed three-team design archive snapshot" | 0 |
| `Docs/Production/Cyclones.md` | Header becomes `Status: SUPERSEDED` with a pointer to this plan, because it forbids parameterizing (:8); the archive links its `823d2be` text. Deleted in Phase 3 after its NCAA facts (:120-126, :130-133, :165-179, :327-354) move to `Docs/Domain/Leagues/NCAA.md` | 0, 3 |
| `app/README.md:5`, `app/hub/README.md:7`; `Docs/README.md:28`, `Docs/Production/README.md:9`; `AI_ONBOARDING.md:9` | The two README lines are marked superseded and rewritten with the phase that changes the folder; the Cyclones index rows become a plan row and an archive row; onboarding points to this plan and drops its duplicated `v1.4.16` sentence | 0 |
| `Docs/Archive/IphoneSideStore/` | The SideStore method ("the way it used to be"), `Status: ARCHIVED`, pinned to `19740af`: card, agent procedure, release job, app side, rules, validation, pain points and rebuild steps. `Docs/Archive/README.md:5-7` lists it beside `FixedTeams/`. Committed with this plan revision, because it records the method as it is today and depends on nothing Apple-related; the tag `iphone-sidestore-final` follows when the owner accepts O26 | 0 (revision) |
| `release/IPHONE_SETUP.md` | Replaced by a short TestFlight card (accept the invitation, install TestFlight, Install, Automatic Updates) plus the one-time "Moving from SideStore" section (iPhone distribution). Still copied into each release (`release.yml:211`) | 1b |
| `AI_Framework/IPHONE_INSTALL.md` | Replaced by the paid-channel procedure: enrollment, App ID and entitlements, app record and groups, API key, certificate and profile without a Mac, the `apple-release` environment and its secrets, adding a tester, keep-alive and `testflight-hold`, yearly renewal, the license and SDK deadlines, recovery (the `testflight-distribute.yml` re-run, `android_only`, a retry on the tag ref). The SideStore procedure lives on in the archive | 1b |
| `release/README.md:3-15`, `release/RELEASE_NOTES.md:12-15,47-48`, `release/build-update-assets.mjs:34,54-79,85-88` | The asset list without `sidestore-source.json` (the writer stops producing it) and with `testflight.json`; TestFlight install and update lines; the Android install steps (`RELEASE_NOTES.md:5-10`) say to install the Android app only from the in-app update or this repository's releases; `release/README.md:15` describes the retry on the tag ref, the skipped duplicate upload and `android_only` | 1b |
| `Docs/Anchor/Vision.md:39,41` | Platforms: signed Android APK; iPhone through TestFlight under the paid membership; the warning only on SideStore copies until Phase 10; no SideStore handoff | 1b |
| `Docs/Technical/Stack.md:26,47,57,59,66,73,116,123,125` | Module and warning limited to SideStore copies; `eas.json` unused; `release.yml` signing and upload; TestFlight delivery and notice | 1b |
| `Docs/Production/Roadmap.md:26,30-31,35-37`, `Docs/Production/Validation.md:11,14,19-23,83-92,96,98,107,142` | SideStore rows retired to the archive; new rows `iPhone paid App ID and entitlements`, `iPhone signed TestFlight build`, `iPhone TestFlight install`, `iPhone TestFlight update` and `iPhone TestFlight keep-alive`; an iPhone identifiers and signing section beside the Android one (`:107`) with `<TEAM_ID>` as a placeholder and the expiry dates kept in the owner's private record | 1b |
| `AI_Framework/AI_ONBOARDING.md:9,17,26`, `AI_Framework/README.md:9`, `Docs/README.md:32-33`, `Docs/Production/README.md:12`, `app/README.md:9,72,74,80`, `app/hub/README.md:3,8-11`, `app/modules/README.md:8`, `app/plugins/README.md`, `tests/README.md:11-12`, `.github/` notes | SideStore, refresh and warning wording replaced; the signing plugin, `ios-testflight.yml`, `testflight-distribute.yml` and `ios-keepalive.yml` described; the index rows add the iPhone archive (in the Phase 0 revision) | 1b |
| `Docs/Domain/BasketballBoard.md` (new; a row in `Docs/Domain/README.md`), `Docs/Domain/Cyclones.md:8`, `app/cyclones/README.md:12`, `Docs/Art/README.md:22`, `app/README.md` (the new `app/scoreboards/` and `app/leagues/` folders), `tests/README.md`, `Docs/Production/Roadmap.md`, `Docs/Production/Validation.md` | The arena board's cells, derivations, fallbacks, capability flags and states; the Art line "a football board or basketball halves/quarters while live" names the arena board, its stripe rule and its tokens; the four `Basketball arena board` Validation rows | 1c (3 under O27 (b), 7 under (c)) |
| `Docs/Archive/IphoneSideStore/README.md:17,61,321,388-391`, O26 in this plan | Only when Phase 1c ships `v1.4.17` before `v1.5.0`: `v1.4.17` becomes the last release built and published the SideStore way, and its release page and assets become the last links | 1c |
| `scripts/README.md:5-9`, `workers/README.md:5`, `.github/` notes | New packages and workflows | 2b |
| `Docs/Domain/{Guardians,Patriots,Cyclones}.md` | Become `Docs/Domain/Leagues/{MLB,NFL,NCAA}.md`, with the presets as worked examples. `Guardians.md:20-77` becomes `Docs/Domain/Streams.md`. New `Docs/Domain/TeamScreen.md`, which links `Docs/Domain/BasketballBoard.md`. Tier READMEs for `app/`, `app/team/`, `app/leagues/`, `app/playback/`, `app/streams/` and `tests/` | 3 |
| `Docs/Domain/Hub.md` (new), `Docs/Art/README.md:9-12,20,22,28-32`, `app/hub/README.md`, `Docs/Anchor/Vision.md:8`, `AI_ONBOARDING.md:5`, `Docs/Production/Validation.md:18` | Grid, `+`, picker, merge rules, persistence, seeding; accent and fetched-logo rules | 4 |
| `Docs/Domain/Playback.md:6-15,25,34`, `app/tvLocation/README.md` | First use, default and current, `Forget location`, own-account sign-in | 5 |
| `Docs/Technical/Stack.md:17-20,46-72,90-115`, `scripts/README.md`, `workers/README.md`, `release/RELEASE_NOTES.md` | Rewritten for `v2.0.0` and the deleted folders. `release/IPHONE_SETUP.md`, `AI_Framework/IPHONE_INSTALL.md` and the `sidestore-source.json` writer (`release/build-update-assets.mjs:64`) are handled in Phase 1b | 6 |
| `Docs/Production/Roadmap.md:9-22,33` | Capability rows updated | each phase |

### Tests

| Layer | Path | Contents |
|---|---|---|
| Adapter fixtures and runner | `tests/leagues/<adapter>/`, `tests/leagues/run.mjs [--league k]` | Probe captures plus the expected `TeamGame[]`; every adapter × the nine phone zones (`tests/patriots/run-snapshot.mjs:33-43`); app adapter rows equal catalog rows |
| Engine | `tests/team-engine/run.mjs` | Every case from the three `run-snapshot.mjs` suites, ported before the old folders are deleted: featured pick, recap day, `Time TBA`, delays, video window, stream match (fixtures shared with the pipeline, including a postponed event and a resumed game), records, partial-failure carry-forward, elimination (CBI, CIT, CFP, conference finals), live merge |
| Imports | `tests/imports/run.mjs` | Imports every pure module under plain Node |
| Basketball arena board | `tests/scoreboards/run.mjs`; board cases in `tests/leagues/run.mjs`; the `live-basketball` device scenario (`tests/cyclones/` in Phase 1c, `tests/team-harness/` from Phase 3) | `arenaLayout` at W 228, 244, 284 (a 360 dp window), 336, 354, 612 and 644; phase, period and clock text; row order and dash padding; foul tone at limit − 2, limit − 1 and limit for limits 5 and 6; bonus side per adapter, hidden outside Live; the spoken example; the stale note at 30 s, 60 s and 150 s. Lineup derivation on trimmed archived games (`tests/scoreboards/archived/`) and replayed live captures (Basketball arena board), with the expected on-floor sets, PF, team fouls per window, bonus and last foul at chosen play indexes; every prefix of each NCAA game with no label flip inside a substitution group; the synthetic cases, including the pending group, the unlogged substitutions and the fouled-out player; the shorter-`plays` poll cases. Per basketball adapter, an in-progress, a between-periods and a final capture with its expected board model. Device at 360 dp: no sideways scroll, Play above the board, three accessibility labels |
| Hub and selection | `tests/hub/run.mjs`, `tests/selection/run.mjs` | `hubGrid` for n = 1..32 on four sizes (no overlap, inside the container); ops including the 30-tile cap; migrations (corrupt JSON, schema bump, read-only mode); the seeding table; catalog parse with retired entries |
| TV Location | `tests/tv-location/run.mjs`, `tests/offline-map/run.mjs` | `resolveTvLocation`; button visibility; host guard (the injection evaluated against fake `window.location` values for `tv.youtube.com`, a `*.youtube.com` subframe and `accounts.google.com`); the `incognito` source check |
| Device harness | `tests/team-harness/server.mjs` (8108), `run-android.mjs --team <key> --scenario <s>`, `run-get-video.mjs --team <key>` (Worker v2 mock on 8111, including `X-Run-State` and `X-Run-Progress`), `run-picker.mjs`; `tests/tv-location/run-android.mjs` | Replaces the three per-team servers and drivers. The dev build gets `EXPO_PUBLIC_TEST_SELECTION`. The picker driver checks a fresh install, a pro add, a two-sport school becoming one tile, a remove-one-sport, the cap, and `adb install -r` keeping tiles and TV keys |
| Playback | `tests/playback/` ← `tests/guardians/run-cast-discovery.mjs`, `run-cast-web.mjs`, `run-shell-fix.mjs`, `extract-uidump.mjs` | Taps the first seeded tile |
| Pipeline | `scripts/stream-pipeline/test/` | Config (timing bounds), catalog, sources (each NEXT and STOP code, the challenge-aware HTTP stage, source 1 without a cap, backup clamping on a fake clock, outcome precedence, `SOURCE_ONLY`), redaction and masking (a captured fake run log never contains three fake hosts), streams v2, publish (404 create, 422 retry, candidate re-validation, run-status signature), schedules. The 65 existing tests are ported where their rule survives; the listing host in `extractGooz.test.mjs:36,46` becomes `example.invalid` |
| Worker | `workers/team-worker/test/` | Every route and code, check order, no GitHub text in bodies, the empty document, the league index, each gate class with fake storage, reservations released on dispatch failure, run-status signature and replay window |
| App update and TestFlight | `tests/app-update/run.mjs`, `tests/testflight/run.mjs` | Phase 1b. App update: drop the `sideStoreInstallUrl` cases (`:20,195-200`); keep the `signingWarningVisible` cases (`:132-192`) until Phase 10; keep the manifest cases with the compatibility `ios` entry, and add one that the shipped writer still yields an `ios` entry the `v1.4.16` parser accepts and one that the new parser accepts a manifest without `ios`; add `testflight.json` parse and notice-gate cases (newer version, same version, a present profile, untrusted host); replace the `sidestore-source.json` asserts (`:323-327`, including the bundle-id guard at `:324`) with an assertion on `app/app.json:15`; keep the count of three tag regexes that `tests/app-update/run.mjs:270-275` reads from `release.yml`; cover `IOS_BUILD_SUFFIX` in `app.config.js`. Provisioning warning: the retired-copy title and instruction. TestFlight: `release/testflight.mjs` against a fake API: `find` sees an existing version and build number, so a retry skips the upload; `distribute` picks the build by version and build number, never adds a draft's build to `Everyone`, and uploads `testflight.json` only after the group add; `keepalive` measures only the newest non-expired `Everyone` build, so a newer `Pilot`-only or expired build does not reset the clock, promotes a keep-alive build only after 2 days in `Pilot` and never under `testflight-hold`; nothing prints an email, a key or a team id |
| Removed | `tests/guardians/prove-get-video.mjs`; `tests/provisioning-warning/` (Phase 10, O24) | The first makes live GitHub calls and logs a debug payload (:45-56, :122-134); the second tests a warning that only SideStore copies show, which ends with the compatibility IPA |

npm scripts (`app/package.json:12-42`): Phase 1b adds `test:testflight`; Phase 1c adds `test:scoreboards` and `test:cyclones:android:live-basketball` (O27 (a); Phase 3 under (b)); Phase 2b adds `test:all`, which runs today's snapshot, offline-map, provisioning-warning, app-update, testflight and scoreboards suites; Phase 10 removes `test:provisioning-warning`; later phases add `test:leagues`, `test:team-engine`, `test:hub`, `test:selection`, `test:tv-location`, `test:imports`, `test:team:*`, `test:picker:android`, `test:tv-location:android` and `test:playback:*`, and extend `test:all` with each pure-Node suite.

## Delivery phases

| # | Phase | Ships as | Installed `v1.x` phones |
|---|---|---|---|
| 0 | Plan, archive, tag, rules unblocked; revision for Decided 20 with the iPhone archive | Docs commits and tags | Unaffected |
| 1 | Listing backups in today's pipeline | Merge to `main` | Get video gains backups |
| 1b | iPhone developer signing (O21-O26) | App `v1.5.0`: APK and TestFlight build | Android updates in place from the prompt; each iPhone moves by hand to TestFlight once, as a new empty app |
| 1c | Basketball arena board on today's Cyclones screen (O27 (a)) | App `v1.4.17` (before `v1.5.0`) or the next `v1.5.x` | Android updates in place from the prompt; iPhones update through SideStore before `v1.5.0`, TestFlight after |
| 2a | Catalog and probe | Merge to `main` | Unaffected |
| 2b | Backend v2 dormant, CI | Merges to `main`; staging Worker only | Unaffected |
| 3 | App engine refactor | Merge to `main`, no tag | Unaffected |
| 4 | Dynamic hub, picker, persistence, seeding | Merge to `main`, no tag | Unaffected |
| 5 | TV Location made generic | Merge to `main`, no tag | Unaffected |
| 6 | Cutover | Draft `v2.0.0`, Worker v2 deploy, release published | Play and Get video stop from the Worker deploy until the phone updates |
| 7 | NBA, WNBA | App `v2.1.0` and catalog | — |
| 8 | NHL, MLS, NWSL | App `v2.2.0` and catalog | — |
| 9 | Other major categories (O12) and team code (O13) | App `v2.3.0` and catalog | — |
| 10 | Cleanup | Next release | — |

Order: 0 → 1 → 2a → 2b → 3 → 4 → 6. Phase 1b starts after Phase 0 and runs alongside 1, 2a and 2b, because enrollment waits on Apple. Phase 1b's workflows do not depend on Phase 2b: no `checks` job, no draft output and no `ci.yml`. Phase 1c (O27 (a)) starts after Phase 0 and runs alongside 1, 1b, 2a and 2b; its exit needs live NCAA games, and it never waits for `v1.5.0` or Apple enrollment. Its tag is `v1.4.17` when `v1.5.0` is not yet tagged, else the next `v1.5.x`.

Release sources (Phases 1b and 1c). Each `v1.x` tag is cut from a commit that holds only finished phases. Once Phase 2b's `release.yml` (with its `checks` job, Worker v2 health preflight and app-key hash check) is on `main`, no `v1.x` tag is cut from `main`: a later `v1.x` comes only from `release/v1.4` or `release/v1.5`, whose `release.yml` predates Phase 2b, so the v2-only checks never run against a `v1.x` build. Phase 1b's commits reach `main` before `v1.5.0` is tagged (its exit 2 dry run and exit 3 pilot build run from `main`), and the pilot can wait weeks for a game with a stream. Phase 1c's app changes reach `main` in one PR, merged once its exits 1 and 2 pass; `espn-capture.yml` merges earlier, because it changes no app code. So:
- `v1.4.17`: from `main` only when `main` holds no Phase 1b or Phase 3 commit; otherwise from branch `release/v1.4`, created off `v1.4.16`, with only the Phase 1c commits cherry-picked. Either way it carries no install marker, TestFlight notice, retired-copy warning or `ios-testflight` and `testflight` jobs.
- `v1.5.0`: from `main` before Phase 3 starts; after that, from branch `release/v1.5`, created off the latest `v1.4.x` tag (`v1.4.16`, or `v1.4.17` when Phase 1c shipped first), with only the Phase 1b commits cherry-picked.
- A later `v1.5.x` (Phase 1c after `v1.5.0`, or a hotfix): from `release/v1.5`, created off the latest `v1.5.x` tag when it does not exist, with the needed commits cherry-picked.

Every cherry-picked commit is also on `main`. Phase 5 starts after 2b (it needs the `ios-build` job) and runs alongside 3 and 4; Phase 6 needs 1b (O22), 3, 4 and 5. No `v*` tag is pushed on `main` from the start of 3 until 6, because a tag would ship a half-built app (`release.yml:4-6`). A hotfix branches from the latest `v1.x` tag: `v1.4.16` (or `v1.4.17`, Phase 1c) before Phase 1b ships, the latest `v1.5.x` after.

**Phase 0: Plan, archive, rules unblocked**
- Scope: commit this plan and `Docs/Archive/FixedTeams/`; mark `Docs/Production/Cyclones.md`, `AI_RULES.md:42,44,47`, `app/README.md:5` and `app/hub/README.md:7` superseded; apply the Phase 0 rule edits, `AI_ONBOARDING.md:9` and the index rows; add the annotated tag `fixed-teams-final` on `823d2be` (O1).
- Exit: `git grep -n -e "not a parameterized" -e "Do not parameterize" -- . ':!Docs/Archive/**' ':!Docs/Production/ModularTeams.md' ':!Docs/Production/Cyclones.md'` finds nothing; every remaining hub, Guardians-module or Tripoli constraint carries the superseded marker or falls under the Phase 0 override sentence.
- Owner: approve the doc writes (`AI_RULES.md:34`) and push the tag.
- Revision (Decided 20): commit this revised plan with `Docs/Archive/IphoneSideStore/` and its row in `Docs/Archive/README.md`. When the owner accepts O26, the owner pushes the annotated tag `iphone-sidestore-final` on `19740af` with the commands in the archive README. Exit: the archive's links resolve, and the distribution rule (`AI_RULES.md:61`) still governs iPhones until Phase 1b rewrites it.

**Phase 1: Listing backups in today's pipeline (O2)**
- Scope: in `scripts/guardians-stream-pipeline/`, add `lib/sources.mjs`, `lib/extract/providers.mjs` and `lib/redact.mjs` with the stages, codes, budgets and masking above, including the challenge-aware listing status. The three workflows gain a step that writes `STREAM_PIPELINE_CONFIG` to `$RUNNER_TEMP` and masks every source host, and the `source` input. Its `sources` replace `extract.baseUrl`; when the secret is empty, the per-team `extract.baseUrl` is the only source (this fallback leaves with the old package). Source 1 keeps the per-team `extract.timeoutSeconds` and grace from the per-team secrets; the new secret's `matching` and `timing` take effect from Phase 2b. The Worker, dispatch types, root files and app do not change.
- Exit: pipeline tests green; `dry_run` + `force` runs per team, where Guardians may end at `no_game` out of season and Patriots and Cyclones reach `dry_run` from source 1 with the new classifier; one `source: 2` run on an in-season team reaches `dry_run` from source 2 with host-free logs; normal dispatches still publish. Validation rows: `Listing source fallback (unit)` and `(Actions)`.
- Owner: create `STREAM_PIPELINE_CONFIG` before the merge (see the last section) and run the dry runs.

**Phase 1b: iPhone developer signing (`v1.5.0`; Decided 20, O21-O26)**
- Scope, on today's fixed app: remove the `sidestore://` prompt path, `APP_UPDATE_PROMPT_IOS`, `APP_UPDATE_SIDESTORE_MISSING` and `sideStoreInstallUrl` (`app/hub/appUpdate.ts:12-16,129-131`, `HubScreen.tsx:149-159,198`), skip the manifest fetch on iPhone, and add the TestFlight notice and its `testflight.json` reader (O24); keep `app/modules/danner-provisioning-profile/` and the warning, with the retired-copy text (Signing warning); make `ios` optional in `parseVersionManifest`; write `danner.install.v1` once at launch; in `app/app.json` drop the `sidestore` query scheme (`:24-26`) and add `ITSAppUsesNonExemptEncryption: false`, so no upload waits on the export-compliance question*; check the generated `PrivacyInfo.xcprivacy` and declare, through Expo `ios.privacyManifests` in `app/app.json`, every required-reason API that React Native, AsyncStorage, the Cast SDK and the local Swift modules use, because App Store Connect checks them at upload*; let `app/app.config.js` append `.<IOS_BUILD_SUFFIX>` (1-99) to `ios.buildNumber` only; add `app/plugins/withReleaseSigning.js`. In CI: the `ios` job becomes the compatibility build; add `ios-testflight.yml`, `testflight-distribute.yml`, the `ios-testflight` and `testflight` jobs, the `android_only` input, `release/testflight.mjs`, and `ios-keepalive.yml` with its heartbeat file `release/keepalive.txt`; `release/build-update-assets.mjs` and the release drop `sidestore-source.json`; `.gitignore` adds `*.cer` and `*.certSigningRequest`. The Phase 1b test, rule and doc rows above.
- Exit, in this order:
  1. The App ID is registered, and every entitlement key that `ios-testflight.yml` prints is enabled on it before the profile is made.
  2. A `workflow_dispatch` dry run of `ios-testflight.yml` with `release_tag` `v1.4.99` (versionCode 10499, below `v1.5.0`, never tagged), dispatched on `main`, or on `release/v1.5` if Phase 3 has started, archives, exports, passes the identity check, uploads and reaches `Pilot`. App Store Connect processes it with no ITMS rejection or warning email*. The owner reads the run log and confirms that no signing identity, `--sign`, profile, `team-identifier` or `application-identifier` line, legal name or team id appears.
  3. Pilot, on the owner's iPhone with that build, before any other iPhone moves: it installs from TestFlight without Developer Mode, opens every hub tile, and shows no warning and no notice; it completes a full Google sign-in and a TV verify; the TV appears in the Cast picker (if not: enable Access WiFi Information, then request the multicast entitlement if still needed, and regenerate the profile; iPhone Cast has no SideStore baseline, `Validation.md:59`); and at the first game with a stream it plays on AirPlay, sends to the TV through the local relay (the local network permission and `NSBonjourServices`), and keeps Listen playing with the screen locked when a `direct` stream is offered. The pilot also confirms that an invitation redeems when the phone's App Store account differs from the invited email, and that each family member's account type can be an internal tester*.
  4. Tag `v1.5.0` (on `main`, or on `release/v1.5`): the release is published with the APK, the compatibility IPA, the new card, checksums and manifest, and no `sidestore-source.json`; the manifest passes the `v1.4.16` parser test; the build reaches `Pilot` and `Everyone`, and `testflight.json` is uploaded. One Android family phone updates from `v1.4.16` in place with its data kept.
  5. Every family iPhone is moved (iPhone distribution) and recorded in `Validation.md` in the neutral format.
  6. A forced keep-alive run rebuilds `v1.5.0` as build `10500.1`; it reaches `Pilot`, installs over `v1.5.0` with the TV point and the Google session kept, and moves to `Everyone` on a later run (closes `iPhone TestFlight update`).
- Owner: enroll with a dedicated Apple Account; register the App ID and its capabilities; create the app record, the two groups, the API key, and with manual signing the certificate and profile; create the `apple-release` environment and its secrets (iPhone distribution, owner setup); run the pilot; invite each person; move each family iPhone and remove SideStore, LocalDevVPN and the charger automation from it; optionally uninstall iLoader and Apple website iTunes from the PC; keep the dates and reminders in the private record. The agent never sees an Apple Account email, password or key value.

**Phase 1c: Basketball arena board (`v1.4.17` or `v1.5.x`; O27 (a))**
- Scope, on today's fixed app: `.github/workflows/espn-capture.yml` and `scripts/espn-capture/capture.mjs` (Node, no dependencies), with `workflow_dispatch` inputs `adapter` (`ncaa/mens-basketball` or `ncaa/womens-basketball`) and optional `event`; without `event` it takes the first in-progress event from that day's ESPN scoreboard. Every 60 s, until the event's state is `post` or 180 min pass, it fetches the summary and the Core `…/competitions/{id}/situation` resource and writes a capture report: the summary's top-level keys; the keys of `status`, `competitors[]` and the athlete entries; and the full contents of the top-level `timeouts`, any `situation` and the Core resource, with any timeout, team-foul, bonus or possession field compared against the plays. It uploads the bodies and the report as artifact `espn-capture-<run id>` (14 days); `permissions: contents: read`, no secrets. If Phase 2a has merged first, Phase 1c runs the probe's `live-capture` job instead and adds neither file. Then: the Basketball arena board files at their final paths; trimmed captures (`header`, `format`, `boxscore`, `plays`, `timeouts`, any `situation`, and the Core situation body beside each) under `tests/leagues/ncaa-mens-basketball/` and `tests/leagues/ncaa-womens-basketball/`, and the trimmed archived games under `tests/scoreboards/archived/`; `tests/scoreboards/run.mjs`; the Phase 1c test, rule and doc rows above. Cyclones touch points:
  - `CyclonesGame.scoreboard` (`app/cyclones/cyclonesSnapshot.ts:28`) takes `BasketballBoardModel` in place of `LiveBasketballScoreboard`.
  - The live poll: `liveCyclonesSummaryFromEspn` (`espnCyclonesScoreboard.ts:357-380`) builds the model with `basketballBoardFromSummary`; the effect at `CyclonesScreen.tsx:1314-1415` keeps the applied `plays` length and the last good player cells (Polling).
  - The schedule path (`CyclonesScreen.tsx:271-279`) builds a model with scores, clock and period only and no players, because the scoreboard event has no `boxscore` or `plays`; regulation periods come from the sport, as today (`:846`).
  - The merge (`snapshotWithPreservedScoreboard`, `:149-200`) keeps the polled model while it is under 30 s old, as today, so after a 30 s stall the tables show `PLAYER STATS NOT AVAILABLE`; it fills a missing stripe color from the previous model of the same game.
  - `LiveScoreboard` (`:828-852`) renders `BasketballArenaBoard` after the Play/Listen row, and `CyclonesBasketballScoreboard.tsx` is deleted.
  - The harness: the live poll stays off under `EXPO_PUBLIC_CYCLONES_TEST_URL` (`:1322-1324`), and `withHarnessScoreboard` (`:130-147`) drops the featured game when its board fails to parse. The `live-basketball` fixture therefore embeds a trimmed ESPN summary, and the harness path runs `basketballBoardFromSummary` on it in place of `liveBasketballScoreboardFromHarness` (`espnCyclonesScoreboard.ts:308-349`), so the device scenario exercises the real parser. The scenario is added to `tests/cyclones/server.mjs` and `run-android.mjs`.
  - `tests/cyclones/run-snapshot.mjs` (parser imports at `:22-25`) gains basketball summary, schedule-board and merge cases.

  No update, storage, identity, Worker or pipeline code changes, and no install marker is written (O5 stays superseded by O22). `v1.4.17` holds no Phase 1b commit (Release sources), so this plan's `v1.4.16` statements (the manifest parser, O23; the seeding keys; the Phase 1b and Phase 4 update checks) hold for `v1.4.17` unchanged.
- Exit, in this order:
  1. `espn-capture.yml` is merged (`workflow_dispatch` runs only workflow files on the default branch), or the probe's `live-capture` job is used, and run for one live game per NCAA adapter, with substitutions and fouls in the captured periods and at least one capture at halftime or between quarters. The trimmed captures are committed. Each `Basketball arena board live capture` row records the `active`-versus-replay result per capture and the flags turned on; `activeLineup` and `timeouts` turn on only under their rules (flags table, O27).
  2. `typecheck`, `test:scoreboards` and `test:cyclones:snapshot` green, including the lineup-derivation cases and the replayed captures; foul limits and bonus thresholds checked against the current NCAA rule books; the `live-basketball` scenario passes on a 360 dp-wide emulator (`Basketball arena board 360 dp`).
  3. The Phase 1c PR is merged to `main`, the tag is pushed from the branch that Release sources names, and the release publishes through that tag's own `release.yml` (no `checks` job and no draft before Phase 2b); one Android family phone updates in place with its data kept.
  4. During a live Iowa State basketball game, `Basketball arena board live game` closes on a family phone.
- Owner: approve the rule and doc writes, and watch one live game on a family phone for exit 4. The agent dispatches the capture during a live game and reads the artifact, which holds only public ESPN data.

**Phase 2a: Catalog and probe**
- Scope: `scripts/team-catalog/`, `team-catalog.yml`, the `.gitignore` entry for its raw captures. After the merge the owner dispatches it; `catalog/probe-report.json` is reviewed, and probe captures for `mlb`, `nfl` and the three `ncaa/*` adapters are committed under `tests/leagues/`; for the two NCAA basketball adapters they include an in-progress game with substitutions and fouls. Under O27 (a) the committed Phase 1c captures count; otherwise one is taken with `live_capture` during the season. Out of season Phase 2a does not wait for one: the NCAA basketball flags stay at their last captured state (off when none exists), and a `live_capture` run follows when the season opens. `espn-capture.yml` and `scripts/espn-capture/` (Phase 1c), when present, are deleted.
- Exit: the bot commit lands on `main` after the Decided 19 ruleset is on; the preset and nickname guards pass; `validate.mjs` is green; the report separates network and shape errors; an off-season league (MLB) still passes; the NCAA basketball capability flags agree with the newest live capture, or are off when none exists (under O27 (b) they are first set from a live capture, here or later).
- Owner: set the Decided 19 ruleset before the first catalog run.

**Phase 2b: Backend v2 dormant, CI**
- Scope: the `scripts/stream-pipeline/` package (Phase 1 modules copied in unchanged) with `config.defaults.json`; `stream-pipeline.yml` on `team-get-video` (nothing sends that type until Worker v2 is live); the `workers/team-worker/` source; `ci.yml`; `test:all` in `app/package.json`; `allowImportingTsExtensions` in `app/tsconfig.json`; the `.gitignore` entries; `worker-deploy.yml` with `workflow_dispatch` only; and in `release.yml` the `checks` job with the Worker `/health` preflight, the signing-certificate check and the O20 draft rule, `needs: checks` on `android`, `ios` and `ios-testflight`, and the draft output that skips the `testflight` job. `workflow_dispatch` runs only workflow files on the default branch, which is why the new workflow is merged before the cutover.
- Exit: CI green; dry runs of the new workflow for `mlb-5` (`no_game` out of season), `nfl-17`, `ncaa-66` × three sports and one in-season non-preset team publish nothing and log no host; an unknown key is rejected before any fetch; the `hygiene` job confirms the `extract` job is read-only; the staging Worker deploys with the Durable Object migration, answers `/health?deep=1`, refuses a wrong key, answers `not_in_window` for an old event, and survives a rehearsal of `rollback` followed by a v2 redeploy; the Worker and catalog contract are frozen.
- Owner: add repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `EXPO_PUBLIC_DANNER_WORKER_URL` (`<paste Worker origin>`, today's origin from the Cloudflare dashboard), `EXPO_PUBLIC_DANNER_APP_KEY` (`<paste app key>`, a new random value; its SHA-256 is committed as `release/app-key.sha256`. Reusing today's PIN value also works; a new value retires the PIN shipped inside `v1.x` builds), `RUN_STATUS_KEY` (`<paste random value>`), `RUN_PROGRESS_KEY` (`<paste a second random value>`) and `WORKER_GITHUB_PAT` (`<paste PAT>`, fine-grained; replace a classic token here and record the expiry). The app build reads the two `EXPO_PUBLIC_DANNER_*` secrets only from the cutover PR on; the staging deploy reads the app key, `RUN_STATUS_KEY` and `WORKER_GITHUB_PAT`. Compare the private record of the three old secrets with `config.defaults.json` and the catalog needles, and put any difference into `STREAM_PIPELINE_CONFIG`. Turn on a Cloudflare usage notification at 60% of the Workers Free daily requests. The agent records the `v1.4.16` APK certificate SHA-256 from the public release asset in `release/android-signing-cert.sha256`.

**Phase 3: App engine refactor**
- Scope: `app/playback/`, `app/streams/` (Worker v2 contract), `app/team/`, `app/leagues/`, `app/scoreboards/` (under O27 (a) or (b) the arena board is called from `FeaturedGameCard`, and under (b) Phase 3 also builds it), `app/selection/types.ts` and `presets.ts`. The preset tiles open `TeamScreen` from the still-fixed hub. Adapter, engine, import, harness and playback tests move; Phase 3 rules, adapter docs and tier READMEs are updated.
- Exit: `test:leagues` (nine zones), `test:team-engine` and `test:imports` green with every ported case; `npx expo export` for both platforms resolves the `.ts` specifiers; under O27 (a) or (b), `test:scoreboards` and the board cases of `test:leagues` green; emulator scenarios (today, ready, delayed, live, final) per preset, plus `live-basketball` at 360 dp for `ncaa-66` under (a) or (b), against the fixture server; the Get video driver passes against the Worker v2 mock; `app/{guardians,patriots,cyclones}/` deleted; typecheck clean.

**Phase 4: Dynamic hub, picker, persistence, seeding**
- Scope: grid, tiles, tile actions, picker, catalog snapshot, the rest of `app/selection/`, logos (`expo-file-system`), seeding layers 1-2, splash gating; Phase 4 rules and docs.
- Exit: pure tests green; `run-picker.mjs` green; a local build with `RELEASE_TAG=v2.0.0` (versionCode 20000, never pushed) whose certificate matches `release/android-signing-cert.sha256`, installed with `adb install -r` over an emulator `v1.4.16` with legacy keys, seeds the three presets; over a second `v1.4.16` emulator with no legacy keys it seeds through layer 2; over a third emulator running `v1.5.0` whose only legacy key is `danner.install.v1` it seeds through layer 1 (`danner.seed.v1` signal `legacy-keys`), the iPhone case of Phase 6 step 5; tiles and TV keys survive a further `adb install -r`; CI `ios-build` green.

**Phase 5: TV Location made generic**
- Scope: keys and first use, picker buttons, the `On this phone` panel, `AccountView`, the native functions on both platforms, the host guard, and the map template and tests; Phase 5 rules and docs.
- Exit: `test:tv-location` and `test:offline-map` green, with the Tripoli search distance recorded; `tests/tv-location/run-android.mjs` green (first use blocks, save, relaunch restores, forget); on a physical Android phone with a second Google account: sign in, update the TV location, switch account, sign out (the next verify asks for sign-in); the session survives a swipe-away (closes `Validation.md:95`); a team `web` player opened and closed leaves TV Location signed in (`Validation.md:44`); the `Sign in` URL is chosen; CI `ios-build` green. iPhone rows wait for Phase 6 step 5 (O16).
- Owner: run the physical Android check with the owner's own test account; the agent never sees credentials.

**Phase 6: Cutover**
1. Confirm the Phase 2b secrets and the PAT check, and that the Phase 1b and Phase 3-5 exits are met.
2. Pick a day with an evening game for an in-season preset or catalog team, and start in the morning.
3. Merge the cutover PR: the env rename in `release.yml` and `.github/workflows/ios-testflight.yml` (a called workflow does not inherit the caller's env), the app-key hash check in `checks`, `streams/mlb/5.json`, `streams/nfl/17.json` and `streams/ncaa/66.json` from the template, and the Phase 6 doc and release-text rewrites. Nothing is deleted yet, so the v1 Worker and the old workflows keep serving `v1.x` phones. Until step 7 the `Everyone` build is `v1.5.x`; the keep-alive and any retry run on that tag's own workflow files, so they keep the `EXPO_PUBLIC_GUARDIANS_*` names.
4. Push tag `v2.0.0`. `release.yml` runs `checks`, builds, uploads the iPhone build to TestFlight, and creates a draft release (O20); the `testflight` job is skipped for a draft, so that build stays in `Pilot` only and no `testflight.json` exists yet.
5. The owner installs the draft APK over the installed `v1.x` on one Android family phone, and installs the `v2.0.0` build over `v1.5.x` from the TestFlight app on the owner's iPhone in `Pilot` (O16, `AI_Framework/IPHONE_INSTALL.md`). Checks: presets seeded, saved TV point kept, logos, tile actions, TV sign-in, switch and sign-out, and tiles kept after a restart. Play and Get video wait for step 6.
6. Run `worker-deploy.yml` with `target=production`. Live checks: `/health?deep=1`, `/catalog`, `/streams?team=` for each preset and for a team without a file (empty document), `/get-video` with a wrong key (401) and with an old event (`not_in_window`); `stream-pipeline.yml` dry runs for each preset and sport (out-of-season ones end at `no_game`).
7. Publish the draft as Latest, then dispatch `testflight-distribute.yml` with tag `v2.0.0`, which adds the build to `Everyone` and uploads `testflight.json`. Family phones update: Android in place from the prompt; iPhones through TestFlight, automatically or from the TestFlight notice in the hub. A phone whose update fails installs by hand: the APK from the release page, or TestFlight → Danner Apps → Install.
8. In the evening game's window: a `force` + `dry_run` + `source: 2` run reaches `dry_run`, and a Get video press on a family phone publishes. Then merge the cleanup PR: delete the three old workflows, `scripts/guardians-stream-pipeline/` and its `.gitignore` lines, `workers/guardians-get-video/` and the root `*_streams.json` files; remove the `rollback` input; add the `push` trigger to `worker-deploy.yml` and add `worker-health.yml`.
9. After the first published v2 stream, with `v2.0.0` the latest published release and the `Everyone` build (so the keep-alive never rebuilds a `v1.x` tag again, and no `v1.x` rebuild is possible from here on), the owner deletes `GUARDIANS_STREAM_PIPELINE_CONFIG`, `PATRIOTS_STREAM_PIPELINE_CONFIG`, `CYCLONES_STREAM_PIPELINE_CONFIG`, `EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL`, `EXPO_PUBLIC_GUARDIANS_FAMILY_PIN` and the Worker secret `FAMILY_PIN`, and deletes the staging Worker.
- Rollback before step 7: run `worker-deploy.yml` with `rollback=true` (the old workflows and root files are still on `main`), delete the draft release, expire the `v2.0.0` build in App Store Connect (the `Pilot` iPhone reinstalls the latest `v1.5.x` build from TestFlight's previous builds; outside knowledge), fix, and repeat from step 4 with `v2.0.1`. After step 7: fix forward with `v2.0.x`.
- Exit (cutover complete): the release is published with `checks` green; the step 6 and step 8 checks pass; every family phone is on `v2.0.0` with the presets seeded (the owner confirms each phone in `Docs/Production/Validation.md`); the iPhone rows for seeding, persistence, sign-in and sign-out are closed from step 5; `Android in-app APK update` (`Validation.md:97`) is closed by the family updates, and TestFlight shows `v2.0.0` installed for every family tester (the SideStore handoff row `:98` was retired to the archive in Phase 1b). A later Validation row, `MLB first live Get video`, closes at the first Guardians game of 2027.

**Phase 7: NBA and WNBA (`v2.1.0`).** Scope: probe captures, including an in-progress game per league with substitutions and fouls taken with `live_capture`; adapter rows on the arena board with their capability flags and foul rules (under O27 (c) Phase 7 also builds the board); catalog `pickable`.
- Exit: clean probe report; fixtures committed; the NBA and WNBA board cases green; foul rules checked against the current NBA and WNBA rule books; `test:leagues --league nba` and `--league wnba` green in nine zones; one pipeline dry run per league (`no_game` when out of season); emulator add and open; release published. No Worker deploy is needed, because the Worker reads the catalog from `main`.

**Phase 8: NHL, MLS and NWSL (`v2.2.0`).** Scope: hockey and soccer boards, W-L-OTL and W-D-L records, the 3-way bar.
- Exit: clean probe report (soccer with and without `fixture=true`); fixtures with OT, SO, ET and PK cases; nine-zone adapter tests; a 3-way bar test; one dry run per league; emulator add and open; release published.

**Phase 9: Other major categories and team code (`v2.3.0`)**
- Scope: the O12 categories whose probe passes (new college sport keys or leagues), and the O13 team code: `Share these teams` sends `DANNER-TEAMS-1:` plus base64url JSON of `[[TeamKey, sports?], …]` through React Native `Share`; `Paste a team code` checks every key against the catalog, skips and counts unknown keys, then merges through the selection operations.
- Exit: per category, a clean probe report, fixtures, nine-zone adapter tests, one dry run and an emulator add and open; categories that fail stay hidden and are listed in the Roadmap; a team code shared from one emulator and pasted on a second gives the same tiles; release published. The owner may defer this phase by recording that choice in the Roadmap.

**Phase 10: Cleanup.** Trigger: the owner has confirmed every family phone on `v2.x` in `Validation.md`, or 60 days after `v2.0.0`, whichever comes first. Remove seeding layers 1 and 2, `getInstallTimes()` and the `danner.install.v1` read; stop building the compatibility IPA and drop the manifest's `ios` entry once the owner accepts that any remaining `v1.4.x` phone updates by hand (O23), and with it delete `app/modules/danner-provisioning-profile/`, `app/hub/provisioningWarning.ts`, their hub uses and gate, `tests/provisioning-warning/`, `test:provisioning-warning` and the rule at `AI_RULES.md:48` (O24); retitle or fold the preset Validation rows; remove the stale `iOS compile check` workflow registration (registered in Actions, file absent at HEAD); remove `APP_KEY_PREVIOUS` handling if unused; sync the Roadmap. Ships with the next release.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Google blocks account sign-in inside embedded WebViews, or for some account types | Those people lose YouTube TV sign-in, and with it the TV flow | Phase 5 physical check and the step 5 iPhone check before publication; a clear block-page message; no stored-credential workaround exists. The fallback is a redesign around a system browser session |
| ESPN shapes for unverified leagues differ from the repo's NFL and NCAA parsing | Wrong or empty screens | A league stays non-pickable until its probe passes and fixtures exist; the app ignores unknown keys; a failed list carries its data forward |
| ESPN blocks GitHub Actions or Cloudflare IPs | `schedule_failed` runs; probe failures | Probe failures never demote a shipped league; the Worker event check fails open; the backup listing sources do not cover this single point of failure |
| A family iPhone shows no upgrade signal | Presets missing after the update | Every iPhone that launched `v1.5.x` carries `danner.install.v1`, and the move card has the parent open each team screen once; an iPhone that moves after `v2.0.0` adds the three teams through the picker. Phase 6 step 5 checks the `Pilot` iPhone before publication |
| Identity drift (package, keystore, bundle id, Apple team, App Store Connect record, versionCode, update channel) | Selections, logos, TV keys and the Google session are lost, or the update is never seen or is refused | Phase 0 rule at `AI_RULES.md:62`, extended in Phase 1b; a bundle-id assertion on `app/app.json:15` (replacing `tests/app-update/run.mjs:324`, which leaves with `sidestore-source.json`) plus a package-id assertion; the identity check on the exported IPA; the signing-certificate check in `release.yml`; the Phase 4 upgrade test |
| An APK signed with the public debug key is installed as an update | It can read the app's WebView cookies and Google sessions | Install only from the in-app update or this repository's releases (TV sign-in copy, `release/RELEASE_NOTES.md`) |
| The gap between the Worker v2 deploy and phone updates | `v1.x` phones have no Play or Get video | The release is built and checked before the deploy and published right after it; scores and schedules keep working because they come directly from ESPN and statsapi |
| Durable Objects or the rate-limit binding are not available on the Free plan | Worker v2 deploy fails | The Phase 2b staging deploy proves it; the fallback is a per-isolate gate with the same `[vars]` |
| The app key is extracted from a build | Strangers dispatch runs | The key check before any external call; event-window check; per-game cooldown and cap; IP+team and IP limits; global and in-flight caps; concurrency groups; files created only on `published` |
| The PAT expires or is drained | `/streams` and Get video stop for everyone | Reads mostly cost nothing against the PAT; `worker-health.yml` opens an issue; the expiry date is in the owner's private record |
| A browser exploit on a listing or player page | Code pushed to `main` and shipped in the next release | The `extract` job has a read-only token and no stored credentials; `publish` has no browser and re-validates |
| The primary listing site sits behind a Cloudflare challenge | A 403 or 503 first response | The challenge stage waits for the listing link as today before classifying; source 1 keeps its 90 s navigation |
| Listing sites change or go down | Get video finds nothing | Ordered backups, structured failover, provider table, step summary per source |
| A host leaks into a public log | Listing URL exposed permanently | `::add-mask::` before any output; `redact.mjs`; no traces or screenshots uploaded; the masking test |
| ESPN lineup data is unreliable in live games: no substitution plays (the 2024 men's final), late-inserted plays, arrays that end inside a substitution group, substitutions never logged, an unverified mid-game `active` flag | The arena board names the wrong five players as on the floor, or its label flickers at dead balls | The replay is recomputed from the full arrays on every poll; a pending substitution group shows the set before it; a team's five are labelled as on the floor only when its consistency check passes, or the `active` check with `activeLineup` on, else that team's table shows top scorers. The check rejects inconsistent data but cannot prove the lineup: an unlogged substitution pair or period-start change shows a wrong five until a later play contradicts it. Live captures and fixtures per adapter before each tag that ships the board; the `Basketball arena board live game` row measures the error live |
| Foul rules differ from the adapter rows (rule-book values unverified; NCAA men's basketball may move from halves to quarters) | A wrong bonus pill or foul-trouble mark | Rules in the adapter rows, checked against the current rule books before each tag; the bonus hides when `format.regulation.periods` differs from the row and is never derived from a missing count |
| Bad ESPN data shrinks or corrupts the catalog | The picker loses teams, or tiles get `bad_team` | 90% shrink guard; append-only allowlist with `retired`; preset guards; `validate.mjs` before every catalog commit and in CI |
| GitHub secrets are write-only | The listing URLs cannot be read back | The owner keeps the full secret JSON in a private record |
| AsyncStorage fails at launch | No tiles, or tiles overwritten | Read-only mode for that session; the key is never deleted; migrations write the new key before removing the old |
| The Apple membership lapses, or Apple ends it under Guideline 2.2 or the license agreement | No uploads. iPhones may stop launching at once (reported, unverified*) and stop at the latest when their build reaches 90 days. A termination is tied to the owner's legal name and Apple Account and may bar re-enrollment* | Automatic renewal, a reminder 30 days ahead to check the card on file, and a dedicated Apple Account for the membership (O25); internal-only builds with no App Store or external submission (O21) and a cap on non-family testers; the keep-alive issues. Last resort: the archived SideStore method (`Docs/Archive/IphoneSideStore/README.md` §13), at a cost: every iPhone gets another new empty app (selections, logos, TV point and Google session lost), the PC, iLoader, VPN and free-account setup and the 7-day renewal return on every phone, and the rebuild restores the unsigned IPA job, the warning module and the update handoff from tag `iphone-sidestore-final` |
| The App Store or external TestFlight is chosen later | Rejection near certain (guidelines 5.2.1-5.2.3, 1.1.6, 2.5.2, 2.5.19); a build that passes can later be removed, with account consequences. Even one submission, rejected or not, puts the app's streaming and location features in front of App Review on the account that serves every iPhone | O21 rules both out; the TestFlight Internal Only export and the Phase 1b rule at `AI_RULES.md:61` prevent a submission |
| Non-family people are added as internal testers | Internal testing used as permanent distribution for people outside the owner's team is the most likely trigger for an action under Guideline 2.2 or the license agreement*, which would stop every family iPhone. Each tester sees the owner's legal name, and the owner holds their Apple Account email | A cap the owner sets in the private record (O21); the license agreement's definition of team members and internal testers is unverified |
| A TestFlight build expires | The app stops launching on every iPhone | `ios-keepalive.yml` measures only the newest non-expired `Everyone` build, rebuilds at 70 days, promotes after 2 days in `Pilot`, and opens an issue at 85 days and on any failure |
| GitHub disables scheduled workflows in a public repository after 60 days without repository activity* | The keep-alive and its issues stop without notice, then every iPhone stops launching; `team-catalog.yml` and `worker-health.yml` stop too | The keep-alive's heartbeat commit when `main` has had no commit for 25 days; the owner's 80-day calendar reminder for the `Everyone` build |
| The keep-alive build differs from the release build | A rebuild with a different toolchain or env reaches every iPhone | The keep-alive dispatches the tag's own `ios-testflight.yml` (its env names and pinned image); the build reaches `Pilot` for 2 days before `Everyone`, and the `testflight-hold` label stops it |
| Apple raises the minimum SDK for uploads (about every April*), updates the license agreement, or GitHub retires the pinned macOS image | Uploads and keep-alive rebuilds of older tags fail; every iPhone stops launching 90 days after the last good upload | Yearly upkeep rows: an Expo and Xcode upgrade shipped before the deadline, the Account Holder accepting the agreement; the keep-alive issue on any failed upload |
| Apple blocks uploads during an Android fix | The Android hotfix waits on Apple | `android_only` publishes a patch tag without the iPhone build (CI signing) |
| An iPhone does not update at the cutover (Automatic Updates off, notification missed) | Play and Get video stop on that iPhone at the Worker v2 deploy | The TestFlight notice in the hub from `v1.5.0` (O24); the move card turns on Automatic Updates |
| The distribution certificate or profile expires | Uploads and the keep-alive fail; installed builds keep working | `ios-keepalive.yml` opens an issue 30 days ahead; cloud-managed signing removes both (O25) |
| The tester cap is reached | No further iPhone can be added | 100 internal testers per team, counted in the private record; beyond it, the options under Adding a new iPhone |
| Signing secrets or signing details leak | With the `.p8` plus the `.p12`, or an Admin key alone, someone can upload a build and add it to `Everyone`; TestFlight installs it on every iPhone, in the same container that holds each person's Google session. A signed build log can also expose the owner's legal name, the team id and the certificate | Secrets only in the `apple-release` environment, limited to `main`, `release/*` and `v*` tags; passed by name to the steps that use them; the `.p12` deleted right after import and the `.p8` written only for the upload; build output kept in a file with only filtered `error:` lines printed, checked in the Phase 1b dry run; the signed IPA is never an artifact or release asset; an App Manager key unless the owner accepts cloud-managed signing (O25); revoke the key or certificate in the Apple portal and replace the secret |
| A family member cannot be an internal tester (a child or managed Apple Account, or a phone whose App Store account differs from the invited one) | That iPhone cannot install | Checked on the pilot in Phase 1b; the owner then chooses among no iPhone build, an adult tester's install on that phone, or Ad Hoc as a separate project (Adding a new iPhone) |
| The manifest's `ios` entry breaks | `v1.4.16` Android phones never see `v1.5.0` or `v2.0.0` | O23; the writer test asserts an entry the `v1.4.16` parser accepts |

## Where the owner pastes backup listing URLs

1. On GitHub, open the `Danner_App` repository, then Settings → Secrets and variables → Actions → Repository secrets.
2. Create `STREAM_PIPELINE_CONFIG` before the Phase 1 merge, or choose Update on it later.
3. Paste the JSON below. Listing URL 1 is the current listing site, and the backups follow in the order they should be tried. Take URL 1 from the private record, because the old secrets cannot be read back. Up to 5 sources are allowed. Labels use lowercase letters, digits and `-` only. Do not add `timing` unless the private record of the old secrets differs from `config.defaults.json`.
4. Save. Keep the full JSON in the same private record for later edits. Adding, removing or reordering a backup only needs a secret update: no code change and no app release.
5. To check a backup while a game is on: before the cutover, open Actions → `<Team> stream pipeline` → Run workflow; after the cutover, open Actions → `Stream pipeline` → Run workflow and enter `team` (for example `nfl-17`). Check `dry_run` and `force`, and set `source` to `2`. The step summary names sources only by number and label.

```json
{
  "schemaVersion": 2,
  "sources": [
    { "label": "primary",  "baseUrl": "<paste listing URL 1>" },
    { "label": "backup-1", "baseUrl": "<paste listing URL 2>" },
    { "label": "backup-2", "baseUrl": "<paste listing URL 3>" }
  ]
}
```

Optional per-source fields: `"timeoutSeconds": 120` (30-300; backups default to 120, source 1 has no cap unless set) and `"matching"` when a site spells a team's link differently, for example `"matching": { "teams": { "nfl-17": { "hrefNeedles": ["<slug used by this site>"] } } }`. Do not paste the URLs anywhere else, including issues, docs or chat.
