#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
dist = (ROOT / 'dist' / 'nostrodomus.js').read_text(encoding='utf-8', errors='replace')
smart_styles = (ROOT / 'src' / 'syntax' / 'smartSyntaxStyles.js').read_text(encoding='utf-8', errors='replace')
smart_tokenizers = (ROOT / 'src' / 'syntax' / 'smartSyntaxTokenizers.js').read_text(encoding='utf-8', errors='replace')
smart_lifecycle = (ROOT / 'src' / 'syntax' / 'smartSyntaxLifecycle.js').read_text(encoding='utf-8', errors='replace')
errors = []

# CSS Custom Highlight document-range coloring stays the primary syntax model.
for token in [
    'runtimeWindow?.CSS?.highlights',
    'new HighlightCtor(',
    'function smartSyntaxCommitRangeHighlights',
    'data-nostrodomus-range-highlighted',
]:
    if token not in smart_styles:
        errors.append(f'src/syntax/smartSyntaxStyles.js missing range/source syntax token: {token}')

for token in [
    'function smartSyntaxTokenizeCss',
    'function smartSyntaxDocumentContextForVisibleLines',
]:
    if token not in smart_tokenizers:
        errors.append(f'src/syntax/smartSyntaxTokenizers.js missing range/source syntax token: {token}')

if 'function applySmartSyntaxRangeHighlights' not in smart_lifecycle:
    errors.append('src/syntax/smartSyntaxLifecycle.js missing range/source syntax token: function applySmartSyntaxRangeHighlights')

# Whole-line fallback color must stay suppressed when range highlights are active.
if '.cm-line.${lineCls}:not([data-nostrodomus-range-highlighted="1"])' not in smart_styles:
    errors.append('src/syntax/smartSyntaxStyles.js must keep whole-line fallback suppressed when range highlights are active')

# The bundled runtime must carry the same behavior (minified names allowed).
for token in [
    'highlights.set(',
    'applySmartSyntaxRangeHighlights',
    'smartSyntaxTokenizeCss',
    'data-nostrodomus-range-highlighted',
    ':not([data-nostrodomus-range-highlighted="1"])',
]:
    if token not in dist:
        errors.append(f'dist/nostrodomus.js missing range/source syntax token: {token}')

if errors:
    print('RANGE HIGHLIGHT SYNTAX BASELINE STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    sys.exit(1)
print('RANGE HIGHLIGHT SYNTAX BASELINE STATIC TEST OK')
