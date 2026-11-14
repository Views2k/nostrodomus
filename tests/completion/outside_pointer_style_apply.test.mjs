import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompletionRuntime } from '../../src/completion/completionRuntime.js';

// A pointerdown outside editor scope asks for
// a style apply. On a page with no editor and no card dialog that apply has nothing left to do
// once it has run without an editor.
function harness(overrides = {}) {
  const reasons = [];
  const state = {
    enabled: true,
    settings: { keepOpen: false },
    items: [],
    selected: 0,
    overlay: { style: { display: 'none' } },
    context: {},
  };
  const runtime = createCompletionRuntime({
    state,
    documentRef: {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout: () => 2,
    clearTimeout: () => {},
    now: () => 1000,
    renderCompletionPopup: () => {},
    ensureOverlay: () => state.overlay,
    placeAtCursor: () => {},
    popupIsOpen: () => state.overlay.style.display === 'block',
    closePopup: () => { state.overlay.style.display = 'none'; },
    measurePerformanceEvent: (_name, _reason, fn) => fn(),
    isViewAllowed: () => true,
    isScopedEditorEvent: () => false,
    isNostrodomusUiEvent: () => false,
    rememberView: () => {},
    pathHasEditorSurface: () => false,
    scheduleCodeboxStyleReapply: reason => reasons.push(reason),
    observerLifecycleCloseDryRunListenerProbe: () => {},
    ...overrides,
  });
  // What the style runtime records after an apply (src/ui/codeboxStyleRuntime.js).
  const recordApply = (editorBound, reason = 'coalesced-outside-pointer-syntax-repaint', at = Date.now()) => {
    state.lastStyleApply = { at: new Date(at).toISOString(), reason, editorBound };
  };
  const pointer = () => runtime.onPointer({ composedPath: () => [] });
  return { state, reasons, runtime, recordApply, pointer };
}

test('without the page check every outside pointerdown asks for the apply, as before', () => {
  const { reasons, pointer, recordApply } = harness();
  pointer();
  recordApply(false);
  pointer();
  pointer();
  assert.deepEqual(reasons, Array(3).fill('outside-pointer-syntax-repaint'));
});

test('a page that may have an editor keeps the apply on every outside pointerdown', () => {
  const { reasons, pointer, recordApply } = harness({ pageMayHaveEditor: () => true });
  pointer();
  recordApply(true);
  pointer();
  recordApply(false);
  pointer();
  assert.equal(reasons.length, 3);
});

test('a page with no editor gets one apply, then no more while nothing changes', () => {
  const { reasons, pointer, recordApply } = harness({ pageMayHaveEditor: () => false });
  pointer();
  assert.equal(reasons.length, 1, 'the first pointerdown asks for the apply that finds or cleans up');
  pointer();
  assert.equal(reasons.length, 2, 'the apply has not run yet: asked again');
  recordApply(false);
  pointer();
  pointer();
  pointer();
  assert.equal(reasons.length, 2, 'the apply ran without an editor: nothing left to do');
});

test('an apply that ran for another reason, or with an editor, does not count as the idle apply', () => {
  const { reasons, pointer, recordApply } = harness({ pageMayHaveEditor: () => false });
  pointer();
  recordApply(false, 'coalesced-style-mutation');
  pointer();
  assert.equal(reasons.length, 2, 'not the apply this pointerdown asked for');
  recordApply(true);
  pointer();
  assert.equal(reasons.length, 3, 'the last apply still had an editor: its styles may need removing');
  recordApply(false);
  pointer();
  assert.equal(reasons.length, 3);
});

test('an apply inside the editor-opening window does not count: it skips the cleanup', () => {
  const { state, reasons, pointer, recordApply } = harness({ pageMayHaveEditor: () => false });
  pointer();
  const appliedAt = Date.now();
  recordApply(false, 'coalesced-outside-pointer-syntax-repaint', appliedAt);
  state.editorSentinelLikelyOpeningUntil = appliedAt + 700;
  pointer();
  assert.equal(reasons.length, 2, 'asked again');
  recordApply(false, 'coalesced-outside-pointer-syntax-repaint', appliedAt + 800);
  pointer();
  assert.equal(reasons.length, 2);
});

test('any later apply, and any sign of an editor, makes the next outside pointerdown ask again', () => {
  let mayHaveEditor = false;
  const { reasons, pointer, recordApply } = harness({ pageMayHaveEditor: () => mayHaveEditor });
  pointer();
  recordApply(false);
  pointer();
  assert.equal(reasons.length, 1);

  // An editor was opened and styled with the keyboard only, then closed.
  recordApply(true, 'coalesced-editor-sentinel-new-mutation');
  pointer();
  assert.equal(reasons.length, 2, 'a newer apply: ask once more');
  recordApply(false);
  pointer();
  assert.equal(reasons.length, 2);

  // A dialog is open at the next pointerdown.
  mayHaveEditor = true;
  pointer();
  pointer();
  assert.equal(reasons.length, 4);
  mayHaveEditor = false;
  pointer();
  assert.equal(reasons.length, 5, 'the first pointerdown after the page went idle asks again');
  recordApply(false);
  pointer();
  assert.equal(reasons.length, 5);
});

test('an outside pointerdown still closes an open list when the apply is skipped', () => {
  const { state, reasons, pointer, recordApply } = harness({ pageMayHaveEditor: () => false });
  pointer();
  recordApply(false);
  state.overlay.style.display = 'block';
  pointer();
  assert.equal(reasons.length, 1);
  assert.equal(state.overlay.style.display, 'none');
});
