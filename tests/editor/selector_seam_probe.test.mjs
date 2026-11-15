import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SELECTOR_SEAM_CATEGORIES,
  selectorsMatchDeep,
  evaluateSelectorSeams,
  createSelectorSeamProbe,
} from '../../src/editor/selectorSeamProbe.js';

// A small DOM stub: querySelector returns a marker when the selector is in `present`, and
// querySelectorAll("*") returns `children`, whose shadowRoot the walk enters.
function makeRoot(present = new Set(), children = []) {
  return {
    querySelector: (sel) => (present.has(sel) ? { sel } : null),
    querySelectorAll: (sel) => (sel === '*' ? children : []),
  };
}

test('selectorsMatchDeep finds selectors across nested open shadow roots', () => {
  const deepHost = { shadowRoot: makeRoot(new Set(['ha-code-editor'])) };
  const midHost = { shadowRoot: makeRoot(new Set(), [deepHost]) };
  const root = makeRoot(new Set(), [midHost]);
  assert.deepEqual([...selectorsMatchDeep(root, ['ha-code-editor', 'wa-dialog'])], ['ha-code-editor']);
  assert.equal(selectorsMatchDeep(null, ['ha-code-editor']).size, 0);
});

test('selectorsMatchDeep is depth-bounded and never throws on roots that cannot be queried', () => {
  const hostile = {
    querySelector: () => { throw new Error('closed'); },
    querySelectorAll: () => { throw new Error('closed'); },
  };
  assert.equal(selectorsMatchDeep(hostile, ['ha-code-editor']).size, 0);
  // A chain deeper than maxDepth is not followed to its end.
  let node = makeRoot(new Set(['ha-code-editor']));
  for (let i = 0; i < 30; i += 1) node = makeRoot(new Set(), [{ shadowRoot: node }]);
  assert.equal(selectorsMatchDeep(node, ['ha-code-editor'], 5).size, 0);
});

test('evaluateSelectorSeams reports full coverage when all critical selectors match', () => {
  const allSelectors = new Set(SELECTOR_SEAM_CATEGORIES.map((c) => c.selector));
  const result = evaluateSelectorSeams({ document: makeRoot(allSelectors) });
  assert.equal(result.coverage, 100);
  assert.deepEqual(result.missingCritical, []);
  assert.equal(result.criticalFound, result.criticalTotal);
  for (const c of SELECTOR_SEAM_CATEGORIES) assert.equal(result.categories[c.name], true);
});

test('evaluateSelectorSeams flags missing critical selectors and lowers coverage', () => {
  // Everything is present except the code-editor and cm-content selectors, both critical.
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

test('createSelectorSeamProbe writes its status to state and never throws', () => {
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

  // A document whose queries throw matches nothing: the probe does not throw and still records
  // a result.
  const hostileDoc = { querySelector: () => { throw new Error('boom'); }, querySelectorAll: () => { throw new Error('boom'); } };
  const { probe: probe2 } = createSelectorSeamProbe({ state, document: hostileDoc });
  const r2 = probe2('hostile');
  assert.ok(r2 === null || r2.coverage <= 100);
  assert.equal(state.selectorSeamStatus.probeCount, 2);

  // Missing state.selectorSeamStatus → probe is a safe no-op.
  const { probe: probe3 } = createSelectorSeamProbe({ state: {}, document: makeRoot(allSelectors) });
  assert.equal(probe3('no-state'), null);
});

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

test('cancel stops a pending self-check', () => {
  const state = { selectorSeamStatus: { probeCount: 0 } };
  const timers = new Map();
  let next = 0;
  const { probeLater, cancel } = createSelectorSeamProbe({
    state,
    document: makeRoot(new Set()),
    setTimeout: (fn) => { next += 1; timers.set(next, fn); return next; },
    clearTimeout: (id) => { timers.delete(id); },
  });
  assert.equal(probeLater('open'), true);
  assert.equal(timers.size, 1);
  cancel();
  assert.equal(timers.size, 0, 'the pending run is cleared');
  assert.equal(state.selectorSeamStatus.probeCount, 0);
  assert.equal(probeLater('reopen'), true, 'a later editor can schedule a new run');
});
