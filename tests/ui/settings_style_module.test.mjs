import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DARKPLUS_SYNTAX_COLORS,
  STYLE_HUE_DEFAULTS,
  STYLE_SYNTAX_PRESETS,
  STYLE_TEXT_SIZE_PRESETS,
  effectiveStyleSettings,
  resolveSyntaxTintSettings,
  stylePresetValue,
  syntaxColorWithOpacity,
  syntaxThemeOptions,
  syntaxThemePalette,
} from '../../src/ui/settingsStyle.js';

test('settings style preset value preserves v31.6.255 key, fallback, and first-value behavior', () => {
  const presets = {
    compact: { fontSize: '12px' },
    normal: { fontSize: '14px' },
    large: { fontSize: '16px' },
  };

  assert.deepEqual(stylePresetValue(presets, 'compact', 'normal'), { fontSize: '12px' });
  assert.deepEqual(stylePresetValue(presets, 'missing', 'normal'), { fontSize: '14px' });
  assert.deepEqual(stylePresetValue(presets, 'missing', 'alsoMissing'), { fontSize: '12px' });
});

test('settings style preset value preserves v31.6.255 truthy/falsy branch behavior', () => {
  const values = {
    first: 'first-value',
    empty: '',
    zero: 0,
    fallback: 'fallback-value',
  };

  assert.equal(stylePresetValue(values, 'empty', 'fallback'), 'fallback-value');
  assert.equal(stylePresetValue(values, 'zero', 'fallback'), 'fallback-value');
  assert.equal(stylePresetValue(values, 'missing', 'missingFallback'), 'first-value');
});


test('effective style settings merge preserves v31.6.256 default/current branch behavior', () => {
  const defaults = { glow: true, opacity: 0.8, syntaxTintEnabled: false };
  assert.deepEqual(effectiveStyleSettings(defaults, { opacity: 0.5 }), {
    glow: true,
    opacity: 0.5,
    syntaxTintEnabled: false,
  });
  assert.deepEqual(effectiveStyleSettings(defaults, null), defaults);
  assert.deepEqual(effectiveStyleSettings(defaults, undefined), defaults);
});

test('effective style settings merge preserves legacy falsy current-style behavior', () => {
  const defaults = { enabled: true };
  assert.deepEqual(effectiveStyleSettings(defaults, 0), defaults);
  assert.deepEqual(effectiveStyleSettings(defaults, ''), defaults);
  assert.deepEqual(effectiveStyleSettings(defaults, false), defaults);
});


test('syntaxThemeOptions preserves legacy option label mapping behavior', () => {
  const presets = {
    vscodeDarkPlus: { label: 'VS Code Dark+' },
    customNoLabel: { baseHue: 123 },
  };
  assert.deepEqual(syntaxThemeOptions(presets), [
    { key: 'vscodeDarkPlus', label: 'VS Code Dark+' },
    { key: 'customNoLabel', label: 'customNoLabel' },
  ]);
});


test('settings style module owns bounded preset catalogs', () => {
  assert.equal(STYLE_TEXT_SIZE_PRESETS.normal.value, '13.5px');
  assert.equal(STYLE_HUE_DEFAULTS.syntax, 325);
  assert.ok(Object.keys(STYLE_SYNTAX_PRESETS).length >= 16);
  assert.equal(DARKPLUS_SYNTAX_COLORS.fg, '#d4d4d4');
});

test('syntax theme palette preserves Dark+ defaults and non-Dark+ distinct roles', () => {
  const dark = syntaxThemePalette(STYLE_SYNTAX_PRESETS.vscodeDarkPlus, 1);
  assert.equal(dark.fg, '#d4d4d4');
  assert.equal(dark.key, '#9cdcfe');
  assert.equal(dark.string, '#ce9178');

  const aurora = syntaxThemePalette(STYLE_SYNTAX_PRESETS.jade, 1.1);
  assert.equal(Object.keys(aurora).length, Object.keys(dark).length);
  assert.notEqual(aurora.key, aurora.string);
  assert.notEqual(aurora.comment, aurora.keyword);
});

test('resolve syntax tint settings preserves default fallback and opacity bounds', () => {
  const resolved = resolveSyntaxTintSettings(
    { syntaxTintPreset: 'missing', syntaxThemeOpacity: 2, syntaxTintOpacity: 99, syntaxThemeSaturation: 1 },
    { syntaxTintPreset: 'vscodeDarkPlus', syntaxTintHue: 325, syntaxTintSaturation: 1, syntaxTintOpacity: 0.32, syntaxThemeOpacity: 1, syntaxThemeSaturation: 1 },
  );
  assert.equal(resolved.presetKey, 'vscodeDarkPlus');
  assert.equal(resolved.themeOpacity, 1);
  assert.equal(resolved.opacity, 0.75);
  assert.equal(resolved.themeSaturation, 1);
  assert.equal(resolved.palette.fg, '#d4d4d4');
});

test('syntax color opacity uses the module-owned Dark+ foreground fallback', () => {
  assert.equal(syntaxColorWithOpacity('', 0.5), 'rgba(212, 212, 212, 0.500)');
});

test('syntaxThemeSaturation is applied exactly once per token, consistently across themes (bug hunt)', () => {
  const cobalt = Object.values(STYLE_SYNTAX_PRESETS).find(p => p.label === 'Cobalt');
  // Single application: at 0.35 the key token desaturates once (43%), not twice (the old bug: 18%).
  assert.equal(syntaxThemePalette(cobalt, 0.35).key, 'hsl(188 43% 77%)');
  // At the default slider (1.0) syntaxColorWithSaturation is a no-op, so it is the raw generated
  // color — byte-identical to before the fix (nothing changes at the default).
  assert.equal(syntaxThemePalette(cobalt, 1).key, 'hsl(188 122% 77%)');
  // Classic (hardcoded hex, never through syntaxHsl) also responds to the slider — the multiplier is
  // now the sole authority in the closing map for both generated and Classic themes.
  const classic = STYLE_SYNTAX_PRESETS.vscodeDarkPlus;
  assert.notEqual(syntaxThemePalette(classic, 1).key, syntaxThemePalette(classic, 0.35).key);
});
