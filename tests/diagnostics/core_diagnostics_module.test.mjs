import test from 'node:test';
import assert from 'node:assert/strict';

import {
  boundedRuntimeErrorString,
  safeRuntimeErrorDetail,
} from '../../src/core/diagnostics.js';

test('boundedRuntimeErrorString truncates to the limit, ellipsis included, and turns nullish values into an empty string', () => {
  assert.equal(boundedRuntimeErrorString(null), '');
  assert.equal(boundedRuntimeErrorString(undefined), '');
  assert.equal(boundedRuntimeErrorString('abcdef', 4), 'abc…');
  assert.equal(boundedRuntimeErrorString('abc', 4), 'abc');
  assert.equal(boundedRuntimeErrorString(12345, 4), '123…');
});

test('safeRuntimeErrorDetail keeps primitives, turns array items into strings and other objects into their type name', () => {
  const input = {
    a: 'alpha',
    b: 7,
    c: true,
    d: null,
    e: ['abcdef', { nested: true }, 9],
    f: new Map(),
  };
  const detail = safeRuntimeErrorDetail(input);
  assert.equal(detail.a, 'alpha');
  assert.equal(detail.b, 7);
  assert.equal(detail.c, true);
  assert.equal(detail.d, null);
  assert.deepEqual(detail.e, ['abcdef', '[object Object]', '9']);
  assert.equal(detail.f, 'Map');
});

test('safeRuntimeErrorDetail bounds object entries and non-object detail strings', () => {
  assert.equal(safeRuntimeErrorDetail('abcdef'), 'abcdef');
  const many = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`k${index}`, index]));
  assert.equal(Object.keys(safeRuntimeErrorDetail(many)).length, 16);
});

test('safeRuntimeErrorDetail bounds a long top-level string value (no verbatim retention)', () => {
  const detail = safeRuntimeErrorDetail({ note: 'y'.repeat(1000) });
  assert.equal(detail.note.length, 220);
  assert.ok(detail.note.endsWith('…'));
  // short strings are untouched (byte-identical to before)
  assert.equal(safeRuntimeErrorDetail({ note: 'short' }).note, 'short');
});
