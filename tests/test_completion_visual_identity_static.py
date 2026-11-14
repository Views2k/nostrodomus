#!/usr/bin/env python3
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
legacy = (ROOT / "src" / "main.legacy.js").read_text(encoding="utf-8")
module = (ROOT / "src" / "completion" / "popupRuntime.js").read_text(encoding="utf-8")
text = legacy + "\n" + module
required = [
    'completionVisualKind',
    'completionPillLabel',
    'completionAccent',
    'nostrodomus-row--',
    'row.dataset.kind',
    'Snippet',
    'border-left:3px solid',
    'completionPillLabel(item)',
    'renderCompletionPopup(state',
    '--nostrodomus-brand-rgb',
]
missing = [x for x in required if x not in text]
if missing: raise SystemExit('COMPLETION VISUAL IDENTITY STATIC TEST FAILED missing: ' + ', '.join(missing))
print('COMPLETION VISUAL IDENTITY STATIC TEST OK')
for token in required: print('PASS token:', token)
