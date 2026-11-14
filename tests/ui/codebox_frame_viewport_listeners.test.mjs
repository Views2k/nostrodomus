import test from 'node:test';
import assert from 'node:assert/strict';

import { createCodeboxFrameRuntime } from '../../src/ui/codeboxFrameRuntime.js';

// The external frame overlay is disabled: nothing creates it, so there is nothing for a scroll
// or a resize to reposition. The viewport listeners still ran editor discovery and built the
// style tokens on every event, including every scroll of the code itself.

function makeRuntime() {
  const listeners = [];
  const calls = { discovery: 0, tokens: 0 };
  const state = { codeboxFrameEventsInstalled: false, codeboxFrameOverlay: null, codeboxFrameEditor: null };
  const editor = { matches: (sel) => sel === '.cm-editor', dataset: {}, style: {} };
  const rt = createCodeboxFrameRuntime({
    window: {},
    document: { body: null, documentElement: null },
    state,
    cancelAnimationFrame: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    activeCodeboxStyleEditor: () => { calls.discovery += 1; return editor; },
    effectiveStyleSettings: () => ({}),
    codeboxStyleTokensFromSettings: () => { calls.tokens += 1; return {}; },
    applyCodeboxStyleTokensToElement: () => false,
    addPersistentListener: (target, type, handler, options, reason) => { listeners.push({ type, handler, reason }); return true; },
  });
  return { rt, state, calls, listeners, editor };
}

test('scroll and resize do no editor discovery while there is no frame overlay', () => {
  const { rt, calls, listeners, editor } = makeRuntime();
  rt.installCodeboxExternalFrameEventGuards();
  assert.deepEqual(listeners.map((l) => l.type).sort(), ['resize', 'scroll']);
  for (let i = 0; i < 5; i += 1) for (const { handler } of listeners) handler({ type: 'event' });
  assert.equal(calls.discovery, 0, 'no active-editor discovery per event');
  assert.equal(calls.tokens, 0, 'no style tokens built per event');
  assert.deepEqual(editor.dataset, {}, 'the editor is not written to');
});

test('with a frame overlay present the viewport events still reach the frame sync', () => {
  const { rt, state, calls, listeners } = makeRuntime();
  rt.installCodeboxExternalFrameEventGuards();
  state.codeboxFrameOverlay = { parentNode: null };
  listeners[0].handler({ type: 'resize' });
  assert.equal(calls.discovery, 1, 'the sync ran for the overlay');
});

test('the direct frame sync used by the style apply is unchanged', () => {
  const { rt, calls, editor } = makeRuntime();
  rt.scheduleCodeboxExternalFrameSync(null, null, 'style-apply');
  assert.equal(calls.discovery, 1);
  assert.equal(editor.dataset.nostrodomusCodeboxFrameHost, '1');
  assert.equal(editor.dataset.nostrodomusCodeboxFrameReady, '1');
  assert.equal(editor.dataset.nostrodomusCodeboxFrameVisible, '1');
});
