import test from 'node:test';
import assert from 'node:assert/strict';

import { createPublicApiRuntime } from '../../src/core/publicApiRuntime.js';

// The codebox style mutation guard observer
// (state.styleMutationObserver, installed by installCodeboxStyleMutationGuard) was
// never disconnected by uninstall(), so a post-uninstall class/style toggle on a
// still-open editor re-ran the reapply lane and re-installed pieces of the runtime.
// Harness mirrors tests/core/public_api_uninstall_companion_teardown.test.mjs.
function buildRuntime(stateExtra = {}) {
  const noop = () => {};
  const state = { raf: 0, diagnosticsPendingReasons: new Set(), ...stateExtra };
  const lifecycle = {
    installInitialSyntaxPaintGate: noop, installCodeboxPreflightStyle: noop,
    installEditorLifecycleSentinel: noop, installRootStyleRegistry: noop, addPersistentListener: noop,
    cleanupInitialSyntaxPaintGate: noop, removeCodeboxPreflightStyle: noop,
    uninstallEditorLifecycleSentinel: noop, removePersistentListeners: noop,
    removeCodeboxRootStylesFromAllRoots: noop, cleanupCodeboxSlotUnclip: noop,
    clearCodeboxExternalFrameSettleTimers: noop, removeCodeboxExternalFrame: noop,
    removeCodeboxKeyboardContainment: noop, unhookDispatch: noop, removeOverlay: noop,
    clearSnippetSession: noop, closeSettings: noop, uninstallStyleRootRegistry: noop,
    clearCodeboxStyleSettleTimers: noop, disconnectCodeMirrorSyntaxContentObserver: noop,
    disconnectSourceClassSmartSyntaxObserver: noop,
    companionSettleCleanup: noop, companionScrollbarTeardown: noop,
  };
  const runtime = createPublicApiRuntime({
    W: {}, documentRef: { nodeType: 9 },
    state,
    VERSION: 'v', PROJECT_VERSION: '0',
    apiMethods: {
      open: noop, close: noop, toggle: noop, refresh: noop, openSettings: noop,
      debug: () => ({}), health: () => ({}), runtimeCoordinatorReadout: () => ({}),
      onPointer: noop, onFocusIn: noop, onFocusOut: noop, onKeydown: noop,
    },
    lifecycle, logDebug: noop, emitStartupBadge: noop, cancelAnimationFrameRef: noop,
  });
  return { runtime, state };
}

test('uninstall disconnects the style mutation guard observer', () => {
  const observer = {
    takeRecords() { this.drained = true; return []; },
    disconnect() { this.disconnected = true; },
  };
  const { runtime, state } = buildRuntime({
    styleMutationObserver: observer,
    styleMutationEditor: {},
    observerStats: { styleMutationGuardTargets: 3 },
  });

  runtime.api.uninstall();

  assert.equal(observer.disconnected, true, 'uninstall must disconnect the mutation guard');
  assert.equal(state.styleMutationObserver, null);
  assert.equal(state.styleMutationEditor, null);
  assert.equal(state.observerStats.styleMutationGuardTargets, 0);
});

test('uninstall stays clean when no mutation guard was ever installed', () => {
  const { runtime, state } = buildRuntime();
  runtime.api.uninstall();
  assert.equal(state.styleMutationObserver ?? null, null);
});
