# Contract: Runtime Scope and Ownership

## Status

Active for v31.6.82+ organization work. This contract is documentation and verification guidance; it does not authorize behavior changes by itself.

## Owner

Frontend runtime source lives in `src/main.legacy.js` (a composition root) plus the wired modules under `src/*`; `src/main.js` is kept as the one-line bundler entry. esbuild bundles the wired `src/*` modules into `dist/nostrodomus.js`, which is the artifact that actual browser behavior must be verified against.

## Required behavior

- Runtime enhancements must stay scoped to the active Home Assistant editor/dialog surface.
- Dashboard cards, sidebars, mini-graphs, and unrelated custom cards must not receive Nostrodomus editor CSS, pointer handlers, or keyboard behavior.
- `window.__nostrodomus` is the preferred public debug/support API.
- Legacy aliases may remain for compatibility, but new docs and UI should use Nostrodomus naming.
- Build and verify must not write to live Home Assistant paths.

## Forbidden approaches

- No `eval`, `new Function`, `fetch(`, `sendBeacon`, telemetry upload, or remote code loading.
- No document-wide CSS/pointer/keyboard ownership outside the active editor/dialog scope.
- No broad root scanning loops that restyle Home Assistant dashboards during idle state.
- No mutation-observer path that turns CodeMirror text edits into full project/style lifecycle restarts.
- No direct, unbacked mutation of `/config/.storage/lovelace_resources`.

## DOM ownership

```text
Home Assistant dashboard roots: unowned
Home Assistant edit-card dialog/top-layer: allowed owner boundary for Settings portal and editor tooling
ha-code-editor / CodeMirror root: allowed owner boundary for completion popup, syntax styling, and codebox frame anchoring
Preview pane: observe only enough to avoid duplicate Nostrodomus lifecycle work; do not intercept native HA preview value/input events
```

## Verification

Static checks should confirm:

```bash
python3 tools/verify.py
node --check src/main.legacy.js
node --check dist/nostrodomus.js
```

Runtime smoke checks should confirm:

```text
- Dashboard icons remain clickable before opening any editor.
- Ctrl+Space does nothing on the dashboard.
- Ctrl+Space opens Nostrodomus suggestions only inside the active editor.
- Closing the editor removes or idles editor-owned surfaces without touching dashboard cards.
```

## Rollback

Restore the prior `src/main.legacy.js`, `dist/nostrodomus.js`, metadata, and docs from the apply backup, bump the Lovelace resource cache back to the prior version/sha, then hard refresh.
