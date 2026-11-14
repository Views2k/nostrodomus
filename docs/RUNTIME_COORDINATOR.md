# Nostrodomus Runtime Coordinator

`window.__nostrodomusRuntimeCoordinatorV1` is the browser-local coordination surface shared by the three active Nostrodomus runtimes:

- main completion runtime: `window.__nostrodomus`
- editor layout companion: `window.__nostrodomusEditorBridgeV1`
- picker companion: `window.NostrodomusPickerSafe` / `window.NostrodomusPickerOnly`

The coordinator exists to prevent each runtime from maintaining an isolated typing/quiet-window model. It is local-only, in-memory, and does not add network reporting, storage writes, global polling, or new DOM observers.

## Contract

The coordinator exposes:

```js
window.__nostrodomusRuntimeCoordinatorV1 = {
  version: "nostrodomus-runtime-coordinator-v1",
  register(descriptor),
  markQuiet(channel, durationMs, reason, source),
  remaining(channel),
  isQuiet(channel),
  noteSuppression(channel, reason, source),
  snapshot(),
}
```

Current channels:

- `editor-input` — active typing/editing pressure. Picker-safe uses this to defer picker styling work during code editor input even if the quiet window was marked by v17 or the main dispatch path.
- `preview-value-freeze` — v17 preview value propagation quiet window during repeat-pressure input.
- `editor-dispatch-repeat-pressure` — main runtime repeat-pressure dispatch quiet window.
- `picker-work` — picker-safe suppression/readout channel.

## Diagnostics

Readouts are available from:

```js
window.__nostrodomus?.runtimeCoordinator?.()
window.__nostrodomus?.debug?.()?.runtimeCoordinator
window.__nostrodomus?.exportDiagnostics?.()?.runtimeCoordinator
window.__nostrodomusEditorBridgeV1?.summary?.()?.runtimeCoordinator
window.NostrodomusPickerSafe?.debug?.()?.runtimeCoordinator
```

## Ownership rules

- The main bundled implementation lives in `src/core/runtimeCoordinator.js`.
- Companion resources include the same small bootstrap so either companion can create the coordinator if it loads before the main runtime.
- The coordinator must remain local-only and bounded: no `fetch`, no `sendBeacon`, no `localStorage`, no intervals, and no document-wide traversal.
- This layer may coordinate quiet-window decisions, but it must not own completion ranking, insertion, Ctrl+Space popup rendering, or Home Assistant preview event semantics.
