#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/ui/settingsPanel.js'
PANEL_RUNTIME = ROOT / 'src/ui/settingsPanelRuntime.js'
LEGACY = ROOT / 'src/main.legacy.js'
# The monolith was split: the settings-panel DOM-helper seam wiring (the import of
# ../ui/settingsPanel.js and the document-passing delegates that used to live inline in
# main.legacy.js) was extracted into src/composition/mainLegacyAdapters.js, and the shell that
# builds the resize handle moved into src/ui/settings/settingsPanelShell.js. The invariant
# (runtime delegates settings DOM creation to the module, passing the host document) is
# unchanged — only its file moved — so the runtime composition root is now the union of
# main.legacy.js + its extracted owner modules below.
ADAPTERS = ROOT / 'src/composition/mainLegacyAdapters.js'
RUNTIME_FACTORIES = ROOT / 'src/composition/mainLegacyRuntimeFactories.js'
PANEL_SHELL = ROOT / 'src/ui/settings/settingsPanelShell.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
DIST = ROOT / 'dist/nostrodomus.js'
REPORT = ROOT / 'reports/SETTINGS_PANEL_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
panel_runtime = PANEL_RUNTIME.read_text(encoding='utf-8', errors='replace') if PANEL_RUNTIME.exists() else ''
legacy = LEGACY.read_text(encoding='utf-8', errors='replace')
adapters = ADAPTERS.read_text(encoding='utf-8', errors='replace') if ADAPTERS.exists() else ''
runtime_factories = RUNTIME_FACTORIES.read_text(encoding='utf-8', errors='replace') if RUNTIME_FACTORIES.exists() else ''
panel_shell = PANEL_SHELL.read_text(encoding='utf-8', errors='replace') if PANEL_SHELL.exists() else ''
# The runtime composition root is the legacy file plus the modules its settings wiring was
# extracted into. Assertions that pinned inline-in-legacy facts now check this union.
runtime = '\n'.join([legacy, adapters, runtime_factories, panel_runtime, panel_shell])
dist = DIST.read_text(encoding='utf-8', errors='replace') if DIST.exists() else ''
allowed = json.loads(ALLOWLIST.read_text(encoding='utf-8')).get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

# Import moved out of main.legacy.js into the extracted adapter module; the relative path
# from src/core/ is '../ui/settingsPanel.js'. Same fact: runtime imports the panel module.
require("from '../ui/settingsPanel.js'" in adapters, 'runtime imports settings panel module')

# The settings DOM helpers used to be delegated inline in main.legacy.js via
# *FromSettingsPanelModule(... , document) wrappers. That seam was extracted into
# createMainLegacySettingsElementAdapters (src/composition/mainLegacyAdapters.js), which delegates
# to the same module functions and threads the host document through as the final argument.
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

require('src/ui/settingsPanel.js' not in allowed, 'settings panel removed from unwired allowlist')
require('src/ui/styles.css.js' not in allowed, 'style mirror final sentinel removed from unwired allowlist')

for old_inline in [
    'const node = document.createElement(tag);\n    if (options.className) node.className = options.className;',
    'node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);',
    'return createSettingsElement("h3", { className: "nostrodomus-section-title", text });',
]:
    require(old_inline not in legacy, f'legacy no longer owns old settings helper body token: {old_inline[:60]}')

for token in [
    # The wrappers became object methods on createMainLegacySettingsElementAdapters; they
    # still delegate to the module functions threading the host document (documentRef).
    'createSettingsElement(tag, options = {}, children = []) {\n      return createSettingsElement(tag, options, children, documentRef);',
    'appendChildren(parent, children) {\n      return appendSettingsChildren(parent, children, documentRef);',
    'settingsTitle(text) {\n      return settingsTitle(text, documentRef);',
    'function openSettings()',
    'createSettingsPanelRuntimeDelegates(() => settingsPanelRuntime)',
    'makeSettingsStyle, sectionPanel, helpCard } = settingsPanelDelegates',
    'clampSettingsPosition, clampSettingsSize, settingsPortalViewportRect',
    # The resize handle is now built in the extracted settings panel shell module.
    'const resizeHandle = createSettingsElement("div"',
]:
    require(token in runtime, f'runtime Settings ownership/delegation token preserved: {token[:80]}')

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
