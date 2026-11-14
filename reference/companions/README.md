# Companion reference scripts

These two files are the standalone scripts that used to be loaded next to Nostrodomus as separate dashboard resources. Their behavior is now part of the bundle (`src/companion/`, see `docs/COMPANION_RESOURCES.md`). The files are not built, not bundled and not distributed.

| File | What it was |
| --- | --- |
| `nostrodomus_editor_v17_2_learned_reapply.js` | Editor layout script (version string `nostrodomus-editor-v17.2.65-runtime-coordinator`): codebox height, scrollbar and dialog stylesheets, re-apply on dialog changes, typing quiet window |
| `nostrodomus-picker-safe.js` | Picker script (version string `nostrodomus-picker-safe-v3-runtime-coordinator`): styling fix for entity pickers and popovers, postponed during typing |

Both contain the same installer for the shared runtime coordinator (`docs/RUNTIME_COORDINATOR.md`).

## Why they are kept

Tests read these files as the reference for code that was carried over unchanged:

- `tests/companion/scrollbar_css_byte_identity.test.mjs`: the scrollbar and dialog stylesheets in `src/companion/scrollbarStyleRuntime.js` are byte for byte the ones in the editor script.
- `tests/companion/picker_style_runtime.test.mjs`: the same for the picker stylesheets in `src/companion/pickerStyleRuntime.js`.
- `tests/companion/coordinator_api_parity.test.mjs`: the coordinator in `src/core/runtimeCoordinator.js` exposes the same API and state as the installer in these files.
- `tests/companion/quiet_window_semantics.test.mjs`: the quiet-window functions match the picker script.
- The static tests `tests/test_runtime_coordinator_unification_static.py`, `tests/test_companion_console_gating_static.py`, `tests/test_editor_blur_preview_prepaint_static.py`, `tests/test_v17_settings_tab_guard_static.py` and `tests/test_resource_consolidation_static.py`, and the tools `tools/verify.py` and `tools/check_runtime_contracts.py`, check for tokens in the two scripts.

Do not edit the two files: the tests above treat them as fixed input. Lint and type checking skip this directory (`eslint.config.js`, `jsconfig.json`).
