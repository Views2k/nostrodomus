// The codebox colors on a light Home Assistant theme and with a dark-text syntax preset.
//
// Before this, the surface was always a see-through near-black and the base text always #d4d4d4:
// on a light theme the code was light gray on a light gray surface, and the Parchment and Mist
// presets painted dark tokens on the dark surface.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  codeboxReadableStyleTokens,
  codeboxStyleBuildRootCss,
  codeboxStyleTokensFromSettings,
  cssColorIsDark,
} from '../../src/ui/codeboxStyle.js';
import { createAppSettingsAdapters } from '../../src/composition/appAdapters.js';
import { STYLE_SYNTAX_PRESETS } from '../../src/ui/settingsStyle.js';

const STYLE = {
  scrollbarStyleEnabled: true,
  codeboxFrameEnabled: true,
  codeboxSurfaceEnabled: true,
  scrollbarHue: 195,
  scrollbarSaturation: 1.05,
  scrollbarOpacity: 0.5,
  codeboxSurfaceHue: 210,
  codeboxSurfaceSaturation: 0.72,
  codeboxSurfaceOpacity: 0.35,
  codeboxBorderHue: 198,
  codeboxBorderSaturation: 0.92,
  codeboxBorderOpacity: 0.7,
  codeboxGlowHue: 198,
  codeboxGlowSaturation: 1,
  codeboxGlowOpacity: 0.6,
  codeboxGlowSize: -100,
};

const ROOT_CSS_INPUT = {
  scrollbarThumb: 'thumb',
  scrollbarTrack: 'track',
  frameBorder: 'border',
  frameGlow: 'glow',
  frameGlowSoft: 'glow-soft',
  frameGlowInner: 'inner',
  frameGlowInnerSoft: 'inner-soft',
  frameGlowOuter: 'outer',
  frameGlowOuterSoft: 'outer-soft',
  editorSurface: 'surface',
  size: { value: '14px' },
  syntaxFilter: 'none',
  thumbBorder: 'thumb-border',
};

test('cssColorIsDark reads the color formats a computed style and a preset use', () => {
  assert.equal(cssColorIsDark('rgb(20, 20, 20)'), true);
  assert.equal(cssColorIsDark('rgba(33, 33, 33, 0.87)'), true);
  assert.equal(cssColorIsDark('rgb(225 225 225)'), false);
  assert.equal(cssColorIsDark('#4f3c17'), true);
  assert.equal(cssColorIsDark('#d4d4d4'), false);
  assert.equal(cssColorIsDark('#fff'), false);
  assert.equal(cssColorIsDark('color(srgb 0.1 0.1 0.1)'), null);
  assert.equal(cssColorIsDark(''), null);
  assert.equal(cssColorIsDark(undefined), null);
});

test('a dark theme with a light-text preset keeps every color the codebox always had', () => {
  const tokens = codeboxStyleTokensFromSettings(STYLE);
  const readable = codeboxReadableStyleTokens(STYLE, tokens, { themeIsLight: false, textIsDark: false, textColor: '#d4d4d4' });
  for (const key of Object.keys(tokens)) assert.equal(readable[key], tokens[key], key);
  assert.equal(readable.syntaxFg, '#d4d4d4');
  assert.equal(readable.gutterColor, 'rgba(201, 209, 217, 0.52)');
  assert.equal(readable.caretColor, '');
  assert.equal(readable.activeLineWash, 'rgba(255, 255, 255, 0.045)');
  assert.equal(readable.resultPaneSurface, tokens.editorSurface);
});

test('a light theme with a light-text preset gets a nearly opaque dark surface and a light caret', () => {
  const tokens = codeboxStyleTokensFromSettings(STYLE);
  const readable = codeboxReadableStyleTokens(STYLE, tokens, { themeIsLight: true, textIsDark: false });
  assert.equal(tokens.editorSurface, 'hsla(210, 36%, 8%, 0.350)');
  assert.equal(readable.editorSurface, 'hsla(210, 36%, 8%, 0.920)');
  assert.equal(readable.syntaxFg, '#d4d4d4');
  assert.equal(readable.caretColor, '#d4d4d4');
  assert.equal(readable.gutterColor, 'rgba(201, 209, 217, 0.52)');
  // The template tool's Result pane shows the theme's own dark text, so it keeps the plain surface.
  assert.equal(readable.resultPaneSurface, 'hsla(210, 36%, 8%, 0.350)');
  // A surface the user already made more opaque than the minimum keeps the user's value.
  const opaque = { ...STYLE, codeboxSurfaceOpacity: 0.97 };
  assert.equal(
    codeboxReadableStyleTokens(opaque, codeboxStyleTokensFromSettings(opaque), { themeIsLight: true, textIsDark: false }).editorSurface,
    'hsla(210, 36%, 8%, 0.970)',
  );
});

test('a dark-text preset gets its own text color and a light surface', () => {
  const tokens = codeboxStyleTokensFromSettings(STYLE);
  const onDark = codeboxReadableStyleTokens(STYLE, tokens, { themeIsLight: false, textIsDark: true, textColor: '#4f3c17' });
  assert.equal(onDark.syntaxFg, '#4f3c17');
  assert.equal(onDark.caretColor, '#4f3c17');
  assert.equal(onDark.gutterColor, 'rgba(36, 41, 47, 0.58)');
  assert.equal(onDark.activeLineWash, 'rgba(0, 0, 0, 0.055)');
  assert.equal(onDark.editorSurface, 'hsla(210, 36%, 94%, 0.920)');
  assert.equal(onDark.thumbBorder, 'hsla(210, 25%, 94%, 0.920)');
  // Over a light theme the light surface keeps the opacity the user chose.
  const onLight = codeboxReadableStyleTokens(STYLE, tokens, { themeIsLight: true, textIsDark: true, textColor: '#4f3c17' });
  assert.equal(onLight.editorSurface, 'hsla(210, 36%, 94%, 0.350)');
  assert.equal(onLight.syntaxFg, '#4f3c17');
});

test('a surface the user switched off stays off', () => {
  const off = { ...STYLE, codeboxSurfaceEnabled: false };
  const tokens = codeboxStyleTokensFromSettings(off);
  const readable = codeboxReadableStyleTokens(off, tokens, { themeIsLight: true, textIsDark: true, textColor: '#17334f' });
  assert.equal(readable.editorSurface, 'transparent');
  assert.equal(readable.thumbBorder, tokens.thumbBorder);
  assert.equal(readable.syntaxFg, '#17334f');
});

test('a switched-off surface is still drawn where the text could not be read without it', () => {
  const off = { ...STYLE, codeboxSurfaceEnabled: false };
  const tokens = codeboxStyleTokensFromSettings(off);
  // Light text on a light page.
  const lightOnLight = codeboxReadableStyleTokens(off, tokens, { themeIsLight: true, textIsDark: false });
  assert.equal(lightOnLight.editorSurface, 'hsla(210, 36%, 8%, 0.920)');
  // Dark text on a dark page.
  const darkOnDark = codeboxReadableStyleTokens(off, tokens, { themeIsLight: false, textIsDark: true, textColor: '#17334f' });
  assert.equal(darkOnDark.editorSurface, 'hsla(210, 36%, 94%, 0.920)');
  // A dark theme with light text: off stays off, and nothing else changes.
  const plain = codeboxReadableStyleTokens(off, tokens, { themeIsLight: false, textIsDark: false });
  assert.equal(plain.editorSurface, 'transparent');
  assert.equal(plain.caretColor, '');
});

test('the root CSS takes the text, line number and caret colors, and is unchanged without them', () => {
  const plain = codeboxStyleBuildRootCss(ROOT_CSS_INPUT);
  assert.match(plain, /\.cm-foldGutter \{\s*color: rgba\(201, 209, 217, 0\.52\) !important;/);
  assert.doesNotMatch(plain, /\.cm-cursor/);
  assert.doesNotMatch(plain, /caret-color/);
  assert.match(plain, /ha-card\.render-pane \{[^}]*--nostrodomus-codebox-surface: surface;/);

  const adjusted = codeboxStyleBuildRootCss({
    ...ROOT_CSS_INPUT,
    syntaxFg: '#4f3c17',
    gutterColor: 'gutter-color',
    caretColor: '#4f3c17',
    resultPaneSurface: 'pane-surface',
  });
  assert.match(adjusted, /--nostrodomus-codebox-syntax-fg: #4f3c17;/);
  assert.match(adjusted, /\.cm-foldGutter \{\s*color: gutter-color !important;\s*-webkit-text-fill-color: gutter-color !important;/);
  assert.match(adjusted, /\.cm-cursor \{\s*border-left-color: #4f3c17 !important;/);
  // Home Assistant hides the native caret and draws .cm-cursor, so no caret-color is set.
  assert.doesNotMatch(adjusted, /caret-color/);
  assert.match(adjusted, /ha-card\.render-pane \{[^}]*--nostrodomus-codebox-surface: pane-surface;/);
  // The editor's own surface variable still carries the editor surface.
  assert.match(adjusted, /\[data-nostrodomus-codebox-style="1"\] \{[^}]*--nostrodomus-codebox-surface: surface;/);
});

test('the tokens the runtimes receive follow the measured theme and the chosen preset', () => {
  const state = { codeboxThemeIsLight: false, settings: { style: {} } };
  const adapters = createAppSettingsAdapters({
    defaultSettings: { style: { ...STYLE, syntaxTintPreset: 'vscodeDarkPlus' } },
    getState: () => state,
    settingsRuntime: {},
  });
  const dark = adapters.codeboxStyleTokensFromSettings({ ...STYLE });
  assert.equal(dark.editorSurface, 'hsla(210, 36%, 8%, 0.350)');
  assert.equal(dark.caretColor, '');

  state.codeboxThemeIsLight = true;
  const light = adapters.codeboxStyleTokensFromSettings({ ...STYLE });
  assert.equal(light.editorSurface, 'hsla(210, 36%, 8%, 0.920)');

  state.codeboxThemeIsLight = false;
  for (const key of ['parchment', 'mist']) {
    const preset = adapters.codeboxStyleTokensFromSettings({ ...STYLE, syntaxTintPreset: key });
    assert.equal(preset.syntaxFg, STYLE_SYNTAX_PRESETS[key].fg, key);
    assert.equal(preset.editorSurface, 'hsla(210, 36%, 94%, 0.920)', key);
  }
  // Every other preset paints light text and keeps the dark surface.
  for (const key of Object.keys(STYLE_SYNTAX_PRESETS)) {
    if (key === 'parchment' || key === 'mist') continue;
    const preset = adapters.codeboxStyleTokensFromSettings({ ...STYLE, syntaxTintPreset: key });
    assert.equal(preset.editorSurface, 'hsla(210, 36%, 8%, 0.350)', key);
    assert.equal(preset.syntaxFg, '#d4d4d4', key);
  }
});
