# Contributing

Nostrodomus changes should be focused, reversible, and verified.

## Build, test, and verify

From a fresh clone (Node >= 20, Python 3):

```bash
npm ci                  # install pinned dev dependencies
python3 tools/build.py  # build dist/ and write reports/BUILD_LAST.txt (verify needs it)
npm run gate            # the full gate: lint, typecheck, module wiring, tests,
                        # build, release verify, reproducible build, snippet validation
```

The gate must pass before a change is considered done. `npm test` runs the executed
behavior tests under `tests/**/*.test.mjs` (excluding `tests/perf/`, which runs via
`npm run test:perf`); static Python tests under `tests/test_*_static.py` are structural
guards and run through `tools/verify.py`. `tools/check_runtime_contracts.py` is
available as a fast standalone scan of the runtime/style/contract no-touch rules.
Note: `tools/verify.py --release` needs `reports/BUILD_LAST.txt` (it fails with "run
tools/build.py first" if missing) and a clean esbuild release build; the gate runs
`tools/build.py` ahead of it.

## Rules

- Use Nostrodomus as the public product name.
- Preserve `window.__nostrodomus` as the single public runtime namespace.
- Do not disable live updating.
- Do not rewrite the runtime wholesale.
- Do not add network calls, unsafe HTML rendering, `eval`, or arbitrary user CSS injection.
- Refresh the in-app five-release window in `src/core/changelogSummary.js` in the same
  commit as every change, and record the new dist SHA256 in the commit message whenever
  `dist/` changes. (There is no `CHANGELOG.md` file.)
- Version truth must agree across `PROJECT.json`, `package.json`, `package-lock.json`,
  the runtime version module, and `dist/`. Run `tools/version_bump.py <version> <slug>`
  for the version surfaces, then refresh `changelogSummary.js` and rebuild dist with
  `tools/build.py`.
- Read the relevant contract under [`docs/contracts/`](docs/contracts/) before touching
  runtime scope, Settings, styling, or syntax behavior.
- The companion reference files `reference/companions/nostrodomus_editor_v17_2_learned_reapply.js`
  and `reference/companions/nostrodomus-picker-safe.js` are byte-frozen reference-only (behavior
  absorbed into `src/companion/`; moved from `companion_www/` at the ABSORB closeout) — do not
  modify them.

## Module purity

`src/core/version.js`, `src/core/settingsStorageKeys.js`, and `src/core/runtimeConstants.js`
must remain pure and side-effect-free (no `window`/`document`/storage access). Run
`python3 tools/build.py` so esbuild produces a self-contained dist file; never hand-edit
`dist/` without the matching source change.

## CI

Default-branch changes should merge only after the GitHub Actions CI workflow is green.
CI runs the same gate as the local commands above.
