# Nostrodomus design

Nostrodomus is a Home Assistant frontend resource that adds context-aware
autocomplete, snippets, and syntax styling to the card and YAML code editors. This document
describes the architecture for contributors. The binding behavior rules are in
`docs/contracts/`, the build and test commands in `CONTRIBUTING.md`, and a map of the
repository in `docs/PROJECT_STRUCTURE.md`.

## Architecture

### Runtime shape

- `src/main.js` is the ES-module entry: a one-line side-effect import of
  `src/app.js`.
- `src/app.js` is the runtime composition root. It owns startup order, Home
  Assistant discovery, and lifecycle, and wires the modules together through
  dependency injection, with the factories in `src/composition/`. The number of wired
  modules is reported by `npm run check:modules`.
- Subsystem modules are under `src/core/` (identity, constants, settings, state, logging,
  public API), `src/completion/` (suggestion list, keymap, scoring, filtering, insertion,
  snippet sessions), `src/providers/` (provider registry and the suggestion providers),
  `src/yaml/` and `src/context/` (context detection), `src/languages/` (embedded language
  detection), `src/syntax/` (tokenizers, highlight runtime), `src/editor/` (CodeMirror
  bridge, active-editor cache, dispatch), `src/ui/` (settings panel and portal, codebox
  frame and style runtimes), `src/companion/` (card dialog sizing, codebox fit, scrollbar
  and warning styling), and `src/diagnostics/`.
- The completion library and its providers are loaded when the first editor is used, not at
  page load. A dashboard on which no editor is opened pays only for the lifecycle
  sentinel, the document listeners and one small style node.
- Pure modules (`src/core/version.js`, `src/core/settingsStorageKeys.js`,
  `src/core/runtimeConstants.js`) must stay free of `window`, `document` and storage
  access. `tools/verify.py` enforces this.

### Build and version

- esbuild bundles `src/main.js` into the single file `dist/nostrodomus.js`
  (no version in the file name). `tools/build.py` is the build entry and writes
  `reports/BUILD_LAST.txt`.
- The version is stated in `PROJECT.json` (`version` and `internal_version`), `package.json`,
  `package-lock.json`, `src/core/version.js`, and the dist bundle, and these must agree.
  `tools/version_bump.py` updates the source files together, `tools/build.py` rebuilds the
  bundle, and `tools/verify.py --release` fails on any divergence. The runtime identity
  string is `nostrodomus-v<SemVer>-<short-kebab-description>`.
- `tools/verify_reproducible_build.py` builds to a temporary file and compares it with the
  committed dist, without overwriting it.
- Build and verify never write to a Home Assistant configuration (`/config/www`,
  `/config/.storage/lovelace_resources`).

### Scope and styling ownership

- All behavior is scoped to the active Home Assistant editor, its dialog and its
  CodeMirror surface. There is no dashboard-wide CSS and no pointer or keyboard handling
  outside that scope.
- Codebox chrome is owned by the host: on `ha-code-editor` and `:host`, `::before` owns the
  border and glow and `::after` owns the frosted surface, with `isolation: isolate`.
  CodeMirror internals (`.cm-editor`, `.cm-scroller`, `.cm-content`) stay transparent and
  own content and scrolling only. See `docs/contracts/STYLE_OWNERSHIP_CONTRACT.md` and
  `docs/contracts/VISUAL_LAYER_BASELINE_CONTRACT.md`.
- Syntax coloring: where the browser has the CSS Custom Highlight API, highlight ranges
  carry every color and nothing is written to CodeMirror's line and token elements. A
  highlight range can set a color but not a font style, so comments are not italic in
  that mode. Painting classes on the token elements remains as the fallback.
- The settings panel mounts through a portal host inside the active native Home Assistant
  modal dialog. It is never appended to `document.body` while a modal is open, because
  content outside the modal is inert whatever its z-index.

### Companion layer

Dialog sizing, codebox fit, scrollbar styling and typing-quiet coordination started as two
standalone companion scripts. Their behavior is now part of the bundle, in `src/companion/`.
The two scripts, `reference/companions/nostrodomus_editor_v17_2_learned_reapply.js` and
`reference/companions/nostrodomus-picker-safe.js`, are kept unchanged as reference for the
parity tests and are not shipped. Do not modify them. If a user still loads one of them as
a resource, the layer in the bundle stays dormant and both sides coordinate through
`window.__nostrodomusRuntimeCoordinatorV1`. See `docs/COMPANION_RESOURCES.md` and
`docs/RUNTIME_COORDINATOR.md`.

### Security posture

No network calls of any kind (`fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`), no
telemetry upload, no `eval` or `new Function`, no remote code loading, and no `innerHTML`
(zero uses in the bundle, held there by the `innerhtml_max: 0` value in `PROJECT.json`
that `tools/verify.py` checks). Rendering goes through `textContent`, `createElement`,
explicit attribute setters, and scoped listeners.

## Interaction rules

- The keyboard is the primary interface. `Ctrl+Space`, the arrow keys, `Enter`, `Tab` and
  `Esc` act on the suggestion list only while it is open. Keys pressed with a modifier, and
  keys pressed while an input method composes text, go to the editor. `Esc` with the list
  closed passes through to the Home Assistant dialog.
- DOM focus stays in the editor while the suggestion list is open. The settings panel takes
  focus when it opens and returns it when it closes.
- The suggestion list is an ARIA listbox, its rows are options with `aria-selected`, and the
  active option is announced through a polite live region.
- Ordinary settings changes apply in place. They do not close and reopen the panel or reset
  its tab and scroll position.
- The list is repositioned when the cursor or the layout around the editor moves, and it
  closes when the cursor leaves the visible editor.

## Out of scope

- A Python backend or custom component.
- Settings sync between devices.
- A Home Assistant sidebar panel.
- Telemetry of any kind.
- Changes to the frozen companion reference scripts.
