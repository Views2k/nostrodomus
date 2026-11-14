import test from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeContext } from '../../src/yaml/runtimeContextAdapter.js';
import { snippetProvider } from '../../src/providers/snippetProvider.js';
import { scoreItems } from '../../src/completion/scoring.js';
import { CURSOR, suggestionPipeline } from '../fixtures/suggestionPipeline.mjs';

// The two CSS rule snippets insert a whole `ha-card { ... }` rule. In the CSS text of a style
// block they are offered where a rule can start and for text that their rule starts with (`ha`).
// The words of their labels ("card_mod", "card-mod", "CSS variables") must not match: typing
// `card` inside a rule is the start of `--card-background-color`.

const pipeline = await suggestionPipeline();
const RULE_SNIPPETS = ['snip.card_mod.ha_card', 'snip.card_mod.css.variables'];
const ruleSnippets = items => items.filter(item => RULE_SNIPPETS.includes(item.id)).map(item => item.id);
const STYLE = 'type: tile\ncard_mod:\n  style: |\n';

test('inside a rule, card completes the CSS variable as before', () => {
  for (const marked of [
    `${STYLE}    ha-card {\n      card${CURSOR}\n    }`,
    `${STYLE}    ha-card {\n      ca${CURSOR}\n    }`,
    `${STYLE}    ha-card {\n      color: ca${CURSOR}\n    }`,
    `${STYLE}    ha-card {\n      color: card${CURSOR}\n    }`,
    `${STYLE}    ha-card {\n      background: var(--ha-card-background);\n      c${CURSOR}`,
  ]) {
    const result = pipeline.listAt(marked);
    assert.equal(result.ctx.lang, 'css', marked);
    assert.deepEqual(ruleSnippets(result.items), [], `rule snippets at ${JSON.stringify(marked)}`);
    if (!marked.includes(`      c${CURSOR}`)) {
      assert.equal(result.labels[0], '--card-background-color', `first rows at ${JSON.stringify(marked)}: ${JSON.stringify(result.labels.slice(0, 3))}`);
      assert.ok(pipeline.accept(result).includes(`--card-background-color${CURSOR}`));
    }
  }
});

test('label words do not bring a rule snippet into the list', () => {
  for (const typed of ['card', 'ca', 'css', 'var', 'mod', 'c']) {
    const result = pipeline.listAt(`${STYLE}    ${typed}${CURSOR}`);
    assert.deepEqual(ruleSnippets(result.items), [], `rule snippets for ${typed}`);
  }
});

test('where a rule can start, the start of the rule text finds the rule snippets', () => {
  for (const marked of [
    `${STYLE}    ha${CURSOR}`,
    `${STYLE}    h${CURSOR}`,
    `${STYLE}    ha-card${CURSOR}`,
    `${STYLE}    HA-${CURSOR}`,
    `${STYLE}    .name { color: red; }\n    ha${CURSOR}`,
    `${STYLE}    .name {\n      color: red;\n    }\n    ha${CURSOR}`,
    `type: vertical-stack\ncards:\n  - type: tile\n    card_mod:\n      style: |\n        ha${CURSOR}`,
  ]) {
    const result = pipeline.listAt(marked);
    assert.equal(result.ctx.cssInsideRule, false, marked);
    assert.deepEqual(ruleSnippets(result.items).sort(), [...RULE_SNIPPETS].sort(), `rule snippets at ${JSON.stringify(marked)}`);
    assert.ok(!RULE_SNIPPETS.includes(result.items[0].id) && result.items[0].lang === 'css', 'the library CSS rows still lead');
  }
});

test('inside an open rule and after a property colon no rule snippet is offered', () => {
  for (const marked of [
    `${STYLE}    ha-card {\n      ha${CURSOR}\n    }`,
    `${STYLE}    ha-card {\n      ha${CURSOR}`,
    `${STYLE}    .a { color: red; }\n    ha-card {\n      color: blue;\n      ha${CURSOR}`,
    `${STYLE}    ha-card { ha${CURSOR}`,
    `${STYLE}    color: ha${CURSOR}`,
    `${STYLE}    color:ha${CURSOR}`,
  ]) {
    const result = pipeline.listAt(marked);
    assert.equal(result.ctx.lang, 'css', marked);
    assert.deepEqual(ruleSnippets(result.items), [], `rule snippets at ${JSON.stringify(marked)}`);
  }
});

test('the context says whether the cursor is inside an open rule, in CSS text only', () => {
  const at = doc => detectRuntimeContext(doc, doc.length, { triggerKind: 'typing' });
  assert.equal(at(`${STYLE}    ha`).cssInsideRule, false);
  assert.equal(at(`${STYLE}    ha-card {\n      ha`).cssInsideRule, true);
  assert.equal(at(`${STYLE}    ha-card {\n      color: red;\n    }\n    ha`).cssInsideRule, false);
  assert.equal(at(`${STYLE}    ha-card {\n      color: {{ states('sensor.x') }};\n      ha`).lang, 'css');
  assert.equal(at(`${STYLE}    ha-card {\n      color: {{ states('sensor.x') }};\n      ha`).cssInsideRule, true);
  assert.equal(at(`${STYLE}    @media (min-width: 600px) {\n      ha-card {\n        color: red;\n      }\n      ha`).cssInsideRule, true);
  assert.equal('cssInsideRule' in at('type: tile\nen'), false);
  assert.equal('cssInsideRule' in at('name: "{{ st'), false);
});

test('the completion cache keeps the positions of one line apart', () => {
  const provider = snippetProvider();
  const cache = new Map();
  const settings = { enabledLangs: { yaml: true, css: true }, maxItems: 12 };
  const shown = (doc) => {
    const ctx = detectRuntimeContext(doc, doc.length, { triggerKind: 'typing' });
    return ruleSnippets(scoreItems(ctx, { settings, cache, providerCandidates: () => (provider.canHandle(ctx) ? provider.provide(ctx) : []) }));
  };
  // The same line number, prefix and indentation.
  assert.equal(shown('card_mod:\n  style: |\n    a {}\n    ha').length, 2);
  assert.equal(shown('card_mod:\n  style: |\n    a {\n    ha').length, 0, 'not the cached list of the position outside a rule');
  assert.equal(shown('card_mod:\n  style: |\n    a {}\n    ha').length, 2);
});
