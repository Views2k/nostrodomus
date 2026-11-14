// Phase 1 universal-completions context resolver — the behavior-neutrality fence.
//
// The whole Phase-1 safety claim rests on this: with the engine flag OFF (the default),
// resolveContext returns the legacy descriptor UNCHANGED (same reference), so the live
// completion path is byte-identical. When ON, it only ADDS fields and never mutates the
// legacy enum fields (lang/valueKind/yamlRole) that the descriptor validator pins.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveContext,
  resolveSurface,
  resolveExpectedKind,
  SURFACES,
  RESOLVED_DESCRIPTOR_VERSION,
} from '../../src/context/contextResolver.js';

function legacyDescriptor() {
  return {
    descriptorVersion: 1,
    lang: 'yaml',
    yamlKey: 'entity_id',
    yamlRole: 'value',
    valueKind: 'entity',
    focusKind: 'entity-list',
    from: 42,
    to: 42,
    wordTo: 47,
    shouldSuggest: true,
  };
}

test('engine OFF (default): returns the base descriptor by REFERENCE, unchanged', () => {
  const base = legacyDescriptor();
  assert.equal(resolveContext({ baseDescriptor: base, engineEnabled: false }), base, 'same reference');
  assert.equal(resolveContext({ baseDescriptor: base }), base, 'engineEnabled omitted → off');
  assert.equal(resolveContext({ baseDescriptor: base, engineEnabled: 'true' }), base, 'truthy non-boolean does NOT enable');
});

test('engine OFF: a supplied surface arg is ignored — still returns the base by reference (P2 byte-identity)', () => {
  const base = legacyDescriptor();
  assert.equal(resolveContext({ baseDescriptor: base, surface: 'devtools-template', engineEnabled: false }), base, 'surface arg cannot force allocation when off');
});

test('fail-dark: bad base descriptor is returned as-is, never throws', () => {
  assert.equal(resolveContext({ baseDescriptor: null, engineEnabled: true }), null);
  assert.equal(resolveContext({ baseDescriptor: undefined, engineEnabled: true }), undefined);
  assert.equal(resolveContext(), undefined, 'no args → undefined, no throw');
  assert.equal(resolveContext({ baseDescriptor: 5, engineEnabled: true }), 5);
});

test('engine ON: preserves every legacy field byte-for-byte and never mutates enum fields', () => {
  const base = legacyDescriptor();
  const snapshot = JSON.parse(JSON.stringify(base));
  const out = resolveContext({ baseDescriptor: base, engineEnabled: true, hostInfo: { isCardDialog: true } });
  assert.notEqual(out, base, 'returns a new object when on');
  for (const key of Object.keys(snapshot)) {
    assert.deepEqual(out[key], snapshot[key], `legacy field ${key} preserved`);
  }
  assert.deepEqual(base, snapshot, 'the input object itself is not mutated');
  assert.equal(out.lang, 'yaml', 'lang untouched');
  assert.equal(out.valueKind, 'entity', 'valueKind untouched');
  assert.equal(out.yamlRole, 'value', 'yamlRole untouched');
});

test('engine ON: adds exactly the new channels', () => {
  const out = resolveContext({ baseDescriptor: legacyDescriptor(), engineEnabled: true, hostInfo: { isCardDialog: true } });
  assert.equal(out.surface, 'card-editor');
  assert.equal(out.expectedKind, 'entity', 'expectedKind aliases valueKind');
  assert.equal(out.language, 'yaml', 'language mirrors lang');
  assert.equal(out.region, null);
  assert.deepEqual(out.replaceRange, { from: 42, to: 47 }, 'replaceRange uses wordTo when present');
  assert.equal(out.signatureTarget, null);
});

test('engine ON: replaceRange falls back to `to` when wordTo absent', () => {
  const base = legacyDescriptor();
  delete base.wordTo;
  const out = resolveContext({ baseDescriptor: base, engineEnabled: true });
  assert.deepEqual(out.replaceRange, { from: 42, to: 42 });
});

test('engine ON: an explicit valid surface overrides hostInfo resolution', () => {
  const out = resolveContext({ baseDescriptor: legacyDescriptor(), engineEnabled: true, surface: 'devtools-template', hostInfo: { isCardDialog: true } });
  assert.equal(out.surface, 'devtools-template');
});

test('an invalid explicit surface is ignored in favor of hostInfo', () => {
  const out = resolveContext({ baseDescriptor: legacyDescriptor(), engineEnabled: true, surface: 'not-a-surface', hostInfo: { panel: 'config-script' } });
  assert.equal(out.surface, 'script');
});

test('RESOLVED_DESCRIPTOR_VERSION and SURFACES are stable contract', () => {
  assert.equal(RESOLVED_DESCRIPTOR_VERSION, 2);
  assert.ok(SURFACES.includes('card-editor') && SURFACES.includes('unknown'));
  assert.ok(Object.isFrozen(SURFACES));
});

test('resolveExpectedKind aliases valueKind and fails dark', () => {
  assert.equal(resolveExpectedKind({ valueKind: 'service' }), 'service');
  assert.equal(resolveExpectedKind({ valueKind: '' }), '');
  assert.equal(resolveExpectedKind({}), '');
  assert.equal(resolveExpectedKind(null), '');
  assert.equal(resolveExpectedKind({ valueKind: 5 }), '', 'non-string → empty');
});

test('resolveSurface mapping table + fail-dark defaults', () => {
  assert.equal(resolveSurface(undefined), 'card-editor', 'no host info → historical default');
  assert.equal(resolveSurface(null), 'card-editor');
  assert.equal(resolveSurface({ isCardDialog: true }), 'card-editor');
  assert.equal(resolveSurface({ surface: 'automation' }), 'automation', 'explicit valid surface honored');
  assert.equal(resolveSurface({ panel: 'developer-tools-template' }), 'devtools-template');
  assert.equal(resolveSurface({ panel: 'developer-tools-action' }), 'devtools-action');
  assert.equal(resolveSurface({ panel: 'developer-tools-service' }), 'devtools-action');
  assert.equal(resolveSurface({ panel: 'config-automation' }), 'automation');
  assert.equal(resolveSurface({ panel: 'config-script' }), 'script');
  assert.equal(resolveSurface({ panel: 'lovelace-raw-config' }), 'raw-dashboard');
  assert.equal(resolveSurface({ panel: 'DEVELOPER-TOOLS-TEMPLATE' }), 'devtools-template', 'case-insensitive');
  assert.equal(resolveSurface({ panel: 'mystery-panel' }), 'unknown', 'unrecognized panel → unknown');
  assert.equal(resolveSurface({ somethingElse: 1 }), 'unknown', 'host present but no usable hint → unknown');
});
