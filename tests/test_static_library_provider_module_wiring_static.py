#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/providers/staticLibraryProvider.js'
RUNTIME = ROOT / 'src/providers/providerRuntime.js'
APP = ROOT / 'src/app.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
DIST = ROOT / 'dist/nostrodomus.js'
REPORT = ROOT / 'reports/STATIC_LIBRARY_PROVIDER_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
runtime = RUNTIME.read_text(encoding='utf-8', errors='replace')
app = APP.read_text(encoding='utf-8', errors='replace')
dist = DIST.read_text(encoding='utf-8', errors='replace') if DIST.exists() else ''
allowed = json.loads(ALLOWLIST.read_text(encoding='utf-8')).get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("from './providers/staticLibraryProvider.js'" not in app, 'app.js does not import the static library provider itself')
require("from './providers/providerRuntime.js'" in app, 'app.js imports provider runtime owner')
require("from './staticLibraryProvider.js'" in runtime, 'provider runtime imports static library provider module')
# The provider runtime calls the static library provider through the staticLibrary namespace.
for token in [
    'staticLibrary.sanitizeLibraryRow(raw, source, { limits })',
    'staticLibrary.normalizeItem(raw, source, { limits })',
    'staticLibrary.staticLibraryProvider({ state, providerId: STATIC_PROVIDER_ID })',
    'staticLibrary.loadLibrary({ state, buildIndex })',
    'staticLibrary.buildIndex({',
    'logIndexed,',
]:
    require(token in runtime, f'provider runtime delegates static provider/index helper: {token}')

# app.js destructures the static provider helpers from delegates over providerRuntime.
require('createProviderRuntimeDelegates(() => providerRuntime)' in app,
        'app.js builds static provider delegates from providerRuntime')
require('} = providerDelegates;' in app,
        'app.js destructures the provider delegates')
for helper in ['sanitizeLibraryRow', 'normalizeItem', 'staticLibraryProvider', 'loadLibrary', 'buildIndex']:
    # The destructured helper names live on the single `const { ... } = providerDelegates;` line.
    destructure_line = next((line for line in app.splitlines() if line.strip().endswith('= providerDelegates;')), '')
    require(helper in destructure_line, f'app.js destructures static provider delegate: {helper}')

for token in [
    'const BUILTIN_NOSTRODOMUS_LIBRARY_CORE_V1',
    'const BUILTIN_NOSTRODOMUS_LIBRARY_WEBDEV_V1',
    'for (const [lang, rowsRaw] of Object.entries(packs))',
    'state.index = { byLang, all, rejected };',
]:
    require(token not in app, f'app.js does not own bundled library/index lifecycle token: {token}')

for token in [
    'import { SECURITY_LIMITS, STATIC_PROVIDER_ID }',
    'export const BUILTIN_NOSTRODOMUS_LIBRARY_CORE_V1',
    'export const BUILTIN_NOSTRODOMUS_LIBRARY_WEBDEV_V1',
    'export async function loadLibrary',
    'export function sanitizeLibraryRow',
    'export function normalizeItem',
    'export function staticLibraryProvider',
    'export function cacheSet',
    'export function clearCompletionCache',
    'export function buildIndex',
    'runtimeState?.settings?.globalSearch',
    'runtimeState?.index?.byLang?.[ctx.lang]',
]:
    require(token in module, f'module export/provider invariant present: {token}')

require('src/providers/staticLibraryProvider.js' not in allowed, 'static library provider is not on the unwired allowlist')

for token in [
    'function staticLibraryProvider() {\n    return {',
    'function normalizeItem(raw, source = "library") {\n    const safe = sanitizeLibraryRow(raw, source);',
]:
    require(token not in app, f'app.js does not own static provider implementation token: {token[:80]}')

# dist has no spaces after commas or around `=`.
for token in [
    'function staticLibraryProvider(options',
    'function normalizeItem(raw,source',
    'function sanitizeLibraryRow(raw,source',
    'static-library',
]:
    require(token in dist, f'bundled dist contains static provider module token: {token}')

for forbidden in [
    'showPopover', 'hidePopover', ':popover-open', 'setAttribute("popover"', "setAttribute('popover'",
    'onOverlayPointerCapture', 'elementFromPoint', 'fetch(', 'sendBeacon', 'eval(', 'new Function', 'document.', 'window.',
]:
    require(forbidden not in module, f'forbidden static provider token absent: {forbidden}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Static library provider module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('STATIC LIBRARY PROVIDER MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('STATIC LIBRARY PROVIDER MODULE WIRING STATIC TEST OK')
for note in notes:
    print('-', note)
print('Report:', REPORT)
