Status: ACTIVE
Phase: MVP

# Roadmap

| Capability or delivery item | Status | Current result |
|-----------------------------|--------|----------------|
| Cross-platform application | Complete | One Expo SDK 57 and React Native 0.86 project serves Android and iPhone |
| Danner app hub | Implementation complete | The logo-only hub shows the selected teams, TV Location, and `+`, with a grid that grows and scales, long-press tile actions, and the 30-tile cap. Phones updating from `v1.x` are seeded with the three presets; a first install shows TV Location and `+`. Emulator checks pass; physical-device checks remain (`Validation.md`) |
| Team picker | Implementation complete | League or college sport, team or school with search, sports for a school, one tile per school, and a bundled catalog snapshot. MLB, NFL, NCAA football, men's basketball, and women's basketball are on; other leagues stay hidden until their probes and fixtures pass |
| Team logos | Implementation complete | Every team logo is an ESPN URL from the catalog, cached on the phone, shown contained on white with 12% padding, with the abbreviation as the fallback |
| One team screen | Implementation complete | `app/team/` serves every tile: record, featured cards for today, live boards, Final recap through local midnight, remaining schedule, phone-local times, and refresh. Emulator screens compared to ESPN pass; family-phone checks remain |
| League adapters | Implementation complete | One ESPN implementation and one statsapi adapter, with records, official dates, and postseason status per league |
| Basketball arena board | In progress | Phase 1c of `ModularTeams.md`. A live college basketball card draws the arena board after Play and Listen, parsed from the five-second ESPN summary. The men's row has players, rebounds, team fouls, bonus and last foul on; the women's row shows the center panel until a women's live capture; timeouts and the possession arrow stay off. The women's live capture and a live-game check on a family phone remain |
| Authorized playback and Get video | Complete | Each team reads `streams/<league>/<espnId>.json`. A Get video press POSTs to the Cloudflare Worker with the app key, the Worker starts `stream-pipeline.yml` for that game, and the phone polls Worker `/streams` until Play appears. A production Get video publish passed on 2026-11-08 |
| Listen and TV send | Implementation complete | `direct` sources offer Listen and header Cast of the JSON URL. `web` sources offer a header TV control that Casts a page-reported HLS, DASH, or MP4 URL relayed from the phone. YouTube stays phone-only. TV send is not tested on v2 |
| Team timing and playback harness | Complete | Repo-only fixtures exercise today, ready, delayed, live, Final, live-basketball, two-games, and Get video by team key, without packaging test media or data |
| Parent-guided workflow | Complete | Four large cards provide current-step emphasis, progress, completion, retry, automatic scrolling, and automatic verification return |
| Editable destination | Implementation complete | No built-in location: first use requires a map choice. A chosen default and a current point are stored on the phone, with bundled U.S. map, offline search, nearest-place labels, `Use my default`, `Make this my default`, `Forget location`, and points saved under `v1.x` carried forward. Physical device confirmation remains |
| Own-account YouTube TV sign-in | Implementation complete | `On this phone` panel with status, `Sign in`, `Switch account`, and `Sign out` on Android and iPhone; Google's own pages, no credential fields and no injection on Google hosts. The physical Android check with a second Google account and an iPhone check remain |
| Nationwide offline map | Complete | 2025 Census place, state, and interstate data covers the 50 states, DC, and Puerto Rico in a 1.58 MiB generated dataset |
| Cross-platform coordinate delivery | Complete | The selected destination is installed into the verification WebView's browser Geolocation API without changing device GPS |
| YouTube verification | Complete | In-app WebView, sign-in redirects, shared cookies, playback-area `Next` automation, automatic return to step 4, and a manual return control |
| Android and iOS build configuration | Complete | Platform identifiers, cleartext-media capabilities, and EAS internal-distribution development, preview, and production profiles are configured |
| Android standalone build | Complete | Release APK with embedded JavaScript builds and opens with Metro stopped |
| Android interaction validation | Complete | App hub, offline map and search, place persistence, all four steps, browser injection, Google sign-in, and Back navigation pass |
| Cross-platform production bundles | Complete | Android and iOS bundles compile and include the generated offline map asset |
| iPhone expiration warning | Implementation complete | An iOS-only local module reads the embedded profile's real expiration; the hub shows a Wi-Fi-and-charge instruction above the logo during the final 48 hours and remains unchanged on Android |
| Portable iPhone setup and recovery | Complete | Release-side setup card covers LocalDevVPN, iLoader, Apple website iTunes, USB `Import IPA`, SideStore `+`, charger `Refresh SideStore` automation, another-iPhone repeat, and official links. Agent procedure is `AI_Framework/IPHONE_INSTALL.md`. Third-party binaries are not copied into release assets |
| Signed-in YouTube location use | Complete | YouTube requested the selected point and accepted the Cedar Rapids/Waterloo/Dubuque area |
| Win chance bar | Implementation complete | Featured cards, and the first schedule row when no game is featured, show ESPN's pre-game prediction and live win probability as `Us` and `Them` percentages over a bar. Phone and live-game validation remain |
| Android sign-in cookie flush | Implementation complete | TV Location's YouTube and Google pages write the Android WebView cookie store to disk on a timer, on background, and on close. Phone validation remains |
| Parent-device and TV validation | Pending | Complete the QR-code, automatic `Next` and return, TV welcome-message, `Live` reload, expiration warning, and eight-day unattended SideStore renewal flow on target Android, iPhone, and TV |
| Direct device distribution | Complete | GitHub release `v2.0.3` contains the installable Android APK, SideStore iPhone IPA, iPhone setup guide, SHA-256 checksum file, `version-manifest.json`, and `sidestore-source.json`. Later `v*` tags use the same gated two-platform release workflow; a new major version is a draft that the owner publishes, and minor and patch versions publish directly |
| In-app GitHub update check | Implementation complete | Release builds bake the tag into the binary. The hub compares `version-manifest.json` and asks Yes or No. Android uses PackageInstaller. iPhone opens `sidestore://install`. Device confirmation remains |
| Modular teams cutover (Phase 6) | In progress | `v2.0.3` is published and the production Worker, stream pipeline, and team streams files are live. The `worker-deploy.yml` push trigger and `worker-health.yml` are not built, and the owner still deletes the old secrets |
| Paid Apple Developer distribution (Phase 1b) | Planned | Not built. iPhones stay on SideStore |
| NBA and WNBA (Phase 7) | Planned | Hidden in the picker until their probes and fixtures pass |
| NHL, MLS, and NWSL (Phase 8) | Planned | Hidden in the picker until their probes and fixtures pass |
| Other major categories and team code (Phase 9) | Planned | Categories whose probes fail stay hidden |
| Cleanup (Phase 10) | Planned | Removes the seeding layers and the other `v1.x` compatibility paths after every family phone is on `v2.x` |

Current evidence is maintained in [Validation.md](Validation.md).
