#!/usr/bin/env python
"""Danner Apps iPhone harness: talk to the family iPhone over USB from this Windows PC.

Wraps pymobiledevice3 (11.2+) so an agent can check, watch, and diagnose the SideStore
signing chain (SideStore + LocalDevVPN + the charger Shortcut) and the Danner Apps install
without a Mac, without admin rights, and without touching the phone's screen.

    python iphone_harness.py preflight
    python iphone_harness.py status
    python iphone_harness.py console-pull
    python iphone_harness.py console-summary
    python iphone_harness.py watch --seconds 180
    python iphone_harness.py screenshot
    python iphone_harness.py launch sidestore
    python iphone_harness.py home
    python iphone_harness.py proclist
    python iphone_harness.py crash [--pull]
    python iphone_harness.py archive --since 11:00

Everything printed is scrubbed of e-mail addresses and device UDIDs (repository rule).
Read README.md in this folder before using it.
"""
from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import glob
import inspect
import json
import os
import posixpath
import re
import shutil
import subprocess
import sys
import time
import warnings

warnings.filterwarnings("ignore")

HERE = os.path.dirname(os.path.abspath(__file__))
SHIM = os.path.join(HERE, "shim")
OUT = os.path.join(HERE, "out")

TEAM_SUFFIX = "TZ577QFL69"  # SideStore appends the free team id to every bundle id it signs
BUNDLES = {
    "sidestore": f"com.SideStore.SideStore.{TEAM_SUFFIX}",
    "danner": f"com.danner.locationhelper.{TEAM_SUFFIX}",
    "vpn": "com.jkcoxson.LocalDevVPN",
}
UNIFIEDLOG = os.environ.get(
    "UNIFIEDLOG_ITERATOR",
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "DannerHarness", "unifiedlog_iterator.exe"),
)

# Processes that make up the refresh chain (every line they log is kept) ...
CHAIN_PROCS = re.compile(
    r"^(SideStore|DannerApps|LocalDevVPN|TunnelProv|shortcutsd|siriactionsd|WorkflowKit|"
    r"nesessionmanager|neagent|misagent|installd|amfid|online-auth-agent|appstored|remotepairingd)$"
)
# ... and identifiers that make a line from any other process relevant (SpringBoard, runningboardd, dasd, ...).
CHAIN_IDENT = re.compile(
    r"SideStore|Danner Apps|DannerApps|com\.danner|locationhelper|LocalDevVPN|TunnelProv|" + TEAM_SUFFIX + r"|Refresh SideStore|"
    r"WFCharger|No Longer Available|provisioning profile|mobileprovision|rppairing|_remotepairing|10\.7\.0\.",
    re.I,
)
SYSLOG_PROC_RE = re.compile(r"^\S+ \S+ ([^{\[\s]+)[{\[]")
NOISE_RE = re.compile(r"CoreMotion|Accelerometer|LINK QUALITY|corewifi\]|\[iface\]|\[net\]", re.I)


def chain_line(line: str) -> bool:
    """True when a `syslog live` line belongs to the refresh chain."""
    if NOISE_RE.search(line):
        return False
    m = SYSLOG_PROC_RE.match(line)
    proc = m.group(1) if m else ""
    return bool(CHAIN_PROCS.match(proc) or CHAIN_IDENT.search(line))

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
UDID_RE = re.compile(r"\b[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}\b")


# ----------------------------------------------------------------------------- helpers
def scrub(text: str) -> str:
    """Remove Apple Account e-mails and device UDIDs before anything reaches a terminal or file."""
    return UDID_RE.sub("<udid>", EMAIL_RE.sub("<apple-account>", text))


def say(text: str = "") -> None:
    print(scrub(str(text)))


def pmd_env() -> dict:
    env = dict(os.environ)
    env["PYTHONPATH"] = SHIM + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    env["PYTHONIOENCODING"] = "utf-8"
    env["MSYS_NO_PATHCONV"] = "1"
    return env


def pmd(args: list[str], timeout: int = 120, check: bool = False) -> subprocess.CompletedProcess:
    """Run a pymobiledevice3 CLI command and return the completed process (stdout/stderr as text)."""
    cmd = [sys.executable, "-m", "pymobiledevice3", *args]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                          timeout=timeout, env=pmd_env())
    if check and proc.returncode != 0:
        raise RuntimeError(f"pymobiledevice3 {' '.join(args)} failed:\n{proc.stdout}\n{proc.stderr}")
    return proc


def clean(text: str) -> str:
    """Drop the urllib3/requests version warning lines pymobiledevice3 prints on this PC."""
    return "\n".join(l for l in text.splitlines() if "RequestsDependencyWarning" not in l and "warnings.warn" not in l)


def pmd_json(args: list[str], timeout: int = 120):
    proc = pmd(args, timeout=timeout)
    text = clean(proc.stdout)
    start = min([i for i in (text.find("{"), text.find("[")) if i >= 0] or [0])
    try:
        return json.loads(text[start:])
    except json.JSONDecodeError:
        raise RuntimeError(f"no JSON from pymobiledevice3 {' '.join(args)}:\n{text[:800]}\n{clean(proc.stderr)[-800:]}")


def ensure_out(*parts: str) -> str:
    path = os.path.join(OUT, *parts)
    os.makedirs(path, exist_ok=True)
    return path


def stamp() -> str:
    return dt.datetime.now().strftime("%Y%m%d_%H%M%S")


async def _maybe(x):
    return await x if inspect.isawaitable(x) else x


async def _house_arrest(bundle_id: str, documents_only: bool = False):
    from pymobiledevice3 import lockdown as ld
    from pymobiledevice3.services.house_arrest import HouseArrestService

    lockdown = await _maybe(ld.create_using_usbmux())
    return await HouseArrestService.create(lockdown, bundle_id, documents_only=documents_only)


async def _listdir_tree(svc, root: str, skip: set[str], limit: int = 3000) -> list[dict]:
    rows, stack = [], [root]
    while stack and len(rows) < limit:
        d = stack.pop()
        try:
            names = await _maybe(svc.listdir(d))
        except Exception as e:  # noqa: BLE001
            rows.append({"path": d, "error": type(e).__name__}); continue
        for name in sorted(names):
            if name in (".", ".."):
                continue
            p = posixpath.join(d, name)
            if p in skip:
                continue
            try:
                st = await _maybe(svc.stat(p))
            except Exception as e:  # noqa: BLE001
                rows.append({"path": p, "error": type(e).__name__}); continue
            if "DIR" in str(st.get("st_ifmt", "")).upper():
                stack.append(p)
            else:
                mt = st.get("st_mtime")
                rows.append({"path": p, "size": st.get("st_size"), "mtime": mt.isoformat() if hasattr(mt, "isoformat") else str(mt)})
    return rows


async def _pull_tree(svc, remote: str, local: str, skip_same_size: bool = True) -> list[str]:
    pulled = []
    st = await _maybe(svc.stat(remote))
    if "DIR" in str(st.get("st_ifmt", "")).upper():
        os.makedirs(local, exist_ok=True)
        for name in await _maybe(svc.listdir(remote)):
            if name in (".", ".."):
                continue
            pulled += await _pull_tree(svc, posixpath.join(remote, name), os.path.join(local, name), skip_same_size)
        return pulled
    if skip_same_size and os.path.exists(local) and os.path.getsize(local) == st.get("st_size"):
        return pulled
    data = await _maybe(svc.get_file_contents(remote))
    os.makedirs(os.path.dirname(local) or ".", exist_ok=True)
    with open(local, "wb") as fh:
        fh.write(data)
    pulled.append(local)
    return pulled


# ----------------------------------------------------------------------------- commands
def cmd_preflight(_: argparse.Namespace) -> int:
    ok = True
    svc = subprocess.run(["powershell", "-NoProfile", "-Command",
                          "(Get-Service 'Apple Mobile Device Service' -ErrorAction SilentlyContinue).Status"],
                         capture_output=True, text=True).stdout.strip()
    say(f"Apple Mobile Device Service: {svc or 'MISSING (install Apple website iTunes)'}")
    ok &= svc == "Running"
    ver = pmd(["version"], timeout=60)
    say(f"pymobiledevice3: {clean(ver.stdout).strip() or clean(ver.stderr).strip()[-200:]}")
    imp = subprocess.run([sys.executable, "-c", "import pymobiledevice3.cli.developer, pymobiledevice3.cli.mounter; print('ok')"],
                         capture_output=True, text=True, env=pmd_env())
    dev_ok = "ok" in imp.stdout
    say(f"developer/mounter command groups import: {'ok' if dev_ok else 'FAILED -> ' + imp.stderr.strip().splitlines()[-1] if imp.stderr.strip() else 'FAILED'}")
    ok &= dev_ok
    say(f"unifiedlog_iterator: {'present' if os.path.exists(UNIFIEDLOG) else 'missing (archive command limited)'} -> {UNIFIEDLOG}")
    try:
        devices = pmd_json(["usbmux", "list"], timeout=60)
    except RuntimeError as e:
        say(f"usbmux list failed: {e}"); return 1
    if not devices:
        say("No USB device. Phone unlocked? Trusted? Cable is data-capable?"); return 1
    for d in devices:
        say(f"device: {d.get('DeviceName')}  {d.get('ProductType')}  iOS {d.get('ProductVersion')}  via {d.get('ConnectionType')}")
    say("preflight: " + ("OK" if ok else "PROBLEMS ABOVE"))
    return 0 if ok else 1


def _apps_of_interest() -> dict:
    apps = pmd_json(["apps", "list"], timeout=120)
    return {k: apps.get(b) for k, b in BUNDLES.items()}


def cmd_status(_: argparse.Namespace) -> int:
    info = pmd_json(["lockdown", "info"], timeout=60)
    dev_time = info.get("TimeIntervalSince1970")
    skew = (time.time() - dev_time) if dev_time else None
    say(f"Device: {info.get('DeviceName')} {info.get('ProductType')} iOS {info.get('ProductVersion')} ({info.get('BuildVersion')})")
    say(f"Time zone {info.get('TimeZone')}; clock skew vs PC {skew:+.1f}s" if skew is not None else "Clock: unknown")
    say(f"Passcode set: {info.get('PasswordProtected')}; trusted host attached: {info.get('TrustedHostAttached')}")
    dm = clean(pmd(["amfi", "developer-mode-status"], timeout=60).stdout).strip().splitlines()
    say(f"Developer Mode: {dm[-1] if dm else 'unknown'}")
    try:
        bat = pmd_json(["diagnostics", "battery", "single"], timeout=60)
        say(f"Battery: {bat.get('CurrentCapacity', bat.get('BatteryCurrentCapacity'))}%  charging={bat.get('IsCharging')}  external={bat.get('ExternalConnected')}")
    except Exception as e:  # noqa: BLE001
        say(f"Battery: unavailable ({type(e).__name__})")
    say()
    apps = _apps_of_interest()
    for key, app in apps.items():
        if not app:
            say(f"{key:9} MISSING ({BUNDLES[key]})"); continue
        signer = app.get("SignerIdentity", "")
        cert_id = re.search(r"\(([A-Z0-9]{10})\)", signer)
        say(f"{key:9} {app.get('CFBundleDisplayName')} {app.get('CFBundleShortVersionString')} ({app.get('CFBundleVersion')})  "
            f"signer={'App Store' if 'Application Signing' in signer else 'free dev cert ' + (cert_id.group(1) if cert_id else '?')}  "
            f"ProfileValidated={app.get('ProfileValidated')}")
    say("note: ProfileValidated is a static install flag; it stays True after the 7-day profile expires. Use 'launch' or 'console-summary'.")
    try:
        profiles = pmd_json(["provision", "list"], timeout=60)
        say(f"Device-level provisioning profiles visible to misagent: {len(profiles)} (0 is normal on iOS 26; SideStore profiles are per-app).")
    except Exception as e:  # noqa: BLE001
        say(f"provision list: {type(e).__name__}")
    say()
    rows = asyncio.run(_list_console_logs())
    if rows is None:
        say("SideStore console logs: container not reachable (SideStore missing?)")
    else:
        rows = [r for r in rows if r.get("path", "").endswith(".log")]
        if rows:
            newest = max(rows, key=lambda r: r["mtime"])
            age_days = (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(newest["mtime"]).replace(tzinfo=dt.timezone.utc)).total_seconds() / 86400
            say(f"SideStore console logs: {len(rows)} sessions; newest ended {newest['mtime']}Z ({age_days:.1f} days ago)")
            if age_days > 1.5:
                say("  !! SideStore has not run for more than a day. The charger Shortcut and background refresh are not running it.")
        else:
            say("SideStore console logs: none")
    local = os.path.join(OUT, "sidestore_console")
    if os.path.isdir(local) and glob.glob(os.path.join(local, "console_*.log")):
        say("Pulled console logs are present; run console-summary for refresh history.")
    else:
        say("Run console-pull then console-summary for the refresh history.")
    return 0


CONSOLE_LOGS = "/Documents/ConsoleLogs"  # SideStore writes one console_<utc>.log per process launch


async def _list_console_logs():
    try:
        svc = await _house_arrest(BUNDLES["sidestore"])  # whole container: SideStore is get-task-allow signed
    except Exception:  # noqa: BLE001
        return None
    try:
        return await _listdir_tree(svc, CONSOLE_LOGS, skip=set())
    finally:
        await _maybe(svc.close())


def cmd_console_pull(args: argparse.Namespace) -> int:
    local = ensure_out("sidestore_console")

    async def go():
        svc = await _house_arrest(BUNDLES["sidestore"])
        try:
            return await _pull_tree(svc, CONSOLE_LOGS, local)
        finally:
            await _maybe(svc.close())

    pulled = asyncio.run(go())
    say(f"pulled {len(pulled)} new/changed files into {local}")
    say("These files contain the Apple Account e-mail. They live under out/, which git ignores. Do not copy them elsewhere.")
    return 0


SUMMARY_RE = re.compile(
    r"(\d{4}-\d\d-\d\dT[\d:.]+) \[D\]: Operation Summary:\n=+\n\|\s+OPERATION (\w+)\s+\|\n=+\n\| • Operation: (\S+).*?\n\| • App ID: (\S+)(.*?)\n=+",
    re.S,
)
PROFILE_RE = re.compile(r"(\d{4}-\d\d-\d\dT[\d:.]+) .*Provisioning profile fetched for (\S+) \(.*Expiration: ([\d\- :+]+)\)")


def cmd_console_summary(args: argparse.Namespace) -> int:
    local = os.path.join(OUT, "sidestore_console")
    files = sorted(glob.glob(os.path.join(local, "console_*.log")))
    if not files:
        say("no pulled logs; run console-pull first"); return 1
    ops, profiles, errors = [], [], {}
    say(f"{'session (UTC)':24} {'ended':24} {'ok':>3} {'fail':>4}  last error")
    for f in files:
        txt = open(f, encoding="utf-8", errors="replace").read()
        ts = re.findall(r"^(\d{4}-\d\d-\d\dT[\d:.]+)", txt, re.M)
        sess_ops = [(m.group(1), m.group(2), m.group(4), re.sub(r"\s*\|\s*", " ", m.group(5)).strip()) for m in SUMMARY_RE.finditer(txt)]
        ops += sess_ops
        profiles += [(m.group(1), m.group(2), m.group(3).strip()) for m in PROFILE_RE.finditer(txt)]
        fails = [o for o in sess_ops if o[1] == "FAILED"]
        last_err = ""
        if fails:
            m = re.search(r"Error: (.*)", fails[-1][3])
            last_err = (m.group(1) if m else fails[-1][3])[:70]
            errors[last_err] = errors.get(last_err, 0) + 1
        say(f"{(ts[0] if ts else '?')[:23]:24} {(ts[-1] if ts else '?')[:23]:24} {len(sess_ops) - len(fails):3d} {len(fails):4d}  {last_err}")
    succ = [o for o in ops if o[1] != "FAILED"]
    say()
    say(f"refresh operations: {len(ops)}  succeeded: {len(succ)}  failed: {len(ops) - len(succ)}")
    if succ:
        say(f"LAST SUCCESSFUL refresh: {succ[-1][0]}Z  app={succ[-1][2]}")
    if profiles:
        last = profiles[-1]
        say(f"LAST profile installed: {last[0]}Z for {last[1]} -> EXPIRES {last[2]}")
        exp = dt.datetime.strptime(last[2][:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=dt.timezone.utc)
        left = exp - dt.datetime.now(dt.timezone.utc)
        say(f"  => {'EXPIRED ' + str(-left).split('.')[0] + ' ago' if left.total_seconds() < 0 else str(left).split('.')[0] + ' remaining'} (assuming no refresh happened outside these logs)")
    if errors:
        say("\nfailure reasons (sessions):")
        for k, v in sorted(errors.items(), key=lambda kv: -kv[1]):
            say(f"  {v:3d}x {k}")
    say("\nsession boundaries = SideStore process launches. Background refresh runs (Shortcut or iOS background fetch) show as 5-10 second sessions.")
    return 0


def cmd_watch(args: argparse.Namespace) -> int:
    out = os.path.join(ensure_out("watch"), f"watch_{stamp()}.txt")
    say(f"watching the refresh chain for {args.seconds}s -> {out}")
    say("Now plug the charger in (or run the Shortcut). Ctrl+C stops early.")
    cmd = [sys.executable, "-m", "pymobiledevice3", "syslog", "live"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace", env=pmd_env())
    deadline = time.time() + args.seconds
    n = 0
    try:
        with open(out, "w", encoding="utf-8") as fh:
            while time.time() < deadline:
                line = proc.stdout.readline()
                if not line:
                    break
                if args.all or chain_line(line):
                    line = scrub(line.rstrip("\n"))
                    fh.write(line + "\n"); n += 1
                    if not args.quiet:
                        print(line[:args.width])
    except KeyboardInterrupt:
        pass
    finally:
        proc.kill()
    say(f"captured {n} chain lines -> {out}")
    return 0


def _dvt(args: list[str], timeout: int = 150) -> subprocess.CompletedProcess:
    return pmd(["developer", "dvt", *args, "--userspace"], timeout=timeout)


def cmd_screenshot(args: argparse.Namespace) -> int:
    path = args.path or os.path.join(ensure_out("shots"), f"shot_{stamp()}.png")
    proc = _dvt(["screenshot", path])
    if os.path.exists(path):
        say(f"screenshot -> {path}"); return 0
    say(clean(proc.stderr)[-600:]); return 1


def cmd_launch(args: argparse.Namespace) -> int:
    bundle = BUNDLES.get(args.app, args.app)
    proc = _dvt(["launch", bundle])
    text = clean(proc.stdout + proc.stderr)
    if proc.returncode == 0 and "failed" not in text.lower():
        say(f"launch OK: {bundle} -> {text.strip()[-200:]}"); return 0
    m = re.search(r"NSLocalizedFailureReason': '([^']*)", text.replace("\n", ""))
    say(f"launch FAILED: {bundle}")
    say(f"  reason: {m.group(1) if m else text.strip()[-300:]}")
    say("  An expired free-developer profile makes iOS refuse the launch and show '<App> Is No Longer Available' on the phone.")
    say("  Someone must tap OK on that dialog; it cannot be dismissed from the PC.")
    return 1


def cmd_home(_: argparse.Namespace) -> int:
    proc = pmd(["developer", "core-device", "hid", "button", "home", "--userspace"], timeout=150)
    say("home button sent" if proc.returncode == 0 else clean(proc.stderr)[-400:])
    return proc.returncode


def cmd_proclist(_: argparse.Namespace) -> int:
    procs = pmd_json(["developer", "dvt", "proclist", "--userspace"], timeout=150)
    hits = [p for p in procs if CHAIN_PROCS.match(p.get("name", ""))]
    for p in sorted(hits, key=lambda p: p.get("name", "")):
        say(f"{p.get('name'):22} pid={p.get('pid'):<7} started={p.get('startDate')}")
    say(f"{len(hits)} chain processes running (of {len(procs)}). SideStore/DannerApps absent = not running.")
    return 0


def cmd_crash(args: argparse.Namespace) -> int:
    names = []
    for folder in ("/", "/Retired"):
        proc = pmd(["crash", "ls", "--remote-file", folder], timeout=120)
        names += [l.strip() for l in clean(proc.stdout).splitlines() if l.strip().startswith("/")]
    hits = [n for n in names if re.search(r"SideStore|DannerApps|LocalDevVPN|TunnelProv|JetsamEvent|Shortcuts", n)]
    for n in hits:
        say(n)
    say(f"{len(hits)} relevant of {len(names)} crash-report entries")
    if args.pull and hits:
        dest = ensure_out("crash")
        pmd(["crash", "pull", dest, "-m", "SideStore|DannerApps|LocalDevVPN|TunnelProv|JetsamEvent"], timeout=600)
        say(f"pulled into {dest}")
    return 0


def cmd_archive(args: argparse.Namespace) -> int:
    base = ensure_out("archive", stamp())
    full = os.path.join(base, "full.logarchive")
    say(f"collecting the unified log store -> {full} (several minutes, ~2 GB)")
    pmd(["syslog", "collect", full], timeout=1800)
    persist = os.path.join(full, "Persist")
    if not os.path.isdir(persist):
        say("collect failed (no Persist folder)"); return 1
    since = None
    if args.since:
        today = dt.datetime.now().strftime("%Y-%m-%dT")
        since = dt.datetime.fromisoformat(args.since if "T" in args.since else today + args.since).timestamp()
    mini = os.path.join(base, "window.logarchive")
    os.makedirs(os.path.join(mini, "Persist"))
    for name in os.listdir(full):
        p = os.path.join(full, name)
        if name == "Persist":
            # Each ~10 MB Persist file covers 5-35 minutes on this phone and parses to ~3 GB of JSON,
            # so keep the window small: files modified after --since, newest --max-files of them.
            chosen = [f for f in sorted(os.listdir(p)) if since is None or os.path.getmtime(os.path.join(p, f)) >= since]
            for f in chosen[-args.max_files:]:
                shutil.copy2(os.path.join(p, f), os.path.join(mini, "Persist", f))
        elif os.path.isdir(p):
            # uuidtext, dsc, timesync, Special: the parser needs all of them next to Persist (copy, ~2 GB)
            shutil.copytree(p, os.path.join(mini, name))
        else:
            shutil.copy2(p, os.path.join(mini, name))
    say(f"window archive has {len(os.listdir(os.path.join(mini, 'Persist')))} Persist files")
    if not os.path.exists(UNIFIEDLOG):
        say("unifiedlog_iterator missing; archive kept for a Mac (open with Console.app)"); return 0
    raw = os.path.join(base, "window.jsonl")
    say("parsing with unifiedlog_iterator (minutes; output is large and is deleted after filtering)")
    subprocess.run([UNIFIEDLOG, "--mode", "log-archive", "-i", mini, "-o", raw, "-f", "jsonl"], capture_output=True)
    timeline = os.path.join(base, "timeline.txt")
    kept = 0
    with open(raw, encoding="utf-8", errors="replace") as fin, open(timeline, "w", encoding="utf-8") as fout:
        for line in fin:
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            proc = (o.get("process") or "").rsplit("/", 1)[-1]
            msg = o.get("message") or ""
            if CHAIN_PROCS.match(proc) or CHAIN_IDENT.search(msg):
                fout.write(scrub(f"{o.get('timestamp')} {proc}[{o.get('pid')}] {o.get('subsystem')}/{o.get('category')}: {msg[:600]}") + "\n")
                kept += 1
    os.remove(raw)
    say(f"timeline: {kept} lines -> {timeline}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("preflight", help="PC prerequisites and USB device presence").set_defaults(fn=cmd_preflight)
    sub.add_parser("status", help="device, the three apps, SideStore log recency").set_defaults(fn=cmd_status)
    sub.add_parser("console-pull", help="pull SideStore's console logs into out/").set_defaults(fn=cmd_console_pull)
    sub.add_parser("console-summary", help="refresh history from pulled console logs").set_defaults(fn=cmd_console_summary)
    w = sub.add_parser("watch", help="live syslog filtered to the refresh chain")
    w.add_argument("--seconds", type=int, default=180)
    w.add_argument("--all", action="store_true", help="keep every line (very noisy)")
    w.add_argument("--quiet", action="store_true")
    w.add_argument("--width", type=int, default=240)
    w.set_defaults(fn=cmd_watch)
    s = sub.add_parser("screenshot", help="PNG of the phone screen (developer tunnel)")
    s.add_argument("path", nargs="?")
    s.set_defaults(fn=cmd_screenshot)
    l = sub.add_parser("launch", help="launch sidestore|danner|vpn|<bundle id>; proves whether the signature is valid")
    l.add_argument("app")
    l.set_defaults(fn=cmd_launch)
    sub.add_parser("home", help="press the Home button").set_defaults(fn=cmd_home)
    sub.add_parser("proclist", help="which chain processes are running").set_defaults(fn=cmd_proclist)
    c = sub.add_parser("crash", help="relevant crash reports (Jetsam, SideStore, Danner, VPN)")
    c.add_argument("--pull", action="store_true")
    c.set_defaults(fn=cmd_crash)
    a = sub.add_parser("archive", help="collect + parse the phone's persisted unified log for a time window")
    a.add_argument("--since", help="HH:MM today or ISO datetime; Persist files modified after this are parsed")
    a.add_argument("--max-files", type=int, default=4, help="newest Persist files to parse (each ~3 GB of temporary JSON)")
    a.set_defaults(fn=cmd_archive)
    args = ap.parse_args(argv)
    try:
        return args.fn(args)
    except subprocess.TimeoutExpired as e:
        say(f"timeout: {e}"); return 2
    except RuntimeError as e:
        say(str(e)); return 2


if __name__ == "__main__":
    sys.exit(main())
