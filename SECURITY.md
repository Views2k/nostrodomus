# Security Policy

Nostrodomus is a local-only Home Assistant frontend resource.

## Security posture

- No telemetry upload.
- No hidden network calls.
- No `fetch`, `sendBeacon`, XHR, or WebSocket runtime calls.
- No `eval` or `new Function`.
- No arbitrary user CSS injection.
- Diagnostics should be redacted and should not include full Home Assistant YAML/config content.

## Reporting issues

For security-sensitive issues, share a minimal reproduction and a redacted diagnostics report. Do not paste secrets, tokens, full Home Assistant YAML, or private URLs.
