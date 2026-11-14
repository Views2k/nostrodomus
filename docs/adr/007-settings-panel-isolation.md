# ADR-007: Settings Panel / Editor Layout Cross-Component Isolation

## Status

Accepted as a cross-component hotfix note.

## Context

Opening the Nostrodomus settings panel caused the Home Assistant card editor codebox to shrink while the panel was open. Closing the settings panel restored the correct editor size.

The initial hypothesis was that Nostrodomus was mounting settings into the wrong overlay tree. Several settings-side experiments were attempted, including focus preservation, portal isolation, and document-level settings overlay. Those approaches did not fix the issue and are not the accepted solution.

The confirmed root cause was in the sibling `nostrodomus_editor_v17_2_learned_reapply.js` editor layout resource. When Nostrodomus settings opened, the v17 layout controller re-ran its lifecycle and misclassified the current editor dialog as tabbed/short mode instead of simple/tall mode. That switched the editor from the learned simple heights to the shorter tabbed heights.

Observed bad transition:

```text
simple/tall:
  cm:       calc(94vh - 188px)
  scroller: calc(94vh - 190px)

tabbed/short:
  cm:       calc(94vh - 437px)
  scroller: calc(94vh - 439px)
```

## Decision

Do not carry Nostrodomus settings overlay workarounds as the fix.

The accepted fix lives in the v17 editor layout resource:

```text
/config/www/nostrodomus_editor_v17_2_learned_reapply.js
version: nostrodomus-editor-v17.2.46-sticky-simple-mode
```

The v17 controller now keeps simple/tall mode sticky for the same active edit dialog after it has been learned. This prevents a later Nostrodomus settings open, click-settle pass, or dialog shadow mutation from downgrading the same dialog to short/tabbed mode.

Nostrodomus settings should return to the normal editor-scoped overlay root:

```js
const root = overlayRoot();
```

## Consequences

- The settings panel no longer shrinks the editor when opened.
- Nostrodomus no longer carries failed document-overlay settings code.
- The real layout ownership remains in the v17 editor resource.
- Future cross-component layout bugs should be diagnosed by identifying the writer of the changed inline styles before patching the overlay mount.
- The v17 resource URL should point to:

```text
/local/nostrodomus_editor_v17_2_learned_reapply.js?v=17.2.46-sticky-simple-mode
```

## Verification

Manual verification checklist:

1. Hard refresh Home Assistant.
2. Confirm `nostrodomus-editor-v17.2.46-sticky-simple-mode` loads in the browser console.
3. Open the card editor.
4. Open Nostrodomus settings.
5. Confirm the codebox remains in simple/tall mode.
6. Close settings.
7. Confirm there is no layout jump.
8. Confirm `Ctrl+Space` suggestions still open.
