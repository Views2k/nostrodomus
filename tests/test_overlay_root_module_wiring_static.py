#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/editor/overlayRoot.js'
APP = ROOT / 'src/app.js'
POPUP_RUNTIME = ROOT / 'src/completion/popupRuntime.js'
# Calls the overlay-root module through overlayRoots.<fn>(overlayRootOptions()).
PORTAL_RUNTIME = ROOT / 'src/ui/settingsPortalRuntime.js'
# The popup lifecycle delegates (removeOverlay, ensureOverlay, placeAtCursor) live in the
# completion popup adapters, render() in the completion runtime, and CM_ROOT_CANDIDATES in
# haSelectors.js.
POPUP_ADAPTERS = ROOT / 'src/composition/appAdapters.js'
COMPLETION_RUNTIME = ROOT / 'src/completion/completionRuntime.js'
HA_SELECTORS = ROOT / 'src/editor/haSelectors.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
REPORT = ROOT / 'reports/OVERLAY_ROOT_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
app = APP.read_text(encoding='utf-8', errors='replace')
popup_runtime = POPUP_RUNTIME.read_text(encoding='utf-8', errors='replace')
portal_runtime = PORTAL_RUNTIME.read_text(encoding='utf-8', errors='replace')
popup_adapters = POPUP_ADAPTERS.read_text(encoding='utf-8', errors='replace')
completion_runtime = COMPLETION_RUNTIME.read_text(encoding='utf-8', errors='replace')
ha_selectors = HA_SELECTORS.read_text(encoding='utf-8', errors='replace')
allowlist = json.loads(ALLOWLIST.read_text(encoding='utf-8'))
allowed = allowlist.get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("from './editor/overlayRoot.js'" in app, 'runtime imports overlay-root module')
require("import * as overlayRoots from '../editor/overlayRoot.js'" in portal_runtime, 'portal runtime imports overlay-root module')
for token in [
    'overlayRoots.nostrodomusWalkOpenRoots(root, fn, seen, overlayRootOptions())',
    'overlayRoots.nostrodomusFindActiveCodeEditorRoot(overlayRootOptions())',
    'overlayRoots.nostrodomusCodeEditorOverlayRoot(overlayRootOptions())',
    'overlayRoots.overlayRoot(overlayRootOptions())',
]:
    require(token in portal_runtime, f'runtime delegates helper: {token}')

for token in [
    'documentRef: document',
    'getComputedStyleRef: W.getComputedStyle',
    'recordRuntimeErrorOnce',
    'editor:walk-open-root-callback',
    'editor:walk-open-root-query',
    'editor:active-root-query',
    'editor:overlay-host-query',
]:
    require(token in app or token in module, f'overlay diagnostics/dependency token present: {token}')

require('src/editor/overlayRoot.js' not in allowed, 'overlay root module is not on the unwired allowlist')

for token in [
    'export function nostrodomusWalkOpenRoots',
    'export function nostrodomusFindActiveCodeEditorRoot',
    'export function nostrodomusCodeEditorOverlayRoot',
    'export function overlayRoot',
    'documentRef',
    'getComputedStyleRef',
    'recordRuntimeErrorOnce',
    'nostrodomus-cm-root-overlay-host',
    'cm-root-completions-overlay',
]:
    require(token in module, f'module export/invariant present: {token}')

# The overlay module picks the active editor root among the CodeMirror panes in CM_ROOT_CANDIDATES.
require('CM_ROOT_CANDIDATES' in module, 'module targets the contracted CodeMirror surface (CM_ROOT_CANDIDATES)')
require('CM_ROOT_CANDIDATES = ".cm-content, .cm-editor, .cm-scroller"' in ha_selectors, 'CM_ROOT_CANDIDATES keeps the .cm-content, .cm-editor, .cm-scroller surface')

# Popup rendering, placement, and pointer capture are owned by completion/popupRuntime.js.
for token in [
    'export function removeCompletionOverlay',
    'export function ensureCompletionOverlay',
    'export function placeCompletionPopupAtCursor',
    'export function renderCompletionPopup',
    'function popupHeader(documentRef, ctx, openSettings, flex = false)',
    'box.style.cssText = [',
    'root.appendChild(box);',
]:
    require(token in popup_runtime, f'completion popup runtime lifecycle token present: {token}')

for token in [
    'function removeOverlay()',
    'function ensureOverlay()',
    'function placeAtCursor()',
]:
    require(token in popup_adapters, f'popup-adapter delegate token present: {token}')
for token in [
    'function render()',
    'renderCompletionPopup(state',
]:
    require(token in completion_runtime, f'completion-runtime popup delegate token present: {token}')
require('createAppCompletionPopupAdapters({' in app, 'runtime wires the completion popup adapter factory')
require('removeOverlay, ensureOverlay, isOpen, close, placeAtCursor, getDocLength } = completionPopupAdapters' in app, 'runtime destructures the popup lifecycle delegates')

for forbidden in [
    'showPopover',
    'hidePopover',
    ':popover-open',
    'setAttribute("popover"',
    "setAttribute('popover'",
    'onOverlayPointerCapture',
    'elementFromPoint',
    'fetch(',
    'sendBeacon',
    'eval(',
    'new Function',
]:
    require(forbidden not in module, f'forbidden overlay-root token absent: {forbidden}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Overlay root module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('OVERLAY ROOT MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('OVERLAY ROOT MODULE WIRING STATIC TEST OK')
for note in notes:
    print('-', note)
print('Report:', REPORT)
