import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorLifecycleSentinelRuntime } from '../../src/editor/editorLifecycleSentinel.js';

// Finding 1B(iv): state.editorSentinelObservers is a strong-ref Map keyed by root object.
// Each dialog open adds the dialog + its shadowRoot; the dedup keys on object identity, so a
// reopened dialog (a fresh object) misses dedup and adds new entries. Nothing pruned detached
// roots on close, so the Map grew unbounded, leaking detached dialog nodes + observers. The fix
// adds a prune (mirroring pruneStyleRootObservers) that disconnects + deletes entries whose root
// is no longer connected. It must NEVER drop a live root (would break editor detection).
const noop = () => {};

function makeRuntime(state) {
  return createEditorLifecycleSentinelRuntime({
    document: { nodeType: 9 },
    window: { addEventListener: noop, removeEventListener: noop },
    state,
    Node: { DOCUMENT_FRAGMENT_NODE: 11 },
    MutationObserver: function () { this.observe = noop; this.disconnect = noop; this.takeRecords = () => []; },
    homeRoot: () => null, activeEditDialog: () => null, editCardDialogCandidates: () => [],
    recordPerformanceEvent: noop, editorSentinelLabel: () => 'root', panelEditorObservationRoots: () => [],
    editorLikelyOpeningWithoutMountedCodebox: () => false, scheduleEditorPresenceProbe: noop,
    runEditorPresenceProbe: noop, activeCodeboxStyleEditor: () => null,
  });
}

function spyObserver() {
  const o = { disconnected: false, disconnect() { o.disconnected = true; }, takeRecords: () => [] };
  return o;
}

test('pruneEditorSentinelObservers drops detached roots and keeps live ones (1B-iv)', () => {
  const state = { editorSentinelObservers: new Map(), editorSentinelStats: {} };
  const runtime = makeRuntime(state);
  const documentRef = { nodeType: 9 }; // not the same object as the injected document -> use querySelectorAll path
  documentRef.querySelectorAll = () => [];

  const liveDoc = spyObserver();
  const staleDialog = spyObserver();
  const liveDialog = spyObserver();
  state.editorSentinelObservers.set(documentRef, { observer: liveDoc, mode: 'deep' });
  state.editorSentinelObservers.set({ nodeType: 11, host: { isConnected: false } }, { observer: staleDialog, mode: 'shallow' });
  state.editorSentinelObservers.set({ nodeType: 11, host: { isConnected: true } }, { observer: liveDialog, mode: 'shallow' });

  const pruned = runtime.pruneEditorSentinelObservers('test');

  assert.equal(pruned, 1, 'exactly the detached dialog root is pruned');
  assert.equal(staleDialog.disconnected, true, 'the detached observer is disconnected');
  assert.equal(state.editorSentinelObservers.size, 2, 'live document + live dialog remain');
  assert.equal(liveDoc.disconnected, false, 'live document observer is kept');
  assert.equal(liveDialog.disconnected, false, 'live dialog observer is kept');
});
