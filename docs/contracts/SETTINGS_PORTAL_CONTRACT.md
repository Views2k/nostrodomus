# Contract: Settings Portal and Interaction Stability

The settings panel is drawn by Nostrodomus, but it has to live inside whatever Home Assistant has put on top. When the card editor is open, Home Assistant shows it in a native modal `<dialog>`. Content outside a modal dialog is inert: it can be visible and still receive no clicks, whatever its `z-index`. This contract describes where the panel is mounted and how it behaves while the user works with it.

## Where the panel is mounted

`ensureSettingsPortalHost` in `src/ui/settingsPortalRuntime.js` creates one host element, `#nostrodomus-settings-portal-host-v1`, and appends it to the first of these that exists:

1. the open top-layer `<dialog>` of the active editor,
2. the shadow root of the active edit dialog, or the dialog element itself,
3. the shadow root that contains the active code editor,
4. the `home-assistant` root,
5. `document.body`.

The host covers the viewport and lets pointer events through; the panel inside it receives them. The settings panel does not share the overlay host of the completion popup.

When the host is not inside a top-layer dialog, the panel is shown with the Popover API (`popover="manual"`), so it is still drawn above the page.

## Position and size

- The saved position (`settings.settingsPos`) and size (`settings.settingsSize`) are viewport coordinates.
- `applySettingsPanelViewportPosition` in `src/ui/settings/settingsGeometry.js` converts the saved position into coordinates of the portal host before it sets `left` and `top`.
- Positions are clamped to the viewport.

## Dragging

- Dragging by the header moves the panel with a transform, one update per animation frame.
- The new position is saved when the pointer is released, and only if the pointer moved at least 4 px. A click on the header without movement saves nothing.

## While settings change

- Changing a checkbox, a select or a slider keeps the active tab and the scroll position (`applySettingChangePreservingInteraction` in `src/ui/settingsInteractionRuntime.js`). The panel is not closed and reopened.
- While a slider or a color control is being moved, only a light preview runs (`scheduleStyleRangeLivePreview`). Saving and the full style pass happen after the change is committed or after a short delay.
- Escape closes the settings panel before it reaches the Home Assistant dialog.

## Ruled out

- Mounting the panel outside the active modal dialog while the card editor is modal.
- Using `z-index` in place of mounting inside the dialog.
- A separate overlay host on `document.documentElement` for the panel. `tests/test_settings_out_of_band_static.py` fails when the markers of that approach return.
- Saving a position on a header click that did not move the panel, or saving portal-local coordinates as viewport coordinates.
- Closing and reopening the panel for an ordinary control change, or resetting the tab or scroll position.
- Running the full style pass on every `input` event of a slider.

If the panel is visible but does not react to clicks, the mount point is wrong. Changing `z-index` or `pointer-events` does not fix that.

## Tests

- `tests/ui/settings_portal_runtime.test.mjs`, `tests/ui/settings_geometry_module.test.mjs`, `tests/ui/settings_panel_shell.test.mjs` and `tests/ui/settings_interaction_runtime_module.test.mjs` cover the modules named above.
- `tests/e2e/settings-panel.spec.mjs` opens the panel in a browser: tab switch, drag, value change, persistence, a header click without drag, and Escape.
- `tools/check_runtime_contracts.py` requires `ensureSettingsPortalHost`, `applySettingChangePreservingInteraction` and `scheduleStyleRangeLivePreview` to exist and rejects `document.body.appendChild(settings...)`.
