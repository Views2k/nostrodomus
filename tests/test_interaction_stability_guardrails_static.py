#!/usr/bin/env python3
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
# The monolith was decomposed: the settings-interaction preservation helpers moved
# from src/main.legacy.js into src/ui/settingsInteractionRuntime.js, and the live
# setting-mutation control/diagnostics handlers moved into
# src/ui/settings/settingsPanelShell.js. The bundled dist still carries every
# invariant in minified form. Same facts, current locations.
INTERACTION = ROOT / "src/ui/settingsInteractionRuntime.js"
SHELL = ROOT / "src/ui/settings/settingsPanelShell.js"
DIST = ROOT / "dist/nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
REPORT = ROOT / "reports/INTERACTION_STABILITY_GUARDRAILS_STATIC_TEST_REPORT.txt"

errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append("PASS " + msg)
    else:
        errors.append(msg)

project = json.loads(PROJECT.read_text(encoding="utf-8"))

interaction_src = INTERACTION.read_text(encoding="utf-8", errors="replace")
shell_src = SHELL.read_text(encoding="utf-8", errors="replace")
dist_text = DIST.read_text(encoding="utf-8", errors="replace")

# --- Settings-interaction preservation helpers (now in settingsInteractionRuntime.js) ---
# Source carries the exact signatures; the minified dist drops the inter-argument
# spaces (e.g. "(fn, after)" -> "(fn,after)"), so accept either form for the dist.
INTERACTION_HELPERS = [
    ("captures settings interaction state",
     "function captureSettingsInteractionSnapshot()",
     "function captureSettingsInteractionSnapshot()"),
    ("restores settings interaction state",
     "function restoreSettingsInteractionSnapshot(snapshot)",
     "function restoreSettingsInteractionSnapshot(snapshot)"),
    ("has shared settings interaction preservation helper",
     "function preserveSettingsInteractionDuring(fn, after)",
     "function preserveSettingsInteractionDuring(fn,after)"),
    ("centralizes live setting mutations",
     "function applySettingChangePreservingInteraction(reason, mutator, after)",
     "function applySettingChangePreservingInteraction(reason,mutator,after)"),
]
for label, src_form, dist_form in INTERACTION_HELPERS:
    require(src_form in interaction_src, f"settingsInteractionRuntime.js {label}")
    require((dist_form in dist_text) or (src_form in dist_text), f"dist {label}")

require("interaction_stability_policy" in PROJECT.read_text(encoding="utf-8"), "PROJECT.json records interaction stability policy")

# --- Live setting-mutation control handlers (now in settingsPanelShell.js) ---
# Each control handler loop must route mutations through the shared preserved-mutation
# helper and must NOT close/reopen (rebuild) the settings panel.
# Source form: `for (const <var> of panel.querySelectorAll("<sel>")) { ... }`
# (note the doubled `))` closing both querySelectorAll(...) and for(...)).
SOURCE_HANDLER_PATTERNS = {
    "boolean setting checkboxes": r'for \(const input of panel\.querySelectorAll\("input\[data-k\]"\)\) \{(?P<body>.*?)\n    \}',
    "language toggles": r'for \(const input of panel\.querySelectorAll\("input\[data-lang\]"\)\) \{(?P<body>.*?)\n    \}',
    "provider toggles": r'for \(const input of panel\.querySelectorAll\("input\[data-provider\]"\)\) \{(?P<body>.*?)\n    \}',
    "option buttons": r'for \(const btn of panel\.querySelectorAll\("button\[data-option-group\]"\)\) \{(?P<body>.*?)\n    \}',
}
for label, pattern in SOURCE_HANDLER_PATTERNS.items():
    match = re.search(pattern, shell_src, re.S)
    require(match is not None, f"source has {label} handler")
    if match:
        body = match.group("body")
        require("applySettingChangePreservingInteraction" in body, f"source {label} use shared preserved mutation helper")
        require("closeSettings(false)" not in body and "openSettings()" not in body, f"source {label} do not close/reopen settings")

# Dist form: the loop is minified to `for(let <var> of panel.querySelectorAll("<sel>"))<handler>`
# with no block braces and no inter-token spaces. Nested arrow bodies make a balanced
# body capture unreliable in minified code, so assert against a bounded window
# immediately after the loop header (the shared mutation helper is invoked at the very
# top of every handler) and reject any panel-rebuild call (closeSettings is minified to
# closeSettings(!1)) inside that window.
DIST_HANDLER_PATTERNS = {
    "boolean setting checkboxes": r'for\(let input of panel\.querySelectorAll\("input\[data-k\]"\)\)',
    "language toggles": r'for\(let input of panel\.querySelectorAll\("input\[data-lang\]"\)\)',
    "provider toggles": r'for\(let input of panel\.querySelectorAll\("input\[data-provider\]"\)\)',
    "option buttons": r'for\(let btn of panel\.querySelectorAll\("button\[data-option-group\]"\)\)',
}
for label, pattern in DIST_HANDLER_PATTERNS.items():
    match = re.search(pattern, dist_text)
    require(match is not None, f"dist has {label} handler")
    if match:
        body = dist_text[match.end(): match.end() + 400]
        require("applySettingChangePreservingInteraction" in body, f"dist {label} use shared preserved mutation helper")
        require(
            "closeSettings(false)" not in body and "closeSettings(!1)" not in body and "openSettings()" not in body,
            f"dist {label} do not close/reopen settings",
        )

# --- Diagnostics action handlers must preserve interaction state, not rebuild the panel ---
# NOTE: [data-diag-clear-history] was removed together with the whole ContextParityHistory diagnostics pilot
# (src/diagnostics/contextParityHistory.js + contextDiagnostics.clearParityHistory). The
# button no longer exists anywhere in src or dist, so it is dropped from this check; the
# surviving diagnostics actions ([data-diag-refresh], [data-diag-health]) still carry the
# same preserve-interaction invariant. (Source carries the diag handlers in shell_src;
# closeSettings is minified to closeSettings(!1) in the dist.)
for text_name, text in (("source", shell_src), ("dist", dist_text)):
    for token in ("[data-diag-refresh]", "[data-diag-health]"):
        idx = text.find(token)
        require(idx != -1, f"{text_name} has handler for {token}")
        if idx != -1:
            chunk = text[idx: idx + 700]
            require(
                "closeSettings(false)" not in chunk and "closeSettings(!1)" not in chunk and "openSettings()" not in chunk,
                f"{text_name} {token} handler does not rebuild settings panel",
            )
            require("preserveSettingsInteractionDuring" in chunk, f"{text_name} {token} handler preserves settings interaction state")

require(project.get("internal_version", "").startswith(f"nostrodomus-v{project.get('version')}-"), "PROJECT.json internal_version matches current version")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Interaction stability guardrails static test report\n\n"
    "Results:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n",
    encoding="utf-8",
)

if errors:
    print("INTERACTION STABILITY GUARDRAILS STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    print("Report:", REPORT)
    raise SystemExit(1)

print("INTERACTION STABILITY GUARDRAILS STATIC TEST OK")
for note in notes:
    print(note)
print("Report:", REPORT)
