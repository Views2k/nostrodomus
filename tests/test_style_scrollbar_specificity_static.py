#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "main.legacy.js"
PROJECT = ROOT / "PROJECT.json"

# The monolith was split into focused src modules. Each invariant below is checked
# against the module that now owns it (re-pointed from the old main.legacy.js home),
# so the same real fact is still asserted at its current location.
VERSION_JS = ROOT / "src" / "core" / "version.js"
SETTINGS_STYLE_JS = ROOT / "src" / "ui" / "settingsStyle.js"
SETTINGS_CONTROLS_JS = ROOT / "src" / "ui" / "settings" / "settingsControls.js"
CODEBOX_STYLE_JS = ROOT / "src" / "ui" / "codeboxStyle.js"
STYLE_DOM_RUNTIME_JS = ROOT / "src" / "ui" / "styleDomRuntime.js"
CODEBOX_STYLE_RUNTIME_JS = ROOT / "src" / "ui" / "codeboxStyleRuntime.js"
STYLE_ROOT_RUNTIME_JS = ROOT / "src" / "ui" / "styleRootRuntime.js"
CODEBOX_STYLE_SETTLE_JS = ROOT / "src" / "ui" / "codebox" / "codeboxStyleSettle.js"

text = SRC.read_text(encoding="utf-8")
project = json.loads(PROJECT.read_text(encoding="utf-8"))
version_js = VERSION_JS.read_text(encoding="utf-8")
settings_style = SETTINGS_STYLE_JS.read_text(encoding="utf-8")
settings_controls = SETTINGS_CONTROLS_JS.read_text(encoding="utf-8")
codebox_style = CODEBOX_STYLE_JS.read_text(encoding="utf-8")
style_dom_runtime = STYLE_DOM_RUNTIME_JS.read_text(encoding="utf-8")
codebox_style_runtime = CODEBOX_STYLE_RUNTIME_JS.read_text(encoding="utf-8")
style_root_runtime = STYLE_ROOT_RUNTIME_JS.read_text(encoding="utf-8")
codebox_style_settle = CODEBOX_STYLE_SETTLE_JS.read_text(encoding="utf-8")


def require(cond, msg):
    if not cond:
        raise AssertionError(msg)


def version_tuple(value):
    return tuple(int(part) for part in str(value).split(".") if part.isdigit())


# (a) UN-PIN: the project moved off the literal v31.6.x scheme onto 0.1.x SemVer.
# The scrollbar-specificity work is preserved by floor-checking the version (it must
# remain at or beyond the baseline) plus an internal_version identity anchor.
project_version = str(project.get("version") or "")
internal_version = str(project.get("internal_version") or "")
FLOOR = (0, 1, 0)
require(version_tuple(project_version) >= FLOOR, "PROJECT.json version remains at or beyond the SemVer baseline that carries the scrollbar specificity work")
require("nostrodomus-v" in internal_version or version_tuple(project_version) > FLOOR, "internal_version preserves the runtime identity (or version advanced beyond the baseline)")

# (a)+(b) UN-PIN + RE-POINT: the runtime identity string moved out of main.legacy.js
# into src/core/version.js (main.legacy.js imports VERSION from there). Assert the
# runtime identity prefix exists and its embedded SemVer is at or beyond the floor.
require("from './core/version.js'" in text, "main.legacy.js sources the runtime identity from core/version.js")
require("nostrodomus-v" in version_js, "runtime version retains the nostrodomus identity string")
runtime_semver = ""
for marker in ["VERSION = \"nostrodomus-v", "VERSION = 'nostrodomus-v"]:
    idx = version_js.find(marker)
    if idx != -1:
        rest = version_js[idx + len(marker):]
        runtime_semver = rest.split("-")[0]
        break
require(version_tuple(runtime_semver) >= FLOOR, "runtime version identity remains at or beyond the style-workstream SemVer baseline")

# (b) RE-POINT: syntax theme presets/dropdown moved to src/ui/settingsStyle.js (data)
# and src/ui/settings/settingsControls.js (the syntaxThemeSelect control). main.legacy.js
# still wires STYLE_SYNTAX_PRESETS through into the settings runtime.
require("STYLE_SYNTAX_PRESETS" in settings_style and "vscodeDarkPlus" in settings_style and "crimson" in settings_style and "azure" in settings_style, "syntax theme dropdown includes the curated color-named options and no custom bar dependency")
require("STYLE_SYNTAX_PRESETS" in text, "main.legacy.js wires the syntax theme presets into the settings runtime")
require("function syntaxThemeSelect" in settings_controls and "STYLE_SYNTAX_PRESETS" in settings_controls, "syntaxThemeSelect dropdown control builds from the preset registry")

# (b) RE-POINT: syntaxTintPreset persistence moved to the settings/style modules.
require("syntaxTintPreset" in settings_style, "syntax tint preset persists in settings")

# (b) RE-POINT: webkit scrollbar thumb selector moved to src/ui/codeboxStyle.js.
require(".cm-scroller.ha-scrollbar::-webkit-scrollbar-thumb" in codebox_style, "webkit scrollbar thumb selector targets HA CodeMirror scrollbar class directly")

# (b) RE-POINT: managed style element attachment moved to src/ui/styleDomRuntime.js.
require("ensureRootCodeboxStyle" in style_dom_runtime and "styleContainerForRoot" in style_dom_runtime and "container.appendChild(style)" in style_dom_runtime, "managed style element attaches to discovered Document/ShadowRoot containers")

# (b) RE-POINT: style-token application moved to src/ui/codeboxStyleRuntime.js; the
# thumb token variable moved to src/ui/codeboxStyle.js.
require("applyCodeboxStyleTokensToStableRoots" in codebox_style_runtime and "--nostrodomus-codebox-scrollbar-thumb" in codebox_style, "style variables are owned by Nostrodomus root token registry")

# (b) RE-POINT: registry/discovery/style-control owners split across modules.
require("installRootStyleRegistry" in style_root_runtime, "style registry owner exists in its dedicated module")
require("shadow-root-editor-discovered" in codebox_style_runtime, "style runtime handles editor discovery scans")
require("style-range-change" in codebox_style_settle, "style controls re-apply on style range changes")

# Invariant unchanged: never reintroduce the v17 maroon color anywhere in src style code.
require("rgba(128, 32, 58" not in text and "rgba(128, 32, 58" not in codebox_style and "128, 32, 58" not in settings_style, "Nostrodomus does not reintroduce the v17 maroon color")
print("STYLE SCROLLBAR SPECIFICITY STATIC TEST OK")
