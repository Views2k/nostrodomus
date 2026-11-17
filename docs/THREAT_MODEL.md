# Threat model

Nostrodomus is a frontend resource that Home Assistant loads into the browser. It adds completion, snippets, syntax coloring, diagnostics and a settings panel to Home Assistant's code editors.

It is not a cloud service and has no backend. It must not add telemetry upload, remote schema fetching, update checks, remote script loading or any other network call of its own.

This document names the actors, the trust boundaries and the defenses that a change has to keep.

## Scope

Nostrodomus defends against accidental and opportunistic misuse inside the browser page: text from the user's Home Assistant instance that looks like markup, a broken custom card, a hand-edited settings payload. It does not defend against a compromised Home Assistant instance or a browser extension with full access to the page.

## Defenses

- Local only: no telemetry or external network access. The bundle contains no `fetch`, `sendBeacon`, `XMLHttpRequest`, `WebSocket`, `EventSource` or dynamic `import()`.
- No dynamic code: no `eval`, no `new Function`, no `document.write`, no `srcdoc`, no `javascript:` URLs.
- No `innerHTML`. The interface is built with `createElement`, `textContent` and explicit attribute setters. The helpers in `src/core/dom.js` accept a fixed set of tag names and reject event-handler attributes (`on*`), `javascript:` URLs and `srcdoc`.
- Listeners are attached with `addEventListener`, not with handler attributes.
- Text from providers and from Home Assistant (labels, details, documentation, entity ids, names) is rendered as text nodes. Rows built from the bundled library and from Home Assistant data are cut to fixed lengths (`SECURITY_LIMITS` in `src/core/runtimeConstants.js`).
- Behavior is limited to code editors. Keyboard and pointer handling, styles and the suggestion list apply to the active editor and its dialog, not to the dashboard (`docs/contracts/RUNTIME_SCOPE_CONTRACT.md`). Styles also reach the containers around the editor that would clip its frame and the Result pane next to the Developer Tools template editor.
- Diagnostics are redacted by default. `window.__nostrodomus.exportDiagnostics()` replaces editor text, labels and names unless it is called with `{ redact: false }`, and the copy button in Settings always copies the redacted form.
- Data read from Home Assistant degrades quietly: a missing, partial or throwing object leads to fewer suggestions, not to an exception (`docs/PROVIDER_CONTRACT.md`).
- `window.__nostrodomus.uninstall()` removes the listeners, observers, style elements and overlays that Nostrodomus added.

`tools/verify.py` checks the first three points on `dist/nostrodomus.js` as text: it fails when the bundle contains one of the forbidden strings for network and dynamic-code calls, or when the number of `innerHTML` occurrences exceeds `innerhtml_max` in `PROJECT.json`, which is 0. `tools/check_runtime_contracts.py` scans `src/app.js` and the bundle for `eval`, `new Function`, `sendBeacon` and `fetch` calls.

## Actors

### Home Assistant administrator

Trusted to install the resource and to edit dashboards. Still protected from leaking data through a diagnostics report and from editor interactions that break.

### Home Assistant user with limited permissions

May view or edit some dashboards, depending on the configuration. Nostrodomus must not extend permissions or show data beyond what the Home Assistant frontend already provides to that browser session. It reads only objects that the frontend has loaded into the page.

### Malformed or hostile content

Entity ids, device names, area names, service names, card names, the `window.customCards` registry of custom cards, and text in the YAML being edited may contain HTML-like text, SVG payloads or text that looks like an event handler. These values are rendered as text and never as markup.

### Script already running in the page

A browser extension or another script in the page is out of scope as an attacker with full privileges. Nostrodomus still avoids offering it an easy step up: its global API accepts no code strings, evaluates nothing and has no function that sends data anywhere. Providers registered through `window.__nostrodomus.registerProvider` run inside the same guards as the built-in ones.

### Visitor who can request `/local/` files

Depending on how Home Assistant is exposed, static files under `/local/` may be readable without a session. The bundle contains no secrets, tokens, entity data or anything generated from a user's instance.

### Other resources on the page

Themes, custom cards and other frontend resources share the page. Nostrodomus does not depend on them and does not modify them. Its class names, element ids, attributes and globals carry the `nostrodomus` prefix.

## Trust boundaries

Read by Nostrodomus:

- the text of the active code editor
- Home Assistant objects that the frontend exposes in the page (`hass.states`, `hass.services`, the registries, themes)
- the completion data shipped in the bundle
- its own settings in `localStorage`

Never inserted as HTML:

- suggestion labels, details and documentation
- entity ids, service names, area and device names
- dashboard and card labels
- rows from custom providers
- diagnostics strings

Never done:

- sending data off the device
- executing a string supplied by a user, a provider or Home Assistant
- changing Home Assistant state or storage: the runtime calls no Home Assistant API that writes
- writing to a Home Assistant configuration directory from the build or verify tools
- taking over keyboard or pointer events outside the active editor

## Storage

Settings are stored in `localStorage` under `nostrodomus.settings`, the last open settings tab under `nostrodomus.settings.activeCategory`, and the counts of accepted completions under `nostrodomus.frecency`. A stored value replaces a default only when it has the same type, the keys `__proto__`, `constructor` and `prototype` are ignored, and the two item counts are clamped to the range the settings panel offers (`src/core/settings.js`, `src/core/settingsRuntime.js`). Nothing from the editor text is stored.

## Diagnostics

Diagnostics stay in the browser. A report contains counters, timings, the state of the active editor and summaries of the context. In the redacted form it contains no YAML text, entity lists or names. See `docs/DIAGNOSTICS.md`.

A feature that needs network access does not fit this model and needs a design discussion before any code.
