# ADR 0004: v31.6.77 Syntax and Project Hygiene Baseline

## Status

Accepted.

## Context

The syntax-flash investigation showed that CodeMirror often renders YAML block scalar content, especially embedded `card_mod:` CSS, as direct text inside `.cm-line` with zero child spans. Styling only CodeMirror token classes fixed the white flash for normal token spans, but it could not color selectors, CSS properties, functions, numbers, units, punctuation, Jinja expressions, or `!important` inside plain-text block scalar lines.

Attempts that applied broad line-level fallback classes caused incorrect colors because a single line can contain selectors, declaration names, values, functions, numbers, punctuation, and Jinja placeholders.

## Decision

Use two syntax layers:

1. Source-class CodeMirror styling for normal token spans.
2. CSS Custom Highlight document ranges for embedded YAML/Lovelace/card_mod CSS/Jinja text nodes that CodeMirror renders without child spans.

Keep line classes as context/fallback only. They must not color an entire mixed syntax line when range highlights are available.

## Consequences

- White flash is avoided because syntax is no longer owned by a delayed inline span painter.
- Embedded card_mod CSS can be colored by exact document ranges even when CodeMirror emits no spans.
- Settings -> Style syntax theme changes must rebuild both source-class CSS and range highlight rules.
- The old inline DOM painter is fallback-only.

## Hygiene companion decision

Generated analysis slices and old one-off patch helpers are not active project files. They should be archived outside the repo, not carried in the repository. (The original cleanup helper tool was retired once the tree was clean.)
