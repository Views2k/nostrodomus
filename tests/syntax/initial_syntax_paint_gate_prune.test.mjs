import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialSyntaxPaintGate } from '../../src/syntax/initialSyntaxPaintGate.js';

// observeInitialSyntaxPaintGateRoot stores each root's MutationObserver in a
// strong Map (state.initialSyntaxGateObservers). It was only cleared on uninstall, so every
// card-editor open left its observer + detached root retained for the session (a leak). The
// per-discovery prime now drops observers whose root has left the DOM.

test('the observer prune disconnects + drops detached roots, keeps live roots and the document', () => {
  const disconnected = [];
  const observer = (label) => ({ label, disconnect() { disconnected.push(label); } });
  const observers = new Map();
  const detachedShadow = { nodeType: 11, isConnected: false }; // a closed dialog's shadow root
  const liveShadow = { nodeType: 11, isConnected: true };
  const doc = { nodeType: 9, isConnected: true }; // document — must never be pruned
  observers.set(detachedShadow, observer('detached'));
  observers.set(liveShadow, observer('live'));
  observers.set(doc, observer('document'));

  const state = {
    initialSyntaxGateObservers: observers,
    initialSyntaxGateObservedRoots: new WeakSet([detachedShadow, liveShadow]),
  };
  const gate = createInitialSyntaxPaintGate({ state });

  const pruned = gate.pruneDetachedInitialSyntaxPaintGateObservers();
  assert.equal(pruned, 1, 'exactly the one detached root pruned');
  assert.deepEqual(disconnected, ['detached'], 'only the detached observer was disconnected');
  assert.equal(observers.has(detachedShadow), false, 'detached root removed from the Map');
  assert.equal(observers.has(liveShadow), true, 'a live root is kept');
  assert.equal(observers.has(doc), true, 'document (nodeType 9) is never pruned');
  assert.equal(observers.size, 2);
});

test('the prune does nothing without an observers Map or for a root whose connection state is unknown', () => {
  assert.doesNotThrow(() => createInitialSyntaxPaintGate({ state: {} }).pruneDetachedInitialSyntaxPaintGateObservers());
  const observers = new Map([[{ nodeType: 11 /* no isConnected */ }, { disconnect() {} }]]);
  const gate = createInitialSyntaxPaintGate({ state: { initialSyntaxGateObservers: observers } });
  assert.equal(gate.pruneDetachedInitialSyntaxPaintGateObservers(), 0, 'unknown connectivity is kept');
  assert.equal(observers.size, 1);
});
