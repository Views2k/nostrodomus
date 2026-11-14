# Runtime Constants Module Contract

`src/core/runtimeConstants.js` is the third wired low-risk extraction from `src/main.legacy.js`.

## Ownership

This module owns only shared static runtime constants:

```text
SECURITY_LIMITS
STATIC_PROVIDER_ID
HA_VALUE_PROVIDER_ID
LOVELACE_CONTEXT_PROVIDER_ID
SNIPPET_PROVIDER_ID
```

## Purity rule

The module must stay pure and deterministic. It must not read or write:

```text
window
document
localStorage
sessionStorage
Home Assistant runtime state
DOM/querySelector targets
events
timers
network/fetch
```

## Behavior boundary

This extraction must not move provider registration, suggestion logic, settings behavior, syntax behavior, styling behavior, preview behavior, diagnostics scheduling, or CodeMirror lifecycle code. Those behaviors remain owned by `src/main.legacy.js` until a later behavior-specific extraction has parity tests.

## Build rule

`src/main.legacy.js` imports the constants and `dist/nostrodomus.js` must contain the bundled constants (e.g. `var SECURITY_LIMITS=`; the minified bundle strips module-path comments). Directly copying `src/main.legacy.js` to dist is unsafe once active imports exist.

## Verification tokens

Static checks should verify:

```text
from './core/runtimeConstants.js'
export const SECURITY_LIMITS
STATIC_PROVIDER_ID
HA_VALUE_PROVIDER_ID
LOVELACE_CONTEXT_PROVIDER_ID
SNIPPET_PROVIDER_ID
HACS_CATALOG_PROVIDER_ID
WORD_FALLBACK_PROVIDER_ID
No window/document access
```
