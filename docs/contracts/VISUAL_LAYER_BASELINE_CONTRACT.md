# Visual Layer Baseline Contract

The codebox has three visual layers. This contract fixes which element draws each one and names the selectors and tokens that `tools/visual_layer_doctor.py` checks. The general ownership rules are in `STYLE_OWNERSHIP_CONTRACT.md`.

## Layers

```text
ha-code-editor / :host
  ::before = border and glow owner
  ::after  = frosted blurry surface/backdrop owner
CodeMirror panes
  .cm-editor / .cm-scroller / .cm-content = transparent content and scrolling layers
```

From back to front: the `::after` surface (`z-index: 1`), the CodeMirror panes with the text (`z-index: 2`), the `::before` frame on top. Both pseudo-elements ignore pointer events.

## Selectors and tokens

The rules are built by `codeboxStyleBuildRootCss` in `src/ui/codeboxStyle.js`. The host is marked by `src/ui/codebox/codeboxPreflight.js` and `src/ui/codeboxStyleRuntime.js` with the attribute `data-nostrodomus-codebox-frame-host="1"`.

- `ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::before` and `:host([data-nostrodomus-codebox-frame-host="1"])::before` draw the border and the glow from the `--nostrodomus-codebox-frame-*` variables.
- `ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::after` and `:host([data-nostrodomus-codebox-frame-host="1"])::after` draw the surface: `background: var(--nostrodomus-codebox-surface)` with `backdrop-filter` and `-webkit-backdrop-filter` set to `var(--nostrodomus-codebox-surface-blur)`.
- `--nostrodomus-codebox-surface-blur` is `blur(16px) saturate(135%)`.
- The host has `isolation: isolate`, so that `::after` stays behind the CodeMirror content and `::before` in front of it.
- `.cm-editor`, `.cm-scroller` and `.cm-content` have `background: transparent`. The frosted background is not set on them.
- `[data-nostrodomus-codebox-external-frame="1"]` has `display: none`. A frame element measured and positioned outside the editor is not used.

The Developer Tools template page shows its result in `ha-card.render-pane`. The same root stylesheet gives that pane the border, glow and surface of the codebox, from the same variables.

## Changing this area

Run the checks before and after a change to the codebox styles, the style install functions or the syntax styles:

```bash
python3 tools/visual_layer_doctor.py
python3 tools/check_runtime_contracts.py
python3 tools/verify.py
```

Keep a change to the visual CSS separate from a change that moves or renames the functions which install it. When both happen in one commit, a visual regression cannot be traced to one of them.

Then look at an editor with long YAML and CSS in a browser:

1. The frosted surface is visible behind the text.
2. The border and glow are visible and not clipped.
3. Syntax colors stay as they are on open, click, blur and typing.
4. The dimming of the page behind the dialog comes from Home Assistant; Nostrodomus adds no layer over the dashboard.
5. The settings panel opens, can be dragged, and its sliders work.
