// Nostrodomus health report: bounded summaries of the runtime, the providers and the engine.
// No markup, settings UI, DOM mounting, browser storage, clipboard, popup UI, network access or
// state changes.

function boundedArrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

function safeNowMs(options = {}) {
  return Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
}

// How long a recorded error counts as current for the health report.
export const LAST_ERROR_CURRENT_MS = 5 * 60 * 1000;

// Age of a recorded error entry (`at` is an ISO string from recordRuntimeError, or a number).
// 0 when there is no usable time, which the health check treats as current.
function lastErrorAge(lastError, nowMs) {
  const at = lastError?.at;
  const atMs = typeof at === "number" ? at : Date.parse(String(at || ""));
  return Number.isFinite(atMs) ? Math.max(0, nowMs - atMs) : 0;
}

export function runtimeSummary(runtimeState = {}, options = {}) {
  const rt = runtimeState?.runtimeCache || {};
  const at = Number(rt.at || 0);
  const nowMs = safeNowMs(options);
  return {
    hasHass: !!rt.hasHass,
    ageMs: at ? Math.max(0, nowMs - at) : null,
    entities: boundedArrayLength(rt.entities),
    services: boundedArrayLength(rt.services),
    themes: boundedArrayLength(rt.themes),
    cards: boundedArrayLength(rt.cards),
    icons: boundedArrayLength(rt.icons),
    actions: boundedArrayLength(rt.actions),
    customCards: Array.isArray(rt.cards) ? rt.cards.filter(type => String(type || '').startsWith('custom:')).length : 0,
    serviceFieldServices: rt.serviceFields && typeof rt.serviceFields === 'object' ? Object.keys(rt.serviceFields).length : 0,
  };
}

export function providerSummary(runtimeState = {}) {
  return (runtimeState?.providers || []).map((provider) => {
    const stats = runtimeState?.providerStats?.[provider.id] || {};
    return {
      id: provider.id,
      calls: stats.calls || 0,
      lastCount: stats.lastCount || 0,
      lastMs: stats.lastMs || 0,
    };
  });
}

export function health(runtimeState = {}, options = {}) {
  const checks = [];
  const contextualChecks = new Set(["editor-detected", "edit-dialog-active", "editor-scoped", "runtime-hass", "selector-seam-coverage"]);
  const add = (name, ok, detail = "", severity = "required") => {
    const passed = !!ok;
    checks.push({
      name,
      ok: passed,
      detail,
      severity,
      status: passed ? "ok" : severity === "required" ? "fail" : "warning",
    });
  };
  const addContextual = (name, ok, detail = "") => add(name, ok, detail, "contextual");
  const maxCacheEntries = Number.isFinite(options.maxCacheEntries) ? options.maxCacheEntries : Infinity;
  const providerCount = boundedArrayLength(runtimeState?.providers);
  const cacheEntries = runtimeState?.completionCache?.size || 0;

  add("api-installed", options.apiInstalled === true, "preferred public API is registered");
  add("engine-enabled", !!runtimeState?.enabled, "engine is enabled");
  addContextual("editor-detected", options.editorDetected === true, "active CodeMirror editor detected when an editor is open");
  addContextual("edit-dialog-active", options.editDialogActive === true, "visible Home Assistant edit-card dialog detected when editing a card");
  addContextual("editor-scoped", options.editorScoped === true, "CodeMirror view is scoped to the visible edit-card dialog when an editor is active");
  const seam = runtimeState?.selectorSeamStatus || null;
  const seamProbed = (seam?.probeCount || 0) > 0;
  const seamMissing = Array.isArray(seam?.missingCritical) ? seam.missingCritical : [];
  // Contextual: OK until an editor has opened, since the selectors cannot be checked without one.
  // After that, a missing critical selector most likely means Home Assistant renamed an element
  // the registry still expects.
  addContextual(
    "selector-seam-coverage",
    !seamProbed || seamMissing.length === 0,
    seamProbed
      ? `${seam.coverage}% critical HA-selector coverage${seamMissing.length ? ` (missing: ${seamMissing.join(", ")})` : ""}`
      : "HA-selector seams not yet probed (no editor opened)",
  );
  // The completion library, index and providers load with the first editor, not at boot. Until
  // then (completionStaged) their absence is expected and the checks are contextual, so a
  // dashboard without an editor reads "ready", not "degraded": the startup badge follows
  // requiredOk, and a degraded badge is also a console warning. Once loaded they are required.
  const completionStaged = options.completionStaged === true;
  const addCompletionReadiness = (name, ok, detail) => {
    if (completionStaged) { contextualChecks.add(name); addContextual(name, ok, detail); }
    else add(name, ok, detail);
  };
  addCompletionReadiness("library-loaded", !!runtimeState?.library, "completion library loaded");
  addCompletionReadiness("index-ready", !!runtimeState?.index, "completion index built");
  addCompletionReadiness("providers-ready", providerCount > 0, `${providerCount} providers registered`);
  addContextual("runtime-hass", !!runtimeState?.runtimeCache?.hasHass, "Home Assistant runtime object available when runtime values are needed");
  // A recorded error is a required failure while it is current: recorded within the last
  // LAST_ERROR_CURRENT_MS, or carrying no time to judge it by. An older one stays in the report
  // as a warning with its age, so one handled error (a denied clipboard write, a storage read)
  // does not leave the session marked as failed until the page is reloaded.
  const lastError = runtimeState?.lastError || null;
  const lastErrorAgeMs = lastErrorAge(lastError, safeNowMs(options));
  if (lastError && lastErrorAgeMs > LAST_ERROR_CURRENT_MS) {
    contextualChecks.add("no-last-error");
    addContextual("no-last-error", false, `${lastError.message || "recorded error"} (${Math.round(lastErrorAgeMs / 60000)} min ago)`);
  } else {
    add("no-last-error", !lastError, lastError?.message || "no recorded error");
  }
  add("cache-bounded", cacheEntries <= maxCacheEntries, `${cacheEntries} cache entries`);

  const performanceTelemetry = options.performanceTelemetry || null;
  const performanceStats = options.performanceStats || null;
  const requiredOk = checks.every(c => c.severity !== "required" || c.ok);
  const contextualWarnings = checks.filter(c => contextualChecks.has(c.name) && !c.ok).length;
  const budgetWarnings = performanceStats?.budget?.warnings?.length || 0;
  const warningCount = contextualWarnings + budgetWarnings;
  const status = requiredOk ? warningCount > 0 ? "warning" : "ok" : "error";

  return {
    ok: requiredOk,
    status,
    requiredOk,
    warningCount,
    version: options.version || "",
    installedAt: runtimeState?.installedAt,
    checkedAt: options.checkedAt || new Date().toISOString(),
    checks,
    performanceTelemetry,
    performanceStats,
  };
}
