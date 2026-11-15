#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/providers/haRuntimeProvider.js'
RUNTIME = ROOT / 'src/providers/providerRuntime.js'
APP = ROOT / 'src/app.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
DIST = ROOT / 'dist/nostrodomus.js'
REPORT = ROOT / 'reports/HA_RUNTIME_PROVIDER_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
classifier = (ROOT / 'src' / 'yaml' / 'yamlContextClassifier.js').read_text(encoding='utf-8', errors='replace')
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

require("from './providers/haRuntimeProvider.js'" not in app, 'app.js does not import the HA runtime provider itself')
require("from './providers/providerRuntime.js'" in app, 'app.js imports provider runtime owner')
require("from './haRuntimeProvider.js'" in runtime, 'provider runtime imports HA runtime provider module')

# The provider runtime imports the ten YAML context helpers by name from haRuntimeProvider.js and
# calls the three runtime providers through the haRuntime namespace.
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

# app.js has no Home Assistant code of its own; it destructures these helpers from
# delegates over the provider runtime.
require('createProviderRuntimeDelegates(() => providerRuntime)' in app, 'app.js builds the provider delegates over the providerRuntime owner')
for token in [
    'runtimeData,',
    'yamlPathParts,',
    'yamlValueKind,',
    'haRuntimeValueProvider,',
]:
    require(token in app, f'app.js destructures the HA provider delegate: {token}')

# The YAML context helpers belong to yamlContextClassifier.js; the HA runtime provider only
# forwards to them.
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

require('src/providers/haRuntimeProvider.js' not in allowed, 'HA runtime provider is not on the unwired allowlist')

for token in [
    'function yamlValueKind(ctx) {\n    const key = String(ctx?.yamlKey || "").toLowerCase();',
    'function yamlScalarValueKind(ctx) {\n    const key = String(ctx?.yamlKey || "").toLowerCase();',
    'function isScalarConfigContext(ctx) {\n    if (!ctx || ctx.lang !== "yaml") return false;',
]:
    require(token not in app, f'app.js has no classifier implementation: {token[:80]}')

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
