#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
COMPANION = ROOT / "reference/companions" / "nostrodomus_editor_v17_2_learned_reapply.js"
text = COMPANION.read_text(encoding="utf-8", errors="replace")
errors = []

required = [
    'nostrodomus-editor-v17.2.64-settings-tab-guard',
    'const nostrodomusUiSelector = `',
    '#nostrodomus-settings-root',
    'if (node.matches?.(nostrodomusUiSelector)) return true;',
    'if (node.closest?.(nostrodomusUiSelector)) return true;',
    'function hasOptionTabs(dialog)',
    'filter((el) => isVisible(el) && !isNostrodomusUiNode(el))',
    'const settingsOpen = hasOpenNostrodomusSettings();',
]
for token in required:
    if token not in text:
        errors.append(f"missing companion token: {token}")

if 'role: "tab"' in text:
    errors.append('test should inspect companion only, not settings source')

if errors:
    print('V17 SETTINGS TAB GUARD STATIC TEST FAILED')
    for e in errors:
        print('-', e)
    sys.exit(1)
print('V17 SETTINGS TAB GUARD STATIC TEST OK')
