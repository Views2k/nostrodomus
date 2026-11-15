#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
# Every runtime catch is recorded through the runtime-error recorder. The catches are spread over
# the whole src/ tree, so the source checks read all of it.
src_all = "\n".join(
    p.read_text(encoding='utf-8', errors='replace')
    for p in sorted((ROOT / 'src').rglob('*.js'))
)
# The context diagnostics runtime is checked on its own for calls that skip the bridge.
external_src = (ROOT / 'src/diagnostics/contextDiagnosticsRuntime.js').read_text(encoding='utf-8', errors='replace')
dist = (ROOT / 'dist/nostrodomus.js').read_text(encoding='utf-8', errors='replace')
report = ROOT / 'reports' / 'CATCH_TRIAGE.md'
errors = []

def require(ok, msg):
    if not ok:
        errors.append(msg)

# Each fact holds in the src tree and in dist. Where esbuild only removes spaces (function
# declarations, object properties) the dist form is the same text without them; scope strings and
# template literals are identical in both.
for rel_text, name, minified in [(src_all, 'src/', False), (dist, 'dist/nostrodomus.js', True)]:
    def fact(src_form, dist_form, msg):
        require((dist_form if minified else src_form) in rel_text, f'{name} {msg}')

    fact('function recordRuntimeError(scope, err, detail = null)',
         'function recordRuntimeError(scope,err,detail=null)',
         'has recordRuntimeError helper')
    fact('runtimeErrors: runtimeErrorReadout()',
         'runtimeErrors:runtimeErrorReadout()',
         'exposes runtimeErrors API')
    # providerRegistry.js receives the recorders as `record` and `recordOnce`.
    fact('record(`provider:${providerId}:canHandle`', 'record(`provider:${providerId}:canHandle`',
         'routes provider canHandle failures through recordRuntimeError')
    fact('record(`provider:${providerId}:provide`', 'record(`provider:${providerId}:provide`',
         'routes provider provide failures through recordRuntimeError')

    fact('function diagnosticsRuntimeErrorFallback(scope, err, detail = null, extra = null)',
         'function diagnosticsRuntimeErrorFallback(scope,err,detail=null,extra=null)',
         'has diagnosticsRuntimeErrorFallback helper')
    require('diagnostics:export-active-editor' in rel_text, f'{name} instruments export diagnostics active-editor readout failures')
    fact('runtimeErrors: runtimeErrorReadout()',
         'runtimeErrors:runtimeErrorReadout()',
         'includes runtime errors in diagnostics/debug output')
    fact('function recordRuntimeErrorOnce(scope, err, detail = null)',
         'function recordRuntimeErrorOnce(scope,err,detail=null)',
         'has one-shot runtime error recorder')
    require('diagnostics:clipboard-write' in rel_text, f'{name} instruments diagnostics clipboard write failures')
    require('settings:storage-status' in rel_text, f'{name} instruments settings storage-status failures')

    fact('function nostrodomusRecordRuntimeError(scope, err, detail = null)',
         'function nostrodomusRecordRuntimeError(scope,err,detail=null)',
         'has external diagnostics runtime-error bridge')
    fact('function nostrodomusRecordRuntimeErrorOnce(scope, err, detail = null)',
         'function nostrodomusRecordRuntimeErrorOnce(scope,err,detail=null)',
         'has external diagnostics one-shot bridge')
    require('nostrodomusRecordRuntimeErrorOnce("diagnostics:readout-storage-read"' in rel_text, f'{name} instruments diagnostics readout storage gate through bridge')

    # The context diagnostics runtime must call the recorders through the nostrodomus* bridge. In
    # dist its code is taken from installContextDiagnosticsRuntime to the end of the bundle.
    if minified:
        external_start = rel_text.find('function installContextDiagnosticsRuntime')
        external_text = rel_text[external_start:] if external_start >= 0 else ''
    else:
        external_text = external_src
    require('recordRuntimeError("diagnostics:' not in external_text, f'{name} has no unbridged external recordRuntimeError diagnostics calls')
    require('recordRuntimeErrorOnce("diagnostics:' not in external_text, f'{name} has no unbridged external recordRuntimeErrorOnce diagnostics calls')

    for scope in [
        'editor:dispatch-hook-post',
        'editor:unhook-dispatch',
        'editor:walk-open-root-callback',
        'editor:walk-open-root-query',
        'editor:active-root-query',
        'editor:overlay-host-query',
        'editor:get-doc-length',
        'editor-sentinel:observe',
        'editor:codemirror-internals-check',
        'editor:target-contains-codemirror',
        'completion:compute',
        'completion:compute-context-panel',
        'completion:compute-quality-panel',
        'completion:snippet-placeholder-select',
        'completion:snippet-placeholder-exit',
        'completion:snippet-session-update',
        'completion:insert-dispatch',
        'completion:insert-snippet-session',
        'completion:continuation-open',
        'diagnostics:suggestion-quality-clipboard-write',
        'settings:top-layer-dialog-query',
        'settings:top-layer-dialog-modal-check',
        'settings:top-layer-dialog-shadow-query',
        'settings:portal-host-query',
        'settings:portal-host-append',
        'settings:portal-host-fallback-append',
        'settings:scroll-snapshot-capture',
        'settings:deferred-save-timer-clear',
        'settings:diagnostics-raf-cancel',
        'settings:diagnostics-pending-clear',
        'settings:popover-hide',
        'settings:active-tab-storage-read',
        'settings:active-tab-storage-write',
        'settings:resize-pointer-capture',
        'settings:drag-pointer-capture',
        'settings:panel-popover-setup',
        'diagnostics:context-clipboard-write',
        'diagnostics:context-inspector-clipboard-write',
        'diagnostics:console-command-clipboard-write',
        'diagnostics:pending-reasons-clear',
        'diagnostics:pending-reasons-add',
    ]:
        require(scope in rel_text, f'{name} instruments {scope}')
require((ROOT / 'tools' / 'triage_catches.py').exists(), 'catch triage tool exists')
# reports/CATCH_TRIAGE.md is written by `python3 tools/triage_catches.py --write` and may be
# missing; when it exists it must be well formed.
if report.exists():
    text = report.read_text(encoding='utf-8', errors='replace')
    require('Total catch sites:' in text, 'catch triage report includes total')
    require('| # | Line | Binding | Class | Reason | Body preview |' in text, 'catch triage report includes inventory table')

if errors:
    print('RUNTIME ERROR DIAGNOSTICS STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    sys.exit(1)
print('RUNTIME ERROR DIAGNOSTICS STATIC TEST OK')
