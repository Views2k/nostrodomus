import test from 'node:test';
import assert from 'node:assert/strict';

import { createSettingsGeometry } from '../../src/ui/settings/settingsGeometry.js';
import { clampSettingsPosition, clampSettingsSize } from '../../src/ui/settingsPanel.js';

function geometry(settings, viewport = { innerWidth: 1200, innerHeight: 900 }) {
  const state = { settings, settingsPortalHost: null };
  return createSettingsGeometry({ window: viewport, state, clampSettingsPosition, clampSettingsSize, saveSettings: () => {} });
}

test('position clamp keeps the default-width panel fully inside the window', () => {
  const pos = geometry({ settingsSize: null }).clampSettingsPosition({ x: 5000, y: 100 });
  assert.equal(pos.x + 440 <= 1200 - 8, true, `right edge ${pos.x + 440} must stay inside 1200`);
  assert.equal(pos.x, 752);
});

test('position clamp follows the stored panel width', () => {
  const pos = geometry({ settingsSize: { w: 700, h: 500 } }).clampSettingsPosition({ x: 5000, y: 100 });
  assert.equal(pos.x, 1200 - 700 - 8);
});

test('position clamp never goes below the left margin on a narrow window', () => {
  const pos = geometry({ settingsSize: null }, { innerWidth: 360, innerHeight: 640 }).clampSettingsPosition({ x: 300, y: 5000 });
  assert.deepEqual(pos, { x: 8, y: 480 });
});

test('clampSettingsPosition tolerates a missing or invalid width', () => {
  const viewport = { innerWidth: 1200, innerHeight: 900 };
  assert.deepEqual(clampSettingsPosition({ x: 5000, y: 100 }, viewport, NaN), { x: 752, y: 100 });
  assert.deepEqual(clampSettingsPosition({ x: 5000, y: 100 }, viewport, -50), { x: 752, y: 100 });
  assert.deepEqual(clampSettingsPosition(null, viewport), { x: 696, y: 72 });
});

// --- a window smaller than the panel's usual minimum size ---
test('the panel is never wider or taller than the window minus its margins', () => {
  // A 360px-wide phone: a 380px minimum would put the right edge off the screen.
  assert.deepEqual(clampSettingsSize(null, { innerWidth: 360, innerHeight: 640 }), { w: 344, h: 486 });
  assert.deepEqual(clampSettingsSize({ w: 440, h: 700 }, { innerWidth: 360, innerHeight: 640 }), { w: 344, h: 624 });
  assert.deepEqual(clampSettingsSize({ w: 100, h: 100 }, { innerWidth: 360, innerHeight: 640 }), { w: 344, h: 360 });
  // A phone on its side: a 360px minimum would be taller than the window.
  assert.deepEqual(clampSettingsSize(null, { innerWidth: 640, innerHeight: 320 }), { w: 440, h: 304 });
  assert.deepEqual(clampSettingsSize({ w: 100, h: 100 }, { innerWidth: 640, innerHeight: 320 }), { w: 380, h: 304 });
  // The usual minimum still holds wherever it fits.
  assert.deepEqual(clampSettingsSize({ w: 100, h: 100 }, { innerWidth: 396, innerHeight: 376 }), { w: 380, h: 360 });
  assert.deepEqual(clampSettingsSize({ w: 100, h: 100 }, { innerWidth: 1200, innerHeight: 900 }), { w: 380, h: 360 });
  // A floor for windows too small to be of use, so the size is never zero or negative.
  assert.deepEqual(clampSettingsSize({ w: 100, h: 100 }, { innerWidth: 120, innerHeight: 90 }), { w: 200, h: 200 });
});

test('the default position puts the whole panel inside a narrow or short window', () => {
  for (const viewport of [{ innerWidth: 360, innerHeight: 640 }, { innerWidth: 640, innerHeight: 320 }, { innerWidth: 320, innerHeight: 400 }]) {
    const g = geometry({ settingsSize: null, settingsPos: null }, viewport);
    const size = g.clampSettingsSize(null);
    const pos = g.clampSettingsPosition(null);
    const label = `${viewport.innerWidth}x${viewport.innerHeight}`;
    assert.equal(pos.x >= 8 && pos.x + size.w <= viewport.innerWidth - 8, true, `${label}: left and right edges inside (x ${pos.x}, w ${size.w})`);
    assert.equal(pos.y >= 8 && pos.y + size.h <= viewport.innerHeight - 8, true, `${label}: top and bottom edges inside (y ${pos.y}, h ${size.h})`);
  }
  // Where the panel fits below the usual top offset, the default position is unchanged.
  assert.deepEqual(geometry({ settingsSize: null, settingsPos: null }).clampSettingsPosition(null), { x: 696, y: 72 });
  assert.deepEqual(clampSettingsPosition(null, { innerWidth: 640, innerHeight: 320 }, 440, 304), { x: 190, y: 8 });
  assert.deepEqual(clampSettingsPosition(null, { innerWidth: 640, innerHeight: 320 }, 440, NaN), { x: 190, y: 72 }, 'no height given: the usual offset');
  // A position the user chose is kept, also when it leaves part of the panel below the window.
  assert.deepEqual(clampSettingsPosition({ x: 20, y: 150 }, { innerWidth: 640, innerHeight: 320 }, 440, 304), { x: 20, y: 150 });
});
