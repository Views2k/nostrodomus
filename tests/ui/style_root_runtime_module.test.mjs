import test from 'node:test';
import assert from 'node:assert/strict';

import { createStyleRootRuntime } from '../../src/ui/styleRootRuntime.js';

function baseState() {
  return {
    styleRootObservers: new Map(),
    observerStats: {
      prunedStyleRootObservers: 0,
      shallowStyleRootObservers: 0,
      deepStyleRootObservers: 0,
    },
    schedulerStats: {},
    editorSentinelStats: { noEditorRetries: 0 },
    styleRootScanLastAt: 0,
    styleRootScanPendingReason: '',
    styleRootScanPendingReasonCount: 0,
    styleRootScanReasonCoalesces: 0,
    styleRootRaf: 0,
    styleRootScanTimer: 0,
  };
}

function createRuntime(overrides = {}) {
  const state = overrides.state || baseState();
  const calls = [];
  let now = 1000;
  const runtime = createStyleRootRuntime({
    state,
    documentRef: overrides.documentRef || { querySelectorAll: () => [] },
    NodeRef: { DOCUMENT_FRAGMENT_NODE: 11 },
    performanceRef: { now: () => now },
    requestAnimationFrame: fn => { calls.push('raf'); fn(); return 1; },
    cancelAnimationFrame: id => calls.push(['cancelRaf', id]),
    setTimeout: (fn, ms) => { calls.push(['timer', ms]); fn(); return 2; },
    clearTimeout: id => calls.push(['clearTimer', id]),
    activeCodeboxStyleEditor: () => overrides.editor || null,
    editorLikelyOpeningWithoutMountedCodebox: () => overrides.likelyOpening === true,
    scheduleEditorPresenceProbe: (...args) => calls.push(['presenceProbe', ...args]),
    scheduleEditorSettleProbes: (...args) => calls.push(['settleProbes', ...args]),
    cleanupCodeboxSlotUnclip: (...args) => calls.push(['slotCleanup', ...args]),
    removeCodeboxRootStylesFromAllRoots: (...args) => calls.push(['removeRootStyles', ...args]),
    discoverOpenStyleRoots: () => overrides.roots || [],
    attachStyleRootObserver: root => { calls.push(['attach', root.name || root]); return root.attach !== false; },
    codeboxStyleReasonIsPassiveEditorSettle: reason => String(reason).includes('passive'),
    codeboxStyleReasonRequiresFullApply: reason => !String(reason).includes('passive'),
    scheduleCodeboxStyleReapply: reason => calls.push(['styleReapply', reason]),
    measurePerformanceEvent: (_name, _reason, fn) => fn(),
    recordPerformanceEvent: (...args) => calls.push(['performance', ...args]),
    ...overrides,
  });
  return { state, calls, runtime, setNow: value => { now = value; } };
}

test('style root runtime coalesces duplicate pending scan reasons', () => {
  const { state, calls, runtime } = createRuntime();

  assert.equal(runtime.appendStyleRootScanPendingReason('style-range-change', 'schedule'), true);
  assert.equal(runtime.appendStyleRootScanPendingReason('style-range-change', 'schedule'), false);

  assert.equal(state.styleRootScanPendingReason, 'style-range-change');
  assert.equal(state.styleRootScanPendingReasonCount, 1);
  assert.equal(state.styleRootScanReasonCoalesces, 1);
  assert.deepEqual(calls.find(call => Array.isArray(call) && call[0] === 'performance'), [
    'performance',
    'style-root-scan-reason-coalesced',
    0,
    'schedule:style-range-change',
  ]);
});

test('style root runtime scans discovered roots and schedules style reapply', () => {
  const roots = [{ name: 'document' }, { name: 'shadow' }];
  const { calls, runtime } = createRuntime({ editor: { id: 'editor' }, roots });

  runtime.scanStyleRoots('style-range-change');

  assert.deepEqual(calls.filter(call => Array.isArray(call) && call[0] === 'attach').map(call => call[1]), ['document', 'shadow']);
  assert.deepEqual(calls.find(call => Array.isArray(call) && call[0] === 'styleReapply'), ['styleReapply', 'root-scan-style-range-change']);
});

test('style root runtime waits for editor lifecycle sentinel when editor is likely opening', () => {
  const { state, calls, runtime } = createRuntime({ likelyOpening: true });

  runtime.scanStyleRoots('shadow-root-editor-discovered');

  assert.equal(state.editorSentinelStats.noEditorRetries, 1);
  assert.deepEqual(calls.find(call => Array.isArray(call) && call[0] === 'presenceProbe'), [
    'presenceProbe',
    'scan-no-active-editor-shadow-root-editor-discovered',
    60,
  ]);
  assert.equal(calls.some(call => Array.isArray(call) && call[0] === 'removeRootStyles'), false);
});

test('style root runtime prunes disconnected observers and clears scheduled work on uninstall', () => {
  const observer = {
    takeRecords: () => [1, 2],
    disconnect: () => calls.push('disconnect'),
  };
  const disconnectedRoot = { isConnected: false, querySelectorAll: () => [] };
  const state = baseState();
  state.styleRootObservers.set(disconnectedRoot, { observer, mode: 'shallow' });
  state.styleRootRaf = 99;
  state.styleRootScanTimer = 88;
  const calls = [];
  const runtime = createStyleRootRuntime({
    state,
    documentRef: { querySelectorAll: () => [] },
    NodeRef: { DOCUMENT_FRAGMENT_NODE: 11 },
    performanceRef: { now: () => 1000 },
    cancelAnimationFrame: id => calls.push(['cancelRaf', id]),
    clearTimeout: id => calls.push(['clearTimer', id]),
    recordPerformanceEvent: (...args) => calls.push(['performance', ...args]),
  });

  runtime.uninstallStyleRootRegistry('uninstall');

  assert.equal(state.styleRootObservers.size, 0);
  assert.equal(state.styleRootRaf, 0);
  assert.equal(state.styleRootScanTimer, 0);
  assert.equal(state.observerStats.prunedStyleRootObservers, 1);
  assert.ok(calls.includes('disconnect'));
  assert.deepEqual(calls.find(call => Array.isArray(call) && call[0] === 'cancelRaf'), ['cancelRaf', 99]);
  assert.deepEqual(calls.find(call => Array.isArray(call) && call[0] === 'clearTimer'), ['clearTimer', 88]);
});
