# ADR-005 — Threat model

Status: Proposed for owner review  
Date: 2026-05-27  
Project: Nostrodomus

## Context

Nostrodomus is a local Home Assistant frontend enhancement loaded as a Lovelace/HACS plugin resource. It augments Home Assistant's YAML/card editor with context-aware completions, snippets, diagnostics, and settings.

It is not a cloud service. It must not add telemetry, remote schema fetching, update checking, remote script injection, or network calls.

The threat model exists to keep v31.5+ security work concrete instead of vague. It defines the actors, trust boundaries, and default defenses that implementation patches must preserve.

## Decision

Nostrodomus defends against accidental and opportunistic misuse inside the browser/editor environment, not against a fully compromised Home Assistant instance or a malicious browser extension with page access.

The project will use defense-in-depth:

- local-only runtime behavior
- no telemetry or external network access
- no `fetch`, `sendBeacon`, `XMLHttpRequest`, WebSocket, `eval`, or `new Function`
- no native popover/top-layer hacks
- no new `innerHTML`
- no handler attributes such as `onclick`
- text-node rendering for untrusted labels and metadata
- scoped editor detection
- fail-closed popup mounting
- redacted diagnostics by default once ADR-004 lands
- cleanup/dispose tracking for listeners, overlays, timers, and RAF callbacks

## Actors

### Local Home Assistant administrator

Trusted to install the resource and edit dashboards. Still protected from accidental data leakage through diagnostics and from broken editor interactions.

### Local Home Assistant user with limited permissions

May be able to view or edit some dashboards depending on HA configuration. Nostrodomus must not expand permissions or expose hidden data beyond what the current HA frontend already provides to that browser session.

### Malicious or malformed dashboard/content input

Includes entity IDs, device names, area names, service names, library-pack labels, card names, and YAML-adjacent strings containing HTML-like text, SVG payloads, or event-handler-looking text. These values must render as text, not executable markup.

### Browser extension or injected script already running on the page

Out of scope as a fully privileged attacker, but Nostrodomus should avoid creating easy escalation surfaces such as globals that accept executable strings, dynamic evaluation, or network exfiltration helpers.

### Unauthenticated visitor who can guess `/local/` resource URLs

May be able to request static JS resources depending on Home Assistant exposure and authentication configuration. Resource files must not contain user secrets, tokens, entity state dumps, or generated private data.

### Companion Nostrodomus resources

Existing sibling resources and theme files may coexist on the page. Nostrodomus must avoid relying on or mutating them unless explicitly scheduled. Class names and globals should remain scoped.

## Trust boundaries

Trusted enough to read:

- the active editor text visible in the browser session
- Home Assistant runtime objects already exposed to the frontend
- local static completion libraries shipped with the project
- local user settings for Nostrodomus

Not trusted for direct HTML insertion:

- suggestion labels
- suggestion details/documentation
- entity IDs
- service names
- area/device names
- dashboard/card labels
- library pack rows
- diagnostic strings

Never allowed:

- sending data off-device
- executing user-provided strings
- mutating Home Assistant `.storage` state from runtime code
- writing to `/config/www` or `/config/custom_components` from build/verify
- mounting popups on `document.body` as a release-mode fallback
- hijacking global keyboard/pointer events outside active editor scope

## Security requirements for v31.5

The render migration must:

- replace known `innerHTML` render sites with DOM construction
- render all dynamic text through `textContent`
- use explicit attribute setters with rejection of `on*` and `javascript:`
- keep event listeners scoped and removable
- preserve visual/keyboard behavior
- add hostile-label regression tests
- preserve the existing no-network/no-eval forbidden-token gates

## Diagnostics privacy posture

Until ADR-004 defines the final diagnostics PII model, v31.5 code must not make diagnostics more revealing than the current baseline.

Diagnostics should avoid dumping full YAML, full entity lists, dashboard URLs, or raw user-specific names by default.

## Consequences

Positive:

- Gives the render security work a clear target.
- Prevents feature patches from weakening the local-only/no-telemetry promise.
- Separates realistic browser threats from out-of-scope compromised-host scenarios.

Costs:

- Some useful debug details may need redaction or opt-in handling.
- Future convenience features that require network access need a separate ADR/RFC and are not allowed silently.

## Alternatives considered

### Treat all Home Assistant frontend data as trusted

Rejected. The browser environment may contain user-generated labels and third-party card data. Rendering must remain safe even when labels contain HTML-like payloads.

### Build a broader sandbox

Rejected for v31.x. The project is a frontend editor enhancement inside HA's existing page. The appropriate near-term controls are narrow rendering, scoped listeners, and no network/eval.

### Add telemetry for error visibility

Rejected. Local-only behavior is a product promise and security boundary.

## Sign-off

Owner review required before v31.5 implementation begins.
