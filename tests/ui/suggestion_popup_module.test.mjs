import test from 'node:test';
import assert from 'node:assert/strict';

import {
  completionAccent,
  completionDetailModel,
  completionPillLabel,
  completionVisualKind,
  iconFor,
  itemDetail,
  itemDocumentation,
  itemKindLabel,
  itemSourceLabel,
  shortItemMeta,
} from '../../src/ui/suggestionPopup.js';

test('suggestion popup helpers label each kind and source and fall back to the raw value', () => {
  assert.equal(itemKindLabel({ type: 'service' }), 'Service');
  assert.equal(itemKindLabel({ type: 'unknown-kind' }), 'unknown-kind');
  assert.equal(itemKindLabel(null), 'Item');

  assert.equal(itemSourceLabel({ source: 'ha-runtime-values' }), 'HA runtime');
  assert.equal(itemSourceLabel({ source: 'snippet-templates' }), 'Snippet');
  assert.equal(itemSourceLabel({ source: 'lovelace-context' }), 'HA context');
  assert.equal(itemSourceLabel({ source: 'static-library' }), 'Library');
  assert.equal(itemSourceLabel({ source: 'custom-provider' }), 'custom-provider');
});

test('suggestion popup metadata and documentation match runtime strings', () => {
  const entity = { source: 'ha-runtime-values', type: 'entity', label: 'light.kitchen', meta: { domain: 'light', friendly: 'Kitchen Light' } };
  assert.equal(shortItemMeta(entity), 'entity / light');
  assert.equal(itemDetail(entity), 'Kitchen Light');
  assert.equal(itemDocumentation(entity), 'Kitchen Light - light.kitchen');

  assert.equal(shortItemMeta({ source: 'snippet-templates', type: 'snippet', meta: { family: 'Lovelace' } }), 'Snippet / Lovelace');
  assert.equal(itemDocumentation({ type: 'snippet', meta: { documentation: 'Insert card.' } }), 'Insert card.');
  assert.equal(itemDocumentation({ type: 'property' }), 'CSS property completion for card_mod and style blocks.');
  assert.equal(itemDocumentation({ type: 'key' }), 'YAML key or Lovelace configuration completion.');
});

test('suggestion popup visual helpers give each kind its icon, pill label and accent colors', () => {
  assert.equal(iconFor({ type: 'snippet' }), 'Sn');
  assert.equal(iconFor({ type: 'property' }), 'Pr');
  assert.equal(iconFor({ type: 'filter' }), '|');
  assert.equal(iconFor({ type: 'tag' }), '<>');

  assert.equal(completionVisualKind({ source: 'ha-runtime-values', type: 'entity' }), 'entity');
  assert.equal(completionVisualKind({ source: 'ha-runtime-values', type: 'service' }), 'service');
  assert.equal(completionVisualKind({ lang: 'css', type: 'key' }), 'css');
  assert.equal(completionVisualKind({ type: 'key' }), 'key');
  assert.equal(completionPillLabel({ type: 'boolean' }), 'Bool');
  assert.equal(completionPillLabel({ type: 'mode' }), 'Mode');

  const accent = completionAccent({ source: 'ha-runtime-values', type: 'entity' }, true);
  assert.equal(accent.fg, 'rgba(170,238,255,.96)');
  assert.equal(accent.left, 'rgba(95,220,255,.80)');
  assert.equal(completionAccent({ type: 'does-not-exist' }).bg, 'rgba(255,255,255,.05)');
});


test('suggestion popup detail model sanitizes docs and exposes selected item fields', () => {
  const model = completionDetailModel({
    type: 'snippet',
    label: 'Unsafe <b>Label</b>',
    meta: { documentation: 'Use `service` <img src=x onerror=alert(1)> safely.' },
  });

  assert.equal(model.icon, 'Sn');
  assert.equal(model.label, 'Unsafe Label');
  assert.equal(model.source, 'Library');
  assert.equal(model.documentation, 'Use `service` safely.');
});
