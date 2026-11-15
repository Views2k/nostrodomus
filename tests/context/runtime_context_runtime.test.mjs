import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeContextRuntime, safeFallbackContext } from '../../src/yaml/runtimeContextRuntime.js';

test('runtime context owner injects current settings into active detector', () => {
  const calls = [];
  const state = { settings: { triggerMode: 'auto', minChars: 2 } };
  const runtime = createRuntimeContextRuntime({
    state,
    detectRuntimeContext: (doc, pos, options) => {
      calls.push({ doc, pos, options });
      return { lang: 'yaml', pos, triggerKind: options.triggerKind, settings: options.settings };
    },
  });

  const result = runtime.detectContext('type: custom:mushroom-template-card', 8, 'explicit');
  assert.equal(result.lang, 'yaml');
  assert.equal(result.triggerKind, 'explicit');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].doc, 'type: custom:mushroom-template-card');
  assert.equal(calls[0].pos, 8);
  assert.equal(calls[0].options.settings, state.settings);
});

test('registry lane: registryLaneEnabled rides onto the resolved ctx only when engineV2 + registryLane are on', () => {
  const detect = (doc, pos, options) => ({ lang: 'yaml', pos, options });
  const make = settings => createRuntimeContextRuntime({ state: { settings }, detectRuntimeContext: detect });

  // Engine off → no gate field at all (the base descriptor stays byte-identical).
  const off = make({}).detectContext('area_id: ', 8, 'typing');
  assert.equal(Object.prototype.hasOwnProperty.call(off, 'registryLaneEnabled'), false);

  // Engine on, registryLane off → gate present but false (so the classifier routes nothing).
  const engineOnly = make({ completions: { engineV2: true } }).detectContext('area_id: ', 8, 'typing');
  assert.equal(engineOnly.registryLaneEnabled, false);

  // Engine on + registryLane on → gate true.
  const both = make({ completions: { engineV2: true, registryLane: true } }).detectContext('area_id: ', 8, 'typing');
  assert.equal(both.registryLaneEnabled, true);
});

test('runtime context owner records active detector errors then falls back', () => {
  const errors = [];
  const state = { settings: { triggerMode: 'auto' } };
  const runtime = createRuntimeContextRuntime({
    state,
    recordRuntimeErrorOnce: (scope, err, detail) => errors.push({ scope, message: String(err?.message || err), detail }),
    detectRuntimeContext: () => { throw new Error('active failed'); },
    detectRuntimeContextFallback: (doc, pos, options) => ({ lang: 'yaml', fallback: true, pos, triggerKind: options.triggerKind, settings: options.settings }),
  });

  const result = runtime.detectContext('entity: light.kitchen', 3, 'typing');
  assert.equal(result.fallback, true);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].scope, 'context:runtime-module');
  assert.equal(errors[0].detail.phase, 'detectContext');
});

test('runtime context owner uses safe fallback when fallback detector throws', () => {
  const errors = [];
  const runtime = createRuntimeContextRuntime({
    state: { settings: {} },
    recordRuntimeErrorOnce: (scope, err, detail) => errors.push({ scope, message: String(err?.message || err), detail }),
    detectRuntimeContextFallback: () => { throw new Error('fallback failed'); },
  });

  const result = runtime.detectContextFallback('abc', 99, 'explicit');
  assert.equal(result.lang, 'yaml');
  assert.equal(result.pos, 3);
  assert.equal(result.shouldSuggest, true);
  assert.equal(result.idleReason, '');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].scope, 'context:runtime-module-fallback');
});

test('the safe fallback for a typing request is an idle YAML context that does not suggest', () => {
  const result = safeFallbackContext('', 0, 'typing');
  assert.equal(result.lang, 'yaml');
  assert.equal(result.shouldSuggest, false);
  assert.equal(result.idleReason, '...');
  assert.deepEqual(result.yamlPath, []);
});
