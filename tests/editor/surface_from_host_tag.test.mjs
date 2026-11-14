// P2: the host-tag → surface map (the pure core of surface derivation). Also guards that every
// mapped surface id is a real member of contextResolver.SURFACES (they must stay in lockstep, or a
// surface would never be admitted by resolveContext).

import test from 'node:test';
import assert from 'node:assert/strict';

import { HOST_TAG_TO_SURFACE, surfaceFromHostTag } from '../../src/editor/haSelectors.js';
import { SURFACES } from '../../src/context/contextResolver.js';

test('each allowlisted host tag maps to its surface', () => {
  assert.equal(surfaceFromHostTag('developer-tools-template'), 'devtools-template');
  assert.equal(surfaceFromHostTag('developer-tools-action'), 'devtools-action');
  assert.equal(surfaceFromHostTag('developer-tools-event'), 'devtools-action');
  assert.equal(surfaceFromHostTag('ha-panel-developer-tools'), 'devtools-template');
  assert.equal(surfaceFromHostTag('hui-editor'), 'raw-dashboard');
  assert.equal(surfaceFromHostTag('ha-automation-editor'), 'automation');
  assert.equal(surfaceFromHostTag('ha-script-editor'), 'script');
});

test('case-insensitive (tagName comes back uppercased)', () => {
  assert.equal(surfaceFromHostTag('DEVELOPER-TOOLS-TEMPLATE'), 'devtools-template');
  assert.equal(surfaceFromHostTag('HUI-EDITOR'), 'raw-dashboard');
});

test('unknown / hostile input → "unknown", never throws', () => {
  assert.equal(surfaceFromHostTag('some-random-card'), 'unknown');
  assert.equal(surfaceFromHostTag(''), 'unknown');
  assert.equal(surfaceFromHostTag(undefined), 'unknown');
  assert.equal(surfaceFromHostTag(42), 'unknown');
});

test('lockstep: every mapped surface id is a member of SURFACES', () => {
  for (const surface of Object.values(HOST_TAG_TO_SURFACE)) {
    assert.ok(SURFACES.includes(surface), `${surface} must be a declared SURFACE`);
  }
});
