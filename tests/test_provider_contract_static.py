#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
# The provider contract (validation, diagnostic ids, time budgets, isolated error recording)
# lives in providerRegistry.js and providerRuntime.js.
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
# The same tokens as esbuild writes them (no spaces in signatures and object literals).
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
    # The registry receives recordRuntimeError and recordRuntimeErrorOnce as `record` and
    # `recordOnce`. Each canHandle, provide, timeout and malformed-row failure is recorded under
    # its own diagnostic id, so one provider's failure stays isolated.
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
