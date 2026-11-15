#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/editor/activeEditor.js'
APP = ROOT / 'src/app.js'
CONTEXT_RUNTIME = ROOT / 'src/diagnostics/contextDiagnosticsRuntime.js'
DISPATCH_RUNTIME = ROOT / 'src/editor/editorDispatchRuntime.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
REPORT = ROOT / 'reports/ACTIVE_EDITOR_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
app = APP.read_text(encoding='utf-8', errors='replace')
context_runtime = CONTEXT_RUNTIME.read_text(encoding='utf-8', errors='replace')
dispatch_runtime = DISPATCH_RUNTIME.read_text(encoding='utf-8', errors='replace')
runtime_owner = app + '\n' + context_runtime + '\n' + dispatch_runtime
allowlist = json.loads(ALLOWLIST.read_text(encoding='utf-8'))
allowed = allowlist.get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("from './editor/activeEditor.js'" in app, 'runtime imports active editor module')
# The snapshot readout and traversal callbacks are wired in contextDiagnosticsRuntime.js;
# homeRoot, activeEditDialog and isScopedEditorEvent are called by name from app.js.
for token in [
    'createActiveEditorContextSnapshotReadout({',
    'traversalScoped: () => activeEditorReadoutTraversalScopedEnabled()',
    'onTraversal: summary => recordActiveEditorReadoutTraversal(state, summary)',
    'collectSnapshot: ({ doc, pos, scope }) => collectContextSnapshotDryRun({ doc, pos, scope })',
    'homeRoot()',
    'activeEditDialog()',
    'isScopedEditorEvent: (ev) => isScopedEditorEvent(ev, { state })',
]:
    require(token in runtime_owner, f'runtime delegates helper directly through main, context diagnostics, or editor dispatch runtime: {token}')

# editorDispatchRuntime keeps no copy of the scope and view helpers; it calls activeEditor's.
for token in [
    'activeEditor.isNostrodomusUiEvent(ev, { state })',
    'activeEditor.isViewAllowed(view, { state, window: windowRef })',
    'activeEditor.viewFromEvent(ev, { state, window: windowRef })',
    'activeEditor.rememberView(ev, {',
    'looksLikeView(view)',
]:
    require(token in dispatch_runtime, f'editor dispatch runtime delegates active-editor helper: {token}')
require("import * as activeEditor from './activeEditor.js'" in dispatch_runtime, 'editor dispatch runtime imports activeEditor namespace')
require("import { looksLikeView } from './activeEditor.js'" in dispatch_runtime, 'editor dispatch runtime imports looksLikeView from activeEditor')

require('src/editor/activeEditor.js' not in allowed, 'active editor module removed from unwired allowlist')

for removed in [
    'function activeEditorReadoutString(value, limit = NOSTRODOMUS_CONTEXT_ACTIVE_EDITOR_MAX_TEXT)',
    'function activeEditorReadoutVisible(el)',
    'function activeEditorReadoutLooksLikeView(view)',
    'function activeEditorReadoutDeepActivePath()',
    'function activeEditorReadoutNodeViewCandidates(node)',
    'function activeEditorReadoutWalkRoots(startRoot, visit)',
    'function activeEditorReadoutFindView()',
    'function activeEditorReadoutLinePosition(doc, pos)',
    'function activeEditorReadoutRedactSnapshot(snapshotResult, cursor)',
    'function createActiveEditorContextSnapshotReadout()',
    'function visible(el)',
    'function closestFromPath(path, selector)',
    'function composedContains(host, node)',
    'function homeRoot()',
    'function activeEditDialog()',
    'function pathHasEditorSurface(path)',
    'function pathInsideActiveDialog(path)',
    'function isScopedEditorEvent(ev)',
    'function looksLikeView(v)',
    'function activeEditorReadoutPerfMode()',
    'function activeEditorReadoutTraversalScopedEnabled()',
    'function recordActiveEditorReadoutTraversal(summary = {})',
]:
    require(removed not in app, f'app.js has no active-editor pass-through wrapper: {removed}')

for token in [
    'export function visible',
    'export function activeEditorReadoutString',
    'export function activeEditorReadoutVisible',
    'export function createActiveEditorContextSnapshotReadout',
    'export function activeEditorReadoutLooksLikeView',
    'export function activeEditorReadoutLinePosition',
    'export function closestFromPath',
    'export function composedContains',
    'export function homeRoot',
    'export function activeEditDialog',
    'export function pathHasEditorSurface',
    'export function pathInsideActiveDialog',
    'export function isScopedEditorEvent',
    'export function looksLikeView',
    'export function activeEditorReadoutTraversalScopedEnabled',
    'export function recordActiveEditorReadoutTraversal',
]:
    require(token in module, f'module export present: {token}')

# editorDispatchRuntime owns the remembered view and the dispatch hook.
require("from './editor/editorDispatchRuntime.js'" in app, 'main imports editor dispatch runtime owner')
for token in [
    'export function createEditorDispatchRuntime',
    'function isNostrodomusUiEvent(ev)',
    'function isViewAllowed(view = state.view)',
    'function viewFromEvent(ev)',
    'function rememberView(ev)',
    'activeEditor.rememberView(ev, {',
    'hookDispatch(view);',
]:
    require(token in dispatch_runtime, f'editor dispatch runtime owns editor lifecycle token: {token}')
# app.js gets isNostrodomusUiEvent and rememberView from
# createEditorDispatchRuntimeDelegates, which calls the live dispatch runtime and returns false
# until it exists. Both names must come from that one destructuring statement.
require('createEditorDispatchRuntimeDelegates(() => editorDispatchRuntime)' in app, 'main wires the editor dispatch delegates over the dispatch runtime')
editor_dispatch_delegate_destructure = next(
    (line for line in app.splitlines() if '= editorDispatchDelegates;' in line),
    '',
)
for token in [
    'isNostrodomusUiEvent',
    'rememberView',
]:
    require(token in editor_dispatch_delegate_destructure, f'main destructures the editor dispatch delegate: {token}')

for forbidden in [
    'showPopover',
    'hidePopover',
    ':popover-open',
    'setAttribute("popover"',
    "setAttribute('popover'",
    'elementFromPoint',
    'fetch(',
    'sendBeacon',
    'eval(',
    'new Function',
]:
    require(forbidden not in module, f'forbidden active-editor token absent: {forbidden}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Active editor module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('ACTIVE EDITOR MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('ACTIVE EDITOR MODULE WIRING STATIC TEST OK')
for note in notes:
    print('-', note)
print('Report:', REPORT)
