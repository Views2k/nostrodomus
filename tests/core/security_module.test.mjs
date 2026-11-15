import test from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml } from '../../src/core/security.js';

test('escapeHtml escapes <, >, & and " and leaves single quotes', () => {
  assert.equal(escapeHtml('<div class="x">A & B</div>'), '&lt;div class=&quot;x&quot;&gt;A &amp; B&lt;/div&gt;');
  assert.equal(escapeHtml('already &amp; escaped'), 'already &amp;amp; escaped');
  assert.equal(escapeHtml("single ' quote"), "single ' quote");
});

test('escapeHtml turns null, undefined, numbers and booleans into their string form', () => {
  assert.equal(escapeHtml(null), 'null');
  assert.equal(escapeHtml(undefined), 'undefined');
  assert.equal(escapeHtml(123), '123');
  assert.equal(escapeHtml(true), 'true');
});
