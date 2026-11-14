# Nostrodomus Project Structure

This document defines which files are active, which files are generated, and which
historical artifacts should stay out of the repository.

## Contracts and reference docs

```text
docs/contracts/RUNTIME_SCOPE_CONTRACT.md            runtime/editor/dashboard ownership boundary
docs/contracts/RUNTIME_IDENTITY_MODULE_CONTRACT.md  runtime identity module rules
docs/contracts/SETTINGS_STORAGE_KEYS_MODULE_CONTRACT.md settings storage keys module rules
docs/contracts/RUNTIME_CONSTANTS_MODULE_CONTRACT.md runtime constants module rules
docs/contracts/STYLE_OWNERSHIP_CONTRACT.md          codebox frame, syntax, CSS token, and style-registry ownership
docs/contracts/SETTINGS_PORTAL_CONTRACT.md          Settings top-layer portal, drag, and interaction stability rules
docs/contracts/VISUAL_LAYER_BASELINE_CONTRACT.md    protected visual layer baseline
docs/contracts/FILE_OWNERSHIP_MAP.md                active file ownership and source-of-truth boundaries
docs/contracts/NO_TOUCH_REGRESSION_LIST.md          historical failed approaches and forbidden patterns
docs/contracts/MODULE_WIRING_ALLOWLIST.json         allowlist for intentionally unwired modules
```

These files exist to reduce future guesswork. They should be read before runtime or
styling changes.

## Active runtime/build ownership

```text
src/main.js                         bundler entry; must stay a one-line side-effect import
src/main.legacy.js                  runtime composition root; wires the modules
src/core/                           identity, constants, settings/state/logging runtimes, delegate bridge
src/completion/                     popup, scoring, filtering, insertion, snippets runtime
src/providers/                      provider registry/runtime and suggestion providers incl. live hass data
src/yaml/                           context detection, branch state, YAML scanning
src/syntax/                         tokenizers, highlight runtime, source-class builders
src/editor/                         CodeMirror bridge, active-editor cache, dispatch
src/ui/                             settings panel/portal and codebox frame/style runtimes
src/ui/settings/                    settings owner factories: geometry, controls, stylesheet, sections, shell
src/ui/codebox/                     codebox owner factories: preflight, settle/reapply, unclip
src/diagnostics/                    health, context diagnostics, performance metrics, telemetry
src/languages/                      embedded language detection, provider contract, lane ranking
src/context/                        context snapshot runtime adapter + resolver
src/companion/                      absorbed v17 companion runtimes: settle/reapply scheduler, codebox enlarge, scrollbar/picker styling, input-quiet, coordinator (default-dormant, gated by companionModuleDormant)
src/snippets/                       snippet catalog module
data/snippets.json                  validated snippet catalog
dist/nostrodomus.js        browser resource built from src/main.js with esbuild
reference/companions/               frozen companion references (behavior absorbed into src/companion/)
                                    (nostrodomus_editor_v17_2_learned_reapply.js, nostrodomus-picker-safe.js)
```

(Per-directory file counts are intentionally omitted here — they drift on every commit and become a standing staleness source; `npm run check:modules` reports the authoritative wired-module total.)

## Active diagnostics and verification

```text
tools/build.py                      reproducible build wrapper; writes reports/BUILD_LAST.txt
tools/verify.py                     release/dev verification gate (runs tests/test_*_static.py)
tools/check_module_wiring.py        fails on new unwired src modules
tools/check_runtime_contracts.py    read-only known-bad runtime pattern scanner
tools/verify_reproducible_build.py  compares a temp esbuild bundle against committed dist
tools/validate_snippets.py          snippet catalog schema validation
tools/version_bump.py               controlled version truth updater
tools/run_node_tests.mjs            executed-test runner behind npm test (Node >= 20 unit-suite preflight; engines >= 22 is the product/e2e floor)
tools/check_js_syntax.mjs           node --check sweep helper
tools/public_runtime_contract_runner.mjs  public API contract enforcement helper
tools/visual_layer_doctor.py        style-ownership validation helper
tools/triage_catches.py             catch-block pattern triage helper
tests/                              executed *.test.mjs behavior tests + test_*_static.py structural guards
tests/ui/*parity*.test.mjs + settings_stylesheet_snapshot.test.mjs
                                    frozen decomposition parity pins — never modify
tests/perf/                         wall-clock budget tests; npm run test:perf only (excluded from npm test)
reports/*.txt                       generated; not source of truth
```

The full gate is `npm run gate` (lint, typecheck, module wiring, tests, build,
release verify, reproducible build, snippet validation).

## Required reference docs at root

```text
README.md                           public project overview
CONTRIBUTING.md                     build/test/verify workflow
DESIGN.md                           product architecture for contributors
SECURITY.md                         security posture
SUPPORT.md                          support/issue triage
SMOKE.md                            standing browser smoke checklist
docs/SYNTAX_COLORING_REFERENCES.md  syntax coloring references and role model
```

## Non-functional artifacts

The following have no runtime, build, verify, test, Home Assistant, or HACS ownership and
must not appear in the repository:

```text
nostrodomus/               accidental nested repo copy
*.backup_*                          local in-place edit backups
*.tar.gz, *.tgz                     local archives
reports/*.txt                       generated reports; recreated by build/verify
old v30 dist filenames              superseded generated artifacts
```

`tools/verify.py` fails on backup files in the active tree and on legacy generated dist
artifacts.

## Syntax architecture baseline

The current good syntax model:

```text
source-class CodeMirror styling + CSS Custom Highlight document ranges
```

Do not return to broad whole-line color inheritance. Do not return to the old inline DOM
token painter except as a fallback when Home Assistant no longer exposes CodeMirror
internals or the browser lacks CSS Custom Highlight support.

## Pure core modules

`src/core/version.js`, `src/core/settingsStorageKeys.js`, and
`src/core/runtimeConstants.js` are pure constant modules (identity, settings storage
keys, security/provider constants). They must stay free of browser globals; behavior
that uses them lives in the runtime modules.
