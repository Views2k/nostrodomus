import test from 'node:test';
import assert from 'node:assert/strict';

import { createTelemetryHarness } from './telemetry_runtime_harness.mjs';

const HEARTBEAT_MS = 1200;

// Element lists are compared by identity. They are never handed to assert.deepEqual: a mismatch
// would make it print two whole element trees.
function sameElements(a, b) {
  return a.length === b.length && a.every((node, index) => node === b[index]);
}

function editorView(text, cursor) {
  return { dom: {}, state: { doc: { length: text.length, text }, selection: { main: { anchor: cursor, head: cursor } } } };
}

// A Context tab with an editor behind it. compute stands in for the completion runtime: it
// stamps the time, as the real one does, and counts its calls.
function liveHarness() {
  const computes = [];
  const h = createTelemetryHarness({
    state: { view: editorView('type: button', 4), context: { lang: 'yaml', yamlPath: ['type'], shouldSuggest: true, lineNumber: 1, col: 4 } },
    deps: {
      compute: (triggerKind) => { computes.push(triggerKind); h.state.diagnosticsLastComputeAt = Date.now(); },
    },
  });
  h.computes = computes;
  h.heartbeat = () => h.runtime.flushDiagnosticsRefresh('context-inspector-live');
  return h;
}

test('the Context tab heartbeat does not recompute while the editor, text and cursor are unchanged', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const h = liveHarness();
  h.mountContextTab();

  h.heartbeat();
  assert.deepEqual(h.computes, ['context-inspector-live'], 'the first refresh computes once');

  for (let i = 0; i < 5; i += 1) {
    t.mock.timers.tick(HEARTBEAT_MS + 10);
    h.heartbeat();
  }
  assert.equal(h.computes.length, 1, 'five idle heartbeats: no recompute');
  assert.equal(h.state.diagnosticsStats.skippedClean, 5);
  assert.equal(h.state.diagnosticsStats.refreshes, 1);
});

test('the heartbeat recomputes when something the result depends on has changed', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const h = liveHarness();
  h.mountContextTab();
  h.heartbeat();
  const beat = () => { t.mock.timers.tick(HEARTBEAT_MS + 10); h.heartbeat(); return h.computes.length; };
  assert.equal(beat(), 1);

  // The cursor moved.
  h.state.view.state.selection.main.head = 6;
  h.state.view.state.selection.main.anchor = 6;
  assert.equal(beat(), 2, 'a cursor move recomputes');
  assert.equal(beat(), 2);

  // One character replaced by another: the same length and cursor, a different document.
  h.state.view.state = { doc: { length: 12, text: 'type: buttom' }, selection: { main: { anchor: 6, head: 6 } } };
  assert.equal(beat(), 3, 'an edit that keeps the length recomputes');
  assert.equal(beat(), 3);

  // Another editor with the same text and cursor.
  h.state.view = { dom: {}, state: h.state.view.state };
  assert.equal(beat(), 4, 'a different editor recomputes');
  assert.equal(beat(), 4);

  // Home Assistant data arrived, or a setting was saved.
  h.state.runtimeCache = { at: 123, hasHass: true };
  assert.equal(beat(), 5, 'new Home Assistant data recomputes');
  h.state.settingsLastSerialized = '{"keepOpen":true}';
  assert.equal(beat(), 6, 'a saved setting recomputes');
  assert.equal(beat(), 6);
});

test('a refresh asked for by the user or by typing is never skipped', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const h = liveHarness();
  h.mountContextTab();
  h.heartbeat();
  t.mock.timers.tick(500);
  h.runtime.refreshContextInspectorPanel('tab-switch');
  assert.deepEqual(h.computes, ['context-inspector-live', 'tab-switch']);
  t.mock.timers.tick(500);
  h.runtime.refreshContextInspectorPanel('diagnostics-refresh');
  assert.equal(h.computes.length, 3);

  const typing = createTelemetryHarness({
    state: { view: editorView('a', 1) },
    deps: { diagnosticsReasonIsInteractive: reason => /editor-dispatch/.test(reason), compute: (kind) => { typing.calls.push(['compute', kind]); typing.state.diagnosticsLastComputeAt = Date.now(); } },
  });
  typing.mountContextTab();
  typing.runtime.flushDiagnosticsRefresh('editor-dispatch');
  typing.runtime.flushDiagnosticsRefresh('editor-dispatch');
  assert.equal(typing.calls.filter(call => call[0] === 'compute').length, 2, 'an editor change refreshes each time');
});

test('an unchanged Context tab is not rewritten, and a change rewrites only the rows that changed', () => {
  const h = createTelemetryHarness({ state: { context: { lang: 'yaml', yamlPath: ['type'], shouldSuggest: true, lineNumber: 1, col: 4 } } });
  const { section } = h.mountContextTab();
  const body = section.querySelector('[data-context-inspector-live]').querySelector('.nostrodomus-diagnostic-card-body');
  const rowsBefore = [...body.children];
  const valuesBefore = rowsBefore.map(row => row.children[1]);
  const label = row => row.children[0].textContent;
  const cursorRow = rowsBefore.find(row => label(row) === 'Cursor');
  assert.equal(cursorRow.children[1].textContent, 'line 1, col 4');

  h.runtime.updateContextInspectorPanel();
  assert.equal(sameElements([...body.children], rowsBefore), true, 'the rows are the same elements: nothing was removed and added again');
  assert.equal(sameElements([...body.children].map(row => row.children[1]), valuesBefore), true);

  h.state.context = { ...h.state.context, col: 9 };
  h.runtime.updateContextInspectorPanel();
  assert.equal(sameElements([...body.children], rowsBefore), true, 'still the same elements after a change');
  assert.equal(cursorRow.children[1].textContent, 'line 1, col 9');
  assert.equal(rowsBefore.find(row => label(row) === 'YAML path').children[1].textContent, 'type');

  // The live region announces changed values; the time stamp row is kept out of it.
  assert.equal(body.getAttribute('aria-live'), 'polite');
  assert.equal(rowsBefore.find(row => label(row) === 'Updated').getAttribute('aria-live'), 'off');
  assert.equal(cursorRow.getAttribute('aria-live'), null);
});

test('the Suggestion Quality rows are updated in place as well', () => {
  const item = { label: 'light.kitchen', type: 'entity', source: 'ha-values', score: 80 };
  const h = createTelemetryHarness({ state: { context: { lang: 'yaml', shouldSuggest: true }, items: [item] } });
  const { section } = h.mountContextTab();
  const body = section.querySelector('[data-suggestion-quality-body]');
  const grid = body.children[0];
  const metricsBefore = [...grid.children];
  const metric = name => [...grid.children].find(node => node.children[0].textContent === name);
  assert.equal(metric('Visible suggestions').children[1].textContent, '1 / 12');

  h.runtime.updateSuggestionQualityPanel();
  assert.equal(body.children[0] === grid, true);
  assert.equal(sameElements([...grid.children], metricsBefore), true, 'unchanged: the same elements');

  h.state.items = [item, { ...item, label: 'light.hall' }];
  h.runtime.updateSuggestionQualityPanel();
  assert.equal(sameElements([...grid.children], metricsBefore), true);
  assert.equal(metric('Visible suggestions').children[1].textContent, '2 / 12');
  assert.equal(metric('Updated').getAttribute('aria-live'), 'off');

  // A row that comes and goes ("Why empty") changes the shape: the block is rebuilt.
  h.state.items = [];
  h.state.context = { lang: 'yaml', shouldSuggest: false, idleReason: 'waiting' };
  h.runtime.updateSuggestionQualityPanel();
  const rebuilt = body.children[0];
  assert.equal([...rebuilt.children].some(node => node.children[0].textContent === 'Why empty'), true);
});
