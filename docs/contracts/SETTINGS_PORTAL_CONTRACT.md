# Contract: Settings Portal and Interaction Stability

## Status

Active for v31.6.82+ organization work. This contract preserves the v31.6.12/v31.6.13 Settings portal and drag architecture plus later interaction-stability patches.

## Owner

The Settings panel is a Nostrodomus UI surface, but when Home Assistant uses a native modal `<dialog>`, the panel must be mounted inside that active dialog/top-layer subtree so it is not rendered inert behind the modal.

## Required behavior

- Settings uses a dedicated portal host, not the completion popup overlay and not raw `document.body` during an active native HA modal.
- Saved Settings position remains viewport-based.
- Rendered `left/top` are converted to portal-local coordinates when mounted in a dialog portal.
- Header click without real movement does not save a new drag position.
- Dragging uses smooth transform/frame behavior and commits position only after real movement.
- Ordinary settings changes preserve active tab and scroll position.
- Range/color style controls use lightweight live preview during input and defer expensive save/full-apply work to commit/debounce.

## Forbidden approaches

- Do not mount Settings outside the active native modal dialog when the HA card editor is modal.
- Do not use z-index as a substitute for top-layer ownership; content outside a native modal can be inert regardless of z-index.
- Do not close/reopen Settings for ordinary control changes.
- Do not reset active tab or scroll position on checkbox/dropdown/slider changes.
- Do not make range `input` events trigger heavy full lifecycle work on every tick.

## Verification

Runtime smoke checks:

```text
- Open Settings from inside the HA editor dialog; all buttons, sliders, tabs, and text selection work.
- Drag Settings by the header; it follows smoothly and does not jump down/left.
- Click the header without dragging; saved position does not shift.
- Change a Style slider; panel remains on the same tab and scroll position.
- Press Escape; Nostrodomus Settings closes before the HA editor dialog when appropriate.
```

Static checks should confirm the Settings portal/drag/interactions tests remain present and that top-layer/dialog ownership tokens still exist in the runtime.

## Rollback

If Settings becomes visible but unclickable, rollback the portal ownership change first. Do not attempt to fix an inert Settings panel with z-index, pointer-events spam, or document-body remounting.
