import { redactDiagnosticsUserText } from './diagnosticsCore.js';

export function createDiagnosticsRuntime(ctx = {}) {
  const {
    CHANGELOG_SUMMARY,
    DEFAULT_SETTINGS,
    PRODUCT_NAME,
    PROJECT_RELEASE_STATE,
    PROJECT_VERSION,
    PROVIDER_SETTINGS_META,
    SECURITY_LIMITS,
    SETTINGS_MIGRATION_LEGACY_KEYS,
    SETTINGS_SCHEMA_VERSION,
    SETTINGS_WRITE_KEY,
    VERSION,
    W,
    activeCodeboxStyleEditor,
    activeEditDialog,
    clientCapabilitySnapshot,
    compactGpuRendererLabel,
    changelogSummaryTextFromSummary,
    completionVisualKind,
    composedContains,
    compute,
    createEmbeddedLanguageDiagnostics,
    createSettingsElement,
    debugLoggingEnabled,
    diagnosticsReadoutBundle,
    diagnosticsRuntimeErrorFallback,
    displayBrowserLabel,
    displayMemoryLabel,
    displayViewportLabel,
    document,
    ensureProviderSettings,
    getDocLength,
    incrementMapCounter,
    isOpen,
    isViewAllowed,
    itemDetail,
    itemDocumentation,
    itemSourceLabel,
    loadedSettingsStorageKey,
    localStorage,
    logInfoOnce,
    looksLikeView,
    measurePerformanceEvent,
    navigator,
    observerLifecycleCloseBindingReadiness,
    observerLifecycleCloseDryRunListenerReadout,
    observerLifecycleCloseDryRunReadout,
    observerLifecycleReadout,
    performanceStatsSnapshot,
    performanceTelemetrySnapshot,
    providerEnabled,
    recordPerformanceEvent,
    recordRuntimeError,
    recordRuntimeErrorOnce,
    runtimeErrorReadout,
    runtimeSummary,
    safeContextSummary,
    settingDesc,
    settingsCheckbox,
    settingsPortalRoot,
    state,
    suggestionQualityPayload,
    runtimeCoordinatorReadout = () => ({ available: false }),
    companionLayerReadout = () => "internal",
    // Read-only snapshot of the input-quiet runtime (active/dormant +
    // suppression/flush counters + remaining window), surfaced in the diagnostics
    // payload. No-op default keeps the payload stable when unwired.
    companionInputQuietReadout = () => ({ active: false, dormant: true, remainingMs: 0, suppressions: 0, flushes: 0, lastReason: "" }),
    // Read-only snapshot of the settle engine (booted / apply + settle-arm counters
    // / observer state), surfaced in the diagnostics payload.
    companionSettleReadout = () => ({ active: false, booted: false, applyCount: 0, settleArmCount: 0, observingDialog: false }),
    // Suppression-gap guard. Returns false ("run now") unless the companion layer
    // is active AND a typing-quiet window is open, in which case it defers the work
    // to a single flush after typing. No-op default so this site runs immediately
    // until the layer is activated.
    deferDuringTyping = () => false,
  } = ctx;

// main.legacy.js passes a getter: the key changes when settings are reset after boot.
function currentLoadedSettingsStorageKey() {
  return String((typeof loadedSettingsStorageKey === "function" ? loadedSettingsStorageKey() : loadedSettingsStorageKey) || "");
}

function providerSummaryLegacy() {
  ensureProviderSettings();
  return (state.providers || []).map((provider, index) => {
    const stats = state.providerStats?.[provider.id] || {};
    const meta = PROVIDER_SETTINGS_META[provider.id] || {};
    return {
      id: provider.id,
      label: meta.label || provider.label || provider.id,
      description: meta.description || provider.label || "Provider",
      order: index + 1,
      enabled: providerEnabled(provider.id),
      calls: stats.calls || 0,
      lastCount: stats.lastCount || 0,
      lastMs: stats.lastMs || 0,
      skipped: stats.skipped === true,
      error: stats.error || "",
      lastErrorAt: stats.lastErrorAt || 0,
    };
  });
}

function providerSummary() {
  try {
    ensureProviderSettings();
    return ctx.providerSummary(state, {
      providerEnabled: providerId => providerEnabled(providerId),
      providerMeta: PROVIDER_SETTINGS_META,
    });
  } catch (err) {
    recordRuntimeError("provider-registry:summary", err, { phase: "providerSummary" });
    return providerSummaryLegacy();
  }
}

function itemSummary(item = state.items[state.selected]) {
  if (!item) return null;
  return {
    type: item.type || "",
    source: item.source || "",
    provider: item.provider || "",
    lang: item.lang || "",
    detail: itemDetail(item),
    documentation: itemDocumentation(item),
    labelLength: String(item.label || "").length,
    insertLength: String(item.insert || "").length,
  };
}

function debugSnapshot() {
  const ctx = state.context || null;
  const sel = state.view?.state?.selection?.main || null;
  return {
    version: VERSION,
    at: new Date().toISOString(),
    pathText: ctx?.pathText || "",
    yamlPath: ctx?.yamlPath || [],
    yamlKey: ctx?.yamlKey || "",
    yamlRole: ctx?.yamlRole || "",
    focusKind: ctx?.focusKind || "",
    valueKind: ctx?.valueKind || "",
    scalarValueContext: !!ctx?.scalarValueContext,
    prefix: ctx?.prefix || "",
    lineNumber: ctx?.lineNumber || 0,
    col: ctx?.col || 0,
    from: ctx?.from || 0,
    to: ctx?.to || 0,
    selection: sel ? { from: sel.from, to: sel.to, head: sel.head, anchor: sel.anchor } : null,
    currentLine: ctx?.line || "",
    beforeCursor: ctx?.beforeCursor || "",
    afterCursor: ctx?.afterCursor || "",
    shouldSuggest: !!ctx?.shouldSuggest,
    idleReason: ctx?.idleReason || "",
    providers: (state.providers || []).map(p => p.id),
    topSuggestions: (state.items || []).slice(0, 10).map(item => ({ label: item.label, type: item.type, source: item.source, family: item.meta?.family || "", kind: completionVisualKind(item), score: item.score || 0, priority: item.meta?.priority || 0, detail: itemDetail(item), reason: item.meta?.reason || item.meta?.contextKind || "" })),
    lastError: state.lastError || null,
  };
}

function health() {
  const dialog = activeEditDialog();
  const healthEditor = activeCodeboxStyleEditor();
  const viewDetected = looksLikeView(state.view);
  const editorScoped = viewDetected ? isViewAllowed(state.view) : !!(healthEditor?.querySelector && (!dialog || composedContains(dialog, healthEditor)));
  const result = ctx.health(state, {
    apiInstalled: !!W.__nostrodomus?.installed,
    editorDetected: viewDetected || !!healthEditor?.querySelector,
    editDialogActive: !!dialog,
    editorScoped,
    // The completion library/index/providers load lazily on the first editor.
    // Until then their absence is expected, not broken — treat
    // the completion-readiness checks as contextual, not required failures.
    completionStaged: !state.library,
    maxCacheEntries: SECURITY_LIMITS.maxCacheEntries,
    version: VERSION,
    performanceTelemetry: performanceTelemetrySnapshot(),
    performanceStats: performanceStatsSnapshot(),
    checkedAt: new Date().toISOString(),
  });
  state.lastHealthCheck = result;
  return result;
}

function styleCssModuleStatus() {
  return ctx.styleCssModuleStatus();
}

function embeddedLanguageDiagnostics(input = {}) {
  return createEmbeddedLanguageDiagnostics({
    legacyContext: input.legacyContext || state.context,
    activeEditorReadout: input.activeEditorReadout || null,
    detectorInput: input.detectorInput || null,
    activeDetectorInput: input.activeDetectorInput || null,
    liveItems: input.liveItems || state.items,
  });
}

// Shared payload keys for exportDiagnostics()/debug(); both readers extend this base.
function diagnosticsPayloadCommon(capabilityReason) {
  return {
    productName: PRODUCT_NAME,
    version: VERSION,
    projectVersion: PROJECT_VERSION,
    apiAliases: {
      preferred: "window.__nostrodomus",
      legacy: [],
      legacyDeprecated: true,
    },
    styleCssModule: styleCssModuleStatus(),
    settingsStorage: {
      writeKey: SETTINGS_WRITE_KEY,
      loadedFrom: currentLoadedSettingsStorageKey() || "defaults",
      legacyMigrationKeys: SETTINGS_MIGRATION_LEGACY_KEYS.length,
      schemaVersion: SETTINGS_SCHEMA_VERSION,
    },
    installed: state.installed,
    enabled: state.enabled,
    installedAt: state.installedAt,
    hasView: looksLikeView(state.view),
    scopedView: isViewAllowed(state.view),
    activeEditDialog: !!activeEditDialog(),
    isOpen: isOpen(),
    context: safeContextSummary(state.context),
    contextInspector: contextInspectorPayload(state.context),
    suggestionQuality: state.suggestionQuality || suggestionQualityPayload(state.context, state.items),
    performanceTelemetry: performanceTelemetrySnapshot(),
    performanceStats: performanceStatsSnapshot(),
    observerLifecycle: observerLifecycleReadout(),
    observerLifecycleCloseBindingReadiness: observerLifecycleCloseBindingReadiness(),
    selectorSeamStatus: state.selectorSeamStatus ? { ...state.selectorSeamStatus } : null,
    bootCost: state.bootCost ? { ...state.bootCost } : null,
    runtimeErrors: runtimeErrorReadout(),
    clientCapabilities: clientCapabilitySnapshot(capabilityReason),
    runtimeCoordinator: runtimeCoordinatorReadout(),
    companionLayer: companionLayerReadout(),
    companionInputQuiet: companionInputQuietReadout(),
    companionSettle: companionSettleReadout(),
    itemCount: state.items.length,
    selected: state.selected,
    selectedItem: itemSummary(),
    librarySources: state.library?.sources || [],
    providerStats: structuredClone(state.providerStats || {}),
    cacheEntries: state.completionCache?.size || 0,
    indexCounts: state.index ? Object.fromEntries(Object.entries(state.index.byLang || {}).map(([k, v]) => [k, v.length])) : {},
    rejectedLibraryRows: state.index?.rejected || {},
    securityLimits: SECURITY_LIMITS,
    runtimeData: runtimeSummary(state),
    lastError: state.lastError,
  };
}

function exportDiagnostics(options = {}) {
  const redact = options?.redact !== false;
  const contextReadoutApi = W.__nostrodomus?.contextDiagnostics;
  let activeEditorReadout = null;
  try { activeEditorReadout = contextReadoutApi?.readActiveEditor?.() || null; } catch (err) { activeEditorReadout = diagnosticsRuntimeErrorFallback("diagnostics:export-active-editor", err, { phase: "exportDiagnostics" }); }
  let embeddedLanguageReadout = null;
  try { embeddedLanguageReadout = W.__nostrodomus?.embeddedLanguageDetector?.read?.({ legacyContext: state.context, activeEditorReadout, liveItems: state.items }) || embeddedLanguageDiagnostics({ activeEditorReadout, liveItems: state.items }); } catch (err) { embeddedLanguageReadout = diagnosticsRuntimeErrorFallback("diagnostics:export-embedded-language", err, { phase: "exportDiagnostics" }); }

  const data = {
    ...diagnosticsPayloadCommon("export-diagnostics"),
    consoleLogging: {
      normalOutput: `✦ NOSTRODOMUS   v${PROJECT_VERSION}   ready`,
      degradedOutput: `⚠ NOSTRODOMUS   v${PROJECT_VERSION}   degraded`,
      debugEnabled: debugLoggingEnabled(),
      debugEnableCommand: 'localStorage.setItem("nostrodomusDebug", "1"); location.reload();',
      globalConsolePatch: false,
      unrelatedCardsSuppressed: false,
    },
    exportedAt: new Date().toISOString(),
    redacted: redact,
    observerLifecycleCloseDryRun: observerLifecycleCloseDryRunReadout(),
    observerLifecycleCloseDryRunListener: observerLifecycleCloseDryRunListenerReadout(),
    contextDiagnostics: {
      available: !!contextReadoutApi,
      activeEditor: activeEditorReadout,
      embeddedLanguage: embeddedLanguageReadout,
    },
    settings: {
      keepOpen: !!state.settings.keepOpen,
      autoOpenOnFocus: !!state.settings.autoOpenOnFocus,
      minChars: state.settings.minChars,
      mode: state.settings.mode,
      enterCompletes: !!state.settings.enterCompletes,
      tabCompletes: !!state.settings.tabCompletes,
      maxItems: state.settings.maxItems,
      fuzzy: !!state.settings.fuzzy,
      globalSearch: !!state.settings.globalSearch,
      idlePaneText: !!state.settings.idlePaneText,
      triggerMode: state.settings.triggerMode,
      popupSize: state.settings.popupSize,
      debugMode: !!state.settings.debugMode,
      enabledLangs: { ...(state.settings.enabledLangs || {}) },
      providers: structuredClone(ensureProviderSettings()),
      style: {
        syntaxTintPreset: state.settings.style?.syntaxTintPreset || DEFAULT_SETTINGS.style.syntaxTintPreset,
        syntaxThemeOpacity: state.settings.style?.syntaxThemeOpacity ?? DEFAULT_SETTINGS.style.syntaxThemeOpacity,
        syntaxThemeSaturation: state.settings.style?.syntaxThemeSaturation ?? DEFAULT_SETTINGS.style.syntaxThemeSaturation,
        hideEditorWarnings: state.settings.style?.hideEditorWarnings ?? DEFAULT_SETTINGS.style.hideEditorWarnings,
        hideActiveLineHighlight: state.settings.style?.hideActiveLineHighlight ?? DEFAULT_SETTINGS.style.hideActiveLineHighlight,
      },
    },
    providers: providerSummary(),
    health: health(),
  };

  if (!redact) return { ...data, rawContext: state.context, selectedRawItem: state.items[state.selected] || null };
  // A redacted report keeps structure and lengths, not the user's text. The active-editor readout
  // carries the cursor line and the typed prefix; the suggestion summaries carry labels (entity
  // ids), friendly names and documentation. A recorded error from a failed insert names the
  // suggestion by its label, and is in the report as a runtimeErrors item and as lastError.
  return {
    ...data,
    runtimeErrors: redactDiagnosticsUserText(data.runtimeErrors),
    lastError: redactDiagnosticsUserText(data.lastError),
    contextInspector: redactDiagnosticsUserText(data.contextInspector),
    suggestionQuality: redactDiagnosticsUserText(data.suggestionQuality),
    selectedItem: redactDiagnosticsUserText(data.selectedItem),
    contextDiagnostics: redactDiagnosticsUserText(data.contextDiagnostics),
  };
}

// Copy through a temporary textarea: the path that still works on a plain-HTTP install, where
// navigator.clipboard does not exist. Must run inside the click.
function copyTextWithoutClipboardApi(text) {
  try {
    const doc = typeof document !== "undefined" ? document : null;
    if (!doc?.body || typeof doc.execCommand !== "function") return false;
    const area = doc.createElement("textarea");
    area.value = String(text || "");
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    doc.body.appendChild(area);
    area.select();
    const ok = doc.execCommand("copy") === true;
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function copyDiagnosticsToClipboard() {
  const payload = JSON.stringify(exportDiagnostics({ redact: true }), null, 2);
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(payload).then(() => true).catch((err) => {
      recordRuntimeErrorOnce("diagnostics:clipboard-write", err, { phase: "copyDiagnosticsToClipboard" });
      logInfoOnce("user:diagnostics-fallback", "diagnostics", payload);
      return false;
    });
  }
  if (copyTextWithoutClipboardApi(payload)) return Promise.resolve(true);
  logInfoOnce("user:diagnostics-fallback", "diagnostics", payload);
  return Promise.resolve(false);
}

function diagnosticValue(label, value, attrs = {}) {
  return createSettingsElement("div", { className: "nostrodomus-diagnostic-row", attrs }, [
    createSettingsElement("span", { text: label }),
    createSettingsElement("span", { text: value }),
  ]);
}

// A time stamp inside a live region: its change is not something to read out.
const NOT_ANNOUNCED = { "aria-live": "off" };

// Brings the rows on screen (label and value pairs) up to date with freshly built ones. When
// the labels are the same, only a value that changed is written, into the row already there:
// replacing every row made a screen reader read the whole block again at each refresh. Any
// other shape (a row added or removed) is replaced whole.
function updateLabeledRows(container, freshRows) {
  const current = Array.from(container.children || []);
  const sameShape = current.length === freshRows.length && current.every((row, index) => {
    const fresh = freshRows[index];
    return row.children?.length === 2 && fresh.children?.length === 2 && row.children[0].textContent === fresh.children[0].textContent;
  });
  if (!sameShape) {
    container.replaceChildren(...freshRows);
    return;
  }
  current.forEach((row, index) => {
    const value = freshRows[index].children[1].textContent;
    if (row.children[1].textContent !== value) row.children[1].textContent = value;
  });
}

function diagnosticCard(title, rows, note = "", options = {}) {
  const children = [createSettingsElement("div", { className: "nostrodomus-diagnostic-card-title", text: title })];
  if (note) children.push(settingDesc(note));
  // bodyAttrs is opt-in per card (e.g. aria-live for the live Context Inspector body only);
  // the 8 static cards pass nothing, so their body markup stays byte-identical.
  children.push(createSettingsElement("div", { className: "nostrodomus-diagnostic-card-body", attrs: options.bodyAttrs || {} }, rows));
  return createSettingsElement("section", { className: "nostrodomus-diagnostic-card", dataset: options.dataset || {} }, children);
}

function changelogSummaryText() {
  return changelogSummaryTextFromSummary(CHANGELOG_SUMMARY);
}

function settingsStorageStatus() {
  // No store at all: the browser blocks site data for this page.
  if (!localStorage) return "unavailable: storage is blocked in this browser";
  try {
    const key = "nostrodomus.storage.probe";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    const loadedKey = currentLoadedSettingsStorageKey();
    const loaded = loadedKey && loadedKey !== SETTINGS_WRITE_KEY ? "legacy fallback" : (loadedKey ? "current" : "defaults");
    // The probe above is one character. A full store takes it and still refuses the settings
    // payload, so a save that failed (and has not succeeded since) is what the row reports.
    const failedSave = state.settingsSaveStats?.lastWriteError;
    if (failedSave) return `last save failed: ${failedSave}`;
    return `writable; ${loaded}`;
  } catch (err) {
    recordRuntimeErrorOnce("settings:storage-status", err, { phase: "settingsStorageStatus" });
    return `unavailable: ${String(err?.message || err).slice(0, 64)}`;
  }
}

function systemStatusCard(readout) {
  // While the panel is being built it is not in state yet; the host it is going into is.
  const root = state.settingsPanel?.parentNode || state.settingsPortalHost || settingsPortalRoot();
  const dialog = activeEditDialog();
  const providerCount = Array.isArray(state.providers) ? state.providers.length : 0;
  const scoped = isViewAllowed(state.view);
  const editorDetected = looksLikeView(state.view);
  const refreshTime = new Date().toLocaleString();

  return diagnosticCard("System Status", [
    diagnosticValue("Project version", PROJECT_VERSION),
    diagnosticValue("Runtime version", VERSION),
    diagnosticValue("Public API", "window.__nostrodomus"),
    diagnosticValue("Legacy aliases", "none"),
    diagnosticValue("Channel", PROJECT_RELEASE_STATE),
    diagnosticValue("Loaded at", state.installedAt ? new Date(state.installedAt).toLocaleString() : "unknown"),
    diagnosticValue("Diagnostics refresh", refreshTime),
    diagnosticValue("Provider count", String(providerCount)),
    diagnosticValue("Active editor", editorDetected ? "detected" : "not detected"),
    diagnosticValue("Scoped editor", scoped ? "yes" : "no"),
    diagnosticValue("Edit dialog", dialog ? "active" : "none"),
    diagnosticValue("Completion", state.library
      ? "loaded"
      : "deferred (loads on first editor)"),
    diagnosticValue("Overlay root", root ? (root === document.documentElement ? "documentElement fallback" : "active editor/dialog root") : "unavailable"),
    diagnosticValue("Settings storage", settingsStorageStatus()),
    // The companion is part of this runtime now: internal, external (a separately installed
    // companion resource owns the layer) or dormant(forced). Same value as the exported report.
    diagnosticValue("Companion layer", String(companionLayerReadout())),
    diagnosticValue("Readout API", readout?.available ? "loaded" : "not loaded"),
  ], "Self-check for whether the loaded runtime, active editor scope, local storage, providers, and companion layer line up.");
}


function formatPerformanceEventMetric(event) {
  return ctx.formatPerformanceEventMetric(event);
}

function performanceDiagnosticsCard() {
  const stats = performanceStatsSnapshot();
  const byTotal = stats.topByTotalMs?.[0] || null;
  const byRate = stats.topByRate?.[0] || null;
  const style = stats.telemetry?.events?.["codebox-style-apply"] || null;
  const frame = stats.telemetry?.events?.["codebox-frame-sync"] || null;
  const scan = stats.telemetry?.events?.["style-root-scan"] || null;
  const context = stats.telemetry?.events?.["context-inspector-refresh"] || null;
  const quality = stats.telemetry?.events?.["suggestion-quality-refresh"] || null;
  const mutation = stats.budget?.mutationNoise || {};
  const warnings = stats.budget?.warnings || [];
  const client = stats.clientCapabilities || {};
  const gpu = client.gpu || {};
  const computeMetric = stats.metrics?.["completion.compute.ms"] || null;
  const popupMetric = stats.metrics?.["popup.render.ms"] || null;
  const diagnosticsMetric = stats.metrics?.["diagnostics.refresh.ms"] || null;

  return diagnosticCard("Performance Stats", [
    diagnosticValue("Budget status", stats.budgetStatus === "ok" ? "OK" : `${warnings.length} warning(s)`),
    diagnosticValue("Telemetry mode", stats.telemetryMode === "legacy" ? "legacy" : "gated"),
    diagnosticValue("Suppressed telemetry", `${stats.telemetrySuppressed?.total || 0} events${stats.telemetrySuppressed?.lastName ? ` (last: ${stats.telemetrySuppressed.lastName})` : ""}`),
    diagnosticValue("Top total cost", byTotal ? `${byTotal.name}: ${byTotal.totalMs}ms` : "none yet"),
    diagnosticValue("Top event rate", byRate ? `${byRate.name}: ${byRate.perMinute}/min` : "none yet"),
    diagnosticValue("Style apply", formatPerformanceEventMetric(style)),
    diagnosticValue("Frame sync", formatPerformanceEventMetric(frame)),
    diagnosticValue("Root scan", formatPerformanceEventMetric(scan)),
    diagnosticValue("Context refresh", formatPerformanceEventMetric(context)),
    diagnosticValue("Quality refresh", formatPerformanceEventMetric(quality)),
    diagnosticValue("Completion compute", formatPerformanceEventMetric(computeMetric)),
    diagnosticValue("Popup render", formatPerformanceEventMetric(popupMetric)),
    diagnosticValue("Diagnostics refresh", formatPerformanceEventMetric(diagnosticsMetric)),
    diagnosticValue("Mutation noise", `${mutation.perMinute || 0}/min; ${mutation.lastDetail || "none"}`),
    diagnosticValue("Observer callbacks", String(stats.observer?.callbacks || 0)),
    diagnosticValue("CM callbacks suppressed", String(stats.observer?.suppressedCodeMirrorCallbacks || 0)),
    diagnosticValue("Ignored callbacks suppressed", String(stats.observer?.suppressedIgnoredCallbacks || 0)),
    diagnosticValue("Style guard targets", String(stats.observer?.styleMutationGuardTargets || 0)),
    diagnosticValue("Observers", String(stats.cache?.styleRootObserverCount || 0)),
    diagnosticValue("Observers pruned", `${stats.observer?.prunedStyleRootObservers || 0}${stats.observer?.lastPruneReason ? ` (${stats.observer.lastPruneReason})` : ""}`),
    diagnosticValue("Persistent listeners", `${stats.listeners?.activePersistent || 0} active / ${stats.listeners?.persistentRemoved || 0} removed`),
    diagnosticValue("Editor sentinel", `${stats.editorSentinel?.installed ? "on" : "off"}; ${stats.editorSentinel?.observedRoots || 0} roots; ${stats.editorSentinel?.detections || 0} detections`),
    diagnosticValue("Cache hit/miss", `${stats.cache?.activeEditor?.hit || 0}/${stats.cache?.activeEditor?.miss || 0}`),
    diagnosticValue("No-editor backoff", `${stats.cache?.activeEditor?.noEditorSkips || 0} skips; ${stats.cache?.activeEditor?.lastNoEditorSkipReason || "none"}`),
    diagnosticValue("Client CPU", client.display?.cpu || `${client.hardwareConcurrency || "?"} threads`),
    diagnosticValue("RAM", client.display?.ram || displayMemoryLabel(client.deviceMemoryGB)),
    diagnosticValue("Client GPU", client.display?.gpu || gpu.displayRenderer || compactGpuRendererLabel(gpu.unmaskedRenderer && gpu.unmaskedRenderer !== "unavailable" ? gpu.unmaskedRenderer : (gpu.renderer || "unavailable"))),
    diagnosticValue("Browser", client.display?.browser || displayBrowserLabel(client.browser)),
    diagnosticValue("Browser window", client.display?.viewport || displayViewportLabel(client.viewport)),
    diagnosticValue("Queued diagnostics", String(stats.scheduler?.diagnosticsPendingReasons?.length || 0)),
  ], "Local-only performance budget summary. Copy full report includes detailed performanceStats, raw telemetry, scheduler state, and cache state.");
}

function contextRouteLabel(ctx = state.context) {
  if (!ctx) return "no active context";
  if (ctx.inComment) return "suppressed: comment context";
  if (ctx.scalarValueContext) return "suppressed: scalar value context";
  if (!ctx.shouldSuggest) return "idle: suggestion gate closed";

  const focus = String(ctx.focusKind || "").toLowerCase();
  const value = String(ctx.valueKind || "").toLowerCase();
  const path = Array.isArray(ctx.yamlPath) ? ctx.yamlPath.join(".").toLowerCase() : "";

  if (focus.includes("action") || path.includes("tap_action") || path.includes("hold_action")) return "actions/snippets + Lovelace context";
  if (focus.includes("entity") || value.includes("entity") || path.endsWith("entities")) return "HA runtime entities + context rows";
  if (focus.includes("service") || value.includes("service")) return "HA runtime services + static keys";
  if (focus.includes("trigger")) return "trigger snippets + static keys";
  if (focus.includes("condition")) return "condition snippets + static keys";
  if (ctx.lang === "yaml") return "YAML static library + context-aware snippets";
  return `${ctx.lang || "unknown"} static library`;
}

function contextInspectorPayload(ctx = state.context) {
  const summary = safeContextSummary(ctx);
  const yamlPath = Array.isArray(ctx?.yamlPath) ? ctx.yamlPath.map(part => String(part || "")) : [];
  const providers = providerSummary().map(provider => ({
    id: provider.id,
    calls: provider.calls,
    lastCount: provider.lastCount,
    lastMs: provider.lastMs,
  }));
  const embeddedLanguage = embeddedLanguageDiagnostics({ legacyContext: ctx, liveItems: state.items });

  return {
    exportedAt: new Date().toISOString(),
    redacted: true,
    version: VERSION,
    projectVersion: PROJECT_VERSION,
    language: ctx?.lang || "",
    embeddedLanguage,
    yamlPath,
    yamlPathText: yamlPath.join(".") || "root",
    yamlPathDepth: yamlPath.length,
    yamlRole: ctx?.yamlRole || "",
    yamlKey: ctx?.yamlKey || "",
    focusKind: ctx?.focusKind || "",
    valueKind: ctx?.valueKind || "",
    triggerKind: ctx?.triggerKind || "",
    shouldSuggest: !!ctx?.shouldSuggest,
    inComment: !!ctx?.inComment,
    scalarValueContext: !!ctx?.scalarValueContext,
    prefixLength: String(ctx?.prefix || "").length,
    cursor: {
      lineNumber: ctx?.lineNumber || 0,
      column: ctx?.col || 0,
    },
    providerRoute: contextRouteLabel(ctx),
    providerOrder: providers,
    suggestionCount: state.items.length,
    selectedSuggestion: itemSummary(),
    summary,
  };
}

function contextInspectorRows(inspector) {
  const providerOrder = inspector.providerOrder.map(provider => `${provider.id}:${provider.lastCount}`).join(" | ") || "none";
  const selected = inspector.selectedSuggestion
    ? `${inspector.selectedSuggestion.provider || inspector.selectedSuggestion.source || "unknown"} / ${inspector.selectedSuggestion.type || "item"}`
    : "none";

  return [
    diagnosticValue("YAML path", inspector.yamlPathText),
    diagnosticValue("Role / key", `${inspector.yamlRole || "none"} / ${inspector.yamlKey || "none"}`),
    diagnosticValue("Focus kind", inspector.focusKind || "none"),
    diagnosticValue("Value kind", inspector.valueKind || "none"),
    diagnosticValue("Provider route", inspector.providerRoute),
    diagnosticValue("Detected lane", `${inspector.embeddedLanguage?.legacyContext?.result?.laneId || "unknown"} (${inspector.embeddedLanguage?.legacyContext?.result?.confidence || "none"})`),
    diagnosticValue("Suggestion gate", inspector.shouldSuggest ? "open" : "closed"),
    diagnosticValue("Comment context", inspector.inComment ? "yes" : "no"),
    diagnosticValue("Scalar suppression", inspector.scalarValueContext ? "active" : "inactive"),
    diagnosticValue("Prefix length", String(inspector.prefixLength)),
    diagnosticValue("Cursor", `line ${inspector.cursor.lineNumber}, col ${inspector.cursor.column}`),
    diagnosticValue("Suggestion count", String(inspector.suggestionCount)),
    diagnosticValue("Provider order", providerOrder),
    diagnosticValue("Selected suggestion", selected),
    diagnosticValue("Updated", inspector.exportedAt, NOT_ANNOUNCED),
  ];
}

function contextInspectorCard(ctx = state.context) {
  return diagnosticCard(
    "Context Inspector",
    contextInspectorRows(contextInspectorPayload(ctx)),
    "Live, local-only view of the current editor context. It explains why suggestions are or are not appearing at the caret without requiring console probes.",
    { dataset: { contextInspector: "true", contextInspectorLive: "true" }, bodyAttrs: { "aria-live": "polite", "aria-atomic": "false" } }
  );
}


function activeContextDiagnosticsSection() {
  const panel = state.settingsPanel;
  if (!panel?.isConnected) return null;
  const section = panel.querySelector?.('[data-section="context"]');
  if (!section?.classList?.contains("active")) return null;
  return section;
}

function stopContextInspectorHeartbeat(reason = "context-inspector-hidden") {
  if (!state.contextInspectorTimer) return false;
  try {
    clearInterval(state.contextInspectorTimer);
  } catch (err) {
    recordRuntimeErrorOnce("diagnostics:context-heartbeat-clear", err, { phase: "stopContextInspectorHeartbeat", reason });
  }
  state.contextInspectorTimer = 0;
  recordPerformanceEvent("context-inspector-heartbeat-stopped", 0, reason);
  return true;
}

function startContextInspectorHeartbeat(reason = "context-inspector-visible") {
  if (!activeContextDiagnosticsSection()) {
    stopContextInspectorHeartbeat(reason);
    return false;
  }
  if (state.contextInspectorTimer) return true;
  state.contextInspectorTimer = setInterval(() => {
    // The panel can disappear without closeSettings (Home Assistant removes the dialog that hosts
    // it). Stop then, instead of waking every heartbeat for a panel that is gone.
    if (!activeContextDiagnosticsSection()) {
      stopContextInspectorHeartbeat("context-inspector-detached");
      return;
    }
    scheduleDiagnosticsRefresh("context-inspector-live");
  }, state.diagnosticsHeartbeatMs);
  recordPerformanceEvent("context-inspector-heartbeat-started", 0, reason);
  return true;
}

function diagnosticsSnapshotSignature() {
  const view = state.view;
  const sel = view?.state?.selection?.main || null;
  const ctx = state.context || null;
  return [
    PROJECT_VERSION,
    isViewAllowed(view) ? "view" : "no-view",
    getDocLength(view),
    sel?.anchor ?? "",
    sel?.head ?? "",
    ctx?.pathText || "",
    ctx?.yamlRole || "",
    ctx?.yamlKey || "",
    ctx?.focusKind || "",
    ctx?.valueKind || "",
    String(ctx?.prefix || "").length,
    state.items?.length || 0,
    state.selected || 0,
  ].join("|");
}

function diagnosticsReasonIsInteractive(reason = "") {
  return ctx.diagnosticsReasonIsInteractive(reason);
}

// What a refresh of the Context tab can depend on beyond the signature above, compared by
// identity: the editor, its document (CodeMirror keeps one immutable document object per text,
// so an edit that keeps the length is still a different document), the cursor, the settings as
// last saved, and the Home Assistant data and library in use.
let lastLiveRefreshInputs = null;

function liveRefreshInputs() {
  const view = state.view;
  const sel = view?.state?.selection?.main || null;
  return [view, view?.state?.doc, sel?.anchor, sel?.head, state.settingsLastSerialized, state.runtimeCache?.at, state.library, state.index];
}

function liveRefreshInputsUnchanged(inputs) {
  return !!lastLiveRefreshInputs && inputs.every((value, index) => value === lastLiveRefreshInputs[index]);
}

function shouldFlushDiagnosticsRefresh(reason = "context-inspector-live") {
  if (!activeContextDiagnosticsSection()) {
    if (state.diagnosticsStats) {
      state.diagnosticsStats.skippedHidden += 1;
      state.diagnosticsStats.lastSkipReason = "hidden";
    }
    recordPerformanceEvent("scheduler-skipped-hidden", 0, reason);
    return false;
  }
  const now = Date.now();
  const signature = diagnosticsSnapshotSignature();
  const interactive = diagnosticsReasonIsInteractive(reason);
  // A due heartbeat is for a change the signature cannot see. With the inputs unchanged there
  // is none: refreshing anyway recomputed completion over the whole document every heartbeat
  // while the editor sat idle.
  const inputs = liveRefreshInputs();
  const heartbeatDue = now - (state.diagnosticsLastRefreshAt || 0) >= (state.diagnosticsHeartbeatMs || 1200)
    && !liveRefreshInputsUnchanged(inputs);
  if (!interactive && signature === state.diagnosticsLastSignature && !heartbeatDue) {
    if (state.diagnosticsStats) {
      state.diagnosticsStats.skippedClean += 1;
      state.diagnosticsStats.lastSkipReason = "clean";
    }
    recordPerformanceEvent("scheduler-skipped-clean", 0, reason);
    return false;
  }
  state.diagnosticsLastSignature = signature;
  state.diagnosticsLastRefreshAt = now;
  lastLiveRefreshInputs = inputs;
  return true;
}

function flushDiagnosticsRefresh(reason = "context-inspector-live") {
  return measurePerformanceEvent("diagnostics-refresh", reason, () => {
  state.diagnosticsRefreshRaf = 0;
  const reasons = Array.from(state.diagnosticsPendingReasons || []);
  try { state.diagnosticsPendingReasons?.clear?.(); } catch (err) { recordRuntimeErrorOnce("diagnostics:pending-reasons-clear", err, { phase: "flushDiagnosticsRefresh" }); }
  const summary = reasons.join("|") || reason;
  if (!shouldFlushDiagnosticsRefresh(summary)) return;
  if (state.diagnosticsStats) state.diagnosticsStats.refreshes += 1;
  refreshContextInspectorPanel("context-inspector-live");
  refreshSuggestionQualityPanel("suggestion-quality-live");
  });
}

function scheduleDiagnosticsRefresh(reason = "context-inspector-live") {
  // While the user is typing in the editor (and the companion layer is active),
  // defer this diagnostics-panel refresh to one trailing pass instead of
  // recomputing on every keystroke. Dormant/external -> runs now.
  if (deferDuringTyping(`diagnostics-refresh-${reason}`, () => scheduleDiagnosticsRefresh(reason))) return;
  if (!activeContextDiagnosticsSection()) {
    if (state.diagnosticsStats) {
      state.diagnosticsStats.skippedHidden += 1;
      state.diagnosticsStats.lastSkipReason = state.settingsPanel?.isConnected ? "context-tab-hidden" : "settings-panel-hidden";
    }
    recordPerformanceEvent("scheduler-skipped-hidden", 0, reason);
    return;
  }
  try {
    const cleanReason = String(reason || "diagnostics-refresh");
    state.diagnosticsPendingReasons?.add?.(cleanReason);
    incrementMapCounter(state.diagnosticsStats?.dirtyReasons, cleanReason);
  } catch (err) { recordRuntimeErrorOnce("diagnostics:pending-reasons-add", err, { phase: "scheduleDiagnosticsRefresh", reason }); }
  if (state.diagnosticsRefreshRaf) return;
  state.diagnosticsRefreshRaf = requestAnimationFrame(() => flushDiagnosticsRefresh(reason));
}

function updateContextInspectorPanel() {
  const panel = state.settingsPanel;
  if (!panel?.isConnected) return;
  const section = panel.querySelector?.('[data-section="context"]');
  if (!section?.classList?.contains("active")) return;

  const card = section.querySelector('[data-context-inspector-live]');
  const body = card?.querySelector?.(".nostrodomus-diagnostic-card-body");
  if (!body) return;

  updateLabeledRows(body, contextInspectorRows(contextInspectorPayload(state.context)));
}

function refreshContextInspectorPanel(triggerKind = "context-inspector-live") {
  return measurePerformanceEvent("context-inspector-refresh", triggerKind, () => {
    const panel = state.settingsPanel;
    if (!panel?.isConnected) return;
    const section = panel.querySelector?.('[data-section="context"]');
    if (!section?.classList?.contains("active")) return;

    // While the popup is open its own refresh keeps state.context current. A compute from here
    // replaced state.items under the rendered rows (with a non-explicit trigger, often with
    // nothing), so Enter went to the editor and a row click inserted nothing.
    if (isViewAllowed(state.view) && !isOpen()) {
      compute(triggerKind);
    } else {
      updateContextInspectorPanel();
    }
  });
}

function qualityMetric(label, value, attrs = {}) {
  return createSettingsElement("div", { className: "nostrodomus-quality-metric", attrs }, [
    createSettingsElement("div", { className: "nostrodomus-quality-label", text: label }),
    createSettingsElement("div", { className: "nostrodomus-quality-value", text: String(value ?? "") }),
  ]);
}

function suggestionQualityRows(payload = state.suggestionQuality || suggestionQualityPayload(state.context, state.items)) {
  const providers = Object.entries(payload.providerMix || {}).map(([id, count]) => `${itemSourceLabel({ source: id })}:${count}`).join(" | ") || "none";
  const top = payload.topSuggestion ? `${payload.topSuggestion.label} (${itemSourceLabel({ source: payload.topSuggestion.source })})` : "none";
  const selected = payload.selectedSuggestion ? `${payload.selectedSuggestion.label} (${itemSourceLabel({ source: payload.selectedSuggestion.source })})` : "none";
  const disabledProviders = (payload.providerSummary || [])
    .filter(provider => provider.enabled === false)
    .map(provider => provider.label || provider.id)
    .join(" | ") || "none";

  const quality = createSettingsElement("div", { className: "nostrodomus-quality-grid" }, [
    qualityMetric("Visible suggestions", `${payload.suggestionCount} / ${state.settings.maxItems}`),
    qualityMetric("Top suggestion", top),
    qualityMetric("Selected suggestion", selected),
    qualityMetric("Provider mix", providers),
    qualityMetric("Disabled providers", disabledProviders),
    qualityMetric("Context route", payload.context?.route || "none"),
    qualityMetric("Suggestion gate", payload.context?.shouldSuggest ? "open" : "closed"),
    qualityMetric("Updated", payload.exportedAt || "unknown", NOT_ANNOUNCED),
  ]);
  if (!payload.suggestionCount && payload.emptyReason) {
    quality.appendChild(qualityMetric("Why empty", payload.emptyReason));
  }
  return [quality];
}

function suggestionQualityCard() {
  return createSettingsElement("div", { className: "nostrodomus-quality-card", dataset: { suggestionQuality: "true", suggestionQualityLive: "true" } }, [
    createSettingsElement("div", { style: "font-weight:850;margin-bottom:3px", text: "Suggestion Quality Dashboard" }),
    createSettingsElement("div", { style: "opacity:.68;line-height:1.35", text: "Shows usable live summary data for the current popup. Internal scoring math is intentionally hidden unless it becomes actionable." }),
    createSettingsElement("div", { dataset: { suggestionQualityBody: "" }, attrs: { "aria-live": "polite", "aria-atomic": "false" } }, suggestionQualityRows()),
  ]);
}

function updateSuggestionQualityPanel() {
  const panel = state.settingsPanel;
  if (!panel?.isConnected) return;
  const section = panel.querySelector?.('[data-section="context"]');
  if (!section?.classList?.contains("active")) return;
  const body = section.querySelector?.("[data-suggestion-quality-body]");
  if (!body) return;
  const rows = suggestionQualityRows(state.suggestionQuality || suggestionQualityPayload(state.context, state.items));
  // One grid of label and value pairs: update it in place when it is already there.
  const grid = body.children?.length === 1 ? body.children[0] : null;
  if (grid && rows.length === 1) updateLabeledRows(grid, Array.from(rows[0].children || []));
  else body.replaceChildren(...rows);
}

function refreshSuggestionQualityPanel(triggerKind = "suggestion-quality-live") {
  return measurePerformanceEvent("suggestion-quality-refresh", triggerKind, () => {
    const panel = state.settingsPanel;
    if (!panel?.isConnected) return;
    const section = panel.querySelector?.('[data-section="context"]');
    if (!section?.classList?.contains("active")) return;
    const recentlyComputed = Date.now() - (state.diagnosticsLastComputeAt || 0) < 120;
    if (isViewAllowed(state.view) && !recentlyComputed && !isOpen()) {
      compute(triggerKind);
    } else {
      updateSuggestionQualityPanel();
    }
  });
}

function providerStatusText(provider) {
  return `${provider.enabled ? "enabled" : "disabled"} · order ${provider.order} · ${provider.lastCount} candidates · ${provider.lastMs}ms${provider.skipped ? " · skipped" : ""}`;
}

function updateProviderControlCard(panel, providerId) {
  const card = panel?.querySelector?.(`[data-provider-card="${providerId}"]`);
  if (!card) return;

  const provider = providerSummary().find(item => item.id === providerId);
  if (!provider) return;

  card.dataset.providerEnabled = provider.enabled ? "true" : "false";
  const status = card.querySelector?.("[data-provider-status]");
  if (status) status.textContent = providerStatusText(provider);
}

function providerControlsMarkup() {
  const providers = providerSummary();
  const wrap = createSettingsElement("div", { className: "nostrodomus-provider-control-list" });
  for (const provider of providers) {
    wrap.appendChild(createSettingsElement("div", {
      className: "nostrodomus-provider-control-card",
      dataset: {
        providerCard: provider.id,
        providerEnabled: provider.enabled ? "true" : "false",
      },
    }, [
      createSettingsElement("div", { style: "display:flex;align-items:flex-start;justify-content:space-between;gap:10px" }, [
        createSettingsElement("div", { style: "min-width:0" }, [
          createSettingsElement("div", { style: "font-weight:850", text: provider.label }),
          createSettingsElement("div", { style: "opacity:.64;font-size:11px;margin-top:2px;word-break:break-word", text: provider.id }),
        ]),
        settingsCheckbox("Enabled", provider.id, provider.enabled, "provider"),
      ]),
      createSettingsElement("div", { style: "opacity:.72;line-height:1.35;margin-top:7px", text: provider.description }),
      createSettingsElement("div", { className: "nostrodomus-provider-health-row", text: providerStatusText(provider), dataset: { providerStatus: provider.id } }),
    ]));
  }
  return wrap;
}

function contextInspectorMarkup() {
  return [
    createSettingsElement("div", { text: "Context Inspector", style: "font-weight:850;margin-bottom:3px" }),
    settingDesc("Live explanation of the active YAML/editor context, provider route, suggestion gate, and selected suggestion source. This is separate from Diagnostics so health reports stay focused."),
    contextInspectorCard(state.context),
    createSettingsElement("div", { className: "nostrodomus-action-row" }, [
      createSettingsElement("button", { className: "nostrodomus-pill", text: "Copy inspector", dataset: { contextCopyInspector: "" }, attrs: { "aria-live": "polite" } }),
    ]),
    settingDesc("Updates automatically while this tab is open. Copy output is redacted and local-only."),
  ];
}

function diagnosticsMarkup() {
  const ctx = safeContextSummary(state.context);
  const rt = runtimeSummary(state);
  const h = health();
  const providers = providerSummary();
  const providerText = providers.map(p => `${p.id}: ${p.lastCount} in ${p.lastMs}ms`).join(" | ") || "none";
  const counts = state.index ? Object.entries(state.index.byLang || {}).map(([k, v]) => `${k}:${v.length}`).join("  ") : "none";
  // diagnosticsReadoutBundle wraps diagnosticsReadoutSummary (diagnosticsCore.js) into the payload bundle.
  const diagnosticsReadout = diagnosticsReadoutBundle({ api: W.__nostrodomus?.contextDiagnostics, legacyContext: ctx });
  const readout = diagnosticsReadout.readout;

  const systemCard = systemStatusCard(readout);
  const performanceCard = performanceDiagnosticsCard();

  const runtimeCard = diagnosticCard("Runtime", [
    diagnosticValue("Health", h.ok ? "OK" : "Needs attention"),
    diagnosticValue("Version", VERSION),
    diagnosticValue("Engine enabled", state.enabled ? "yes" : "no"),
    diagnosticValue("Suggestion popup", isOpen() ? "open" : "closed"),
    diagnosticValue("Last error", state.lastError?.message || "none"),
  ], "Local state only. Nothing is sent anywhere.");

  const editorCard = diagnosticCard("Editor", [
    diagnosticValue("Editor detected", looksLikeView(state.view) ? "yes" : "no"),
    diagnosticValue("Scoped editor", isViewAllowed(state.view) ? "yes" : "no"),
    diagnosticValue("Edit dialog", activeEditDialog() ? "active" : "none"),
    diagnosticValue("Active readout", readout.activeEditorOk ? "OK" : "unavailable"),
    diagnosticValue("Editor found", readout.activeEditorFound ? "yes" : "no"),
    diagnosticValue("Readout note", readout.activeEditorWarning || "none"),
  ], "If browser console has focus, active editor may correctly show unavailable.");

  const contextCard = diagnosticCard("ContextSnapshot", [
    diagnosticValue("Readout API", readout.available ? "loaded" : "not loaded"),
    diagnosticValue("Stage", readout.stage),
    diagnosticValue("Diagnostics only", readout.diagnosticsOnly ? "yes" : "no"),
    diagnosticValue("Shadow only", readout.shadowOnly ? "yes" : "no"),
    diagnosticValue("Drives autocomplete", readout.drivesAutocomplete ? "yes" : "no"),
    diagnosticValue("Mutates runtime", readout.mutatesRuntime ? "yes" : "no"),
    diagnosticValue("Renders UI", readout.rendersUi ? "yes" : "no"),
    diagnosticValue("Network access", readout.networkAccess ? "yes" : "no"),
  ], "This engine path is diagnostics-only; it cannot drive autocomplete.");

  const legacyContextCard = diagnosticCard("Current Legacy Context", [
    diagnosticValue("Language", ctx?.lang || "none"),
    diagnosticValue("YAML role", ctx?.yamlRole || "none"),
    diagnosticValue("YAML key", ctx?.yamlKey || "none"),
    diagnosticValue("Comment context", ctx?.inComment ? "yes" : "no"),
    diagnosticValue("Should suggest", ctx?.shouldSuggest ? "yes" : "no"),
    diagnosticValue("Suggestions", String(state.items.length)),
  ], "Redacted summary of the currently active legacy autocomplete context.");

  const providerCard = diagnosticCard("Providers + Runtime", [
    diagnosticValue("Providers", providerText),
    diagnosticValue("Runtime HA", rt.hasHass ? `yes (${rt.entities} entities, ${rt.services} services)` : "not detected yet"),
    diagnosticValue("Live data", rt.hasHass ? `${rt.customCards} custom cards, ${rt.serviceFieldServices} services with field schemas, cache age ${rt.ageMs == null ? "n/a" : `${rt.ageMs}ms`}` : "waiting for HA data"),
    diagnosticValue("Cache entries", String(state.completionCache?.size || 0)),
    diagnosticValue("Index counts", counts),
  ], "Counts are bounded to keep diagnostics lightweight.");

  const actions = createSettingsElement("div", { className: "nostrodomus-action-row" }, [
    createSettingsElement("button", { className: "nostrodomus-pill", text: "Refresh", dataset: { diagRefresh: "" }, attrs: { "aria-live": "polite" } }),
    createSettingsElement("button", { className: "nostrodomus-pill", text: "Copy full report", dataset: { diagCopy: "" }, attrs: { "aria-live": "polite" } }),
    createSettingsElement("button", { className: "nostrodomus-pill", text: "Copy context", dataset: { diagCopyContext: "" }, attrs: { "aria-live": "polite" } }),
    createSettingsElement("button", { className: "nostrodomus-pill", text: "Log health", dataset: { diagHealth: "" }, attrs: { "aria-live": "polite" } }),
  ]);

  return [
    createSettingsElement("div", { text: "Diagnostics", style: "font-weight:850;margin-bottom:3px" }),
    settingDesc("Local-only troubleshooting data. Reports are redacted by default, stay in your browser, and are never sent anywhere by this engine."),
    createSettingsElement("div", { className: "nostrodomus-diagnostics-grid" }, [
      systemCard,
      performanceCard,
      runtimeCard,
      editorCard,
      contextCard,
      legacyContextCard,
      providerCard,
    ]),
    actions,
    settingsCheckbox("Debug console messages", "debugMode", state.settings.debugMode),
    settingDesc("Off by default. Console APIs remain available, but the UI now covers the common diagnostics path."),
  ];
}

function debug() {
  return {
    ...diagnosticsPayloadCommon("debug"),
    activeEditorContextDiagnostics: W.__nostrodomus?.contextDiagnostics?.readActiveEditor?.(),
    embeddedLanguageDiagnostics: embeddedLanguageDiagnostics({ legacyContext: state.context, liveItems: state.items }),
    rawContext: state.settings.debugMode ? state.context : undefined,
    settings: structuredClone(state.settings),
    observerLifecycleCloseDryRunListener: observerLifecycleCloseDryRunListenerReadout(),
    providers: (state.providers || []).map(p => p.id),
    providerSummary: providerSummary(),
    lastHealthCheck: state.lastHealthCheck,
  };
}

  return {
    providerSummaryLegacy,
    providerSummary,
    itemSummary,
    debugSnapshot,
    health,
    styleCssModuleStatus,
    embeddedLanguageDiagnostics,
    exportDiagnostics,
    copyDiagnosticsToClipboard,
    diagnosticValue,
    diagnosticCard,
    settingsStorageStatus,
    systemStatusCard,
    formatPerformanceEventMetric,
    performanceDiagnosticsCard,
    activeContextDiagnosticsSection,
    contextRouteLabel,
    contextInspectorPayload,
    contextInspectorRows,
    contextInspectorCard,
    stopContextInspectorHeartbeat,
    startContextInspectorHeartbeat,
    suggestionQualityRows,
    suggestionQualityCard,
    diagnosticsReasonIsInteractive,
    diagnosticsSnapshotSignature,
    shouldFlushDiagnosticsRefresh,
    flushDiagnosticsRefresh,
    scheduleDiagnosticsRefresh,
    refreshContextInspectorPanel,
    updateContextInspectorPanel,
    updateSuggestionQualityPanel,
    refreshSuggestionQualityPanel,
    providerStatusText,
    updateProviderControlCard,
    providerControlsMarkup,
    contextInspectorMarkup,
    changelogSummaryText,
    diagnosticsMarkup,
    debug,
  };
}
