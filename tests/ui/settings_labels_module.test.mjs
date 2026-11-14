import test from 'node:test';
import assert from 'node:assert/strict';

import { glowSizeLabel, languageLabel } from '../../src/ui/settingsLabels.js';

test('settings language labels preserve v31.6.242 known language labels', () => {
  assert.equal(languageLabel('yaml'), 'YAML / Lovelace');
  assert.equal(languageLabel('css'), 'CSS / card_mod');
  assert.equal(languageLabel('js'), 'JavaScript');
  assert.equal(languageLabel('jinja'), 'Jinja Templates');
  assert.equal(languageLabel('html'), 'HTML');
  assert.equal(languageLabel('python'), 'Python');
});

test('settings language labels preserve v31.6.242 fallback formatting', () => {
  assert.equal(languageLabel('markdown'), 'Markdown');
  assert.equal(languageLabel('card_mod'), 'Card_mod');
  assert.equal(languageLabel(''), '');
  assert.equal(languageLabel(null), 'Null');
  assert.equal(languageLabel(undefined), 'Undefined');
  assert.equal(languageLabel(123), '123');
});


test('settings glow size labels preserve v31.6.252 clamp, rounding, and off behavior', () => {
  assert.equal(glowSizeLabel(0), '0 · off');
  assert.equal(glowSizeLabel(null), '0 · off');
  assert.equal(glowSizeLabel(undefined), '0 · off');
  assert.equal(glowSizeLabel(Number.NaN), '0 · off');
  assert.equal(glowSizeLabel(0.49), '0 · off');
  assert.equal(glowSizeLabel(0.5), '+1 · outside');
  assert.equal(glowSizeLabel(1), '+1 · outside');
  assert.equal(glowSizeLabel('24.6'), '+25 · outside');
  assert.equal(glowSizeLabel(101), '+100 · outside');
  assert.equal(glowSizeLabel(-0.5), '0 · off');
  assert.equal(glowSizeLabel(-0.6), '-1 · inside');
  assert.equal(glowSizeLabel(-1), '-1 · inside');
  assert.equal(glowSizeLabel('-24.6'), '-25 · inside');
  assert.equal(glowSizeLabel(-101), '-100 · inside');
});
