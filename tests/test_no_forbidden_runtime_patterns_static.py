#!/usr/bin/env python3
from pathlib import Path
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
proc = subprocess.run([sys.executable, str(ROOT / 'tools/check_runtime_contracts.py'), '--json'], cwd=str(ROOT), text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)
errors = []
if proc.returncode != 0:
    errors.append('tools/check_runtime_contracts.py --json failed:\n' + proc.stdout[-1500:])
else:
    try:
        result = json.loads(proc.stdout)
        if not result.get('ok'):
            errors.extend(result.get('errors') or ['runtime contract scanner returned ok=false'])
    except Exception as exc:
        errors.append(f'runtime contract scanner did not return JSON: {exc}')

if errors:
    print('NO FORBIDDEN RUNTIME PATTERNS TEST FAILED')
    for error in errors:
        print('-', error)
    sys.exit(1)
print('NO FORBIDDEN RUNTIME PATTERNS TEST OK')
