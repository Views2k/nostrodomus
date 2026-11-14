#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/providers/staticLibraryProvider.js'
RUNTIME = ROOT / 'src/providers/providerRuntime.js'
LEGACY = ROOT / 'src/main.legacy.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
DIST = ROOT / 'dist/nostrodomus.js'
REPORT = ROOT / 'reports/STATIC_LIBRARY_PROVIDER_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
runtime = RUNTIME.read_text(encoding='utf-8', errors='replace')
legacy = LEGACY.read_text(encoding='utf-8', errors='replace')
dist = DIST.read_text(encoding='utf-8', errors='replace') if DIST.exists() else ''
allowed = json.loads(ALLOWLIST.read_text(encoding='utf-8')).get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("from './providers/staticLibraryProvider.js'" not in legacy, 'legacy runtime no longer imports static library provider directly')
require("from './providers/providerRuntime.js'" in legacy, 'legacy runtime imports provider runtime owner')
require("from './staticLibraryProvider.js'" in runtime, 'provider runtime imports static library provider module')
# The monolith was decomposed: provider runtime now imports the static library provider
# as a namespace (`import * as staticLibrary from './staticLibraryProvider.js'`) and
# delegates via `staticLibrary.<helper>(...)` calls instead of the old per-symbol
# *_FromStaticLibraryProviderModule renamed imports. Same delegation invariant, current form.
for token in [
    'staticLibrary.sanitizeLibraryRow(raw, source, { limits })',
    'staticLibrary.normalizeItem(raw, source, { limits })',
    'staticLibrary.staticLibraryProvider({ state, providerId: STATIC_PROVIDER_ID })',
    'staticLibrary.loadLibrary({ state, buildIndex })',
    'staticLibrary.buildIndex({',
    'logIndexed,',
]:
    require(token in runtime, f'provider runtime delegates static provider/index helper: {token}')

# Legacy still keeps thin static-provider delegates that route through providerRuntime, but
# they are no longer hand-written per-symbol pass-throughs. The decomposition moved them into
# the shared delegate bridge: legacy builds `createProviderRuntimeDelegates(() => providerRuntime)`
# and destructures each helper from it. Assert the bridge wiring plus each delegated helper name.
require('createProviderRuntimeDelegates(() => providerRuntime)' in legacy,
        'legacy builds static provider delegates from providerRuntime via the delegate bridge')
require('} = providerDelegates;' in legacy,
        'legacy destructures the provider delegates bridge for thin pass-through helpers')
for helper in ['sanitizeLibraryRow', 'normalizeItem', 'staticLibraryProvider', 'loadLibrary', 'buildIndex']:
    # The destructured helper names live on the single `const { ... } = providerDelegates;` line.
    destructure_line = next((line for line in legacy.splitlines() if line.strip().endswith('= providerDelegates;')), '')
    require(helper in destructure_line, f'legacy keeps thin static provider delegate via bridge: {helper}')

for token in [
    'const BUILTIN_NOSTRODOMUS_LIBRARY_CORE_V1',
    'const BUILTIN_NOSTRODOMUS_LIBRARY_WEBDEV_V1',
    'for (const [lang, rowsRaw] of Object.entries(packs))',
    'state.index = { byLang, all, rejected };',
]:
    require(token not in legacy, f'legacy no longer owns bundled library/index lifecycle token: {token}')

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

require('src/providers/staticLibraryProvider.js' not in allowed, 'static library provider removed from unwired allowlist')

for token in [
    'function staticLibraryProvider() {\n    return {',
    'function normalizeItem(raw, source = "library") {\n    const safe = sanitizeLibraryRow(raw, source);',
]:
    require(token not in legacy, f'legacy no longer owns old static provider implementation token: {token[:80]}')

# Dist is minified (no spaces after commas / around `=`), so match the minified function
# signatures of the static provider module helpers (source `(raw, source = ...)` -> `(raw,source=...)`).
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
