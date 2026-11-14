#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/editor/overlayRoot.js'
LEGACY = ROOT / 'src/main.legacy.js'
POPUP_RUNTIME = ROOT / 'src/completion/popupRuntime.js'
# Decomposition: the overlay-root delegation helpers (formerly inlined in
# main.legacy.js as *FromOverlayRootModule wrappers) were extracted into the
# settings/completion portal runtime owner, which namespace-imports the overlay
# module (`import * as overlayRoots from '../editor/overlayRoot.js'`) and calls
# its exports through overlayRoots.<fn>(overlayRootOptions()). Same delegation
# invariant, current home.
PORTAL_RUNTIME = ROOT / 'src/ui/settingsPortalRuntime.js'
# Decomposition: the popup lifecycle delegates (removeOverlay/ensureOverlay/
# placeAtCursor) moved out of main.legacy.js into the completion popup adapter
# factory, and render()/renderCompletionPopup(state ...) into the completion
# runtime owner. The selector literal `.cm-content, .cm-editor, .cm-scroller`
# (CM_ROOT_CANDIDATES) the overlay module targets now lives in the shared
# haSelectors.js the module imports.
POPUP_ADAPTERS = ROOT / 'src/composition/mainLegacyAdapters.js'
COMPLETION_RUNTIME = ROOT / 'src/completion/completionRuntime.js'
HA_SELECTORS = ROOT / 'src/editor/haSelectors.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
REPORT = ROOT / 'reports/OVERLAY_ROOT_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
legacy = LEGACY.read_text(encoding='utf-8', errors='replace')
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

require("from './editor/overlayRoot.js'" in legacy, 'runtime imports overlay-root module')
# The portal runtime owns the delegation now and namespace-imports the overlay module.
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
    # The overlay module is still wired with a getComputedStyleRef dependency; the
    # injected binding form is `getComputedStyleRef: W.getComputedStyle...` and the
    # module consumes it via `options?.getComputedStyleRef`.
    'getComputedStyleRef: W.getComputedStyle',
    'recordRuntimeErrorOnce',
    'editor:walk-open-root-callback',
    'editor:walk-open-root-query',
    'editor:active-root-query',
    'editor:overlay-host-query',
]:
    require(token in legacy or token in module, f'overlay diagnostics/dependency token preserved: {token}')

require('src/editor/overlayRoot.js' not in allowed, 'overlay root module removed from unwired allowlist')

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

# The contracted CodeMirror surface the overlay module targets when selecting the
# active editor root: the literal `.cm-content, .cm-editor, .cm-scroller` selector
# is now the shared CM_ROOT_CANDIDATES constant in haSelectors.js, which the module
# imports and queries with. Same invariant (active-root selection over the CM
# surface), current location.
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
    require(token in popup_runtime, f'completion popup runtime lifecycle token preserved: {token}')

# Decomposition: the popup lifecycle delegates moved out of main.legacy.js. The
# overlay open/close/placement wrappers live in the completion popup adapter
# factory (createMainLegacyCompletionPopupAdapters), and render() + the
# renderCompletionPopup(state ...) delegation live in the completion runtime owner.
# main.legacy.js still wires both groups in (asserted just below).
for token in [
    'function removeOverlay()',
    'function ensureOverlay()',
    'function placeAtCursor()',
]:
    require(token in popup_adapters, f'popup-adapter delegate token preserved: {token}')
for token in [
    'function render()',
    'renderCompletionPopup(state',
]:
    require(token in completion_runtime, f'completion-runtime popup delegate token preserved: {token}')
# main.legacy.js still wires the extracted popup delegates into the runtime.
require('createMainLegacyCompletionPopupAdapters({' in legacy, 'runtime wires the completion popup adapter factory')
require('removeOverlay, ensureOverlay, isOpen, close, placeAtCursor, getDocLength } = completionPopupAdapters' in legacy, 'runtime destructures the popup lifecycle delegates')

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
