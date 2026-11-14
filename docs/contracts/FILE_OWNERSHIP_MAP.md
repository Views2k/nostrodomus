# File Ownership Map

This map defines which part of the project owns each active file family. It is a decision aid before editing; it is not permission to refactor runtime behavior without tests.

## Source-of-truth rule

The current source files are implementation truth. Documentation describes intent and guardrails, but source files and verified runtime behavior decide what a change may safely touch.

## Root release files

```text
PROJECT.json            machine-readable project identity, version truth, runtime aliases, policy fields
package.json            npm build/test metadata; version must match PROJECT.json
package-lock.json       locked npm metadata; root package versions must match PROJECT.json
README.md               public product overview
CONTRIBUTING.md         build/test/verify workflow
DESIGN.md               product architecture for contributors
hacs.json               HACS frontend plugin metadata
LICENSE                 MIT license
```

Ownership: release/project hygiene. Changes here must be paired with version truth updates and static verification.

## Runtime files

```text
src/main.js                  one-line bundler side-effect import; do not expand casually
src/core/version.js          pure runtime identity constants only
src/core/settingsStorageKeys.js pure settings storage key constants only
src/core/runtimeConstants.js pure security limit/provider ID constants only
src/main.legacy.js           runtime composition root; wires the extracted modules
dist/nostrodomus.js built/packaged browser resource; must match source/runtime version truth
reference/companions/*       frozen companion REFERENCES (behavior absorbed into src/companion/; moved from companion_www/ at ABSORB closeout); especially the v17 preview/layout bridge
```

Ownership: runtime behavior. Do not split, reorder, or restyle these files without identifying the guarded subsystem and running targeted checks. Version-string changes and changelog-summary text are allowed for release metadata when behavior is unchanged.

## Extracted source modules

```text
src/core/*
src/editor/*
src/providers/*
src/completion/*
src/context/*
src/companion/*
src/diagnostics/*
src/snippets/*
src/languages/*
src/syntax/*
src/ui/*
src/yaml/*
```

Ownership: wired runtime modules composed by `src/main.legacy.js`. `tools/check_module_wiring.py` fails on new unwired modules unless allowlisted. Before moving code between modules, prove parity with static/runtime tests and keep the old behavior available until verified.

## Styling and syntax ownership

```text
docs/contracts/STYLE_OWNERSHIP_CONTRACT.md   binding style/codebox/syntax guardrail
src/main.legacy.js + src/ui/* + src/syntax/* active implementation owners
dist/nostrodomus.js                 deployed equivalent
```

The host-owned codebox frame/glow model, stable style-node lifecycle, source-class syntax styling, and CSS Custom Highlight ranges are owned together. Do not move one part without verifying the others.

## Settings ownership

```text
docs/contracts/SETTINGS_PORTAL_CONTRACT.md   binding Settings portal/drag guardrail
src/main.legacy.js + src/ui/*                active implementation owners
dist/nostrodomus.js                 deployed equivalent
```

Settings must remain inside the active Home Assistant modal dialog/top-layer portal. Drag position is viewport-based but rendered in portal-local coordinates. Settings controls must not close/reopen the panel or reset scroll/tab state during ordinary changes.

## Tooling ownership

```text
tools/build.py                    reproducible build wrapper
tools/verify.py                   release/dev verification gate
tools/check_module_wiring.py      module wiring guard
tools/check_runtime_contracts.py  read-only known-bad/required-token scanner
tools/verify_reproducible_build.py reproducible-build comparison
tools/validate_snippets.py        snippet catalog validation
tools/version_bump.py             controlled version string updater
tools/run_node_tests.mjs          executed-test runner behind npm test
tools/check_js_syntax.mjs         node --check sweep helper
tools/public_runtime_contract_runner.mjs  public API contract enforcement helper
tools/visual_layer_doctor.py      style-ownership validation helper
tools/triage_catches.py           catch-block pattern triage helper
```

These tools must default to safe/read-only behavior unless a write flag or explicit output path is provided. They must not write to `/config/www` or edit Home Assistant storage.

## Test ownership

```text
tests/test_*_static.py     static regression and structural guard tests
tests/**/*.test.mjs        executed JavaScript behavior/sanitize tests
```

Static tests preserve hard-won behavior and failed-approach knowledge. Do not delete a failing test to pass verification. Update tests only when the implementation change is intentional, documented, and covered by a stronger guard.

## Generated and non-source files

```text
reports/*.txt             generated by tools/build.py and tools/verify.py
*.backup_*                local edit backups; never committed
```

Generated or local files are not source of truth and stay out of the repository.
