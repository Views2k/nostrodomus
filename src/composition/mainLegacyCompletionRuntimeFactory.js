import { createCompletionRuntime } from '../completion/completionRuntime.js';
import { createCompletionInsertionRuntime } from '../completion/insertionRuntime.js';
import { createScoringRuntime } from '../completion/scoringRuntime.js';
import { createSuggestionQualityRuntime } from '../completion/suggestionQualityRuntime.js';
import { renderCompletionPopup } from '../completion/popupRuntime.js';
import {
  createCompletionInsertionRuntimeDelegates,
  createCompletionRuntimeDelegates,
  createScoringRuntimeDelegates,
  createSuggestionQualityRuntimeDelegates,
} from './runtimeDelegateBridge.js';

/**
 * @param {{
 *   state?: any,
 *   identity?: Record<string, any>,
 *   suggestionQuality?: Record<string, any>,
 *   scoring?: Record<string, any>,
 *   insertion?: Record<string, any>,
 *   completion?: Record<string, any>,
 * }} [options] dependency groups injected by the main shell
 */
export function createMainLegacyCompletionRuntimeGroup({
  state,
  identity = {},
  suggestionQuality = {},
  scoring = {},
  insertion = {},
  completion = {},
} = {}) {
  let completionRuntime = null;
  const completionRuntimeDelegates = createCompletionRuntimeDelegates(() => completionRuntime);
  const { render, compute, refresh, requestLiveUpdate, open, toggle, onKeydown, onPointer, onFocusIn, onFocusOut } = completionRuntimeDelegates;

  const suggestionQualityRuntime = createSuggestionQualityRuntime({
    state,
    version: identity.VERSION,
    projectVersion: identity.PROJECT_VERSION,
    providerSummary: suggestionQuality.providerSummary,
    contextRouteLabel: suggestionQuality.contextRouteLabel,
    itemDetail: suggestionQuality.itemDetail,
    updateSuggestionQualityPanel: suggestionQuality.updateSuggestionQualityPanel,
    payloadWanted: suggestionQuality.payloadWanted,
  });
  const { suggestionQualityPayload, recordSuggestionQuality } = createSuggestionQualityRuntimeDelegates(() => suggestionQualityRuntime);

  const scoringRuntime = createScoringRuntime({
    state,
    ensureProviderSettings: scoring.ensureProviderSettings,
    providerCandidates: scoring.providerCandidates,
    runtimeData: scoring.runtimeData,
    recordSuggestionQuality,
  });
  const { allowType, runtimeDomainPriority, contextualPenalty, hasFocusedContextProviderItems, itemMatchesYamlValueKind, focusKindTypeBoost, semanticItemRank, modeRank, shouldSuppressStaticForFocusedContext, scoreItems, camelMatch } = createScoringRuntimeDelegates(() => scoringRuntime);

  const completionInsertionRuntime = createCompletionInsertionRuntime({
    state,
    getDocLength: insertion.getDocLength,
    looksLikeView: insertion.looksLikeView,
    recordRuntimeError: insertion.recordRuntimeError,
    closeCompletion: insertion.closeCompletion,
    openCompletion: open,
    isViewAllowed: insertion.isViewAllowed,
    scheduleFrame: insertion.scheduleFrame,
    now: insertion.now,
    // Forward the host's accept recorder (wraps the frecency persist); falls back to scoring's default.
    recordRecentAcceptedCompletion: insertion.recordRecentAcceptedCompletion,
    suppressMs: insertion.suppressMs ?? 260,
    maxContinuationAttempts: insertion.maxContinuationAttempts ?? 3,
  });
  const { clearSnippetSession, moveSnippetPlaceholder, updateSnippetSessionAfterDispatch, insertItem } = createCompletionInsertionRuntimeDelegates(() => completionInsertionRuntime);

  completionRuntime = createCompletionRuntime({
    state,
    documentRef: completion.documentRef,
    cancelAnimationFrame: completion.cancelAnimationFrame,
    requestAnimationFrame: completion.requestAnimationFrame,
    clearTimeout: completion.clearTimeout,
    setTimeout: completion.setTimeout,
    now: completion.now,
    renderCompletionPopup,
    ensureOverlay: completion.ensureOverlay,
    placeAtCursor: completion.placeAtCursor,
    popupIsOpen: completion.popupIsOpen,
    closePopup: completion.closePopup,
    measurePerformanceEvent: completion.measurePerformanceEvent,
    getDoc: completion.getDoc,
    getPos: completion.getPos,
    detectContext: completion.detectContext,
    runtimeSnapshot: completion.runtimeSnapshot,
    scoreItems,
    updateContextInspectorPanel: completion.updateContextInspectorPanel,
    updateSuggestionQualityPanel: completion.updateSuggestionQualityPanel,
    recordRuntimeError: completion.recordRuntimeError,
    recordRuntimeErrorOnce: completion.recordRuntimeErrorOnce,
    isViewAllowed: completion.isViewAllowed,
    loadLibrary: completion.loadLibrary,
    logDebug: completion.logDebug,
    openSettings: completion.openSettings,
    preserveScrollDuring: completion.preserveScrollDuring,
    editorDispatchRepeatPressureActive: completion.editorDispatchRepeatPressureActive,
    recordPerformanceEvent: completion.recordPerformanceEvent,
    closeSettings: completion.closeSettings,
    clearSnippetSession,
    moveSnippetPlaceholder,
    insertItem,
    isScopedEditorEvent: completion.isScopedEditorEvent,
    isNostrodomusUiEvent: completion.isNostrodomusUiEvent,
    rememberView: completion.rememberView,
    pathHasEditorSurface: completion.pathHasEditorSurface,
    pageMayHaveEditor: completion.pageMayHaveEditor,
    scheduleCodeboxStyleReapply: completion.scheduleCodeboxStyleReapply,
    observerLifecycleCloseDryRunListenerProbe: completion.observerLifecycleCloseDryRunListenerProbe,
  });

  return {
    allowType,
    camelMatch,
    clearSnippetSession,
    completionInsertionRuntime,
    completionRuntime,
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
    recordSuggestionQuality,
    refresh,
    render,
    requestLiveUpdate,
    runtimeDomainPriority,
    scoringRuntime,
    scoreItems,
    semanticItemRank,
    shouldSuppressStaticForFocusedContext,
    suggestionQualityPayload,
    suggestionQualityRuntime,
    toggle,
    updateSnippetSessionAfterDispatch,
  };
}
