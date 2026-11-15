#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
project = json.loads((ROOT / 'PROJECT.json').read_text(encoding='utf-8'))
module_path = ROOT / 'src' / 'core' / 'version.js'
app_path = ROOT / 'src' / 'app.js'
dist_path = ROOT / 'dist' / 'nostrodomus.js'
build_py = (ROOT / 'tools' / 'build.py').read_text(encoding='utf-8', errors='replace')
version_bump = (ROOT / 'tools' / 'version_bump.py').read_text(encoding='utf-8', errors='replace')
errors = []

version = str(project.get('version') or '')
internal = str(project.get('internal_version') or '')
app = app_path.read_text(encoding='utf-8', errors='replace')
dist = dist_path.read_text(encoding='utf-8', errors='replace')
identity_wired = "from './core/version.js'" in app

if not module_path.exists():
    errors.append('missing src/core/version.js')
else:
    text = module_path.read_text(encoding='utf-8', errors='replace')
    required_exports = [
        'VERSION',
        'PROJECT_VERSION',
        'PROJECT_RELEASE_STATE',
        'LIVE_COMPANION_EDITOR_VERSION',
        'PRODUCT_NAME',
        'LOG_PREFIX',
        'SETTINGS_WRITE_KEY',
    ]
    for name in required_exports:
        if f'export const {name}' not in text:
            errors.append(f'src/core/version.js missing export: {name}')
    if internal not in text:
        errors.append('src/core/version.js must contain PROJECT.json internal_version')
    if version not in text:
        errors.append('src/core/version.js must contain PROJECT.json version')
    forbidden_runtime = re.findall(r'\b(window|document|localStorage|sessionStorage|setTimeout|setInterval|addEventListener|querySelector)\b', text)
    if forbidden_runtime:
        errors.append('src/core/version.js must be pure; forbidden runtime reference(s): ' + ', '.join(sorted(set(forbidden_runtime))))

if identity_wired:
    if not app.lstrip().startswith('import {') or "from './core/version.js';" not in app[:700]:
        errors.append('src/app.js must import runtime identity constants at the top')
    if 'const VERSION =' in app[:900] or 'const PROJECT_VERSION =' in app[:900] or 'const SETTINGS_WRITE_KEY =' in app[:900]:
        errors.append('src/app.js must not declare its own copies of the version constants near the top')
    # esbuild joins consecutive consts into one var statement without spaces.
    if 'var VERSION="' not in dist or 'PROJECT_VERSION="' not in dist:
        errors.append('dist must include bundled runtime identity module constants')
else:
    if internal not in app:
        errors.append('app.js missing current internal_version')
    if f'PROJECT_VERSION = "{version}"' not in app:
        errors.append('app.js missing current PROJECT_VERSION')

# app.js imports modules, so an unbundled copy of it would not run.
if '"--bundle"' not in build_py or 'copy2(APP' in build_py or '--allow-legacy-fallback' in build_py:
    errors.append('tools/build.py must bundle with esbuild and never copy src/app.js to dist')
if 'VERSION_MODULE' not in version_bump or 'copyfile(APP' in version_bump or '--copy-source-to-dist' in version_bump:
    errors.append('tools/version_bump.py must update src/core/version.js and never copy src/app.js to dist')

if errors:
    print('RUNTIME IDENTITY MODULE TEST FAILED')
    for error in errors:
        print('-', error)
    sys.exit(1)
print('RUNTIME IDENTITY MODULE TEST OK')
