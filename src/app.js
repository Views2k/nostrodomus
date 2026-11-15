import {
  FRECENCY_WRITE_KEY,
  PRODUCT_NAME,
  PROJECT_RELEASE_STATE,
  PROJECT_VERSION,
  SETTINGS_WRITE_KEY,
  VERSION,
} from './core/version.js';
// The accept store lives in scoring.js, which does no storage access; it is read and written here.
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
import { createCompanionStyleRuntime } from './companion/companionStyleRuntime.js';
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
  createAppCompletionPopupAdapters,
  createAppProviderAdapters,
  createAppCompanionAdapters,
  createAppDiagnosticsAdapters,
  createAppDiagnosticsSchedulerAdapters,
  createAppRuntimeErrorAdapters,
  createAppSettingsAdapters,
  createAppSettingsElementAdapters,
  createAppSettingsPersistenceAdapters,
  createAppSyntaxPresetAdapters,
} from './composition/appAdapters.js';
import { createAppSettingsPanelRuntime } from './composition/appRuntimeFactories.js';
import { createAppCompletionRuntimeGroup } from './composition/appCompletionRuntimeFactory.js';
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
import * as readoutHelpers from './diagnostics/diagnosticsReadoutHelpers.js';
import {
  measurePerformanceEventWithCallbacks,
  shouldRecordPerformanceTelemetryDecision,
} from './diagnostics/diagnosticsReadoutHelpers.js';
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
import { createDiagnosticsRuntime } from './diagnostics/diagnosticsRuntime.js';
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
import {
  completionVisualKind,
  itemDetail,
  itemDocumentation,
  itemSourceLabel,
} from './ui/suggestionPopup.js';
import { dashboardActionBranchState } from './yaml/runtimeContextAdapter.js';

(async () => {
  const W = /** @type {any} */ (window);
  // Start of the boot, for the boot-cost readout (state.bootCost).
  const bootProbeStartedAt = (W.performance?.now?.() ?? Date.now());
  // Reading the store off the window throws when the browser blocks site data for this page.
  // The settings and diagnostics code works without a store: default settings, nothing saved.
  let settingsStorage = null;
  try { settingsStorage = W?.["local" + "Storage"] || null; } catch { settingsStorage = null; }
  // Shared with the companion layers through window.__nostrodomusRuntimeCoordinatorV1.
  const runtimeCoordinator = installRuntimeCoordinator(W, {
    id: "main-completion-runtime",
    role: "completion-runtime",
    version: VERSION,
    projectVersion: PROJECT_VERSION,
  });
  // Companion scrollbar styling layer. Built here so the editor-ready hook can reach it;
  // applyForEditor does nothing while the companion layer is dormant or external.
  const companionStyleRuntime = createCompanionStyleRuntime({
    globalRef: W,
    // "Hide editor warnings" (style.hideEditorWarnings, off by default): when on, the warning-hide
    // sheet is added; when off it is removed, so Home Assistant's validation errors stay visible.
    // Read on each apply.
    hideEditorWarnings: () => state.settings?.style?.hideEditorWarnings === true,
    replaceNativeAutocomplete: () => state.settings?.replaceNativeAutocomplete !== false,
    // "Glass editor dialog" (style.glassDialog, on by default): the glass sheet is kept in the card
    // editor dialog while it is on. Read on each apply; the Style checkbox re-applies the layer.
    glassDialog: () => state.settings?.style?.glassDialog !== false,
    // The dialog shows a visual editor again: the dialog body gets back the overflow that was
    // changed for the codebox glow, so the dialog scrolls the way Home Assistant laid it out.
    // The style pass sets it again when the code editor returns.
    onMainEditorLeft: () => { try { cleanupCodeboxSlotUnclip("main-editor-left"); } catch { /* the overflow stays as the codebox set it */ } },
  });
  // Typing-quiet window. editorDispatchRuntime marks the coordinator's 'editor-input' channel
  // during fast typing; this runtime reads it. deferDuringTyping returns false (run now) while
  // the companion layer is dormant or external.
  const companionInputQuietRuntime = createInputQuietRuntime({ globalRef: W });
  // Codebox sizing, which remembers whether the dialog shows a simple or a tabbed editor. Gated by
  // companionLayerActive. It owns the inline heights of the CodeMirror elements; the main style
  // pass leaves them alone.
  const companionCodeboxEnlargeRuntime = createCodeboxEnlargeRuntime({
    globalRef: W,
    // The height cap of editors outside the card dialog follows the setting that finds them.
    universalCodeboxEnabled: () => state.settings?.style?.universalCodebox !== false,
  });
  // Re-fit the card dialog's main codebox to the space it actually has. Runs on each settle
  // pass and on window resize: one layout read, and a write only when the fit changed.
  const refitActiveCodebox = () => {
    try {
      const editor = state.activeEditorCache?.editor || null;
      if (editor?.isConnected) companionCodeboxEnlargeRuntime.refitForEditor(editor);
    } catch { /* sizing never breaks the settle pass */ }
  };
  let codeboxRefitResizeFrame = 0;
  const refitActiveCodeboxOnResize = () => {
    if (codeboxRefitResizeFrame) return;
    const frame = W.requestAnimationFrame?.bind?.(W);
    if (typeof frame !== "function") { refitActiveCodebox(); return; }
    codeboxRefitResizeFrame = frame(() => { codeboxRefitResizeFrame = 0; refitActiveCodebox(); });
  };
  // Picker visual fix. Off by default; when the companion layer is active it applies outside the
  // typing-quiet window and records one pair of performance marks. Its pointerdown and focusin
  // triggers do not intercept events and are attached below, after the installed check.
  const companionPickerStyleRuntime = createPickerStyleRuntime({
    globalRef: W,
    deferDuringTyping: (reason, applyFn) => companionInputQuietRuntime.deferDuringTyping(reason, applyFn),
    recordMark: (label) => { try { W.performance?.mark?.(label); } catch { /* perf marks optional */ } },
  });
  const companionPickerApply = () => { try { companionPickerStyleRuntime.apply(); } catch { /* picker styling is optional */ } };
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
  const { codeboxFrameHostForEditor, codeboxComposedParent, removeCodeboxExternalFrame, scheduleCodeboxExternalFrameSettleSync, clearCodeboxExternalFrameSettleTimers, syncCodeboxExternalFrame, scheduleCodeboxExternalFrameSync, removeCodeboxKeyboardContainment, eventPathHasCodeboxEditor, shouldContainCodeboxKeyEvent, installCodeboxKeyboardContainment } = codeboxFrameDelegates;

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

  // Settle engine: runs scheduleCodeboxStyleReapply from observers on the home root and the dialog
  // and from a 2800 ms ladder of timed passes, at most once a frame, and skips mutation passes
  // while the user types. The card dialog keeps changing its layout after the editor is found,
  // so one pass at detection is not enough. Does nothing while the companion layer is dormant or
  // external.
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
    markTyping: (reason) => { try { companionInputQuietRuntime.markEditorInputQuiet(reason); } catch { /* the quiet mark is optional */ } },
    isNostrodomusUiEvent: (ev) => { try { return isNostrodomusUiEvent(ev); } catch { return false; } },
    eventIsInsideCodeMirror: (ev) => { try { return companionInputQuietRuntime.isCodeMirrorEvent(ev); } catch { return false; } },
    recordPerformanceEvent,
    shadowHostSelector: OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR,
  });
  const diagnosticsDelegates = createDiagnosticsRuntimeDelegates(() => diagnosticsRuntime);
  const { providerSummaryLegacy, providerSummary, itemSummary, debugSnapshot, health, embeddedLanguageDiagnostics, exportDiagnostics, copyDiagnosticsToClipboard, diagnosticValue, diagnosticCard, settingsStorageStatus, systemStatusCard, formatPerformanceEventMetric, performanceDiagnosticsCard, activeContextDiagnosticsSection, contextRouteLabel, contextInspectorPayload, contextInspectorRows, contextInspectorCard, suggestionQualityRows, suggestionQualityCard, diagnosticsReasonIsInteractive, diagnosticsSnapshotSignature, shouldFlushDiagnosticsRefresh, flushDiagnosticsRefresh, refreshContextInspectorPanel, stopContextInspectorHeartbeat, startContextInspectorHeartbeat, updateContextInspectorPanel, updateSuggestionQualityPanel, refreshSuggestionQualityPanel, providerStatusText, updateProviderControlCard, providerControlsMarkup, contextInspectorMarkup, changelogSummaryText, diagnosticsMarkup } = diagnosticsDelegates;

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
    startupBadgeStatusFromHealth: readoutHelpers.startupBadgeStatusFromHealth,
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

  const runtimeErrorAdapters = createAppRuntimeErrorAdapters({
    getRuntimeErrorRuntime: () => runtimeErrorRuntime,
    debugLoggingEnabled,
  });
  const { clearRuntimeErrors } = runtimeErrorAdapters;

  if (W.__nostrodomus?.installed) {
    logDebug("already installed");
    return;
  }

  // The settle engine boots after the installed check: a second load of the resource returns
  // above, before it could add observers and listeners that no uninstall would reach.
  try { companionSettleRuntime.boot('install'); } catch { /* the settle engine never stops the boot */ }

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
    // Defined further down; read when a reset runs.
    applyCompanionEditorLayer: editor => applyCompanionEditorLayer(editor),
    recordRuntimeErrorOnce,
    structuredCloneRef: globalThis.structuredClone?.bind?.(globalThis),
  });

  const settingsPersistenceAdapters = createAppSettingsPersistenceAdapters({
    getSettingsRuntime: () => settingsRuntime,
    setLoadedSettingsStorageKey: key => { loadedSettingsStorageKey = key; },
  });
  const { loadSettings, resetSettings } = settingsPersistenceAdapters;

  const settingsAdapters = createAppSettingsAdapters({
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
  const companionAdapters = createAppCompanionAdapters({
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

  const syntaxPresetAdapters = createAppSyntaxPresetAdapters({
    getSyntaxRuntime: () => syntaxRuntime,
    installCodeMirrorSourceClassSyntax,
  });
  const { applyTextColorPreset } = syntaxPresetAdapters;

  const state = createRuntimeState({ version: VERSION, settings: loadSettings() });
  persistentListenersRuntime = createPersistentListenersRuntime({
    state,
    recordPerformanceEvent,
  });
  // Companion picker triggers, in the persistent-listener registry so uninstall removes them.
  // Attached after the installed check, so a second load of the resource adds no second pair.
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

  // "Hide editor warnings" for the open card dialog, also when it shows the visual editor and has
  // no CodeMirror. Does nothing, and walks nothing, when the setting is off and no sheet was added.
  const applyEditorWarningHide = () => {
    try { companionStyleRuntime.applyEditorWarningHide(activeEditorWarningSurface()); } catch { /* the warning sheet is optional */ }
  };
  // The companion-layer hook. Both the active-editor cache (rememberActiveCodeboxEditor, which every
  // discovery path goes through, initialSyntaxPaintGate included) and the editor sentinel call it;
  // applyForEditor does nothing when its nodes are already there. settingsOpen keeps a simple
  // editor from being measured as tabbed while the Nostrodomus settings panel is open.
  const applyCompanionEditorLayer = (editor) => {
    companionStyleRuntime.applyForEditor(editor);
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

  const diagnosticsAdapters = createAppDiagnosticsAdapters({ W, performanceTelemetrySnapshot });
  const { runtimeCoordinatorReadout, companionLayerReadout, incrementMapCounter, evaluatePerformanceBudgets } = diagnosticsAdapters;

  const completionPopupAdapters = createAppCompletionPopupAdapters({
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
        companionWarningObservers: companionStyleRuntime.warningObserverCount(),
        companionLayoutObservers: companionCodeboxEnlargeRuntime.layoutObserverCount(),
      };
    },
    disconnectCompanionObservers: () => {
      companionSettleRuntime.cleanup();
      companionStyleRuntime.disconnectWarningObservers();
      companionCodeboxEnlargeRuntime.stopWatchingLayout();
    },
  });

  observerLifecycleDisconnectAll = observerLifecycleRuntime.disconnectAllNostrodomusObservers;


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
  const { providerCandidates } = createAppProviderAdapters({
    getProviderRuntime: () => providerRuntime,
    recordRuntimeErrorOnce,
  });

  const runtimeContextRuntime = createRuntimeContextRuntime({
    state,
    recordRuntimeErrorOnce,
    runtimeData,
  });
  const { detectContextFallback, detectContext } = createRuntimeContextRuntimeDelegates(() => runtimeContextRuntime);

  // Frecency store: read once at boot from FRECENCY_WRITE_KEY (a value that does not parse is
  // recorded as a runtime error, one of another shape is ignored), and written 1.5 s after an
  // accept, only while completions.frecency is on. With the setting off nothing is written.
  const frecencyStorage = () => { try { return W?.["local" + "Storage"]; } catch { return null; } };
  try {
    const rawFrecency = frecencyStorage()?.getItem?.(FRECENCY_WRITE_KEY);
    if (rawFrecency) {
      const parsedFrecency = JSON.parse(rawFrecency);
      if (parsedFrecency && parsedFrecency.v === 1 && Array.isArray(parsedFrecency.entries)) {
        // snapshot() lists the oldest entry first: keep the newest 50, as the store itself does.
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
  // A write that is still pending when the page goes away or the runtime is removed is made at once.
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
  } = createAppCompletionRuntimeGroup({
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
      // An accept also schedules the frecency write, which does nothing unless the setting is on.
      // Ranking and the write use the same shared store.
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
      // The cached Home Assistant data, for the lazyResolve detail of the highlighted row and the
      // signatureHelp tip. The popup reads it only while one of those settings is on.
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
      // The state gives the scope check the universalCodebox and universalAutocomplete settings,
      // which decide whether panel editors outside the card dialog are in scope.
      isScopedEditorEvent: (ev) => isScopedEditorEvent(ev, { state }),
      isNostrodomusUiEvent,
      rememberView,
      pathHasEditorSurface: pathHasEditorSurface,
      pageMayHaveEditor: (ev) => activeEditor.pageMayHaveEditor(ev, { state, window: W }),
      scheduleCodeboxStyleReapply,
      observerLifecycleCloseDryRunListenerProbe,
    },
  });

  const diagnosticsSchedulerAdapters = createAppDiagnosticsSchedulerAdapters({
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
    state,
    cancelAnimationFrame: W.cancelAnimationFrame?.bind?.(W) || globalThis.cancelAnimationFrame?.bind?.(globalThis),
    setTimeout: W.setTimeout?.bind?.(W) || globalThis.setTimeout?.bind?.(globalThis),
    clearTimeout: W.clearTimeout?.bind?.(W) || globalThis.clearTimeout?.bind?.(globalThis),
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

  settingsPanelRuntime = createAppSettingsPanelRuntime({
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

  const settingsElementAdapters = createAppSettingsElementAdapters({ documentRef: document });
  const { createSettingsElement, appendChildren, settingsTitle } = settingsElementAdapters;

  // Settings saved or reset in another tab or window of the same browser are loaded here, so the
  // next save in this tab does not write older settings back over them.
  function onSettingsStorage(event) {
    try {
      // The debug and perf flags are cached for a second; a change from another tab applies now.
      loggingRuntime.refreshStorageFlags(event);
      if (!event || event.key !== SETTINGS_WRITE_KEY) return;
      // newValue is null when the other tab reset the settings; loading then gives the defaults.
      const stored = typeof event.newValue === "string" ? event.newValue : "";
      if (stored && stored === state.settingsLastSerialized) return;
      state.settings = loadSettings();
      state.settingsLastSerialized = stored;
      scheduleCodeboxStyleReapply("settings-storage-sync");
      // The warning and glass sheets follow the loaded values only through the companion layer.
      try { applyCompanionEditorLayer(state.activeEditorCache?.editor); } catch (err) { recordRuntimeErrorOnce("settings:storage-sync-companion-layer", err, { phase: "onSettingsStorage" }); }
      if (state.settingsPanel?.isConnected) {
        closeSettings(false);
        openSettings();
      }
    } catch (err) {
      recordRuntimeErrorOnce("settings:storage-sync", err, { phase: "onSettingsStorage" });
    }
  }

  // The panel shell looks up the portal root itself when it builds the panel.
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
    diagnosticsReasonIsInteractive: readoutHelpers.diagnosticsReasonIsInteractive,
    diagnosticsRuntimeErrorFallback,
    displayBrowserLabel,
    displayMemoryLabel,
    displayViewportLabel,
    document,
    ensureProviderSettings,
    formatPerformanceEventMetric: readoutHelpers.formatPerformanceEventMetric,
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

  // The shadow roots, as {root, label}, that the sentinel observes while an editor opens. A panel's
  // ha-code-editor sits below several shadow boundaries (ha-code-editor < ha-yaml-editor < ... <
  // ha-automation-editor) that a MutationObserver cannot cross, so each wrapper's shadow root is
  // observed; the .cm-editor mount then runs a callback before the first paint and the editor is
  // styled before it is shown. The dashboard raw configuration editor (hui-editor) is not on a
  // panel editor route and is found by the timed probes instead.
  function panelEditorObservationRoots() {
    if (state.settings?.style?.universalCodebox === false) return [];
    const out = [];
    const seen = new Set();
    const add = (el, label) => { if (el?.shadowRoot && !out.some(e => e.root === el.shadowRoot)) out.push({ root: el.shadowRoot, label }); };

    // Panel editors: on automation, script and Developer Tools editor routes, walk down to the
    // panel's ha-code-editor.
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
      try { walk(homeRoot() || document, 0); } catch { /* a root removed during the walk is skipped */ }
    }

    // Card dialog: the nested editor-host shadow roots, so a codebox that mounts deep in the dialog
    // (a stack card's sub-card YAML editor, behind hui-stack-card-editor) is styled before its first
    // paint as well. The walk only enters OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR hosts, is depth
    // capped, and starts from editCardDialogCandidates(), which also covers the 2026.6 dialog while it
    // opens at zero size and activeEditDialog() is still null.
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
      try { dialogWalk(dialogRoot, 0); } catch { /* a root removed during the walk is skipped */ }
    }

    return out;
  }

  // Every ha-code-editor host on the active surface, so Home Assistant's own autocomplete can be
  // turned off in each of them. Reuses the walk of panelEditorObservationRoots, which includes each
  // ha-code-editor's own shadow root: root.host is the editor element. A root that cannot be read is
  // skipped.
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
    // Probes after a page change follow the same setting as the discovery of panel editors.
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
    // The same hook the active-editor cache calls; a second call for one editor does nothing.
    applyCompanionEditorLayer,
    panelEditorObservationRoots: () => panelEditorObservationRoots(),
    // Called by probes that find no editor, which covers a card dialog on the visual editor tab.
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
        // The end of a typing session schedules a syntax pass on the editor.
        clearTimeout(state.typingSessionExitTimer);
        state.typingSessionExitTimer = 0;
        // A frame of a settings slider that is still pending would write its preview to the
        // editor, or its label to the panel, after the runtime is gone.
        for (const frame of ["settingsRangeLivePreviewRaf", "settingsRangeValueLabelRaf"]) {
          if (!state[frame]) continue;
          try { cancelAnimationFrame(state[frame]); } catch { /* injected timer ref */ }
          state[frame] = 0;
        }
        // A pending source-class refresh would repaint the open editors.
        if (state.sourceClassSyntaxRefreshRaf) {
          try { cancelAnimationFrame(state.sourceClassSyntaxRefreshRaf); } catch { /* injected timer ref */ }
          state.sourceClassSyntaxRefreshRaf = 0;
        }
        // A refit still waiting for its frame after a window resize would size the codebox again.
        if (codeboxRefitResizeFrame) {
          try { W.cancelAnimationFrame?.(codeboxRefitResizeFrame); } catch { /* injected timer ref */ }
          codeboxRefitResizeFrame = 0;
        }
        // A selector self-check that is still waiting would walk the page after the runtime is gone.
        selectorSeamProbeRuntime.cancel();
      },
      companionScrollbarTeardown: () => {
        try { companionCodeboxEnlargeRuntime.teardown(); } catch { /* uninstall must finish */ }
        return companionStyleRuntime.teardown();
      },
      companionSettleCleanup: companionSettleRuntime.cleanup,
      // Also takes this runtime out of the shared coordinator's list of registered runtimes.
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
      // On uninstall every node the plugin owns is removed from the roots it styled, not only the
      // root style: the popup's host layer can sit in a panel editor's root, which the cleanup walk
      // does not reach.
      removeCodeboxRootStylesFromAllRoots: (reason) => removeCodeboxRootStylesFromAllRoots(reason, { everyOwnedNode: true }),
      // The popup sits in a host layer that covers the window (state.overlayRoot), which is removed too.
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

  // Boot-cost probe: split the main-thread cost into construction (building and wiring the
  // runtime modules above) and install (boot() below). The completion library loads on the first
  // editor, so a dashboard that never opens one never builds the index or registers providers.
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
