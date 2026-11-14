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

// CSS changes that the pinned hash includes:
// - v0.1.224: shared base colors / pill radius / mono font as scoped CSS custom properties
//   (value-identical).
// - v0.1.226: ONE `@media (prefers-reduced-motion: reduce)` block (section animation + chevron
//   transition → none) and the `.nostrodomus-syntax-theme-summary:focus-visible` selector in the
//   focus-ring group. The default render is unchanged; the new bytes affect only the
//   reduced-motion path and the summary's keyboard focus ring.
// - Scoped --nostrodomus-* custom properties, nostrodomus-* class names, the root IDs
//   nostrodomus-settings-root / nostrodomus-completions-root, and the nostrodomusSectionIn keyframes.
// - v0.1.245: four blue LITERALS became scoped --nostrodomus-brand-rgb / -accent-rgb
//   tokens so the focus ring, the selected-option pills (.nostrodomus-pill.active border +
//   background), and the active syntax-theme-row background follow the user's codebox accent
//   like the rest of the chrome. Token defaults match the prior blue family, so the default
//   render is unchanged; only the values are runtime-overridable.
// - v0.1.246: the hue color-bar thumb's outer ring (::-webkit-slider-thumb / ::-moz-range-thumb border)
//   is var(--nostrodomus-color-bar-thumb, <prior white>) so runtime can tint the ring with
//   the hue under it; the white fallback keeps the default render identical.
// - v0.1.248: (a) the syntax-theme dropdown option badge no longer reserves width when
//   empty (min-width 46->0) and the swatches/gap shrank slightly, so long theme names fit without
//   widening the menu. (b) The settings + popup SCROLLBARS read a separate
//   --nostrodomus-scrollbar-rgb token (literal fallback = the prior brand blue) so they follow the
//   codebox SCROLLBAR color, while borders keep following the border color.
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
