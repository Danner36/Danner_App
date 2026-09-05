# hub

Logo-only Danner Apps menu, the iPhone signing-expiration warning, and the GitHub-release update prompt.

## Behavior

- Centers the 210dp Danner mark one-third down the usable screen and a two-row 2×2 grid of 101.2dp tiles on the two-thirds line. Row 1 is Guardians then Patriots. Row 2 is Cyclones under Guardians and YouTube TV under Patriots.
- On SideStore-signed iPhones, reads the real provisioning-profile expiration through `modules/danner-provisioning-profile/` and shows a two-line warning above the Danner mark only during the final 48 hours. The warning directs the parent to connect to Wi-Fi and charge the phone.
- Reads the profile at launch and whenever the app becomes active. A one-minute timer only advances the displayed remaining time.
- When a baked release version is present and GitHub's latest `version-manifest.json` is newer, the hub asks Yes or No. The prompt is not shown while the hub is off-screen or while the signing-health text is visible. Android Yes installs the APK through `modules/danner-app-update/`. iPhone Yes opens SideStore with the IPA URL.
