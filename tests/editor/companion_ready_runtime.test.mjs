import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompanionReadyRuntime } from '../../src/editor/companionReadyRuntime.js';

test('companion ready runtime routes stable ready editor through owner callbacks', () => {
  const state = {};
  const editor = { querySelector: () => ({}) };
  const events = [];
  const runtime = createCompanionReadyRuntime({
    state,
    now: () => 1000,
    usableBridgeStyleEditorCandidate: (_detail, reason) => { events.push(`usable:${reason}`); return editor; },
    stableNativeFallbackLifecycleDecisionForEditor: (_editor, reason, path) => { events.push(`stable:${reason}:${path}`); return { skip: false }; },
    primeCodeboxPreflightForEditor: (_editor, reason) => events.push(`preflight:${reason}`),
    rememberActiveCodeboxEditor: (_editor, reason) => events.push(`remember:${reason}`),
    handleEditorSentinelDetected: (_reason, selected) => events.push(`sentinel:${selected === editor}`),
    installSyntaxOwnerObserver: (_editor, reason) => events.push(`syntax:${reason}`),
    scheduleCodeboxExternalFrameSync: (_editor, _tokens, reason) => events.push(`frame:${reason}`),
  });

  assert.equal(runtime.notifyEditorReadyFromCompanion({ reason: 'boot' }), true);
  assert.equal(state.editorSentinelLikelyOpeningUntil, 1900);
  assert.equal(state.codeboxFrameHoldUntil, 1180);
  assert.deepEqual(events, [
    'usable:companion-editor-ready-boot',
    'stable:companion-editor-ready-boot:companion-editor-ready-stable-lifecycle',
    'preflight:companion-editor-ready-boot',
    'remember:companion-editor-ready-boot',
    'sentinel:true',
    'syntax:companion-editor-ready-boot',
    'frame:companion-editor-ready-boot-frame-hold',
  ]);
});

test('companion ready runtime falls back to settle probes when no editor is ready', () => {
  const state = {};
  const events = [];
  const runtime = createCompanionReadyRuntime({
    state,
    now: () => 2000,
    usableBridgeStyleEditorCandidate: () => null,
    visibleStyleEditorCandidate: () => false,
    scheduleEditorPresenceProbe: reason => events.push(`presence:${reason}`),
    scheduleEditorSettleProbes: reason => events.push(`settle:${reason}`),
    scheduleCodeboxStyleReapply: reason => events.push(`style:${reason}`),
  });

  assert.equal(runtime.notifyEditorReadyFromCompanion({ reason: 'bridge' }), true);
  assert.deepEqual(events, [
    'presence:companion-editor-ready-bridge',
    'settle:companion-editor-ready-bridge',
    'style:companion-editor-ready-bridge',
  ]);
});

test('companion ready runtime preserves native fallback skip path', () => {
  const state = {};
  const editor = { querySelector: () => ({}) };
  const decision = { skip: true, reason: 'native-owner' };
  const events = [];
  const runtime = createCompanionReadyRuntime({
    state,
    now: () => 3000,
    usableBridgeStyleEditorCandidate: () => editor,
    stableNativeFallbackLifecycleDecisionForEditor: () => decision,
    suppressStableNativeFallbackEditorLifecycle: (_editor, value) => events.push(`suppress:${value === decision}`),
    scheduleCodeboxExternalFrameSync: (_editor, _tokens, reason) => events.push(`frame:${reason}`),
    primeCodeboxPreflightForEditor: () => events.push('preflight'),
  });

  assert.equal(runtime.notifyEditorReadyFromCompanion({ reason: 'focus' }), true);
  assert.deepEqual(events, ['suppress:true', 'frame:companion-editor-ready-focus-frame-hold']);
});
