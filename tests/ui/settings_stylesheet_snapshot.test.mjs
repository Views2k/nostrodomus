// Settings panel stylesheet byte-identity snapshot.
//
// makeSettingsStyle() builds the panel's entire CSS as one string, pinned by the
// SHA-256 below. A refactor that moves code must keep it byte-identical: if a
// refactor changes this hash, fix the refactor, not this test. A deliberate CSS
// change updates the hash and the list below.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { createSettingsPanelRuntime } from '../../src/ui/settingsPanelRuntime.js';
import { appendSettingsChildren, createSettingsElement } from '../../src/ui/settingsPanel.js';

// What the pinned stylesheet contains, among the rest:
// - shared base colors, pill radius and mono font as scoped CSS custom properties;
// - one `@media (prefers-reduced-motion: reduce)` block (no section animation or chevron
//   transition) and `.nostrodomus-syntax-theme-summary:focus-visible` in the focus-ring group;
// - scoped --nostrodomus-* custom properties, nostrodomus-* class names, the root IDs
//   nostrodomus-settings-root / nostrodomus-completions-root, and the nostrodomusSectionIn keyframes;
// - --nostrodomus-brand-rgb / --nostrodomus-accent-rgb tokens, so the focus ring, the selected
//   option pills (.nostrodomus-pill.active border and background) and the active syntax theme row
//   follow the codebox accent; their defaults are the blue family;
// - the hue color-bar thumb ring (::-webkit-slider-thumb / ::-moz-range-thumb border) as
//   var(--nostrodomus-color-bar-thumb, white), so it can take the hue under it;
// - a syntax theme option badge that reserves no width when empty (min-width 0), so long theme
//   names fit without widening the menu;
// - settings and popup scrollbars that read --nostrodomus-scrollbar-rgb (fallback: the brand
//   blue), so they follow the codebox scrollbar color while the borders follow the border color.
const FROZEN_STYLE_SHA256 = '54a6999a4488b3069c09dd103e1cde6a78dd7731c4256124d079fed0baec4e8f';
const FROZEN_STYLE_LENGTH = 27494;

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

test('makeSettingsStyle output is byte-identical to the frozen snapshot', () => {
  const runtime = createSettingsPanelRuntime({
    window: { innerWidth: 1200, innerHeight: 900 },
    document: fakeDocument(),
    settingsStorage: { getItem: () => null, setItem: () => {} },
    state: { settings: { style: {} } },
    recordRuntimeErrorOnce: () => {},
    settingsPortalRoot: () => null,
    createSettingsElement,
    appendSettingsChildren,
  });
  const style = runtime.makeSettingsStyle();
  assert.equal(typeof style.textContent, 'string');
  assert.equal(style.textContent.length, FROZEN_STYLE_LENGTH, 'settings stylesheet length changed — CSS content must stay byte-identical');
  const digest = createHash('sha256').update(style.textContent, 'utf8').digest('hex');
  assert.equal(digest, FROZEN_STYLE_SHA256, 'settings stylesheet hash changed — CSS content must stay byte-identical');
});
