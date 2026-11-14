/**
 * @param {{
 *   W?: any,
 *   documentRef?: Document,
 *   state?: any,
 *   VERSION?: string,
 *   PROJECT_VERSION?: string,
 *   apiMethods?: Record<string, any>,
 *   lifecycle?: Record<string, any>,
 *   logDebug?: (...args: any[]) => void,
 *   emitStartupBadge?: () => void,
 *   cancelAnimationFrameRef?: ((handle: number) => void) | null,
 * }} [options] injected window/state/api wiring from the main shell
 */
export function createPublicApiRuntime({
  W,
  documentRef,
  state,
  VERSION,
  PROJECT_VERSION,
  apiMethods = {},
  lifecycle = {},
  logDebug = () => {},
  emitStartupBadge = () => {},
  cancelAnimationFrameRef = null,
} = {}) {
  if (!W) throw new TypeError('createPublicApiRuntime requires window object');
  if (!state) throw new TypeError('createPublicApiRuntime requires state');

  let api = null;

  // Install the runtime. The per-editor install functions
  // (installInitialSyntaxPaintGate / installRootStyleRegistry) are already
  // editor-gated: they no-op without an editor, so on an editor-less
  // dashboard this stays cheap (the sentinel, listeners, and one preflight style
  // node). The completion library load is deferred separately (see boot() below).
  function install() {
    lifecycle.installInitialSyntaxPaintGate?.('install');
    lifecycle.installCodeboxPreflightStyle?.('install');
    lifecycle.installEditorLifecycleSentinel?.('install');
    lifecycle.installRootStyleRegistry?.();
    lifecycle.addPersistentListener?.(documentRef, 'pointerdown', apiMethods.onPointer, true, 'document-pointerdown');
    lifecycle.addPersistentListener?.(documentRef, 'focusin', apiMethods.onFocusIn, true, 'document-focusin');
    lifecycle.addPersistentListener?.(documentRef, 'focusout', apiMethods.onFocusOut, true, 'document-focusout');
    lifecycle.addPersistentListener?.(documentRef, 'keydown', apiMethods.onKeydown, true, 'document-keydown');
    if (typeof apiMethods.onSettingsStorage === 'function') {
      lifecycle.addPersistentListener?.(W, 'storage', apiMethods.onSettingsStorage, false, 'window-storage');
    }

    emitStartupBadge();
    logDebug('installed', {
      version: VERSION,
      model: 'HA-dialog settings portal + root/shadow style registry + provider foundation + viewport-aware popup',
      trigger: 'Ctrl+Space',
      debug: 'localStorage.nostrodomusDebug=1',
    });
  }

  function removePublicAliases() {
    try {
      if (W.__nostrodomus === api) delete W.__nostrodomus;
    } catch { /* frozen object */ }
  }

  function uninstall() {
    try { lifecycle.settlePendingTimers?.('uninstall'); } catch { /* uninstall must finish */ }
    lifecycle.cleanupInitialSyntaxPaintGate?.('uninstall');
    lifecycle.removeCodeboxPreflightStyle?.('uninstall');
    lifecycle.uninstallEditorLifecycleSentinel?.('uninstall');
    lifecycle.removePersistentListeners?.('uninstall');
    try { lifecycle.restoreNativeAutocomplete?.('uninstall'); } catch { /* uninstall must finish */ }
    try { lifecycle.removeCodeboxRootStylesFromAllRoots?.('uninstall'); } catch { /* uninstall must finish */ }
    try { lifecycle.cleanupCodeboxSlotUnclip?.('uninstall'); } catch { /* uninstall must finish */ }
    lifecycle.clearCodeboxExternalFrameSettleTimers?.('uninstall');
    lifecycle.removeCodeboxExternalFrame?.();
    lifecycle.removeCodeboxKeyboardContainment?.('uninstall');
    state.codeboxFrameEventsInstalled = false;
    try { cancelAnimationFrameRef?.(state.raf); } catch { /* injected timer ref */ }
    lifecycle.unhookDispatch?.();
    lifecycle.removeOverlay?.();
    lifecycle.clearSnippetSession?.();
    lifecycle.closeSettings?.(false);
    state.enabled = false;
    lifecycle.uninstallStyleRootRegistry?.('uninstall');
    if (state.codeboxStyleReapplyRaf) { try { cancelAnimationFrameRef?.(state.codeboxStyleReapplyRaf); } catch { /* injected timer ref */ } state.codeboxStyleReapplyRaf = 0; }
    if (state.diagnosticsRefreshRaf) { try { cancelAnimationFrameRef?.(state.diagnosticsRefreshRaf); } catch { /* injected timer ref */ } state.diagnosticsRefreshRaf = 0; }
    state.diagnosticsPendingReasons?.clear?.();
    lifecycle.clearCodeboxStyleSettleTimers?.();
    lifecycle.cancelStyleRangeCommitReapply?.('uninstall');
    lifecycle.disconnectCodeMirrorSyntaxContentObserver?.('uninstall');
    lifecycle.disconnectSourceClassSmartSyntaxObserver?.('uninstall');
    try { state.styleMutationObserver?.takeRecords?.(); } catch { /* injected observer */ }
    try { state.styleMutationObserver?.disconnect?.(); } catch { /* injected observer */ }
    state.styleMutationObserver = null;
    state.styleMutationEditor = null;
    if (state.observerStats) state.observerStats.styleMutationGuardTargets = 0;
    try { lifecycle.companionSettleCleanup?.('uninstall'); } catch { /* uninstall must finish */ }
    try { lifecycle.companionScrollbarTeardown?.('uninstall'); } catch { /* uninstall must finish */ }
    try { lifecycle.companionInputQuietCleanup?.('uninstall'); } catch { /* uninstall must finish */ }

    removePublicAliases();
    logDebug('uninstalled');
  }

  api = {
    installed: true,
    version: VERSION,
    state,
    open: apiMethods.open,
    close: apiMethods.close,
    toggle: apiMethods.toggle,
    refresh: apiMethods.refresh,
    settings: apiMethods.openSettings,
    debug: apiMethods.debug,
    debugSnapshot: apiMethods.debugSnapshot,
    health: apiMethods.health,
    exportDiagnostics: apiMethods.exportDiagnostics,
    performanceTelemetry: apiMethods.performanceTelemetrySnapshot,
    performanceStats: apiMethods.performanceStatsSnapshot,
    observerLifecycle: apiMethods.observerLifecycleReadout,
    observerLifecycleCloseBindingReadiness: apiMethods.observerLifecycleCloseBindingReadiness,
    observerLifecycleCloseDryRun: apiMethods.observerLifecycleCloseDryRunReadout,
    observerLifecycleCloseDryRunProbe: apiMethods.observerLifecycleCloseDryRunProbe,
    observerLifecycleCloseDryRunListener: apiMethods.observerLifecycleCloseDryRunListenerReadout,
    observerLifecycleCloseDryRunListenerProbe: apiMethods.observerLifecycleCloseDryRunListenerProbe,
    disconnectAllNostrodomusObservers: apiMethods.disconnectAllNostrodomusObservers,
    runtimeErrors: apiMethods.runtimeErrorReadout,
    embeddedLanguageDiagnostics: apiMethods.embeddedLanguageDiagnostics,
    clearRuntimeErrors: apiMethods.clearRuntimeErrors,
    recordRuntimeError: apiMethods.recordRuntimeError,
    clientCapabilities: apiMethods.clientCapabilitySnapshot,
    resetPerformanceTelemetry: apiMethods.resetPerformanceTelemetry,
    notifyEditorReady: apiMethods.notifyEditorReadyFromCompanion,
    runtimeCoordinator: apiMethods.runtimeCoordinatorReadout,
    copyDiagnosticsToClipboard: apiMethods.copyDiagnosticsToClipboard,
    resetSettings: apiMethods.resetSettings,
    registerProvider: apiMethods.registerProvider,
    uninstall,
    disable: uninstall,
    rebuildIndex: apiMethods.buildIndex,
  };

  function installPublicAliases() {
    W.__nostrodomus = api;
    return api;
  }

  async function boot() {
    installPublicAliases();
    // The completion library is not loaded eagerly. It builds the index and
    // registers providers (real memory), and a dashboard that never opens an
    // editor never needs it. `open()` awaits `loadLibrary()` lazily on first
    // use, so completion still works on first Ctrl+Space; an editor-less
    // dashboard just never pays for it. Callers that need the full surface
    // synchronously (e.g. the contract runner) call `__nostrodomus.open()`
    // once to trigger the load.
    install();
    return api;
  }

  return {
    api,
    boot,
    install,
    installPublicAliases,
    removePublicAliases,
    uninstall,
    version: PROJECT_VERSION,
  };
}
