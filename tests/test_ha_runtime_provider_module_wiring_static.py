#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/providers/haRuntimeProvider.js'
RUNTIME = ROOT / 'src/providers/providerRuntime.js'
LEGACY = ROOT / 'src/main.legacy.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
DIST = ROOT / 'dist/nostrodomus.js'
REPORT = ROOT / 'reports/HA_RUNTIME_PROVIDER_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
classifier = (ROOT / 'src' / 'yaml' / 'yamlContextClassifier.js').read_text(encoding='utf-8', errors='replace')
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

require("from './providers/haRuntimeProvider.js'" not in legacy, 'legacy runtime no longer imports HA runtime provider directly')
require("from './providers/providerRuntime.js'" in legacy, 'legacy runtime imports provider runtime owner')
require("from './haRuntimeProvider.js'" in runtime, 'provider runtime imports HA runtime provider module')

# Provider runtime sources its HA helpers/providers from the HA runtime provider MODULE.
# The intermediate "...FromHaRuntimeProviderModule" rename-imports were folded away: the
# 10 pure YAML/context classifier helpers are now NAMED-imported from './haRuntimeProvider.js'
# (re-exported on the runtime object), and the 3 active runtime providers are delegated via the
# `haRuntime.<name>(` namespace call. Same invariant (these come from the HA provider module),
# current form.
require("import * as haRuntime from './haRuntimeProvider.js'" in runtime, 'provider runtime imports HA runtime provider namespace')
require("} from './haRuntimeProvider.js'" in runtime, 'provider runtime named-imports helpers from HA runtime provider module')
for token in [
    '  yamlPathParts,',
    '  yamlPathIncludes,',
    '  isDashboardActionContext,',
    '  isAutomationScriptContext,',
    '  yamlScalarValueKind,',
    '  isScalarValueKind,',
    '  isScalarConfigContext,',
    '  yamlValueKind,',
    '  yamlFocusKind,',
    '  yamlBlockValueKeyKind,',
]:
    require(token in runtime, f'provider runtime named-imports HA classifier helper from module: {token.strip()}')
for token in [
    'haRuntime.runtimeData({',
    'haRuntime.haRuntimeValueProvider({',
    'haRuntime.runtimeRowsForKind(kind,',
]:
    require(token in runtime, f'provider runtime delegates HA runtime provider: {token}')

# Legacy keeps THIN pass-through delegates to the provider runtime owner. The per-function
# wrappers (function yamlPathParts(ctx) { return providerRuntime.yamlPathParts(ctx); }) were
# replaced by the generic delegate bridge: createProviderRuntimeDelegates(() => providerRuntime)
# builds the same pass-throughs, and legacy destructures these HA helpers/providers off it. Same
# invariant (legacy delegates these to providerRuntime, owns no HA implementation), current form.
require('createProviderRuntimeDelegates(() => providerRuntime)' in legacy, 'legacy builds provider delegate bridge over providerRuntime owner')
for token in [
    'runtimeData,',
    'yamlPathParts,',
    'yamlValueKind,',
    'haRuntimeValueProvider,',
]:
    require(token in legacy, f'legacy destructures thin HA provider delegate off the bridge: {token}')

# The HA runtime provider delegates its pure YAML/context helpers to the yamlContextClassifier
# module. The intermediate "...FromYamlContextClassifier" rename-imports were folded into a
# `import * as classifier` namespace import, so each helper now delegates via `classifier.<name>(`.
# Same invariant (these helpers are owned by the classifier, the provider only forwards), current form.
require("import * as classifier from '../yaml/yamlContextClassifier.js'" in module, 'HA runtime provider imports the YAML context classifier namespace')
for token in [
    'classifier.yamlPathParts(ctx)',
    'classifier.yamlPathIncludes(ctx, names)',
    'classifier.isDashboardActionContext(ctx)',
    'classifier.isAutomationScriptContext(ctx)',
    'classifier.yamlScalarValueKind(ctx)',
    'classifier.isScalarValueKind(kind)',
    'classifier.isScalarConfigContext(ctx)',
    'classifier.yamlValueKind(ctx)',
    'classifier.yamlFocusKind(ctx)',
    'classifier.yamlBlockValueKeyKind(ctx)',
]:
    require(token in module, f'HA runtime provider delegates classifier helper: {token}')

for token in [
    'export function yamlPathParts',
    'export function yamlPathIncludes',
    'export function isDashboardActionContext',
    'export function isAutomationScriptContext',
    'export function yamlScalarValueKind',
    'export function isScalarValueKind',
    'export function isScalarConfigContext',
    'export function yamlValueKind',
    'export function yamlFocusKind',
    'export function yamlBlockValueKeyKind',
    "if (!key && String(ctx?.yamlRole || '') === 'list-key'",
    'return yamlScalarValueKind(ctx);',
]:
    require(token in classifier, f'YAML context classifier invariant present: {token}')

require('src/providers/haRuntimeProvider.js' not in allowed, 'HA runtime provider removed from unwired allowlist')

for token in [
    'function yamlValueKind(ctx) {\n    const key = String(ctx?.yamlKey || "").toLowerCase();',
    'function yamlScalarValueKind(ctx) {\n    const key = String(ctx?.yamlKey || "").toLowerCase();',
    'function isScalarConfigContext(ctx) {\n    if (!ctx || ctx.lang !== "yaml") return false;',
]:
    require(token not in legacy, f'legacy no longer owns old classifier implementation token: {token[:80]}')

for token in [
    'function yamlValueKind(ctx)',
    'function yamlFocusKind(ctx)',
    'function isAutomationScriptContext(ctx)',
    'list-key',
    'scalarValueContext',
]:
    require(token in dist, f'bundled dist contains HA runtime classifier token: {token}')

for forbidden in [
    'showPopover', 'hidePopover', ':popover-open', 'setAttribute("popover"', "setAttribute('popover'",
    'onOverlayPointerCapture', 'elementFromPoint', 'fetch(', 'sendBeacon', 'eval(', 'new Function', 'localStorage',
]:
    require(forbidden not in module, f'forbidden HA runtime provider classifier token absent: {forbidden}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'HA runtime provider module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('HA RUNTIME PROVIDER MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('HA RUNTIME PROVIDER MODULE WIRING STATIC TEST OK')
for note in notes:
    print('-', note)
print('Report:', REPORT)
