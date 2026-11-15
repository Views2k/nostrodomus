#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/ui/settingsPanel.js'
PANEL_RUNTIME = ROOT / 'src/ui/settingsPanelRuntime.js'
APP = ROOT / 'src/app.js'
# The runtime creates settings DOM through src/ui/settingsPanel.js and passes the host document.
# The adapters in src/composition/appAdapters.js do the passing; the panel shell builds
# the resize handle.
ADAPTERS = ROOT / 'src/composition/appAdapters.js'
RUNTIME_FACTORIES = ROOT / 'src/composition/appRuntimeFactories.js'
PANEL_SHELL = ROOT / 'src/ui/settings/settingsPanelShell.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
DIST = ROOT / 'dist/nostrodomus.js'
REPORT = ROOT / 'reports/SETTINGS_PANEL_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
panel_runtime = PANEL_RUNTIME.read_text(encoding='utf-8', errors='replace') if PANEL_RUNTIME.exists() else ''
app = APP.read_text(encoding='utf-8', errors='replace')
adapters = ADAPTERS.read_text(encoding='utf-8', errors='replace') if ADAPTERS.exists() else ''
runtime_factories = RUNTIME_FACTORIES.read_text(encoding='utf-8', errors='replace') if RUNTIME_FACTORIES.exists() else ''
panel_shell = PANEL_SHELL.read_text(encoding='utf-8', errors='replace') if PANEL_SHELL.exists() else ''
# app.js and the modules that hold its settings wiring.
runtime = '\n'.join([app, adapters, runtime_factories, panel_runtime, panel_shell])
dist = DIST.read_text(encoding='utf-8', errors='replace') if DIST.exists() else ''
allowed = json.loads(ALLOWLIST.read_text(encoding='utf-8')).get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("from '../ui/settingsPanel.js'" in adapters, 'runtime imports settings panel module')

# createAppSettingsElementAdapters passes the host document as the last argument.
for token in [
    'return createSettingsElement(tag, options, children, documentRef);',
    'return appendSettingsChildren(parent, children, documentRef);',
    'return settingsTitle(text, documentRef);',
]:
    require(token in runtime, f'runtime delegates settings helper (passes document): {token}')

for token in [
    'export function createSettingsElement',
    'export function appendSettingsChildren',
    'export function settingsTitle',
    'function documentFor(doc)',
    'node.setAttribute(name, value === true ? "" : String(value));',
    'node.dataset[name] = String(value);',
    'node.style.cssText = options.style;',
    'documentRef.createTextNode(child)',
]:
    require(token in module, f'module settings panel invariant present: {token}')

require('src/ui/settingsPanel.js' not in allowed, 'settings panel is not on the unwired allowlist')

for local_copy in [
    'const node = document.createElement(tag);\n    if (options.className) node.className = options.className;',
    'node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);',
    'return createSettingsElement("h3", { className: "nostrodomus-section-title", text });',
]:
    require(local_copy not in app, f'app.js does not own settings helper body token: {local_copy[:60]}')

for token in [
    'createSettingsElement(tag, options = {}, children = []) {\n      return createSettingsElement(tag, options, children, documentRef);',
    'appendChildren(parent, children) {\n      return appendSettingsChildren(parent, children, documentRef);',
    'settingsTitle(text) {\n      return settingsTitle(text, documentRef);',
    'function openSettings()',
    'createSettingsPanelRuntimeDelegates(() => settingsPanelRuntime)',
    'makeSettingsStyle, sectionPanel, helpCard } = settingsPanelDelegates',
    'clampSettingsPosition, clampSettingsSize, settingsPortalViewportRect',
    'const resizeHandle = createSettingsElement("div"',
]:
    require(token in runtime, f'runtime Settings ownership/delegation token present: {token[:80]}')

for token in [
    'function createSettingsElement',
    'function appendSettingsChildren',
    'function settingsTitle',
    'nostrodomus-section-title',
    'settings panel helper requires a document-like object',
]:
    require(token in dist, f'bundled dist contains settings panel token: {token}')

for forbidden in [
    'window.',
    'localStorage',
    'fetch(',
    'sendBeacon',
    'eval(',
    'new Function',
    'addEventListener',
    'removeEventListener',
    'querySelector',
    'showPopover',
    'hidePopover',
    ':popover-open',
]:
    require(forbidden not in module, f'forbidden settings panel module token absent: {forbidden}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Settings panel module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('SETTINGS PANEL MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('SETTINGS PANEL MODULE WIRING STATIC TEST OK')
for note in notes:
    print('-', note)
print('Report:', REPORT)
