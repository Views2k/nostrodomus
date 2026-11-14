import test from 'node:test';
import assert from 'node:assert/strict';

import { createObserverLifecycleRuntime } from '../../src/diagnostics/observerLifecycleRuntime.js';
import { createCompanionSettleRuntime } from '../../src/companion/companionSettleRuntime.js';

const GATE_KEY = 'nostrodomusObserverLifecycleDisconnect';

function fakeObserver(log, name) {
  return { disconnect() { log.push(name); }, takeRecords: () => [] };
}

// The main runtime's observers are in state; the companion layer keeps its own (the settle
// engine, the warning watchers, the codebox layout watcher) and reports them through two hooks.
function harness({ gate = true, companion = { companionSettleObservers: 3, companionWarningObservers: 2, companionLayoutObservers: 1 }, withCompanion = true, deps = {} } = {}) {
  const log = [];
  const counts = { ...companion };
  const state = {
    styleRootObserver: fakeObserver(log, 'styleRootObserver'),
    styleRootObservers: new Map([['a', { observer: fakeObserver(log, 'styleRootObservers:a') }]]),
    observerStats: {},
  };
  const options = {
    W: { localStorage: { getItem: key => (gate && key === GATE_KEY ? 'enabled' : null) } },
    state,
    activeEditDialog: () => null,
    isOpen: () => false,
    editorLikelyOpeningWithoutMountedCodebox: () => false,
    recordPerformanceEvent: (...args) => log.push(['perf', ...args]),
    recordRuntimeErrorOnce: (...args) => log.push(['error', ...args]),
    disconnectCodeboxPreflightObserver: () => {},
    cleanupCodeboxSlotUnclip: () => {},
    uninstallEditorLifecycleSentinel: () => {},
    cleanupInitialSyntaxPaintGate: () => {},
    disconnectCodeMirrorSyntaxContentObserver: () => {},
    disconnectSourceClassSmartSyntaxObserver: () => {},
  };
  if (withCompanion) {
    options.companionObserverCounts = () => ({ ...counts });
    options.disconnectCompanionObservers = (reason) => {
      log.push(['companion-disconnect', reason]);
      for (const name of Object.keys(counts)) counts[name] = 0;
    };
  }
  return { log, state, counts, runtime: createObserverLifecycleRuntime({ ...options, ...deps }) };
}

test('the observer readout counts the companion layer observers', () => {
  const { runtime } = harness();
  const counts = runtime.observerLifecycleRegistryCounts();
  assert.equal(counts.companionSettleObservers, 3);
  assert.equal(counts.companionWarningObservers, 2);
  assert.equal(counts.companionLayoutObservers, 1);
  assert.equal(counts.styleRootObservers, 1);
  assert.equal(runtime.observerLifecycleReadout().connectedTotal, 8, 'two of the main runtime and six of the companion layer');

  const rows = runtime.observerLifecycleCloseDryRunWouldInspect(counts);
  const companionRows = rows.filter(row => row.registry.startsWith('companion'));
  assert.deepEqual(companionRows.map(row => [row.registry, row.helper, row.count, row.wouldInspect]), [
    ['companionSettleObservers', 'disconnectCompanionObservers', 3, true],
    ['companionWarningObservers', 'disconnectCompanionObservers', 2, true],
    ['companionLayoutObservers', 'disconnectCompanionObservers', 1, true],
  ]);
});

test('disconnectAllNostrodomusObservers reaches the companion layer observers', () => {
  const { runtime, log, state } = harness();
  const summary = runtime.disconnectAllNostrodomusObservers('manual');

  assert.equal(summary.ok, true);
  assert.deepEqual(log.filter(row => row[0] === 'companion-disconnect'), [['companion-disconnect', 'manual-central']]);
  assert.deepEqual(summary.registries.companionSettleObservers, { before: 3, after: 0, disconnected: 3, pendingRecords: 0 });
  assert.deepEqual(summary.registries.companionWarningObservers, { before: 2, after: 0, disconnected: 2, pendingRecords: 0 });
  assert.deepEqual(summary.registries.companionLayoutObservers, { before: 1, after: 0, disconnected: 1, pendingRecords: 0 });
  assert.equal(summary.disconnected, 8);
  assert.equal(summary.after.companionSettleObservers, 0);
  assert.equal(state.styleRootObserver, null, 'the main runtime observers are disconnected as before');
  assert.equal(runtime.observerLifecycleReadout().connectedTotal, 0);
});

test('with the gate closed nothing is disconnected, in the companion layer either', () => {
  const { runtime, log, counts } = harness({ gate: false });
  const summary = runtime.disconnectAllNostrodomusObservers('manual');
  assert.equal(summary.blocked, true);
  assert.deepEqual(log, []);
  assert.equal(counts.companionSettleObservers, 3);
});

test('a companion layer with no observers is not asked to disconnect', () => {
  const { runtime, log } = harness({ companion: { companionSettleObservers: 0, companionWarningObservers: 0, companionLayoutObservers: 0 } });
  const summary = runtime.disconnectAllNostrodomusObservers('manual');
  assert.equal(log.some(row => row[0] === 'companion-disconnect'), false);
  assert.equal(summary.disconnected, 2);
});

test('without the companion hooks the registries are the ten of the main runtime', () => {
  const { runtime } = harness({ withCompanion: false });
  assert.deepEqual(Object.keys(runtime.observerLifecycleRegistryCounts()), [
    'codeboxPreflightObserver', 'codeboxSlotUnclipObservers', 'editorSentinelObservers', 'initialSyntaxGateObservers',
    'codeMirrorSyntaxContentObserver', 'sourceClassSmartSyntaxObserver', 'syntaxOwnerObserver', 'styleMutationObserver',
    'styleRootObserver', 'styleRootObservers',
  ]);
  assert.equal(runtime.disconnectAllNostrodomusObservers('manual').disconnected, 2);
});

test('a companion hook that throws does not stop the readout or the disconnect', () => {
  const failingCounts = harness({ deps: { companionObserverCounts: () => { throw new Error('gone'); } } });
  assert.equal(failingCounts.runtime.observerLifecycleReadout().connectedTotal, 2);

  const failing = harness();
  const runtime = createObserverLifecycleRuntime({
    W: { localStorage: { getItem: () => 'enabled' } },
    state: failing.state,
    activeEditDialog: () => null,
    isOpen: () => false,
    editorLikelyOpeningWithoutMountedCodebox: () => false,
    recordPerformanceEvent: () => {},
    recordRuntimeErrorOnce: (...args) => failing.log.push(['error', ...args]),
    companionObserverCounts: () => ({ companionSettleObservers: 1 }),
    disconnectCompanionObservers: () => { throw new Error('settle engine gone'); },
  });
  const summary = runtime.disconnectAllNostrodomusObservers('manual');
  assert.equal(summary.ok, true);
  assert.equal(failing.state.styleRootObserver, null, 'the main runtime observers were disconnected first');
  assert.equal(failing.log.some(row => row[0] === 'error' && row[1] === 'observer-lifecycle:disconnect-all'), true);
});

// main.legacy.js wires the hooks to the companion settle engine: the count from its snapshot, the
// disconnect through its cleanup. This runs the real engine through the same two expressions.
test('the settle engine snapshot counts exactly the observers its cleanup disconnects', () => {
  const live = new Set();
  function FakeObserver() {
    this.observe = () => { live.add(this); };
    this.disconnect = () => { live.delete(this); };
  }
  const shadowRoot = () => ({ host: { isConnected: true }, querySelectorAll: () => [] });
  const dialogs = [{ shadowRoot: shadowRoot(), isConnected: true }, { shadowRoot: shadowRoot(), isConnected: true }];
  const settle = createCompanionSettleRuntime({
    globalRef: {},
    documentRef: { addEventListener() {}, removeEventListener() {} },
    MutationObserver: FakeObserver,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    isActive: () => true,
    editDialogPresent: () => true,
    editDialogElements: () => dialogs,
    activeDialog: () => dialogs[0],
    homeRoot: () => ({}),
  });
  const count = () => {
    const snapshot = settle.snapshot();
    return (snapshot.booted ? 1 : 0) + (snapshot.observingDialog ? 1 : 0) + (snapshot.openWatchers || 0);
  };
  const { runtime } = harness({ deps: { companionObserverCounts: () => ({ companionSettleObservers: count() }), disconnectCompanionObservers: () => settle.cleanup() } });

  assert.equal(count(), 0, 'nothing before the engine boots');
  settle.boot('test');
  assert.equal(count(), live.size, 'the home root observer and one per dialog element');
  assert.equal(count(), 3);
  settle.onDialogOpen('test');
  assert.equal(count(), live.size, 'and the observer of the open dialog');
  assert.equal(count(), 4);
  assert.equal(runtime.observerLifecycleRegistryCounts().companionSettleObservers, 4);

  const summary = runtime.disconnectAllNostrodomusObservers('manual');
  assert.equal(live.size, 0, 'every counted observer is disconnected');
  assert.deepEqual(summary.registries.companionSettleObservers, { before: 4, after: 0, disconnected: 4, pendingRecords: 0 });
});

test('main.legacy.js gives the observer lifecycle the settle engine count and cleanup', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../../src/main.legacy.js', import.meta.url), 'utf8');
  const start = source.indexOf('observerLifecycleRuntime = createObserverLifecycleRuntime({');
  const block = source.slice(start, source.indexOf('observerLifecycleDisconnectAll = observerLifecycleRuntime.disconnectAllNostrodomusObservers;', start));
  assert.match(block, /companionObserverCounts: \(\) => \{/);
  assert.match(block, /companionSettleObservers: \(settle\.booted \? 1 : 0\) \+ \(settle\.observingDialog \? 1 : 0\) \+ \(settle\.openWatchers \|\| 0\)/);
  assert.match(block, /companionWarningObservers: companionScrollbarRuntime\.warningObserverCount\(\),/);
  assert.match(block, /companionLayoutObservers: companionCodeboxEnlargeRuntime\.layoutObserverCount\(\),/);
  assert.match(block, /disconnectCompanionObservers: \(\) => \{\s+companionSettleRuntime\.cleanup\(\);\s+companionScrollbarRuntime\.disconnectWarningObservers\(\);\s+companionCodeboxEnlargeRuntime\.stopWatchingLayout\(\);\s+\},/);
});
