# Nostrodomus companion resources

The two standalone companion files are superseded. Their behavior (editor layout/scrollbar
styling, the codebox persistence engine, typing-quiet coordination, and the dormant picker
visual fix) is absorbed into the main module (`src/companion/`, shipped in
`dist/nostrodomus.js`). The standalone files are retained only as frozen references under
`reference/companions/` (see its README); they are no longer distributed.

## Legacy resources (optional, superseded)

These two Lovelace resources, if you still have them registered, are **optional and superseded**:

- `/local/nostrodomus_editor_v17_2_learned_reapply.js` — v17 editor layout/scrollbar controller.
- `/local/nostrodomus-picker-safe.js` — picker/dropdown styling companion.

### Coexistence (safe to keep for now)

You can leave them loaded. The absorbed module detects an external companion (via the shared
`window.__nostrodomusRuntimeCoordinatorV1` handshake) and stays **dormant** so the two never
double-apply (first-injector-wins). Diagnostics reports `companion-layer: external` in that case.

### Removal (recommended once you've verified the module)

To switch fully to the absorbed module:

1. In Home Assistant, go to **Settings → Dashboards → ⋮ → Resources** and **delete** the two
   entries above (`nostrodomus_editor_v17_2_learned_reapply.js` and `nostrodomus-picker-safe.js`).
2. Delete the two files from your `/config/www/` folder.
3. Hard-refresh. With no external companion present, the absorbed module takes over; diagnostics
   reports `companion-layer: internal`.

You can confirm the state any time with:

```js
window.__nostrodomus.exportDiagnostics().companionLayer
// "internal" (absorbed, alone) | "external" (legacy file still loaded) | "dormant(forced)"
```

Other stale Nostrodomus-owned entries that should not remain registered:

- `/local/nostrodomus_editor_v16_*` — legacy editor layout stack (v17 superseded it).
- `/local/nostrodomus-library-core-v1.js`, `/local/nostrodomus-library-webdev-v1.js`
  — provider data is bundled into the main runtime.

## Runtime coordinator

The main runtime and any still-loaded legacy companions share
`window.__nostrodomusRuntimeCoordinatorV1` for browser-local quiet-window coordination, so they don't
act as isolated runtime islands during the coexistence period. Routine companion logs are gated
behind `localStorage.setItem("nostrodomusDebug", "1"); location.reload();`.
