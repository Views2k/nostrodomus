import test from 'node:test';
import assert from 'node:assert/strict';

import { createTelemetryHarness } from './telemetry_runtime_harness.mjs';

test('System Status reports the API aliases and the companion layer as they are now', () => {
  let layer = 'internal';
  const h = createTelemetryHarness({ deps: { companionLayerReadout: () => layer } });
  const card = h.runtime.systemStatusCard({ available: true });
  const rows = h.rows(card);

  assert.equal(rows['Public API'], 'window.__nostrodomus');
  assert.equal(rows['Legacy aliases'], 'none', 'no legacy alias is installed any more');
  assert.equal(rows['Companion layer'], 'internal', 'the companion is part of the runtime; the row shows its live state');
  assert.equal('v17 companion' in rows, false, 'no separate v17 companion resource is expected');
  assert.equal('Companion role' in rows, false);
  assert.equal(card.textContent.includes('v17'), false);
  assert.equal(card.textContent.includes('compatibility-only'), false);

  layer = 'dormant(forced)';
  assert.equal(h.rows(h.runtime.systemStatusCard({ available: true }))['Companion layer'], 'dormant(forced)');

  // The card agrees with the exported payload.
  const data = h.runtime.exportDiagnostics({ redact: true });
  assert.deepEqual(data.apiAliases.legacy, []);
  assert.equal(data.companionLayer, 'dormant(forced)');
});

// The storage probe writes one character. A full store refuses the settings payload and still
// takes the probe, so the row said "writable" while every save failed.
test('the Settings storage row reports a failed save', () => {
  const h = createTelemetryHarness();
  assert.equal(h.runtime.settingsStorageStatus(), 'writable; current');

  h.state.settingsSaveStats.lastWriteError = 'The quota has been exceeded.';
  assert.equal(h.runtime.settingsStorageStatus(), 'last save failed: The quota has been exceeded.');
  assert.equal(h.rows(h.runtime.systemStatusCard({ available: true }))['Settings storage'], 'last save failed: The quota has been exceeded.');

  h.state.settingsSaveStats.lastWriteError = '';
  assert.equal(h.runtime.settingsStorageStatus(), 'writable; current');

  // A store that cannot be written at all is reported as unavailable.
  const blocked = createTelemetryHarness({ deps: { localStorage: { setItem() { throw new Error('denied'); }, removeItem() {} } } });
  assert.equal(blocked.runtime.settingsStorageStatus(), 'unavailable: denied');
});

// The Refresh button of the tab swaps in the cards of a fresh build; it finds them by this class.
test('the Diagnostics tab markup has one card grid, apart from its buttons', () => {
  const h = createTelemetryHarness();
  const nodes = h.runtime.diagnosticsMarkup();
  const grids = nodes.filter(node => node.classList.contains('nostrodomus-diagnostics-grid'));
  assert.equal(grids.length, 1);
  assert.equal(grids[0].querySelectorAll('.nostrodomus-diagnostic-card').length, 7);
  assert.equal(grids[0].querySelector('[data-diag-refresh]') === null, true, 'the buttons are outside the grid');
  assert.equal(nodes.some(node => node.querySelector?.('[data-diag-refresh]')), true);
});

test('the Settings storage row says so when there is no store', () => {
  const h = createTelemetryHarness({ deps: { localStorage: null } });
  assert.equal(h.runtime.settingsStorageStatus(), 'unavailable: storage is blocked in this browser');
  assert.deepEqual(h.calls.filter(call => call[0] === 'error'), [], 'a blocked store is a state, not a runtime error');
});
