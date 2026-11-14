# Nostrodomus syntax coloring references

This patch keeps the source-class no-white-flash architecture and aligns the semantic overlay with the public syntax models used by Home Assistant dashboard editing.

## CodeMirror / Lezer
- CodeMirror 6 highlighting maps syntax tags to generated classes; Nostrodomus uses `highlightingFor(view.state, tag)` when Home Assistant exposes it so spans are styled before post-paint recovery is needed.
- Lezer highlight tags provide the generic roles used by CodeMirror: comment, keyword, string, number, variableName, propertyName, punctuation, operator, and related tags.

## YAML / Lovelace
- YAML documents are represented as mappings, sequences, and scalars.
- Lovelace/card configuration uses YAML mappings for keys such as `type`, `entity`, `name`, `card_mod`, `style`, `tap_action`, and nested lists under keys like `entities` or `cards`.
- YAML block scalars introduced by `|` or `>` preserve or fold following indented text; embedded `card_mod: style: |` CSS must remain in CSS mode while scrolling through the block.

## CSS / card_mod
- CSS is selector + declaration based: selectors precede `{`, declarations contain property/value pairs separated by `:`, and declarations end with `;`.
- Custom properties use the `--name` syntax. A custom property definition before `:` is a property; the same `--name` inside `var(--name)` is a value reference.
- Numeric values may include units such as `px`, `%`, `rem`, `vh`, `deg`, `ms`, and may occur inside functions like `rgb()`, `rgba()`, `drop-shadow()`, `translateZ()`, gradients, and `calc()`.
- `!important` is a declaration priority marker and should not be colored like selectors or comments.

## Jinja / Home Assistant templates
- Jinja delimiters are `{{ ... }}`, `{% ... %}`, and `{# ... #}`.
- Template keywords such as `if`, `elif`, `else`, `endif`, `for`, `set`, `in`, `and`, `or`, and `is` are keyword/operator roles.
- Home Assistant template calls such as `states()`, `state_attr()`, `is_state()`, and filters with `|` should not collapse into the surrounding YAML/CSS color.

## v31.6.77 range-highlight semantic syntax

- CodeMirror source-class styling remains the first paint layer. It uses Home Assistant's `highlightingFor(view.state, tag)` class map when available.
- Embedded `card_mod:` / `style: |` CSS is YAML block-scalar text, and Home Assistant's editor may render those lines as plain `.cm-line` text nodes with no child token spans. For those lines, Nostrodomus uses browser CSS Custom Highlight ranges instead of mutating CodeMirror spans or writing inline styles.
- YAML/Lovelace rules are based on YAML mappings (`key: value`), block sequences (`- item`), scalar values, comments, and literal/folded block scalar headers (`|` / `>`).
- CSS/card_mod ranges classify selectors, class selectors, custom properties (`--name`), declaration punctuation, CSS functions (`rgb`, `rgba`, `var`, `drop-shadow`, `radial-gradient`), numbers/units, value keywords, comments, and `!important`.
- Jinja ranges classify delimiters (`{{ }}`, `{% %}`, `{# #}`), control keywords, variables/functions, strings, numbers, operators, and filters.
- Line classes are context/fallback only. They must never be allowed to color a mixed selector/declaration line when range highlights are active.

