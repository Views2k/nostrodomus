import test from 'node:test';
import assert from 'node:assert/strict';

import { activeSnippetContextKinds, snippetProvider, snippetRowsForContext } from '../../src/providers/snippetProvider.js';
import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { scoreItems } from '../../src/completion/scoring.js';
import { prepareInsertText } from '../../src/completion/insertion.js';
import { parseSnippetTemplate } from '../../src/completion/snippets.js';

// The six style snippets are three kinds of text: CSS rules, a whole card_mod: block, and YAML
// for a button-card style block. Each kind is offered only where its text is valid.

const CSS_RULES = ['snip.card_mod.ha_card', 'snip.card_mod.css.variables'];
const CARD_MOD_BLOCKS = ['snip.card_mod.glass_card', 'snip.card_mod.mushroom_chip_row'];
const STYLE_YAML = ['snip.button_card.styles_card', 'snip.button_card.state_styles'];

const provider = snippetProvider();

function at(doc, triggerKind = 'explicit') {
  const ctx = detectRuntimeContext(doc, doc.length, { triggerKind });
  const rows = provider.canHandle(ctx) ? provider.provide(ctx) : [];
  return { ctx, rows, ids: rows.map(row => row.id) };
}

function has(ids, wanted) {
  return wanted.filter(id => ids.includes(id));
}

test('the CSS text of a card_mod style block gets the CSS rule snippets only', () => {
  for (const doc of [
    'type: entities\ncard_mod:\n  style: |\n    ',
    'type: entities\ncard_mod:\n  style: |\n    ha',
    'type: vertical-stack\ncards:\n  - type: tile\n    card_mod:\n      style: |\n        ha-card { color: red; }\n        ',
  ]) {
    const { ctx, ids } = at(doc);
    assert.equal(ctx.lang, 'css', JSON.stringify(doc));
    assert.deepEqual(activeSnippetContextKinds(ctx), ['style-block']);
    assert.deepEqual(has(ids, CSS_RULES), CSS_RULES);
    assert.deepEqual(has(ids, [...CARD_MOD_BLOCKS, ...STYLE_YAML]), []);
    assert.equal(ids.length, CSS_RULES.length, 'no card or automation snippets in CSS text');
  }
});

test('a typed CSS prefix shows the CSS rule snippet in the list', () => {
  const doc = 'type: entities\ncard_mod:\n  style: |\n    ha';
  const { ctx, rows } = at(doc, 'typing');
  const shown = scoreItems(ctx, { settings: { enabledLangs: { yaml: true, css: true }, maxItems: 12 }, providerCandidates: () => rows });
  assert.ok(shown.some(row => row.id === 'snip.card_mod.ha_card'), JSON.stringify(shown.map(row => row.id)));
});

test('a CSS rule snippet keeps the block indentation on every line', () => {
  const doc = 'type: entities\ncard_mod:\n  style: |\n    ha';
  const { ctx, rows } = at(doc, 'typing');
  const row = rows.find(item => item.id === 'snip.card_mod.ha_card');
  const text = doc.slice(0, ctx.from) + parseSnippetTemplate(prepareInsertText(row.insert, ctx, row)).text;
  const cssLines = text.split('\n').slice(3);
  assert.equal(cssLines[0], '    ha-card {');
  assert.equal(cssLines[cssLines.length - 1].trim(), '}');
  // A line with less indentation than the block ends the block scalar.
  assert.ok(cssLines.every(line => line.startsWith('    ')), `a line left the block: ${JSON.stringify(cssLines)}`);
  // The rows of the index are not changed: the next position gets its own indentation.
  const deeper = 'type: vertical-stack\ncards:\n  - type: tile\n    card_mod:\n      style: |\n        ha';
  const deeperRow = at(deeper, 'typing').rows.find(item => item.id === 'snip.card_mod.ha_card');
  assert.ok(deeperRow.insert.split('\n').slice(1).every(line => line.startsWith('        ')));
  assert.ok(row.insert.split('\n').slice(1).every(line => line.startsWith('    ') && !line.startsWith('        }')));
});

test('the completion cache keeps two indentations of one CSS line apart', () => {
  const cache = new Map();
  const settings = { enabledLangs: { yaml: true, css: true }, maxItems: 12 };
  const shownAt = doc => {
    const { ctx, rows } = at(doc, 'typing');
    return scoreItems(ctx, { settings, cache, providerCandidates: () => rows }).find(row => row.id === 'snip.card_mod.ha_card');
  };
  const shallow = shownAt('card_mod:\n  style: |\n    ha');
  const deep = shownAt('card_mod:\n  style: |\n        ha');
  assert.ok(shallow.insert.includes('\n    }') && !shallow.insert.includes('\n        }'));
  assert.ok(deep.insert.includes('\n        }'), 'not the cached row of the other indentation');
});

test('YAML key positions of a style block get the YAML style snippets only', () => {
  for (const doc of [
    'type: custom:button-card\nstyles:\n  ',
    'type: custom:button-card\nstyles:\n  card:\n    ',
    'type: custom:button-card\nstyles:\n  card:\n    - ',
    'type: entities\ncard_mod:\n  ',
    'type: entities\ncard_mod:\n  style:\n    ',
  ]) {
    const { ctx, ids } = at(doc);
    assert.equal(ctx.lang, 'yaml', JSON.stringify(doc));
    assert.ok(activeSnippetContextKinds(ctx).includes('style-block'));
    assert.deepEqual(has(ids, STYLE_YAML), STYLE_YAML, JSON.stringify(doc));
    assert.deepEqual(has(ids, [...CSS_RULES, ...CARD_MOD_BLOCKS]), [], `invalid text offered at ${JSON.stringify(doc)}`);
  }
});

test('a card key position gets the card_mod block snippets next to the card snippets', () => {
  // For text that the card_mod key itself does not match; typing the key name gives the key
  // (tests/snippets/card_mod_key_before_block_snippets.test.mjs).
  for (const doc of [
    'type: entities\nentities:\n  - light.kitchen\nglass',
    'type: entities\ncard-m',
    'type: vertical-stack\ncards:\n  - type: tile\n    entity: light.kitchen\n    card-mo',
  ]) {
    const { ctx, ids } = at(doc);
    assert.ok(activeSnippetContextKinds(ctx).includes('dashboard-root'), JSON.stringify(doc));
    assert.deepEqual(has(ids, CARD_MOD_BLOCKS), CARD_MOD_BLOCKS, JSON.stringify(doc));
    assert.deepEqual(has(ids, [...CSS_RULES, ...STYLE_YAML]), []);
    assert.ok(ids.includes('snip.card.entities'), 'the card snippets are still there');
  }
  for (const doc of ['type: entities\n', 'type: entities\ncar', 'type: entities\ncard_mod']) {
    const { ids } = at(doc);
    assert.deepEqual(has(ids, CARD_MOD_BLOCKS), [], JSON.stringify(doc));
    assert.ok(ids.includes('snip.card.entities'));
  }
});

test('the other snippet lanes are unchanged', () => {
  const idsFor = ctx => snippetRowsForContext({ lang: 'yaml', shouldSuggest: true, yamlRole: 'key', yamlKey: '', yamlPath: [], pathText: '', focusKind: '', valueKind: '', ...ctx }).map(row => row.id);
  assert.ok(idsFor({ yamlPath: ['triggers'], pathText: 'triggers', focusKind: 'trigger-block' }).includes('snip.trigger.state'));
  assert.ok(idsFor({ yamlPath: ['actions'], pathText: 'actions', focusKind: 'automation-action' }).includes('snip.sequence.service'));
  assert.ok(idsFor({ yamlPath: ['target'], pathText: 'target', focusKind: 'target-block' }).includes('snip.target.entity'));
  assert.deepEqual(snippetRowsForContext({ lang: 'js', shouldSuggest: true }), []);
  assert.deepEqual(snippetRowsForContext({ lang: 'css', scope: 'somewhere-else', shouldSuggest: true }), []);
  assert.equal(provider.canHandle({ lang: 'css', scope: 'card-mod-css', shouldSuggest: false }), false);
  assert.equal(provider.canHandle({ lang: 'jinja', shouldSuggest: true }), false);
});
