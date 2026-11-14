# Visual Layer Baseline Contract

Active from v31.6.91 forward. This contract exists because the v31.6.88 root repair accidentally exposed a real visual regression: the code editor kept the border/glow but lost the blurry/frosted layer behind CodeMirror. The v31.6.90 repair restored the correct visual ownership. Future refactors must preserve this exact layer model before moving runtime code again.

## Source-of-truth rule

The active browser runtime is `src/main.legacy.js` (a composition root) bundled with the wired `src/*` modules into `dist/nostrodomus.js`. The `src/core/*` module files are live, wired runtime — not merely reviewed source — but runtime modularization remains paused while the visual baseline is protected.

## Codebox visual ownership

The editor visual stack must remain separated by owner:

```text
ha-code-editor / :host
  ::before = border and glow owner
  ::after  = frosted blurry surface/backdrop owner
CodeMirror panes
  .cm-editor / .cm-scroller / .cm-content = transparent content and scrolling layers
```

Required runtime behavior:

- `ha-code-editor[data-nostrodomus-assist-codebox-frame-host="1"]::before` and `:host([data-nostrodomus-assist-codebox-frame-host="1"])::before` own the border/glow.
- `ha-code-editor[data-nostrodomus-assist-codebox-frame-host="1"]::after` and `:host([data-nostrodomus-assist-codebox-frame-host="1"])::after` own the frosted surface.
- The surface layer must include both `backdrop-filter` and `-webkit-backdrop-filter` using `--nostrodomus-codebox-surface-blur`.
- The host must use `isolation: isolate` so `::after` can sit behind CodeMirror content while `::before` remains above.
- CodeMirror panes must stay transparent; do not move the frosted background back onto `.cm-editor`, `.cm-scroller`, or `.cm-content`.
- The failed measured external frame path must remain disabled unless a new design is proven with screenshot/console verification first.

## Refactor freeze around styling

Do not extract, rename, or reorder codebox style install functions while also performing runtime modularization. Visual-layer changes and source-structure changes must ship separately.

Before any future module extraction touches style/codebox/syntax areas, run:

```bash
python3 tools/visual_layer_doctor.py
python3 tools/check_runtime_contracts.py
python3 tools/verify.py
```

## Manual smoke test

Open a Home Assistant card editor containing long YAML/CSS. Confirm:

1. The code editor has the frosted blurry surface behind text.
2. The border/glow is visible and not clipped.
3. Syntax coloring remains stable on open, click, blur, and typing.
4. The HA preview behind the editor is dimmed by Home Assistant, not by Nostrodomus owning dashboard-wide layers.
5. Settings opens, drags, and sliders remain interactive.
