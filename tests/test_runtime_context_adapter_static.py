#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
app = (root / 'src' / 'app.js').read_text(encoding='utf-8')
adapter = (root / 'src' / 'yaml' / 'runtimeContextAdapter.js').read_text(encoding='utf-8')
runtime = (root / 'src' / 'yaml' / 'runtimeContextRuntime.js').read_text(encoding='utf-8')

def require(text, token, label):
    if token not in text:
        raise SystemExit(f'RUNTIME CONTEXT ADAPTER STATIC TEST FAILED: missing {label}: {token}')

require(adapter, 'export function contextAdapterYamlKey', 'contextAdapterYamlKey export')
require(adapter, 'export function detectRuntimeContext', 'detectRuntimeContext export')
require(adapter, 'export function detectRuntimeContextFallback', 'detectRuntimeContextFallback export')
require(adapter, 'export function dashboardActionBranchState', 'dashboard action branch state export')
require(adapter, 'export function yamlValueKind', 'yamlValueKind export')
require(adapter, 'export function yamlFocusKind', 'yamlFocusKind export')
require(adapter, 'export function yamlBlockValueKeyKind', 'yamlBlockValueKeyKind export')
require(adapter, 'ACTION_BRANCHES', 'dashboard action branch metadata')
require(adapter, 'settings = normalizedSettings(options.settings)', 'settings injection instead of runtime state')

for forbidden in ['window.', 'document.', 'localStorage', 'sessionStorage', 'querySelector', 'addEventListener', 'fetch(', 'sendBeacon', 'eval(', 'new Function']:
    if forbidden in adapter:
        raise SystemExit(f'RUNTIME CONTEXT ADAPTER STATIC TEST FAILED: forbidden token in adapter: {forbidden}')

require(app, 'createRuntimeContextRuntime', 'app.js runtime context owner import')
require(app, 'const runtimeContextRuntime = createRuntimeContextRuntime({', 'runtime context owner construction')
require(app, 'createRuntimeContextRuntimeDelegates(() => runtimeContextRuntime)', 'runtime context delegate bundle')
require(app, 'const { detectContextFallback, detectContext } = createRuntimeContextRuntimeDelegates', 'runtime context active/fallback delegates')
if 'function detectContextLegacy(doc, pos, triggerKind = "typing")' in app:
    raise SystemExit('RUNTIME CONTEXT ADAPTER STATIC TEST FAILED: the detectContext fallback must not live in app.js')
if 'return detectRuntimeContextFromModule(doc, pos, {' in app:
    raise SystemExit('RUNTIME CONTEXT ADAPTER STATIC TEST FAILED: active detector body should live in runtimeContextRuntime.js')
if 'recordRuntimeErrorOnce("context:runtime-module"' in app:
    raise SystemExit('RUNTIME CONTEXT ADAPTER STATIC TEST FAILED: context runtime diagnostics should live in runtimeContextRuntime.js')
require(runtime, 'detectRuntimeContext,', 'runtime owner active detector import')
require(runtime, 'detectRuntimeContextFallback,', 'runtime owner fallback detector import')
require(runtime, "recordRuntimeErrorOnce('context:runtime-module'", "runtime owner active diagnostics")
require(runtime, "recordRuntimeErrorOnce('context:runtime-module-fallback'", "runtime owner fallback diagnostics")
require(runtime, 'export { safeFallbackContext };', 'runtime owner safe fallback export')

print('RUNTIME CONTEXT ADAPTER STATIC TEST OK')
