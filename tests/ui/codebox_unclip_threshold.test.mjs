// Glow-overflow near-chain un-clip: isNonScrollingClipper decides whether a clipping ancestor (e.g. a
// stack-card editor's div.card-config, overflow:auto) is safe to un-clip so the host-owned glow can spill.
// Real scroll regions (content overflow past the gutter threshold) must be left alone so scrolling is
// never broken. Pure predicate — deterministic, no DOM. Mirrors a measured card-config case.

import test from 'node:test';
import assert from 'node:assert/strict';

import { isNonScrollingClipper } from '../../src/ui/codebox/codeboxUnclip.js';

test('overflow:visible is not a clipper (nothing to un-clip)', () => {
  assert.equal(isNonScrollingClipper({ overflowX: 'visible', overflowY: 'visible', xOver: 0, yOver: 0 }), false);
  assert.equal(isNonScrollingClipper({ overflowX: 'visible', overflowY: 'visible', xOver: 25, yOver: 0 }), false);
});

test('the card-config case: overflow:auto, content fits (xOver≈13 gutter, yOver=0) → safe to un-clip', () => {
  assert.equal(isNonScrollingClipper({ overflowX: 'auto', overflowY: 'auto', xOver: 13, yOver: 0 }), true);
});

test('a genuine scroll region (content overflows past the threshold) is left alone', () => {
  assert.equal(isNonScrollingClipper({ overflowX: 'auto', overflowY: 'auto', xOver: 0, yOver: 200 }), false, 'tall vertical content → real scroller, do not un-clip');
  assert.equal(isNonScrollingClipper({ overflowX: 'scroll', overflowY: 'visible', xOver: 400, yOver: 0 }), false, 'wide horizontal content → real scroller');
});

test('overflow:hidden / clip with a small gutter is still treated as a safe clipper', () => {
  assert.equal(isNonScrollingClipper({ overflowX: 'hidden', overflowY: 'hidden', xOver: 0, yOver: 0 }), true);
  assert.equal(isNonScrollingClipper({ overflowX: 'clip', overflowY: 'visible', xOver: 2, yOver: 0 }), true);
});

test('threshold boundary: <=24px each axis passes, >24 fails', () => {
  assert.equal(isNonScrollingClipper({ overflowX: 'auto', overflowY: 'auto', xOver: 24, yOver: 24 }), true);
  assert.equal(isNonScrollingClipper({ overflowX: 'auto', overflowY: 'auto', xOver: 25, yOver: 0 }), false);
});

test('safe defaults / bad input do not throw and read as not-a-clipper', () => {
  assert.equal(isNonScrollingClipper(), false);
  assert.equal(isNonScrollingClipper({}), false);
});
