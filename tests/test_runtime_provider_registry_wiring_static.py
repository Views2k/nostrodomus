#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
LEGACY = ROOT / 'src/main.legacy.js'
# The legacy provider-candidate delegation (return providerRuntime.providerCandidates(ctx))
# was extracted out of main.legacy.js into the dedicated adapters module during the
# monolith split; re-point the moved tokens to their current home.
ADAPTERS = ROOT / 'src/composition/mainLegacyAdapters.js'
REGISTRY = ROOT / 'src/providers/providerRegistry.js'
RUNTIME = ROOT / 'src/providers/providerRuntime.js'
DIST = ROOT / 'dist/nostrodomus.js'
REPORT = ROOT / 'reports/RUNTIME_PROVIDER_REGISTRY_WIRING_STATIC_TEST_REPORT.txt'

legacy = LEGACY.read_text(encoding='utf-8', errors='replace')
adapters = ADAPTERS.read_text(encoding='utf-8', errors='replace')
registry = REGISTRY.read_text(encoding='utf-8', errors='replace')
runtime = RUNTIME.read_text(encoding='utf-8', errors='replace')
dist = DIST.read_text(encoding='utf-8', errors='replace') if DIST.exists() else ''
errors = []
notes = []

def require(ok, msg):
    if ok:
        notes.append('PASS ' + msg)
    else:
        errors.append(msg)

for token in [
    "import { createProviderRuntime } from './providers/providerRuntime.js';",
    'const providerRuntime = createProviderRuntime({',
    'createProviderRuntimeDelegates(() => providerRuntime)',
    'const { loadLibrary, sanitizeLibraryRow, normalizeItem, clearCompletionCache, cacheSet, registerProvider',
    'runtimeProviderRegistryLimits, runtimeProviderRegistryDeps } = providerDelegates',
    'createDiagnosticsRuntimeDelegates(() => diagnosticsRuntime)',
    'providerSummaryLegacy, providerSummary',
]:
    require(token in legacy, f'legacy runtime delegates provider registry ownership token: {token}')

# The legacy host's provider-candidate fall-through delegation moved into the
# createMainLegacyProviderAdapters factory; assert the SAME delegation (host -> providerRuntime,
# with a fall-through to providerCandidatesLegacy) at its current location.
for token in [
    'return providerRuntime.providerCandidates(ctx);',
    'return providerRuntime.providerCandidatesLegacy(ctx);',
]:
    require(token in adapters, f'legacy provider adapter delegates to provider runtime token: {token}')

# The provider runtime sources every registry symbol from the registry module and delegates
# through it. The per-symbol `... as ...FromRegistry` import aliases were collapsed into a single
# `import * as registry from './providerRegistry.js'` namespace import (the "kill FromModule
# import-alias ceremony" pass); assert the SAME ownership (registry module is the source, each
# wired function delegates into it) at its current form.
for token in [
    "import * as registry from './providerRegistry.js';",
    "registry.providerCandidates(ctx, state, runtimeProviderRegistryDeps())",
    "registry.providerCandidatesLegacy(ctx, state, runtimeProviderRegistryDeps())",
    "registry.registerProvider(provider, state)",
    "registry.providerDiagnosticId(provider)",
    "registry.providerTimeoutBudgetMs(provider, runtimeProviderRegistryLimits())",
    "export function createProviderRuntime",
    "function runtimeProviderRegistryLimits()",
    "function runtimeProviderRegistryDeps()",
    "function providerCandidates(ctx)",
    "function providerCandidatesLegacy(ctx)",
    "function registerProvider(provider)",
]:
    require(token in runtime, f'provider runtime owns registry wiring token: {token}')

for token in [
    "export function createProviderRegistry",
    "export function registerProvider",
    "export function providerCandidates",
    "export function providerCandidatesLegacy",
    "export function providerSummary",
    "export function validateProviderRows",
]:
    require(token in registry, f'provider registry module contains export token: {token}')

# The bundled dist is minified: argument lists lose the source whitespace after each comma
# (e.g. `(ctx, registryState` -> `(ctx,registryState`). Assert the minified form so the test
# checks the SAME shipped function signatures without being fooled by source spacing.
for token in [
    'provider-registry:runtime-module',
    'provider-registry:summary',
    'function providerCandidates(ctx,registryState',
    'function providerCandidatesLegacy(ctx,registryState',
    'function providerSummary(registryState',
    'function registerProvider(provider,registryState',
]:
    require(token in dist, f'bundled dist contains provider registry wiring token: {token}')

for forbidden in [
    "providerCandidates as providerCandidatesFromRegistry",
    "providerCandidatesLegacy as providerCandidatesLegacyFromRegistry",
    "registerProvider as registerProviderInRegistry",
    "return registerProviderInRegistry(provider, state);",
    "providerCandidatesFromRegistry(ctx, state, runtimeProviderRegistryDeps())",
    "return providerCandidatesLegacyFromRegistry(ctx, state, runtimeProviderRegistryDeps());",
    "function providerCandidates(ctx) {\n    if (!ctx?.shouldSuggest",
    "function providerCandidatesLegacy(ctx) {\n    if (!ctx?.shouldSuggest",
]:
    require(forbidden not in legacy, f'legacy runtime no longer owns provider registry token: {forbidden[:100]}')

REPORT.write_text(
    'Runtime provider registry wiring static test report\n\nResults:\n' + '\n'.join(notes) + '\n\nErrors:\n' + '\n'.join(errors) + '\n',
    encoding='utf-8',
)

if errors:
    print('RUNTIME PROVIDER REGISTRY WIRING STATIC TEST FAILED')
    for e in errors:
        print('-', e)
    print('Report:', REPORT)
    sys.exit(1)

print('RUNTIME PROVIDER REGISTRY WIRING STATIC TEST OK')
for n in notes:
    print(n)
print('Report:', REPORT)
