#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
MODULE = (ROOT / 'src' / 'editor' / 'editorLifecycleSentinel.js').read_text(encoding='utf-8')
MAIN = (ROOT / 'src' / 'main.legacy.js').read_text(encoding='utf-8')
DIST = (ROOT / 'dist' / 'nostrodomus.js').read_text(encoding='utf-8')
PROJECT = json.loads((ROOT / 'PROJECT.json').read_text(encoding='utf-8'))

version = str(PROJECT.get('version') or '')
version_tuple = tuple(int(part) for part in version.split('.') if part.isdigit())
assert version_tuple >= (0, 1, 17), 'PROJECT.json remains at or beyond the v0.1.17 editor lifecycle owner baseline'
assert 'editor-lifecycle-owner' in str(PROJECT.get('internal_version') or '') or version_tuple > (0, 1, 17), 'internal_version records editor lifecycle owner (or version advanced beyond the baseline that introduced it)'
assert 'createEditorLifecycleSentinelRuntime' in MAIN, 'main wires editor lifecycle sentinel owner'
assert 'function mutationRecordsAreCodeMirrorOnly' in MODULE, 'CodeMirror-only mutation filter exists in owner module'
assert 'function structuralObserverConfigForTarget' in MODULE, 'observer config helper exists in owner module'
assert 'containsCodeMirror' in MODULE and 'subtree: false' in MODULE, 'CodeMirror-present roots switch to shallow observers'
assert 'ignoredCodeMirrorRecords' in MODULE, 'diagnostics count CodeMirror-ignored records'
assert 'characterData: true' not in MODULE, 'active runtime must not observe CodeMirror characterData'
assert 'mutationRecordsAreCodeMirrorOnly' in DIST and ('subtree: false' in DIST or 'subtree:false' in DIST or 'subtree:!1' in DIST), 'dist includes containment helpers (subtree:false survives minification as subtree:!1)'
print('CODEMIRROR OBSERVER CONTAINMENT STATIC TEST OK')
