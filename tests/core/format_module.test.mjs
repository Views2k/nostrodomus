import test from 'node:test';
import assert from 'node:assert/strict';

import { hexToRgb, hslaFromHue, hslToRgb, rgbToHsl, syntaxColorWithOpacity, syntaxColorWithSaturation, syntaxHsl, syntaxHue } from '../../src/core/format.js';

test('hslaFromHue bounds, rounds and formats the opacity', () => {
  assert.equal(hslaFromHue(195, 1, 64, 1), 'hsla(195, 100%, 64%, 1.000)');
  assert.equal(hslaFromHue(194.6, 0.456, 63.5, 0.3333), 'hsla(195, 46%, 64%, 0.333)');
  assert.equal(hslaFromHue(-12, -1, -10, -1), 'hsla(0, 0%, 0%, 0.000)');
  assert.equal(hslaFromHue(999, 9, 999, 9), 'hsla(360, 250%, 100%, 1.000)');
  assert.equal(hslaFromHue('bad', 'bad', 'bad', 'bad'), 'hsla(195, 100%, 64%, 1.000)');
});

test('hexToRgb parses short, long and invalid colors', () => {
  assert.deepEqual(hexToRgb('#abc'), [170, 187, 204]);
  assert.deepEqual(hexToRgb('abc'), [170, 187, 204]);
  assert.deepEqual(hexToRgb('#A1B2C3'), [161, 178, 195]);
  assert.deepEqual(hexToRgb('  #00ff7f  '), [0, 255, 127]);
  assert.equal(hexToRgb('#abcd'), null);
  assert.equal(hexToRgb('not-a-color'), null);
  assert.equal(hexToRgb(null), null);
  assert.equal(hexToRgb(undefined), null);
});


test('syntaxHue wraps, rounds and falls back', () => {
  assert.equal(syntaxHue(210), 210);
  assert.equal(syntaxHue(359.6), 0);
  assert.equal(syntaxHue(-1), 359);
  assert.equal(syntaxHue(361), 1);
  assert.equal(syntaxHue('42'), 42);
  assert.equal(syntaxHue('bad'), 210);
  assert.equal(syntaxHue(undefined), 210);
});


test('rgbToHsl converts RGB to HSL', () => {
  assert.deepEqual(rgbToHsl(255, 0, 0), [0, 1, 0.5]);
  assert.deepEqual(rgbToHsl(0, 255, 0), [120, 1, 0.5]);
  assert.deepEqual(rgbToHsl(0, 0, 255), [240, 1, 0.5]);
  assert.deepEqual(rgbToHsl(128, 128, 128), [0, 0, 128 / 255]);
});

test('hslToRgb inverts the primaries, grays, hue-wrap, and clamps', () => {
  assert.deepEqual(hslToRgb(0, 1, 0.5), [255, 0, 0]);
  assert.deepEqual(hslToRgb(120, 1, 0.5), [0, 255, 0]);
  assert.deepEqual(hslToRgb(240, 1, 0.5), [0, 0, 255]);
  assert.deepEqual(hslToRgb(0, 0, 0.5), [128, 128, 128]);
  assert.deepEqual(hslToRgb(360, 1, 0.5), [255, 0, 0]);    // hue wraps to 0
  assert.deepEqual(hslToRgb(-120, 1, 0.5), [0, 0, 255]);   // negative hue wraps to 240
  assert.deepEqual(hslToRgb('bad', 5, 5), [255, 255, 255]); // NaN hue -> 0; s/l clamp to 1
});

test('syntaxColorWithSaturation handles HSL, hex, the fallback and the no-op case', () => {
  assert.equal(syntaxColorWithSaturation('#336699', 1), '#336699');
  assert.equal(syntaxColorWithSaturation('  #336699  ', 1), '  #336699  ');
  assert.equal(syntaxColorWithSaturation('#336699', 2), 'hsl(210 93% 40%)');
  assert.equal(syntaxColorWithSaturation('hsl(210 50% 40%)', 2), 'hsl(210 93% 40%)');
  assert.equal(syntaxColorWithSaturation('not-a-color', 1.5), 'not-a-color');
});


test('syntaxHsl formats syntax theme HSL colors', () => {
  assert.equal(syntaxHsl({ baseHue: 210, saturation: 0.9, lightness: 64, saturationMultiplier: 1 }, 44, 3, 0.02), 'hsl(254 92% 67%)');
  assert.equal(syntaxHsl({ baseHue: 359.6, saturation: 2, lightness: 100, saturationMultiplier: 2 }, 3, 10, 0.4), 'hsl(3 185% 84%)');
  assert.equal(syntaxHsl({ baseHue: -5, saturation: -1, lightness: 0, saturationMultiplier: 0 }, 0, -50, -1), 'hsl(355 20% 24%)');
  assert.equal(syntaxHsl(null, 0), 'hsl(210 90% 64%)');
});


test('syntaxColorWithOpacity formats the opacity and falls back', () => {
  assert.equal(syntaxColorWithOpacity('#abc', 0.5), 'rgba(170, 187, 204, 0.500)');
  assert.equal(syntaxColorWithOpacity('#336699', 0.5), 'rgba(51, 102, 153, 0.500)');
  assert.equal(syntaxColorWithOpacity('hsl(210 50% 40%)', 0.5), 'hsl(210 50% 40% / 0.500)');
  assert.equal(syntaxColorWithOpacity('hsl(210 50% 40% / 0.8)', 0.5), 'hsl(210 50% 40% / 0.500)');
  assert.equal(syntaxColorWithOpacity('rgb(51 102 153)', 0.5), 'rgb(51 102 153 / 0.500)');
  assert.equal(syntaxColorWithOpacity('rgb(51 102 153 / 0.8)', 0.5), 'rgb(51 102 153 / 0.500)');
  assert.equal(syntaxColorWithOpacity('var(--x)', 0.5), 'color-mix(in srgb, var(--x) 50%, transparent)');
  assert.equal(syntaxColorWithOpacity('', 0.5), 'rgba(212, 212, 212, 0.500)');
  assert.equal(syntaxColorWithOpacity(null, 0.5, '#ffffff'), 'rgba(255, 255, 255, 0.500)');
  assert.equal(syntaxColorWithOpacity('#336699', 1), '#336699');
  assert.equal(syntaxColorWithOpacity('  #336699  ', 1), '#336699');
  assert.equal(syntaxColorWithOpacity('#336699', 0), 'rgba(51, 102, 153, 0.350)');
});
