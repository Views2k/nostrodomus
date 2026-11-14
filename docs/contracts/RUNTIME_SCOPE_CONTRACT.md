# Contract: Runtime Scope and Ownership

Nostrodomus changes Home Assistant's code editors and nothing else on the page. This contract states where the runtime may act and which approaches are ruled out.

## Runtime shape

`src/main.js` is the bundler entry and only imports `src/main.legacy.js`, which composes the modules under `src/`. esbuild bundles them into `dist/nostrodomus.js`. That file is what the browser loads, so behavior is verified against it.

`window.__nostrodomus` is the public API for support and debugging. The only other global on `window` is the shared coordinator object described in `docs/RUNTIME_COORDINATOR.md`.

## Where the runtime acts

- The card edit dialog and the code editor inside it.
- The code editors of the pages listed in `UNIVERSAL_PANEL_HOSTS` in `src/editor/haSelectors.js`: Developer Tools, the raw dashboard configuration editor, and the automation and script editors. `settings.style.universalCodebox` and `settings.style.universalAutocomplete` switch this off; both are on by default and have no control in the settings panel.

`isViewAllowed` and `viewFromEvent` in `src/editor/activeEditor.js` decide whether a keystroke or an editor view belongs to one of these surfaces. A key pressed on the dashboard and an editor inside a third-party card do not pass.

The same holds inside the card edit dialog for the visual editor a custom card supplies. `insideCardOwnEditor` in `src/editor/cardOwnEditor.js` answers by position: an element is the card's when the nearest element editor above it (`hui-card-element-editor` and the like) holds it in its card editor area and the editor element there is not one of Home Assistant's. Editor discovery, the scope checks above, the dialog and codebox sizing, the companion stylesheets and the switch for Home Assistant's built-in suggestions all ask it and leave such elements alone. Home Assistant's YAML editor is never inside that area, also when it is nested in a visual editor (the card of a stack).

DOM ownership:

| Area | What Nostrodomus does there |
| --- | --- |
| Dashboard, sidebar, cards | Nothing: no styles, no pointer handlers, no keyboard handling |
| Edit dialog and its top layer | Hosts the settings panel portal, receives the dialog layout styles. While `settings.style.glassDialog` is on (the default), the companion layer also makes the dialog surface translucent with a backdrop blur, through a stylesheet in the shadow root of `hui-dialog-edit-card` (`src/companion/scrollbarStyleRuntime.js`). The dashboard is seen through the dialog and is not styled |
| `ha-code-editor` and the CodeMirror root | Completion popup, syntax styling, codebox frame |
| A custom card's own visual editor | Nothing: no styles, no sizing, no completion, no keyboard handling. A code box in it keeps the suggestions the card turned on. The dialog is not enlarged or restyled because of it |
| Card preview | The cards in it are observed only to avoid duplicate work. Home Assistant's `value-changed` and `input` events are never intercepted or replayed. The preview pane itself (`.element-preview`) gets the dialog layout styles and, while `settings.style.glassDialog` is on, a transparent background, from the same companion module |

## Required behavior

- Styles are added to the roots of active editors and removed again when no editor is open. No rule may target the dashboard or change `overflow`, `clip-path` or masks outside the editor chain. `tests/test_dashboard_style_containment_static.py` checks this.
- Mutation observers ignore records that only concern CodeMirror's own content, so typing does not restart style or lifecycle work (`mutationRecordsAreCodeMirrorOnly` in `src/editor/editorLifecycleSentinel.js`).
- Nothing scans or restyles the page while no editor is open.
- CodeMirror's default typing behavior stays intact. Keys with a modifier other than the documented shortcuts belong to the editor.
- `window.__nostrodomus.uninstall()` removes listeners, observers, styles and overlays.
- Build and verify tools never write to a Home Assistant configuration directory.

## Ruled out

- `eval`, `new Function`, `fetch`, `sendBeacon`, telemetry, loading code at runtime.
- Pointer or keyboard handlers for the whole document that act outside an editor.
- Debouncing, capturing or replaying Home Assistant's preview events.
- Mounting the settings panel in `document.body` while a modal dialog is open (see `SETTINGS_PORTAL_CONTRACT.md`).
- Removing and re-adding stable style elements on every pass (see `STYLE_OWNERSHIP_CONTRACT.md`).

`tools/check_runtime_contracts.py` fails when `src/main.legacy.js` or the bundle contains one of the markers of these approaches. `tests/test_no_forbidden_runtime_patterns_static.py` runs it as part of `tools/verify.py`.

## Checks in a browser

- Dashboard cards and icons react to clicks as usual before any editor was opened.
- Ctrl+Space does nothing on the dashboard.
- Ctrl+Space opens the suggestion list inside an editor.
- After the editor is closed, no Nostrodomus style or overlay remains on the dashboard.

The browser suite covers the editor side of this list (`tests/e2e/`, see `tools/e2e/README.md`).
