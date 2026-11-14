# Security Policy

Nostrodomus is a local-only Home Assistant frontend resource. It runs in the browser, inside the Home Assistant page.

## Security posture

- No network calls: the bundle contains no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `sendBeacon` call, and no dynamic `import()`.
- No telemetry upload. Performance and diagnostics data stay in the browser.
- No `eval` or `new Function`, and no remote code loading.
- No `innerHTML`. The interface is built with `textContent`, `createElement` and attribute setters.
- No arbitrary user CSS injection. Style settings are bounded values.
- Settings are stored in the browser's local storage only.
- Diagnostics reports are redacted by default. A redacted report keeps structure and lengths, not the text of your YAML.

`tools/verify.py` checks the built bundle for the forbidden calls on every gate run.

## Reporting issues

Report a security issue at <https://github.com/Views2k/nostrodomus/issues>. Include a minimal reproduction and a redacted diagnostics report (Settings, Diagnostics, Copy full report). Do not paste secrets, tokens, full Home Assistant YAML, or private URLs.
