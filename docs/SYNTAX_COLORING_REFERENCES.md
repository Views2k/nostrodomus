# Nostrodomus syntax coloring references

This document lists the syntax models the coloring follows and the modules that apply them. The code is under `src/syntax/`.

## Syntax models

### CodeMirror and Lezer

- CodeMirror 6 maps syntax tags to generated class names. `highlightingFor(view.state, tag)` returns the class names for a tag in the active editor.
- Lezer highlight tags give the generic roles: comment, keyword, string, number, variableName, propertyName, punctuation, operator and related tags.

### YAML and Lovelace

- A YAML document consists of mappings (`key: value`), sequences (`- item`) and scalars.
- Card configuration uses mappings for keys such as `type`, `entity`, `name`, `card_mod`, `style` and `tap_action`, and lists under keys such as `entities` and `cards`.
- A block scalar introduced by `|` or `>` keeps or folds the indented text that follows. CSS inside `card_mod:` / `style: |` stays CSS for the whole block, also while scrolling through it.

### CSS and card_mod

- CSS consists of selectors and declarations: a selector precedes `{`, a declaration is a property and a value separated by `:` and ends with `;`.
- A custom property is written `--name`. Before the `:` it is a property; inside `var(--name)` it is a value reference.
- Numbers may carry units such as `px`, `%`, `rem`, `vh`, `deg` and `ms`, and may appear inside functions such as `rgb()`, `rgba()`, `drop-shadow()`, `translateZ()`, gradients and `calc()`.
- `!important` is a priority marker. It is not colored like a selector or a comment.

### Jinja and Home Assistant templates

- The delimiters are `{{ ... }}`, `{% ... %}` and `{# ... #}`.
- `if`, `elif`, `else`, `endif`, `for`, `set`, `in`, `and`, `or` and `is` are keywords or operators.
- Template calls such as `states()`, `state_attr()` and `is_state()`, and filters after `|`, get their own color and do not take the color of the surrounding YAML or CSS.

## How the coloring is applied

Home Assistant's YAML editor often renders the content of a block scalar, for example the CSS of a `card_mod` style, as plain text inside `.cm-line` with no token spans. Coloring by token class alone cannot reach that text, and coloring a whole line with one color is wrong for a line that holds a selector, a property, a value and a template expression. The coloring therefore has several layers:

- Native highlight (`codeMirrorNativeHighlight.js`, `nativeHighlightLifecycle.js`): where Home Assistant's CodeMirror bundle exposes the needed API, a CodeMirror `HighlightStyle` extension with the theme colors is installed in the editor.
- Source-class stylesheet (`sourceClassCssBuilder.js`, `sourceClassLifecycle.js`): a stylesheet in the editor's root that colors CodeMirror's own token classes, found through `highlightingFor()`. It sets the neutral foreground on the line container and not on every span.
- Range highlights (`smartSyntaxTokenizers.js`, `smartSyntaxStyles.js`, `smartSyntaxLifecycle.js`): the visible lines are tokenized as YAML, CSS or Jinja, and the resulting ranges are registered with the CSS Custom Highlight API (`CSS.highlights`, styled through `::highlight()`). This colors text that has no token span. It is used when the browser supports the API.
- Class painter (`smartSyntaxLifecycle.js`): where the browser has no CSS Custom Highlight API, the same token kinds are set as classes on CodeMirror's line and token elements, and the theme stylesheet colors those classes.

Both take the kind of each line from `darkPlusBridge.js`, which uses the checks in `darkPlusClassifiers.js`. The range highlights then split the line into tokens with `smartSyntaxTokenizers.js`. The class painter gives a kind to each token span that CodeMirror rendered, with the token rules of the same module and the token classifier in `darkPlusBridge.js`.

`initialSyntaxPaintGate.js` hides the editor content of a newly opened editor until the first colors are in place, so that the text does not appear uncolored for a moment.

The ranges classify:

- YAML: keys, list markers, scalar values and comments.
- CSS: selectors, custom properties, declaration punctuation, functions, numbers and units, value keywords, comments and `!important`.
- Jinja: delimiters, control keywords, variables and functions, strings, numbers, operators and filters.

The token kinds are listed in `SMART_SYNTAX_KIND_ORDER` in `src/syntax/smartSyntaxTokenizers.js`. The colors per kind come from the selected syntax theme (`STYLE_SYNTAX_PRESETS` and `syntaxThemePalette` in `src/ui/settingsStyle.js`). Changing the theme in Settings rebuilds the stylesheet and the highlight rules.

## Rules

- No whole-line color for a line of mixed syntax.
- The class painter is used only where the highlight API is missing.
- Syntax repaints are postponed while the user types (`typingSessionLifecycle.js`).

`tests/test_range_highlight_syntax_baseline_static.py` and `tools/check_runtime_contracts.py` check that the range highlight code stays in the modules named above and in the bundle.
