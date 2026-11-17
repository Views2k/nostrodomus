# Nostrodomus companion layer

The companion layer is the part of Nostrodomus that sizes and styles the editor around the code: the height of the codebox, the scrollbars, the dialog layout, and the re-apply logic that keeps this in place while Home Assistant rebuilds the dialog. It lives in `src/companion/` and ships inside `dist/nostrodomus.js`. No separate resource has to be registered for it.

The same behavior used to come from two standalone scripts, `nostrodomus_editor_v17_2_learned_reapply.js` and `nostrodomus-picker-safe.js`. They are not distributed any more. Copies are kept under `reference/companions/` because tests compare the bundled code with them (see the README in that directory).

## Modules

| Module | What it does | Default |
| --- | --- | --- |
| `coordinatorRuntime.js` | Decides whether the layer is active, detects a loaded standalone script, reads the override key | - |
| `companionStyleRuntime.js` | Injects the scrollbar stylesheet and the editor layout stylesheets (dialog size, line wrapping, preview fill, glass editor dialog, optional hiding of editor warnings) | active |
| `codeboxEnlargeRuntime.js` | Makes the codebox taller in editors without the option tab row and remembers the mode per dialog | active |
| `companionSettleRuntime.js` | Re-applies the styling when the dashboard or the dialog changes: mutation observers plus a series of delayed passes up to 2800 ms after an event | active |
| `inputQuietRuntime.js` | Postpones style, syntax refresh and diagnostics work while the user types | active |
| `pickerStyleRuntime.js` | Transparency and blur fix for entity pickers and popovers | dormant |

The scrollbar and picker stylesheets are kept byte for byte equal to the stylesheets of the standalone scripts. `tests/companion/scrollbar_css_byte_identity.test.mjs` and `tests/companion/picker_style_runtime.test.mjs` fail when they differ. The card dialog stylesheet is injected without its last rule, which hid every `ha-alert`, `[role="alert"]`, `.warning` and `.error` in the dialog and so the messages of the card preview; `tests/companion/dialog_root_alert_rule.test.mjs` checks that nothing else differs.

The companion layer sets heights and overflow on `.cm-editor` and `.cm-scroller`. The codebox style runtime in `src/ui/` leaves those elements alone (see `docs/contracts/STYLE_OWNERSHIP_CONTRACT.md`).

## Active, dormant, external

Every companion module asks `src/companion/coordinatorRuntime.js` before it does anything:

- `internal`: no standalone script is loaded. Each module follows its default from the table above.
- `external`: a standalone script is loaded. It has registered itself in the shared runtime coordinator (`docs/RUNTIME_COORDINATOR.md`) as `v17-editor-bridge` or `picker-safe`. The bundled layer stays dormant so that the two do not apply the same styles twice.
- `dormant(forced)`: the layer was switched off by hand.

The current value is part of the diagnostics:

```js
window.__nostrodomus.exportDiagnostics().companionLayer
// "internal" | "external" | "dormant(forced)"
```

For debugging, the `nostrodomusCompanion` key in `localStorage` overrides the defaults: `dormant` switches the whole layer off, `active` switches on the modules that are dormant by default. Remove the key to return to the defaults. The value is read again within a second.

## Standalone scripts still registered

An installation that was set up before the companion layer moved into the bundle may still load the standalone scripts as dashboard resources:

- `/local/nostrodomus_editor_v17_2_learned_reapply.js`
- `/local/nostrodomus-picker-safe.js`

They keep working, and the bundled layer stays dormant while they are loaded. To switch to the bundled layer:

1. In Home Assistant open Settings, Dashboards, the menu in the top right, Resources, and delete the two entries.
2. Delete the two files from the `www` folder of the configuration directory.
3. Reload the page without the cache. `companionLayer` in the diagnostics now reads `internal`.

The completion data is bundled as well. Resources named `/local/nostrodomus-library-core-v1.js` or `/local/nostrodomus-library-webdev-v1.js` are not loaded by Nostrodomus and can be deleted in the same place.
