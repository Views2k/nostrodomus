# Nostrodomus — Design

Nostrodomus is a Home Assistant frontend enhancement that adds context-aware
autocomplete, snippets, and syntax styling to the card/YAML code editors. This document
describes the product's architecture for contributors. The binding behavior rules live in
`docs/contracts/`; the gate commands live in `CONTRIBUTING.md`.

## Architecture

### Runtime shape

- `src/main.js` is the ES-module entry: a one-line side-effect import of
  `src/main.legacy.js`.
- `src/main.legacy.js` is the runtime composition root. It owns startup order, Home
  Assistant discovery, and lifecycle, and wires the modules together through
  dependency injection. It composes the wired modules under `src/` (the count is
  reported by `npm run check:modules`).
- Subsystem modules live under `src/core/` (identity, constants, settings keys, state),
  `src/completion/` (popup, scoring, filtering, insertion, snippets runtime),
  `src/providers/` (provider registry/runtime and the individual suggestion providers),
  `src/yaml/` (context detection), `src/syntax/` (tokenizers, highlight runtime),
  `src/editor/` (CodeMirror bridge, active-editor cache, dispatch), `src/ui/` (settings
  panel/portal, codebox frame and style runtimes), and `src/diagnostics/`.
- Pure modules (`src/core/version.js`, `src/core/settingsStorageKeys.js`,
  `src/core/runtimeConstants.js`) must stay free of `window`/`document`/storage access;
  `tools/verify.py` enforces this.

### Build and version truth

- esbuild bundles `src/main.js` into the single artifact `dist/nostrodomus.js`
  (no version in the filename). `tools/build.py` is the canonical build entry and writes
  `reports/BUILD_LAST.txt`.
- One version story: `PROJECT.json` (`version` + `internal_version`), `package.json`,
  `package-lock.json`, the runtime version module, and the dist bundle must agree.
  `tools/version_bump.py` advances them together; `tools/verify.py --release` fails on
  any divergence. The dist runtime identity string is
  `nostrodomus-v<SemVer>-<short-kebab-description>`.
- Reproducible builds are verified by `tools/verify_reproducible_build.py`, which
  compares a temporary esbuild bundle against the committed dist without overwriting it.
- Build and verify never write to live Home Assistant targets (`/config/www`,
  `/config/.storage/lovelace_resources`).

### Scope and styling ownership

- All enhancement behavior is scoped to the active HA editor/dialog/CodeMirror surface.
  No dashboard-wide CSS, pointer, or keyboard ownership.
- Codebox chrome is host-owned: on `ha-code-editor`/`:host`, `::before` owns the
  border/glow and `::after` owns the frosted surface, with `isolation: isolate`.
  CodeMirror internals (`.cm-editor`, `.cm-scroller`, `.cm-content`) stay transparent and
  own content/scroll only. See `docs/contracts/STYLE_OWNERSHIP_CONTRACT.md` and
  `docs/contracts/VISUAL_LAYER_BASELINE_CONTRACT.md`.
- Syntax coloring uses CodeMirror source classes plus CSS Custom Highlight document
  ranges; the old inline DOM token painter survives only as a fallback path.
- The settings panel mounts through a portal host inside the active native HA modal
  dialog/top-layer — never raw `document.body` while a modal is open, and never z-index
  as a portal substitute.

### Companions

Two standalone companion resources —
`reference/companions/nostrodomus_editor_v17_2_learned_reapply.js` (editor/layout/preview bridge)
and `reference/companions/nostrodomus-picker-safe.js` (picker styling deferral) — have had their
behavior absorbed into `src/companion/`. They are kept byte-frozen as reference only and no
longer ship; do not modify them. Any still-loaded legacy copy cooperates with the main runtime
through the `window.__nostrodomusRuntimeCoordinatorV1` quiet-window coordinator during the
coexistence period. See `docs/COMPANION_RESOURCES.md` and `docs/RUNTIME_COORDINATOR.md`.

### Security posture

No network calls of any kind (`fetch`, `sendBeacon`), no telemetry, no `eval`/`new
Function`, no remote code loading, and no `innerHTML` (zero sites in `src/`, held there
by the `innerhtml_max: 0` gate). Rendering goes through `textContent`,
`createElement`, explicit attribute setters, and scoped listeners.

## Craft bar

This is a code editor enhancement. Editors are judged by friction, not feature count.

The suggestion popup opens within one frame of the trigger and closes within one frame of
dismiss. No layout thrash. The popup repositions only when the underlying CodeMirror
selection actually moves — not on every keystroke. Keyboard is the primary interface:
Tab, Enter, Escape, ArrowUp/Down, and Ctrl+Space behave the way a developer expects in a
modern IDE. Global shortcuts are never hijacked; if Home Assistant's editor owns a key,
Nostrodomus yields. Focus moves cleanly between the editor and popup; focus is never trapped
and never lost on dismiss. The settings panel is keyboard-navigable end to end, has a
visible focus ring that respects the user's accent color, and closes on Escape. Light
and dark themes are visually equivalent — not merely legible, but composed. The popup
reads Home Assistant/editor computed style for type scale rather than hard-coding a
detached visual system. No motion exceeds 200ms. No motion is purely decorative.
Accessibility is non-optional: the popup is an ARIA listbox, the selected item has
`aria-selected`, and screen reader announcements are correct.

If any of this regresses, a release does not ship.

## Out of scope

- Python backend / custom component.
- Cross-device settings sync.
- A Home Assistant UI panel.
- Telemetry of any kind.
- Modifying the frozen companion resources or the legacy `nostrodomus.css` theme.
