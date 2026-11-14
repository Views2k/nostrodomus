#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
project = json.loads((ROOT / 'PROJECT.json').read_text(encoding='utf-8'))
# The monolith was decomposed into src/*.js modules and the diagnostics runtime
# moved out of src/main.legacy.js into dedicated owner modules (src/diagnostics/*,
# src/providers/*, src/editor/*, src/completion/*, src/ui/*). The invariant is unchanged
# ("every runtime catch is instrumented through the runtime-error recorder"), it just
# moved across files, so the SOURCE side now reads the whole src/ tree, not one file.
src_all = "\n".join(
    p.read_text(encoding='utf-8', errors='replace')
    for p in sorted((ROOT / 'src').rglob('*.js'))
)
# The dedicated external-diagnostics ("context diagnostics") runtime is its own owner
# module now; the unbridged-call positional checks below scope to that file's content.
external_src = (ROOT / 'src/diagnostics/contextDiagnosticsRuntime.js').read_text(encoding='utf-8', errors='replace')
dist = (ROOT / 'dist/nostrodomus.js').read_text(encoding='utf-8', errors='replace')
report = ROOT / 'reports' / 'CATCH_TRIAGE.md'
errors = []

def require(ok, msg):
    if not ok:
        errors.append(msg)

# Version-identity owner: originally pinned at 31.6.98 with the "provider-contract-runtime-boundary"
# internal_version. That literal was retired at the 31.6.x -> 0.1.x SemVer reset (CHANGELOG [0.1.0]).
# The invariant is the diagnostics instrumentation below, not a frozen version literal, so floor at
# the start of the SemVer line and accept either the legacy internal id OR a version advanced past it.
version = str(project.get('version') or '')
internal_version = str(project.get('internal_version') or '')
version_tuple = tuple(int(part) for part in version.split('.') if part.isdigit())
require(version_tuple >= (0, 1, 0), 'PROJECT.json remains at or beyond the diagnostics baseline (SemVer line)')
require('provider-contract-runtime-boundary' in internal_version or version_tuple > (0, 1, 0),
        'internal version records provider contract runtime boundary (or version advanced past the baseline)')

# Each fact below holds in BOTH the (source-spaced) src tree and the minified dist. Where the
# minifier strips only whitespace (function declarations, object properties), the dist form is the
# same string without the spaces; scope-string and template-literal facts are identical in both.
for rel_text, name, minified in [(src_all, 'src/', False), (dist, 'dist/nostrodomus.js', True)]:
    def fact(src_form, dist_form, msg):
        require((dist_form if minified else src_form) in rel_text, f'{name} {msg}')

    fact('function recordRuntimeError(scope, err, detail = null)',
         'function recordRuntimeError(scope,err,detail=null)',
         'has recordRuntimeError helper')
    fact('runtimeErrors: runtimeErrorReadout()',
         'runtimeErrors:runtimeErrorReadout()',
         'exposes runtimeErrors API')
    # Provider canHandle/provide failures are routed through the runtime-error recorder via the
    # registry's local `record`/`recordOnce` aliases (bound to recordRuntimeError/...Once in
    # src/providers/providerRegistry.js); the template-literal scope is identical in src and dist.
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

    # External (context) diagnostics must not call the in-runtime recorders directly — they must go
    # through the nostrodomus* bridge. For src the external runtime is its own owner module; for
    # dist the bundled function is sliced positionally from its install entry onward.
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
# The normal apply wrapper runs verify before optional generated reports are written.
# The triage tool is required, and any existing report must be well-formed,
# but the pre-deploy static gate must not require reports/CATCH_TRIAGE.md to
# already exist. Run `python3 tools/triage_catches.py --write` after apply to
# generate or refresh the report.
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
