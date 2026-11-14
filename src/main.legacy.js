import {
  FRECENCY_WRITE_KEY,
  LIVE_COMPANION_EDITOR_VERSION,
  PRODUCT_NAME,
  PROJECT_RELEASE_STATE,
  PROJECT_VERSION,
  SETTINGS_WRITE_KEY,
  VERSION,
} from './core/version.js';
// Frecency persistence: the host owns the one shared accept store's localStorage I/O (scoring.js stays pure).
import { DEFAULT_RECENT_ACCEPT_STORE, recordRecentAcceptedCompletion } from './completion/scoring.js';
import {
  CHANGELOG_SUMMARY,
  changelogSummaryTextFromSummary,
} from './core/changelogSummary.js';
import { SETTINGS_MIGRATION_LEGACY_KEYS, SETTINGS_SCHEMA_VERSION } from './core/settingsStorageKeys.js';
import { createSettingsRuntime } from './core/settingsRuntime.js';
import { createRuntimeContextRuntime } from './yaml/runtimeContextRuntime.js';
import { createLoggingRuntime } from './core/loggingRuntime.js';
import { createPublicApiRuntime } from './core/publicApiRuntime.js';
import { createPersistentListenersRuntime } from './core/persistentListenersRuntime.js';
import { installRuntimeCoordinator } from './core/runtimeCoordinator.js';
import { createScrollbarStyleRuntime } from './companion/scrollbarStyleRuntime.js';
import { createInputQuietRuntime } from './companion/inputQuietRuntime.js';
import { createCodeboxEnlargeRuntime } from './companion/codeboxEnlargeRuntime.js';
import { createPickerStyleRuntime } from './companion/pickerStyleRuntime.js';
import { createCompanionSettleRuntime } from './companion/companionSettleRuntime.js';
import { companionModuleDormant, onCompanionOverrideStorageEvent, unregisterRuntimeFromCoordinator } from './companion/coordinatorRuntime.js';
import { OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR } from './editor/overlayRoot.js';
import {
  createActiveEditorCacheRuntimeDelegates,
  createClientCapabilitiesRuntimeDelegates,
  createCodeboxFrameRuntimeDelegates,
  createCodeboxStyleRuntimeDelegates,
  createDiagnosticsRuntimeDelegates,
  createEditorDispatchRuntimeDelegates,
  createEditorLifecycleSentinelRuntimeDelegates,
  createObserverLifecycleRuntimeDelegates,
  createPerformanceTelemetryRuntimeDelegates,
  createPersistentListenersRuntimeDelegates,
  createProviderRuntimeDelegates,
  createRuntimeContextRuntimeDelegates,
  createRuntimeErrorRuntimeDelegates,
  createSettingsInteractionRuntimeDelegates,
  createSettingsPanelRuntimeDelegates,
  createSettingsPortalRuntimeDelegates,
  createSourceClassBridgeRuntimeDelegates,
  createStyleDomRuntimeDelegates,
  createStyleRootRuntimeDelegates,
  createSyntaxRuntimeDelegates,
} from './composition/runtimeDelegateBridge.js';
import {
  createMainLegacyCompletionPopupAdapters,
  createMainLegacyProviderAdapters,
  createMainLegacyCompanionAdapters,
  createMainLegacyDiagnosticsAdapters,
  createMainLegacyDiagnosticsSchedulerAdapters,
  createMainLegacyRuntimeErrorAdapters,
  createMainLegacySettingsAdapters,
  createMainLegacySettingsElementAdapters,
  createMainLegacySettingsPersistenceAdapters,
  createMainLegacySyntaxPresetAdapters,
} from './composition/mainLegacyAdapters.js';
import { createMainLegacySettingsPanelRuntime } from './composition/mainLegacyRuntimeFactories.js';
import { createMainLegacyCompletionRuntimeGroup } from './composition/mainLegacyCompletionRuntimeFactory.js';
import {
  codeMirrorNativeHighlightApiStatus,
  installCodeMirrorNativeHighlightExtension,
  shouldAttemptNativeHighlightForActiveEditor,
  shouldSkipNativeUnavailableActiveEditorInstall,
  shouldSkipRememberActiveEditorNativeHighlightInstall,
  shouldSkipStableEditorLifecycleForNativeFallback,
  shouldSkipSourceClassNativeProbeForNativeFallback,
  shouldSkipSyntaxOwnerSourceClassInstallForNativeFallback,
  shouldSuppressLegacySmartSyntaxForNativeHighlight,
  shouldSuppressLegacySmartSyntaxObserverForNativeHighlight,
  shouldSuppressLegacyInlineSyntaxOwnerForNativeHighlight,
  shouldSuppressLegacySourceClassRefreshForNativeHighlight,
  shouldPromoteSourceClassFallbackForNativeHighlight,
  shouldRecordSourceClassFallbackOwnership,
} from './syntax/codeMirrorNativeHighlight.js';
import { languageLaneRegistryStatus } from './languages/languageLanes.js';
import { embeddedLanguageDetectorContractStatus } from './languages/embeddedLanguageDetectorContract.js';
import { languageFixtureCorpusStatus } from './languages/languageFixtures.js';
import { providerContractV2Readiness } from './languages/providerContractV2.js';
import { embeddedLanguageDetectorImplementationStatus } from './languages/embeddedLanguageDetector.js';
import { createEmbeddedLanguageDiagnostics } from './languages/embeddedLanguageDiagnostics.js';
import {
  smartSyntaxDocumentContextForVisibleLinesFromLines,
  smartSyntaxDocLinesFromEditor,
  smartSyntaxKind,
  smartSyntaxLineKindForMode,
  smartSyntaxRangeTokensForLine,
  smartSyntaxTokenKind,
  smartSyntaxUpdateBlockContext,
  smartSyntaxYamlLineInfo,
} from './syntax/smartSyntaxTokenizers.js';
import {
  buildSmartSyntaxClassCss,
  smartSyntaxAddHighlightRange,
  clearSmartSyntaxKind,
  smartSyntaxClearRangeHighlights,
  smartSyntaxCommitRangeHighlights,
  smartSyntaxHighlightName,
  smartSyntaxRangeHighlightSupported,
  smartSyntaxTextOffset,
  setSmartSyntaxKind,
  sourceClassSyntaxContentPainted,
} from './syntax/smartSyntaxStyles.js';
import {
  sourceClassSmartSyntaxObserverReady,
  sourceClassSmartSyntaxPendingReasonUpdate,
  sourceClassSmartSyntaxWaitMs,
  sourceClassSyntaxInstallForceRefresh,
  sourceClassSyntaxRefreshReasonUpdate,
} from './syntax/smartSyntaxScheduler.js';
import {
  clampNumber,
  compactGpuRendererLabel,
  displayBrowserLabel,
  displayMemoryLabel,
  displayMonitorLabel,
  displayViewportLabel,
  hueLabel,
  percentLabel,
  sliderNumberLabel,
} from './core/string.js';
import { indentLinesAfterFirst, leadingWhitespace } from './core/sanitize.js';
import { createRuntimeState } from './core/state.js';
import * as coreSettings from './core/settings.js';
import { DEFAULT_SETTINGS } from './core/settings.js';
import {
  codeboxStyleReasonNeedsSettle,
  codeboxStyleSettleReasonCoalesceDecision,
  codeboxStyleSourceClassSteadyStateSkipDecision,
  codeboxStyleReasonRequiresFullApply,
  codeboxStyleReasonRequiresSyntaxPaint,
  codeboxStyleSignature,
  codeboxStyleTokenMap,
  codeboxStyleBuildRootCss,
} from './ui/codeboxStyle.js';
import { createSyntaxRuntime } from './syntax/syntaxRuntime.js';
import { createSourceClassBridgeRuntime } from './syntax/sourceClassBridgeRuntime.js';
import { createCodeboxFrameRuntime } from './ui/codeboxFrameRuntime.js';
import { createEditorLifecycleSentinelRuntime } from './editor/editorLifecycleSentinel.js';
import { UNIVERSAL_PANEL_HOSTS, PANEL_EDITOR_YAML_WRAPPER, isPanelEditorRoute } from './editor/haSelectors.js';
import { createSelectorSeamProbe } from './editor/selectorSeamProbe.js';
import { createEditorDispatchRuntime } from './editor/editorDispatchRuntime.js';
import { createActiveEditorCacheRuntime } from './editor/activeEditorCacheRuntime.js';
import { createCompanionReadyRuntime } from './editor/companionReadyRuntime.js';
import { createCodeboxStyleRuntime } from './ui/codeboxStyleRuntime.js';
import { createStyleRootRuntime } from './ui/styleRootRuntime.js';
import { createStyleDomRuntime } from './ui/styleDomRuntime.js';
import { createSettingsInteractionRuntime } from './ui/settingsInteractionRuntime.js';
import { escapeHtml } from './core/security.js';
import * as diagnosticsHealth from './diagnostics/diagnosticsHealth.js';
import { runtimeSummary } from './diagnostics/diagnosticsHealth.js';
import { createRuntimeErrorRuntime } from './diagnostics/runtimeErrorRuntime.js';
import {
  diagnosticsReadoutBundle,
  safeContextSummary,
} from './diagnostics/diagnosticsCore.js';
import {
  diagnosticEventMetric,
  performanceBudgetRules,
  roundPerformanceMetric,
} from './diagnostics/performanceMetrics.js';
import * as fastLaneHelpers from './diagnostics/diagnosticsFastLaneHelpers.js';
import {
  measurePerformanceEventWithCallbacks,
  shouldRecordPerformanceTelemetryDecision,
} from './diagnostics/diagnosticsFastLaneHelpers.js';
import { createSettingsPortalRuntime } from './ui/settingsPortalRuntime.js';
import * as activeEditor from './editor/activeEditor.js';
import {
  activeEditDialog,
  activeEditorWarningSurface,
  editCardDialogCandidates,
  editCardDialogElements,
  activeEditorReadoutTraversalScopedEnabled,
  createActiveEditorContextSnapshotReadout,
  closestFromPath,
  composedContains,
  homeRoot,
  isScopedEditorEvent,
  recordActiveEditorReadoutTraversal,
  looksLikeView,
  pathHasEditorSurface,
  pathInsideActiveDialog,
  visible,
} from './editor/activeEditor.js';
import { SECURITY_LIMITS } from './core/runtimeConstants.js';
import { createProviderRuntime } from './providers/providerRuntime.js';
import * as providerRegistry from './providers/providerRegistry.js';
import { createDiagnosticsRuntime } from './diagnostics/telemetryRuntime.js';
import { createPerformanceTelemetryRuntime } from './diagnostics/performanceTelemetryRuntime.js';
import { createClientCapabilitiesRuntime } from './diagnostics/clientCapabilitiesRuntime.js';
import { installContextDiagnosticsRuntime } from './diagnostics/contextDiagnosticsRuntime.js';
import { createObserverLifecycleRuntime } from './diagnostics/observerLifecycleRuntime.js';
import { formatStyleRangeValue, styleRangeGroupTouchesSyntax } from './ui/settingsRange.js';
import {
  DARKPLUS_MAX_LINES_PER_PASS,
  DARKPLUS_MAX_SPANS_PER_PASS,
  DARKPLUS_STYLE_ID,
  DARKPLUS_SYNTAX_COLORS,
  STYLE_SYNTAX_KIND_ORDER,
  STYLE_SYNTAX_PRESETS,
  STYLE_TEXT_SIZE_PRESETS,
} from './ui/settingsStyle.js';
import * as stylesCss from './ui/styles.css.js';
import {
  completionVisualKind,
  itemDetail,
  itemDocumentation,
  itemSourceLabel,
} from './ui/suggestionPopup.js';
import { dashboardActionBranchState } from './yaml/runtimeContextAdapter.js';

(async () => {
  const W = /** @type {any} */ (window);
  // Boot-cost probe: stamp the main-thread start of install so the
  // boot-cost.spec can read the total install time on an editor-less dashboard
  // (the baseline before staged boot, then the much smaller phase-A figure).
  const bootProbeStartedAt = (W.performance?.now?.() ?? Date.now());
  // Reading the store off the window throws when the browser blocks site data for this page.
  // The settings and diagnostics code works without a store (default settings, nothing saved);
  // an unguarded read during install stopped the whole plugin instead.
  let settingsStorage = null;
  try { settingsStorage = W?.["local" + "Storage"] || null; } catch { settingsStorage = null; }
  // Shared runtime coordinator token: window.__nostrodomusRuntimeCoordinatorV1
  const runtimeCoordinator = installRuntimeCoordinator(W, {
    id: "main-completion-runtime",
    role: "completion-runtime",
    version: VERSION,
    projectVersion: PROJECT_VERSION,
  });
  // Companion scrollbar styling layer. Constructed eagerly so the editor-ready hook
  // can reach it; gated by companionLayerActive (force-dormant / external-companion
  // both make applyForEditor a no-op).
  const companionScrollbarRuntime = createScrollbarStyleRuntime({
    globalRef: W,
    // Opt-in "Hide editor warnings" (style.hideEditorWarnings, default false): when true the
    // companion injects the nested warning-hide sheet; when false it reconciles it away so
    // HA's editor warnings/validation errors stay visible. A style-toggle change re-applies
    // via scheduleCodeboxStyleReapply, so this getter is re-read on each apply.
    hideEditorWarnings: () => state.settings?.style?.hideEditorWarnings === true,
    replaceNativeAutocomplete: () => state.settings?.replaceNativeAutocomplete !== false,
  });
  // Typing-quiet window + suppression-gap guard. The mark side already exists
  // (editorDispatchRuntime marks the coordinator 'editor-input' channel on
  // repeat-pressure typing); this consults it. deferDuringTyping is the ONE guard
  // wired into should-be-quiet sites; it returns "run now" while the layer is
  // dormant/external, so the wiring is a no-op until the layer is active.
  const companionInputQuietRuntime = createInputQuietRuntime({ globalRef: W });
  // Codebox-enlargement learned memory (simple/tabbed). Gated by companionLayerActive.
  // Owns inline heights on the companion-ceded CodeMirror internals (main's apply
  // skips them).
  const companionCodeboxEnlargeRuntime = createCodeboxEnlargeRuntime({
    globalRef: W,
    // UNIVERSAL: gate the non-card-dialog panel max-height cap on the same flag as universal discovery.
    universalCodeboxEnabled: () => state.settings?.style?.universalCodebox !== false,
  });
  // Re-fit the card dialog's main codebox to the space it actually has. Runs on each settle
  // pass and on window resize: one layout read, and a write only when the fit changed.
  const refitActiveCodebox = () => {
    try {
      const editor = state.activeEditorCache?.editor || null;
      if (editor?.isConnected) companionCodeboxEnlargeRuntime.refitForEditor(editor);
    } catch { /* fail-dark: sizing never breaks the settle pass */ }
  };
  let codeboxRefitResizeFrame = 0;
  const refitActiveCodeboxOnResize = () => {
    if (codeboxRefitResizeFrame) return;
    const frame = W.requestAnimationFrame?.bind?.(W);
    if (typeof frame !== "function") { refitActiveCodebox(); return; }
    codeboxRefitResizeFrame = frame(() => { codeboxRefitResizeFrame = 0; refitActiveCodebox(); });
  };
  // Picker visual fix (re-seamed off the `*` walk). DORMANT by default; apply is
  // gated by companionLayerActive AND the typing-quiet window, and emits one
  // performance mark pair. Passive picker-open triggers (no event interception)
  // drive it; each is a no-op while the layer is dormant. The trigger listeners
  // attach past the installed guard, via the persistent-listener registry.
  const companionPickerStyleRuntime = createPickerStyleRuntime({
    globalRef: W,
    deferDuringTyping: (reason, applyFn) => companionInputQuietRuntime.deferDuringTyping(reason, applyFn),
    recordMark: (label) => { try { W.performance?.mark?.(label); } catch { /* perf marks optional */ } },
  });
  const companionPickerApply = () => { try { companionPickerStyleRuntime.apply(); } catch { /* fail-dark */ } };
  const OBSERVER_LIFECYCLE_DISCONNECT_GATE_KEY = "nostrodomusObserverLifecycleDisconnect";
  const OBSERVER_LIFECYCLE_CLOSE_DRY_RUN_GATE_KEY = "nostrodomusObserverLifecycleCloseDryRun";
  const OBSERVER_LIFECYCLE_CLOSE_DRY_RUN_LISTENER_GATE_KEY = "nostrodomusObserverLifecycleCloseDryRunListener";
  let loadedSettingsStorageKey = "";

  let runtimeErrorRuntime = null;
  let settingsPortalRuntime = null;
  let performanceTelemetryRuntime = null;
  let diagnosticsRuntime = null;
  let codeboxFrameRuntime = null;
  let codeboxStyleRuntime = null;
  let styleDomRuntime = null;
  let activeEditorCacheRuntime = null;
  let editorDispatchRuntime = null;
  let settingsInteractionRuntime = null;
  let clientCapabilitiesRuntime = null;
  let observerLifecycleRuntime = null;
  let styleRootRuntime = null;
  let editorLifecycleSentinelRuntime = null;
  let settingsPanelRuntime = null;

  const codeboxFrameDelegates = createCodeboxFrameRuntimeDelegates(() => codeboxFrameRuntime);
  const { codeboxFrameHostForEditor, codeboxComposedParent, activeCodeboxFramePortalRoot, ensureCodeboxExternalFrameHost, removeCodeboxExternalFrame, ensureCodeboxExternalFrame, codeboxFrameTokenKey, scheduleCodeboxExternalFrameSettleSync, clearCodeboxExternalFrameSettleTimers, syncCodeboxExternalFrame, scheduleCodeboxExternalFrameSync, removeCodeboxKeyboardContainment, eventPathHasCodeboxEditor, shouldContainCodeboxKeyEvent, installCodeboxKeyboardContainment, installCodeboxExternalFrameEventGuards } = codeboxFrameDelegates;

  const codeboxStyleDelegates = createCodeboxStyleRuntimeDelegates(() => codeboxStyleRuntime);
  const { labelCodeboxUnclipTarget, rememberCodeboxUnclipOriginal, setImportantIfNeeded, forceCodeboxUnclipTarget, restoreCodeboxUnclipTarget, cleanupCodeboxSlotUnclip, isCodeboxSlotUnclipTarget, attachCodeboxSlotUnclipObserver, applyCodeboxSlotDialogBodyUnclip, allowCodeboxFrameOverflow, primeCodeboxPreflightForEditor, mutationRecordIsNostrodomusStableStyleNode, codeboxPreflightCss, nodeLooksLikeEditorSurface, mutationRecordsContainEditorSurface, codeboxPreflightScopedObserverEnabled, codeboxPreflightObserverLabel, codeboxPreflightScopedObserverTargets, disconnectCodeboxPreflightObserver, installCodeboxPreflightObserver, codeboxPreflightTargetedScanEnabled, codeboxPreflightScanRootLabel, codeboxPreflightTargetedScanRoots, codeboxPreflightTargetedShadowTraversalEnabled, codeboxPreflightShadowHosts, runCodeboxPreflightMutationScan, appendCodeboxPreflightPendingReason, scheduleCodeboxPreflightMutationScan, installCodeboxPreflightStyle, removeCodeboxPreflightStyle, cancelStyleRangeCommitReapply, scheduleStyleRangeCommitReapply, codeboxStyleReasonIsPassiveEditorSettle, codeboxStyleCanUsePassiveStableFastPath, flushCodeboxStyleReapply, clearCodeboxStyleSettleReasonState, clearCodeboxStyleSettleTimers, shouldCoalesceCodeboxStyleSettleReason, scheduleCodeboxStyleReapply, activeCodeboxStyleEditor, applyCodeboxStyleSettings, attachStyleRootObserver } = codeboxStyleDelegates;

  const styleDomDelegates = createStyleDomRuntimeDelegates(() => styleDomRuntime);
  const { clearStyledTextPreset, integrationDocumentStyleRoot, isStyleRoot, styleContainerForRoot, activeEditorStyleRoot, ensureStyleElementAtEnd, queryStyleElementInContainer, ensureStableStyleElement, applyCodeboxStyleTokensToElement, discoverOpenStyleRoots, buildCodeboxRootCss, ensureRootCodeboxStyle, dashboardContainmentCleanupTargetedShadowTraversalEnabled, dashboardContainmentCleanupShadowHosts, removeCodeboxRootStylesFromAllRoots, sourceClassEditorForStyleSkip, maybeSkipSourceClassSteadyStateStyleReapply, installCodeboxStyleMutationGuard } = styleDomDelegates;

  const activeEditorCacheDelegates = createActiveEditorCacheRuntimeDelegates(() => activeEditorCacheRuntime);
  const { codeboxEditorCacheKey, sourceClassFallbackObserverReadyForEditor, stableNativeFallbackLifecycleDecisionForEditor, suppressStableNativeFallbackEditorLifecycle, suppressRememberActiveEditorNativeHighlightInstall, rememberActiveCodeboxEditor, styleEditorFromNode, visibleStyleEditorCandidate, usableBridgeStyleEditorCandidate, activeEditorNoEditorBackoffAllowed, suppressNativeAutocompleteForEditor, restoreNativeAutocomplete, rememberActiveEditorNoEditor } = activeEditorCacheDelegates;

  const editorDispatchDelegates = createEditorDispatchRuntimeDelegates(() => editorDispatchRuntime);
  const { editorDispatchRepeatPressureActive, quietEditorDispatchTelemetryEvent, shouldQuietEditorDispatchTelemetryEvent, markRuntimeQuiet, isNostrodomusUiEvent, isViewAllowed, viewFromEvent, rememberView, hookDispatch, unhookDispatch, getDoc, getPos } = editorDispatchDelegates;

  const clientCapabilitiesDelegates = createClientCapabilitiesRuntimeDelegates(() => clientCapabilitiesRuntime);
  const { browserInfoSnapshot, computeClientGpuSnapshot, clientGpuSnapshot, clientCapabilitySnapshot } = clientCapabilitiesDelegates;

  let observerLifecycleDisconnectAll = reason => observerLifecycleRuntime?.disconnectAllNostrodomusObservers?.(reason) || false;
  const observerLifecycleDelegates = createObserverLifecycleRuntimeDelegates(() => observerLifecycleRuntime, reason => observerLifecycleDisconnectAll(reason));
  const { observerLifecycleDisconnectGateEnabled, observerLifecycleCloseDryRunGateEnabled, observerLifecycleCloseDryRunListenerGateEnabled, observerLifecycleRegistryCounts, observerLifecycleCountTotal, observerLifecycleCloseBindingReadiness, observerLifecycleCloseDryRunReadout, observerLifecycleCloseDryRunListenerReadout, observerLifecycleCloseDryRunListenerProbe, observerLifecycleCloseDryRunWouldInspect, observerLifecycleCloseDryRunProbe, observerLifecycleReadout, observerLifecycleRegistrySummary, disconnectObserverLifecycleMapValues, disconnectObserverLifecycleSingle, disconnectAllNostrodomusObservers } = observerLifecycleDelegates;

  const settingsPortalDelegates = createSettingsPortalRuntimeDelegates(() => settingsPortalRuntime);
  const { overlayRootTraversalScopedEnabled, recordOverlayRootTraversal, overlayRootOptions, nostrodomusWalkOpenRoots, nostrodomusFindActiveCodeEditorRoot, nostrodomusCodeEditorOverlayRoot, overlayRoot, activeTopLayerDialog, activeSettingsPortalRoot, ensureSettingsPortalHost, settingsPortalRoot } = settingsPortalDelegates;

  const styleRootDelegates = createStyleRootRuntimeDelegates(() => styleRootRuntime);
  const { appendStyleRootScanPendingReason, forceStyleRootScanNextFrame, isStyleRootObserverAlive, pruneStyleRootObservers, scanStyleRoots, runScheduledStyleRootScan, scheduleStyleRootScan, installRootStyleRegistry, uninstallStyleRootRegistry } = styleRootDelegates;

  const editorLifecycleSentinelDelegates = createEditorLifecycleSentinelRuntimeDelegates(() => editorLifecycleSentinelRuntime);
  const { editorSentinelTargetForRoot, editorSentinelLabel, refreshEditorSentinelRoots, scheduleEditorPresenceProbe, scheduleEditorSettleProbes, handleEditorSentinelDetected, runEditorPresenceProbe, attachEditorSentinelObserver, installEditorLifecycleSentinel, uninstallEditorLifecycleSentinel, editorLikelyOpeningWithoutMountedCodebox, nodeLooksLikeCodeMirrorInternals, mutationRecordsAreCodeMirrorOnly, targetContainsCodeMirror, structuralObserverConfigForTarget, mutationRecordLooksEditorStructural } = editorLifecycleSentinelDelegates;


  const performanceTelemetryDelegates = createPerformanceTelemetryRuntimeDelegates(() => performanceTelemetryRuntime);
  const { performanceTelemetryDiagnosticsActive, shouldRecordPerformanceTelemetry, noteSuppressedPerformanceEvent, recordPerformanceEvent, measurePerformanceEvent, performanceTelemetrySnapshot, resetPerformanceTelemetry, performanceStatsSnapshot } = performanceTelemetryDelegates;

  // Persistent re-apply engine. Drives the existing scheduleCodeboxStyleReapply from
  // home + dialog MutationObservers + a 2800ms settle ladder, rAF-coalesced and
  // typing-quiet-aware (mutation re-applies skipped mid-typing — the no-spam guard).
  // No-op while dormant/external. Needed because the apply-once-on-detection path
  // never re-applied after the dialog kept settling asynchronously.
  const companionSettleRuntime = createCompanionSettleRuntime({
    globalRef: W,
    documentRef: W.document,
    MutationObserver: W.MutationObserver || globalThis.MutationObserver,
    requestAnimationFrame: W.requestAnimationFrame?.bind?.(W) || globalThis.requestAnimationFrame?.bind?.(globalThis),
    cancelAnimationFrame: W.cancelAnimationFrame?.bind?.(W) || globalThis.cancelAnimationFrame?.bind?.(globalThis),
    setTimeout: W.setTimeout?.bind?.(W) || globalThis.setTimeout?.bind?.(globalThis),
    clearTimeout: W.clearTimeout?.bind?.(W) || globalThis.clearTimeout?.bind?.(globalThis),
    isActive: () => !companionModuleDormant({ globalRef: W }),
    scheduleReapply: (reason) => { scheduleCodeboxStyleReapply(reason); refitActiveCodebox(); },
    editDialogPresent: () => { try { return editCardDialogCandidates().length > 0; } catch { return false; } },
    editDialogElements: () => { try { return editCardDialogElements(); } catch { return []; } },
    editorKnown: () => { try { return !!(state.activeEditorCache?.editor || state.view); } catch { return true; } },
    activeDialog: () => { try { return activeEditDialog(); } catch { return null; } },
    homeRoot: () => { try { return homeRoot(); } catch { return null; } },
    shouldHandleMutation: (mutations) => { try { return !mutationRecordsAreCodeMirrorOnly(mutations); } catch { return true; } },
    isTypingQuiet: () => { try { return companionInputQuietRuntime.editorInputQuietActive(); } catch { return false; } },
    markTyping: (reason) => { try { companionInputQuietRuntime.markEditorInputQuiet(reason); } catch { /* */ } },
    isNostrodomusUiEvent: (ev) => { try { return isNostrodomusUiEvent(ev); } catch { return false; } },
    eventIsInsideCodeMirror: (ev) => { try { return companionInputQuietRuntime.isCodeMirrorEvent(ev); } catch { return false; } },
    recordPerformanceEvent,
    shadowHostSelector: OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR,
  });
  const diagnosticsDelegates = createDiagnosticsRuntimeDelegates(() => diagnosticsRuntime);
  const { providerSummaryLegacy, providerSummary, itemSummary, debugSnapshot, health, styleCssModuleStatus, embeddedLanguageDiagnostics, exportDiagnostics, copyDiagnosticsToClipboard, diagnosticValue, diagnosticCard, settingsStorageStatus, systemStatusCard, formatPerformanceEventMetric, performanceDiagnosticsCard, activeContextDiagnosticsSection, contextRouteLabel, contextInspectorPayload, contextInspectorRows, contextInspectorCard, suggestionQualityRows, suggestionQualityCard, diagnosticsReasonIsInteractive, diagnosticsSnapshotSignature, shouldFlushDiagnosticsRefresh, flushDiagnosticsRefresh, refreshContextInspectorPanel, stopContextInspectorHeartbeat, startContextInspectorHeartbeat, updateContextInspectorPanel, updateSuggestionQualityPanel, refreshSuggestionQualityPanel, providerStatusText, updateProviderControlCard, providerControlsMarkup, contextInspectorMarkup, changelogSummaryText, diagnosticsMarkup } = diagnosticsDelegates;





  // The startup badge needs the required checks only. The full health() report also samples
  // performance stats and client capabilities (a WebGL probe), which a page load must not pay for.
  const startupHealth = () => diagnosticsHealth.health(state, {
    apiInstalled: !!W.__nostrodomus?.installed,
    completionStaged: !state.library,
    maxCacheEntries: SECURITY_LIMITS.maxCacheEntries,
    version: VERSION,
  });
  const loggingRuntime = createLoggingRuntime({
    W,
    health: startupHealth,
    startupBadgeStatusFromHealth: fastLaneHelpers.startupBadgeStatusFromHealth,
    // state is created further down; before that (the "already installed" log) this reads false.
    debugModeEnabled: () => { try { return state.settings?.debugMode === true; } catch { return false; } },
  });
  const {
    debugLoggingEnabled,
    emitStartupBadge,
    logDebug,
    logInfoOnce,
    logWarnOnce,
    nostrodomusPerfMode,
  } = loggingRuntime;


  const runtimeErrorDelegates = createRuntimeErrorRuntimeDelegates(() => runtimeErrorRuntime);
  const { recordRuntimeError, recordRuntimeErrorOnce, runtimeErrorReadout, diagnosticsRuntimeErrorFallback } = runtimeErrorDelegates;

  const runtimeErrorAdapters = createMainLegacyRuntimeErrorAdapters({
    getRuntimeErrorRuntime: () => runtimeErrorRuntime,
    debugLoggingEnabled,
  });
  const { clearRuntimeErrors } = runtimeErrorAdapters;


  if (W.__nostrodomus?.installed) {
    logDebug("already installed");
    return;
  }

  // The settle engine boots only past the installed guard: a duplicate resource load
  // bails above before standing up a second home-root observer + listener set that
  // no teardown could ever reach (the duplicate never wires a publicApiRuntime).
  try { companionSettleRuntime.boot('install'); } catch { /* fail-dark: persistence engine never breaks boot */ }

  const settingsRuntime = createSettingsRuntime({
    storage: settingsStorage,
    settingsWriteKey: SETTINGS_WRITE_KEY,
    settingsLegacyKeys: SETTINGS_MIGRATION_LEGACY_KEYS,
    defaultSettings: DEFAULT_SETTINGS,
    cloneDefaultSettingsImpl: coreSettings.cloneDefaultSettings,
    deepMergeImpl: coreSettings.deepMerge,
    logWarnOnce,
    logInfoOnce,
    getState: () => state,
    closeSettings,
    closeCompletion: () => close(),
    scheduleCodeboxStyleReapply: reason => scheduleCodeboxStyleReapply(reason),
    structuredCloneRef: globalThis.structuredClone?.bind?.(globalThis),
  });

  const settingsPersistenceAdapters = createMainLegacySettingsPersistenceAdapters({
    getSettingsRuntime: () => settingsRuntime,
    setLoadedSettingsStorageKey: key => { loadedSettingsStorageKey = key; },
  });
  const { loadSettings, resetSettings } = settingsPersistenceAdapters;

  const settingsAdapters = createMainLegacySettingsAdapters({
    defaultSettings: DEFAULT_SETTINGS,
    getState: () => state,
    settingsRuntime,
  });
  const { cloneDefaultSettings, deepMerge, effectiveStyleSettings, stylePresetValue, syntaxHue, syntaxThemeOptions, syntaxThemePalette, resolveSyntaxTintSettings, syntaxColorWithOpacity, codeboxStyleTokensFromSettings, codeboxStyleLivePreviewSignatureForDiagnostics } = settingsAdapters;


  let syntaxRuntime = null;
  const syntaxRuntimeDelegates = createSyntaxRuntimeDelegates(() => syntaxRuntime);
  const {
    scheduleInitialSyntaxPaintGate,
    primeInitialSyntaxPaintGateForEditor,
    installInitialSyntaxPaintGate,
    cleanupInitialSyntaxPaintGate,
    disconnectCodeMirrorSyntaxContentObserver,
    installSyntaxOwnerObserver,
    installCodeMirrorNativeHighlightSyntax,
    scheduleNativeHighlightForActiveEditor,
    buildCodeMirrorSourceClassSyntaxCss,
    applySmartSyntaxRangeHighlights,
    smartSyntaxDocumentContextForVisibleLines,
    applyCodeMirrorSmartSyntaxClasses,
    disconnectSourceClassSmartSyntaxObserver,
    scheduleSourceClassSmartSyntax,
    installCodeMirrorSourceClassSyntax,
    scheduleSourceClassSyntaxRefresh,
    editorUsesCodeMirrorSourceClassSyntax,
  } = syntaxRuntimeDelegates;


  let companionReadyRuntime = null;
  const companionAdapters = createMainLegacyCompanionAdapters({
    getCompanionReadyRuntime: () => companionReadyRuntime,
  });
  const { notifyEditorReadyFromCompanion } = companionAdapters;

  let persistentListenersRuntime = null;
  const persistentListenerDelegates = createPersistentListenersRuntimeDelegates(() => persistentListenersRuntime);
  const { addPersistentListener, removePersistentListeners } = persistentListenerDelegates;



  const CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID = "nostrodomus-cm-source-class-syntax-v1";

  const sourceClassBridgeRuntime = createSourceClassBridgeRuntime({
    W,
    styleEditorFromNode,
    composedContains: composedContains,
  });
  const { cssEscapeSelectorPart, bridgeActiveForStyleEditor, codeMirrorSourceClassParts } = createSourceClassBridgeRuntimeDelegates(() => sourceClassBridgeRuntime);


  const syntaxPresetAdapters = createMainLegacySyntaxPresetAdapters({
    getSyntaxRuntime: () => syntaxRuntime,
    installCodeMirrorSourceClassSyntax,
  });
  const { applyTextColorPreset } = syntaxPresetAdapters;









  /* Historical preflight gate tokens now preserved compactly after delegate-bridge extraction: function primeCodeboxPreflightForEditor; function scheduleCodeboxPreflightMutationScan; codeboxPreflightObserverMode: state.codeboxPreflightObserverMode || ""; codeboxPreflightScanRootCount: state.codeboxPreflightScanRootCount || 0; codeboxPreflightTargetedScans; codeboxPreflightLegacyDocumentScans; codeboxPreflightTargetedShadowTraversals; codeboxPreflightLegacyWildcardShadowTraversals; diagnosticValue("Preflight observer"; diagnosticValue("Preflight scan"; diagnosticValue("Preflight shadow scan"; recordPerformanceEvent("observer-callback"; recordPerformanceEvent("active-editor-cache-hit"; */

  const state = createRuntimeState({ version: VERSION, settings: loadSettings() });
  persistentListenersRuntime = createPersistentListenersRuntime({
    state,
    recordPerformanceEvent,
  });
  // Companion picker triggers: persistent-registered so uninstall's registry sweep
  // removes them, and attached only here -- past the installed guard -- so a
  // duplicate resource load bails before stacking a second pair.
  addPersistentListener(W.document, "pointerdown", companionPickerApply, true, "companion-picker-pointerdown");
  addPersistentListener(W.document, "focusin", companionPickerApply, true, "companion-picker-focusin");
  addPersistentListener(W, "resize", refitActiveCodeboxOnResize, { passive: true }, "companion-codebox-refit-resize");
  // The companion override key is read through a short cache. A change made in another tab or
  // window applies at once.
  addPersistentListener(W, "storage", onCompanionOverrideStorageEvent, false, "companion-override-storage");
  runtimeErrorRuntime = createRuntimeErrorRuntime({
    state,
    logWarnOnce,
  });
  // Must be constructed before any consumer of the settings-portal delegates runs:
  // the scoped initial syntax paint gate calls activeTopLayerDialog() during boot.
  settingsPortalRuntime = createSettingsPortalRuntime({
    documentRef: document,
    getComputedStyleRef: W.getComputedStyle?.bind?.(W) || globalThis.getComputedStyle?.bind?.(globalThis),
    NodeRef: W.Node || globalThis.Node,
    state,
    nostrodomusPerfMode,
    recordRuntimeErrorOnce,
    activeEditDialog: activeEditDialog,
    activeTopLayerDialogFromModule: activeEditor.activeTopLayerDialog,
    homeRoot: homeRoot,
    activeCodeboxStyleEditor,
    integrationDocumentStyleRoot,
  });
  styleDomRuntime = createStyleDomRuntime({
    documentRef: document,
    NodeRef: W.Node || globalThis.Node,
    MutationObserverRef: W.MutationObserver || globalThis.MutationObserver,
    state,
    STYLE_TEXT_SIZE_PRESETS,
    DARKPLUS_SYNTAX_COLORS,
    DARKPLUS_STYLE_ID,
    codeboxStyleTokenMap,
    codeboxStyleBuildRootCss,
    codeboxStyleSourceClassSteadyStateSkipDecision,
    activeEditDialog,
    activeTopLayerDialog,
    codeboxEditorCacheKey,
    codeboxFrameHostForEditor,
    editorUsesCodeMirrorSourceClassSyntax,
    homeRoot,
    mutationRecordsAreCodeMirrorOnly,
    mutationRecordLooksEditorStructural,
    nodeLooksLikeCodeMirrorInternals,
    recordPerformanceEvent,
    scheduleCodeboxStyleReapply,
    scheduleSourceClassSmartSyntax,
    nostrodomusPerfMode,
    visibleStyleEditorCandidate,
  });

  const settingsInteractionDelegates = createSettingsInteractionRuntimeDelegates(() => settingsInteractionRuntime);
  const { codeboxStyleTokenNamesForStyleRangeGroup, codeboxStyleTokenNamesForStyleRangeGroups, stableCodeboxStyleTokenTargets, applyCodeboxStyleTokensToStableRoots, cachedStyleRangeLivePreviewEditor, markCodeboxLivePreviewTargets, codeboxLivePreviewTokenTargets, primeStyleRangeLivePreviewSession, markCodeboxLivePreviewStyleTarget, clearStyleRangeLivePreviewCache, applyCodeboxStyleLivePreview, scheduleSettingsFeedbackReset, clearSettingsFeedbackTimers, scheduleSettingsInteractionRestore, clearSettingsInteractionRestoreTimers, schedulePreservedScrollRestore, clearPreservedScrollRestoreTimers, settingsBodyScrollTop, restoreSettingsBodyScroll, captureScrollSnapshot, restoreScrollSnapshot, preserveScrollDuring, captureSettingsInteractionSnapshot, restoreSettingsInteractionSnapshot, preserveSettingsInteractionDuring, applySettingChangePreservingInteraction, setSettingsPathValue, scheduleSettingsSave, flushSettingsSave, formatStyleRangeValueForInput, updateStyleRangeValueLabel, scheduleStyleRangeValueLabelUpdate, scheduleStyleRangeLiveSave, applyStyleRangeMutation, scheduleStyleRangeLivePreview } = settingsInteractionDelegates;

  // A slider change is written by a 260-900 ms debounce (scheduleSettingsSave). Write a pending
  // change at once when the page is going away, so a reload inside that window keeps it.
  const flushPendingSettingsSave = () => { if (state.settingsSaveTimer) flushSettingsSave("page-hide"); };
  addPersistentListener(W, "pagehide", flushPendingSettingsSave, { passive: true }, "settings-save-pagehide-flush");

  // ONE idempotent companion-apply hook, injected into BOTH the active-editor cache
  // convergence (rememberActiveCodeboxEditor — which every editor-discovery path funnels
  // through) AND the editor sentinel below. Wiring only the sentinel misses a real editor
  // discovered by a non-sentinel path (initialSyntaxPaintGate), which then gets main's
  // styling but no companion. applyForEditor is first-injector-wins / no-op-when-present,
  // so driving it from both points overlaps harmlessly. settingsOpen guards a
  // learned-simple dialog from a transient downgrade while Nostrodomus settings is open.
  // WARNING-TOGGLE: surface-wide "Hide editor warnings". Reconciles the warning-hide across the ACTIVE
  // card-edit dialog (covers the visual editor tab too — no CodeMirror there), gated solely by the toggle.
  // No-op (and no walk) when the toggle is off and nothing was injected.
  const applyEditorWarningHide = () => {
    try { companionScrollbarRuntime.applyEditorWarningHide(activeEditorWarningSurface()); } catch { /* fail-dark */ }
  };
  const applyCompanionEditorLayer = (editor) => {
    companionScrollbarRuntime.applyForEditor(editor);
    companionCodeboxEnlargeRuntime.applyForEditor(editor, { settingsOpen: !!state.settingsPanel?.isConnected });
    applyEditorWarningHide();
  };

  activeEditorCacheRuntime = createActiveEditorCacheRuntime({
    W,
    VERSION,
    state,
    applyCompanionEditorLayer,
    getComputedStyle: W.getComputedStyle?.bind?.(W) || globalThis.getComputedStyle?.bind?.(globalThis),
    codeboxFrameHostForEditor,
    activeEditDialog,
    composedContains,
    editorLikelyOpeningWithoutMountedCodebox,
    sourceClassSmartSyntaxObserverReady,
    shouldSkipStableEditorLifecycleForNativeFallback,
    shouldSkipRememberActiveEditorNativeHighlightInstall,
    recordPerformanceEvent,
    scheduleNativeHighlightForActiveEditor,
    editorUsesCodeMirrorSourceClassSyntax,
    replaceNativeAutocompleteEnabled: () => state.settings?.replaceNativeAutocomplete !== false,
    codeEditorHostsForNativeSuppression: () => nativeAutocompleteCodeEditorHosts(),
  });


  settingsInteractionRuntime = createSettingsInteractionRuntime({
    state,
    documentRef: document,
    windowRef: window,
    requestAnimationFrame,
    cancelAnimationFrame,
    setTimeout,
    clearTimeout,
    activeEditDialog: activeEditDialog,
    activeCodeboxStyleEditor,
    applyCodeboxStyleTokensToElement,
    codeboxEditorCacheKey,
    codeboxFrameHostForEditor,
    codeboxStyleSignature: codeboxStyleSignature,
    codeboxStyleTokensFromSettings,
    effectiveStyleSettings,
    recordPerformanceEvent,
    recordRuntimeErrorOnce,
    measurePerformanceEvent,
    resolveSyntaxTintSettings,
    saveSettings,
    // Deferred read: requestCompletionLiveUpdate is destructured from the completion
    // runtime group after this wiring runs; an eager reference here is a startup TDZ.
    requestLiveUpdate: reason => requestCompletionLiveUpdate(reason),
    shouldRecordPerformanceTelemetry,
    stylePresetValue,
    STYLE_TEXT_SIZE_PRESETS,
  });



  clientCapabilitiesRuntime = createClientCapabilitiesRuntime({
    W,
    documentRef: document,
    navigatorRef: navigator,
    performanceRef: performance,
    state,
    recordPerformanceEvent,
    roundPerformanceMetric: roundPerformanceMetric,
    compactGpuRendererLabel,
    displayBrowserLabel,
    displayMemoryLabel,
    displayViewportLabel,
    displayMonitorLabel,
  });


  const diagnosticsAdapters = createMainLegacyDiagnosticsAdapters({ W, performanceTelemetrySnapshot });
  const { runtimeCoordinatorReadout, companionLayerReadout, incrementMapCounter, evaluatePerformanceBudgets } = diagnosticsAdapters;

  const completionPopupAdapters = createMainLegacyCompletionPopupAdapters({
    state,
    documentRef: document,
    windowRef: window,
    overlayRoot,
    getPos,
    getEditorDispatchRuntime: () => editorDispatchRuntime,
    clearPreservedScrollRestoreTimers,
    recordRuntimeErrorOnce,
  });
  const { removeOverlay, ensureOverlay, isOpen, close, placeAtCursor, getDocLength } = completionPopupAdapters;

  observerLifecycleRuntime = createObserverLifecycleRuntime({
    W,
    state,
    observerLifecycleDisconnectGateKey: OBSERVER_LIFECYCLE_DISCONNECT_GATE_KEY,
    observerLifecycleCloseDryRunGateKey: OBSERVER_LIFECYCLE_CLOSE_DRY_RUN_GATE_KEY,
    observerLifecycleCloseDryRunListenerGateKey: OBSERVER_LIFECYCLE_CLOSE_DRY_RUN_LISTENER_GATE_KEY,
    activeEditDialog,
    isOpen,
    editorLikelyOpeningWithoutMountedCodebox,
    recordPerformanceEvent,
    recordRuntimeErrorOnce,
    disconnectCodeboxPreflightObserver,
    cleanupCodeboxSlotUnclip,
    uninstallEditorLifecycleSentinel,
    cleanupInitialSyntaxPaintGate,
    disconnectCodeMirrorSyntaxContentObserver,
    disconnectSourceClassSmartSyntaxObserver,
    // The companion settle engine's observers: the home root one, the open dialog's and one per
    // dialog element. Its snapshot tells them apart and its cleanup disconnects them.
    companionObserverCounts: () => {
      const settle = companionSettleRuntime.snapshot();
      return {
        companionSettleObservers: (settle.booted ? 1 : 0) + (settle.observingDialog ? 1 : 0) + (settle.openWatchers || 0),
        companionWarningObservers: companionScrollbarRuntime.warningObserverCount(),
        companionLayoutObservers: companionCodeboxEnlargeRuntime.layoutObserverCount(),
      };
    },
    disconnectCompanionObservers: () => {
      companionSettleRuntime.cleanup();
      companionScrollbarRuntime.disconnectWarningObservers();
      companionCodeboxEnlargeRuntime.stopWatchingLayout();
    },
  });

  observerLifecycleDisconnectAll = observerLifecycleRuntime.disconnectAllNostrodomusObservers;


  /* Historical observer-lifecycle gate tokens now preserved compactly after delegate-bridge extraction: state.observerLifecycleDisconnectBlocked; readyForAutomaticBinding: false; candidateSeams:; seam: "suggestion-popup-close"; functionName: "close()"; seam: "settings-close"; functionName: "closeSettings(resetPosition)"; seam: "runtime-uninstall"; functionName: "uninstall()"; seam: "editor-reopen"; functionName: "handleEditorSentinelDetected(reason, editor)"; observerLifecycleCloseBindingReadiness: observerLifecycleCloseBindingReadiness(); observerLifecycleCloseDryRun: observerLifecycleCloseDryRunReadout(); observerLifecycleCloseDryRunProbe; observerLifecycleCloseDryRunListener: observerLifecycleCloseDryRunListenerReadout(); observerLifecycleCloseDryRunListenerProbe; cleanupCodeboxSlotUnclip(`${cleanReason}-central`); uninstallEditorLifecycleSentinel(`${cleanReason}-central`); cleanupInitialSyntaxPaintGate(`${cleanReason}-central`); disconnectCodeMirrorSyntaxContentObserver(`${cleanReason}-central`); disconnectSourceClassSmartSyntaxObserver(`${cleanReason}-central`); */

  function saveSettings(reason = "settings-save") {
    return settingsPanelRuntime.saveSettings(reason);
  }


  const providerRuntime = createProviderRuntime({
    state,
    window: W,
    document,
    limits: SECURITY_LIMITS,
    getDoc,
    getPos,
    yamlBranchState: dashboardActionBranchState,
    recordRuntimeError,
    recordRuntimeErrorOnce,
    logIndexed: detail => logDebug("indexed", detail),
  });

  const providerDelegates = createProviderRuntimeDelegates(() => providerRuntime);
  const { loadLibrary, sanitizeLibraryRow, normalizeItem, clearCompletionCache, cacheSet, registerProvider, ensureProviderSettings, providerEnabled, providerDiagnosticId, providerTimeoutBudgetMs, validateProviderRow, validateProviderRows, staticLibraryProvider, findHass, runtimeData, yamlPathParts, yamlPathIncludes, isDashboardActionContext, isAutomationScriptContext, yamlScalarValueKind, isScalarValueKind, isScalarConfigContext, yamlValueKind, yamlFocusKind, yamlBlockValueKeyKind, runtimeRowsForKind, haRuntimeValueProvider, contextRow, rowSet, yamlPathText, recentYamlText, looksLikeButtonCardContext, lovelaceContextRows, lovelaceContextProvider, snippetRow, yamlPathHas, snippetRowsForContext, snippetProvider, buildIndex, runtimeProviderRegistryLimits, runtimeProviderRegistryDeps } = providerDelegates;

  const PROVIDER_SETTINGS_META = providerRuntime.PROVIDER_SETTINGS_META;
  const { providerCandidates } = createMainLegacyProviderAdapters({
    getProviderRuntime: () => providerRuntime,
    recordRuntimeErrorOnce,
  });

  const runtimeContextRuntime = createRuntimeContextRuntime({
    state,
    recordRuntimeErrorOnce,
    runtimeData,
  });
  const { detectContextFallback, detectContext } = createRuntimeContextRuntimeDelegates(() => runtimeContextRuntime);

  // ── Frecency persistence (Engine track) ────────────────────────────────────────────────────────
  // Hydrate the ONE shared accept store from a single localStorage key at boot (read-once, fail-dark),
  // and persist a debounced snapshot on accept — but ONLY while the frecency flag is on, so a default
  // (flag-off) install performs ZERO new storage writes and is side-effect-identical to before. The
  // store stays pure (scoring.js); all storage I/O + the debounce timer live here in the host.
  const frecencyStorage = () => { try { return W?.["local" + "Storage"]; } catch { return null; } };
  try {
    const rawFrecency = frecencyStorage()?.getItem?.(FRECENCY_WRITE_KEY);
    if (rawFrecency) {
      const parsedFrecency = JSON.parse(rawFrecency);
      if (parsedFrecency && parsedFrecency.v === 1 && Array.isArray(parsedFrecency.entries)) {
        // snapshot() serializes oldest-first, so slice(0,50) kept the STALEST 50 and
        // dropped the newest accepts — the inverse of LRU. slice(-50) keeps the newest 50
        // (matching the store's own keep-newest overflow eviction) and still bounds iteration.
        DEFAULT_RECENT_ACCEPT_STORE.hydrate(parsedFrecency.entries.slice(-50));
      }
    }
  } catch (err) { recordRuntimeErrorOnce('frecency:hydrate', err, { phase: 'boot' }); }
  let frecencyFlushTimer = 0;
  const writeFrecencyNow = () => {
    frecencyFlushTimer = 0;
    try {
      const json = JSON.stringify(DEFAULT_RECENT_ACCEPT_STORE.snapshot());
      if (json.length <= 16384) frecencyStorage()?.setItem?.(FRECENCY_WRITE_KEY, json);
    } catch (err) { recordRuntimeErrorOnce('frecency:persist', err, { phase: 'flush' }); }
  };
  const scheduleFrecencyWrite = () => {
    if (state.settings?.completions?.frecency !== true) return; // gated: no writes unless enabled
    try { clearTimeout(frecencyFlushTimer); } catch { /* no pending timer */ }
    frecencyFlushTimer = setTimeout(writeFrecencyNow, 1500);
  };
  // An accept is written 1.5 s later. A write that is still pending when the page goes away or
  // the runtime is removed is made at once: a reload inside that time lost the accept, and after
  // an uninstall the timer still fired.
  const flushPendingFrecencyWrite = () => {
    if (!frecencyFlushTimer) return;
    try { clearTimeout(frecencyFlushTimer); } catch { /* no pending timer */ }
    writeFrecencyNow();
  };
  addPersistentListener(W, "pagehide", flushPendingFrecencyWrite, { passive: true }, "frecency-write-pagehide-flush");

  const {
    allowType,
    camelMatch,
    clearSnippetSession,
    compute,
    contextualPenalty,
    focusKindTypeBoost,
    hasFocusedContextProviderItems,
    insertItem,
    itemMatchesYamlValueKind,
    modeRank,
    moveSnippetPlaceholder,
    onFocusIn,
    onFocusOut,
    onKeydown,
    onPointer,
    open,
    refresh,
    render,
    requestLiveUpdate: requestCompletionLiveUpdate,
    runtimeDomainPriority,
    scoreItems,
    semanticItemRank,
    shouldSuppressStaticForFocusedContext,
    suggestionQualityPayload,
    toggle,
    updateSnippetSessionAfterDispatch,
  } = createMainLegacyCompletionRuntimeGroup({
    state,
    identity: { VERSION, PROJECT_VERSION },
    suggestionQuality: {
      providerSummary,
      contextRouteLabel,
      itemDetail,
      updateSuggestionQualityPanel,
      // The payload is read by the Settings panel and by a diagnostics export, which builds its own.
      payloadWanted: () => !!state.settingsPanel?.isConnected,
    },
    scoring: {
      ensureProviderSettings,
      providerCandidates,
      runtimeData,
    },
    insertion: {
      getDocLength,
      looksLikeView: looksLikeView,
      recordRuntimeError,
      closeCompletion: close,
      isViewAllowed,
      scheduleFrame: fn => requestAnimationFrame(fn),
      now: Date.now,
      // Wrap the accept recorder so an accept ALSO schedules the debounced frecency persist (which itself
      // no-ops unless the flag is on). recordRecentAcceptedCompletion marks the shared DEFAULT store, so the
      // ranking-read and the persist-write stay on ONE store with no factory re-threading.
      recordRecentAcceptedCompletion: (item) => { const stampValue = recordRecentAcceptedCompletion(item); scheduleFrecencyWrite(); return stampValue; },
    },
    completion: {
      documentRef: document,
      cancelAnimationFrame,
      requestAnimationFrame,
      clearTimeout,
      setTimeout,
      now: Date.now,
      ensureOverlay,
      placeAtCursor,
      popupIsOpen: isOpen,
      closePopup: close,
      measurePerformanceEvent,
      getDoc,
      getPos,
      detectContext,
      // Engine track (lazyResolve / signatureHelp): the SAME memoized runtime cache, exposed to the
      // popup so the highlighted item can resolve rich detail and the signature tip can read service
      // fields. Read only when a flag is on — no second cache, no per-keystroke window/hass read.
      runtimeSnapshot: runtimeData,
      updateContextInspectorPanel,
      updateSuggestionQualityPanel,
      recordRuntimeError,
      recordRuntimeErrorOnce,
      isViewAllowed,
      loadLibrary,
      logDebug,
      openSettings,
      preserveScrollDuring,
      editorDispatchRepeatPressureActive,
      recordPerformanceEvent,
      closeSettings,
      // UNIVERSAL: bind `state` so the gate can read the universal flags + admit an allowlisted
      // non-card-dialog panel editor. The dialog path is unchanged (deps unused when a dialog is open).
      isScopedEditorEvent: (ev) => isScopedEditorEvent(ev, { state }),
      isNostrodomusUiEvent,
      rememberView,
      pathHasEditorSurface: pathHasEditorSurface,
      pageMayHaveEditor: (ev) => activeEditor.pageMayHaveEditor(ev, { state, window: W }),
      scheduleCodeboxStyleReapply,
      observerLifecycleCloseDryRunListenerProbe,
    },
  });

  const diagnosticsSchedulerAdapters = createMainLegacyDiagnosticsSchedulerAdapters({
    getState: () => state,
    getSyntaxRuntime: () => syntaxRuntime,
    getDiagnosticsRuntime: () => diagnosticsRuntime,
  });

  function scheduleDiagnosticsRefresh(reason = 'diagnostics-refresh') {
    return diagnosticsSchedulerAdapters.scheduleDiagnosticsRefresh(reason);
  }

  syntaxRuntime = createSyntaxRuntime({
    state,
    VERSION,
    W,
    DARKPLUS_SYNTAX_COLORS,
    DARKPLUS_MAX_LINES_PER_PASS,
    DARKPLUS_MAX_SPANS_PER_PASS,
    CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID,
    STYLE_SYNTAX_KIND_ORDER,
    activeCodeboxStyleEditor,
    activeEditDialog,
    activeTopLayerDialog,
    applyTextColorPreset,
    codeboxEditorCacheKey,
    codeMirrorSourceClassParts,
    cssEscapeSelectorPart,
    effectiveStyleSettings,
    ensureStyleElementAtEnd,
    recordPerformanceEvent,
    rememberActiveCodeboxEditor,
    resolveSyntaxTintSettings,
    nostrodomusPerfMode,
    styleEditorFromNode,
    nostrodomusWalkOpenRoots,
    visibleStyleEditorCandidate,
    syntaxColorWithOpacity,
    scheduleDiagnosticsRefresh,
  });

  codeboxFrameRuntime = createCodeboxFrameRuntime({
    window,
    document,
    state,
    cancelAnimationFrame: W.cancelAnimationFrame?.bind?.(W) || globalThis.cancelAnimationFrame?.bind?.(globalThis),
    setTimeout: W.setTimeout?.bind?.(W) || globalThis.setTimeout?.bind?.(globalThis),
    clearTimeout: W.clearTimeout?.bind?.(W) || globalThis.clearTimeout?.bind?.(globalThis),
    activeTopLayerDialog,
    activeEditDialog: activeEditDialog,
    homeRoot: homeRoot,
    integrationDocumentStyleRoot,
    applyCodeboxStyleTokensToElement,
    activeCodeboxStyleEditor,
    codeboxStyleTokensFromSettings,
    effectiveStyleSettings,
    measurePerformanceEvent,
    recordRuntimeErrorOnce,
    recordPerformanceEvent,
    composedContains: composedContains,
    isNostrodomusUiEvent,
    codeboxEditorCacheKey,
    addPersistentListener,
  });

  codeboxStyleRuntime = createCodeboxStyleRuntime({
    window,
    document,
    W,
    state,
    performance: W.performance || globalThis.performance,
    requestAnimationFrame: W.requestAnimationFrame?.bind?.(W) || globalThis.requestAnimationFrame?.bind?.(globalThis),
    cancelAnimationFrame: W.cancelAnimationFrame?.bind?.(W) || globalThis.cancelAnimationFrame?.bind?.(globalThis),
    setTimeout: W.setTimeout?.bind?.(W) || globalThis.setTimeout?.bind?.(globalThis),
    clearTimeout: W.clearTimeout?.bind?.(W) || globalThis.clearTimeout?.bind?.(globalThis),
    MutationObserver: W.MutationObserver || globalThis.MutationObserver,
    DARKPLUS_SYNTAX_COLORS,
    STYLE_TEXT_SIZE_PRESETS,
    activeEditDialog,
    activeEditorNoEditorBackoffAllowed,
    activeTopLayerDialog,
    applyCodeboxStyleTokensToElement,
    applyCodeboxStyleTokensToStableRoots,
    applyTextColorPreset,
    buildCodeboxRootCss,
    clearCodeboxExternalFrameSettleTimers,
    clearStyleRangeLivePreviewCache,
    codeboxComposedParent,
    codeboxEditorCacheKey,
    codeboxFrameHostForEditor,
    codeboxStyleReasonNeedsSettle,
    codeboxStyleReasonRequiresFullApply,
    codeboxStyleReasonRequiresSyntaxPaint,
    codeboxStyleSettleReasonCoalesceDecision,
    codeboxStyleSignature,
    codeboxStyleTokensFromSettings,
    composedContains,
    discoverOpenStyleRoots,
    editorLikelyOpeningWithoutMountedCodebox,
    effectiveStyleSettings,
    ensureRootCodeboxStyle,
    ensureStableStyleElement,
    installCodeboxExternalFrameEventGuards,
    installCodeboxKeyboardContainment,
    installCodeboxStyleMutationGuard,
    installInitialSyntaxPaintGate,
    installSyntaxOwnerObserver,
    isStyleRoot,
    maybeSkipSourceClassSteadyStateStyleReapply,
    measurePerformanceEvent,
    mutationRecordLooksEditorStructural,
    mutationRecordsAreCodeMirrorOnly,
    primeInitialSyntaxPaintGateForEditor,
    recordPerformanceEvent,
    rememberActiveCodeboxEditor,
    rememberActiveEditorNoEditor,
    removeCodeboxExternalFrame,
    removeCodeboxRootStylesFromAllRoots,
    resolveSyntaxTintSettings,
    scheduleCodeboxExternalFrameSettleSync,
    scheduleEditorPresenceProbe,
    scheduleSourceClassSyntaxRefresh,
    scheduleStyleRootScan,
    nostrodomusWalkOpenRoots,
    structuralObserverConfigForTarget,
    nostrodomusPerfMode,
    styleEditorFromNode,
    stylePresetValue,
    styleRangeGroupTouchesSyntax,
    syncCodeboxExternalFrame,
    usableBridgeStyleEditorCandidate,
    visibleStyleEditorCandidate,
  });

  settingsPanelRuntime = createMainLegacySettingsPanelRuntime({
    globals: { window, document, navigator, settingsStorage, W },
    identity: { DEFAULT_SETTINGS, SETTINGS_WRITE_KEY, STYLE_SYNTAX_PRESETS, STYLE_TEXT_SIZE_PRESETS, VERSION },
    settings: { applySettingChangePreservingInteraction, applyStyleRangeMutation, cancelStyleRangeCommitReapply, clampNumber, clearSettingsFeedbackTimers, clearSettingsInteractionRestoreTimers, cloneDefaultSettings, clearCompletionCache, hueLabel, logDebug, logInfoOnce, percentLabel, preserveSettingsInteractionDuring, scheduleSettingsFeedbackReset, scheduleSettingsSave, sliderNumberLabel },
    diagnostics: { changelogSummaryText, contextInspectorMarkup, contextInspectorPayload, copyDiagnosticsToClipboard, diagnosticsMarkup, health, refreshContextInspectorPanel, refreshSuggestionQualityPanel, safeContextSummary, startContextInspectorHeartbeat, stopContextInspectorHeartbeat, suggestionQualityCard, suggestionQualityPayload },
    providers: { ensureProviderSettings, providerControlsMarkup, updateProviderControlCard },
    style: { applyCompanionEditorLayer, pruneStyleRootObservers, recordPerformanceEvent, recordRuntimeErrorOnce, scheduleCodeboxStyleReapply, scheduleDiagnosticsRefresh, scheduleSourceClassSyntaxRefresh, scheduleStyleRangeCommitReapply, scheduleStyleRangeLivePreview, scheduleStyleRangeLiveSave, scheduleStyleRangeValueLabelUpdate, settingsPortalRoot, syntaxThemeOptions, syntaxThemePalette, updateStyleRangeValueLabel },
    state,
  });

  const settingsPanelDelegates = createSettingsPanelRuntimeDelegates(() => settingsPanelRuntime);
  const { clampSettingsPosition, clampSettingsSize, settingsPortalViewportRect, settingsViewportToPortalPosition, applySettingsPanelViewportPosition, saveSettingsPosition, saveSettingsSize, languageLabel, settingDesc, settingsCard, optionButton, colorOptionButton, glowSizeLabel, styleRangeControl, styleColorBarControl, styleToggle, syntaxThemeSelect, settingsCheckbox, settingsGrid, makeSettingsStyle, sectionPanel, helpCard } = settingsPanelDelegates;



  // Keep an open settings panel inside the window when the window shrinks. The stored position is
  // not rewritten, so the panel returns to it the next time it opens in a larger window.
  const reclampSettingsPanelOnResize = () => {
    const panel = state.settingsPanel;
    if (!panel?.isConnected) return;
    const rect = panel.getBoundingClientRect();
    applySettingsPanelViewportPosition(panel, { x: rect.left, y: rect.top });
  };
  addPersistentListener(W, "resize", reclampSettingsPanelOnResize, { passive: true }, "settings-panel-resize-reclamp");

  function closeSettings(resetPosition = false) {
    return settingsPanelRuntime.closeSettings(resetPosition);
  }

  const settingsElementAdapters = createMainLegacySettingsElementAdapters({ documentRef: document });
  const { createSettingsElement, appendChildren, settingsTitle } = settingsElementAdapters;

  // Settings saved in another tab or window of the same browser. Each tab kept the settings it
  // had loaded, and its next save wrote them back over the other tab's change.
  function onSettingsStorage(event) {
    try {
      // The debug and perf flags are cached for a second; a change from another tab applies now.
      loggingRuntime.refreshStorageFlags(event);
      if (!event || event.key !== SETTINGS_WRITE_KEY || typeof event.newValue !== "string") return;
      if (event.newValue === state.settingsLastSerialized) return;
      state.settings = loadSettings();
      state.settingsLastSerialized = event.newValue;
      scheduleCodeboxStyleReapply("settings-storage-sync");
      if (state.settingsPanel?.isConnected) {
        closeSettings(false);
        openSettings();
      }
    } catch (err) {
      recordRuntimeErrorOnce("settings:storage-sync", err, { phase: "onSettingsStorage" });
    }
  }

  // The panel shell asks for the portal root itself when it builds the panel. Asking here as
  // well created the host, only for the shell's close-before-open to remove it again, and each
  // lookup searches the page for a top-layer dialog.
  function openSettings() {
    return settingsPanelRuntime.openSettings();
  }

  performanceTelemetryRuntime = createPerformanceTelemetryRuntime({
    state,
    shouldQuietEditorDispatchTelemetryEvent,
    quietEditorDispatchTelemetryEvent,
    nostrodomusPerfMode,
    debugLoggingEnabled,
    shouldRecordPerformanceTelemetryDecision,
    measurePerformanceEventWithCallbacks,
    evaluatePerformanceBudgets,
    roundPerformanceMetric,
    diagnosticEventMetric,
    clearSettingsFeedbackTimers,
    clearSettingsInteractionRestoreTimers,
    clearPreservedScrollRestoreTimers,
    clearCodeboxExternalFrameSettleTimers,
    activeContextDiagnosticsSection,
    clientCapabilitySnapshot,
    observerLifecycleReadout,
    observerLifecycleCloseBindingReadiness,
    observerLifecycleCloseDryRunReadout,
    observerLifecycleCloseDryRunListenerReadout,
    editorLikelyOpeningWithoutMountedCodebox,
    looksLikeView,
    isViewAllowed,
  });


  diagnosticsRuntime = createDiagnosticsRuntime({
    CHANGELOG_SUMMARY,
    DEFAULT_SETTINGS,
    LIVE_COMPANION_EDITOR_VERSION,
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
    diagnosticsReasonIsInteractive: fastLaneHelpers.diagnosticsReasonIsInteractive,
    diagnosticsRuntimeErrorFallback,
    displayBrowserLabel,
    displayMemoryLabel,
    displayViewportLabel,
    document,
    ensureProviderSettings,
    formatPerformanceEventMetric: fastLaneHelpers.formatPerformanceEventMetric,
    getDocLength,
    health: diagnosticsHealth.health,
    incrementMapCounter,
    isOpen,
    isViewAllowed,
    itemDetail,
    itemDocumentation,
    itemSourceLabel,
    loadedSettingsStorageKey: () => loadedSettingsStorageKey,
    localStorage: settingsStorage,
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
    providerSummary: providerRegistry.providerSummary,
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
    styleCssModuleStatus: stylesCss.styleCssModuleStatus,
    suggestionQualityPayload,
    runtimeCoordinatorReadout,
    companionLayerReadout,
    companionInputQuietReadout: () => companionInputQuietRuntime.snapshot(),
    companionSettleReadout: () => companionSettleRuntime.snapshot(),
    deferDuringTyping: (reason, applyFn) => companionInputQuietRuntime.deferDuringTyping(reason, applyFn),
  });

  editorDispatchRuntime = createEditorDispatchRuntime({
    windowRef: W,
    state,
    runtimeCoordinator,
    recordPerformanceEvent,
    recordRuntimeErrorOnce,
    logDebug,
    codeboxEditorCacheKey,
    scheduleCodeboxStyleReapply,
    scheduleDiagnosticsRefresh,
    activeContextDiagnosticsSection,
    typingSessionOwnsEditorDispatchSettling: () => syntaxRuntime.typingSessionOwnsEditorDispatchSettling(),
    enterTypingSession: (view, reason) => syntaxRuntime.enterTypingSession(view, reason),
    updateSnippetSessionAfterDispatch,
    requestLiveUpdate: requestCompletionLiveUpdate,
    popupIsOpen: isOpen,
    diagnosticsRecording: () => shouldRecordPerformanceTelemetry("editor-dispatch"),
  });
  function debug() {
    return diagnosticsRuntime.debug();
  }


  styleRootRuntime = createStyleRootRuntime({
    documentRef: document,
    state,
    NodeRef: W.Node || globalThis.Node,
    performanceRef: W.performance || globalThis.performance,
    requestAnimationFrame: W.requestAnimationFrame?.bind?.(W) || globalThis.requestAnimationFrame?.bind?.(globalThis),
    cancelAnimationFrame: W.cancelAnimationFrame?.bind?.(W) || globalThis.cancelAnimationFrame?.bind?.(globalThis),
    setTimeout: W.setTimeout?.bind?.(W) || globalThis.setTimeout?.bind?.(globalThis),
    clearTimeout: W.clearTimeout?.bind?.(W) || globalThis.clearTimeout?.bind?.(globalThis),
    activeCodeboxStyleEditor,
    editorLikelyOpeningWithoutMountedCodebox,
    scheduleEditorPresenceProbe,
    scheduleEditorSettleProbes,
    cleanupCodeboxSlotUnclip,
    removeCodeboxRootStylesFromAllRoots,
    discoverOpenStyleRoots,
    attachStyleRootObserver,
    codeboxStyleReasonIsPassiveEditorSettle,
    codeboxStyleReasonRequiresFullApply: reason => codeboxStyleReasonRequiresFullApply(reason, { lastAppliedAt: state.codeboxStyleLastAppliedAt, cacheInvalidated: state.codeboxStyleCacheInvalidated }),
    scheduleCodeboxStyleReapply,
    measurePerformanceEvent,
    recordPerformanceEvent,
  });



  const selectorSeamProbeRuntime = createSelectorSeamProbe({
    state,
    document,
    now: () => Date.now(),
    recordPerformanceEvent,
    recordRuntimeErrorOnce,
  });

  // ON-MOUNT FLASH FIX (universal panels): the editor-surface observation roots currently present, as
  // {root,label}. The panel ha-code-editor sits below several shadow boundaries
  // (ha-code-editor < ha-yaml-editor < ... < ha-automation-editor), and a
  // MutationObserver cannot cross them, so the sentinel observes each wrapper's shadowRoot; the
  // .cm-editor mount inside ha-code-editor's shadow then fires a pre-paint microtask and styles before the
  // first unstyled paint (the flash). Path-gated (a cheap no-op off automation/script/dev-tools routes;
  // raw-config hui-editor falls back to the polled path for now) + bounded deep walk; the sentinel only
  // calls this during the opening window.
  function panelEditorObservationRoots() {
    if (state.settings?.style?.universalCodebox === false) return [];
    const out = [];
    const seen = new Set();
    const add = (el, label) => { if (el?.shadowRoot && !out.some(e => e.root === el.shadowRoot)) out.push({ root: el.shadowRoot, label }); };

    // PANEL arm (unchanged): on automation/script/dev-tools routes, deep-walk to the panel ha-code-editor.
    let path = "";
    try { path = String(W.location?.pathname || ""); } catch { /* sandboxed window */ }
    if (isPanelEditorRoute(path)) {
      const walk = (root, depth) => {
        if (!root || depth > 14) return;
        try {
          for (const el of root.querySelectorAll?.(UNIVERSAL_PANEL_HOSTS) || []) add(el, `panel-host:${el.localName}`);
          for (const el of root.querySelectorAll?.(PANEL_EDITOR_YAML_WRAPPER) || []) add(el, "panel-yaml-wrapper");
          for (const el of root.querySelectorAll?.("ha-code-editor") || []) add(el, "panel-code-editor");
        } catch { /* detached mid-walk */ }
        for (const el of root.querySelectorAll?.("*") || []) {
          const sr = el.shadowRoot;
          if (sr && !seen.has(sr)) { seen.add(sr); walk(sr, depth + 1); }
        }
      };
      try { walk(homeRoot() || document, 0); } catch { /* fail-dark */ }
    }

    // CARD-DIALOG arm (apply-on-open flash fix): observe the active edit-card dialog's nested editor-host
    // shadows so a DEEP codebox mount — e.g. a stack card's sub-card YAML editor, behind hui-stack-card-editor
    // — fires a sentinel callback and the chrome applies pre-paint (no flash) instead of on a post-paint probe.
    // BOUNDED, registry-typed descent (OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR — never '*', so the
    // no-wildcard pins stay green), seeded from editCardDialogCandidates() (covers the 2026.6 wa-dialog 0-sized
    // open phase where activeEditDialog() is still null), depth-capped, dedup via the shared seen-Set. The
    // sentinel only calls this during the opening window (universalCodebox + editorLikelyOpeningWithoutMountedCodebox).
    let dialogs = [];
    try { dialogs = editCardDialogCandidates() || []; } catch { dialogs = []; }
    for (const dialog of dialogs) {
      const dialogRoot = dialog?.shadowRoot || (dialog?.querySelectorAll ? dialog : null);
      if (!dialogRoot) continue;
      const dialogWalk = (root, depth) => {
        if (!root || depth > 14) return;
        let hosts = [];
        try { hosts = Array.from(root.querySelectorAll?.(OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR) || []); } catch { hosts = []; }
        for (const el of hosts) {
          const sr = el.shadowRoot;
          if (!sr || seen.has(sr)) continue;
          seen.add(sr);
          add(el, `card-dialog-host:${el.localName}`);
          dialogWalk(sr, depth + 1);
        }
      };
      try { dialogWalk(dialogRoot, 0); } catch { /* fail-dark */ }
    }

    return out;
  }

  // Every ha-code-editor HOST on the active surface, for surface-wide native-autocomplete suppression.
  // Reuses panelEditorObservationRoots' bounded, route/dialog-gated shadow walk (the same enumeration
  // the sentinel trusts to find editors for styling) rather than adding a second walk: that walk adds
  // each discovered ha-code-editor's own shadow root, so root.host recovers the host element. Deduped,
  // fail-dark — a detached/hostile root degrades that root only.
  function nativeAutocompleteCodeEditorHosts() {
    const hosts = [];
    const seen = new Set();
    const addHost = (el) => { if (el && el.localName === "ha-code-editor" && !seen.has(el)) { seen.add(el); hosts.push(el); } };
    let roots = [];
    try { roots = panelEditorObservationRoots() || []; } catch { roots = []; }
    for (const { root } of roots) {
      if (!root) continue;
      try { addHost(root.host); } catch { /* detached */ }
      try { for (const el of root.querySelectorAll?.("ha-code-editor") || []) addHost(el); } catch { /* detached */ }
    }
    return hosts;
  }

  editorLifecycleSentinelRuntime = createEditorLifecycleSentinelRuntime({
    document,
    window: W,
    // UNIVERSAL: gate the on-open navigation convergence on the same flag as the universal
    // discovery walk. Default ON; flip style.universalCodebox=false to revert to dialog-only.
    universalCodeboxEnabled: () => state.settings?.style?.universalCodebox !== false,
    state,
    onEditorSeamProbe: selectorSeamProbeRuntime.probeLater,
    MutationObserver: W.MutationObserver || globalThis.MutationObserver,
    Node: W.Node || globalThis.Node,
    requestAnimationFrame: W.requestAnimationFrame?.bind?.(W) || globalThis.requestAnimationFrame?.bind?.(globalThis),
    cancelAnimationFrame: W.cancelAnimationFrame?.bind?.(W) || globalThis.cancelAnimationFrame?.bind?.(globalThis),
    setTimeout: W.setTimeout?.bind?.(W) || globalThis.setTimeout?.bind?.(globalThis),
    clearTimeout: W.clearTimeout?.bind?.(W) || globalThis.clearTimeout?.bind?.(globalThis),
    activeEditDialog: activeEditDialog,
    editCardDialogCandidates: editCardDialogCandidates,
    activeCodeboxStyleEditor,
    codeboxEditorCacheKey,
    homeRoot: homeRoot,
    primeCodeboxPreflightForEditor,
    rememberActiveCodeboxEditor,
    scheduleCodeboxStyleReapply,
    forceStyleRootScanNextFrame,
    stableNativeFallbackLifecycleDecisionForEditor,
    suppressStableNativeFallbackEditorLifecycle,
    recordPerformanceEvent,
    recordRuntimeErrorOnce,
    // Same single hook the active-editor cache convergence uses (defined above). Kept
    // wired here too: the sentinel is the primary editor-ready driver and the overlap
    // is idempotent. Drives all dormant-gated editor-ready companion layers.
    applyCompanionEditorLayer,
    // ON-MOUNT FLASH FIX: panel editor-surface observation roots (host/ha-yaml-editor/ha-code-editor
    // shadows) so the sentinel catches the .cm-editor mount synchronously, before first paint.
    panelEditorObservationRoots: () => panelEditorObservationRoots(),
    // WARNING-TOGGLE: surface-wide editor-warning hide. Called on each probe so it also fires when a
    // card-edit dialog is open with NO CodeMirror editor (the visual editor tab); a cheap no-op when the
    // toggle is off and nothing was injected.
    applyEditorWarningHide,
  });


  companionReadyRuntime = createCompanionReadyRuntime({
    state,
    usableBridgeStyleEditorCandidate,
    visibleStyleEditorCandidate,
    stableNativeFallbackLifecycleDecisionForEditor,
    suppressStableNativeFallbackEditorLifecycle,
    scheduleCodeboxExternalFrameSync,
    primeCodeboxPreflightForEditor,
    rememberActiveCodeboxEditor,
    handleEditorSentinelDetected,
    installSyntaxOwnerObserver,
    scheduleEditorPresenceProbe,
    scheduleEditorSettleProbes,
    scheduleCodeboxStyleReapply,
  });


  const publicApiRuntime = createPublicApiRuntime({
    W,
    documentRef: document,
    state,
    VERSION,
    PROJECT_VERSION,
    logDebug,
    emitStartupBadge,
    cancelAnimationFrameRef: cancelAnimationFrame,
    apiMethods: {
      buildIndex,
      clearRuntimeErrors,
      clientCapabilitySnapshot,
      close,
      copyDiagnosticsToClipboard,
      debug,
      debugSnapshot,
      disconnectAllNostrodomusObservers,
      embeddedLanguageDiagnostics,
      exportDiagnostics,
      health,
      observerLifecycleCloseBindingReadiness,
      observerLifecycleCloseDryRunListenerProbe,
      observerLifecycleCloseDryRunListenerReadout,
      observerLifecycleCloseDryRunProbe,
      observerLifecycleCloseDryRunReadout,
      observerLifecycleReadout,
      onFocusIn,
      onFocusOut,
      onKeydown,
      onPointer,
      onSettingsStorage,
      open,
      openSettings,
      performanceStatsSnapshot,
      performanceTelemetrySnapshot,
      recordRuntimeError,
      refresh,
      registerProvider,
      resetPerformanceTelemetry,
      resetSettings,
      runtimeCoordinatorReadout,
      runtimeErrorReadout,
      toggle,
      notifyEditorReadyFromCompanion,
    },
    lifecycle: {
      addPersistentListener,
      cancelStyleRangeCommitReapply,
      cleanupCodeboxSlotUnclip,
      cleanupInitialSyntaxPaintGate,
      clearCodeboxExternalFrameSettleTimers,
      clearCodeboxStyleSettleTimers,
      clearSnippetSession,
      closeSettings,
      // Write a pending settings change now, and drop the deferred completion update, which would
      // otherwise refresh (and can re-create) the popup after the runtime is removed.
      settlePendingTimers: () => {
        flushPendingSettingsSave();
        clearTimeout(state.completionRepeatPressureLiveUpdateTimer);
        state.completionRepeatPressureLiveUpdateTimer = 0;
        flushPendingFrecencyWrite();
        // A frame of a settings slider that is still pending would write its preview to the
        // editor, or its label to the panel, after the runtime is gone.
        for (const frame of ["settingsRangeLivePreviewRaf", "settingsRangeValueLabelRaf"]) {
          if (!state[frame]) continue;
          try { cancelAnimationFrame(state[frame]); } catch { /* injected timer ref */ }
          state[frame] = 0;
        }
      },
      companionScrollbarTeardown: () => {
        try { companionCodeboxEnlargeRuntime.teardown(); } catch { /* uninstall must finish */ }
        return companionScrollbarRuntime.teardown();
      },
      companionSettleCleanup: companionSettleRuntime.cleanup,
      // Also takes this runtime out of the shared coordinator, which otherwise kept listing it
      // as registered after the uninstall.
      companionInputQuietCleanup: () => {
        companionInputQuietRuntime.cleanup();
        unregisterRuntimeFromCoordinator({ globalRef: W });
      },
      disconnectCodeMirrorSyntaxContentObserver,
      disconnectSourceClassSmartSyntaxObserver,
      installCodeboxPreflightStyle,
      installEditorLifecycleSentinel,
      installInitialSyntaxPaintGate,
      installRootStyleRegistry,
      removeCodeboxExternalFrame,
      removeCodeboxKeyboardContainment,
      removeCodeboxPreflightStyle,
      // On uninstall the roots the plugin styled are cleared of every node it owns, not only of
      // the root style: the cleanup walk does not reach the root of a panel editor, where the
      // popup's host layer was left behind.
      removeCodeboxRootStylesFromAllRoots: (reason) => removeCodeboxRootStylesFromAllRoots(reason, { everyOwnedNode: true }),
      // The popup sits in a host layer that covers the window (state.overlayRoot). Removing the
      // popup left that layer in the editor's root.
      removeOverlay: () => {
        const hostLayer = state.overlayRoot;
        removeOverlay();
        try { if (hostLayer?.id === "nostrodomus-cm-root-overlay-host") hostLayer.remove(); } catch { /* detached node */ }
      },
      removePersistentListeners,
      restoreNativeAutocomplete,
      unhookDispatch,
      uninstallEditorLifecycleSentinel,
      uninstallStyleRootRegistry,
    },
  });

  // Boot-cost probe: split the main-thread cost into CONSTRUCTION
  // (everything above — building + wiring the runtime modules) vs INSTALL (the
  // boot()/install() active work). The completion library is deferred (loads
  // lazily on first editor); a dashboard that never opens an editor never
  // builds the ~184-entry index or registers providers.
  const bootProbePreInstallAt = (W.performance?.now?.() ?? Date.now());

  await publicApiRuntime.boot();

  try {
    const nowMs = (W.performance?.now?.() ?? Date.now());
    const round = (ms) => Math.round(ms * 1000) / 1000;
    if (state.bootCost) {
      state.bootCost.startedAt = bootProbeStartedAt;
      state.bootCost.constructionMs = round(bootProbePreInstallAt - bootProbeStartedAt);
      state.bootCost.installMs = round(nowMs - bootProbePreInstallAt);
      state.bootCost.totalMs = round(nowMs - bootProbeStartedAt);
      state.bootCost.sentinelObservers = state.editorSentinelStats?.observedRoots || 0;
    }
    recordPerformanceEvent("boot-cost", nowMs - bootProbeStartedAt, "install");
  } catch { /* boot-cost probe is diagnostics-only; never break boot */ }
})();

installContextDiagnosticsRuntime({ window, document });
