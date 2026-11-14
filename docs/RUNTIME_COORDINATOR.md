# Nostrodomus Runtime Coordinator

`window.__nostrodomusRuntimeCoordinatorV1` is a small in-memory object through which parts of Nostrodomus share quiet windows: short periods, usually while the user types, in which non-urgent work is postponed.

The coordinator holds state only. It makes no network calls, writes no storage, starts no timers or observers and does not touch the DOM.

## Who uses it

- The main runtime installs it at startup (`installRuntimeCoordinator` in `src/core/runtimeCoordinator.js`, called from `src/main.legacy.js`) and registers itself with the id `main-completion-runtime`.
- `src/editor/editorDispatchRuntime.js` marks quiet windows while editor transactions arrive in quick succession.
- The companion layer (`src/companion/inputQuietRuntime.js`) marks and reads the `editor-input` window to postpone its own work during typing.
- The two older standalone companion scripts carry their own copy of the installer and register as `v17-editor-bridge` and `picker-safe`. If one of them is loaded on the page, it shares this object with the main runtime, and the companion layer in the bundle stays dormant (see `docs/COMPANION_RESOURCES.md`).

Installation is idempotent: the first caller creates the object, later callers register with the existing one.

## API

```js
window.__nostrodomusRuntimeCoordinatorV1 = {
  version: "nostrodomus-runtime-coordinator-v1",
  state,
  now(),
  register(descriptor),
  markQuiet(channel, durationMs, reason, source),
  remaining(channel),
  isQuiet(channel),
  noteSuppression(channel, reason, source),
  snapshot(),
}
```

- `register({ id, role, version, projectVersion })` adds or updates a runtime entry. At most 12 entries are kept.
- `markQuiet(channel, durationMs, reason, source)` opens or extends a quiet window. The duration is limited to 5000 ms. A window is never shortened by a later, shorter mark. At most 12 channels are kept.
- `remaining(channel)` returns the milliseconds left in the window, `isQuiet(channel)` whether it is still open.
- `noteSuppression(channel, reason, source)` records that work was postponed and increments a counter.
- `snapshot()` returns a copy for diagnostics: the registered runtimes, the quiet windows with their remaining time, the counters and the last suppression.
- `state` is the shared state object that an installer reuses when it replaces an older coordinator object. `now()` is the clock the windows are measured with.

There is no call to remove a runtime. `unregisterRuntimeFromCoordinator` in `src/companion/coordinatorRuntime.js` deletes the main runtime's entry from `state` when Nostrodomus is uninstalled.

## Channels

Channels are plain strings. The bundle uses:

- `editor-input`: the user is typing in a code editor. Marked by the editor dispatch runtime and by the companion input-quiet runtime. Read by the companion layer before style and diagnostics work.
- `editor-dispatch-repeat-pressure`: editor transactions are arriving in quick succession. Marked by the editor dispatch runtime.
- `companion-deferred-work`: used with `noteSuppression` when the companion layer postpones work.

The standalone companion scripts also use `preview-value-freeze` and `picker-work`. These appear in a snapshot only when such a script is loaded.

## Diagnostics

```js
window.__nostrodomus.runtimeCoordinator()
window.__nostrodomus.debug().runtimeCoordinator
window.__nostrodomus.exportDiagnostics().runtimeCoordinator
```

All three return the `snapshot()` result, or `{ available: false, ... }` when no coordinator is installed.

## Rules

- The implementation lives in `src/core/runtimeCoordinator.js`. `src/companion/coordinatorRuntime.js` calls it and does not carry a second copy.
- The coordinator stays local and bounded: no `fetch`, no `sendBeacon`, no `localStorage`, no intervals, no document traversal. `tests/test_runtime_coordinator_unification_static.py` checks this.
- It coordinates quiet windows only. Completion ranking, insertion, the popup and Home Assistant's preview events are not its concern.
- Completion itself is never postponed by a quiet window. Only style, syntax refresh and diagnostics work is.
- The API listed above is the handshake the standalone scripts use. `tests/companion/coordinator_api_parity.test.mjs` compares the two implementations, so a change to the API has to keep that test passing.
