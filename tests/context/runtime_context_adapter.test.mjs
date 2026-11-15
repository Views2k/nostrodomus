import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  contextAdapterYamlKey,
  dashboardActionBranchState,
  detectRuntimeContext,
  isScalarConfigContext,
  lineInfo,
  yamlBlockValueKeyKind,
  yamlFocusKind,
  yamlValueKind,
} from '../../src/yaml/runtimeContextAdapter.js';

const defaultSettings = { triggerMode: 'auto', minChars: 1, suggestInComments: false };

function cursor(sourceWithCursor) {
  const marker = '__CURSOR__';
  const index = sourceWithCursor.indexOf(marker);
  assert.notEqual(index, -1, 'fixture must include __CURSOR__');
  return {
    source: sourceWithCursor.slice(0, index) + sourceWithCursor.slice(index + marker.length),
    pos: index,
  };
}

test('runtime context adapter is pure from browser globals', () => {
  const text = readFileSync('src/yaml/runtimeContextAdapter.js', 'utf8');
  for (const token of ['document', 'window', 'querySelector', 'addEventListener', 'localStorage', 'sessionStorage', 'fetch(', 'sendBeacon', 'eval(', 'new Function']) {
    assert.equal(new RegExp(`\\b${token.replace(/[()]/g, '\\$&')}\\b`).test(text), false, `must not reference ${token}`);
  }
  assert.doesNotMatch(text, /\bstate\s*[.[]/, 'must not read from a runtime state object');
});

test('detectRuntimeContext reads the blank position after tap_action: as an action block', () => {
  const { source, pos } = cursor('tap_action:__CURSOR__');
  const ctx = detectRuntimeContext(source, pos, { triggerKind: 'explicit', settings: defaultSettings });
  assert.equal(ctx.lang, 'yaml');
  assert.equal(ctx.yamlKey, 'tap_action');
  assert.equal(ctx.yamlRole, 'blank');
  assert.equal(ctx.blockValueKind, 'block-key');
  assert.equal(ctx.prefix, '');
  assert.equal(ctx.from, pos);
  assert.equal(ctx.shouldSuggest, true);
  assert.equal(ctx.focusKind, 'action-block');
});

test('runtime context adapter keeps scalar value prefixes and value kinds', () => {
  const { source, pos } = cursor('entity: light.kit__CURSOR__');
  const ctx = detectRuntimeContext(source, pos, { triggerKind: 'typing', settings: defaultSettings });
  assert.equal(ctx.yamlRole, 'value');
  assert.equal(ctx.yamlKey, 'entity');
  assert.equal(ctx.valueKind, 'entity');
  assert.equal(ctx.focusKind, 'entity');
  assert.equal(ctx.prefix, 'light.kit');
  assert.equal(ctx.from, source.indexOf('light.kit'));
  assert.equal(ctx.shouldSuggest, true);
});


test('contextAdapterYamlKey reads the YAML key of a line the way the dry run does', () => {
  assert.equal(contextAdapterYamlKey('entity: light.kitchen'), 'entity');
  assert.equal(contextAdapterYamlKey('  - service: light.turn_on'), 'service');
  assert.equal(contextAdapterYamlKey('-service: light.turn_on'), 'service');
  assert.equal(contextAdapterYamlKey(' label: "Status #1"'), 'label');
  assert.equal(contextAdapterYamlKey('not a key'), '');
  assert.equal(contextAdapterYamlKey(null), '');
});

test('runtime context adapter detects CSS in a card_mod style and Jinja in a template', () => {
  const css = cursor('card_mod:\n  style: |\n    ha-card {\n      color: r__CURSOR__\n    }\n');
  const cssCtx = detectRuntimeContext(css.source, css.pos, { triggerKind: 'typing', settings: defaultSettings });
  assert.equal(cssCtx.lang, 'css');
  assert.equal(cssCtx.scope, 'card-mod-css');

  const jinja = cursor('message: "{{ states(\'sensor.temp\') | ro__CURSOR__ }}"');
  const jinjaCtx = detectRuntimeContext(jinja.source, jinja.pos, { triggerKind: 'typing', settings: defaultSettings });
  assert.equal(jinjaCtx.lang, 'jinja');
  assert.equal(jinjaCtx.scope, 'jinja-template');
});

test('runtime context adapter respects trigger mode and comments', () => {
  const manual = cursor('entity: l__CURSOR__');
  const manualCtx = detectRuntimeContext(manual.source, manual.pos, {
    triggerKind: 'typing',
    settings: { ...defaultSettings, triggerMode: 'manual' },
  });
  // Runtime providerCandidates still enforces manual mode; context should stay truthful.
  assert.equal(manualCtx.shouldSuggest, true);

  const comment = cursor('# entity: light.kitchen__CURSOR__');
  const hidden = detectRuntimeContext(comment.source, comment.pos, { triggerKind: 'explicit', settings: defaultSettings });
  assert.equal(hidden.isComment, true);
  assert.equal(hidden.suppressPopup, true);
  assert.equal(hidden.shouldSuggest, false);
  assert.equal(hidden.yamlRole, 'comment');

  const shown = detectRuntimeContext(comment.source, comment.pos, {
    triggerKind: 'explicit',
    settings: { ...defaultSettings, suggestInComments: true },
  });
  assert.equal(shown.isComment, true);
  assert.equal(shown.suppressPopup, false);
});

test('runtime context helpers classify the line, value kinds, block keys, focus kinds and scalar contexts', () => {
  assert.equal(lineInfo('a\nbc', 3).lineNumber, 2);
  assert.equal(yamlValueKind({ yamlKey: 'action', yamlPath: ['sequence', 'action'], yamlRole: 'value' }), 'service');
  assert.equal(yamlValueKind({ yamlKey: 'action', yamlPath: ['tap_action', 'action'], yamlRole: 'value' }), 'action');
  assert.equal(yamlBlockValueKeyKind({ yamlKey: 'tap_action' }), 'block-key');
  assert.equal(yamlFocusKind({ yamlKey: 'target', yamlPath: ['tap_action', 'target'], yamlRole: 'blank', valueKind: '' }), 'target-block');
  assert.equal(isScalarConfigContext({ lang: 'yaml', yamlRole: 'value', yamlKey: 'unknown_key', valueKind: '' }), true);
});

test('dashboardActionBranchState reports the action branch, its keys and the keys already used', () => {
  const source = 'tap_action:\n  action: call-service\n  service: light.turn_on\n  target:\n    entity_id: light.kitchen\n  data:\n    brightness: 100\n';
  const branch = dashboardActionBranchState(source, source.indexOf('brightness'));
  assert.equal(branch.kind, 'action-block');
  assert.equal(branch.parentKey, 'tap_action');
  assert.equal(branch.actionValue, 'call-service');
  assert.deepEqual(branch.branch.keys, ['service', 'target', 'data', 'confirmation']);
  assert.ok(branch.usedKeys.includes('service'));
});

test('main runtime delegates detectContext through the runtime context owner with fallback', () => {
  const source = readFileSync('src/app.js', 'utf8');
  const snapshotAdapter = readFileSync('src/context/contextSnapshotRuntimeAdapter.js', 'utf8');
  const runtimeOwner = readFileSync('src/yaml/runtimeContextRuntime.js', 'utf8');
  const dist = readFileSync('dist/nostrodomus.js', 'utf8');
  assert.match(snapshotAdapter, /contextAdapterYamlKey/);
  assert.match(snapshotAdapter, /\.\.\/yaml\/runtimeContextAdapter\.js/);
  assert.match(source, /createRuntimeContextRuntime/);
  assert.match(source, /const runtimeContextRuntime = createRuntimeContextRuntime\(\{/);
  assert.doesNotMatch(source, /function detectContextLegacy\(doc, pos, triggerKind = "typing"\)/);
  assert.match(source, /createRuntimeContextRuntimeDelegates\(\(\) => runtimeContextRuntime\)/);
  assert.match(source, /const \{ detectContextFallback, detectContext \} = createRuntimeContextRuntimeDelegates/);
  assert.doesNotMatch(source, /return detectRuntimeContextFromModule\(doc, pos, \{/);
  assert.doesNotMatch(source, /recordRuntimeErrorOnce\("context:runtime-module"/);
  assert.match(runtimeOwner, /recordRuntimeErrorOnce\('context:runtime-module'/);
  assert.match(runtimeOwner, /recordRuntimeErrorOnce\('context:runtime-module-fallback'/);
  assert.doesNotMatch(dist, /from ['"]\.\/yaml\/runtimeContextAdapter\.js['"]/);
  assert.ok(dist.includes('detectRuntimeContext'), 'runtime context adapter should be bundled');
  assert.ok(dist.includes('detectRuntimeContextFallback'), 'runtime context fallback should be bundled');
});


test('runtime context adapter auto-triggers documented autocomplete openings', () => {
  const action = cursor('tap_action:\n  action: __CURSOR__');
  const actionCtx = detectRuntimeContext(action.source, action.pos, { triggerKind: 'typing', settings: defaultSettings });
  assert.equal(actionCtx.afterKeyColon, true);
  assert.equal(actionCtx.valueKind, 'action');
  assert.equal(actionCtx.shouldSuggest, true);

  const jinja = cursor('message: "{{ __CURSOR__"');
  const jinjaCtx = detectRuntimeContext(jinja.source, jinja.pos, { triggerKind: 'typing', settings: defaultSettings });
  assert.equal(jinjaCtx.lang, 'jinja');
  assert.equal(jinjaCtx.shouldSuggest, true);

  const css = cursor('card_mod:\n  style: |\n    ha-card {\n      --__CURSOR__\n    }\n');
  const cssCtx = detectRuntimeContext(css.source, css.pos, { triggerKind: 'typing', settings: defaultSettings });
  assert.equal(cssCtx.lang, 'css');
  assert.equal(cssCtx.prefix, '--');
  assert.equal(cssCtx.shouldSuggest, true);
});

test('runtime context adapter resolves active HACS catalog card type for provider wiring', () => {
  const doc = [
    'type: custom:mini-graph-card',
    'entities:',
    '  - entity: sensor.energy',
    'hours_',
  ].join('\n');
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind: 'typing' });
  assert.equal(ctx.catalogCardType, 'custom:mini-graph-card');
  assert.equal(ctx.catalogSurfaceId, 'mini-graph-card');
});


test('runtime context emits wordTo replace range without eating YAML key colon or entity dots', () => {
  let doc = 'enti|ty_id: light.kitchen';
  let pos = doc.indexOf('|');
  doc = doc.replace('|', '');
  let ctx = detectRuntimeContext(doc, pos, { triggerKind: 'explicit' });
  assert.equal(ctx.prefix, 'enti');
  assert.equal(doc.slice(pos, ctx.wordTo), 'ty_id');
  assert.equal(doc[ctx.wordTo], ':');

  doc = 'entity_id: light.kit|chen';
  pos = doc.indexOf('|');
  doc = doc.replace('|', '');
  ctx = detectRuntimeContext(doc, pos, { triggerKind: 'explicit' });
  assert.equal(ctx.prefix, 'light.kit');
  assert.equal(doc.slice(pos, ctx.wordTo), 'chen');

  doc = 'entity_id: light.kitchen|';
  pos = doc.indexOf('|');
  doc = doc.replace('|', '');
  ctx = detectRuntimeContext(doc, pos, { triggerKind: 'explicit' });
  assert.equal(ctx.wordTo, pos);
});

test('runtime context treats domain-prefixed unknown custom-card values as entity completions', () => {
  const fixture = cursor([
    'type: custom:better-thermostat-ui-card',
    'entity: climate.mts300',
    'indicators:',
    '  humidity: sensor.mts300_humidity',
    '  current_temperature: sensor.mts300_temp__CURSOR__',
  ].join('\n'));
  const ctx = detectRuntimeContext(fixture.source, fixture.pos, {
    triggerKind: 'typing',
    settings: defaultSettings,
    runtimeData: () => ({ entities: ['sensor.mts300_temperature', 'climate.mts300'] }),
  });
  assert.equal(ctx.yamlRole, 'value');
  assert.equal(ctx.yamlKey, 'current_temperature');
  assert.equal(ctx.valueKind, 'entity');
  assert.equal(ctx.focusKind, 'entity');
  assert.equal(ctx.prefix, 'sensor.mts300_temp');
  assert.equal(ctx.shouldSuggest, true);
  assert.notEqual(ctx.idleReason, '...');
});

test('runtime context does not treat ordinary unknown scalar words as entity completions', () => {
  const fixture = cursor('type: custom:some-card\nmode: he__CURSOR__');
  const ctx = detectRuntimeContext(fixture.source, fixture.pos, {
    triggerKind: 'typing',
    settings: defaultSettings,
    runtimeData: () => ({ entities: ['sensor.mts300_temperature', 'climate.mts300'] }),
  });
  assert.equal(ctx.yamlRole, 'value');
  assert.equal(ctx.yamlKey, 'mode');
  assert.notEqual(ctx.valueKind, 'entity');
});

test('explicit Ctrl+Space opens on a key line that already has a colon after the caret', () => {
  // Caret at the start of an existing "icon: home": the colon and value are after the caret, so the
  // prefix is empty and the line looks complete. The existing-key-context guard must not suppress
  // an explicit Ctrl+Space, which always offers suggestions.
  const a = cursor('__CURSOR__icon: home');
  const aExplicit = detectRuntimeContext(a.source, a.pos, { triggerKind: 'explicit', settings: defaultSettings });
  assert.equal(aExplicit.yamlRole, 'key');
  assert.equal(aExplicit.prefix, '');
  assert.equal(aExplicit.shouldSuggest, true);
  assert.notEqual(aExplicit.idleReason, 'existing-key-context');

  // list-key form: caret before an existing "- type: custom"
  const d = cursor('- __CURSOR__type: custom');
  const dExplicit = detectRuntimeContext(d.source, d.pos, { triggerKind: 'explicit', settings: defaultSettings });
  assert.equal(dExplicit.yamlRole, 'list-key');
  assert.equal(dExplicit.shouldSuggest, true);

  // While typing, the same caret stays suppressed (no automatic popup over a complete key line).
  const aTyping = detectRuntimeContext(a.source, a.pos, { triggerKind: 'typing', settings: defaultSettings });
  assert.equal(aTyping.shouldSuggest, false);
  assert.equal(aTyping.idleReason, 'existing-key-context');
});

test('explicit Ctrl+Space opens at a value position without a kind (an entity before its dot)', () => {
  // 'humidity: sens': entity-shaped typing before the dot, so the domain-prefix lane cannot classify
  // it yet and valueKind is ''. Ctrl+Space must still offer suggestions there.
  const a = cursor('type: custom:some-card\nhumidity: sens__CURSOR__');
  const aExplicit = detectRuntimeContext(a.source, a.pos, { triggerKind: 'explicit', settings: defaultSettings });
  assert.equal(aExplicit.yamlRole, 'value');
  assert.equal(aExplicit.valueKind, '');
  assert.equal(aExplicit.prefix, 'sens');
  assert.equal(aExplicit.shouldSuggest, true);
  assert.equal(aExplicit.idleReason, '');

  // Empty kindless value: same else, empty prefix — explicit opens here too.
  const b = cursor('type: custom:some-card\nhumidity: __CURSOR__');
  const bExplicit = detectRuntimeContext(b.source, b.pos, { triggerKind: 'explicit', settings: defaultSettings });
  assert.equal(bExplicit.yamlRole, 'value');
  assert.equal(bExplicit.valueKind, '');
  assert.equal(bExplicit.shouldSuggest, true);

  // While typing, the same cursors stay silent (free-text values must not open suggestions on
  // every keystroke).
  const aTyping = detectRuntimeContext(a.source, a.pos, { triggerKind: 'typing', settings: defaultSettings });
  assert.equal(aTyping.shouldSuggest, false);
  assert.equal(aTyping.idleReason, '...');
  const bTyping = detectRuntimeContext(b.source, b.pos, { triggerKind: 'typing', settings: defaultSettings });
  assert.equal(bTyping.shouldSuggest, false);

  // In a comment an explicit invoke stays closed, whatever the suggestInComments setting says.
  const c = cursor('# note__CURSOR__');
  const cExplicit = detectRuntimeContext(c.source, c.pos, { triggerKind: 'explicit', settings: { ...defaultSettings, suggestInComments: true } });
  assert.equal(cExplicit.yamlRole, 'comment');
  assert.equal(cExplicit.shouldSuggest, false);
});
