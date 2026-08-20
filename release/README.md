# Release Set

Each Danner Apps GitHub release contains:

- `Danner-Apps-Android.apk`
- `Danner-Apps-iOS.ipa`
- `IPHONE_SETUP.md`
- `SHA256SUMS.txt`

`IPHONE_SETUP.md` supplies the official SideStore, iLoader, and LocalDevVPN links. Third-party installers are not copied into Danner release assets.

Pushing a `v*` tag runs `.github/workflows/release.yml`. The workflow builds both Danner artifacts, verifies that each exists, generates checksums, and creates the GitHub release only after both builds pass.
