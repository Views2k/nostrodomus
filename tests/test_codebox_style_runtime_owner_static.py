#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
LEGACY = (ROOT / 'src' / 'main.legacy.js').read_text(encoding='utf-8', errors='replace')
BRIDGE = (ROOT / 'src' / 'composition' / 'runtimeDelegateBridge.js').read_text(encoding='utf-8', errors='replace')
MODULE_PATH = ROOT / 'src' / 'ui' / 'codeboxStyleRuntime.js'
CODEBOX_MODULES_DIR = ROOT / 'src' / 'ui' / 'codebox'
# The codebox style runtime is a composer over src/ui/codebox/ modules;
# the owned codebox body spans the composer plus its modules.
MODULE = MODULE_PATH.read_text(encoding='utf-8', errors='replace') if MODULE_PATH.exists() else ''
if CODEBOX_MODULES_DIR.exists():
    for _module_path in sorted(CODEBOX_MODULES_DIR.glob('*.js')):
        MODULE += '\n' + _module_path.read_text(encoding='utf-8', errors='replace')
REPORT = ROOT / 'reports' / 'CODEBOX_STYLE_RUNTIME_OWNER_STATIC_REPORT.txt'

errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require(MODULE_PATH.exists(), 'codebox style runtime owner module exists')
require('export function createCodeboxStyleRuntime(ctx = {})' in MODULE, 'codebox style runtime exports factory')
require("import { createCodeboxStyleRuntime } from './ui/codeboxStyleRuntime.js';" in LEGACY, 'legacy imports codebox style runtime owner')
require('codeboxStyleRuntime = createCodeboxStyleRuntime({' in LEGACY, 'legacy creates injected codebox style runtime')

for token in [
    'function applyCodeboxStyleSettings(reason = "style") {',
    'function activeCodeboxStyleEditor() {',
    'function scheduleCodeboxStyleReapply(reason = "style-settle") {',
    'function scheduleStyleRangeCommitReapply(group = "style-range-change") {',
    'function codeboxPreflightCss(rootKind = "document") {',
    'function primeCodeboxPreflightForEditor(editor, reason = "preflight-prime") {',
    'function allowCodeboxFrameOverflow(editor) {',
    'function attachStyleRootObserver(root) {',
]:
    require(token in MODULE, f'codebox runtime owns moved body: {token}')

for token in [
    '"applyCodeboxStyleSettings"',
    '"activeCodeboxStyleEditor"',
    '"scheduleCodeboxStyleReapply"',
    '"scheduleStyleRangeCommitReapply"',
    '"attachStyleRootObserver"',
]:
    require(token in BRIDGE, f'delegate bridge keeps thin codebox wrapper method: {token}')

for token in [
    'measurePerformanceEvent("codebox-style-apply", reason, () => {',
    'recordPerformanceEvent("codebox-style-settle-reason-coalesced", 0, decision.reason);',
    'recordPerformanceEvent("style-range-commit-deferred", 0,',
    'recordPerformanceEvent("codebox-preflight-prime", 0,',
    'scheduleStyleRootScan("shadow-root-editor-discovered");',
]:
    require(token in MODULE, f'codebox runtime preserves behavior token: {token}')

for forbidden in [
    'function applyCodeboxStyleSettings(reason = "style") {\n    return measurePerformanceEvent("codebox-style-apply", reason, () => {',
    'function activeCodeboxStyleEditor() {\n    const cached = state.activeEditorCache?.editor || null;',
    'function attachStyleRootObserver(root) {\n    if (!isStyleRoot(root) || typeof MutationObserver !== "function") return false;',
]:
    require(forbidden not in LEGACY, f'legacy no longer owns codebox body: {forbidden[:72]}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Codebox style runtime owner static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('CODEBOX STYLE RUNTIME OWNER STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    print('Report:', REPORT)
    sys.exit(1)

print('CODEBOX STYLE RUNTIME OWNER STATIC TEST OK')
print('Report:', REPORT)
