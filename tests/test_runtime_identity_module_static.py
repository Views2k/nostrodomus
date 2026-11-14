#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
project = json.loads((ROOT / 'PROJECT.json').read_text(encoding='utf-8'))
module_path = ROOT / 'src' / 'core' / 'version.js'
legacy_path = ROOT / 'src' / 'main.legacy.js'
dist_path = ROOT / 'dist' / 'nostrodomus.js'
build_py = (ROOT / 'tools' / 'build.py').read_text(encoding='utf-8', errors='replace')
version_bump = (ROOT / 'tools' / 'version_bump.py').read_text(encoding='utf-8', errors='replace')
errors = []

version = str(project.get('version') or '')
internal = str(project.get('internal_version') or '')
legacy = legacy_path.read_text(encoding='utf-8', errors='replace')
dist = dist_path.read_text(encoding='utf-8', errors='replace')
identity_wired = "from './core/version.js'" in legacy

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
    if not legacy.lstrip().startswith('import {') or "from './core/version.js';" not in legacy[:700]:
        errors.append('src/main.legacy.js must import runtime identity constants at the top')
    if 'const VERSION =' in legacy[:900] or 'const PROJECT_VERSION =' in legacy[:900] or 'const SETTINGS_WRITE_KEY =' in legacy[:900]:
        errors.append('src/main.legacy.js must not keep duplicate extracted constants near the top')
    # Dist is esbuild whitespace-minified and collapses consecutive consts into
    # one var statement; assert presence without spacing or var keyword.
    if 'var VERSION="' not in dist or 'PROJECT_VERSION="' not in dist:
        errors.append('dist must include bundled runtime identity module constants')
else:
    if internal not in legacy:
        errors.append('legacy runtime missing current internal_version')
    if f'PROJECT_VERSION = "{version}"' not in legacy:
        errors.append('legacy runtime missing current PROJECT_VERSION')

if 'failed-esbuild-required-for-modules' not in build_py or 'Legacy-copy fallback is disabled' not in build_py:
    errors.append('tools/build.py must disable legacy-copy fallback once main.legacy.js imports modules')
if 'VERSION_MODULE' not in version_bump or '--copy-source-to-dist is unsafe after runtime module extraction' not in version_bump:
    errors.append('tools/version_bump.py must update src/core/version.js and block unsafe source-to-dist copy')

if errors:
    print('RUNTIME IDENTITY MODULE TEST FAILED')
    for error in errors:
        print('-', error)
    sys.exit(1)
print('RUNTIME IDENTITY MODULE TEST OK')
