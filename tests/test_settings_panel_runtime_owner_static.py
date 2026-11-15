#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / 'src' / 'app.js').read_text(encoding='utf-8', errors='replace')
ADAPTERS = (ROOT / 'src' / 'composition' / 'appAdapters.js').read_text(encoding='utf-8', errors='replace')
FACTORIES = (ROOT / 'src' / 'composition' / 'appRuntimeFactories.js').read_text(encoding='utf-8', errors='replace')
MODULE_PATH = ROOT / 'src' / 'ui' / 'settingsPanelRuntime.js'
SETTINGS_MODULES_DIR = ROOT / 'src' / 'ui' / 'settings'
# The settings panel runtime composes the modules in src/ui/settings/; the checks read all of them.
MODULE = MODULE_PATH.read_text(encoding='utf-8', errors='replace') if MODULE_PATH.exists() else ''
if SETTINGS_MODULES_DIR.exists():
    for _module_path in sorted(SETTINGS_MODULES_DIR.glob('*.js')):
        MODULE += '\n' + _module_path.read_text(encoding='utf-8', errors='replace')
REPORT = ROOT / 'reports' / 'SETTINGS_PANEL_RUNTIME_OWNER_STATIC_REPORT.txt'

errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require(MODULE_PATH.exists(), 'settings panel runtime owner module exists')
require('export function createSettingsPanelRuntime(ctx = {})' in MODULE, 'settings panel runtime exports factory')
require("import { createAppSettingsPanelRuntime } from './composition/appRuntimeFactories.js';" in APP, 'legacy imports settings panel runtime factory')
require("import { createSettingsPanelRuntime } from '../ui/settingsPanelRuntime.js';" in FACTORIES, 'factory imports settings panel runtime owner')
require('settingsPanelRuntime = createAppSettingsPanelRuntime({' in APP, 'legacy creates settings runtime through injected factory')
require('return createSettingsPanelRuntime({' in FACTORIES, 'factory owns verbose settings-panel runtime construction')

for token in [
    'function openSettings() {',
    'function makeSettingsStyle() {',
    'function closeSettings(resetPosition = false) {',
    'function syntaxThemeSelect(current) {',
    ]:
    require(token in MODULE, f'runtime owns settings body: {token}')

for token in [
    'function closeSettings(resetPosition = false) {\n    return settingsPanelRuntime.closeSettings(resetPosition);\n  }',
    ]:
    require(token in APP, f'app.js keeps a thin wrapper: {token.splitlines()[0]}')

require(
    'function openSettings() {' in APP and 'return settingsPanelRuntime.openSettings();' in APP,
    'app.js keeps an openSettings wrapper that delegates to the runtime',
)
require(
    'createAppSettingsElementAdapters' in APP
    and 'createSettingsElement(tag, options, children, documentRef)' in ADAPTERS,
    'app.js creates settings elements through appAdapters',
)

for token in [
    'openSettings() {',
    'makeSettingsStyle() {',
    'scheduleDiagnosticsRefresh("settings-open")',
    'startContextInspectorHeartbeat("settings-open")',
    'panel.querySelector("[data-close]")?.addEventListener("click", () => closeSettings(false));',
]:
    require(token in MODULE, f'settings runtime has behavior token: {token}')

for forbidden in [
    'function makeSettingsStyle() {\n    const style = createSettingsElement("style");',
    'panel.querySelector("[data-close]")?.addEventListener("click", () => closeSettings(false));',
    'scheduleDiagnosticsRefresh("settings-open");',
]:
    require(forbidden not in APP, f'app.js does not own settings behavior body: {forbidden[:72]}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Settings panel runtime owner static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('SETTINGS PANEL RUNTIME OWNER STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('SETTINGS PANEL RUNTIME OWNER STATIC TEST OK')
print('Report:', REPORT)
