# Visual Regression Workflow

Use this before touching codebox, syntax, Settings portal, preview, or runtime modularization code.

## Why this exists

The v31.6.88 root repair correctly fixed the project root but also made it obvious that the active browser runtime had drifted from the user-confirmed visual baseline. The visible symptom was a missing blurry layer behind the CodeMirror editor. v31.6.90 repaired that by restoring host-owned pseudo-element layers.

## Required workflow

1. Inspect the current uploaded/exported source first.
2. Run the static visual audit:

```bash
python3 tools/visual_layer_doctor.py
```

3. Make one class of change only:
   - docs/tooling/test guardrail, or
   - visual CSS behavior, or
   - runtime modularization.

4. Do not combine visual CSS changes with runtime extraction.
5. After patching, run the full local gate:

```bash
python3 tools/visual_layer_doctor.py
python3 tools/check_runtime_contracts.py
python3 tools/verify.py
```

## Console spot-check for live HA

Run this in browser DevTools after opening a card editor:

```js
(() => {
  const host = document.querySelector('ha-code-editor[data-nostrodomus-assist-codebox-frame-host="1"]');
  if (!host) return { ok: false, reason: 'no Nostrodomus codebox host found' };
  const after = getComputedStyle(host, '::after');
  const before = getComputedStyle(host, '::before');
  const cm = host.shadowRoot?.querySelector('.cm-editor') || document.querySelector('.cm-editor');
  const cmStyle = cm ? getComputedStyle(cm) : null;
  return {
    ok: true,
    beforeBorder: before.border,
    afterBackdrop: after.backdropFilter || after.webkitBackdropFilter,
    afterBackground: after.backgroundColor,
    cmBackground: cmStyle?.backgroundColor,
    hostIsolation: getComputedStyle(host).isolation,
  };
})()
```

Expected: `afterBackdrop` is not `none`, `hostIsolation` is `isolate`, and the CodeMirror background is transparent or visually not owning the frosted glass.

## Rollback rule

If a patch removes the frosted surface, rollback to the last confirmed visual baseline before adding a new visual fix. Do not stack unrelated runtime or module changes over a failed visual patch.
