import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SETTINGS,
  SETTINGS_WRITE_KEY,
  cloneDefaultSettings,
  deepMerge,
} from '../../src/core/settings.js';
import { SETTINGS_MIGRATION_LEGACY_KEYS } from '../../src/core/settingsStorageKeys.js';
import { createSettingsRuntime } from '../../src/core/settingsRuntime.js';
import {
  HA_VALUE_PROVIDER_ID,
  LOVELACE_CONTEXT_PROVIDER_ID,
  SNIPPET_PROVIDER_ID,
  STATIC_PROVIDER_ID,
} from '../../src/core/runtimeConstants.js';

test('settings module exports current runtime defaults and storage keys', () => {
  assert.equal(DEFAULT_SETTINGS.mode, 'both');
  assert.equal(DEFAULT_SETTINGS.style.scrollbarStyleEnabled, true);
  assert.equal(DEFAULT_SETTINGS.style.codeboxGlowSize, -100);
  assert.equal(DEFAULT_SETTINGS.style.syntaxTintPreset, 'vscodeDarkPlus');
  assert.equal(DEFAULT_SETTINGS.providers[STATIC_PROVIDER_ID].enabled, true);
  assert.equal(DEFAULT_SETTINGS.providers[SNIPPET_PROVIDER_ID].enabled, true);
  assert.equal(DEFAULT_SETTINGS.providers[LOVELACE_CONTEXT_PROVIDER_ID].enabled, true);
  assert.equal(DEFAULT_SETTINGS.providers[HA_VALUE_PROVIDER_ID].enabled, true);
  assert.equal(SETTINGS_WRITE_KEY, 'nostrodomus.settings');
  assert.equal(SETTINGS_MIGRATION_LEGACY_KEYS.includes(SETTINGS_WRITE_KEY), false);
});

test('cloneDefaultSettings returns an isolated mutable copy', () => {
  const cloned = cloneDefaultSettings();
  cloned.style.codeboxGlowSize = 42;
  cloned.providers[STATIC_PROVIDER_ID].enabled = false;
  assert.equal(DEFAULT_SETTINGS.style.codeboxGlowSize, -100);
  assert.equal(DEFAULT_SETTINGS.providers[STATIC_PROVIDER_ID].enabled, true);
});

test('deepMerge keeps existing shallow runtime merge semantics', () => {
  const merged = deepMerge(DEFAULT_SETTINGS, {
    maxItems: 7,
    style: { codeboxGlowSize: 25 },
    providers: { [STATIC_PROVIDER_ID]: { enabled: false } },
  });
  assert.equal(merged.maxItems, 7);
  assert.equal(merged.style.codeboxGlowSize, 25);
  assert.equal(merged.style.syntaxTintPreset, DEFAULT_SETTINGS.style.syntaxTintPreset);
  assert.deepEqual(merged.providers[STATIC_PROVIDER_ID], { enabled: false });
  assert.equal(DEFAULT_SETTINGS.providers[STATIC_PROVIDER_ID].enabled, true);
});

test('deepMerge drops prototype-polluting keys from stored settings', () => {
  // Simulate a hostile/corrupt localStorage payload: JSON.parse keeps a literal "__proto__" as an
  // own enumerable key, so an unguarded out[key] = value would poison Object.prototype.
  const patch = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"x": 1}, "maxItems": 9}');
  const merged = deepMerge(DEFAULT_SETTINGS, patch);
  assert.equal(merged.maxItems, 9, 'benign keys still merge');
  assert.equal(({}).polluted, undefined, 'Object.prototype must not be polluted');
  assert.equal(merged.polluted, undefined, 'the merged object must not inherit a polluted proto');
  assert.equal(Object.getPrototypeOf(merged), Object.prototype, 'proto chain intact');
  assert.equal(Object.prototype.hasOwnProperty.call(merged, '__proto__'), false, 'no own __proto__ key survives');
  assert.equal(typeof merged.constructor, 'function', 'constructor is not overwritten with data');
});

// --- appended: stored values of the wrong kind are discarded against the defaults ---
test('deepMerge keeps the default when a stored value has the wrong kind', () => {
  const stored = JSON.parse(JSON.stringify({
    enabledLangs: null,
    style: 'dark',
    providers: [],
    completions: 7,
    minChars: '3',
    keepOpen: 'yes',
    mode: 5,
    maxItems: 20,
    settingsPos: { x: 10, y: 20 },
    settingsSize: null,
    futureKey: { anything: true },
  }));
  const merged = deepMerge(DEFAULT_SETTINGS, stored);

  assert.deepEqual(merged.enabledLangs, DEFAULT_SETTINGS.enabledLangs, 'null where an object is expected');
  assert.deepEqual(merged.style, DEFAULT_SETTINGS.style, 'string where an object is expected');
  assert.deepEqual(merged.providers, DEFAULT_SETTINGS.providers, 'array where an object is expected');
  assert.deepEqual(merged.completions, DEFAULT_SETTINGS.completions, 'number where an object is expected');
  assert.equal(merged.minChars, DEFAULT_SETTINGS.minChars, 'string where a number is expected');
  assert.equal(merged.keepOpen, DEFAULT_SETTINGS.keepOpen, 'string where a boolean is expected');
  assert.equal(merged.mode, DEFAULT_SETTINGS.mode, 'number where a string is expected');
  assert.equal(merged.maxItems, 20, 'well-typed values still merge');
  assert.deepEqual(merged.settingsPos, { x: 10, y: 20 }, 'keys with a null default accept an object');
  assert.equal(merged.settingsSize, null);
  assert.deepEqual(merged.futureKey, { anything: true }, 'keys the defaults do not know pass through');
  assert.doesNotThrow(() => Object.keys(merged.enabledLangs));
});

test('deepMerge checks nested values and ignores a non-object payload', () => {
  const merged = deepMerge(DEFAULT_SETTINGS, {
    style: { scrollbarHue: 'red', codeboxGlowSize: 25, syntaxTintEnabled: null },
    enabledLangs: { yaml: 'no', css: false },
    providers: { [STATIC_PROVIDER_ID]: true, 'user.provider': { enabled: false } },
  });
  assert.equal(merged.style.scrollbarHue, DEFAULT_SETTINGS.style.scrollbarHue);
  assert.equal(merged.style.codeboxGlowSize, 25);
  assert.equal(merged.style.syntaxTintEnabled, DEFAULT_SETTINGS.style.syntaxTintEnabled);
  assert.equal(merged.enabledLangs.yaml, true);
  assert.equal(merged.enabledLangs.css, false);
  assert.deepEqual(merged.providers[STATIC_PROVIDER_ID], { enabled: true });
  assert.deepEqual(merged.providers['user.provider'], { enabled: false });

  assert.deepEqual(deepMerge(DEFAULT_SETTINGS, ['a', 'b']), { ...DEFAULT_SETTINGS });
  assert.deepEqual(deepMerge(DEFAULT_SETTINGS, 'text'), { ...DEFAULT_SETTINGS });
});

// --- appended: the glass editor dialog setting ---
test('style.glassDialog is on by default, and a stored choice survives a reload', () => {
  assert.equal(DEFAULT_SETTINGS.style.glassDialog, true);
  assert.equal(cloneDefaultSettings().style.glassDialog, true);

  // What the runtime loads from the settings key, with the real defaults and merge.
  const load = (stored) => {
    const storage = new Map([[SETTINGS_WRITE_KEY, JSON.stringify(stored)]]);
    return createSettingsRuntime({
      storage: {
        getItem: (key) => (storage.has(key) ? storage.get(key) : null),
        setItem: (key, value) => { storage.set(key, String(value)); },
        removeItem: (key) => { storage.delete(key); },
      },
      settingsWriteKey: SETTINGS_WRITE_KEY,
      defaultSettings: DEFAULT_SETTINGS,
      cloneDefaultSettingsImpl: cloneDefaultSettings,
      deepMergeImpl: deepMerge,
    }).loadSettings();
  };
  assert.equal(load({ style: { glassDialog: false } }).style.glassDialog, false, 'turned off stays off');
  assert.equal(load({ style: { glassDialog: true } }).style.glassDialog, true);
  assert.equal(load({ style: { codeboxGlowSize: 25 } }).style.glassDialog, true, 'settings saved before the setting existed get the default');
  assert.equal(load({ style: { glassDialog: 'off' } }).style.glassDialog, true, 'a stored value of the wrong kind is ignored');
  assert.equal(load({ style: { glassDialog: null } }).style.glassDialog, true);
});
