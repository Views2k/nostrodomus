import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createPublicApiRuntime } from '../../src/core/publicApiRuntime.js';
import { createCodeboxStyleSettle } from '../../src/ui/codebox/codeboxStyleSettle.js';

// uninstall cancels the 180ms style-range commit timer (armed on slider release) through the settle
// module's own canceller, which also records the cancel in diagnostics. clearCodeboxStyleSettleTimers
// sweeps only the settle-cascade Set, and the syntax half of the commit callback is not behind the
// enabled gate, so a timer left running after a syntax slider release would re-inject the
// source-class style node and re-install the smart-syntax observer that uninstall had just
// disconnected. The harness mirrors tests/core/public_api_uninstall_style_mutation_teardown.test.mjs.
function buildRuntime(state, lifecycleExtra = {}) {
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
    companionSettleCleanup: noop, companionScrollbarTeardown: noop,
    ...lifecycleExtra,
  };
  return createPublicApiRuntime({
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
}

test('uninstall cancels the pending style-range commit timer', () => {
  const clearTimeoutCalls = [];
  const cancelReasons = [];
  const state = { raf: 0, diagnosticsPendingReasons: new Set(), settingsRangeCommitTimer: 42 };
  const settle = createCodeboxStyleSettle({
    state,
    setTimeout: () => 0,
    clearTimeout: t => clearTimeoutCalls.push(t),
    requestAnimationFrame: () => 0,
    recordPerformanceEvent: () => {},
    styleRangeGroupTouchesSyntax: () => false,
    clearStyleRangeLivePreviewCache: () => {},
    scheduleSourceClassSyntaxRefresh: () => {},
    codeboxStyleSettleReasonCoalesceDecision: () => ({ coalesce: false }),
    codeboxStyleReasonNeedsSettle: () => false,
    maybeSkipSourceClassSteadyStateStyleReapply: () => false,
    applyCodeboxStyleSettings: () => {},
  });
  const runtime = buildRuntime(state, {
    cancelStyleRangeCommitReapply: reason => { cancelReasons.push(reason); return settle.cancelStyleRangeCommitReapply(reason); },
  });

  runtime.api.uninstall();

  assert.deepEqual(cancelReasons, ['uninstall'], 'uninstall must invoke the range-commit canceller');
  assert.deepEqual(clearTimeoutCalls, [42], 'the pending timer handle must be cleared');
  assert.equal(state.settingsRangeCommitTimer, 0);
});

test('uninstall stays clean when no range commit is pending', () => {
  const state = { raf: 0, diagnosticsPendingReasons: new Set() };
  const runtime = buildRuntime(state);
  runtime.api.uninstall();
  assert.equal(state.settingsRangeCommitTimer ?? 0, 0);
});

test('the shipped composition wires the canceller into the lifecycle', () => {
  // The cancel needs two wires: the uninstall call in publicApiRuntime and the lifecycle key in
  // the composition root. The test above injects its own lifecycle, so this one checks that
  // app.js passes the canceller; without it the timer would outlive uninstall again.
  const source = readFileSync(fileURLToPath(new URL('../../src/app.js', import.meta.url)), 'utf8');
  const lifecycleIndex = source.indexOf('lifecycle: {');
  assert.ok(lifecycleIndex > 0, 'the lifecycle wiring block must exist');
  const block = source.slice(lifecycleIndex, source.indexOf('}', lifecycleIndex));
  assert.ok(block.length > 100, 'the lifecycle block must be non-trivial');
  assert.ok(block.includes('cancelStyleRangeCommitReapply,'), 'the lifecycle must carry the range-commit canceller');
});
