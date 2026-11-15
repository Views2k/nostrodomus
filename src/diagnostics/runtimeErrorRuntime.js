import { boundedRuntimeErrorString, safeRuntimeErrorDetail } from '../core/diagnostics.js';
import { diagnosticsRuntimeErrorFallbackPayload } from './diagnosticsReadoutHelpers.js';

/** @param {{ state?: any, logWarnOnce?: (...args: any[]) => void }} [deps] */
export function createRuntimeErrorRuntime({ state, logWarnOnce } = {}) {
  if (!state) throw new TypeError('createRuntimeErrorRuntime requires state');

  const runtimeErrorOnceKeys = new Set();
  // The once-key contains the error message, so the set is capped and drops its oldest key first.
  const MAX_ONCE_KEYS = 500;
  // The newest errors kept in state.runtimeErrors; older ones are counted in stats.dropped.
  const MAX_KEPT_ERRORS = 40;

  function recordRuntimeError(scope, err, detail = null) {
    const message = boundedRuntimeErrorString(err?.message || err || 'unknown runtime error', 300);
    const entry = {
      at: new Date().toISOString(),
      scope: boundedRuntimeErrorString(scope || 'runtime', 120),
      name: boundedRuntimeErrorString(err?.name || 'Error', 80),
      message,
      detail: safeRuntimeErrorDetail(detail),
    };

    try {
      if (!Array.isArray(state.runtimeErrors)) state.runtimeErrors = [];
      state.runtimeErrors.push(entry);
      const dropped = state.runtimeErrors.length > MAX_KEPT_ERRORS
        ? state.runtimeErrors.splice(0, state.runtimeErrors.length - MAX_KEPT_ERRORS).length
        : 0;
      const stats = state.runtimeErrorStats || (state.runtimeErrorStats = { total: 0, dropped: 0, byScope: Object.create(null), lastScope: '', lastAt: 0 });
      stats.total = (stats.total || 0) + 1;
      stats.dropped = (stats.dropped || 0) + dropped;
      stats.lastScope = entry.scope;
      stats.lastAt = Date.now();
      stats.byScope = stats.byScope || Object.create(null);
      stats.byScope[entry.scope] = (stats.byScope[entry.scope] || 0) + 1;
      state.lastError = entry;
    } catch (recordErr) {
      // Never let diagnostics recording become the host-facing failure.
    }

    logWarnOnce?.(`runtime-error-${entry.scope}-${entry.name}-${message}`, 'runtime error', entry);
    return entry;
  }

  function recordRuntimeErrorOnce(scope, err, detail = null) {
    const message = boundedRuntimeErrorString(err?.message || err || 'unknown runtime error', 300);
    const key = `${boundedRuntimeErrorString(scope || 'runtime', 120)}:${boundedRuntimeErrorString(err?.name || 'Error', 80)}:${message}`;
    if (runtimeErrorOnceKeys.has(key)) return null;
    if (runtimeErrorOnceKeys.size >= MAX_ONCE_KEYS) runtimeErrorOnceKeys.delete(runtimeErrorOnceKeys.values().next().value);
    runtimeErrorOnceKeys.add(key);
    return recordRuntimeError(scope, err, detail);
  }

  function runtimeErrorReadout(debugEnabled = false) {
    return {
      ok: true,
      localOnly: true,
      debugEnabled: !!debugEnabled,
      stats: { ...(state.runtimeErrorStats || {}) },
      items: Array.isArray(state.runtimeErrors) ? state.runtimeErrors.slice(-MAX_KEPT_ERRORS) : [],
    };
  }

  function clearRuntimeErrors() {
    state.runtimeErrors = [];
    state.runtimeErrorStats = { total: 0, dropped: 0, byScope: Object.create(null), lastScope: '', lastAt: 0 };
    state.lastError = null;
    runtimeErrorOnceKeys.clear();
    return runtimeErrorReadout(false);
  }

  function diagnosticsRuntimeErrorFallback(scope, err, detail = null, extra = null) {
    recordRuntimeError(scope, err, detail);
    return diagnosticsRuntimeErrorFallbackPayload(err, extra, boundedRuntimeErrorString);
  }

  return {
    clearRuntimeErrors,
    diagnosticsRuntimeErrorFallback,
    recordRuntimeError,
    recordRuntimeErrorOnce,
    runtimeErrorReadout,
  };
}
