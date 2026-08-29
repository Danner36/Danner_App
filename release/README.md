# Release Set

Each Danner Apps GitHub release contains:

- `Danner-Apps-Android.apk`
- `Danner-Apps-iOS.ipa`
- `IPHONE_SETUP.md`
- `SHA256SUMS.txt`
- Release notes from `release/RELEASE_NOTES.md`

`IPHONE_SETUP.md` is the family numbered card: LocalDevVPN, iLoader, Apple website iTunes, USB and SideStore install, charger `Refresh SideStore` automation, another iPhone, and recovery links. Third-party installers are not copied into Danner release assets. Windows iLoader requires that Apple website iTunes install so the iPhone appears as a USB device. The agent procedure is [../AI_Framework/IPHONE_INSTALL.md](../AI_Framework/IPHONE_INSTALL.md).

Pushing a `v*` tag runs `.github/workflows/release.yml`. The workflow builds both Danner artifacts, verifies that each exists, generates checksums, and creates the GitHub release only after both builds pass. A manual run accepts an existing tag so a failed infrastructure build can be retried without moving the tag.
