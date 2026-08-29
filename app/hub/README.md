# hub

Logo-only Danner Apps menu and the iPhone signing-expiration warning.

## Behavior

- Centers the 210dp Danner mark one-third down the usable screen and a row of 101.2dp tiles two-thirds down. Guardians is active on the left; the frequently used YouTube TV tile is rightmost.
- On SideStore-signed iPhones, reads the real provisioning-profile expiration through `modules/danner-provisioning-profile/` and shows a two-line warning above the Danner mark only during the final 48 hours. The warning directs the parent to connect to Wi-Fi and charge the phone.
- Reads the profile at launch and whenever the app becomes active. A one-minute timer only advances the displayed remaining time.
