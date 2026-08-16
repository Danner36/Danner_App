# Danner App

Cross-platform, parent-friendly reconstruction of the original `Youtube Fix` Android app from `reference/app-debug.apk`.

`Danner Apps` opens to a logo-only menu with an active YouTube TV tile and a disabled Cleveland Guardians placeholder. The shared Android and iPhone `TV Location` flow guides a parent through four large steps, defaults to Tripoli, Iowa, and includes a bundled U.S. map with offline city search, state outlines, and major highways. The chosen town is saved without exposing latitude or longitude in the interface. The saved point is supplied to YouTube's browser geolocation interface only inside the verification page; device GPS is not changed and no separate mock-location app is required.

## Repository

- `app/` contains the shared Expo and React Native source.
- `reference/` contains the original APK and recovered facts.
- `Docs/` contains product, behavior, art, technical, production, and validation sources of truth.
- `AI_Framework/` contains repository instructions and orientation.

## Status

The redesigned Android app builds as a standalone APK and passes emulator checks for the Danner menu, nationwide offline map, city search, destination persistence, guided navigation, Google sign-in, WebView geolocation use, and YouTube's Cedar Rapids/Waterloo/Dubuque area result. Android and iOS production bundles both compile with the bundled map. Physical iPhone signing, target-device checks, the TV's KWWL result, and distribution remain. Current evidence is recorded in [Docs/Production/Validation.md](Docs/Production/Validation.md).

Start with [AI_Framework/AI_RULES.md](AI_Framework/AI_RULES.md), then [AI_Framework/AI_ONBOARDING.md](AI_Framework/AI_ONBOARDING.md).
