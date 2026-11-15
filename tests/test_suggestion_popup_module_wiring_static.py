#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/ui/suggestionPopup.js'
APP = ROOT / 'src/app.js'
# popupRuntime.js builds, places and renders the popup; createAppCompletionPopupAdapters in
# appAdapters.js holds the ensureOverlay and placeAtCursor wrappers.
POPUP_RUNTIME = ROOT / 'src/completion/popupRuntime.js'
ADAPTERS = ROOT / 'src/composition/appAdapters.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
DIST = ROOT / 'dist/nostrodomus.js'
REPORT = ROOT / 'reports/SUGGESTION_POPUP_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
app = APP.read_text(encoding='utf-8', errors='replace')
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

require("from './ui/suggestionPopup.js'" in app, 'runtime imports suggestion popup module')
require("from '../ui/suggestionPopup.js'" in popup_runtime, 'popup runtime imports suggestion popup module')

# The runtime takes every popup presentation decision from these helpers and never
# reimplements them. Each entry names a call or import that shows where a helper is used.
for helper, (token, source) in {
    # Leaf helpers called inside the module by completionDetailModel, itemDetail and
    # itemDocumentation, which the runtime calls.
    'itemKindLabel': ('itemKindLabel(item)', module),
    'shortItemMeta': ('shortItemMeta(item)', module),
    # Imported and called by app.js.
    'itemSourceLabel': ('itemSourceLabel,', app),
    'itemDetail': ('itemDetail,', app),
    'itemDocumentation': ('itemDocumentation,', app),
    # Imported and called by the popup render in popupRuntime.js.
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

require('src/ui/suggestionPopup.js' not in allowed, 'suggestion popup is not on the unwired allowlist')

# Who owns the popup: the popup runtime imports iconFor and completionAccent, app.js
# imports itemDocumentation, and popupRuntime.js and appAdapters.js own render, overlay,
# placement and the row mousedown.
for token, source, where in [
    ('  iconFor,', popup_runtime, 'popup runtime imports iconFor from module'),
    ('  completionAccent,', popup_runtime, 'popup runtime imports completionAccent from module'),
    ('  itemDocumentation,', app, 'app.js imports itemDocumentation from module'),
    ('export function renderCompletionPopup(state, deps = {}) {', popup_runtime, 'popup runtime owns render'),
    ('function ensureOverlay() {', adapters, 'adapters own ensureOverlay wrapper'),
    ('function placeAtCursor() {', adapters, 'adapters own placeAtCursor wrapper'),
    ('export function ensureCompletionOverlay(state, deps = {}) {', popup_runtime, 'popup runtime owns ensureCompletionOverlay'),
    ('export function placeCompletionPopupAtCursor(state, deps = {}) {', popup_runtime, 'popup runtime owns placeCompletionPopupAtCursor'),
    ("row.addEventListener('mousedown'", popup_runtime, 'popup runtime wires row mousedown'),
]:
    require(token in source, f'runtime popup ownership/delegation token present: {where}')

for local_copy in [
    'const map = {\n      key: "Key",',
    'const palette = {\n      snippet: { fg:',
    'if (item.source === HA_VALUE_PROVIDER_ID && item.type === "entity") {\n      return item?.meta?.friendly || shortItemMeta(item);',
]:
    require(local_copy not in app, f'app.js does not own popup helper body token: {local_copy[:45]}')

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
