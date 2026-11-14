#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
LEGACY = (ROOT / 'src' / 'main.legacy.js').read_text(encoding='utf-8', errors='replace')
ADAPTERS = (ROOT / 'src' / 'composition' / 'mainLegacyAdapters.js').read_text(encoding='utf-8', errors='replace')
FACTORIES = (ROOT / 'src' / 'composition' / 'mainLegacyRuntimeFactories.js').read_text(encoding='utf-8', errors='replace')
MODULE_PATH = ROOT / 'src' / 'ui' / 'settingsPanelRuntime.js'
SETTINGS_MODULES_DIR = ROOT / 'src' / 'ui' / 'settings'
# The settings panel runtime is a composer over src/ui/settings/ modules
# (UI_DECOMP P1); the owned settings body spans the composer plus its modules.
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
require("import { createMainLegacySettingsPanelRuntime } from './composition/mainLegacyRuntimeFactories.js';" in LEGACY, 'legacy imports settings panel runtime factory')
require("import { createSettingsPanelRuntime } from '../ui/settingsPanelRuntime.js';" in FACTORIES, 'factory imports settings panel runtime owner')
require('settingsPanelRuntime = createMainLegacySettingsPanelRuntime({' in LEGACY, 'legacy creates settings runtime through injected factory')
require('return createSettingsPanelRuntime({' in FACTORIES, 'factory owns verbose settings-panel runtime construction')

for token in [
    'function openSettings() {',
    'function makeSettingsStyle() {',
    'function closeSettings(resetPosition = false) {',
    'function syntaxThemeSelect(current) {',
    ]:
    require(token in MODULE, f'runtime owns moved settings body: {token}')

for token in [
    'function closeSettings(resetPosition = false) {\n    return settingsPanelRuntime.closeSettings(resetPosition);\n  }',
    ]:
    require(token in LEGACY, f'legacy keeps thin compatibility wrapper: {token.splitlines()[0]}')

require(
    'function openSettings() {' in LEGACY and 'return settingsPanelRuntime.openSettings();' in LEGACY,
    'legacy keeps openSettings compatibility wrapper with runtime delegation',
)
require(
    (
        'function createSettingsElement(tag, options = {}, children = []) {' in LEGACY
        and (
            'return settingsPanelRuntime.createSettingsElement(tag, options, children);' in LEGACY
            or 'return createSettingsElementFromSettingsPanelModule(tag, options, children, document);' in LEGACY
        )
    )
    or (
        'createMainLegacySettingsElementAdapters' in LEGACY
        and 'createSettingsElement(tag, options, children, documentRef)' in ADAPTERS
    ),
    'legacy keeps createSettingsElement compatibility wrapper/delegation through mainLegacyAdapters',
)

for token in [
    'openSettings() {',
    'makeSettingsStyle() {',
    'scheduleDiagnosticsRefresh("settings-open")',
    'startContextInspectorHeartbeat("settings-open")',
    'panel.querySelector("[data-close]")?.addEventListener("click", () => closeSettings(false));',
]:
    require(token in MODULE, f'settings runtime preserves behavior token: {token}')

for forbidden in [
    'function makeSettingsStyle() {\n    const style = createSettingsElement("style");',
    'panel.querySelector("[data-close]")?.addEventListener("click", () => closeSettings(false));',
    'scheduleDiagnosticsRefresh("settings-open");',
]:
    require(forbidden not in LEGACY, f'legacy no longer owns settings behavior body: {forbidden[:72]}')

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
