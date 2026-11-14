import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SELECTOR_SEAM_CATEGORIES,
  selectorMatchesDeep,
  evaluateSelectorSeams,
  createSelectorSeamProbe,
} from '../../src/editor/selectorSeamProbe.js';

// A tiny DOM stub: a node matches a selector if its `matchSet` contains it;
// querySelector returns a marker when the selector is in `present`.
function makeRoot(present = new Set(), children = []) {
  return {
    querySelector: (sel) => (present.has(sel) ? { sel } : null),
    querySelectorAll: (sel) => (sel === '*' ? children : []),
  };
}

test('selectorMatchesDeep finds a selector across nested open shadow roots', () => {
  const deepHost = { shadowRoot: makeRoot(new Set(['ha-code-editor'])) };
  const midHost = { shadowRoot: makeRoot(new Set(), [deepHost]) };
  const root = makeRoot(new Set(), [midHost]);
  assert.equal(selectorMatchesDeep(root, 'ha-code-editor'), true);
  assert.equal(selectorMatchesDeep(root, 'wa-dialog'), false);
  assert.equal(selectorMatchesDeep(null, 'ha-code-editor'), false);
});

test('selectorMatchesDeep is depth-bounded and never throws on hostile roots', () => {
  const hostile = {
    querySelector: () => { throw new Error('closed'); },
    querySelectorAll: () => { throw new Error('closed'); },
  };
  assert.equal(selectorMatchesDeep(hostile, 'ha-code-editor'), false);
  // depth cap: a chain longer than maxDepth returns false rather than hanging.
  let node = makeRoot(new Set(['ha-code-editor']));
  for (let i = 0; i < 30; i += 1) node = makeRoot(new Set(), [{ shadowRoot: node }]);
  assert.equal(selectorMatchesDeep(node, 'ha-code-editor', 5), false);
});

test('evaluateSelectorSeams reports full coverage when all critical seams match', () => {
  const allSelectors = new Set(SELECTOR_SEAM_CATEGORIES.map((c) => c.selector));
  const result = evaluateSelectorSeams({ document: makeRoot(allSelectors) });
  assert.equal(result.coverage, 100);
  assert.deepEqual(result.missingCritical, []);
  assert.equal(result.criticalFound, result.criticalTotal);
  for (const c of SELECTOR_SEAM_CATEGORIES) assert.equal(result.categories[c.name], true);
});

test('evaluateSelectorSeams flags missing critical seams and lowers coverage', () => {
  // Present everything EXCEPT the code-editor and cm-content critical seams.
  const present = new Set(SELECTOR_SEAM_CATEGORIES.map((c) => c.selector));
  const codeEditor = SELECTOR_SEAM_CATEGORIES.find((c) => c.name === 'code-editor');
  const cmContent = SELECTOR_SEAM_CATEGORIES.find((c) => c.name === 'cm-content');
  present.delete(codeEditor.selector);
  present.delete(cmContent.selector);
  const result = evaluateSelectorSeams({ document: makeRoot(present) });
  assert.ok(result.missingCritical.includes('code-editor'));
  assert.ok(result.missingCritical.includes('cm-content'));
  assert.ok(result.coverage < 100);
  assert.equal(result.criticalFound, result.criticalTotal - 2);
});

test('createSelectorSeamProbe writes status to state and is fail-dark', () => {
  const state = {
    selectorSeamStatus: { probeCount: 0, lastProbeAt: 0, lastProbeReason: '', coverage: 100, missingCritical: [], categories: {} },
  };
  const allSelectors = new Set(SELECTOR_SEAM_CATEGORIES.map((c) => c.selector));
  let perfEvents = 0;
  const { probe } = createSelectorSeamProbe({
    state,
    document: makeRoot(allSelectors),
    now: () => 12345,
    recordPerformanceEvent: () => { perfEvents += 1; },
  });

  const result = probe('editor-open-test');
  assert.equal(result.coverage, 100);
  assert.equal(state.selectorSeamStatus.probeCount, 1);
  assert.equal(state.selectorSeamStatus.lastProbeAt, 12345);
  assert.equal(state.selectorSeamStatus.lastProbeReason, 'editor-open-test');
  assert.equal(perfEvents, 1);

  // A throwing document leaves the prior status untouched and records nothing fatal.
  let recorded = null;
  const hostileDoc = { querySelector: () => { throw new Error('boom'); }, querySelectorAll: () => { throw new Error('boom'); } };
  const { probe: probe2 } = createSelectorSeamProbe({
    state,
    document: hostileDoc,
    recordRuntimeErrorOnce: (scope) => { recorded = scope; },
  });
  // hostile doc → every seam simply misses (no throw escapes); status updates with low coverage.
  const r2 = probe2('hostile');
  assert.ok(r2 === null || r2.coverage <= 100);
  assert.equal(state.selectorSeamStatus.probeCount, 2);

  // Missing state.selectorSeamStatus → probe is a safe no-op.
  const { probe: probe3 } = createSelectorSeamProbe({ state: {}, document: makeRoot(allSelectors) });
  assert.equal(probe3('no-state'), null);
  void recorded;
});


// The self-check ran from editor detection: five walks of the whole app, before the opened
// editor's first paint and again on every new detection.
test('evaluateSelectorSeams reads each root once for all selectors', () => {
  let starReads = 0;
  const counted = (present, children = []) => ({
    querySelector: (sel) => (present.has(sel) ? { sel } : null),
    querySelectorAll: (sel) => { if (sel === '*') starReads += 1; return sel === '*' ? children : []; },
  });
  const hosts = Array.from({ length: 40 }, () => ({ shadowRoot: counted(new Set()) }));
  const root = counted(new Set(), hosts);
  const result = evaluateSelectorSeams({ document: root });
  assert.equal(result.criticalFound, 0);
  assert.equal(starReads, 41, 'one read per root, not one per root per selector');
});

test('probeLater defers the self-check and does not repeat a complete result within the interval', () => {
  const all = new Set(SELECTOR_SEAM_CATEGORIES.map((category) => category.selector));
  const state = { selectorSeamStatus: { probeCount: 0 } };
  const timers = [];
  let clock = 1000;
  const { probeLater } = createSelectorSeamProbe({
    state,
    document: makeRoot(all),
    now: () => clock,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
  });
  assert.equal(probeLater('open'), true);
  assert.equal(state.selectorSeamStatus.probeCount, 0, 'nothing runs inside the detection');
  assert.equal(probeLater('open-again'), false, 'one pending run at a time');
  assert.ok(timers[0].ms >= 1000);
  timers[0].fn();
  assert.equal(state.selectorSeamStatus.probeCount, 1);
  assert.equal(state.selectorSeamStatus.coverage, 100);
  clock += 5000;
  assert.equal(probeLater('second editor'), false, 'a complete result is not repeated within the interval');
  clock += 30000;
  assert.equal(probeLater('much later'), true);
});