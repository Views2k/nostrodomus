from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
LEGACY = ROOT / "src" / "main.legacy.js"
SETTINGS_PANEL_RUNTIME = ROOT / "src" / "ui" / "settingsPanelRuntime.js"
SETTINGS_MODULE = ROOT / "src" / "core" / "settings.js"
VERSION_MODULE = ROOT / "src" / "core" / "version.js"
PROJECT = ROOT / "PROJECT.json"

SETTINGS_OWNER_DIR = ROOT / "src" / "ui" / "settings"

text = LEGACY.read_text(encoding="utf-8")
settings_panel_text = SETTINGS_PANEL_RUNTIME.read_text(encoding="utf-8", errors="replace")
# UI_DECOMP moved the settings owner functions out of settingsPanelRuntime.js
# into src/ui/settings/* factories; the runtime file is now a thin composer.
# Scan the owner modules too so the token assertions follow the code.
for owner_module in sorted(SETTINGS_OWNER_DIR.glob("*.js")):
    settings_panel_text += "\n" + owner_module.read_text(encoding="utf-8", errors="replace")
settings_text = SETTINGS_MODULE.read_text(encoding="utf-8", errors="replace")
version_text = VERSION_MODULE.read_text(encoding="utf-8", errors="replace") if VERSION_MODULE.exists() else ""
project = json.loads(PROJECT.read_text(encoding="utf-8"))
current_version = str(project.get("version") or "")
current_internal = str(project.get("internal_version") or "")

required_tokens = [
    "settingsSize: null",
    "function clampSettingsSize",
    "function saveSettingsSize",
    "nostrodomus-settings-resize-handle",
    "data-resize-handle",
    "nostrodomus-resizing",
    "resizeHandle?.addEventListener(\"pointerdown\"",
    "saveSettingsSize(finalSize.w, finalSize.h)",
    "user-select:text",
    "-webkit-user-select:text",
    "nostrodomus-help-copy-card",
    "data-copy-command",
    "navigator.clipboard.writeText(command)",
    "Click this whole command card to copy",
]

required_tokens.extend([current_version, current_internal])

combined_text = text + "\n" + settings_panel_text + "\n" + settings_text + "\n" + version_text
missing = [token for token in required_tokens if token not in combined_text]
assert not missing, "Missing settings resize/copy tokens: " + ", ".join(missing)

assert '"width:440px"' not in text, "Settings panel width must come from persisted clampSettingsSize"
assert '"max-height:76vh"' not in text, "Settings panel must use explicit persisted height, not fixed max-height only"

# Post-UI_DECOMP truth: main.legacy.js no longer defines helpCard; it consumes
# the owner function through the settingsPanelDelegates destructure.
assert re.search(r"helpCard\s*\}\s*=\s*settingsPanelDelegates", text), "main.legacy must consume helpCard from settingsPanelDelegates"
assert "function helpCard(title, lines = [])" in (SETTINGS_OWNER_DIR / "settingsSections.js").read_text(encoding="utf-8", errors="replace"), "settingsSections.js must own helpCard"
assert "function helpCard(title, lines = [])" in settings_panel_text, "settings runtime helpCard owner function not found"
assert "createSettingsElement(\"button\"" in settings_panel_text, "Help commands should render as full-card buttons"
assert "copyCommand: line.code" in settings_panel_text, "Help buttons must carry the exact console command in data-copy-command"
assert "createSettingsElement(\"code\"" in settings_panel_text, "Help command cards must visibly show the command text"

print("SETTINGS RESIZE/COPY STATIC TEST OK")
