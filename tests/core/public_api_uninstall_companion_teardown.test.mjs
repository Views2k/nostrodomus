import test from 'node:test';
import assert from 'node:assert/strict';

import { createPublicApiRuntime } from '../../src/core/publicApiRuntime.js';

// uninstall() must tear down the companion sublayers.
// (i)  companion settle: dialog/home MutationObservers + capture-phase listeners + timers.
// (ii) companion scrollbar: the warning-badge reapply MutationObservers (warningReapplyObservers).
// Both teardowns existed but had no call site reachable from uninstall(), so they survived
// uninstall and kept observing / arming timers. This file asserts each delegate is invoked
// exactly once on uninstall.
function buildRuntime(lifecycleExtra) {
  const noop = () => {};
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
    ...lifecycleExtra,
  };
  return createPublicApiRuntime({
    W: {}, documentRef: { nodeType: 9 },
    state: { raf: 0, diagnosticsPendingReasons: new Set() },
    VERSION: 'v', PROJECT_VERSION: '0',
    apiMethods: {
      open: noop, close: noop, toggle: noop, refresh: noop, openSettings: noop,
      debug: () => ({}), health: () => ({}), runtimeCoordinatorReadout: () => ({}),
      onPointer: noop, onFocusIn: noop, onFocusOut: noop, onKeydown: noop,
    },
    lifecycle, logDebug: noop, emitStartupBadge: noop, cancelAnimationFrameRef: noop,
  });
}

test('uninstall tears down the companion settle sublayer (1B-i)', () => {
  let cleaned = 0;
  buildRuntime({ companionSettleCleanup: () => { cleaned += 1; } }).api.uninstall();
  assert.equal(cleaned, 1, 'uninstall must call companionSettleCleanup exactly once');
});

test('uninstall tears down the companion scrollbar warning observers (1B-ii)', () => {
  let torn = 0;
  buildRuntime({ companionScrollbarTeardown: () => { torn += 1; } }).api.uninstall();
  assert.equal(torn, 1, 'uninstall must call companionScrollbarTeardown exactly once');
});

test('uninstall cancels the companion input-quiet flush timer', () => {
  let cleaned = 0;
  buildRuntime({ companionInputQuietCleanup: () => { cleaned += 1; } }).api.uninstall();
  assert.equal(cleaned, 1, 'uninstall must call companionInputQuietCleanup exactly once');
});
