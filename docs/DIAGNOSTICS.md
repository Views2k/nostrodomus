# Diagnostics

Nostrodomus diagnostics are local-only and intended for support/debugging.

Preferred API:

```js
window.__nostrodomus.exportDiagnostics({ redact: true })
window.__nostrodomus.performanceStats()
window.__nostrodomus.clientCapabilities()
window.__nostrodomus.health()
```

Legacy aliases may still work for compatibility, but new support instructions should use `window.__nostrodomus`.

Diagnostics should include performance counters, observer/listener lifecycle stats, client capability estimates, active editor status, and redacted context summaries. They should not include full Home Assistant YAML content or secrets.

## Runtime error diagnostics

Diagnostics keeps a bounded runtime-error buffer so consequential failures can be reported without throwing into Home Assistant or spamming production consoles.

Debug gate:

```js
localStorage.setItem("nostrodomusDebug", "1");
location.reload();
```

Runtime error readout:

```js
window.__nostrodomus.runtimeErrors()
window.__nostrodomus.exportDiagnostics({ redact: true }).runtimeErrors
window.__nostrodomus.clearRuntimeErrors()
```

Production behavior remains quiet. `recordRuntimeError(scope, err, detail)` records local-only redacted summaries in `state.runtimeErrors`, updates `state.lastError`, and only emits a one-time console warning when the debug gate is enabled. Provider failures now use this path so one failed provider remains visible in diagnostics while candidate generation continues to degrade gracefully.

Catch triage workflow:

```bash
python3 tools/triage_catches.py --write
```

The generated `reports/CATCH_TRIAGE.md` classifies catch sites into cleanup/idempotence guards, consequential paths, and manual-review items. Convert consequential sites in focused patches rather than mass-editing every catch block.

### One-shot runtime errors

Some diagnostic/storage paths can be retried frequently while the Settings panel is open. Use `recordRuntimeErrorOnce(scope, err, detail)` for those repeated fallback paths so the first failure is visible without flooding `runtimeErrors()`. `clearRuntimeErrors()` resets both the stored readout and the one-shot keys.



### Editor/completion runtime errors

v31.6.95 adds scoped diagnostics for editor and completion failure boundaries, including completion compute, insertion dispatch, snippet placeholder/session handling, active editor discovery, overlay-root query, and editor sentinel observer fallback paths. These failures should be inspected through `window.__nostrodomus.runtimeErrors()` or the redacted diagnostics export. High-frequency editor-discovery fallbacks use one-shot recording to avoid buffer spam.
