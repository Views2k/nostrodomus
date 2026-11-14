#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/editor/activeEditor.js'
LEGACY = ROOT / 'src/main.legacy.js'
CONTEXT_RUNTIME = ROOT / 'src/diagnostics/contextDiagnosticsRuntime.js'
DISPATCH_RUNTIME = ROOT / 'src/editor/editorDispatchRuntime.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
REPORT = ROOT / 'reports/ACTIVE_EDITOR_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
legacy = LEGACY.read_text(encoding='utf-8', errors='replace')
context_runtime = CONTEXT_RUNTIME.read_text(encoding='utf-8', errors='replace')
dispatch_runtime = DISPATCH_RUNTIME.read_text(encoding='utf-8', errors='replace')
runtime_owner = legacy + '\n' + context_runtime + '\n' + dispatch_runtime
allowlist = json.loads(ALLOWLIST.read_text(encoding='utf-8'))
allowed = allowlist.get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("from './editor/activeEditor.js'" in legacy, 'runtime imports active editor module')
# The activeEditor helpers are now wired into the runtime via direct named imports (not the
# old *FromActiveEditorModule aliases): the snapshot readout + traversal callbacks moved into
# src/diagnostics/contextDiagnosticsRuntime.js, while homeRoot/activeEditDialog/isScopedEditorEvent
# are called by name from main.legacy.js. Same delegation invariant, current call form.
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

# editorDispatchRuntime delegates the scope/view helpers to the activeEditor module via a
# namespace import (activeEditor.*) plus a direct named import for looksLikeView. Same delegation
# invariant — the dispatch runtime owns no copy of these helpers, it calls activeEditor's.
for token in [
    'activeEditor.isNostrodomusUiEvent(ev, { state })',
    'activeEditor.isViewAllowed(view, { state, window: windowRef })',
    'activeEditor.viewFromEvent(ev, { state, window: windowRef })',
    'activeEditor.rememberView(ev, {',
    'looksLikeView(view)',
]:
    require(token in dispatch_runtime, f'editor dispatch runtime delegates active-editor helper: {token}')
# Confirm the delegation targets are real imports from the activeEditor module (not local copies).
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
    require(removed not in legacy, f'runtime prunes active-editor pass-through wrapper: {removed}')

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

# Stateful view memory and dispatch-hook ownership moved into editorDispatchRuntime.
require("from './editor/editorDispatchRuntime.js'" in legacy, 'main imports editor dispatch runtime owner')
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
# Main keeps thin editor-dispatch delegates, now produced by the shared delegate bridge
# (createEditorDispatchRuntimeDelegates over () => editorDispatchRuntime) instead of hand-written
# `editorDispatchRuntime?.X(...) || false` wrappers. The bridge proxies to the live runtime and
# returns the false fallback when it is not yet ready (same lazy/fail-dark semantics), and main
# destructures isNostrodomusUiEvent/rememberView from it. Assert that current wiring.
require('createEditorDispatchRuntimeDelegates(() => editorDispatchRuntime)' in legacy, 'main wires the editor dispatch delegate bridge over the dispatch runtime')
# The bridge-produced delegates are destructured off editorDispatchDelegates; require both the
# isNostrodomusUiEvent and rememberView delegates plus the destructure source on one statement so the
# thin pass-through (proxy to runtime, false fallback) is provably what main exposes.
editor_dispatch_delegate_destructure = next(
    (line for line in legacy.splitlines() if '= editorDispatchDelegates;' in line),
    '',
)
for token in [
    'isNostrodomusUiEvent',
    'rememberView',
]:
    require(token in editor_dispatch_delegate_destructure, f'main keeps thin editor dispatch delegate via the bridge: {token}')

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
