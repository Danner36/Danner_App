Status: ACTIVE
Phase: MVP

# Roadmap

| Milestone | Status | Result |
|-----------|--------|--------|
| Recover APK facts | Complete | Manifest, resources, code, assets, and live screen captured |
| Lock cross-platform stack | Complete | Expo SDK 57 and React Native 0.86 |
| Scaffold shared app | Complete | Managed Expo project under `app/` |
| Recover original UI and interactions | Complete | Reference visuals and behavior reproduced and validated before the approved redesign |
| Add Danner app hub | Complete | Logo-only hub anchors Danner branding at one-third screen height and a spaced module row at two-thirds, with inactive Guardians left and frequently used YouTube TV rightmost |
| Redesign for parents | Complete | Large four-card flow, highlighted current action, progress, completion, retry, automatic step scrolling, and automatic verification return |
| Add editable destination | Complete | Tripoli default, bundled U.S. map, offline search, nearest-place labels, reset control, and persistent custom points |
| Bundle nationwide map | Complete | 2025 Census place, state, and interstate data covers the 50 states, DC, and Puerto Rico in a 1.58 MiB generated dataset |
| Add cross-platform coordinate delivery | Complete | Selected destination is installed into the verification WebView's browser Geolocation API without changing device GPS |
| Add YouTube verification | Complete | In-app WebView, sign-in redirects, shared cookies, playback-area `Next` automation, automatic return to step 4, and a manual return control |
| Configure builds | Complete | Android and iOS identifiers plus EAS profiles |
| Validate Android build | Complete | Standalone release APK with embedded JavaScript built and opened with Metro stopped |
| Validate Android interactions | Complete | App hub, offline map and search, place persistence, all four steps, bridge readiness, Google sign-in, and Back navigation pass |
| Validate cross-platform bundles | Complete | Android and iOS production bundles include the generated offline map asset |
| Validate signed-in YouTube location use | Complete | Google sign-in completed; YouTube requested the injected Tripoli pair and accepted the Cedar Rapids/Waterloo/Dubuque area |
| Validate revised flow on parent devices and TV | Pending | Complete QR-code, automatic `Next` and step return, TV welcome-message, and `Live` reload flow on target Android, iPhone, and TV |
| Distribute builds | Pending | Production-signed Android APK and iOS TestFlight or device install |

Current evidence is maintained in [Validation.md](Validation.md).
