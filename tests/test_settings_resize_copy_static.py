from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "src" / "app.js"
SETTINGS_PANEL_RUNTIME = ROOT / "src" / "ui" / "settingsPanelRuntime.js"
SETTINGS_MODULE = ROOT / "src" / "core" / "settings.js"

SETTINGS_OWNER_DIR = ROOT / "src" / "ui" / "settings"

text = APP.read_text(encoding="utf-8")
settings_panel_text = SETTINGS_PANEL_RUNTIME.read_text(encoding="utf-8", errors="replace")
# settingsPanelRuntime.js composes the modules in src/ui/settings/, so those are read too.
for owner_module in sorted(SETTINGS_OWNER_DIR.glob("*.js")):
    settings_panel_text += "\n" + owner_module.read_text(encoding="utf-8", errors="replace")
settings_text = SETTINGS_MODULE.read_text(encoding="utf-8", errors="replace")

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

combined_text = text + "\n" + settings_panel_text + "\n" + settings_text
missing = [token for token in required_tokens if token not in combined_text]
assert not missing, "Missing settings resize/copy tokens: " + ", ".join(missing)

assert '"width:440px"' not in text, "Settings panel width must come from persisted clampSettingsSize"
assert '"max-height:76vh"' not in text, "Settings panel must use explicit persisted height, not fixed max-height only"

# app.js does not define helpCard; it consumes
# the owner function through the settingsPanelDelegates destructure.
assert re.search(r"helpCard\s*\}\s*=\s*settingsPanelDelegates", text), "app.js must consume helpCard from settingsPanelDelegates"
assert "function helpCard(title, lines = [])" in (SETTINGS_OWNER_DIR / "settingsSections.js").read_text(encoding="utf-8", errors="replace"), "settingsSections.js must own helpCard"
assert "function helpCard(title, lines = [])" in settings_panel_text, "settings runtime helpCard owner function not found"
assert "createSettingsElement(\"button\"" in settings_panel_text, "Help commands should render as full-card buttons"
assert "copyCommand: line.code" in settings_panel_text, "Help buttons must carry the exact console command in data-copy-command"
assert "createSettingsElement(\"code\"" in settings_panel_text, "Help command cards must visibly show the command text"

print("SETTINGS RESIZE/COPY STATIC TEST OK")
