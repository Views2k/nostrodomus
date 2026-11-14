// Nostrodomus diagnostics fast-lane helper module.
// Keep this module pure: no DOM access, browser storage, timers, observers,
// shared runtime state mutation, network calls, or Home Assistant runtime reads.

export function startupBadgeStatusFromHealth(readHealth) {
  try {
    const report = typeof readHealth === "function" ? readHealth() : null;
    return report?.ok === false || report?.requiredOk === false ? "degraded" : "ready";
  } catch {
    return "degraded";
  }
}

/**
 * @param {any} err
 * @param {Record<string, any> | null} [extra]
 * @param {(value: any, limit?: number) => string} [boundedString]
 */
export function diagnosticsRuntimeErrorFallbackPayload(err, extra = null, boundedString = String) {
  const safeString = typeof boundedString === "function" ? boundedString : String;
  return Object.assign(
    { ok: false, error: safeString(err?.message || err, 180) },
    extra && typeof extra === "object" ? extra : {}
  );
}

/** @param {Record<string, any>} [input] */
export function shouldRecordPerformanceTelemetryDecision(input = {}) {
  const payload = input || {};
  if (!payload.name) return false;
  if (payload.perfMode === "legacy") return true;
  if (payload.debugLoggingEnabled === true) return true;
  if (payload.diagnosticsActive === true) return true;
  return false;
}

export function formatPerformanceEventMetric(event) {
  if (!event) return "none";
  return `${event.perMinute || 0}/min avg ${event.avgMs || 0}ms max ${event.maxMs || 0}ms`;
}

/** @param {Record<string, any>} [options] */
export function measurePerformanceEventWithCallbacks({ name = "", detail = "", shouldRecord = false, run, now, record, onSuppressed } = {}) {
  if (!shouldRecord) {
    try {
      return run();
    } finally {
      if (typeof onSuppressed === "function") onSuppressed(name);
    }
  }
  const readNow = typeof now === "function" ? now : () => Date.now();
  const start = readNow();
  try {
    return run();
  } finally {
    if (typeof record === "function") record(name, readNow() - start, detail);
  }
}

export function diagnosticsReasonIsInteractive(reason = "") {
  return /editor-dispatch|typing|explicit|keepopen|settings-open|tab-switch|diagnostics-refresh|copy|reset/.test(String(reason || ""));
}
/**
 * @param {string} stage
 * @param {Record<string, any>} [options]
 */
function diagnosticsReadoutMissingBase(stage, options = {}) {
  const payload = {
    ok: false,
    stage,
    localOnly: true,
    redacted: true,
    diagnosticsOnly: true,
    shadowOnly: true,
    drivesAutocomplete: false,
    mutatesRuntime: false,
    rendersUi: false,
  };
  if (options?.consoleOnly) payload.consoleOnly = true;
  if (options?.includeIoFlags) {
    payload.writesDom = false;
    payload.networkAccess = false;
  }
  return payload;
}

export function missingActiveEditorReadoutPayload(stage = "2C-active-editor-snapshot-readout") {
  return Object.assign(diagnosticsReadoutMissingBase(stage, { consoleOnly: true, includeIoFlags: true }), {
    editorFound: false,
    warning: "missing-active-editor-readout-module",
  });
}

/** @param {Record<string, any>} [options] */
/** @param {Record<string, any>} [options] */
export function activeEditorDiagnosticsReadoutEnvelopePayload({ activeReadout = {}, enabled = false, defaultEnabled = false } = {}) {
  return {
    ok: activeReadout?.ok === true,
    stage: "2C-active-editor-snapshot-readout",
    enabled: !!enabled,
    defaultEnabled: !!defaultEnabled,
    consoleOnly: true,
    localOnly: true,
    redacted: true,
    diagnosticsOnly: true,
    shadowOnly: true,
    drivesAutocomplete: false,
    mutatesRuntime: false,
    rendersUi: false,
    writesDom: false,
    networkAccess: false,
    activeEditor: activeReadout,
  };
}

/** @param {Record<string, any>} [options] */
/** @param {Record<string, any>} [options] */
/** @param {Record<string, any>} [options] */
export function runActiveEditorDiagnosticsReadoutWithCallbacks({ enabled = false, defaultEnabled = false, createReadout, missingReadout } = {}) {
  const activeReadout = typeof createReadout === "function"
    ? createReadout()
    : (typeof missingReadout === "function" ? missingReadout() : missingActiveEditorReadoutPayload());

  return activeEditorDiagnosticsReadoutEnvelopePayload({
    activeReadout,
    enabled,
    defaultEnabled,
  });
}


/** @param {Record<string, any>} [options] */
/** @param {Record<string, any>} [options] */
/** @param {Record<string, any>} [options] */
