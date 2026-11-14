#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / 'src' / 'main.legacy.js').read_text(encoding='utf-8', errors='replace')
PUBLIC_API_RUNTIME = (ROOT / 'src' / 'core' / 'publicApiRuntime.js').read_text(encoding='utf-8', errors='replace')
DISPATCH_RUNTIME = (ROOT / 'src' / 'editor' / 'editorDispatchRuntime.js').read_text(encoding='utf-8', errors='replace')
MODULE = (ROOT / 'src' / 'core' / 'runtimeCoordinator.js').read_text(encoding='utf-8', errors='replace')
V17 = (ROOT / 'reference/companions' / 'nostrodomus_editor_v17_2_learned_reapply.js').read_text(encoding='utf-8', errors='replace')
PICKER = (ROOT / 'reference/companions' / 'nostrodomus-picker-safe.js').read_text(encoding='utf-8', errors='replace')
DOC = (ROOT / 'docs' / 'RUNTIME_COORDINATOR.md').read_text(encoding='utf-8', errors='replace')
errors = []

def require(ok, msg):
    if not ok:
        errors.append(msg)

for label, text in [
    ('main runtime', MAIN),
    ('runtime module', MODULE),
    ('v17 companion', V17),
    ('picker-safe companion', PICKER),
    ('runtime coordinator docs', DOC),
]:
    require('__nostrodomusRuntimeCoordinatorV1' in text, f'{label} wires the shared runtime coordinator token')

require("installRuntimeCoordinator(W" in MAIN, 'main runtime installs the coordinator against window')
require('runtimeCoordinatorReadout' in MAIN and 'runtimeCoordinator: apiMethods.runtimeCoordinatorReadout' in PUBLIC_API_RUNTIME, 'public API exposes runtimeCoordinator readout')
require("markRuntimeQuiet('editor-input'" in DISPATCH_RUNTIME or 'markRuntimeQuiet("editor-input"' in DISPATCH_RUNTIME, 'editor dispatch runtime marks editor-input quiet window')
require('nostrodomus-editor-v17.2.65-runtime-coordinator' in V17, 'v17 companion reports runtime-coordinator version')
require('runtimeCoordinator?.markQuiet?.("editor-input"' in V17, 'v17 marks editor-input quiet windows')
require('runtimeCoordinator?.markQuiet?.("preview-value-freeze"' in V17, 'v17 marks preview freeze quiet windows')
require('runtimeCoordinator?.snapshot?.()' in V17, 'v17 bridge summary exposes coordinator snapshot')
require('nostrodomus-picker-safe-v3-runtime-coordinator' in PICKER, 'picker-safe reports runtime-coordinator version')
require('__nostrodomusRuntimeCoordinatorV1?.isQuiet?.("editor-input")' in PICKER, 'picker-safe consults shared editor-input quiet window')
require('__nostrodomusRuntimeCoordinatorV1?.noteSuppression?.("picker-work"' in PICKER, 'picker-safe records picker-work suppression in shared coordinator')
require('fetch(' not in MODULE and 'sendBeacon' not in MODULE and 'localStorage' not in MODULE and 'setInterval' not in MODULE, 'runtime coordinator module remains local-only/no storage/no interval')

if errors:
    print('RUNTIME COORDINATOR UNIFICATION STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    sys.exit(1)

print('RUNTIME COORDINATOR UNIFICATION STATIC TEST OK')
