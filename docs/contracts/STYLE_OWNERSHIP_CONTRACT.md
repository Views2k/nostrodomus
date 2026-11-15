# Contract: Style, Codebox Frame, and Syntax Ownership

Several parts of Nostrodomus style the same editor: the codebox frame, the companion layer, the syntax coloring and the settings panel. This contract says which module writes which style, so that two of them never write the same property on the same element.

The rule in one sentence: the `ha-code-editor` host owns the decoration, CodeMirror owns the content.

## Who writes what

| Target | Style | Written by |
| --- | --- | --- |
| `ha-code-editor` host, `::before` | Border, glow, outer shadow | Root stylesheet, `src/ui/codeboxStyle.js` |
| `ha-code-editor` host, `::after` | Frosted, blurred surface behind the text | Root stylesheet, `src/ui/codeboxStyle.js` |
| `ha-code-editor` host | Color tokens, set as `--nostrodomus-codebox-*` custom properties on the element | `src/ui/codeboxStyleRuntime.js`, live preview in `src/ui/settingsInteractionRuntime.js` |
| `.cm-editor`, `.cm-scroller`, `.cm-content` | Transparent background, font size, text color defaults | Root stylesheet, by class and attribute selectors only |
| `.cm-editor`, `.cm-scroller` | Inline heights and overflow | Companion layer, `src/companion/codeboxEnlargeRuntime.js` |
| `.cm-scroller` and the dialog | Scrollbar styling, line wrapping, dialog and preview layout | Companion stylesheets, `src/companion/companionStyleRuntime.js`. Scrollbar colors come from the `--nostrodomus-codebox-scrollbar-*` variables |
| Card editor dialog: `ha-dialog` and `.element-preview` in the shadow root of `hui-dialog-edit-card` | Translucent dialog surface and backdrop blur, set as Home Assistant's `--ha-dialog-surface-background` and `--ha-dialog-surface-backdrop-filter` custom properties on `ha-dialog`, and a transparent background on the preview pane. Only while `style.glassDialog` is on | Companion stylesheet `nostrodomus-editor-v17-2-learned-style-glass-dialog`, `src/companion/companionStyleRuntime.js` |
| `.cm-content` | Height and everything CodeMirror measures | CodeMirror. Nostrodomus does not write it |
| Token spans and text ranges | Syntax colors | `src/syntax/` (see `docs/SYNTAX_COLORING_REFERENCES.md`) |
| Settings panel | Its own stylesheet | `src/ui/settings/settingsStylesheet.js` |
| Ancestors that clip the frame | `overflow`, `contain`, `clip-path` release, marked with `data-nostrodomus-codebox-unclip` | `src/ui/codebox/codeboxUnclip.js` |

The exact selectors of the two host layers are in `VISUAL_LAYER_BASELINE_CONTRACT.md`.

## Required behavior

- One `::before` layer on the `ha-code-editor` host draws border and glow. One `::after` layer draws the frosted surface. There is no second owner for either.
- CodeMirror panes stay transparent. `.cm-editor` lays out content, `.cm-scroller` scrolls, `.cm-content` holds the text.
- The codebox style runtime never writes inline styles to `.cm-editor`, `.cm-scroller` or `.cm-content`. `isCodeMirrorInlineStyleTarget` in `src/ui/codeboxStyleRuntime.js` guards every such write, in the steady-state pass, in the token writer of `src/ui/styleDomRuntime.js` and in the live preview. Rewriting those inline styles makes the scroll area collapse or flap.
- The scrollbar color on `.cm-scroller` uses the `var(--nostrodomus-codebox-scrollbar-*)` form. The runtime changes the variables and does not write a literal `scrollbar-color`.
- The two stylesheets `nostrodomus-codebox-preflight-style-v1` and `nostrodomus-codebox-root-style-v1` are stable elements: `ensureStableStyleElement` creates each once per root and updates its text in place. They are not removed and appended again on every pass.
- Style elements are added only to the document or shadow roots of active editors and their dialogs (`src/ui/styleRootRuntime.js`), and removed when no editor is open.
- The Style controls in Settings change the custom properties for a live preview and keep the active tab and scroll position. The full pass runs after the change is committed.
- Frame, surface and syntax colors are in place before the user clicks or types in a newly opened editor (preflight stylesheet, `src/ui/codebox/codeboxPreflight.js`, and the initial paint gate in `src/syntax/initialSyntaxPaintGate.js`).
- The glass stylesheet is the only writer of the card dialog surface and of the preview pane background. It does not replace what a theme defines: when the theme sets `--ha-dialog-surface-background`, the surface line is left out, and when the theme sets `--ha-dialog-surface-backdrop-filter` or a scrim filter with a blur, the blur line is left out (`buildGlassDialogCss`). It is not added while the companion layer is dormant, and it is removed when `style.glassDialog` is turned off, on teardown and on uninstall.
- The names of the `--nostrodomus-codebox-*` variables stay as they are. The companion stylesheets read them, and tests pin those stylesheets byte for byte.

## Ruled out

- Border, glow or the frosted surface on `.cm-editor`, `.cm-scroller` or `.cm-content`.
- A separate, measured frame element outside the editor. The element `[data-nostrodomus-codebox-external-frame="1"]` stays hidden by the root stylesheet.
- Two independent owners of the frame or glow.
- Removing `overflow`, `clip-path` or masks on the dashboard as a whole to keep the glow from being clipped. Only the marked ancestors of the editor are released.
- The inline token painter as the primary syntax path, and one color for a whole line of mixed syntax.
- Churning the stable style elements to change the cascade order.

## Checks

Static, run through `tools/verify.py`:

- `tools/visual_layer_doctor.py`: the host `::before` and `::after` rules, the blur token, the transparency of the CodeMirror panes and the hidden external frame exist in the source modules and in the bundle.
- `tests/test_codebox_style_property_ownership_static.py`: the inline-style guard on CodeMirror internals.
- `tests/test_codebox_frame_host_ownership_static.py` and `tests/test_codebox_frosted_surface_layer_static.py`: the host layers.
- `tests/test_stable_style_node_churn_guard_static.py`: the stable style elements.
- `tests/test_dashboard_style_containment_static.py`: no dashboard-wide rules.
- `tests/ui/settings_stylesheet_snapshot.test.mjs`: the settings stylesheet, byte for byte.

Unit test, part of the test suite: `tests/companion/glass_dialog.test.mjs` covers the glass stylesheet (its text for each theme case, when it is added and removed).

In a browser (`tests/e2e/editor-styling.spec.mjs` covers the first point, `tests/e2e/companion-glass-dialog.spec.mjs` the last):

- Opening an editor shows the frame and the frosted surface, and the editor height does not change while idle.
- No uncolored text appears for a moment when the editor opens, including CSS inside a block scalar.
- Changing the syntax theme recolors the text without turning it one color.
- Moving a glow or border slider updates the frame without resizing the editor, and the settings panel stays usable.
- Cards on the dashboard look the same with and without an open editor.
- With the default settings the surface of the card editor dialog is translucent and blurred and the preview pane is transparent. With "Glass editor dialog" off, both have the theme's own background.

A failed change to this area is reverted as a whole. A second patch on top of a broken ownership model makes the cause harder to find.
