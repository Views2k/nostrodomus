#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/ui/suggestionPopup.js'
LEGACY = ROOT / 'src/main.legacy.js'
# The popup DOM construction / event wiring / placement / render ownership that used to live
# inline in main.legacy.js was extracted into src/completion/popupRuntime.js, and the
# legacy-facing overlay/placement wrapper functions (ensureOverlay/placeAtCursor) now live in
# src/composition/mainLegacyAdapters.js (createMainLegacyCompletionPopupAdapters). Same invariants,
# current locations.
POPUP_RUNTIME = ROOT / 'src/completion/popupRuntime.js'
ADAPTERS = ROOT / 'src/composition/mainLegacyAdapters.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
DIST = ROOT / 'dist/nostrodomus.js'
REPORT = ROOT / 'reports/SUGGESTION_POPUP_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
legacy = LEGACY.read_text(encoding='utf-8', errors='replace')
popup_runtime = POPUP_RUNTIME.read_text(encoding='utf-8', errors='replace')
adapters = ADAPTERS.read_text(encoding='utf-8', errors='replace')
dist = DIST.read_text(encoding='utf-8', errors='replace') if DIST.exists() else ''
allowed = json.loads(ALLOWLIST.read_text(encoding='utf-8')).get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("from './ui/suggestionPopup.js'" in legacy, 'runtime imports suggestion popup module')
require("from '../ui/suggestionPopup.js'" in popup_runtime, 'popup runtime imports suggestion popup module')

# The runtime no longer wraps each helper in a `<name>FromSuggestionPopupModule(...)` delegate
# bridge in main.legacy.js. The delegate-bridge wrapper pattern was retired when the popup
# render/DOM ownership was extracted into src/completion/popupRuntime.js, which now imports the
# pure helpers DIRECTLY by name and calls them. The invariant is unchanged: the runtime delegates
# every popup-presentation decision to these module helpers (never reimplements them). Re-pointed
# below to the helper's genuine current consumer (legacy import/call, popup-runtime import/call, or
# the higher-level module helper that the runtime calls — which itself calls the leaf helper).
# helper -> a (text, source-name) pair proving the runtime consumes that exact helper today.
for helper, (token, source) in {
    # itemKindLabel/shortItemMeta are leaf helpers consumed by completionDetailModel/itemDetail/
    # itemDocumentation (all of which the runtime calls), so they ride those calls inside the module.
    'itemKindLabel': ('itemKindLabel(item)', module),
    'shortItemMeta': ('shortItemMeta(item)', module),
    # itemSourceLabel/itemDetail/itemDocumentation are imported and called directly in legacy.
    'itemSourceLabel': ('itemSourceLabel,', legacy),
    'itemDetail': ('itemDetail,', legacy),
    'itemDocumentation': ('itemDocumentation,', legacy),
    # iconFor/completionVisualKind/completionPillLabel/completionAccent are imported and called by
    # the popup render in src/completion/popupRuntime.js.
    'iconFor': ('iconFor(item)', popup_runtime),
    'completionVisualKind': ('completionVisualKind(item)', popup_runtime),
    'completionPillLabel': ('completionPillLabel(item)', popup_runtime),
    'completionAccent': ('completionAccent(item, selected)', popup_runtime),
}.items():
    require(token in source, f'runtime delegates suggestion popup helper: {helper}')

for token in [
    'export function itemKindLabel',
    'export function itemSourceLabel',
    'export function shortItemMeta',
    'export function itemDetail',
    'export function itemDocumentation',
    'export function iconFor',
    'export function completionVisualKind',
    'export function completionPillLabel',
    'export function completionAccent',
    "from '../core/runtimeConstants.js'",
]:
    require(token in module, f'module suggestion popup invariant present: {token}')

require('src/ui/suggestionPopup.js' not in allowed, 'suggestion popup removed from unwired allowlist')

# Popup ownership/delegation, re-pointed to current owners. The old delegate-bridge wrappers
# (`function iconFor(item) { return iconForFromSuggestionPopupModule(item); }` etc.) were retired
# with the bridge pattern: the popup runtime now imports iconFor/completionAccent from the module
# (does NOT reimplement them), itemDocumentation is imported+used by legacy from the module, and
# the render/overlay/place/mousedown ownership moved into popupRuntime.js + mainLegacyAdapters.js.
for token, source, where in [
    # iconFor + completionAccent are delegated to the module (imported, not reimplemented) by the popup runtime.
    ('  iconFor,', popup_runtime, 'popup runtime imports iconFor from module'),
    ('  completionAccent,', popup_runtime, 'popup runtime imports completionAccent from module'),
    # itemDocumentation is delegated to the module (imported, not reimplemented) by legacy.
    ('  itemDocumentation,', legacy, 'legacy imports itemDocumentation from module'),
    # render() ownership -> renderCompletionPopup in the popup runtime module.
    ('export function renderCompletionPopup(state, deps = {}) {', popup_runtime, 'popup runtime owns render'),
    # ensureOverlay() / placeAtCursor() wrapper functions -> mainLegacyAdapters (legacy-facing factory).
    ('function ensureOverlay() {', adapters, 'adapters own ensureOverlay wrapper'),
    ('function placeAtCursor() {', adapters, 'adapters own placeAtCursor wrapper'),
    # ...backed by the popup runtime's overlay/placement owners.
    ('export function ensureCompletionOverlay(state, deps = {}) {', popup_runtime, 'popup runtime owns ensureCompletionOverlay'),
    ('export function placeCompletionPopupAtCursor(state, deps = {}) {', popup_runtime, 'popup runtime owns placeCompletionPopupAtCursor'),
    # row mousedown -> single-quote source form now lives in the popup runtime render.
    ("row.addEventListener('mousedown'", popup_runtime, 'popup runtime wires row mousedown'),
]:
    require(token in source, f'runtime popup ownership/delegation token preserved: {where}')

for old_inline in [
    'const map = {\n      key: "Key",',
    'const palette = {\n      snippet: { fg:',
    'if (item.source === HA_VALUE_PROVIDER_ID && item.type === "entity") {\n      return item?.meta?.friendly || shortItemMeta(item);',
]:
    require(old_inline not in legacy, f'legacy no longer owns old popup helper body token: {old_inline[:45]}')

for token in [
    'function itemDocumentation',
    'function completionAccent',
    'Home Assistant service:',
    'Snippet completion. Accepting inserts a larger block of text.',
    'rgba(95,220,255,.80)',
]:
    require(token in dist, f'bundled dist contains suggestion popup token: {token}')

for forbidden in [
    'document.',
    'window.',
    'addEventListener',
    'removeEventListener',
    'querySelector',
    'createElement',
    'showPopover',
    'hidePopover',
    ':popover-open',
    'localStorage',
    'fetch(',
    'sendBeacon',
    'eval(',
    'new Function',
]:
    require(forbidden not in module, f'forbidden suggestion popup module token absent: {forbidden}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Suggestion popup module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('SUGGESTION POPUP MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('SUGGESTION POPUP MODULE WIRING STATIC TEST OK')
for note in notes:
    print('-', note)
print('Report:', REPORT)
