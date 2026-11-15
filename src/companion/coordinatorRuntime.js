// The companion layer's view of the shared runtime coordinator, and whether the layer is
// dormant.
//
// The coordinator itself (the `__nostrodomusRuntimeCoordinatorV1` global, first installer
// wins) is implemented once, in src/core/runtimeCoordinator.js. The two standalone companion
// scripts install the same one. This module adds the check the companion modules and
// diagnostics use: is one of those scripts loaded, or is the layer switched off by hand.

import { installRuntimeCoordinator as installRuntimeCoordinatorCore } from '../core/runtimeCoordinator.js';

// The descriptor id Nostrodomus itself registers. It is not an external companion.
export const INTERNAL_COORDINATOR_DESCRIPTOR_ID = 'main-completion-runtime';

// The descriptor ids and roles the standalone companion scripts register (the editor layout
// script and the picker script). When one is registered, that script owns the layer.
const EXTERNAL_COMPANION_DESCRIPTOR_IDS = Object.freeze(['v17-editor-bridge', 'picker-safe']);
const EXTERNAL_COMPANION_ROLES = Object.freeze(['editor-layout-runtime', 'picker-companion-runtime']);

// The stylesheet ids the standalone scripts inject. The companion modules use the same ids, so
// a sheet that is already there is not injected a second time.
export const EXTERNAL_COMPANION_STYLE_IDS = Object.freeze([
  'nostrodomus-editor-v17-2-learned-style',
  'nostrodomus-picker-only-final-v2',
]);

// A localStorage key with no control in the panel. "dormant" switches the companion layer off;
// "active" switches on a module that ships off (useful on a test instance). Any other value
// leaves each module at its default.
export const COMPANION_FORCE_DORMANT_KEY = 'nostrodomusCompanion';
export const COMPANION_FORCE_DORMANT_VALUE = 'dormant';
const COMPANION_FORCE_ACTIVE_VALUE = 'active';

// Installs the shared coordinator (src/core/runtimeCoordinator.js) on `options.globalRef`.
/** @param {Record<string, any>} [descriptor] @param {Record<string, any>} [options] */
export function installRuntimeCoordinator(descriptor = {}, options = {}) {
  const { globalRef = globalThis } = options;
  return installRuntimeCoordinatorCore(globalRef, descriptor);
}

// Take a runtime out of the shared coordinator (uninstall). The handshake has no unregister
// call, so the entry is removed from the coordinator state both installers share. The
// coordinator itself stays: other runtimes may still use it. Returns true when an entry was
// removed.
/** @param {Record<string, any>} [options] */
export function unregisterRuntimeFromCoordinator(options = {}) {
  const { globalRef = globalThis, id = INTERNAL_COORDINATOR_DESCRIPTOR_ID } = options;
  try {
    const coordinatorState = globalRef?.__nostrodomusRuntimeCoordinatorV1?.state;
    const runtimes = coordinatorState?.runtimes;
    if (!runtimes || typeof runtimes !== 'object' || !(id in runtimes)) return false;
    delete runtimes[id];
    if (coordinatorState.counters) coordinatorState.counters.registered = Object.keys(runtimes).length;
    return true;
  } catch {
    return false;
  }
}

function safeStorage(storage, globalRef) {
  try {
    if (storage) return storage;
    if (globalRef?.localStorage) return globalRef.localStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* storage access denied */ }
  return null;
}

// The override key is read through a short cache, per storage object, because the dormancy check
// runs on every pointerdown, focusin and observed mutation. A value is kept for
// COMPANION_OVERRIDE_CACHE_MS, so a change typed into the console of the same tab applies within
// that time; a change made in another tab or window applies at once through the `storage` event
// (onCompanionOverrideStorageEvent), and code that writes the key itself calls
// invalidateCompanionOverrideCache.
export const COMPANION_OVERRIDE_CACHE_MS = 1000;
let companionOverrideCache = new WeakMap();

function readCompanionOverride(storage, globalRef) {
  const store = safeStorage(storage, globalRef);
  if (!store) return null;
  const at = Date.now();
  const known = companionOverrideCache.get(store);
  if (known && at - known.at >= 0 && at - known.at < COMPANION_OVERRIDE_CACHE_MS) return known.value;
  const value = store.getItem?.(COMPANION_FORCE_DORMANT_KEY) ?? null;
  try { companionOverrideCache.set(store, { value, at }); } catch { /* not an object: read every time */ }
  return value;
}

// Forget the cached override so the next check reads storage again.
export function invalidateCompanionOverrideCache() {
  companionOverrideCache = new WeakMap();
}

// `storage` event handler: the override key changed in another tab or window (key null: the
// whole storage was cleared).
/** @param {{ key?: string | null } | null} [event] */
export function onCompanionOverrideStorageEvent(event) {
  if (!event || event.key === null || event.key === COMPANION_FORCE_DORMANT_KEY) invalidateCompanionOverrideCache();
}

// True when the override key says "dormant". A storage error reads as not set.
/** @param {Record<string, any>} [options] */
export function isForceDormant(options = {}) {
  const { globalRef = globalThis, storage } = options;
  try {
    return readCompanionOverride(storage, globalRef) === COMPANION_FORCE_DORMANT_VALUE;
  } catch {
    return false;
  }
}

function isExternalCompanionDescriptor(runtime) {
  return EXTERNAL_COMPANION_DESCRIPTOR_IDS.includes(runtime?.id) ||
    EXTERNAL_COMPANION_ROLES.includes(runtime?.role);
}

// True when a standalone companion script is registered in the shared coordinator. Any error
// reads as false.
/** @param {Record<string, any>} [options] */
export function isExternalCompanionPresent(options = {}) {
  const { globalRef = globalThis } = options;
  try {
    const coordinator = globalRef?.__nostrodomusRuntimeCoordinatorV1;
    // The runtimes are read from the coordinator state (part of the shared handshake, at most
    // twelve entries): snapshot() also copies every quiet window and counter, and this check runs
    // on every pointerdown, focusin and observed mutation.
    const registered = coordinator?.state?.runtimes;
    if (registered && typeof registered === 'object') {
      for (const id in registered) {
        if (isExternalCompanionDescriptor(registered[id])) return true;
      }
      return false;
    }
    const snap = coordinator?.snapshot?.();
    const runtimes = Array.isArray(snap?.runtimes) ? snap.runtimes : [];
    return runtimes.some(isExternalCompanionDescriptor);
  } catch {
    return false;
  }
}

// The companion layer value diagnostics show: switched off by hand, owned by a standalone
// script, or run by Nostrodomus itself, in that order.
/** @param {Record<string, any>} [options] */
export function companionLayerStatus(options = {}) {
  const { globalRef = globalThis, storage } = options;
  if (isForceDormant({ globalRef, storage })) return 'dormant(forced)';
  if (isExternalCompanionPresent({ globalRef })) return 'external';
  return 'internal';
}

// Dormant: switched off by hand, or a standalone script owns the layer. Every companion module
// checks this before it applies anything, and the typing guard never defers while it is true.
/** @param {Record<string, any>} [options] */
export function companionModuleDormant(options = {}) {
  const { globalRef = globalThis, storage } = options;
  return isForceDormant({ globalRef, storage }) || isExternalCompanionPresent({ globalRef });
}

// Whether a companion module (scrollbar, settle, picker) is active: never while dormant, always
// when the override key says "active", otherwise the module's default.
/** @param {Record<string, any>} [options] */
export function companionLayerActive(options = {}) {
  const { globalRef = globalThis, storage, shippedDefault = false } = options;
  if (companionModuleDormant({ globalRef, storage })) return false;
  try {
    if (readCompanionOverride(storage, globalRef) === COMPANION_FORCE_ACTIVE_VALUE) return true;
  } catch { /* storage access denied */ }
  return !!shippedDefault;
}
