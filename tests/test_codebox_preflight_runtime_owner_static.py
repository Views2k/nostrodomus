#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
LEGACY = (ROOT / 'src' / 'main.legacy.js').read_text(encoding='utf-8', errors='replace')
BRIDGE = (ROOT / 'src' / 'composition' / 'runtimeDelegateBridge.js').read_text(encoding='utf-8', errors='replace')
MODULE_PATH = ROOT / 'src' / 'ui' / 'codeboxStyleRuntime.js'
CODEBOX_MODULES_DIR = ROOT / 'src' / 'ui' / 'codebox'
# The codebox style runtime is a composer over src/ui/codebox/ modules
# (UI_DECOMP P2); the owned codebox body spans the composer plus its modules.
MODULE = MODULE_PATH.read_text(encoding='utf-8', errors='replace') if MODULE_PATH.exists() else ''
if CODEBOX_MODULES_DIR.exists():
    for _module_path in sorted(CODEBOX_MODULES_DIR.glob('*.js')):
        MODULE += '\n' + _module_path.read_text(encoding='utf-8', errors='replace')
REPORT = ROOT / 'reports' / 'CODEBOX_PREFLIGHT_RUNTIME_OWNER_STATIC_REPORT.txt'

errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require(MODULE_PATH.exists(), 'codebox style runtime module exists')
require('export function createCodeboxStyleRuntime(ctx = {})' in MODULE, 'codebox style runtime factory remains exported')

for token in [
    'function installCodeboxPreflightObserver(reason = "preflight-observer") {',
    'function disconnectCodeboxPreflightObserver(reason = "codebox-preflight-observer-disconnect") {',
    'function codeboxPreflightTargetedScanRoots(reason = "preflight-scan") {',
    'function codeboxPreflightShadowHosts(root, reason = "preflight-shadow-scan", depth = 0) {',
    'function scheduleCodeboxPreflightMutationScan(records, reason = "mutation") {',
    'function installCodeboxPreflightStyle(reason = "preflight") {',
    'function removeCodeboxPreflightStyle(reason = "uninstall") {',
]:
    require(token in MODULE, f'codebox runtime owns preflight body: {token}')

for token in [
    '"installCodeboxPreflightObserver"',
    '"disconnectCodeboxPreflightObserver"',
    '"codeboxPreflightTargetedScanRoots"',
    '"installCodeboxPreflightStyle"',
    '"removeCodeboxPreflightStyle"',
]:
    require(token in BRIDGE, f'delegate bridge keeps thin preflight wrapper method: {token}')

for token in [
    'state.lastCodeboxPreflightObserverScope = {',
    'recordPerformanceEvent("codebox-preflight-reason-coalesced", 0,',
    'recordPerformanceEvent("codebox-preflight-style", 0, reason);',
    'installInitialSyntaxPaintGate("preflight-bootstrap");',
    'state.codeboxPreflightTargetedShadowTraversals =',
]:
    require(token in MODULE, f'preflight runtime preserves behavior token: {token}')

for forbidden in [
    'function installCodeboxPreflightStyle(reason = "preflight") {\n    const installIntoRoot = (root) => {',
    'function installCodeboxPreflightObserver(reason = "preflight-observer") {\n    if (typeof MutationObserver !== "function") return false;',
    'function scheduleCodeboxPreflightMutationScan(records, reason = "mutation") {\n    const urgent = mutationRecordsContainEditorSurface(records);',
]:
    require(forbidden not in LEGACY, f'legacy no longer owns preflight body: {forbidden[:80]}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Codebox preflight runtime owner static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('CODEBOX PREFLIGHT RUNTIME OWNER STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('CODEBOX PREFLIGHT RUNTIME OWNER STATIC TEST OK')
print('Report:', REPORT)
