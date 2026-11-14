import test from 'node:test';
import assert from 'node:assert/strict';

import { createPersistentListenersRuntime } from '../../src/core/persistentListenersRuntime.js';

function createTarget() {
  const listeners = [];
  return {
    listeners,
    addEventListener(type, handler, options) {
      listeners.push({ type, handler, options });
    },
    removeEventListener(type, handler, options) {
      const index = listeners.findIndex(item => item.type === type && item.handler === handler && item.options === options);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
}

test('persistent listener runtime tracks attach and remove lifecycle', () => {
  const state = {
    persistentListeners: [],
    listenerStats: {
      persistentAttached: 0,
      persistentRemoved: 0,
      activePersistent: 0,
      lastReason: '',
    },
  };
  const events = [];
  const runtime = createPersistentListenersRuntime({
    state,
    recordPerformanceEvent: (...args) => events.push(args),
  });

  const target = createTarget();
  const handler = () => {};
  const options = { passive: true, capture: true };

  assert.equal(runtime.addPersistentListener(target, 'keydown', handler, options, 'document-keydown'), true);
  assert.equal(target.listeners.length, 1);
  assert.equal(state.persistentListeners.length, 1);
  assert.deepEqual(state.listenerStats, {
    persistentAttached: 1,
    persistentRemoved: 0,
    activePersistent: 1,
    lastReason: 'document-keydown',
  });
  assert.deepEqual(events[0], ['listener-attached', 0, 'document-keydown']);

  assert.equal(runtime.removePersistentListeners('uninstall'), 1);
  assert.equal(target.listeners.length, 0);
  assert.equal(state.persistentListeners.length, 0);
  assert.deepEqual(state.listenerStats, {
    persistentAttached: 1,
    persistentRemoved: 1,
    activePersistent: 0,
    lastReason: 'uninstall',
  });
  assert.deepEqual(events[1], ['listener-removed', 0, '1:uninstall']);
});

test('persistent listener runtime rejects missing targets without mutating state', () => {
  const state = {
    persistentListeners: [],
    listenerStats: {
      persistentAttached: 0,
      persistentRemoved: 0,
      activePersistent: 0,
      lastReason: '',
    },
  };
  const runtime = createPersistentListenersRuntime({ state });

  assert.equal(runtime.addPersistentListener(null, 'click', () => {}, {}, 'missing-target'), false);
  assert.equal(runtime.addPersistentListener(createTarget(), '', () => {}, {}, 'missing-type'), false);
  assert.equal(runtime.addPersistentListener(createTarget(), 'click', null, {}, 'missing-handler'), false);
  assert.deepEqual(runtime.persistentListenerReadout(), {
    active: 0,
    attached: 0,
    removed: 0,
    lastReason: '',
  });
});
