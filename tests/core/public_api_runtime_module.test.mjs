import test from 'node:test';
import assert from 'node:assert/strict';

import { createPublicApiRuntime } from '../../src/core/publicApiRuntime.js';

test('public API runtime installs aliases, boots library before lifecycle, and removes aliases on uninstall', async () => {
  const W = {};
  const state = { raf: 0, diagnosticsPendingReasons: new Set() };
  const events = [];
  const lifecycle = {
    installInitialSyntaxPaintGate: reason => events.push(`install-syntax:${reason}`),
    installCodeboxPreflightStyle: reason => events.push(`install-preflight:${reason}`),
    installEditorLifecycleSentinel: reason => events.push(`install-sentinel:${reason}`),
    installRootStyleRegistry: () => events.push('install-roots'),
    addPersistentListener: (_target, type, _handler, options, reason) => events.push(`listen:${type}:${options}:${reason}`),
    cleanupInitialSyntaxPaintGate: reason => events.push(`cleanup-syntax:${reason}`),
    removeCodeboxPreflightStyle: reason => events.push(`remove-preflight:${reason}`),
    uninstallEditorLifecycleSentinel: reason => events.push(`uninstall-sentinel:${reason}`),
    removePersistentListeners: reason => events.push(`remove-listeners:${reason}`),
    removeCodeboxRootStylesFromAllRoots: reason => events.push(`remove-root-styles:${reason}`),
    cleanupCodeboxSlotUnclip: reason => events.push(`cleanup-unclip:${reason}`),
    clearCodeboxExternalFrameSettleTimers: reason => events.push(`clear-frame:${reason}`),
    removeCodeboxExternalFrame: () => events.push('remove-frame'),
    removeCodeboxKeyboardContainment: reason => events.push(`remove-keyboard:${reason}`),
    unhookDispatch: () => events.push('unhook-dispatch'),
    removeOverlay: () => events.push('remove-overlay'),
    clearSnippetSession: () => events.push('clear-snippet'),
    closeSettings: value => events.push(`close-settings:${value}`),
    uninstallStyleRootRegistry: reason => events.push(`uninstall-roots:${reason}`),
    clearCodeboxStyleSettleTimers: () => events.push('clear-style-settle'),
    disconnectCodeMirrorSyntaxContentObserver: reason => events.push(`disconnect-content:${reason}`),
    disconnectSourceClassSmartSyntaxObserver: reason => events.push(`disconnect-source:${reason}`),
  };

  const runtime = createPublicApiRuntime({
    W,
    documentRef: { nodeType: 9 },
    state,
    VERSION: 'nostrodomus-v0.0.0-test',
    PROJECT_VERSION: '0.0.0',
    apiMethods: {
      open: () => 'open',
      close: () => 'close',
      toggle: () => 'toggle',
      refresh: () => 'refresh',
      openSettings: () => 'settings',
      debug: () => ({}),
      health: () => ({}),
      runtimeCoordinatorReadout: () => ({ available: true }),
      onPointer: () => {},
      onFocusIn: () => {},
      onFocusOut: () => {},
      onKeydown: () => {},
    },
    lifecycle,
    logDebug: (...args) => events.push(`log:${args[0]}`),
    emitStartupBadge: () => events.push('badge'),
    cancelAnimationFrameRef: value => events.push(`cancel:${value}`),
  });

  assert.equal(runtime.api.version, 'nostrodomus-v0.0.0-test');
  // boot() installs the full runtime but does not eagerly load the completion
  // library (it loads lazily on first editor via open()).
  let libraryLoads = 0;
  await runtime.boot(async () => { libraryLoads += 1; });

  assert.equal(libraryLoads, 0, 'boot must not eagerly load the completion library');
  assert.equal(W.__nostrodomus, runtime.api);
  // The full runtime installs at boot, in the original order (no library row).
  assert.deepEqual(events.slice(0, 5), [
    'install-syntax:install',
    'install-preflight:install',
    'install-sentinel:install',
    'install-roots',
    'listen:pointerdown:true:document-pointerdown',
  ]);
  assert.ok(events.includes('listen:keydown:true:document-keydown'));
  assert.ok(events.includes('badge'));

  runtime.api.uninstall();
  assert.equal(W.__nostrodomus, undefined);
  assert.equal(state.enabled, false);
  assert.ok(events.includes('remove-listeners:uninstall'));
  assert.ok(events.includes('disconnect-source:uninstall'));
  assert.ok(events.includes('log:uninstalled'));
});

// --- appended: uninstall settles pending timers first ---
test('uninstall settles pending timers before tearing down, and survives a throwing hook', () => {
  const events = [];
  const make = (settlePendingTimers) => createPublicApiRuntime({
    W: {},
    documentRef: {},
    state: { raf: 0, diagnosticsPendingReasons: new Set() },
    VERSION: 'v',
    PROJECT_VERSION: '0',
    lifecycle: {
      settlePendingTimers,
      cleanupInitialSyntaxPaintGate: () => events.push('cleanup-syntax'),
      closeSettings: () => events.push('close-settings'),
    },
  });
  make((reason) => events.push(`settle:${reason}`)).uninstall();
  assert.deepEqual(events, ['settle:uninstall', 'cleanup-syntax', 'close-settings']);

  events.length = 0;
  assert.doesNotThrow(() => make(() => { throw new Error('boom'); }).uninstall());
  assert.deepEqual(events, ['cleanup-syntax', 'close-settings']);
});
