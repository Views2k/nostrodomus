import test from 'node:test';
import assert from 'node:assert/strict';

import { formatStyleRangeValue, styleRangeGroupTouchesSyntax } from '../../src/ui/settingsRange.js';

test('styleRangeGroupTouchesSyntax is true for any group name that contains "syntax"', () => {
  assert.equal(styleRangeGroupTouchesSyntax('style.syntaxTintHue'), true);
  assert.equal(styleRangeGroupTouchesSyntax('style.syntaxTintSaturation'), true);
  assert.equal(styleRangeGroupTouchesSyntax('syntax'), true);
  assert.equal(styleRangeGroupTouchesSyntax('Syntax'), true);
  assert.equal(styleRangeGroupTouchesSyntax('customSyntaxRange'), true);

  assert.equal(styleRangeGroupTouchesSyntax('style.glowOpacity'), false);
  assert.equal(styleRangeGroupTouchesSyntax('style.surfaceOpacity'), false);
  assert.equal(styleRangeGroupTouchesSyntax(''), false);
  assert.equal(styleRangeGroupTouchesSyntax(null), false);
  assert.equal(styleRangeGroupTouchesSyntax(undefined), false);
  assert.equal(styleRangeGroupTouchesSyntax(123), false);
});


test('formatStyleRangeValue formats hue, glow size, saturation and percent ranges', () => {
  assert.equal(formatStyleRangeValue('hue', 'style.syntaxTintHue', 184.5), '185°');
  assert.equal(formatStyleRangeValue('hue', 'style.syntaxTintHue', -10), '0°');
  assert.equal(formatStyleRangeValue('hue', 'style.syntaxTintHue', 361), '360°');

  assert.equal(formatStyleRangeValue('glow-size', 'style.codeboxGlowSize', 0), '0 · off');
  assert.equal(formatStyleRangeValue('glow-size', 'style.codeboxGlowSize', 8.6), '+9 · outside');
  assert.equal(formatStyleRangeValue('glow-size', 'style.codeboxGlowSize', -8.6), '-9 · inside');

  assert.equal(formatStyleRangeValue('', 'style.codeboxGlowSaturation', 1.25), '125%');
  assert.equal(formatStyleRangeValue(null, 'style.syntaxThemeSaturation', 1.85), '185%');
  assert.equal(formatStyleRangeValue(undefined, 'style.codeboxBorderOpacity', 0.42), '42%');
  assert.equal(formatStyleRangeValue('', 'style.surfaceOpacity', 2), '100%');
});
