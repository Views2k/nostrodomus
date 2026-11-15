// Nostrodomus cross-runtime coordination surface.
//
// Lets the main runtime and the companion scripts (the editor and picker companions in
// reference/companions, when they are installed on their own) share quiet windows through
// window.__nostrodomusRuntimeCoordinatorV1, without importing each other and without another
// observer or polling loop. Pure apart from writes to the given global object.

export const RUNTIME_COORDINATOR_VERSION = "nostrodomus-runtime-coordinator-v1";

const MAX_RUNTIME_ID_LENGTH = 80;
const MAX_REASON_LENGTH = 160;
const MAX_CHANNEL_LENGTH = 80;
const MAX_RUNTIMES = 12;
const MAX_CHANNELS = 12;

function nowMs(root = globalThis) {
  try {
    const perfNow = root?.performance?.now?.();
    if (Number.isFinite(perfNow)) return perfNow;
  } catch { /* injected window stub */ }
  try { return Date.now(); } catch { return 0; }
}

function wallIso() {
  try { return new Date().toISOString(); } catch { return ""; }
}

function shortText(value, limit) {
  const text = String(value || "");
  return text.length > limit ? text.slice(0, limit) : text;
}

function cleanRuntimeId(id = "runtime") {
  const value = shortText(id || "runtime", MAX_RUNTIME_ID_LENGTH);
  return value || "runtime";
}

function cleanChannel(channel = "default") {
  const value = shortText(channel || "default", MAX_CHANNEL_LENGTH);
  return value || "default";
}

function cleanDescriptor(descriptor = {}) {
  const id = cleanRuntimeId(descriptor.id || descriptor.name || "runtime");
  return {
    id,
    role: shortText(descriptor.role || "runtime", MAX_RUNTIME_ID_LENGTH),
    version: shortText(descriptor.version || "", 180),
    projectVersion: shortText(descriptor.projectVersion || "", 40),
    lastSeenAt: wallIso(),
  };
}

function pruneObjectKeys(obj, maxEntries) {
  const keys = Object.keys(obj || {});
  if (keys.length <= maxEntries) return;
  for (const key of keys.slice(0, keys.length - maxEntries)) {
    try { delete obj[key]; } catch { /* frozen object */ }
  }
}

export function installRuntimeCoordinator(root = globalThis, descriptor = {}) {
  const W = root || globalThis;
  const existing = W.__nostrodomusRuntimeCoordinatorV1;
  if (existing?.version === RUNTIME_COORDINATOR_VERSION && typeof existing.register === "function") {
    existing.register(descriptor);
    return existing;
  }

  const state = existing?.state && typeof existing.state === "object"
    ? existing.state
    : {
        installedAt: wallIso(),
        runtimes: Object.create(null),
        quietWindows: Object.create(null),
        counters: { registered: 0, quietMarks: 0, suppressions: 0 },
      };

  const api = {
    version: RUNTIME_COORDINATOR_VERSION,
    state,
    now: () => nowMs(W),
    register(nextDescriptor = {}) {
      const cleaned = cleanDescriptor(nextDescriptor);
      const prior = state.runtimes[cleaned.id] || null;
      state.runtimes[cleaned.id] = { ...prior, ...cleaned };
      state.counters.registered = Object.keys(state.runtimes).length;
      pruneObjectKeys(state.runtimes, MAX_RUNTIMES);
      return state.runtimes[cleaned.id];
    },
    markQuiet(channel = "default", durationMs = 0, reason = "quiet", source = "runtime") {
      const key = cleanChannel(channel);
      const now = nowMs(W);
      const duration = Math.max(0, Math.min(5000, Math.round(Number(durationMs) || 0)));
      const until = now + duration;
      const prior = state.quietWindows[key] || null;
      state.quietWindows[key] = {
        channel: key,
        until: Math.max(prior?.until || 0, until),
        durationMs: duration,
        reason: shortText(reason || "quiet", MAX_REASON_LENGTH),
        source: cleanRuntimeId(source || "runtime"),
        updatedAt: wallIso(),
      };
      state.counters.quietMarks = (state.counters.quietMarks || 0) + 1;
      pruneObjectKeys(state.quietWindows, MAX_CHANNELS);
      return state.quietWindows[key];
    },
    remaining(channel = "default") {
      const key = cleanChannel(channel);
      const windowState = state.quietWindows[key];
      if (!windowState) return 0;
      return Math.max(0, Math.ceil((windowState.until || 0) - nowMs(W)));
    },
    isQuiet(channel = "default") {
      return api.remaining(channel) > 0;
    },
    noteSuppression(channel = "default", reason = "suppressed", source = "runtime") {
      const key = cleanChannel(channel);
      state.lastSuppression = {
        channel: key,
        reason: shortText(reason || "suppressed", MAX_REASON_LENGTH),
        source: cleanRuntimeId(source || "runtime"),
        at: wallIso(),
      };
      state.counters.suppressions = (state.counters.suppressions || 0) + 1;
      return state.lastSuppression;
    },
    snapshot() {
      const now = nowMs(W);
      const quietWindows = Object.fromEntries(Object.entries(state.quietWindows || {}).map(([key, value]) => [key, {
        channel: value.channel || key,
        active: Math.max(0, Math.ceil((value.until || 0) - now)) > 0,
        remainingMs: Math.max(0, Math.ceil((value.until || 0) - now)),
        durationMs: value.durationMs || 0,
        reason: value.reason || "",
        source: value.source || "",
        updatedAt: value.updatedAt || "",
      }]));
      return {
        available: true,
        version: RUNTIME_COORDINATOR_VERSION,
        installedAt: state.installedAt || "",
        runtimes: Object.values(state.runtimes || {}),
        quietWindows,
        counters: { ...(state.counters || {}) },
        lastSuppression: state.lastSuppression || null,
      };
    },
  };

  W.__nostrodomusRuntimeCoordinatorV1 = api;
  api.register(descriptor);
  return api;
}

export function readRuntimeCoordinatorSnapshot(root = globalThis) {
  const coordinator = root?.__nostrodomusRuntimeCoordinatorV1;
  if (!coordinator || typeof coordinator.snapshot !== "function") {
    return { available: false, version: RUNTIME_COORDINATOR_VERSION, runtimes: [], quietWindows: {}, counters: {} };
  }
  return coordinator.snapshot();
}
