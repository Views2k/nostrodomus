#!/usr/bin/env python3
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
main = (ROOT / "src" / "main.legacy.js").read_text(encoding="utf-8")
completion_factory = (ROOT / "src" / "composition" / "mainLegacyCompletionRuntimeFactory.js").read_text(encoding="utf-8")
insertion_runtime = (ROOT / "src" / "completion" / "insertionRuntime.js").read_text(encoding="utf-8")
insertion = (ROOT / "src" / "completion" / "insertion.js").read_text(encoding="utf-8")
snippets = (ROOT / "src" / "completion" / "snippets.js").read_text(encoding="utf-8")
required_main = [
    'createCompletionInsertionRuntime',
    'createCompletionInsertionRuntimeDelegates',
    'debugSnapshot',
]
required_insertion = [
    "from './snippets.js'",
    "ctx?.yamlRole === 'list-key' && item?.type === 'snippet'",
    r"replace(/^\s*-\s*/, '')",
    r"item?.type === 'snippet' && insert.includes('\n')",
    'parseSnippetTemplate(rawInsert)',
    'hasSnippetPlaceholders(rawInsert)',
]
required_snippets = [
    r'const rx = /\$\{(\d+)\|([^}]*)\|\}|\$\{(\d+)(?::((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*))?\}|\$(\d+)/g',
    'export function parseSnippetTemplate',
    'export function hasSnippetPlaceholders',
    'finalCursor',
    'choices',
]
required_insertion_runtime = ['insertItem(state, item']
main_and_factory = main + "\n" + completion_factory
missing = [x for x in required_main if x not in main_and_factory] + [x for x in required_insertion_runtime if x not in insertion_runtime] + [x for x in required_insertion if x not in insertion] + [x for x in required_snippets if x not in snippets]
if missing: raise SystemExit('SNIPPET INSERTION STATIC TEST FAILED missing: ' + ', '.join(missing))
print('SNIPPET INSERTION STATIC TEST OK')
for token in required_main + required_insertion_runtime + required_insertion + required_snippets: print('PASS token:', token)

