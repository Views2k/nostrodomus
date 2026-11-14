// VERBATIM transplant of the runtime coordinator installer.
//
// Generated once from reference/companions/nostrodomus_editor_v17_2_learned_reapply.js
// (the installer in nostrodomus-picker-safe.js is byte-identical). This fixture is the
// copy of the unmodified companion code the golden baselines run against. coordinator_api_parity.test.mjs asserts this body is byte-identical to
// the frozen companion source, so it can never silently drift.
//
// The installer touches only globalThis / performance / Date, so it runs as-is in
// Node. eslint: globalThis + Date are ES built-ins; performance is reached via
// W.performance (no bare global). Do not edit the region between the markers.
//
// >>> VERBATIM-INSTALLER-BEGIN
function __nostrodomusInstallRuntimeCoordinatorV1(descriptor = {}) {
  const W = globalThis;
  const VERSION_ID = "nostrodomus-runtime-coordinator-v1";
  const now = () => { try { return W.performance?.now?.() || Date.now(); } catch { return Date.now(); } };
  const stamp = () => { try { return new Date().toISOString(); } catch { return ""; } };
  const text = (value, limit = 160) => String(value || "").slice(0, limit);
  const cleanId = (value) => text(value || "runtime", 80) || "runtime";
  const existing = W.__nostrodomusRuntimeCoordinatorV1;
  if (existing?.version === VERSION_ID && typeof existing.register === "function") {
    existing.register(descriptor);
    return existing;
  }
  const state = existing?.state && typeof existing.state === "object" ? existing.state : {
    installedAt: stamp(),
    runtimes: Object.create(null),
    quietWindows: Object.create(null),
    counters: { registered: 0, quietMarks: 0, suppressions: 0 }
  };
  const prune = (obj, max) => {
    const keys = Object.keys(obj || {});
    if (keys.length <= max) return;
    keys.slice(0, keys.length - max).forEach((key) => { try { delete obj[key]; } catch {} });
  };
  const api = {
    version: VERSION_ID,
    state,
    now,
    register(next = {}) {
      const id = cleanId(next.id || next.name);
      state.runtimes[id] = {
        ...(state.runtimes[id] || {}),
        id,
        role: text(next.role || "runtime", 80),
        version: text(next.version || "", 180),
        projectVersion: text(next.projectVersion || "", 40),
        lastSeenAt: stamp()
      };
      state.counters.registered = Object.keys(state.runtimes).length;
      prune(state.runtimes, 12);
      return state.runtimes[id];
    },
    markQuiet(channel = "default", durationMs = 0, reason = "quiet", source = "runtime") {
      const key = text(channel || "default", 80) || "default";
      const duration = Math.max(0, Math.min(5000, Math.round(Number(durationMs) || 0)));
      const prior = state.quietWindows[key] || null;
      state.quietWindows[key] = {
        channel: key,
        until: Math.max(prior?.until || 0, now() + duration),
        durationMs: duration,
        reason: text(reason || "quiet", 160),
        source: cleanId(source),
        updatedAt: stamp()
      };
      state.counters.quietMarks = (state.counters.quietMarks || 0) + 1;
      prune(state.quietWindows, 12);
      return state.quietWindows[key];
    },
    remaining(channel = "default") {
      const key = text(channel || "default", 80) || "default";
      const q = state.quietWindows[key];
      return q ? Math.max(0, Math.ceil((q.until || 0) - now())) : 0;
    },
    isQuiet(channel = "default") { return api.remaining(channel) > 0; },
    noteSuppression(channel = "default", reason = "suppressed", source = "runtime") {
      state.lastSuppression = { channel: text(channel || "default", 80), reason: text(reason || "suppressed", 160), source: cleanId(source), at: stamp() };
      state.counters.suppressions = (state.counters.suppressions || 0) + 1;
      return state.lastSuppression;
    },
    snapshot() {
      const t = now();
      const quietWindows = Object.fromEntries(Object.entries(state.quietWindows || {}).map(([key, value]) => [key, {
        channel: value.channel || key,
        active: Math.max(0, Math.ceil((value.until || 0) - t)) > 0,
        remainingMs: Math.max(0, Math.ceil((value.until || 0) - t)),
        durationMs: value.durationMs || 0,
        reason: value.reason || "",
        source: value.source || "",
        updatedAt: value.updatedAt || ""
      }]));
      return { available: true, version: VERSION_ID, installedAt: state.installedAt || "", runtimes: Object.values(state.runtimes || {}), quietWindows, counters: { ...(state.counters || {}) }, lastSuppression: state.lastSuppression || null };
    }
  };
  W.__nostrodomusRuntimeCoordinatorV1 = api;
  api.register(descriptor);
  return api;
}
// <<< VERBATIM-INSTALLER-END

export { __nostrodomusInstallRuntimeCoordinatorV1 };
