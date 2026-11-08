# iPhone harness

Windows-PC tooling to inspect, watch, and diagnose the family iPhone's SideStore signing chain and the Danner Apps install over USB. No Mac, no admin rights, no taps on the phone. Read [AI_Framework/IPHONE_INSTALL.md](../../AI_Framework/IPHONE_INSTALL.md) first; this folder is the diagnostic side of that procedure.

Findings from the first investigation are in [FINDINGS-2026-10-09.md](FINDINGS-2026-10-09.md).

## What it answers

| Question | Command |
|----------|---------|
| Is the PC able to talk to the phone? | `preflight` |
| Which builds are installed, is the phone charging, when did SideStore last run? | `status` |
| When was the last successful refresh and when does the profile expire? | `console-pull` then `console-summary` |
| What happens on the phone when the charger is plugged in? | `watch --seconds 180`, then plug in |
| Is the app's signature valid right now? | `launch danner` / `launch sidestore` |
| What does the screen show? | `screenshot` |
| Is SideStore running in the background? | `proclist` |
| Did anything crash or get memory-killed? | `crash [--pull]` |
| What did Shortcuts, LocalDevVPN, and SideStore log in a past time window? | `archive --since HH:MM` |

Run from this folder: `python iphone_harness.py <command>`. Output lands in `out/` (git-ignored; pulled SideStore logs contain the Apple Account e-mail). All terminal output is scrubbed of e-mail addresses and the device UDID.

## Setup on a new PC

1. Apple website iTunes (64-bit) so `Apple Mobile Device Service` provides usbmuxd. Microsoft Store iTunes does not.
2. Python 3.13, then from this folder:
   ```
   python -m pip install -r requirements.txt
   python -m pip install --no-deps ipsw-parser pyimg4
   ```
   `pyimg4` wants `lzfse` and `pylzss`, which need a C compiler. `shim/` provides import stand-ins; the harness puts `shim/` on `PYTHONPATH` for every pymobiledevice3 call.
3. Optional, for `archive`: Mandiant's unified-log parser. Download `unifiedlog_iterator-<ver>-x86_64-pc-windows-msvc.zip` and its `.sha256` from https://github.com/mandiant/macos-UnifiedLogs/releases, verify the hash, and put `unifiedlog_iterator.exe` at `%LOCALAPPDATA%\DannerHarness\` (or set `UNIFIEDLOG_ITERATOR`). Do not commit the binary.
4. Phone on a data cable, unlocked, Trust accepted. Developer Mode on (required by `screenshot`, `launch`, `proclist`, `home`).

## How each command works

- **Lockdown services (no tunnel):** `usbmux list`, `lockdown info`, `apps list`, `provision list`, `crash`, `syslog live`, `syslog collect`, and house_arrest file access. These work on iOS 26.6 without the developer tunnel.
- **Developer services (DVT over the iOS 17+ tunnel):** `screenshot`, `launch`, `proclist`, `home`. pymobiledevice3 11.2 opens the tunnel in-process with `--userspace`, which needs no admin rights. The personalized developer image was already mounted on this phone (iLoader does that); `mounter list` confirms it.
- **House_arrest:** SideStore and Danner Apps are signed with `get-task-allow`, so `VendContainer` exposes their whole data container. `console-pull` copies `Documents/ConsoleLogs/console_<utc>.log`, one file per SideStore process launch, including the 5-10 second background launches that the charger Shortcut and iOS background fetch cause.
- **console-summary** parses SideStore's `Operation Summary` blocks (`OPERATION SUCCESS` / `OPERATION FAILED`, app id, error) and the `Provisioning profile fetched ... Expiration:` lines. The last fetched expiration is the real expiry of the installed app, because on this phone the device-level profile list (`provision list`) is empty and `apps list` keeps `ProfileValidated: True` after expiry.
- **launch** uses DVT process control. iOS refuses to launch an app whose free-developer profile has expired; the phone then shows `"<App>" Is No Longer Available` with an OK button that only a finger can dismiss. This is the one command that changes what the phone shows, so use it deliberately.
- **watch** streams `syslog live`, keeps lines from `SideStore`, `DannerApps`, `LocalDevVPN`, `TunnelProv`, `shortcutsd`, `siriactionsd`, `WorkflowKit`, `nesessionmanager`, `neagent`, `misagent`, `installd`, `amfid`, `online-auth-agent`, `appstored`, `remotepairingd`, plus any line that names the apps, the team suffix, the Shortcut, or `No Longer Available`. Note that `syslog live` redacts many fields as `<private>`; the persisted unified log (`archive`) has the full text.
- **archive** runs `syslog collect`, which on this phone returns the last ~16 hours of the Persist store plus the longer-lived Special store, then parses only the Persist files modified after `--since` (the full store parses to tens of GB of JSON) and writes a chain-only `timeline.txt`.

## Things that do not work here, so nobody spends time on them again

- `pymobiledevice3 provision list` returns `[]` on iOS 26.6 even with two free-signed apps installed. Expiry must come from SideStore's logs (or from the app's own 48-hour warning).
- `developer core-device ...` (CoreDevice file service, list-apps, lockstate, launch-application) fails with "Failed to start service" over the userspace tunnel on this PC. `developer dvt ...` works. The SideStore Core Data database lives in the app-group container, which house_arrest cannot reach and CoreDevice would have; use the console logs instead.
- `lockdown start-tunnel` and `remote tunneld` demand admin rights. Per-command `--userspace` does not.
- The accessibility inspector can move focus and press elements only in `get-task-allow` apps, not in SpringBoard, so system dialogs cannot be dismissed from the PC.
- `pip install UnifiedLog` (the Python unified-log parser) fails to build on this PC; the Mandiant Rust binary works.
- `ShortcutsTopHitsExtension`-style noise: `watch --all` captures ~2000 lines per second on this phone. Keep the filter.

## Plugging into this PC counts as a charger event

iOS fires the `Charger` automation on USB power from the PC. `status` shows `charging=True external=True` while the cable is in. To observe a full automation run: start `watch --seconds 240`, unplug the cable, wait two seconds, plug it back in, and keep watching. The tunnel-based commands (`screenshot`, `launch`) are unavailable while the cable is out.

## Pairing and secrets

Nothing here reads or prints the Apple Account password, 2FA codes, the pairing file contents, or the UDID. Pulled console logs do contain the account e-mail and the signing-certificate serial; they stay in `out/`.
