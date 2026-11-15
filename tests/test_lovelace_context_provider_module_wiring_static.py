#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/providers/lovelaceContextProvider.js'
# providerRuntime.js imports the Lovelace module, builds its dependencies and delegates each
# helper; staticLibraryProvider.js registers the provider in buildIndex.
RUNTIME = ROOT / 'src/providers/providerRuntime.js'
INDEX_WIRING = ROOT / 'src/providers/staticLibraryProvider.js'
APP = ROOT / 'src/app.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
DIST = ROOT / 'dist/nostrodomus.js'
REPORT = ROOT / 'reports/LOVELACE_CONTEXT_PROVIDER_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
runtime = RUNTIME.read_text(encoding='utf-8', errors='replace')
index_wiring = INDEX_WIRING.read_text(encoding='utf-8', errors='replace')
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

require("import * as lovelace from './lovelaceContextProvider.js'" in runtime, 'runtime imports Lovelace context provider module')

for token in [
    'lovelace.contextRow(id, type, label, insert, aliases, meta, lovelaceContextProviderDeps())',
    'lovelace.rowSet(rows, lovelaceContextProviderDeps())',
    'lovelace.yamlPathText(ctx)',
    'lovelace.recentYamlText(ctx, lovelaceContextProviderDeps())',
    'lovelace.looksLikeButtonCardContext(ctx, lovelaceContextProviderDeps())',
    'lovelace.lovelaceContextRows(ctx, lovelaceContextProviderDeps())',
    'lovelace.lovelaceContextProvider(lovelaceContextProviderDeps())',
]:
    require(token in runtime, f'runtime delegates Lovelace context helper: {token}')

for token in [
    'function lovelaceContextProviderDeps()',
    'normalizeItem',
    'providerId: LOVELACE_CONTEXT_PROVIDER_ID',
    'yamlBranchState',
]:
    require(token in runtime, f'runtime owns dependency/provider token: {token}')

# The provider runtime passes its lovelaceContextProvider factory to buildIndex, which registers
# it as createLovelaceProvider.
require('lovelaceContextProvider,' in runtime, 'runtime hands Lovelace provider factory into buildIndex wiring')
require('registerProvider(createLovelaceProvider())' in index_wiring, 'buildIndex registers the Lovelace context provider')

for token in [
    'import { LOVELACE_CONTEXT_PROVIDER_ID }',
    'import { normalizeItem }',
    'export function contextRow',
    'export function rowSet',
    'export function yamlPathText',
    'export function recentYamlText',
    'export function looksLikeButtonCardContext',
    'export function lovelaceContextRows',
    'export function lovelaceContextProvider',
    'const toRows = rows => rowSet(rows, options);',
    'typeof options.yamlBranchState === "function"',
    'providerId = options.providerId || LOVELACE_CONTEXT_PROVIDER_ID',
]:
    require(token in module, f'module Lovelace context invariant present: {token}')

require('src/providers/lovelaceContextProvider.js' not in allowed, 'Lovelace context provider is not on the unwired allowlist')

for token in [
    'const rootYaml = [',
    'const commonCard = [',
    'const actionBlock = [',
    'const triggerBlock = [',
    'const buttonCard = [',
    'const stylesBlock = [',
]:
    require(token not in app, f'app.js has no Lovelace row table: {token}')

for token in [
    'function lovelaceContextRows(ctx',
    'function lovelaceContextProvider(options',
    'custom:button-card',
    'automation-action',
    'perform_action:',
    'wait_for_trigger:',
    'visibility:',
]:
    require(token in dist, f'bundled dist contains Lovelace context provider token: {token}')

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
    'localStorage',
    'document.',
    'window.',
]:
    require(forbidden not in module, f'forbidden Lovelace context provider token absent: {forbidden}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Lovelace context provider module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('LOVELACE CONTEXT PROVIDER MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('LOVELACE CONTEXT PROVIDER MODULE WIRING STATIC TEST OK')
for note in notes:
    print('-', note)
print('Report:', REPORT)
