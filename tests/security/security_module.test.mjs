import test from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml } from '../../src/core/security.js';

test('escapeHtml preserves existing runtime escaping behavior', () => {
  assert.equal(escapeHtml('<div class="x">A & B</div>'), '&lt;div class=&quot;x&quot;&gt;A &amp; B&lt;/div&gt;');
  assert.equal(escapeHtml('already &amp; escaped'), 'already &amp;amp; escaped');
  assert.equal(escapeHtml("single ' quote"), "single ' quote");
});

test('escapeHtml preserves String coercion behavior for nullish and primitive values', () => {
  assert.equal(escapeHtml(null), 'null');
  assert.equal(escapeHtml(undefined), 'undefined');
  assert.equal(escapeHtml(123), '123');
  assert.equal(escapeHtml(true), 'true');
});
