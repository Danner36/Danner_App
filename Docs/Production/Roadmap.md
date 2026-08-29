Status: ACTIVE
Phase: MVP

# Roadmap

| Capability or delivery item | Status | Current result |
|-----------------------------|--------|----------------|
| Cross-platform application | Complete | One Expo SDK 57 and React Native 0.86 project serves Android and iPhone |
| Danner app hub | Complete | Logo-only hub places active Guardians left and frequently used YouTube TV rightmost |
| Guardians dashboard | Complete | MLB-backed record, today/live/Final-recap featured card, one-second countdown, explicit interruption states, live score, five-second park-style scoreboard while live, remaining schedule, phone-local times, one-minute refresh, pull-to-refresh, and retry are implemented |
| Guardians authorized playback | Complete | Root GitHub JSON holds dated production `web` entries plus an inactive copyable example. Entries match dates and game numbers, refresh every minute with a last-valid cache, enable icon-only Play 15 minutes before game time, validate HTTPS or explicit HTTP, and feed native or isolated playback. Play still requires a featured-game match |
| Guardians Get video | Complete | Phone POSTs the family PIN to the Cloudflare Worker, which starts `guardians-stream-pipeline.yml`. The phone polls Worker `/streams`, then raw GitHub, until Play appears. Live `/streams` needs that Worker version deployed |
| Guardians Listen and TV send | Complete | `direct` sources offer Listen and header Cast of the JSON URL. `web` sources offer header TV capture into a local HLS origin. YouTube stays phone-only |
| Guardians timing and playback harness | Complete | Repo-only fixtures exercise today, video-ready, delayed, live, Final recap, Get video, and live-HLS capture plus scores, Watch timing, HTTPS and local-HTTP native playback, isolated YouTube playback, popup and redirect gates, and return behavior without packaging test media or data |
| Parent-guided workflow | Complete | Four large cards provide current-step emphasis, progress, completion, retry, automatic scrolling, and automatic verification return |
| Editable destination | Complete | Tripoli default, bundled U.S. map, offline search, nearest-place labels, reset control, and persistent custom points |
| Nationwide offline map | Complete | 2025 Census place, state, and interstate data covers the 50 states, DC, and Puerto Rico in a 1.58 MiB generated dataset |
| Cross-platform coordinate delivery | Complete | The selected destination is installed into the verification WebView's browser Geolocation API without changing device GPS |
| YouTube verification | Complete | In-app WebView, sign-in redirects, shared cookies, playback-area `Next` automation, automatic return to step 4, and a manual return control |
| Android and iOS build configuration | Complete | Platform identifiers, cleartext-media capabilities, and EAS internal-distribution development, preview, and production profiles are configured |
| Android standalone build | Complete | Release APK with embedded JavaScript builds and opens with Metro stopped |
| Android interaction validation | Complete | App hub, offline map and search, place persistence, all four steps, browser injection, Google sign-in, and Back navigation pass |
| Cross-platform production bundles | Complete | Android and iOS bundles compile and include the generated offline map asset |
| iPhone expiration warning | Implementation complete | An iOS-only local module reads the embedded profile's real expiration; the hub shows a Wi-Fi-and-charge instruction above the logo during the final 48 hours and remains unchanged on Android |
| Portable iPhone setup and recovery | Complete | Release-side setup card covers LocalDevVPN, iLoader, Apple website iTunes, USB `Import IPA`, SideStore `+`, charger `Refresh SideStore` automation, another-iPhone repeat, and official links. Agent procedure is `AI_Framework/IPHONE_INSTALL.md`. Third-party binaries are not copied into release assets |
| Signed-in YouTube location use | Complete | YouTube requested the Tripoli point and accepted the Cedar Rapids/Waterloo/Dubuque area |
| Parent-device and TV validation | Pending | Complete the QR-code, automatic `Next` and return, TV welcome-message, `Live` reload, expiration warning, and eight-day unattended SideStore renewal flow on target Android, iPhone, and TV |
| Direct device distribution | Complete | GitHub release `v1.3.2` contains the installable Android APK, SideStore iPhone IPA, iPhone setup guide, and SHA-256 checksum file; later `v*` tags use the same gated two-platform release workflow |

Current evidence is maintained in [Validation.md](Validation.md).
