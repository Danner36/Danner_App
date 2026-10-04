# Release Set

Each Danner Apps GitHub release contains:

- `Danner-Apps-Android.apk`
- `Danner-Apps-iOS.ipa`
- `IPHONE_SETUP.md`
- `SHA256SUMS.txt`
- `version-manifest.json`
- `sidestore-source.json`
- Release notes from `release/RELEASE_NOTES.md`

`IPHONE_SETUP.md` is the family numbered card: LocalDevVPN, iLoader, Apple website iTunes, USB and SideStore install, charger `Refresh SideStore` automation, another iPhone, and recovery links. Third-party installers are not copied into Danner release assets. Windows iLoader requires that Apple website iTunes install so the iPhone appears as a USB device. The agent procedure is [../AI_Framework/IPHONE_INSTALL.md](../AI_Framework/IPHONE_INSTALL.md).

Pushing a `v*` tag runs `.github/workflows/release.yml`. The workflow bakes that tag into the app version, builds both Danner artifacts, writes the update manifest and SideStore source, generates checksums, and creates the GitHub release only after both builds pass. Each build job first checks that the tag is `vMAJOR.MINOR.PATCH` with digits only and minor and patch from 0 to 99, and every job checks out the tag itself, never a branch. A manual run accepts an existing tag so a failed infrastructure build can be retried without moving the tag; it builds that tag's code. A release is marked Latest only when its tag is the highest `v*` tag. The build jobs run with read-only repository access; only the publishing job can write. `release/build-update-assets.mjs` writes `version-manifest.json` and `sidestore-source.json`.
