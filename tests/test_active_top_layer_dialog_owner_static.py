#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / 'src/main.legacy.js').read_text(encoding='utf-8')
ACTIVE = (ROOT / 'src/editor/activeEditor.js').read_text(encoding='utf-8')
# The activeTopLayerDialog compatibility shim + its delegation to the owner module moved out of
# src/main.legacy.js into the extracted settings/completion portal runtime owner
# (src/ui/settingsPortalRuntime.js). Same invariant (a thin shim that delegates to the
# activeEditor owner), current location.
PORTAL = (ROOT / 'src/ui/settingsPortalRuntime.js').read_text(encoding='utf-8')

# main imports the activeTopLayerDialog owner from the activeEditor module. The decomposition
# switched from a named alias import to a namespace import and wires the owner into the portal
# runtime via the activeTopLayerDialogFromModule dependency. Both forms prove the same import-of-owner fact.
assert "import * as activeEditor from './editor/activeEditor.js';" in MAIN, 'main must import the activeEditor module (activeTopLayerDialog owner)'
assert 'activeTopLayerDialogFromModule: activeEditor.activeTopLayerDialog' in MAIN, 'main must wire the activeTopLayerDialog owner (activeEditor.activeTopLayerDialog) into the portal runtime'
assert 'function activeTopLayerDialog() {' in PORTAL, 'portal runtime must preserve activeTopLayerDialog compatibility function'
assert 'return activeTopLayerDialogFromModule({' in PORTAL, 'portal runtime activeTopLayerDialog must delegate to the activeEditor owner module'
assert 'Runtime-error scope carry-forward: settings:top-layer-dialog-query settings:top-layer-dialog-modal-check settings:top-layer-dialog-shadow-query' not in MAIN, 'main must not retain stale runtime-error scope carry-forward comments'
assert 'try { all = Array.from(root.querySelectorAll?.("*") || []); }' not in MAIN, 'main must no longer contain executable activeTopLayerDialog wildcard walk body'
assert 'Array.from(root.querySelectorAll?.("*") || [])' not in MAIN, 'main must not preserve activeTopLayerDialog wildcard walk as comment archaeology'

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
