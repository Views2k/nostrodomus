# Contract: Runtime Scope and Ownership

Nostrodomus changes Home Assistant's code editors and nothing else on the page. This contract states where the runtime may act and which approaches are ruled out.

## Runtime shape

`src/main.js` is the bundler entry and only imports `src/main.legacy.js`, which composes the modules under `src/`. esbuild bundles them into `dist/nostrodomus.js`. That file is what the browser loads, so behavior is verified against it.

`window.__nostrodomus` is the public API for support and debugging. The only other global on `window` is the shared coordinator object described in `docs/RUNTIME_COORDINATOR.md`.

## Where the runtime acts

- The card edit dialog and the code editor inside it.
- The code editors of the pages listed in `UNIVERSAL_PANEL_HOSTS` in `src/editor/haSelectors.js`: Developer Tools, the raw dashboard configuration editor, and the automation and script editors. `settings.style.universalCodebox` and `settings.style.universalAutocomplete` switch this off; both are on by default and have no control in the settings panel.

`isViewAllowed` and `viewFromEvent` in `src/editor/activeEditor.js` decide whether a keystroke or an editor view belongs to one of these surfaces. A key pressed on the dashboard and an editor inside a third-party card do not pass.

DOM ownership:

| Area | What Nostrodomus does there |
| --- | --- |
| Dashboard, sidebar, cards | Nothing: no styles, no pointer handlers, no keyboard handling |
| Edit dialog and its top layer | Hosts the settings panel portal, receives the dialog layout styles |
| `ha-code-editor` and the CodeMirror root | Completion popup, syntax styling, codebox frame |
| Card preview | Observed only to avoid duplicate work. Home Assistant's `value-changed` and `input` events are never intercepted or replayed |

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
