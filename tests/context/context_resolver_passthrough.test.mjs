// The universal-completions context resolver. With the engine flag off (the default),
// resolveContext returns the base descriptor itself, unchanged, so the live completion path does
// not change. With the flag on it only adds fields and never changes the base enum fields
// (lang, valueKind, yamlRole) that the descriptor validator checks.

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

test('with the engine off (the default) the base descriptor itself is returned, unchanged', () => {
  const base = legacyDescriptor();
  assert.equal(resolveContext({ baseDescriptor: base, engineEnabled: false }), base, 'same reference');
  assert.equal(resolveContext({ baseDescriptor: base }), base, 'engineEnabled omitted → off');
  assert.equal(resolveContext({ baseDescriptor: base, engineEnabled: 'true' }), base, 'truthy non-boolean does not enable');
});

test('with the engine off a supplied surface is ignored and the base descriptor itself is returned', () => {
  const base = legacyDescriptor();
  assert.equal(resolveContext({ baseDescriptor: base, surface: 'devtools-template', engineEnabled: false }), base, 'surface arg cannot force allocation when off');
});

test('a bad base descriptor is returned as it is and nothing throws', () => {
  assert.equal(resolveContext({ baseDescriptor: null, engineEnabled: true }), null);
  assert.equal(resolveContext({ baseDescriptor: undefined, engineEnabled: true }), undefined);
  assert.equal(resolveContext(), undefined, 'no args → undefined, no throw');
  assert.equal(resolveContext({ baseDescriptor: 5, engineEnabled: true }), 5);
});

test('with the engine on every base field is kept as it is and the enum fields are not changed', () => {
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

test('with the engine on exactly the new channels are added', () => {
  const out = resolveContext({ baseDescriptor: legacyDescriptor(), engineEnabled: true, hostInfo: { isCardDialog: true } });
  assert.equal(out.surface, 'card-editor');
  assert.equal(out.expectedKind, 'entity', 'expectedKind aliases valueKind');
  assert.equal(out.language, 'yaml', 'language mirrors lang');
  assert.equal(out.region, null);
  assert.deepEqual(out.replaceRange, { from: 42, to: 47 }, 'replaceRange uses wordTo when present');
  assert.equal(out.signatureTarget, null);
});

test('with the engine on replaceRange falls back to `to` when wordTo is absent', () => {
  const base = legacyDescriptor();
  delete base.wordTo;
  const out = resolveContext({ baseDescriptor: base, engineEnabled: true });
  assert.deepEqual(out.replaceRange, { from: 42, to: 42 });
});

test('with the engine on an explicit valid surface overrides the hostInfo surface', () => {
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

test('resolveExpectedKind aliases valueKind and returns the default for bad input', () => {
  assert.equal(resolveExpectedKind({ valueKind: 'service' }), 'service');
  assert.equal(resolveExpectedKind({ valueKind: '' }), '');
  assert.equal(resolveExpectedKind({}), '');
  assert.equal(resolveExpectedKind(null), '');
  assert.equal(resolveExpectedKind({ valueKind: 5 }), '', 'non-string → empty');
});

test('resolveSurface mapping table and its defaults for bad input', () => {
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
