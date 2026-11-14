# Contract: Style, Codebox Frame, and Syntax Ownership

## Status

Active for v31.6.90+ organization work. Historical references to the old external overlay/frame model are retained only as regression context; the live repaired visual owner is host-owned CSS. This contract preserves the confirmed v31.6.77+ syntax model and the repaired host-owned codebox chrome model: `ha-code-editor` / `:host` owns visual layers; CodeMirror owns content.

## Owner

The active editor styling path is owned by Nostrodomus only while a Home Assistant editor/CodeMirror surface is active. Style controls write bounded local tokens and stable style nodes; they must not start style wars against Home Assistant or companion resources.

## Required behavior

- Codebox border/glow is owned by one `ha-code-editor` / `:host` `::before` visual layer.
- The blurry/frosted editor surface is owned by one `ha-code-editor` / `:host` `::after` visual layer.
- CodeMirror panes stay transparent; `.cm-editor` owns content layout only and stays transparent.
- `.cm-scroller` owns scrollbar behavior/styling only and stays transparent.
- Syntax coloring uses source-class CodeMirror styling plus CSS Custom Highlight document ranges for direct text-node/block-scalar semantics.
- Settings Style controls update stable CSS variables/style text in place and preserve the active Settings tab/scroll position.
- Initial codebox styling and syntax color should be ready before the user clicks or types.

## Forbidden approaches

- Do not put the decorative glow/border or frosted surface back on `.cm-editor`, `.cm-scroller`, or `.cm-content` as the primary visual owner.
- Do not return to the old inline DOM syntax painter as the primary syntax solution.
- Do not use broad whole-line inheritance that collapses mixed YAML/card_mod/CSS/Jinja semantics into one color.
- Do not create duplicate independent glow/border owners.
- Do not use global dashboard-wide overflow/clip/mask removal to fix editor glow clipping.
- Do not restore the failed v31.6.61 style-node ordering/idempotence path.

## Style ownership map

```text
ha-code-editor / :host ::before: border, glow, outer shadow, decorative frame
ha-code-editor / :host ::after: frosted/blurry surface backdrop
ha-code-editor host: geometry anchor and visual chrome owner
.cm-editor: content layout only, transparent background
.cm-scroller: scrollbar behavior/styling only, transparent background
.cm-content: text surface/content only, transparent background
CodeMirror token/source classes: normal token styling
CSS Custom Highlight ranges: direct text-node/block-scalar semantic ranges
Settings Style controls: token updates and bounded live preview
v17 companion: layout/height bridge and variable consumer, not hard-coded visual owner
```

## Verification

Static checks should look for:

```text
- host-owned ::before border/glow and ::after frosted surface tokens remain present
- source-class plus range-highlight syntax tests remain present
- failed inline-painter / broad inheritance approaches are not reintroduced
- root style registry stays scoped to editor/dialog roots
```

Manual smoke checks:

```text
- Open editor: no white flash on YAML comments or card_mod CSS block scalar content.
- Change syntax theme: colors update without all-white/all-one-color collapse.
- Change glow/border sliders: frame updates smoothly, does not resize/jump, and Settings remains interactive.
- Click outside codebox: syntax does not revert to white.
- Dashboard mini-graphs/SVG cards remain normal outside editor mode.
```

## Rollback

Rollback visual/style work as a whole unit. Do not stack new style patches on top of a failed visual owner change; restore the last known-good style/frame/syntax baseline first, then apply a smaller targeted patch.
