import { LOG_PREFIX, PROJECT_VERSION, VERSION } from './version.js';

/** @param {{ W?: any, health?: () => any, startupBadgeStatusFromHealth?: (readHealth: any) => string, debugModeEnabled?: () => boolean }} [deps] */
export function createLoggingRuntime({ W, health, startupBadgeStatusFromHealth, debugModeEnabled } = {}) {
  const logOnceKeys = new Set();
  // FIFO-bound the once-log dedup set so a pathological spread of distinct keys (e.g. a message
  // keyed on variable data) can't grow it without limit over a long session.
  const MAX_ONCE_KEYS = 500;
  let cachedPerfMode = 'on';
  let cachedPerfModeCheckedAt = 0;
  let cachedDebugFlag = false;
  let cachedDebugFlagCheckedAt = Number.NEGATIVE_INFINITY;

  function alreadyLoggedOnce(onceKey) {
    if (logOnceKeys.has(onceKey)) return true;
    if (logOnceKeys.size >= MAX_ONCE_KEYS) logOnceKeys.delete(logOnceKeys.values().next().value);
    logOnceKeys.add(onceKey);
    return false;
  }

  // Read from storage at most once a second: every log call and every telemetry call asks. A
  // value set from the browser console applies within that second, and a change made in another
  // tab applies at once through refreshStorageFlags.
  function nostrodomusDebugFlagEnabled() {
    const now = Date.now();
    if (now - cachedDebugFlagCheckedAt < 1000) return cachedDebugFlag;
    cachedDebugFlagCheckedAt = now;
    try {
      cachedDebugFlag = W?.localStorage?.getItem?.('nostrodomusDebug') === '1';
    } catch {
      cachedDebugFlag = false;
    }
    return cachedDebugFlag;
  }

  // For the window `storage` event: drop both cached flags when one of their keys changed
  // (the key is null when the other tab cleared storage).
  function refreshStorageFlags(event) {
    const key = event?.key;
    if (key != null && key !== 'nostrodomusDebug' && key !== 'nostrodomusPerf') return;
    cachedDebugFlagCheckedAt = Number.NEGATIVE_INFINITY;
    cachedPerfModeCheckedAt = Number.NEGATIVE_INFINITY;
  }

  function nostrodomusPerfMode() {
    const now = Date.now();
    if (now - cachedPerfModeCheckedAt < 1000) return cachedPerfMode;
    cachedPerfModeCheckedAt = now;
    try {
      const value = W?.localStorage?.getItem?.('nostrodomusPerf') || 'on';
      cachedPerfMode = value === 'legacy' ? 'legacy' : 'on';
    } catch {
      cachedPerfMode = 'on';
    }
    return cachedPerfMode;
  }

  function debugLoggingEnabled() {
    if (nostrodomusDebugFlagEnabled()) return true;
    // The "Debug console messages" checkbox (settings.debugMode) turns the same logging on.
    try { return debugModeEnabled?.() === true; } catch { return false; }
  }

  function logDebug(...args) {
    if (debugLoggingEnabled()) console.debug(LOG_PREFIX, ...args);
  }

  function logInfoOnce(key, ...args) {
    // A key that starts with "user:" is output the user asked for (a Copy or Log button whose
    // clipboard path is not available): it is printed every time, with or without debug logging.
    // The buttons said "Logged" while nothing reached the console.
    if (String(key || '').startsWith('user:')) {
      console.info(LOG_PREFIX, ...args);
      return;
    }
    if (!debugLoggingEnabled()) return;
    const onceKey = String(key || args.join('|') || 'info');
    if (alreadyLoggedOnce(onceKey)) return;
    console.info(LOG_PREFIX, ...args);
  }

  function logWarn(...args) {
    if (debugLoggingEnabled()) console.warn(LOG_PREFIX, ...args);
  }

  function logWarnOnce(key, ...args) {
    if (!debugLoggingEnabled()) return;
    const onceKey = String(key || args.join('|') || 'warn');
    if (alreadyLoggedOnce(onceKey)) return;
    logWarn(...args);
  }

  function logErrorOnce(key, ...args) {
    if (!debugLoggingEnabled()) return;
    const onceKey = String(key || args.join('|') || 'error');
    if (alreadyLoggedOnce(onceKey)) return;
    console.error(LOG_PREFIX, ...args);
  }

  function emitStartupBadge() {
    const ns = W ? (W.__nostrodomus || (W.__nostrodomus = {})) : null;
    if (ns?.startupBadgeShown === VERSION) return;
    if (ns) ns.startupBadgeShown = VERSION;
    const status = startupBadgeStatusFromHealth?.(health) || 'ready';
    const badge = `${status === 'ready' ? '✦' : '⚠'} NOSTRODOMUS   v${PROJECT_VERSION}   ${status}`;
    if (status === 'ready') console.info(badge);
    else console.warn(badge);
  }

  return {
    debugLoggingEnabled,
    emitStartupBadge,
    logDebug,
    logErrorOnce,
    logInfoOnce,
    logWarn,
    logWarnOnce,
    nostrodomusDebugFlagEnabled,
    nostrodomusPerfMode,
    refreshStorageFlags,
  };
}
