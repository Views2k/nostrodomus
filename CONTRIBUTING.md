# Contributing

Bug reports and pull requests are welcome. Keep changes focused and verified. For a bug
report, see [SUPPORT.md](SUPPORT.md).

## Build, test, and verify

From a fresh clone, with Node 22 or newer and Python 3:

```bash
npm ci                  # install the pinned development dependencies
python3 tools/build.py  # build dist/nostrodomus.js and write reports/BUILD_LAST.txt
npm run gate            # lint, typecheck, module wiring, tests, build,
                        # release verification, reproducible build, snippet validation
```

The gate must pass before a change is done. Its parts can be run on their own:

- `npm test` runs the behavior tests under `tests/**/*.test.mjs`. The wall-clock budget
  tests under `tests/perf/` are not part of it and run with `npm run test:perf`. One file
  runs with `node --test tests/<dir>/<file>.test.mjs`.
- The static tests under `tests/test_*_static.py` are structure guards. `tools/verify.py`
  runs all of them. One file runs with `python3 tests/<file>.py`.
- `python3 tools/verify.py --release` needs `reports/BUILD_LAST.txt` from a build of the
  current sources and fails with "run tools/build.py first" without it. The gate runs
  `tools/build.py` before it.
- `python3 tools/check_runtime_contracts.py` is a fast scan for forbidden runtime patterns,
  and `python3 tools/visual_layer_doctor.py` checks the codebox visual layers. Run both
  before and after a change to codebox, syntax or settings styling.

## Browser tests

The browser tests under `tests/e2e/` run the built bundle in Chromium (Playwright) against a
disposable Home Assistant container. They need Docker and a POSIX shell, and are not part of
the gate or of CI.

```bash
npx playwright install chromium   # once
npm run e2e:up                    # start and seed the container
npm run e2e                       # run the tests
npm run e2e:down                  # stop the container
```

`npm run e2e:beta` runs the same cycle against the Home Assistant beta image, with its own
state directory. `tools/e2e/README.md` describes the setup. When the tests pass on a new
Home Assistant version, add it to [docs/COMPAT.md](docs/COMPAT.md) and to the
compatibility section of [DOCUMENTATION.md](DOCUMENTATION.md#compatibility-and-versioning).

## Rules

- Nostrodomus is the public product name.
- `window.__nostrodomus` is the public runtime namespace. Keep it.
- No network calls from Nostrodomus code, no unsafe HTML rendering, no `eval`, and no arbitrary user CSS.
- Settings changes apply in place. They must not close and reopen the settings panel or
  reset its tab and scroll position.
- Prefer small changes that can be reviewed and reverted over rewrites of the runtime.
- Read the relevant contract under [`docs/contracts/`](docs/contracts/) before changing
  runtime scope, settings, styling, or syntax behavior.
- The two scripts under `reference/companions/` are frozen references for the parity
  tests. Do not modify them.
- Never edit `dist/` by hand. It changes only through `tools/build.py`, together with the
  source change.

## Versions and the changelog

- The version must agree in `PROJECT.json`, `package.json`, `package-lock.json`,
  `src/core/version.js`, and `dist/`. Run `python3 tools/version_bump.py <version> <slug>`
  for the source files, then rebuild dist with `tools/build.py`.
- For each version, add a section to [CHANGELOG.md](CHANGELOG.md), written for users, and
  update `src/core/changelogSummary.js`, which holds the five most recent versions. A test
  requires its first entry to be the current version.
- When `dist/` changes, record its new SHA256 in the commit message.

## Module purity

`src/core/version.js`, `src/core/settingsStorageKeys.js`, and `src/core/runtimeConstants.js`
must stay pure and free of side effects (no `window`, `document` or storage access).
`tools/verify.py` checks this.

## CI

Changes to the default branch merge after the GitHub Actions CI workflow is green. CI runs
the steps of the gate on every push and pull request, plus the performance budget tests as
a step that cannot fail the run.
