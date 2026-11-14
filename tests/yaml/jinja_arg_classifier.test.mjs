// The pure Jinja call-argument classifier — the brain that decides "the cursor is in an
// entity-id position" so the live-entity lane can fire. Deterministic, fail-dark, never throws.
// The load-bearing edge: is_state's 2nd arg is a STATE VALUE, not an entity, so it must NOT classify
// as entity (only state_attr's 2nd arg is an attribute position).

import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyJinjaCallArg } from '../../src/yaml/yamlCompletionContext.js';

const EMPTY = { fn: '', argIndex: -1, inStringLiteral: false, expectKind: '' };

test('states(\'  → entity, arg 0, inside a string literal', () => {
  assert.deepEqual(classifyJinjaCallArg("{{ states('"), { fn: 'states', argIndex: 0, inStringLiteral: true, expectKind: 'entity' });
});

test('states( without an open quote → entity, arg 0, not in a literal', () => {
  assert.deepEqual(classifyJinjaCallArg('{{ states('), { fn: 'states', argIndex: 0, inStringLiteral: false, expectKind: 'entity' });
});

test('double-quote symmetry: states("  → entity', () => {
  assert.deepEqual(classifyJinjaCallArg('{{ states("'), { fn: 'states', argIndex: 0, inStringLiteral: true, expectKind: 'entity' });
});

test('is_state(\'  first arg → entity', () => {
  assert.equal(classifyJinjaCallArg("{{ is_state('").expectKind, 'entity');
  assert.equal(classifyJinjaCallArg("{{ is_state('").fn, 'is_state');
});

test('is_state second arg is a STATE VALUE, NOT an entity → empty default', () => {
  assert.deepEqual(classifyJinjaCallArg("{{ is_state('light.kitchen', '"), EMPTY);
});

test('state_attr first arg → entity; second arg → attribute', () => {
  assert.equal(classifyJinjaCallArg("{{ state_attr('").expectKind, 'entity');
  assert.deepEqual(
    classifyJinjaCallArg("{{ state_attr('sensor.temp', '"),
    { fn: 'state_attr', argIndex: 1, inStringLiteral: true, expectKind: 'attribute' },
  );
});

test('expand / area_id / device_id / has_value first arg → entity', () => {
  for (const fn of ['expand', 'area_id', 'device_id', 'has_value']) {
    const r = classifyJinjaCallArg(`{{ ${fn}('`);
    assert.equal(r.fn, fn, fn);
    assert.equal(r.expectKind, 'entity', fn);
  }
});

test('a partial entity id already typed still classifies as entity (arg still open)', () => {
  assert.equal(classifyJinjaCallArg("{{ states('light.kit").expectKind, 'entity');
});

test('a closed call / non-call text → empty default', () => {
  assert.deepEqual(classifyJinjaCallArg("{{ states('light.kitchen') }}"), EMPTY);
  assert.deepEqual(classifyJinjaCallArg('{{ now() }}'), EMPTY);
  assert.deepEqual(classifyJinjaCallArg('key: value'), EMPTY);
  assert.deepEqual(classifyJinjaCallArg(''), EMPTY);
});

test('fail-dark: hostile / non-string input returns the default, never throws', () => {
  assert.deepEqual(classifyJinjaCallArg(undefined), EMPTY);
  assert.deepEqual(classifyJinjaCallArg(null), EMPTY);
  assert.deepEqual(classifyJinjaCallArg(42), EMPTY);
  assert.deepEqual(classifyJinjaCallArg({}), EMPTY);
  assert.deepEqual(classifyJinjaCallArg("states('".repeat(5000)), { fn: 'states', argIndex: 0, inStringLiteral: true, expectKind: 'entity' });
});

test('a closed call does not leak its arg classification onto a later expression', () => {
  // An UNQUOTED arg has no closing quote, so the old [^'"]* pattern ran past ')' and classified
  // every later cursor position as sitting in the call's entity arg.
  assert.deepEqual(classifyJinjaCallArg("{% set x = states(entity_var) %}\n{{ x | float(0) + oth"),
    { fn: '', argIndex: -1, inStringLiteral: false, expectKind: '' });
  assert.deepEqual(classifyJinjaCallArg("{{ state_attr('a.b', attr_var) }} + oth"),
    { fn: '', argIndex: -1, inStringLiteral: false, expectKind: '' });
  // Still detects an OPEN call, quoted or unquoted, and the state_attr 2nd arg.
  assert.equal(classifyJinjaCallArg("{{ states('li").fn, 'states');
  assert.equal(classifyJinjaCallArg("{{ states(sensor.kit").expectKind, 'entity');
  assert.equal(classifyJinjaCallArg("{{ state_attr('light.x', 'bright").argIndex, 1);
});
