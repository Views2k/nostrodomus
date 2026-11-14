from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
codebox = (ROOT / 'src/ui/codeboxStyleRuntime.js').read_text(encoding='utf-8')
style_dom = (ROOT / 'src/ui/styleDomRuntime.js').read_text(encoding='utf-8')
settings_interaction = (ROOT / 'src/ui/settingsInteractionRuntime.js').read_text(encoding='utf-8')

errors = []

def require(cond, msg):
    if not cond:
        errors.append(msg)

require('function isCodeMirrorInlineStyleTarget' in codebox, 'codebox runtime must declare CodeMirror inline style ownership guard')
require('if (isCodeMirrorInlineStyleTarget(el)) continue;' in codebox, 'codebox steady-state loop must not write inline styles to CM internals')
require('The v17 companion owns .cm-editor overflow' in codebox, 'codebox runtime must document companion-owned overflow/scroller properties')
require('if (!isCodeMirrorInlineStyleTarget(frameHost)) applyCodeboxStyleTokensToElement(frameHost, tokens);' in codebox, 'frame host token writes must skip CM internals')
require('if (isCodeMirrorInlineStyleTarget(el)) return false;' in style_dom, 'style DOM token writer must refuse CM internal inline targets')
require('if (isCodeMirrorInlineStyleTarget(el)) return;' in settings_interaction, 'settings live preview token target collection must skip CM internals')
require('scrollbarValue = `${scrollbarThumb} ${scrollbarTrack}`' not in codebox, 'runtime must not force literal scrollbar-color over companion var() form')
require('el.style.setProperty("scrollbar-color"' not in codebox, 'runtime must not write scrollbar-color inline on CM internals')
require('cm-content height' in codebox, 'runtime comments must preserve CodeMirror-owned cm-content height invariant')

if errors:
    raise SystemExit('CODEBOX STYLE PROPERTY OWNERSHIP STATIC TEST FAILED\n' + '\n'.join(f'- {e}' for e in errors))
print('CODEBOX STYLE PROPERTY OWNERSHIP STATIC TEST OK')
