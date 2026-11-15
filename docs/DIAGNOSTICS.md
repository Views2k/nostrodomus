# Diagnostics

Nostrodomus diagnostics are local-only and meant for support and debugging. Nothing is sent anywhere. The Diagnostics tab of the settings panel shows the same data, and its Copy full report button copies the redacted export.

## Console API

```js
window.__nostrodomus.exportDiagnostics({ redact: true })
window.__nostrodomus.performanceStats()
window.__nostrodomus.clientCapabilities()
window.__nostrodomus.health()
```

`window.__nostrodomus` is the only namespace. There are no aliases.

The export contains versions, the health check, provider statistics, performance counters, observer and listener lifecycle statistics, a client capability snapshot (browser name and version, platform, and the graphics adapter name the browser reports), the active editor status, and a context summary. With `redact: true` (the default) the report keeps structure and lengths, not your text: the line under the cursor, the typed prefix, suggestion labels, details and documentation are replaced by their lengths. `redact: false` adds the raw context and is meant for local debugging only.

## Runtime errors

Nostrodomus keeps a buffer of the last 40 recorded errors, so that a failure can be reported without throwing into Home Assistant or filling the console.

```js
window.__nostrodomus.runtimeErrors()
window.__nostrodomus.exportDiagnostics({ redact: true }).runtimeErrors
window.__nostrodomus.clearRuntimeErrors()
```

A recorded error has a time, a scope (for example `completion:...`, `settings:...`, `provider:<id>:...`), the error name and message, and a bounded detail object. The most recent one is also the "Last error" of the Diagnostics tab. It fails the health check for five minutes and is a warning after that.

A failing provider is recorded and skipped; the other providers still supply their candidates.

## Debug logging

Without debug logging the console shows one line when the plugin is ready or degraded. To see the recorded errors and debug messages in the console, turn on Debug console messages in the Diagnostics tab, or run:

```js
localStorage.setItem("nostrodomusDebug", "1");
location.reload();
```

Remove the key (`localStorage.removeItem("nostrodomusDebug")`) to turn it off again.

## For contributors

- `recordRuntimeError(scope, err, detail)` records an error in `state.runtimeErrors` and sets `state.lastError`. It writes to the console only when debug logging is on.
- `recordRuntimeErrorOnce(scope, err, detail)` records the first occurrence of an error with the same scope, name and message. Use it on paths that can fail repeatedly, such as storage reads and editor discovery, so one failure does not fill the buffer. `clearRuntimeErrors()` also resets the once keys.
- `python3 tools/triage_catches.py --write` writes `reports/CATCH_TRIAGE.md`, a list of the catch blocks in `src/app.js`, grouped by keywords into cleanup guards, paths with consequences, and items to review by hand. The other modules under `src/` are not part of it.
