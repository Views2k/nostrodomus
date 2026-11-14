from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "main.legacy.js"
SETTINGS_PANEL_RUNTIME = ROOT / "src" / "ui" / "settingsPanelRuntime.js"
PROJECT = ROOT / "PROJECT.json"
DOC = ROOT / "docs" / "UX_VERIFICATION_CHECKLIST.md"

SETTINGS_OWNER_DIR = ROOT / "src" / "ui" / "settings"

text = SRC.read_text(encoding="utf-8")
settings_panel_text = SETTINGS_PANEL_RUNTIME.read_text(encoding="utf-8")
source_owner_text = text + "\n" + settings_panel_text
# UI_DECOMP moved the settings owner functions into src/ui/settings/* factories;
# scan the owner modules too so the token assertions follow the code.
for owner_module in sorted(SETTINGS_OWNER_DIR.glob("*.js")):
    source_owner_text += "\n" + owner_module.read_text(encoding="utf-8", errors="replace")
project = PROJECT.read_text(encoding="utf-8")
doc = DOC.read_text(encoding="utf-8")

required_tokens = [
    'panel.setAttribute("role", "dialog")',
    'panel.setAttribute("aria-label", "Nostrodomus settings")',
    'role: "tab"',
    '"aria-selected"',
    'role: "tabpanel"',
    '"aria-hidden"',
    'aria-pressed',
    'type: "button"',
    'aria-label": label',
    'button:focus-visible',
    '.nostrodomus-checkbox-row',
    '.nostrodomus-settings-card',
    'tabButton("Style", "style")',
    'sectionPanel("style"',
    'settingsTitle("Style")',
    'Codebox text size',
    'Syntax theme',
    # Dialog focus management (MD7): focusable panel, focus moved in on open, restored on close.
    'panel.setAttribute("tabindex", "-1")',
    'function deepActiveElement()',
    'state.settingsReturnFocus',
    'panel.focus?.({ preventScroll: true })',
    'returnFocus.focus({ preventScroll: true })',
    # Keyboard move/resize (MD8): the header and resize handle are focusable and take arrow keys.
    'Move settings panel with arrow keys',
    'Resize settings panel with arrow keys',
]

missing = [token for token in required_tokens if token not in source_owner_text]
assert not missing, "missing UX/accessibility tokens: " + ", ".join(missing)

assert 'ux_refinement_policy' in project
assert '## Style controls' in doc
assert 'Confirm the settings panel does not jump to the top' in doc and 'do not accept arbitrary CSS' in doc

print("SETTINGS UX ACCESSIBILITY STATIC TEST OK")
