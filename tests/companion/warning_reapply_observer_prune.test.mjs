import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompanionStyleRuntime } from '../../src/companion/companionStyleRuntime.js';

// ensureWarningReapplyObserver keeps one MutationObserver per badged container root in a Map that
// teardown clears. Without pruning, every card editor dialog that opens and closes would leave its
// observer and detached root in memory for the session, so the setup drops roots that left the DOM.

function makeRuntime() {
  const disconnected = [];
  class FakeMutationObserver {
    constructor(cb) { this.cb = cb; }
    observe() {}
    disconnect() { disconnected.push(this); }
  }
  const runtime = createCompanionStyleRuntime({
    MutationObserver: FakeMutationObserver,
    active: () => true,
    hideEditorWarnings: () => false,
    documentRef: { createElement: () => ({ id: '', textContent: '', remove() {} }) },
  });
  return { runtime, disconnected };
}

// A minimal fake shadow root that accepts injectOwnedStyle (querySelector + appendChild).
function fakeShadowRoot(isConnected) {
  return { nodeType: 11, isConnected, querySelector: () => null, appendChild() {} };
}

test('the warning watchers can be counted and disconnected without a teardown', () => {
  const { runtime, disconnected } = makeRuntime();
  assert.equal(runtime.warningObserverCount(), 0);
  runtime.ensureWarningReapplyObserver({ nodeType: 11, isConnected: true }, null);
  runtime.ensureWarningReapplyObserver({ nodeType: 11, isConnected: true }, null);
  assert.equal(runtime.warningObserverCount(), 2);
  assert.equal(runtime.disconnectWarningObservers(), 2);
  assert.equal(disconnected.length, 2);
  assert.equal(runtime.warningObserverCount(), 0);
  assert.equal(runtime.disconnectWarningObservers(), 0, 'nothing left to disconnect');
});

test('detached badged roots are pruned + disconnected; live roots and document are kept', () => {
  const { runtime, disconnected } = makeRuntime();
  const detached = { nodeType: 11, isConnected: false };
  const doc = { nodeType: 9, isConnected: true };

  // Observe a root, then it detaches (its dialog closes). It stays in the Map until the next setup.
  runtime.ensureWarningReapplyObserver(detached, null);
  assert.equal(disconnected.length, 0, 'nothing disconnected yet');

  // The next observer setup prunes the detached root first (eager prune), then observes the doc root.
  runtime.ensureWarningReapplyObserver(doc, null);
  assert.equal(disconnected.length, 1, 'the detached root observer was disconnected on the next setup');

  // Nothing detached remains; document (nodeType 9) is never pruned.
  assert.equal(runtime.pruneDetachedWarningReapplyObservers(), 0, 'no detached roots left');
  assert.equal(disconnected.length, 1, 'document not disconnected');
});

test('prune keeps a root whose connection state is unknown and does not throw', () => {
  const { runtime } = makeRuntime();
  runtime.ensureWarningReapplyObserver({ nodeType: 11 /* no isConnected */ }, null);
  assert.doesNotThrow(() => assert.equal(runtime.pruneDetachedWarningReapplyObservers(), 0));
});

test('owned-style registries prune detached roots on the next apply', () => {
  // ownedRoots (the shadow roots that got our styles) must drop detached roots on the next apply,
  // not only on teardown, or they pile up over a session.
  const { runtime } = makeRuntime();
  const root = fakeShadowRoot(true);
  runtime.applyToRoots({ codeRoot: root, codeRootDialogScoped: true }); // adds `root` to ownedRoots
  root.isConnected = false; // its dialog closes

  assert.equal(runtime.pruneDetachedOwnedRoots(), 1, 'the detached owned root is pruned');
  assert.equal(runtime.pruneDetachedOwnedRoots(), 0, 'nothing detached remains');
});
