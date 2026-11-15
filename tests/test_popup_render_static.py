#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "src" / "app.js"
MODULE = ROOT / "src" / "completion" / "popupRuntime.js"
SESSION = ROOT / "src" / "completion" / "completionRuntime.js"
FACTORY = ROOT / "src" / "composition" / "appCompletionRuntimeFactory.js"
DIST = ROOT / "dist" / "nostrodomus.js"

app = APP.read_text(encoding="utf-8")
module = MODULE.read_text(encoding="utf-8")
session = SESSION.read_text(encoding="utf-8")
factory = FACTORY.read_text(encoding="utf-8")
dist = DIST.read_text(encoding="utf-8", errors="replace")
owner = app + "\n" + module + "\n" + session + "\n" + factory

errors = []

required_owner_tokens = [
    "export function renderCompletionPopup",
    "function textNodeElement",
    "function popupHeader",
    "function completionDetailElement",
    "box.appendChild(popupHeader(documentRef",
    "list.appendChild(row)",
    "textContent",
]

required_legacy_tokens = [
    "renderCompletionPopup,",
    "ensureOverlay,",
    "insertItem,",
    "openSettings,",
    "preserveScrollDuring,",
    "createCompletionRuntimeDelegates",
]

for token in required_owner_tokens:
    if token not in owner:
        errors.append(f"missing popup owner token: {token}")

for token in required_legacy_tokens:
    owner_text = factory if token in {"renderCompletionPopup,", "createCompletionRuntimeDelegates"} else app
    if token not in owner_text:
        errors.append(f"missing popup delegate token: {token}")

if "box.innerHTML" in owner:
    errors.append("popup renderer must not assign box.innerHTML")

if app.count("innerHTML") != 0:
    errors.append(f"app.js innerHTML count should be 0, found {app.count('innerHTML')}")

if module.count("innerHTML") != 0:
    errors.append(f"popup owner innerHTML count should be 0, found {module.count('innerHTML')}")

if session.count("innerHTML") != 0:
    errors.append(f"completion session runtime innerHTML count should be 0, found {session.count('innerHTML')}")

if dist.count("innerHTML") != 0:
    errors.append(f"dist innerHTML count should be 0, found {dist.count('innerHTML')}")

if "dataset.nostrodomusSettings" not in module or "addEventListener('mousedown'" not in module:
    errors.append("settings button event binding token missing from popup owner")

if errors:
    print("POPUP RENDER STATIC TEST FAILED")
    for err in errors:
        print("FAIL", err)
    sys.exit(1)

print("POPUP RENDER STATIC TEST OK")
for token in required_owner_tokens:
    print("PASS owner token:", token)
for token in required_legacy_tokens:
    print("PASS delegate token:", token)
print("PASS legacy innerHTML count:", app.count("innerHTML"))
print("PASS module innerHTML count:", module.count("innerHTML"))
print("PASS session innerHTML count:", session.count("innerHTML"))
print("PASS dist innerHTML count:", dist.count("innerHTML"))
