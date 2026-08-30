# Physical iPhone install

Windows-PC procedure for SideStore and Danner Apps on a physical iPhone. The family numbered card shipped in each GitHub release is [release/IPHONE_SETUP.md](../release/IPHONE_SETUP.md). Read this file before any iPhone install, refresh, or recovery work.

There is no Mac in this project. There is no iOS ADB. Wireless debugging is not available from Windows. The GitHub IPA is unsigned. SideStore or iLoader applies the dedicated free Apple Account signature on the device.

Do not print Apple Account emails, passwords, 2FA codes, pairing files, or device UDIDs. Do not copy iLoader, iTunes, or IPA binaries into the repository. Do not use Microsoft Store iTunes as the first USB-driver install.

## Last proven session

Date: 2026-08-28.

Completed:

- LocalDevVPN installed from the App Store on the iPhone.
- Official iLoader `v2.3.1` installed at `C:\Program Files\iloader\iloader.exe`.
- Official 64-bit iTunes from `https://www.apple.com/itunes/download/win64` (iTunes `12.13.10.3`, Apple Mobile Device Support `19.4.0.10`). `Apple Mobile Device Service` running.
- USB data cable, iPhone unlocked, Trust accepted.
- iLoader signed in with the dedicated Apple Account (saved login in iLoader). After an iLoader restart the session is logged out until `Sign in` on that saved login.
- Device listed as `Danners USB`, iOS `26.6`. Pairing required an unlocked phone and Trust.
- `Install SideStore (Stable)` completed in iLoader.
- Settings: developer app allowed, Developer Mode on, iPhone restarted.
- `Danner-Apps-iOS.ipa` from GitHub release `v1.3.0` installed over USB with iLoader `Import IPA`. Staging path reported as `PublicStaging/DannerApps.app`.
- LocalDevVPN `Connect` on Wi-Fi (VPN Allow + passcode on the iPhone).
- SideStore signed in with the dedicated Apple Account. `Refresh All` showed SideStore at `7 DAYS`.
- iLoader `Import IPA` left Danner Apps on the phone but **not** in SideStore `My Apps`. SideStore `+` of `Danner-Apps-iOS.ipa` registered it. Both apps then showed `7 DAYS`.
- Danner Apps hub opened with the Danner logo, Guardians tile left, TV Location tile right. Guardians loaded live MLB data. TV Location opened from the right tile.
- Shortcuts shortcut `Refresh SideStore`: Start LocalDevVPN → Wait 20 seconds → Refresh All Apps → Wait 60 seconds → Stop LocalDevVPN. Personal automation: When this iPhone is connected to power, Run Immediately, notify off, run `Refresh SideStore`.
- 2026-08-28 12:26: charger plug ran that shortcut. On-screen result was all apps refreshed. LocalDevVPN showed a new `Connected at 12:26 PM` then Disconnected. SideStore My Apps still showed Danner Apps and SideStore at `7 DAYS`.

The eight-day unattended locked-phone renewal path remains unproven. iPhone Cast of the local live playlist remains unproven.

## What the agent can and cannot do

The agent can: download the official iLoader and iTunes installers, install them on the Windows PC, launch iLoader, click iLoader controls through UI Automation, download `Danner-Apps-iOS.ipa` from GitHub, drive iLoader `Import IPA` including the child `Open` file dialog, push that IPA into the iPhone `Downloads` folder over USB (AFC), launch installed apps, and screenshot.

The agent cannot: tap Trust, enter the iPhone passcode, toggle Developer Mode, tap LocalDevVPN `Connect` / VPN Allow, operate SideStore’s on-phone `+` file picker, or activate Shortcuts controls (accessibility focus does not tap). Those stay on the iPhone. Lead the PC path without handing the owner a long list of PC clicks the agent can perform.

## First-time order

1. iPhone on Wi-Fi. App Store: [LocalDevVPN](https://apps.apple.com/us/app/localdevvpn/id6755608044) → `Get`. Leave it installed.
2. Windows: install current [iLoader](https://github.com/nab138/iloader/releases/latest) MSI (`iloader-windows-x64.msi`). Proven file: `C:\Program Files\iloader\iloader.exe`.
3. Windows: install iTunes from `https://www.apple.com/itunes/download/win64` (not the Microsoft Store). Quiet `msiexec` without elevation exited `1603`. Elevated GUI install succeeded. Confirm service `Apple Mobile Device Service` is `Running` and Device Manager shows `Apple Mobile Device USB Device` in addition to the generic WPD `Apple iPhone`.
4. USB cable into this PC. Unlock the iPhone. Tap `Trust` (passcode if asked).
5. Open iLoader. Sign in with the dedicated Apple Account. Select the iPhone (`Danners USB` on this household device). `Install SideStore (Stable)`. Keep the cable in and the screen unlocked.
6. iPhone Settings → General → VPN & Device Management → Developer App → dedicated Apple Account → `Allow & Restart` → passcode.
7. After restart: Settings → Privacy & Security → Developer Mode → on → restart when iOS asks → confirm Developer Mode.
8. Install Danner Apps by the USB iLoader path, then register it in SideStore with `+` (required for `7 DAYS` even after USB install).
9. iPhone: LocalDevVPN `Connect` → Allow VPN → passcode. SideStore: same Apple Account → My Apps → refresh / `7 DAYS`.
10. Open Danner Apps. Confirm the Danner logo and both hub tiles.
11. Build the `Refresh SideStore` shortcut and charger automation on that iPhone (Shortcuts do not copy from another phone).
12. Prove one charger plug: Wi-Fi on, unplug, plug in, `Always Allow` if asked. Confirm the all-apps-refreshed result and LocalDevVPN connected-then-disconnected.

### Danner Apps install paths

USB iLoader path (proven 2026-08-28, agent-led):

1. Download `Danner-Apps-iOS.ipa` from the current [GitHub release](https://github.com/Danner36/Danner_App/releases/latest) to `%USERPROFILE%\Downloads\Danner-Apps-iOS.ipa`.
2. iLoader logged in, device selected (`Active: Danners` plus `Danners USB Selected`).
3. Dismiss any leftover operation overlay (`Dismiss`).
4. `Import IPA`. The file picker is a **child** window of iLoader named `Open`, class `#32770`, not a top-level window.
5. Set the full IPA path on dialog item `1148` (`WM_SETTEXT`). Click dialog item `1` (`BM_CLICK` Open).
6. Wait for `Installing App` then `Operation completed`. Dismiss.

That USB install does **not** list Danner Apps under SideStore `My Apps`. SideStore only tracks apps it installed through `+`.

On-phone SideStore path (required for the 7-day refresh, including after USB install):

1. LocalDevVPN connected on Wi-Fi.
2. SideStore signed in with the same dedicated Apple Account.
3. Place `Danner-Apps-iOS.ipa` in iPhone `Downloads` (GitHub download on the phone, or USB AFC push of the PC copy).
4. SideStore `My Apps` → `+` → that file in `Downloads` (or On My iPhone → SideStore).

Free Apple IDs allow three sideloaded apps. SideStore plus Danner Apps uses two.

## Another iPhone

Each iPhone is a full first-time install on that device. iLoader and Apple website iTunes stay on this PC. Shortcuts, pairing, LocalDevVPN, SideStore, and the charger automation live on the phone and do not copy.

1. Give that iPhone its own dedicated free Apple Account. Do not reuse another phone’s account.
2. Repeat [First-time order](#first-time-order) from LocalDevVPN App Store `Get` through the charger proof. Skip reinstalling iLoader and iTunes if they are already on this PC.
3. In iLoader, select the new device name (it will not be `Danners USB`). Pair with unlock and Trust.
4. After `Import IPA`, SideStore `My Apps` is empty of Danner Apps until SideStore `+` on that phone.
5. Build `Refresh SideStore` and the charger automation on that iPhone using [Charger automation](#charger-automation).

## Charger automation

Proven 2026-08-28 on one unlocked iPhone on Wi-Fi. Build this after SideStore lists both apps at `7 DAYS`.

### Shortcut `Refresh SideStore` (Shortcuts → Library → `+`)

1. Search `LocalDevVPN` → `Start VPN`.
2. Search `Wait` → `Wait` → `20` seconds.
3. Search `Refresh All Apps` → `Refresh All Apps`.
4. Search `Wait` → `Wait` → `60` seconds (resign must finish before the VPN drops).
5. Search `LocalDevVPN` → `Stop VPN`.
6. Rename the shortcut to `Refresh SideStore`. Back.

### Personal automation (Shortcuts → Automation)

1. `New Automation` → `Charger`.
2. `Is Connected`.
3. `Run Immediately` (not `Run After Confirmation`). `Notify When Run` off.
4. `Next`. Run shortcut `Refresh SideStore` (not only `Start VPN`).
5. Confirm the Automation list shows charger → `Refresh SideStore`.

### Proof of one run

1. iPhone on Wi-Fi. Unplug, wait two seconds, plug in.
2. Tap `Always Allow` if iOS asks.
3. The first run can look idle until the all-apps-refreshed result. The shortcut takes about 80 seconds.
4. LocalDevVPN shows a new `Connected at` time, then `Disconnected`.
5. SideStore `My Apps`: Danner Apps and SideStore still `7 DAYS`.

A locked-phone week of silent renewal remains unproven. Manual refresh below remains the fallback.

## Recurring refresh (every 7 days)

Wi-Fi required. Cellular alone is not a supported SideStore refresh path.

Preferred: leave the charger automation in place. Plug in on Wi-Fi at least once per week.

Manual fallback:

1. iPhone: LocalDevVPN `Connect`.
2. SideStore → My Apps → `Refresh All`.
3. SideStore and Danner Apps show `7 DAYS`.

If SideStore or Danner Apps is missing or expired, repeat from iLoader on the PC (`Install SideStore (Stable)` and/or `Import IPA`), then SideStore `+` if Danner Apps is missing from `My Apps`.

## New Danner Apps version

Preferred after Danner Apps is already in SideStore `My Apps` and the installed build includes the launch checker:

1. Publish a GitHub release with a new `Danner-Apps-iOS.ipa`.
2. On the iPhone, Wi-Fi, LocalDevVPN `Connect`.
3. Open Danner Apps. If `Update available` appears, tap `Yes`.
4. Finish the SideStore install. That path uses `sidestore://install?url=` and does not need Safari → Downloads → `+`.

Fallback (also required for phones still on a build without the checker, including `v1.3.3`):

1. Put the new IPA in `Downloads` (phone download or USB AFC push).
2. SideStore `My Apps` → `+` → the new IPA.

Optional: add the SideStore source `https://github.com/Danner36/Danner_App/releases/latest/download/sidestore-source.json` so SideStore's own Updates tab can also see new IPAs.

Charger resign still uses `Refresh All Apps` on whatever build SideStore has registered. `Refresh All` does not fetch GitHub updates.

## iLoader UI Automation

Process window title `iloader`. WebView2 exposes named buttons.

| Control name | Action |
|--------------|--------|
| `Sign in` | Restore a saved Apple Account after iLoader restart (`login_stored`). May prompt 2FA on the iPhone; enter the code in iLoader, never in chat. |
| `Refresh Devices` or `Refresh` | Reload USB list. Keyboard: `Ctrl+R`. |
| Device button, e.g. `Danners USB` | Select and pair. Pairing modal: unlock and Trust. Success: `Danners USB Selected` and `Active: Danners (…)` |
| `SideStore (Stable)` | Download, sign, install SideStore, place pairing file. |
| `Import IPA` | Native Open dialog, then sign and install the selected IPA. |
| `Dismiss` | Close a finished operation overlay. Overlay blocks later clicks if left open. |
| `Continue` | Maximum-certificates dialog only. |

`SideStore (Stable)` while logged out toasts `You must be logged in!` even when Saved Logins still lists an account. Click `Sign in` on the saved login first.

## USB detection

Windows can show WPD `Apple iPhone` after Trust and still leave iLoader at `No devices found`. iLoader talks through usbmuxd, which on Windows is Apple Mobile Device Support from **Apple website iTunes**.

After iTunes:

- Service: `Apple Mobile Device Service` = `Running`
- PnP: `Apple Mobile Device USB Composite Device` and `Apple Mobile Device USB Device`

If the list is empty: unlock the phone, replug USB, `Refresh Devices`, confirm the service. Do not start with Microsoft Store iTunes.

## Recovery

| Symptom | Action |
|---------|--------|
| iLoader device list empty | Apple website iTunes + running Mobile Device service + unlocked Trust + `Refresh Devices` |
| iLoader session logged out | `Sign in` on the saved login |
| Pairing modal stuck | Unlock, Trust, passcode |
| SideStore missing | iLoader `Install SideStore (Stable)` |
| Danner Apps missing from the Home Screen | iLoader `Import IPA` with the current release IPA, or SideStore `+` on the phone |
| Danner Apps on the phone but missing from SideStore `My Apps` | SideStore `+` of `Danner-Apps-iOS.ipa`. USB iLoader install does not register it |
| Apps expire after 7 days | Charger on Wi-Fi, or LocalDevVPN Connect + SideStore Refresh All |
| Charger plug does nothing | Confirm `Run Immediately`, automation runs `Refresh SideStore` not only Start VPN, Wi-Fi on, unplug then plug |

## Links

- Danner releases: https://github.com/Danner36/Danner_App/releases
- Latest IPA: https://github.com/Danner36/Danner_App/releases/latest (asset `Danner-Apps-iOS.ipa`)
- iLoader: https://github.com/nab138/iloader/releases/latest
- iTunes 64-bit: https://www.apple.com/itunes/download/win64
- LocalDevVPN: https://apps.apple.com/us/app/localdevvpn/id6755608044
- SideStore install docs: https://docs.sidestore.io/docs/installation/install
