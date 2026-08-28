# iPhone Setup

## ON IPHONE

1. Connect to Wi-Fi.
2. Open [LocalDevVPN in the App Store](https://apps.apple.com/us/app/localdevvpn/id6755608044).
3. Tap `Get`.
4. Leave LocalDevVPN installed.

## ON PC

Skip 1 through 5 if iLoader and Apple website iTunes are already installed on this PC.

1. Download the current [official iLoader release](https://github.com/nab138/iloader/releases/latest) Windows MSI.
2. Install iLoader.
3. Download [iTunes for Windows (64-bit)](https://www.apple.com/itunes/download/win64) from Apple, not the Microsoft Store.
4. Install iTunes.
5. Confirm Windows shows Apple Mobile Device Support after the install.
6. Connect the iPhone to the PC with a USB data cable.
7. Unlock the iPhone.
8. Tap `Trust` on the iPhone.
9. Open iLoader.
10. Sign in with the dedicated Apple Account.
11. Select the connected iPhone.
12. Select `Install SideStore (Stable)`.
13. Wait for SideStore to appear on the iPhone.

If iLoader shows no device after Trust, iTunes from Apple is missing or Apple Mobile Device Service is not running. Microsoft Store iTunes does not satisfy this step.

## ON IPHONE

1. Open `Settings`.
2. Open `General`.
3. Open `VPN & Device Management`.
4. Select the dedicated Apple Account under `Developer App`.
5. Tap `Allow & Restart`.
6. Enter the iPhone passcode.
7. Open `Settings` after the restart.
8. Open `Privacy & Security`.
9. Open `Developer Mode`.
10. Turn on `Developer Mode`.
11. Restart the iPhone when requested.
12. Confirm `Developer Mode` after the restart.

## INSIDE LOCALDEVVPN

1. Open LocalDevVPN.
2. Tap `Connect`.
3. Tap `Allow` if iOS requests permission to add the VPN configuration.
4. Enter the iPhone passcode if requested.
5. Confirm LocalDevVPN shows connected.

## INSTALL DANNER APPS

USB puts Danner Apps on the iPhone. SideStore `+` of the same IPA is still required for the 7-day refresh. LocalDevVPN must be connected on Wi-Fi for that refresh.

### ON PC (USB)

1. Download `Danner-Apps-iOS.ipa` from the current [Danner Apps release](https://github.com/Danner36/Danner_App/releases/latest).
2. In iLoader, confirm the Apple Account is signed in and the iPhone is selected.
3. Select `Import IPA`.
4. Choose `Danner-Apps-iOS.ipa`.
5. Wait for Danner Apps to appear on the iPhone.
6. SideStore still will not list Danner Apps until the ON IPHONE path below. USB install alone does not register it for `7 DAYS` refresh.

### ON IPHONE (SIDESTORE)

1. Open SideStore.
2. Sign in with the same dedicated Apple Account used in iLoader.
3. Open `My Apps`.
4. Tap the `7 DAYS` button beside SideStore.
5. Tap `Yes` or `Refresh Now` if SideStore requests a signing certificate.
6. Open the current [Danner Apps release](https://github.com/Danner36/Danner_App/releases/latest) on the iPhone.
7. Download `Danner-Apps-iOS.ipa`.
8. Return to SideStore.
9. Tap `+`.
10. Select `Danner-Apps-iOS.ipa` from `Downloads`.
11. Wait for Danner Apps to appear on the iPhone.

## INSIDE DANNER APPS

1. Open Danner Apps.
2. Confirm the Danner logo and both app buttons appear.

## ANOTHER IPHONE

Each iPhone is a full first-time setup on that device. iLoader and iTunes stay on the PC. Shortcuts and SideStore do not copy.

1. Use a dedicated Apple Account for that iPhone. Do not reuse another phone’s account.
2. Repeat every section from `ON IPHONE` (LocalDevVPN) through `CHARGER REFRESH` on the new phone.
3. In iLoader, select the new iPhone. Unlock and Trust.
4. After USB `Import IPA`, SideStore still needs `+` on that phone.

## CHARGER REFRESH

Build this after SideStore `My Apps` shows SideStore and Danner Apps at `7 DAYS`.

### INSIDE SHORTCUTS LIBRARY

1. Tap `+`.
2. Search `LocalDevVPN`. Tap `Start VPN`.
3. Search `Wait`. Tap `Wait`. Set `20` seconds.
4. Search `Refresh All Apps`. Tap `Refresh All Apps`.
5. Search `Wait`. Tap `Wait`. Set `60` seconds.
6. Search `LocalDevVPN`. Tap `Stop VPN`.
7. Rename the shortcut to `Refresh SideStore`.
8. Tap Back.

### INSIDE SHORTCUTS AUTOMATION

1. Tap `New Automation`.
2. Tap `Charger`.
3. Leave `Is Connected` selected.
4. Tap `Run Immediately`. Do not leave `Run After Confirmation` selected.
5. Leave `Notify When Run` off.
6. Tap `Next`.
7. Choose shortcut `Refresh SideStore`. Do not stop at `Start VPN` only.
8. Confirm the list shows charger then `Refresh SideStore`.

### PROVE ONE RUN

1. Stay on Wi-Fi.
2. Unplug the charger.
3. Wait two seconds.
4. Plug the charger in.
5. Tap `Always Allow` if iOS asks.
6. Wait up to about 80 seconds. The first run can look idle until all apps refreshed.
7. Open LocalDevVPN. Confirm a new `Connected at` time, then `Disconnected`.
8. Open SideStore `My Apps`. Confirm both apps show `7 DAYS`.

## MANUAL REFRESH

### ON IPHONE

1. Connect to Wi-Fi.

### INSIDE LOCALDEVVPN

1. Tap `Connect`.

### INSIDE SIDESTORE

1. Open `My Apps`.
2. Tap `Refresh All`.
3. Confirm SideStore and Danner Apps show `7 DAYS`.

## SIDESTORE EXPIRED OR MISSING

1. Repeat every step starting at `ON PC`.

## LINKS

- [Danner Apps releases](https://github.com/Danner36/Danner_App/releases)
- [LocalDevVPN](https://apps.apple.com/us/app/localdevvpn/id6755608044)
- [SideStore instructions](https://docs.sidestore.io/docs/installation/install)
- [SideStore release](https://github.com/SideStore/SideStore/releases/latest)
- [iLoader release](https://github.com/nab138/iloader/releases/latest)
- [iTunes for Windows (64-bit)](https://www.apple.com/itunes/download/win64)
