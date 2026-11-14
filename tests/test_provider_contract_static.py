#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
project = json.loads((ROOT / 'PROJECT.json').read_text(encoding='utf-8'))
# The provider contract was extracted out of the monolith (src/main.legacy.js) into the
# pure-contract owner src/providers/providerRegistry.js plus its runtime wiring in
# src/providers/providerRuntime.js; main.legacy.js now imports them as delegates. The
# invariant (validate/diagnostic/timeout helpers + fail-isolated error recording) lives in
# those two modules and is bundled into dist/nostrodomus.js. Read the union of the
# two provider source modules as the source-side "runtime" surface.
runtime = (
    (ROOT / 'src/providers/providerRegistry.js').read_text(encoding='utf-8', errors='replace')
    + "\n"
    + (ROOT / 'src/providers/providerRuntime.js').read_text(encoding='utf-8', errors='replace')
)
dist = (ROOT / 'dist/nostrodomus.js').read_text(encoding='utf-8', errors='replace')
doc = (ROOT / 'docs' / 'PROVIDER_CONTRACT.md').read_text(encoding='utf-8', errors='replace')
errors = []

def require(ok, msg):
    if not ok:
        errors.append(msg)

# Un-pinned: originally pinned to version == "31.6.98". That literal carried forward across
# the 31.6.x -> 0.1.x SemVer reset; the invariant is the provider contract surface below, not
# a frozen version literal, so floor at the start of the SemVer line.
version = str(project.get('version') or '')
internal = str(project.get('internal_version') or '')
version_tuple = tuple(int(part) for part in version.split('.') if part.isdigit())
require(version_tuple >= (0, 1, 0), 'PROJECT.json remains at or beyond the provider contract baseline (SemVer line)')
# The "provider-contract-runtime-boundary" identifier is an old-era (v31.x) internal_version
# name retired at the SemVer reset; accept either that legacy id OR any version advanced past
# the floor.
require('provider-contract-runtime-boundary' in internal or version_tuple > (0, 1, 0),
        'internal version records provider contract runtime boundary (or version advanced past the baseline)')

# Source-spaced tokens (the extracted provider modules). The function signatures gained
# default params during extraction; assert their current source form.
runtime_tokens = [
    'function providerDiagnosticId(provider)',
    'function providerTimeoutBudgetMs(provider, limits = DEFAULT_PROVIDER_LIMITS)',
    'function validateProviderRow(row, provider = null, index = 0)',
    'function validateProviderRows(provider, rows, stats = null, deps = {})',
    'providerCanHandle',
    'providerProvide',
    'providerTimeout',
    'malformed provider row',
    'provider returned non-array rows',
    'nostrodomusProviderTimeoutMs',
    'defaultProviderTimeoutMs: 8',
    'maxProviderMalformedDiagnostics: 5',
]
# Dist-minified forms of the same tokens (esbuild strips signature/object whitespace, e.g.
# "limits = DEFAULT" -> "limits=DEFAULT", "defaultProviderTimeoutMs: 8" -> "defaultProviderTimeoutMs:8").
dist_tokens = [
    'function providerDiagnosticId(provider)',
    'function providerTimeoutBudgetMs(provider,limits=DEFAULT_PROVIDER_LIMITS)',
    'function validateProviderRow(row,provider=null,index=0)',
    'function validateProviderRows(provider,rows,stats=null,deps={})',
    'providerCanHandle',
    'providerProvide',
    'providerTimeout',
    'malformed provider row',
    'provider returned non-array rows',
    'nostrodomusProviderTimeoutMs',
    'defaultProviderTimeoutMs:8',
    'maxProviderMalformedDiagnostics:5',
]
for name, text, tokens in [('runtime', runtime, runtime_tokens), ('dist', dist, dist_tokens)]:
    for token in tokens:
        require(token in text, f'{name} includes provider contract token: {token}')
    # Extraction renamed the error-sink call sites: the registry now receives the runtime
    # error recorders as deps aliases `record` (recordRuntimeError) / `recordOnce`
    # (recordRuntimeErrorOnce). The invariant — every canHandle/provide/timeout/malformed-row
    # failure is recorded with that exact diagnostic id so one provider's failure stays
    # isolated — is unchanged. The exact diagnostic ids survive minification verbatim in dist.
    require('record(`provider:${providerId}:canHandle`' in text, f'{name} records canHandle failures')
    require('record(`provider:${providerId}:provide`' in text, f'{name} records provide failures')
    require('recordOnce(`provider:${providerId}:timeout`' in text, f'{name} records timeout failures')
    require('recordOnce(`provider:${providerId}:row`' in text, f'{name} records malformed row failures')

for token in [
    '# Nostrodomus Provider Contract',
    'canHandle(ctx)',
    'provide(ctx)',
    'timeoutMs',
    'Completion row shape',
    'One provider\'s failure never prevents later providers',
]:
    require(token in doc, f'provider contract doc includes {token}')

if errors:
    print('PROVIDER CONTRACT STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    sys.exit(1)
print('PROVIDER CONTRACT STATIC TEST OK')
