#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / 'src/app.js').read_text(encoding='utf-8')
ACTIVE = (ROOT / 'src/editor/activeEditor.js').read_text(encoding='utf-8')
# activeTopLayerDialog lives in src/editor/activeEditor.js; the settings portal runtime keeps a
# thin function of the same name that calls it.
PORTAL = (ROOT / 'src/ui/settingsPortalRuntime.js').read_text(encoding='utf-8')

assert "import * as activeEditor from './editor/activeEditor.js';" in MAIN, 'main must import the activeEditor module (activeTopLayerDialog owner)'
assert 'activeTopLayerDialogFromModule: activeEditor.activeTopLayerDialog' in MAIN, 'main must wire the activeTopLayerDialog owner (activeEditor.activeTopLayerDialog) into the portal runtime'
assert 'function activeTopLayerDialog() {' in PORTAL, 'portal runtime must keep its activeTopLayerDialog function'
assert 'return activeTopLayerDialogFromModule({' in PORTAL, 'portal runtime activeTopLayerDialog must delegate to the activeEditor owner module'
assert 'try { all = Array.from(root.querySelectorAll?.("*") || []); }' not in MAIN, 'main must not contain the activeTopLayerDialog wildcard walk'
assert 'Array.from(root.querySelectorAll?.("*") || [])' not in MAIN, 'main must not contain the activeTopLayerDialog wildcard walk, in code or in a comment'

for token in [
    'export function activeTopLayerDialog(options = {})',
    'settings:top-layer-dialog-query',
    'settings:top-layer-dialog-modal-check',
    'settings:top-layer-dialog-shadow-query',
    'runtimeState.settingsTopLayerDialogShadowTraversalMode = legacyRestoredMode',
    'runtimeState.settingsTopLayerDialogLegacyWildcardShadowTraversals',
    'activeTopLayerDialog-settings-portal-hotfix',
    'root.querySelectorAll?.("*")',
]:
    assert token in ACTIVE, f'activeEditor module missing activeTopLayerDialog owner token: {token}'

print('ACTIVE TOP LAYER DIALOG OWNER STATIC TEST OK')
