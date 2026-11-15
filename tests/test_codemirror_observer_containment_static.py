#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = (ROOT / 'src' / 'editor' / 'editorLifecycleSentinel.js').read_text(encoding='utf-8')
MAIN = (ROOT / 'src' / 'app.js').read_text(encoding='utf-8')
DIST = (ROOT / 'dist' / 'nostrodomus.js').read_text(encoding='utf-8')

assert 'createEditorLifecycleSentinelRuntime' in MAIN, 'main wires editor lifecycle sentinel owner'
assert 'function mutationRecordsAreCodeMirrorOnly' in MODULE, 'CodeMirror-only mutation filter exists in owner module'
assert 'function structuralObserverConfigForTarget' in MODULE, 'observer config helper exists in owner module'
assert 'containsCodeMirror' in MODULE and 'subtree: false' in MODULE, 'CodeMirror-present roots switch to shallow observers'
assert 'ignoredCodeMirrorRecords' in MODULE, 'diagnostics count CodeMirror-ignored records'
assert 'characterData: true' not in MODULE, 'active runtime must not observe CodeMirror characterData'
assert 'mutationRecordsAreCodeMirrorOnly' in DIST and ('subtree: false' in DIST or 'subtree:false' in DIST or 'subtree:!1' in DIST), 'dist includes containment helpers (subtree:false survives minification as subtree:!1)'
print('CODEMIRROR OBSERVER CONTAINMENT STATIC TEST OK')
