# Nostrodomus project structure

Where things are in the repository, which files are sources and which are generated.

## Root

```text
README.md                 project overview and installation
DOCUMENTATION.md          user reference: settings, shortcuts, providers, themes, console API
CHANGELOG.md              changes per version
CONTRIBUTING.md           build, test and verification workflow
DESIGN.md                 architecture for contributors
SECURITY.md               security posture and how to report an issue
SUPPORT.md                what to include in a bug report
LICENSE                   MIT
hacs.json                 HACS metadata (name, bundle file, minimum Home Assistant and HACS versions)
PROJECT.json              project version, internal version string and project policies read by the tools
package.json              npm scripts and development dependencies
eslint.config.js, jsconfig.json, prettier.config.cjs, .editorconfig, .nvmrc
                          lint, typecheck, format and editor configuration
.github/workflows/ci.yml  CI: the gate on every push and pull request
```

## Runtime source and bundle

```text
src/main.js               bundler entry; a one-line side-effect import of main.legacy.js
src/main.legacy.js        runtime composition root; wires the modules together
src/composition/          factories and adapters the composition root uses to build the runtimes
src/core/                 version, constants, default settings, settings storage, state, logging, public API
src/completion/           suggestion list, keymap, scoring, filtering, insertion, snippet sessions
src/providers/            provider registry and the suggestion providers, including live Home Assistant data
src/yaml/                 YAML context detection, branch state, scanning
src/context/              context snapshot adapter and resolver
src/languages/            embedded language detection and lane ranking
src/snippets/             snippet catalog module
src/syntax/               tokenizers, highlight ranges, source-class styling, paint scheduling
src/editor/               CodeMirror bridge, active-editor discovery and cache, dispatch hook, Home Assistant selectors
src/ui/                   settings panel and portal, codebox frame and style runtimes
src/ui/settings/          settings panel parts: shell, sections, controls, geometry, stylesheet
src/ui/codebox/           codebox parts: preflight style, settle and reapply, unclip
src/diagnostics/          health check, diagnostics export, performance telemetry, runtime error buffer
src/companion/            card dialog sizing, codebox fit, scrollbar and warning styling, picker styling,
                          typing-quiet coordination. Active by default, except the picker styling.
                          Stays dormant when a legacy companion resource is loaded.
data/snippets.json        the snippet catalog, validated by tools/validate_snippets.py
dist/nostrodomus.js       the browser resource, built from src/main.js with esbuild; committed
reference/companions/     two frozen legacy companion scripts, kept as reference for the parity tests
```

`npm run check:modules` reports how many modules under `src/` are wired into the bundle and fails on a module that is not.

## Tools

```text
tools/build.py                        build dist/nostrodomus.js and write reports/BUILD_LAST.txt
tools/verify.py                       verification gate; runs the static tests; --release adds the release checks
tools/verify_reproducible_build.py    compare a fresh esbuild bundle with the committed dist
tools/check_module_wiring.py          fail on a src module that is not wired
tools/check_runtime_contracts.py      scan for forbidden runtime patterns and required contract text
tools/visual_layer_doctor.py          check the codebox visual layer ownership
tools/validate_snippets.py            validate the snippet catalog
tools/version_bump.py                 update the version in PROJECT.json, package files and src/core/version.js
tools/run_node_tests.mjs              run tests/**/*.test.mjs (npm test); --perf runs tests/perf only
tools/check_js_syntax.mjs             node --check over the sources
tools/check_lint_coverage.mjs         confirm that lint inspected every src module
tools/public_runtime_contract_runner.mjs  helper that exercises the public API contract
tools/triage_catches.py               inventory of catch blocks; --write produces reports/CATCH_TRIAGE.md
tools/e2e/                            disposable Home Assistant container for the browser tests (see its README)
```

The full gate is `npm run gate`: lint, typecheck, module wiring, tests, build, release verification, reproducible build, snippet validation.

## Tests

```text
tests/**/*.test.mjs       executed behavior tests, by area (completion, providers, syntax, ui, yaml, ...)
tests/test_*_static.py    static structure guards, run by tools/verify.py
tests/fixtures/           shared fixtures
tests/perf/               wall-clock budget tests; npm run test:perf only, not part of npm test
tests/e2e/                Playwright browser tests against the container from tools/e2e (npm run e2e)
tests/ui/*parity*.test.mjs, tests/ui/*_snapshot.test.mjs
                          pin the settings stylesheet and control markup byte for byte
```

## Documentation

```text
docs/KNOWN_ISSUES.md      current limitations
docs/COMPAT.md            supported and tested Home Assistant versions, Home Assistant behavior to know
docs/HACS_INSTALL.md      HACS packaging: bundle file, metadata, release verification
docs/DIAGNOSTICS.md       diagnostics API and the runtime error buffer
docs/PROJECT_STRUCTURE.md this file
docs/contracts/           binding rules for runtime scope, styling, the settings portal and the pure modules
docs/THREAT_MODEL.md      what the plugin protects against and how the build enforces it
docs/*.md (other)         reference documents: provider contract, scoring, snippet schema, context descriptor,
                          runtime coordinator, companion resources, syntax coloring
docs/screenshots/         images used by README.md
```

Read the relevant contract under `docs/contracts/` before changing runtime scope, settings, styling or syntax behavior.

## Generated files

```text
dist/nostrodomus.js       committed; changes only together with the source change that produces it
reports/                  written by the build, verify and test tools; ignored by git, not a source of truth
tools/e2e/.ha-state*/     state of the test container; ignored by git
node_modules/             ignored by git
```

`tools/verify.py` fails when it finds `*.backup_*` files in the tree or old generated bundle files next to `dist/nostrodomus.js`.
