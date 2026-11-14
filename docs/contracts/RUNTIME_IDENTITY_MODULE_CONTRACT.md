# Runtime Identity Module Contract

`src/core/version.js` is the single source of truth for the version and identity constants of the browser runtime. Other modules import them from here and do not repeat the literal values.

## Exports

| Constant | Meaning |
| --- | --- |
| `VERSION` | Internal version string, `nostrodomus-v<version>-<slug>`. Equal to `internal_version` in `PROJECT.json` |
| `PROJECT_VERSION` | The version number. Equal to `version` in `PROJECT.json` and in `package.json` |
| `PROJECT_RELEASE_STATE` | Release channel shown in diagnostics |
| `LIVE_COMPANION_EDITOR_VERSION` | Version string of the standalone editor script that the companion layer was taken from; reported in diagnostics |
| `PRODUCT_NAME` | `Nostrodomus` |
| `LOG_PREFIX` | Prefix of console messages |
| `SETTINGS_WRITE_KEY` | `localStorage` key of the settings, `nostrodomus.settings` |
| `FRECENCY_WRITE_KEY` | `localStorage` key of the accepted-completion counts, `nostrodomus.frecency` |

## Purity

The module contains constants only:

```text
No window/document access
No localStorage/sessionStorage access
No timers
No event listeners
No DOM query or mutation
No Home Assistant runtime reads
No network calls
```

`tools/verify.py`, `tools/check_runtime_contracts.py` and `tests/test_runtime_identity_module_static.py` fail when the module references one of these, when `src/main.legacy.js` declares `VERSION` or `PROJECT_VERSION` itself, or when the values differ from `PROJECT.json`.

## Version change

The version appears in these files, and they must agree:

```text
src/core/version.js
PROJECT.json
package.json
package-lock.json
dist/nostrodomus.js
```

`python3 tools/version_bump.py <version> <slug>` updates the first four. After that, update the release list in `src/core/changelogSummary.js` and rebuild the bundle with `python3 tools/build.py`. The bundle is always produced by esbuild from `src/main.js`; `dist/nostrodomus.js` is not edited by hand. `python3 tools/verify.py --release` fails when one of the files is out of step.
