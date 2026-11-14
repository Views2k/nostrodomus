# No-Touch Regression List

This file records approaches that already caused regressions or are too risky for the current architecture. A future patch may only reintroduce one of these patterns with a clear design note, dedicated tests, and explicit user approval.

## Runtime and event flow

```text
Do not reintroduce capture-phase preview value-event debounce/replay.
Do not intercept Home Assistant preview `value-changed` or `input` events to replay them later.
Do not install global pointer routers or keyboard hijacks outside the active editor/dialog scope.
Do not block CodeMirror default typing behavior while trying to contain keyboard events.
Do not add network calls, telemetry, fetch, sendBeacon, eval, or new Function.
```

Known-good preview rule: keep the preview-content mutation guard, but preserve native Home Assistant preview events.

## Settings panel

```text
Do not mount Settings in raw document.body while a native HA modal dialog is open.
Do not use z-index alone as a substitute for the native dialog/top-layer portal.
Do not save drag position on a header click that did not actually drag.
Do not store portal-local coordinates as viewport coordinates.
Do not close and reopen Settings for ordinary control changes.
Do not reset active tab or scroll position while adjusting sliders/toggles.
```

Known-good Settings rule: mount inside the active native HA modal dialog subtree and convert viewport-saved positions into portal-local CSS coordinates.

## Codebox frame/glow and CSS lifecycle

```text
Do not remove the host-owned frosted codebox surface behind CodeMirror.
Do not move the frosted surface onto CodeMirror internals as the primary model.
Do not combine visual CSS changes with runtime modularization.
Do not move the outer frame/glow/border onto CodeMirror internals as the primary model.
Do not use the failed v31.6.61 style-node idempotence/order approach again.
Do not create repeated remove/reappend churn for stable codebox style nodes.
Do not let editor styling inject dashboard-wide CSS or affect unrelated cards/icons.
Do not stack multiple independent frame/glow owners.
```

Known-good style rule: the v31.6.90+ host-owned visual stack must stay intact: `::before` owns border/glow, `::after` owns the frosted blurry surface, CodeMirror panes stay transparent, and scoped root/shadow-root style ownership remains stable.

## Syntax coloring

```text
Do not return to broad whole-line color inheritance for mixed YAML/card_mod/CSS/Jinja lines.
Do not use the old inline DOM token painter as the primary syntax method.
Do not repaint every CodeMirror span on every click/key/focus event.
Do not treat embedded CSS in YAML block scalars as plain YAML only.
```

Known-good syntax rule: source-class CodeMirror styling plus CSS Custom Highlight document ranges, with inline DOM painting only as a fallback if absolutely necessary.

## Patch and release workflow

```text
Do not package accidental nested repo copies such as nostrodomus/nostrodomus/.
Do not skip PROJECT.json/package/runtime/dist version truth when docs/tools/tests change.
Do not overwrite /config/.storage/lovelace_resources blindly.
Do not include a Home Assistant restart for JS/docs-only changes.
```

Known-good release rule: build, `verify --release`, deploy the built dist resource, Lovelace resource/cache bump, hard refresh, then smoke test.
