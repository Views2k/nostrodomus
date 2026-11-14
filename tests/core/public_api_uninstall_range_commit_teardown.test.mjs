import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createPublicApiRuntime } from '../../src/core/publicApiRuntime.js';
import { createCodeboxStyleSettle } from '../../src/ui/codebox/codeboxStyleSettle.js';

// The 180ms style-range commit timer (armed on slider release) survived uninstall:
// clearCodeboxStyleSettleTimers sweeps only the settle-cascade Set, and the commit
// callback's syntax half is not behind the enabled gate -- so releasing a syntax
// slider and uninstalling within 180ms re-injected the source-class style node and
// re-installed the smart-syntax observer uninstall had just disconnected. uninstall
// now cancels the pending commit through the settle module's own canceller (which
// also records the cancel in diagnostics). Harness mirrors
// tests/core/public_api_uninstall_style_mutation_teardown.test.mjs.
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
  // The fix is load-bearing at TWO wires: the uninstall call in publicApiRuntime and
  // the lifecycle key in the composition root. The unit test above injects its own
  // lifecycle, so without this pin a refactor could drop the main.legacy key and the
  // timer leak would silently return under a green gate.
  const source = readFileSync(fileURLToPath(new URL('../../src/main.legacy.js', import.meta.url)), 'utf8');
  const lifecycleIndex = source.indexOf('lifecycle: {');
  assert.ok(lifecycleIndex > 0, 'the lifecycle wiring block must exist');
  const block = source.slice(lifecycleIndex, source.indexOf('}', lifecycleIndex));
  assert.ok(block.length > 100, 'the lifecycle block must be non-trivial');
  assert.ok(block.includes('cancelStyleRangeCommitReapply,'), 'the lifecycle must carry the range-commit canceller');
});
