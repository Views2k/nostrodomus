#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'src/ui/styles.css.js'
LEGACY = ROOT / 'src/main.legacy.js'
ALLOWLIST = ROOT / 'docs/contracts/MODULE_WIRING_ALLOWLIST.json'
DIST = ROOT / 'dist/nostrodomus.js'
TELEMETRY_RUNTIME = ROOT / 'src/diagnostics/telemetryRuntime.js'
REPORT = ROOT / 'reports/STYLES_CSS_MODULE_WIRING_STATIC_REPORT.txt'

module = MODULE.read_text(encoding='utf-8', errors='replace')
legacy = LEGACY.read_text(encoding='utf-8', errors='replace')
telemetry_runtime = TELEMETRY_RUNTIME.read_text(encoding='utf-8', errors='replace') if TELEMETRY_RUNTIME.exists() else ''
runtime_owner = legacy + '\n' + telemetry_runtime
dist = DIST.read_text(encoding='utf-8', errors='replace') if DIST.exists() else ''
allowlist = json.loads(ALLOWLIST.read_text(encoding='utf-8'))
allowed = allowlist.get('allowed_unwired_modules', {})
errors = []
notes = []

def require(ok, message):
    if ok:
        notes.append('PASS ' + message)
    else:
        errors.append(message)

require("from './ui/styles.css.js'" in legacy, 'runtime imports styles CSS sentinel module')
require('styleCssModuleStatus: stylesCss.styleCssModuleStatus' in runtime_owner and 'return ctx.styleCssModuleStatus();' in runtime_owner, 'runtime delegates style CSS status through module')
require('styleCssModule: styleCssModuleStatus(),' in runtime_owner, 'diagnostics/debug expose style CSS wiring status')
require(allowed == {}, 'temporary unwired-module allowlist is empty after final styles sentinel wiring')

for token in [
    'export const STYLE_CSS_MODULE_STATUS = Object.freeze',
    'ownsVisualCss: false',
    'visualOwner: "src/main.legacy.js"',
    'extractionPolicy: "sentinel-only-no-style-ownership-transfer"',
    'export function styleCssModuleStatus()',
]:
    require(token in module, f'styles CSS sentinel invariant present: {token}')

for token in [
    'nostrodomus-styles-css-module',
    'sentinel-only-no-style-ownership-transfer',
    'styleCssModule',
]:
    require(token in dist, f'bundled dist contains styles sentinel token: {token}')

for forbidden in [
    'document.',
    'window.',
    'localStorage',
    'fetch(',
    'sendBeacon',
    'eval(',
    'new Function',
    'addEventListener',
    'removeEventListener',
    'querySelector',
    'createElement',
    'appendChild',
    'insertRule',
    'adoptedStyleSheets',
    'CSSStyleSheet',
    'textContent',
    '.cm-editor',
    'ha-code-editor',
    'nostrodomus-codebox',
    'box-shadow',
    'backdrop-filter',
]:
    require(forbidden not in module, f'forbidden styles sentinel module token absent: {forbidden}')

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    'Styles CSS module wiring static report\n\n'
    + 'Results:\n' + '\n'.join(notes)
    + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('STYLES CSS MODULE WIRING STATIC TEST FAILED')
    for error in errors:
        print('ERROR:', error)
    print('Report:', REPORT.relative_to(ROOT))
    raise SystemExit(1)

print('STYLES CSS MODULE WIRING STATIC TEST OK')
print('Report:', REPORT.relative_to(ROOT))
