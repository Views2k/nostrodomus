import test from 'node:test';
import assert from 'node:assert/strict';

import { createStyleDomRuntime } from '../../src/ui/styleDomRuntime.js';
import { createCodeboxStyleSettle } from '../../src/ui/codebox/codeboxStyleSettle.js';
import {
  codeboxStyleReasonNeedsSettle,
  codeboxStyleSettleReasonCoalesceDecision,
  codeboxStyleSourceClassSteadyStateSkipDecision,
} from '../../src/ui/codeboxStyle.js';

// Every style reapply request first asks whether the source-class syntax owner already covers it.
// That question started with a visibility check of the remembered editor (a layout read), for
// every reason. The request made by the dispatch hook runs inside CodeMirror's dispatch, right
// after CodeMirror changed the DOM, so the read forced a layout in the middle of each keystroke.

function wire({ visible = true, sourceClass = true, cacheInvalidated = false } = {}) {
  const editor = { querySelector: () => null, visible };
  const counts = { layoutReads: 0 };
  const smartSyntax = [];
  const applies = [];
  let frames = [];
  const state = {
    activeEditorCache: { editor, key: 'editor-1' },
    codeboxStyleCacheInvalidated: cacheInvalidated,
    codeboxStyleLastAppliedAt: 1000,
    codeboxStyleLastEditorKey: 'editor-1',
    codeboxStylePendingReasons: new Set(),
    codeboxStyleSettleTimers: new Set(),
    codeboxStyleReapplyRaf: 0,
  };
  const styleDom = createStyleDomRuntime({
    documentRef: { head: null, documentElement: null, body: null },
    state,
    codeboxStyleSourceClassSteadyStateSkipDecision,
    codeboxEditorCacheKey: () => 'editor-1',
    editorUsesCodeMirrorSourceClassSyntax: () => sourceClass,
    scheduleSourceClassSmartSyntax: (target, reason) => smartSyntax.push([target, reason]),
    visibleStyleEditorCandidate: (candidate) => { counts.layoutReads += 1; return candidate.visible; },
  });
  const settle = createCodeboxStyleSettle({
    state,
    setTimeout: () => 1,
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    recordPerformanceEvent: () => {},
    styleRangeGroupTouchesSyntax: () => false,
    clearStyleRangeLivePreviewCache: () => {},
    scheduleSourceClassSyntaxRefresh: () => {},
    codeboxStyleSettleReasonCoalesceDecision,
    codeboxStyleReasonNeedsSettle,
    maybeSkipSourceClassSteadyStateStyleReapply: (...args) => styleDom.maybeSkipSourceClassSteadyStateStyleReapply(...args),
    applyCodeboxStyleSettings: (reason) => applies.push(reason),
  });
  const runFrame = () => { const run = frames; frames = []; run.forEach((fn) => fn()); };
  return { settle, styleDom, state, editor, counts, smartSyntax, applies, runFrame, pendingFrames: () => frames.length };
}

test('the request made inside the dispatch reads no layout; the read happens on the next frame', () => {
  const h = wire();
  assert.equal(h.settle.scheduleCodeboxStyleReapply('editor-dispatch'), false, 'skipped: the syntax owner covers it');
  assert.equal(h.counts.layoutReads, 0, 'no layout read inside the dispatch');
  assert.deepEqual(h.smartSyntax, [[h.editor, 'style-reapply-skip-editor-dispatch']], 'the syntax pass is requested at once, as before');
  assert.equal(h.state.codeboxStyleSkippedReapply, 1);
  h.runFrame();
  assert.equal(h.counts.layoutReads, 1, 'one visibility check on the frame');
  assert.deepEqual(h.applies, [], 'the editor is visible: nothing else happens');
});

test('several dispatches before a frame share one layout read', () => {
  const h = wire();
  for (let i = 0; i < 4; i += 1) h.settle.scheduleCodeboxStyleReapply('editor-dispatch');
  assert.equal(h.counts.layoutReads, 0);
  assert.equal(h.pendingFrames(), 1);
  h.runFrame();
  assert.equal(h.counts.layoutReads, 1);
});

test('an editor that is no longer visible gets the reapply on that same frame', () => {
  const h = wire({ visible: false });
  assert.equal(h.settle.scheduleCodeboxStyleReapply('editor-dispatch'), false);
  assert.deepEqual(h.applies, []);
  h.runFrame();
  assert.deepEqual(h.applies, ['coalesced-editor-dispatch'], 'the reapply that the visibility check used to schedule');
  assert.equal(h.state.codeboxStylePendingReasons.size, 0);
});

test('a reapply frame that is already pending carries the reason instead of a second apply', () => {
  const h = wire({ visible: false });
  h.settle.scheduleCodeboxStyleReapply('editor-dispatch');
  h.settle.scheduleCodeboxStyleReapply('style-mutation'); // schedules the reapply frame
  h.runFrame();
  assert.equal(h.applies.length, 1);
  assert.match(h.applies[0], /editor-dispatch/);
  assert.match(h.applies[0], /style-mutation/);
});

test('reasons the skip does not apply to read no layout at all', () => {
  for (const reason of ['companion-settle-boot-settle-80ms', 'style-mutation', 'editor-sentinel-new-open', 'settings-toggle']) {
    const h = wire();
    h.settle.scheduleCodeboxStyleReapply(reason);
    assert.equal(h.counts.layoutReads, 0, reason);
    assert.equal(h.state.codeboxStylePendingReasons.has(reason), true, `${reason} is scheduled as before`);
    assert.deepEqual(h.smartSyntax, []);
  }
});

test('a dirty style cache or an inactive syntax owner is answered without a layout read', () => {
  for (const options of [{ cacheInvalidated: true }, { sourceClass: false }]) {
    const h = wire(options);
    assert.notEqual(h.settle.scheduleCodeboxStyleReapply('editor-dispatch'), false, 'not skipped');
    assert.equal(h.counts.layoutReads, 0);
    assert.equal(h.state.codeboxStylePendingReasons.has('editor-dispatch'), true);
    h.runFrame();
    assert.deepEqual(h.applies, ['coalesced-editor-dispatch']);
    assert.equal(h.counts.layoutReads, 0, 'no visibility check was handed over');
  }
});

test('the other steady-state reasons keep the immediate visibility check', () => {
  const visible = wire();
  assert.equal(visible.settle.scheduleCodeboxStyleReapply('remember-view'), false, 'skipped');
  assert.equal(visible.counts.layoutReads, 1);
  assert.equal(visible.pendingFrames(), 0, 'nothing deferred');

  const hidden = wire({ visible: false });
  hidden.settle.scheduleCodeboxStyleReapply('remember-view');
  assert.equal(hidden.counts.layoutReads, 1);
  assert.deepEqual(hidden.smartSyntax, [], 'not skipped');
  assert.equal(hidden.state.codeboxStylePendingReasons.has('remember-view'), true);
});

test('no remembered editor: no skip and no layout read', () => {
  const h = wire();
  h.state.activeEditorCache.editor = null;
  h.settle.scheduleCodeboxStyleReapply('editor-dispatch');
  assert.equal(h.counts.layoutReads, 0);
  assert.equal(h.state.codeboxStylePendingReasons.has('editor-dispatch'), true);
});

test('a visibility check left pending by an uninstall does nothing', () => {
  const h = wire({ visible: false });
  h.settle.scheduleCodeboxStyleReapply('editor-dispatch');
  h.state.enabled = false;
  h.runFrame();
  assert.equal(h.counts.layoutReads, 0);
  assert.deepEqual(h.applies, []);
});
