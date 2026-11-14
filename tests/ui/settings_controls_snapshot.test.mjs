// Settings control-factory structure snapshots.
//
// Structure-only snapshots (tagName + className + dataset keys + children count
// — deliberately NOT full serialization) of every settings DOM control factory,
// built with the real createSettingsElement helper under a stub document. A refactor
// that moves code must keep these snapshots unchanged.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSettingsPanelRuntime } from '../../src/ui/settingsPanelRuntime.js';
import { appendSettingsChildren, createSettingsElement, settingsTitle } from '../../src/ui/settingsPanel.js';
import { glowSizeLabel, languageLabel } from '../../src/ui/settingsLabels.js';
import { clampNumber, hueLabel, percentLabel, sliderNumberLabel } from '../../src/core/string.js';
import { STYLE_SYNTAX_PRESETS, syntaxThemeOptions, syntaxThemePalette } from '../../src/ui/settingsStyle.js';
import { DEFAULT_SETTINGS } from '../../src/core/settings.js';

function fakeDocument() {
  return {
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        className: '',
        id: '',
        textContent: '',
        dataset: {},
        style: { cssText: '' },
        attrs: {},
        children: [],
        setAttribute(name, value) { this.attrs[name] = value; },
        appendChild(child) { this.children.push(child); return child; },
        append(...nodes) { for (const node of nodes) this.children.push(node); },
      };
    },
    createTextNode(text) { return { nodeType: 3, textContent: String(text) }; },
  };
}

function makeRuntime() {
  return createSettingsPanelRuntime({
    window: { innerWidth: 1200, innerHeight: 900 },
    document: fakeDocument(),
    settingsStorage: { getItem: () => null, setItem: () => {} },
    state: { settings: { style: {} } },
    recordRuntimeErrorOnce: () => {},
    settingsPortalRoot: () => null,
    createSettingsElement,
    appendSettingsChildren,
    settingsTitle,
    glowSizeLabel,
    languageLabel,
    clampNumber,
    hueLabel,
    percentLabel,
    sliderNumberLabel,
    DEFAULT_SETTINGS,
    STYLE_SYNTAX_PRESETS,
    syntaxThemeOptions,
    syntaxThemePalette,
  });
}

function shape(node) {
  return {
    tagName: node.tagName,
    className: node.className,
    datasetKeys: Object.keys(node.dataset).sort(),
    childCount: node.children.length,
  };
}

test('optionButton structure snapshot', () => {
  const runtime = makeRuntime();
  assert.deepEqual(shape(runtime.optionButton('Fast', 'fast', 'fast', 'perfMode')), {
    tagName: 'BUTTON', className: 'nostrodomus-pill active', datasetKeys: ['optionGroup', 'optionValue'], childCount: 0,
  });
  assert.deepEqual(shape(runtime.optionButton('Slow', 'slow', 'fast', 'perfMode')), {
    tagName: 'BUTTON', className: 'nostrodomus-pill ', datasetKeys: ['optionGroup', 'optionValue'], childCount: 0,
  });
});

test('colorOptionButton structure snapshot', () => {
  const runtime = makeRuntime();
  const btn = runtime.colorOptionButton('Aurora', 'aurora', 'aurora', 'style.preset', { baseHue: 210, saturation: 1 });
  assert.deepEqual(shape(btn), {
    tagName: 'BUTTON', className: 'nostrodomus-pill nostrodomus-color-choice active', datasetKeys: ['optionGroup', 'optionValue'], childCount: 2,
  });
  assert.equal(btn.children[0].className, 'nostrodomus-color-strip');
});

test('glowSizeLabel formatting snapshot', () => {
  const runtime = makeRuntime();
  assert.equal(runtime.glowSizeLabel(0), '0 · off');
  assert.equal(runtime.glowSizeLabel(24), '+24 · outside');
  assert.equal(runtime.glowSizeLabel(-12), '-12 · inside');
});

test('styleRangeControl structure snapshot', () => {
  const runtime = makeRuntime();
  const card = runtime.styleRangeControl('Glow', 'style.glow', 0.5, 0, 1, 0.05);
  assert.deepEqual(shape(card), {
    tagName: 'DIV', className: 'nostrodomus-settings-card nostrodomus-style-range-card', datasetKeys: [], childCount: 2,
  });
  const [head, input] = card.children;
  assert.deepEqual(shape(head), { tagName: 'DIV', className: 'nostrodomus-style-range-head', datasetKeys: [], childCount: 2 });
  assert.deepEqual(shape(input), { tagName: 'INPUT', className: 'nostrodomus-style-range', datasetKeys: ['rangeFormat', 'styleRange'], childCount: 0 });
  assert.equal(input.value, '0.5');
});

test('styleColorBarControl structure snapshot', () => {
  const runtime = makeRuntime();
  const card = runtime.styleColorBarControl('Hue', 'style.hue', 180);
  assert.deepEqual(shape(card), {
    tagName: 'DIV', className: 'nostrodomus-settings-card nostrodomus-style-range-card nostrodomus-color-bar-card', datasetKeys: [], childCount: 2,
  });
  assert.deepEqual(shape(card.children[1]), { tagName: 'INPUT', className: 'nostrodomus-style-range nostrodomus-color-bar', datasetKeys: ['rangeFormat', 'styleRange'], childCount: 0 });
});

test('styleToggle structure snapshot', () => {
  const runtime = makeRuntime();
  const row = runtime.styleToggle('Enable frame', 'style.frame', true);
  assert.deepEqual(shape(row), {
    tagName: 'LABEL', className: 'nostrodomus-checkbox-row nostrodomus-style-toggle', datasetKeys: [], childCount: 2,
  });
  assert.deepEqual(shape(row.children[0]), { tagName: 'INPUT', className: '', datasetKeys: ['styleToggle'], childCount: 0 });
  assert.equal(row.children[0].checked, true);
});

test('syntaxThemeSelect structure snapshot', () => {
  const runtime = makeRuntime();
  const card = runtime.syntaxThemeSelect('vscodeDarkPlus');
  assert.deepEqual(shape(card), {
    tagName: 'DIV', className: 'nostrodomus-settings-card nostrodomus-style-select-card nostrodomus-syntax-theme-card', datasetKeys: [], childCount: 2,
  });
  const details = card.children[1];
  assert.deepEqual(shape(details), { tagName: 'DETAILS', className: 'nostrodomus-syntax-theme-dropdown', datasetKeys: ['currentTheme'], childCount: 2 });
  assert.equal(details.dataset.currentTheme, 'vscodeDarkPlus');
  const list = details.children[1];
  assert.equal(list.className, 'nostrodomus-syntax-theme-options');
  assert.equal(list.children.length, 37);
});

test('settingsCheckbox structure snapshot', () => {
  const runtime = makeRuntime();
  const row = runtime.settingsCheckbox('Enabled', 'enabled', true);
  assert.deepEqual(shape(row), { tagName: 'LABEL', className: 'nostrodomus-checkbox-row', datasetKeys: [], childCount: 2 });
  assert.deepEqual(shape(row.children[0]), { tagName: 'INPUT', className: '', datasetKeys: ['k'], childCount: 0 });
  const custom = runtime.settingsCheckbox('Other', 'other', false, 'provider');
  assert.deepEqual(Object.keys(custom.children[0].dataset), ['provider']);
  assert.equal(custom.children[0].checked, false);
});

test('settingsGrid structure snapshot', () => {
  const runtime = makeRuntime();
  const doc = fakeDocument();
  const grid = runtime.settingsGrid('1fr 1fr', [doc.createElement('span'), doc.createElement('span')]);
  assert.deepEqual(shape(grid), { tagName: 'DIV', className: '', datasetKeys: [], childCount: 2 });
  assert.equal(grid.style.cssText.includes('grid-template-columns:1fr 1fr'), true);
});

test('settingsCard structure snapshot', () => {
  const runtime = makeRuntime();
  const doc = fakeDocument();
  assert.deepEqual(shape(runtime.settingsCard([doc.createElement('b')])), {
    tagName: 'DIV', className: 'nostrodomus-settings-card', datasetKeys: [], childCount: 1,
  });
  assert.deepEqual(shape(runtime.settingsCard([], 'extra')), {
    tagName: 'DIV', className: 'nostrodomus-settings-card extra', datasetKeys: [], childCount: 0,
  });
});

test('settingsTitle structure snapshot', () => {
  const runtime = makeRuntime();
  const title = runtime.settingsTitle('Providers');
  assert.deepEqual(shape(title), { tagName: 'H3', className: 'nostrodomus-section-title', datasetKeys: [], childCount: 0 });
  assert.equal(title.textContent, 'Providers');
});

test('settingDesc structure snapshot', () => {
  const runtime = makeRuntime();
  const desc = runtime.settingDesc('Helpful copy');
  assert.deepEqual(shape(desc), { tagName: 'DIV', className: 'nostrodomus-setting-desc', datasetKeys: [], childCount: 0 });
  assert.equal(desc.textContent, 'Helpful copy');
});
