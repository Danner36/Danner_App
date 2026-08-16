# AI Onboarding

## Project

`Danner_App` is a cross-platform Expo app for managing YouTube TV playback-area updates. Its logo-only app hub opens `TV Location` from a YouTube TV artwork tile and reserves a disabled Cleveland Guardians tile for a later module. Android and iPhone share the same parent-friendly four-step flow. Destination selection uses a bundled nationwide map and offline city search without changing device GPS.

## Phase

The logo-tile hub, guided flow, automatic return from YouTube `Next`, offline U.S. map, named-place storage, Android standalone build, signed-in YouTube location acceptance, Android emulator interactions, and Android/iOS production bundle compilation are implemented. Physical Apple signing, live target-device and TV validation of automatic return, and distribution remain. [Docs/Production/Validation.md](../Docs/Production/Validation.md) is the current status source of truth.

## Context hierarchy

| File | Role |
|------|------|
| `AI_Framework/AI_RULES.md` | Agent behavior and product invariants |
| `AI_Framework/AI_ONBOARDING.md` | Repository-wide orientation |
| `README.md` | Per-directory overview at useful folder tiers |

Each tier `README.md` covers its folder and immediate subfolders only. Cross-cutting sources of truth are listed in [Docs/README.md](../Docs/README.md).

## Read order

1. [AI_RULES.md](AI_RULES.md)
2. `AI_ONBOARDING.md`
3. Tier `README.md` files from the repository root through the working directory
4. Relevant source-of-truth documents from `Docs/README.md`

## Tier README criteria

Create or update a tier README when a directory boundary, responsibility, dependency rule, or non-obvious invariant changes. Routine implementation, bug fixes, generated output, and line-level history do not require README changes.
