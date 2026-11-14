# ADR-003 — innerHTML migration scope

Status: Proposed for owner review  
Date: 2026-05-27  
Project: Nostrodomus

## Context

Nostrodomus currently ships through the legacy runtime in `src/main.legacy.js`. The v31.4 source-hygiene milestone intentionally avoided runtime behavior changes and left the built artifact unchanged.

The next milestone, v31.5, is render security. The current tracked debt is four `innerHTML` use sites in the legacy runtime:

- `src/main.legacy.js:2229` — suggestion popup clear/render path
- `src/main.legacy.js:2234` — suggestion popup row/detail render path
- `src/main.legacy.js:2266` — suggestion popup row/detail render path
- `src/main.legacy.js:2911` — settings panel render path

The project policy is no new `innerHTML`. Existing sites are tolerated only as tracked debt. Future renderer work must use `textContent`, `document.createElement`, explicit attribute setters, and scoped event listeners.

## Decision

v31.5 will migrate all four known `innerHTML` sites, not only the popup sites.

The implementation should be split into small commits:

1. Add safe DOM helpers in `src/core/dom.js`.
2. Add popup render parts in `src/ui/renderParts.js`.
3. Migrate suggestion popup rendering away from `innerHTML`.
4. Add settings panel render helpers in `src/ui/settingsPanel.js` or extend the existing stub.
5. Migrate settings panel rendering away from `innerHTML`.
6. Add hostile-label regression coverage and an `innerHTML` count gate.

The migration must preserve the current visual layout, keyboard behavior, settings behavior, and suggestion behavior. Do not redesign the UI during this security milestone.

## Required helper behavior

The DOM helper layer should provide a narrow API:

- create elements by fixed tag name
- assign class names from known local strings
- set text through `textContent`
- set attributes through an allowlisted helper
- reject `on*` attributes
- reject `javascript:` URLs
- avoid style injection from suggestion/provider data
- use `addEventListener`, not handler attributes

The helper layer should not become a generic framework.

## Data classification

The migration must treat these values as untrusted unless proven otherwise:

- suggestion labels
- suggestion detail text
- suggestion documentation strings
- entity IDs
- service names
- device names
- area names
- dashboard/card YAML-adjacent text
- provider-supplied metadata
- library-pack rows

Even when current values appear static, render through text nodes by default.

## Verification

Automated checks:

- `python3 tools/verify.py`
- `node --check dist/nostrodomus.js`
- `node --check` on active source modules where Node is available
- hostile-label render tests once v31.5 adds them
- verify `innerHTML` count is non-increasing and eventually zero for migrated active render paths

Manual checks:

- dashboard-level `Ctrl+Space` remains inert
- card code editor `Ctrl+Space` opens the popup above the editor
- suggestion rows render label, kind, source, and detail correctly
- accepting a suggestion still inserts the same text
- settings opens
- settings drag, scroll, toggle, and close still work
- dark/light theme readability remains acceptable
- no popup appears outside the active editor

## Consequences

Positive:

- Reduces injection risk.
- Makes render code testable and auditable.
- Creates a foundation for the later UI extraction work.
- Aligns the project with the security posture expected for a public HACS frontend resource.

Costs:

- The legacy runtime will be touched for the first time after v31.4.
- Manual Home Assistant verification is mandatory.
- The settings renderer may need careful event rebinding to avoid behavior regressions.

## Alternatives considered

### Popup-only migration

Rejected. It would leave the settings panel as known render debt and split the security story across multiple milestones.

### Leave legacy `innerHTML` until the full UI extraction

Rejected. The project can reduce risk before the full extraction, and v31.5 is explicitly scoped for render security.

### Introduce a template/rendering dependency

Rejected. No new dependency is justified for four targeted render sites. The project remains dependency-minimal.

## Sign-off

Owner review required before v31.5 implementation begins.

---

**Update 2026-06-20 (addendum; the text above is preserved as the original historical decision record):** Implemented and shipped. `src/` and `dist/` are at **zero** `innerHTML` sites and the gate enforces it (`PROJECT.json` `innerhtml_max: 0`, checked by `tools/verify.py`); the safe DOM helpers live in `src/core/dom.js`. The `v31.x` milestone framing predates the SemVer scheme (the project is now on `0.1.x`); the originally-cited legacy sites are retired. No further action required.
