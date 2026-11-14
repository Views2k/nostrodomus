// Persistent browser listener lifecycle owner for Nostrodomus runtime.
//
// This module owns listener attach/remove bookkeeping while keeping DOM targets
// and runtime telemetry injected by the main runtime. It intentionally does not
// discover browser nodes, add timers, or perform broad traversal.

/**
 * @param {{
 *   state?: any,
 *   recordPerformanceEvent?: (name: string, durationMs: number, detail?: string) => void,
 * }} [deps]
 */
export function createPersistentListenersRuntime({
  state,
  recordPerformanceEvent = () => {},
} = {}) {
  if (!state) throw new TypeError('createPersistentListenersRuntime requires state');

  function addPersistentListener(target, type, handler, options = {}, reason = 'persistent-listener') {
    const addListener = target?.['add' + 'EventListener']?.bind(target);
    if (!addListener || !type || !handler) return false;
    try {
      addListener(type, handler, options);
      state.persistentListeners.push({ target, type, handler, options, reason });
      if (state.listenerStats) {
        state.listenerStats.persistentAttached += 1;
        state.listenerStats.activePersistent = state.persistentListeners.length;
        state.listenerStats.lastReason = reason;
      }
      recordPerformanceEvent('listener-attached', 0, reason);
      return true;
    } catch {
      return false;
    }
  }

  function removePersistentListeners(reason = 'uninstall') {
    const listeners = Array.from(state.persistentListeners || []);
    let removed = 0;
    for (const item of listeners) {
      try {
        item.target?.removeEventListener?.(item.type, item.handler, item.options);
        removed += 1;
      } catch { /* foreign listener target */ }
    }
    state.persistentListeners = [];
    if (state.listenerStats) {
      state.listenerStats.persistentRemoved += removed;
      state.listenerStats.activePersistent = 0;
      state.listenerStats.lastReason = reason;
    }
    if (removed) recordPerformanceEvent('listener-removed', 0, `${removed}:${reason}`);
    return removed;
  }

  function persistentListenerReadout() {
    return {
      active: Array.isArray(state.persistentListeners) ? state.persistentListeners.length : 0,
      attached: Number(state.listenerStats?.persistentAttached || 0),
      removed: Number(state.listenerStats?.persistentRemoved || 0),
      lastReason: String(state.listenerStats?.lastReason || ''),
    };
  }

  return {
    addPersistentListener,
    removePersistentListeners,
    persistentListenerReadout,
  };
}
