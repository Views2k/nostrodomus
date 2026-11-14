// Companion-layer entry for the shared runtime coordinator and the companion
// coexistence / dormancy signal.
//
// The coordinator math is single-sourced in src/core/runtimeCoordinator.js — the
// installer that publishes the frozen `__nostrodomusRuntimeCoordinatorV1` handshake
// (same VERSION_ID, same api/state surface, same first-injector-wins idempotence)
// that the two legacy companion files install. Re-implementing that body here would
// duplicate it, so this module does not: it exposes the 1-arg frozen-contract
// installer (delegating to the single core impl) plus the external-companion
// detection + dormancy signal that the other companion modules consult and
// diagnostics reports.

import { installRuntimeCoordinator as installRuntimeCoordinatorCore } from '../core/runtimeCoordinator.js';

// The internal (main) coordinator descriptor id — NOT an external companion.
export const INTERNAL_COORDINATOR_DESCRIPTOR_ID = 'main-completion-runtime';

// Legacy EXTERNAL companion descriptor ids + roles (what the standalone files
// register: v17 editor bridge, picker-safe). An external descriptor in the shared
// coordinator means a legacy file is loaded and owns the layer this release.
const EXTERNAL_COMPANION_DESCRIPTOR_IDS = Object.freeze(['v17-editor-bridge', 'picker-safe']);
const EXTERNAL_COMPANION_ROLES = Object.freeze(['editor-layout-runtime', 'picker-companion-runtime']);

// Injected stylesheet element ids the legacy files own (first-injector-wins guard
// for the per-module CSS; dormancy itself rides the descriptor signal above).
export const EXTERNAL_COMPANION_STYLE_IDS = Object.freeze([
  'nostrodomus-editor-v17-2-learned-style',
  'nostrodomus-picker-only-final-v2',
]);

// Companion-layer override — one hidden localStorage key, mirrors
// the loggingRuntime nostrodomus* pattern. "dormant" force-disables the companion
// layer (restoring the no-companion behavior); "active" force-enables it (an escape
// hatch to flip a module active on a test instance without a code change). Absent/other
// = each module's shipped default.
export const COMPANION_FORCE_DORMANT_KEY = 'nostrodomusCompanion';
export const COMPANION_FORCE_DORMANT_VALUE = 'dormant';
const COMPANION_FORCE_ACTIVE_VALUE = 'active';

// 1-arg frozen-contract installer. Delegates to the single core impl so main and the
// companion layer install the identical coordinator global.
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

// The override key is read through a short cache, per storage object. The dormancy check runs on
// every pointerdown, focusin and observed mutation, and each call read localStorage. A value is
// kept for COMPANION_OVERRIDE_CACHE_MS, so a change typed into the console of the same tab
// applies within that time; a change made in another tab or window applies at once through the
// `storage` event (onCompanionOverrideStorageEvent), and code that writes the key itself calls
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

// Force-dormant escape hatch active? Fail-dark: any access error reads as not-forced.
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

// Is a legacy external companion loaded? Read the shared coordinator's registered
// runtimes for a known external descriptor id/role. Fail-dark to false.
/** @param {Record<string, any>} [options] */
export function isExternalCompanionPresent(options = {}) {
  const { globalRef = globalThis } = options;
  try {
    const coordinator = globalRef?.__nostrodomusRuntimeCoordinatorV1;
    // The registered runtimes are read from the coordinator state (part of the shared handshake,
    // at most twelve entries). snapshot() also copies every quiet window and the counters, and
    // this check runs on every pointerdown, focusin and observed mutation.
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

// The diagnostics companion-layer value (ordering: forced wins, then
// external ownership, else the companion layer is internal).
/** @param {Record<string, any>} [options] */
export function companionLayerStatus(options = {}) {
  const { globalRef = globalThis, storage } = options;
  if (isForceDormant({ globalRef, storage })) return 'dormant(forced)';
  if (isExternalCompanionPresent({ globalRef })) return 'external';
  return 'internal';
}

// The single dormancy predicate every companion module consults at its first-apply
// moment: dormant when force-dormant OR an external companion owns the layer. (The
// quiet-window guard returns "no deferral" exactly when this is true.)
/** @param {Record<string, any>} [options] */
export function companionModuleDormant(options = {}) {
  const { globalRef = globalThis, storage } = options;
  return isForceDormant({ globalRef, storage }) || isExternalCompanionPresent({ globalRef });
}

// Should a companion module (scrollbar, settle, picker) be ACTIVE right now?
// Precedence: force-dormant OR an external companion owns the layer -> never active;
// else the force-active escape hatch -> active; else the module's shipped default.
/** @param {Record<string, any>} [options] */
export function companionLayerActive(options = {}) {
  const { globalRef = globalThis, storage, shippedDefault = false } = options;
  if (companionModuleDormant({ globalRef, storage })) return false;
  try {
    if (readCompanionOverride(storage, globalRef) === COMPANION_FORCE_ACTIVE_VALUE) return true;
  } catch { /* storage access denied */ }
  return !!shippedDefault;
}
