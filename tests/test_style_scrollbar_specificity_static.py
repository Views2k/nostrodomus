#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "app.js"

# The scrollbar rules target HA's own CodeMirror scrollbar class, and the syntax themes are a
# curated dropdown. Each fact is checked in the module that owns it.
SETTINGS_STYLE_JS = ROOT / "src" / "ui" / "settingsStyle.js"
SETTINGS_CONTROLS_JS = ROOT / "src" / "ui" / "settings" / "settingsControls.js"
CODEBOX_STYLE_JS = ROOT / "src" / "ui" / "codeboxStyle.js"
STYLE_DOM_RUNTIME_JS = ROOT / "src" / "ui" / "styleDomRuntime.js"
CODEBOX_STYLE_RUNTIME_JS = ROOT / "src" / "ui" / "codeboxStyleRuntime.js"
STYLE_ROOT_RUNTIME_JS = ROOT / "src" / "ui" / "styleRootRuntime.js"
CODEBOX_STYLE_SETTLE_JS = ROOT / "src" / "ui" / "codebox" / "codeboxStyleSettle.js"

text = SRC.read_text(encoding="utf-8")
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


# The syntax theme presets are data in src/ui/settingsStyle.js; settingsControls.js builds the
# dropdown from them, and app.js passes them to the settings runtime.
require("STYLE_SYNTAX_PRESETS" in settings_style and "vscodeDarkPlus" in settings_style and "crimson" in settings_style and "azure" in settings_style, "syntax theme dropdown includes the curated color-named options and no custom bar dependency")
require("STYLE_SYNTAX_PRESETS" in text, "app.js wires the syntax theme presets into the settings runtime")
require("function syntaxThemeSelect" in settings_controls and "STYLE_SYNTAX_PRESETS" in settings_controls, "syntaxThemeSelect dropdown control builds from the preset registry")

require("syntaxTintPreset" in settings_style, "syntax tint preset persists in settings")

require(".cm-scroller.ha-scrollbar::-webkit-scrollbar-thumb" in codebox_style, "webkit scrollbar thumb selector targets HA CodeMirror scrollbar class directly")

require("ensureRootCodeboxStyle" in style_dom_runtime and "styleContainerForRoot" in style_dom_runtime and "container.appendChild(style)" in style_dom_runtime, "managed style element attaches to discovered Document/ShadowRoot containers")

require("applyCodeboxStyleTokensToStableRoots" in codebox_style_runtime and "--nostrodomus-codebox-scrollbar-thumb" in codebox_style, "style variables are owned by Nostrodomus root token registry")

require("installRootStyleRegistry" in style_root_runtime, "style registry owner exists in its dedicated module")
require("shadow-root-editor-discovered" in codebox_style_runtime, "style runtime handles editor discovery scans")
require("style-range-change" in codebox_style_settle, "style controls re-apply on style range changes")

# The v17 companion's maroon color is not used in the Nostrodomus style code.
require("rgba(128, 32, 58" not in text and "rgba(128, 32, 58" not in codebox_style and "128, 32, 58" not in settings_style, "Nostrodomus does not use the v17 maroon color")
print("STYLE SCROLLBAR SPECIFICITY STATIC TEST OK")
