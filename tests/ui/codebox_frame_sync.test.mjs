import test from 'node:test';
import assert from 'node:assert/strict';

import { createCodeboxFrameRuntime } from '../../src/ui/codeboxFrameRuntime.js';

function makeRuntime() {
  const calls = { discovery: 0, tokens: 0 };
  const state = { codeboxFrameEditor: null };
  const editor = { matches: (sel) => sel === '.cm-editor', dataset: {}, style: {} };
  const rt = createCodeboxFrameRuntime({
    state,
    cancelAnimationFrame: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    activeCodeboxStyleEditor: () => { calls.discovery += 1; return editor; },
    effectiveStyleSettings: () => ({}),
    codeboxStyleTokensFromSettings: () => { calls.tokens += 1; return {}; },
    applyCodeboxStyleTokensToElement: () => false,
  });
  return { rt, state, calls, editor };
}

test('the frame sync of a style apply marks the frame host as ready and visible', () => {
  const { rt, calls, editor } = makeRuntime();
  rt.scheduleCodeboxExternalFrameSync(null, null, 'style-apply');
  assert.equal(calls.discovery, 1);
  assert.equal(editor.dataset.nostrodomusCodeboxFrameHost, '1');
  assert.equal(editor.dataset.nostrodomusCodeboxFrameReady, '1');
  assert.equal(editor.dataset.nostrodomusCodeboxFrameVisible, '1');
});

test('the frame runtime installs no window listeners', () => {
  assert.equal('installCodeboxExternalFrameEventGuards' in makeRuntime().rt, false);
});
