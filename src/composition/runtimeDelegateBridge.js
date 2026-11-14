// Stable delegate helpers for runtime owner modules.
//
// Owner runtimes initialize in a strict sequence while other runtimes need
// callback references up front. These helpers keep those callback references
// stable and hold the repetitive pass-through method lists in one place.

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

function createRuntimeDelegateBridge({ getRuntime, methods, fallbacks = {}, label = "runtime" }) {
  const bridge = {};
  for (const methodName of methods || []) {
    bridge[methodName] = (...args) => {
      const runtime = typeof getRuntime === "function" ? getRuntime() : null;
      const method = runtime?.[methodName];
      if (typeof method === "function") return method.apply(runtime, args);
      if (hasOwn(fallbacks, methodName)) {
        const fallback = fallbacks[methodName];
        return typeof fallback === "function" ? fallback(...args) : fallback;
      }
      throw new Error(`${label}.${methodName} is not ready`);
    };
  }
  return bridge;
}


const CODEBOX_FRAME_METHODS = [
  "codeboxFrameHostForEditor", "codeboxComposedParent", "activeCodeboxFramePortalRoot", "ensureCodeboxExternalFrameHost",
  "removeCodeboxExternalFrame", "ensureCodeboxExternalFrame", "codeboxFrameTokenKey", "scheduleCodeboxExternalFrameSettleSync",
  "clearCodeboxExternalFrameSettleTimers", "syncCodeboxExternalFrame", "scheduleCodeboxExternalFrameSync", "removeCodeboxKeyboardContainment",
  "eventPathHasCodeboxEditor", "shouldContainCodeboxKeyEvent", "installCodeboxKeyboardContainment", "installCodeboxExternalFrameEventGuards",
];

const CODEBOX_STYLE_METHODS = [
  "labelCodeboxUnclipTarget", "rememberCodeboxUnclipOriginal", "setImportantIfNeeded", "forceCodeboxUnclipTarget", "restoreCodeboxUnclipTarget",
  "cleanupCodeboxSlotUnclip", "isCodeboxSlotUnclipTarget", "attachCodeboxSlotUnclipObserver", "applyCodeboxSlotDialogBodyUnclip",
  "allowCodeboxFrameOverflow", "primeCodeboxPreflightForEditor", "mutationRecordIsNostrodomusStableStyleNode", "codeboxPreflightCss",
  "nodeLooksLikeEditorSurface", "mutationRecordsContainEditorSurface", "codeboxPreflightScopedObserverEnabled", "codeboxPreflightObserverLabel",
  "codeboxPreflightScopedObserverTargets", "disconnectCodeboxPreflightObserver", "installCodeboxPreflightObserver", "codeboxPreflightTargetedScanEnabled",
  "codeboxPreflightScanRootLabel", "codeboxPreflightTargetedScanRoots", "codeboxPreflightTargetedShadowTraversalEnabled", "codeboxPreflightShadowHosts",
  "runCodeboxPreflightMutationScan", "appendCodeboxPreflightPendingReason", "scheduleCodeboxPreflightMutationScan", "installCodeboxPreflightStyle",
  "removeCodeboxPreflightStyle", "cancelStyleRangeCommitReapply", "scheduleStyleRangeCommitReapply",
  "codeboxStyleReasonIsPassiveEditorSettle", "codeboxStyleCanUsePassiveStableFastPath", "flushCodeboxStyleReapply", "clearCodeboxStyleSettleReasonState",
  "clearCodeboxStyleSettleTimers", "shouldCoalesceCodeboxStyleSettleReason", "scheduleCodeboxStyleReapply", "activeCodeboxStyleEditor",
  "applyCodeboxStyleSettings", "attachStyleRootObserver",
];

const STYLE_DOM_METHODS = [
  "clearStyledTextPreset", "integrationDocumentStyleRoot", "isStyleRoot", "styleContainerForRoot", "activeEditorStyleRoot", "ensureStyleElementAtEnd",
  "queryStyleElementInContainer", "ensureStableStyleElement", "applyCodeboxStyleTokensToElement", "discoverOpenStyleRoots", "buildCodeboxRootCss",
  "ensureRootCodeboxStyle", "dashboardContainmentCleanupTargetedShadowTraversalEnabled", "dashboardContainmentCleanupShadowHosts",
  "removeCodeboxRootStylesFromAllRoots", "sourceClassEditorForStyleSkip", "maybeSkipSourceClassSteadyStateStyleReapply", "installCodeboxStyleMutationGuard",
];

const ACTIVE_EDITOR_CACHE_METHODS = [
  "codeboxEditorCacheKey", "sourceClassFallbackObserverReadyForEditor", "stableNativeFallbackLifecycleDecisionForEditor",
  "suppressStableNativeFallbackEditorLifecycle", "suppressRememberActiveEditorNativeHighlightInstall", "rememberActiveCodeboxEditor",
  "styleEditorFromNode", "visibleStyleEditorCandidate", "usableBridgeStyleEditorCandidate", "activeEditorNoEditorBackoffAllowed", "suppressNativeAutocompleteForEditor", "restoreNativeAutocomplete", "rememberActiveEditorNoEditor",
];

const EDITOR_DISPATCH_METHODS = [
  "editorDispatchRepeatPressureActive", "quietEditorDispatchTelemetryEvent", "shouldQuietEditorDispatchTelemetryEvent", "markRuntimeQuiet",
  "isNostrodomusUiEvent", "isViewAllowed", "viewFromEvent", "rememberView", "hookDispatch", "unhookDispatch", "getDoc", "getPos",
];

const CLIENT_CAPABILITIES_METHODS = [
  "browserInfoSnapshot", "computeClientGpuSnapshot", "clientGpuSnapshot", "clientCapabilitySnapshot",
];

const OBSERVER_LIFECYCLE_METHODS = [
  "observerLifecycleDisconnectGateEnabled", "observerLifecycleCloseDryRunGateEnabled", "observerLifecycleCloseDryRunListenerGateEnabled",
  "observerLifecycleRegistryCounts", "observerLifecycleCountTotal", "observerLifecycleCloseBindingReadiness", "observerLifecycleCloseDryRunReadout",
  "observerLifecycleCloseDryRunListenerReadout", "observerLifecycleCloseDryRunListenerProbe", "observerLifecycleCloseDryRunWouldInspect",
  "observerLifecycleCloseDryRunProbe", "observerLifecycleReadout", "observerLifecycleRegistrySummary", "disconnectObserverLifecycleMapValues",
  "disconnectObserverLifecycleSingle", "disconnectAllNostrodomusObservers",
];

const SETTINGS_PORTAL_METHODS = [
  "overlayRootTraversalScopedEnabled", "recordOverlayRootTraversal", "overlayRootOptions", "nostrodomusWalkOpenRoots", "nostrodomusFindActiveCodeEditorRoot",
  "nostrodomusCodeEditorOverlayRoot", "overlayRoot", "activeTopLayerDialog", "activeSettingsPortalRoot", "ensureSettingsPortalHost", "settingsPortalRoot",
];

const STYLE_ROOT_METHODS = [
  "appendStyleRootScanPendingReason", "forceStyleRootScanNextFrame", "isStyleRootObserverAlive", "pruneStyleRootObservers", "scanStyleRoots",
  "runScheduledStyleRootScan", "scheduleStyleRootScan", "installRootStyleRegistry", "uninstallStyleRootRegistry",
];

const EDITOR_LIFECYCLE_SENTINEL_METHODS = [
  "editorSentinelTargetForRoot", "editorSentinelLabel", "refreshEditorSentinelRoots", "scheduleEditorPresenceProbe", "scheduleEditorSettleProbes",
  "handleEditorSentinelDetected", "runEditorPresenceProbe", "attachEditorSentinelObserver", "installEditorLifecycleSentinel",
  "uninstallEditorLifecycleSentinel", "editorLikelyOpeningWithoutMountedCodebox", "nodeLooksLikeCodeMirrorInternals",
  "mutationRecordsAreCodeMirrorOnly", "targetContainsCodeMirror", "structuralObserverConfigForTarget", "mutationRecordLooksEditorStructural",
];


const RUNTIME_ERROR_METHODS = [
  "recordRuntimeError", "recordRuntimeErrorOnce", "runtimeErrorReadout", "diagnosticsRuntimeErrorFallback",
];

const PERSISTENT_LISTENER_METHODS = [
  "addPersistentListener", "removePersistentListeners",
];

const SOURCE_CLASS_BRIDGE_METHODS = [
  "cssEscapeSelectorPart", "bridgeActiveForStyleEditor", "codeMirrorSourceClassParts",
];

const SYNTAX_RUNTIME_METHODS = [
  "scheduleInitialSyntaxPaintGate", "primeInitialSyntaxPaintGateForEditor", "installInitialSyntaxPaintGate",
  "cleanupInitialSyntaxPaintGate", "disconnectCodeMirrorSyntaxContentObserver", "installSyntaxOwnerObserver",
  "installCodeMirrorNativeHighlightSyntax", "scheduleNativeHighlightForActiveEditor", "buildCodeMirrorSourceClassSyntaxCss",
  "applySmartSyntaxRangeHighlights", "smartSyntaxDocumentContextForVisibleLines", "applyCodeMirrorSmartSyntaxClasses",
  "disconnectSourceClassSmartSyntaxObserver", "scheduleSourceClassSmartSyntax", "installCodeMirrorSourceClassSyntax",
  "scheduleSourceClassSyntaxRefresh", "editorUsesCodeMirrorSourceClassSyntax",
];

const RUNTIME_CONTEXT_METHODS = [
  "detectContextFallback", "detectContext",
];

const SUGGESTION_QUALITY_METHODS = [
  "suggestionQualityPayload", "recordSuggestionQuality",
];

const SCORING_METHODS = [
  "allowType", "runtimeDomainPriority", "contextualPenalty", "hasFocusedContextProviderItems", "itemMatchesYamlValueKind",
  "focusKindTypeBoost", "semanticItemRank", "modeRank", "shouldSuppressStaticForFocusedContext", "scoreItems", "camelMatch",
];

const COMPLETION_INSERTION_METHODS = [
  "clearSnippetSession", "moveSnippetPlaceholder", "updateSnippetSessionAfterDispatch", "insertItem",
];

const COMPLETION_RUNTIME_METHODS = [
  "render", "compute", "refresh", "requestLiveUpdate", "open", "toggle", "onKeydown", "onPointer", "onFocusIn", "onFocusOut",
];

const PERFORMANCE_TELEMETRY_METHODS = [
  "performanceTelemetryDiagnosticsActive", "shouldRecordPerformanceTelemetry", "noteSuppressedPerformanceEvent", "recordPerformanceEvent",
  "measurePerformanceEvent", "performanceTelemetrySnapshot", "resetPerformanceTelemetry", "performanceStatsSnapshot",
];

const DIAGNOSTICS_METHODS = [
  "providerSummaryLegacy", "providerSummary", "itemSummary", "debugSnapshot", "health", "styleCssModuleStatus", "embeddedLanguageDiagnostics",
  "exportDiagnostics", "copyDiagnosticsToClipboard", "diagnosticValue", "diagnosticCard", "settingsStorageStatus", "systemStatusCard",
  "formatPerformanceEventMetric", "performanceDiagnosticsCard", "activeContextDiagnosticsSection", "contextRouteLabel", "contextInspectorPayload",
  "contextInspectorRows", "contextInspectorCard", "suggestionQualityRows", "suggestionQualityCard", "diagnosticsReasonIsInteractive",
  "diagnosticsSnapshotSignature", "shouldFlushDiagnosticsRefresh", "flushDiagnosticsRefresh", "refreshContextInspectorPanel", "stopContextInspectorHeartbeat",
  "startContextInspectorHeartbeat", "updateContextInspectorPanel", "updateSuggestionQualityPanel", "refreshSuggestionQualityPanel", "providerStatusText",
  "updateProviderControlCard", "providerControlsMarkup", "contextInspectorMarkup", "changelogSummaryText", "diagnosticsMarkup",
];

const SETTINGS_PANEL_METHODS = [
  "clampSettingsPosition", "clampSettingsSize", "settingsPortalViewportRect", "settingsViewportToPortalPosition", "applySettingsPanelViewportPosition",
  "saveSettingsPosition", "saveSettingsSize", "languageLabel", "settingDesc", "settingsCard", "optionButton", "colorOptionButton", "glowSizeLabel",
  "styleRangeControl", "styleColorBarControl", "styleToggle", "syntaxThemeSelect", "settingsCheckbox", "settingsGrid", "makeSettingsStyle",
  "sectionPanel", "helpCard",
];

const SETTINGS_INTERACTION_METHODS = [
  "codeboxStyleTokenNamesForStyleRangeGroup", "codeboxStyleTokenNamesForStyleRangeGroups", "stableCodeboxStyleTokenTargets",
  "applyCodeboxStyleTokensToStableRoots", "cachedStyleRangeLivePreviewEditor", "markCodeboxLivePreviewTargets", "codeboxLivePreviewTokenTargets",
  "primeStyleRangeLivePreviewSession", "markCodeboxLivePreviewStyleTarget", "clearStyleRangeLivePreviewCache", "applyCodeboxStyleLivePreview",
  "scheduleSettingsFeedbackReset", "clearSettingsFeedbackTimers", "scheduleSettingsInteractionRestore", "clearSettingsInteractionRestoreTimers",
  "schedulePreservedScrollRestore", "clearPreservedScrollRestoreTimers", "settingsBodyScrollTop", "restoreSettingsBodyScroll", "captureScrollSnapshot",
  "restoreScrollSnapshot", "preserveScrollDuring", "captureSettingsInteractionSnapshot", "restoreSettingsInteractionSnapshot",
  "preserveSettingsInteractionDuring", "applySettingChangePreservingInteraction", "setSettingsPathValue", "scheduleSettingsSave", "flushSettingsSave",
  "formatStyleRangeValueForInput", "updateStyleRangeValueLabel", "scheduleStyleRangeValueLabelUpdate", "scheduleStyleRangeLiveSave",
  "applyStyleRangeMutation", "scheduleStyleRangeLivePreview",
];

const PROVIDER_METHODS = [
  "loadLibrary", "sanitizeLibraryRow", "normalizeItem", "clearCompletionCache", "cacheSet", "registerProvider", "ensureProviderSettings",
  "providerEnabled", "providerDiagnosticId", "providerTimeoutBudgetMs", "validateProviderRow", "validateProviderRows", "staticLibraryProvider",
  "findHass", "runtimeData", "yamlPathParts", "yamlPathIncludes", "isDashboardActionContext", "isAutomationScriptContext",
  "yamlScalarValueKind", "isScalarValueKind", "isScalarConfigContext", "yamlValueKind", "yamlFocusKind", "yamlBlockValueKeyKind",
  "runtimeRowsForKind", "haRuntimeValueProvider", "contextRow", "rowSet", "yamlPathText", "recentYamlText", "looksLikeButtonCardContext",
  "lovelaceContextRows", "lovelaceContextProvider", "snippetRow", "yamlPathHas", "snippetRowsForContext", "snippetProvider", "buildIndex",
  "runtimeProviderRegistryLimits", "runtimeProviderRegistryDeps",
];


export function createRuntimeErrorRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "runtimeErrorRuntime", getRuntime, methods: RUNTIME_ERROR_METHODS });
}

export function createPersistentListenersRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({
    label: "persistentListenersRuntime",
    getRuntime,
    methods: PERSISTENT_LISTENER_METHODS,
    fallbacks: {
      addPersistentListener: false,
      removePersistentListeners: 0,
    },
  });
}

export function createSourceClassBridgeRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "sourceClassBridgeRuntime", getRuntime, methods: SOURCE_CLASS_BRIDGE_METHODS });
}

export function createSyntaxRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "syntaxRuntime", getRuntime, methods: SYNTAX_RUNTIME_METHODS });
}

export function createRuntimeContextRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "runtimeContextRuntime", getRuntime, methods: RUNTIME_CONTEXT_METHODS });
}

export function createSuggestionQualityRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "suggestionQualityRuntime", getRuntime, methods: SUGGESTION_QUALITY_METHODS });
}

export function createScoringRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "scoringRuntime", getRuntime, methods: SCORING_METHODS });
}

export function createCompletionInsertionRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "completionInsertionRuntime", getRuntime, methods: COMPLETION_INSERTION_METHODS });
}

export function createCompletionRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "completionRuntime", getRuntime, methods: COMPLETION_RUNTIME_METHODS });
}

export function createPerformanceTelemetryRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({
    label: "performanceTelemetryRuntime",
    getRuntime,
    methods: PERFORMANCE_TELEMETRY_METHODS,
    fallbacks: {
      performanceTelemetryDiagnosticsActive: false,
      shouldRecordPerformanceTelemetry: false,
      noteSuppressedPerformanceEvent: null,
      recordPerformanceEvent: null,
      measurePerformanceEvent: (_name, _detail, fn) => (typeof fn === "function" ? fn() : undefined),
      performanceTelemetrySnapshot: null,
      resetPerformanceTelemetry: null,
      performanceStatsSnapshot: null,
    },
  });
}

export function createDiagnosticsRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "diagnosticsRuntime", getRuntime, methods: DIAGNOSTICS_METHODS });
}

export function createSettingsPanelRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "settingsPanelRuntime", getRuntime, methods: SETTINGS_PANEL_METHODS });
}

export function createSettingsInteractionRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "settingsInteractionRuntime", getRuntime, methods: SETTINGS_INTERACTION_METHODS });
}

export function createProviderRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "providerRuntime", getRuntime, methods: PROVIDER_METHODS });
}


export function createCodeboxFrameRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "codeboxFrameRuntime", getRuntime, methods: CODEBOX_FRAME_METHODS });
}

export function createCodeboxStyleRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "codeboxStyleRuntime", getRuntime, methods: CODEBOX_STYLE_METHODS });
}

export function createStyleDomRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "styleDomRuntime", getRuntime, methods: STYLE_DOM_METHODS });
}

export function createActiveEditorCacheRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "activeEditorCacheRuntime", getRuntime, methods: ACTIVE_EDITOR_CACHE_METHODS });
}

export function createEditorDispatchRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({
    label: "editorDispatchRuntime",
    getRuntime,
    methods: EDITOR_DISPATCH_METHODS,
    fallbacks: {
      editorDispatchRepeatPressureActive: false,
      quietEditorDispatchTelemetryEvent: null,
      shouldQuietEditorDispatchTelemetryEvent: false,
      markRuntimeQuiet: null,
      isNostrodomusUiEvent: false,
      isViewAllowed: false,
      viewFromEvent: null,
      rememberView: false,
      hookDispatch: false,
      unhookDispatch: false,
      getDoc: "",
      getPos: 0,
    },
  });
}

export function createClientCapabilitiesRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "clientCapabilitiesRuntime", getRuntime, methods: CLIENT_CAPABILITIES_METHODS });
}

export function createObserverLifecycleRuntimeDelegates(getRuntime, disconnectAllFallback = null) {
  return createRuntimeDelegateBridge({
    label: "observerLifecycleRuntime",
    getRuntime,
    methods: OBSERVER_LIFECYCLE_METHODS,
    fallbacks: {
      disconnectAllNostrodomusObservers: reason => (typeof disconnectAllFallback === "function" ? disconnectAllFallback(reason) : false),
    },
  });
}

export function createSettingsPortalRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "settingsPortalRuntime", getRuntime, methods: SETTINGS_PORTAL_METHODS });
}

export function createStyleRootRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "styleRootRuntime", getRuntime, methods: STYLE_ROOT_METHODS });
}

export function createEditorLifecycleSentinelRuntimeDelegates(getRuntime) {
  return createRuntimeDelegateBridge({ label: "editorLifecycleSentinelRuntime", getRuntime, methods: EDITOR_LIFECYCLE_SENTINEL_METHODS });
}
