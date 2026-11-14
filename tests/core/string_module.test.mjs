import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampNumber,
  compactGpuRendererLabel,
  displayBrowserLabel,
  displayMemoryLabel,
  displayMonitorLabel,
  displayViewportLabel,
  hueLabel,
  percentLabel,
  safeString,
  sliderNumberLabel,
} from '../../src/core/string.js';

test('clampNumber preserves legacy numeric bounds and fallback behavior', () => {
  assert.equal(clampNumber(5, 0, 10, 1), 5);
  assert.equal(clampNumber(-5, 0, 10, 1), 0);
  assert.equal(clampNumber(15, 0, 10, 1), 10);
  assert.equal(clampNumber('7', 0, 10, 1), 7);
  assert.equal(clampNumber('bad', 0, 10, 1), 1);
  assert.equal(clampNumber(undefined, 0, 10, 1), 1);
  assert.equal(clampNumber(NaN, 0, 10, 1), 1);
  // Bug hunt: null/''/whitespace/false/[]/{} must fail dark to the fallback, NOT coerce to a finite 0
  // and clamp to a min>0 bound (which silently over-desaturated themes from corrupt persisted settings).
  for (const bad of [null, '', '   ', false, true, [], [5], {}]) {
    assert.equal(clampNumber(bad, 0.35, 1.85, 1), 1, `${JSON.stringify(bad)} -> fallback`);
  }
});

test('style slider labels preserve legacy display formatting', () => {
  assert.equal(hueLabel(194.6), '195°');
  assert.equal(hueLabel(-12), '0°');
  assert.equal(hueLabel(720), '360°');
  assert.equal(hueLabel('bad'), '0°');

  assert.equal(percentLabel(0.456), '46%');
  assert.equal(percentLabel(-1), '0%');
  assert.equal(percentLabel(3), '100%');
  assert.equal(percentLabel('bad'), '0%');

  assert.equal(sliderNumberLabel(1), '100%');
  assert.equal(sliderNumberLabel(1.234), '123%');
  assert.equal(sliderNumberLabel(-1), '0%');
  assert.equal(sliderNumberLabel(99), '250%');
  assert.equal(sliderNumberLabel('bad'), '100%');
});

test('safeString preserves legacy nullable and truncation behavior', () => {
  assert.equal(safeString('abc'), 'abc');
  assert.equal(safeString(123), '123');
  assert.equal(safeString(null), '');
  assert.equal(safeString(undefined), '');
  assert.equal(safeString('abcdef', 3), 'abc');
  assert.equal(safeString('abcdef', 20), 'abcdef');
});

test('safeString never truncates through a surrogate pair (well-formed output)', () => {
  // A cap that would land between the two units of an astral char (emoji/CJK-ext)
  // must step back so the result is well-formed, not a lone high surrogate.
  const withEmoji = 'a'.repeat(199) + '\u{1F4A1}'; // 199 + a 2-unit code point
  const out = safeString(withEmoji, 200);
  assert.equal(out, 'a'.repeat(199), 'the split astral char is dropped whole, not halved');
  assert.equal(out.isWellFormed(), true);
  // A cap that ends cleanly after a whole astral char keeps it intact.
  assert.equal(safeString('\u{1F4A1}bc', 3), '\u{1F4A1}b');
  assert.equal(safeString('\u{1F4A1}bc', 3).isWellFormed(), true);
});


test('client display labels preserve legacy diagnostics formatting', () => {
  assert.equal(displayMemoryLabel(null), 'RAM: unavailable');
  assert.equal(displayMemoryLabel(undefined), 'RAM: unavailable');
  assert.equal(displayMemoryLabel(0), 'RAM: unavailable');
  assert.equal(displayMemoryLabel(8), 'RAM: 8GB');
  assert.equal(displayMemoryLabel(32), 'RAM: 32GB+');
  assert.equal(displayMemoryLabel('64'), 'RAM: 64GB+');

  assert.equal(displayViewportLabel({ width: 1920, height: 1080, devicePixelRatio: 1 }), '1920x1080 @1x');
  assert.equal(displayViewportLabel({ width: 2560, height: 1440, devicePixelRatio: 1.234 }), '2560x1440 @1.23x');
  assert.equal(displayViewportLabel({ width: '1280', height: '720', devicePixelRatio: '2' }), '1280x720 @2x');
  assert.equal(displayViewportLabel({ width: 0, height: 720, devicePixelRatio: 2 }), 'viewport unavailable');
  assert.equal(displayViewportLabel({ width: 1280, height: 720, devicePixelRatio: 'bad' }), '1280x720 @0x');
  assert.equal(displayViewportLabel({}), 'viewport unavailable');

  assert.equal(displayMonitorLabel({ width: 800, height: 600, devicePixelRatio: 1.5 }), '800x600 @1.5x');
});

test('client GPU and browser display helpers preserve legacy diagnostics formatting', () => {
  assert.equal(compactGpuRendererLabel(''), 'unavailable');
  assert.equal(compactGpuRendererLabel('unavailable'), 'unavailable');
  assert.equal(
    compactGpuRendererLabel('ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 (0x00002B85) Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    'NVIDIA GeForce RTX 5090',
  );
  assert.equal(
    compactGpuRendererLabel('ANGLE (AMD Radeon RX 7900 XTX (0x744C) Direct3D11)'),
    'AMD Radeon RX 7900',
  );
  assert.equal(
    compactGpuRendererLabel('ANGLE (Intel(R) Arc(TM) A770 Graphics, Vulkan 1.3)'),
    'Intel(R) Arc(TM) A770 Graphics',
  );
  assert.equal(compactGpuRendererLabel('Mali-G78 OpenGL ES 3.2'), 'Mali-G78');
  assert.equal(compactGpuRendererLabel('Unknown Renderer [abc] (0x1234) Foo'), 'Unknown Renderer Foo');

  assert.equal(displayBrowserLabel({}), 'unknown');
  assert.equal(
    displayBrowserLabel({ name: 'Not A Brand/Chromium 124/Brave 1.66', platform: 'Win32' }),
    'Brave 1.66 / Windows',
  );
  assert.equal(
    displayBrowserLabel({ name: 'Microsoft Edge 124 / Not.A.Brand 99 / Chromium 124', platform: 'Windows' }),
    'Microsoft Edge 124 / Windows',
  );
  assert.equal(displayBrowserLabel({ name: 'Firefox 126', platform: 'Linux x86_64' }), 'Firefox 126 / Linux x86_64');
  assert.equal(
    displayBrowserLabel({ name: 'Some Very Very Very Very Very Very Long Browser Name That Exceeds Limit', platform: 'unknown' }),
    'Some Very Very Very Very Very Very Long Br',
  );
  assert.equal(displayBrowserLabel({ name: 'Chrome Brand', platform: 'MacIntel' }), 'Chrome / MacIntel');
});

