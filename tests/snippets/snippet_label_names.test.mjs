import test from 'node:test';
import assert from 'node:assert/strict';

import { NOSTRODOMUS_SNIPPET_CATALOG } from '../../src/snippets/catalog.js';

// A label names its snippet the way the YAML and Home Assistant name it: the card_mod snippets
// after the card_mod: key they fill, and an automation step after the "perform action" wording
// Home Assistant uses for what it used to call a service call.

test('the labels of the card_mod snippets start with card_mod:', () => {
  const cardMod = NOSTRODOMUS_SNIPPET_CATALOG.filter(snippet => snippet.family === 'card-mod-css');
  assert.equal(cardMod.length, 4, cardMod.map(snippet => snippet.id).join(', '));
  for (const snippet of cardMod) {
    assert.match(snippet.label, /^card_mod: \S/, snippet.id);
    assert.match(snippet.documentation, /^card_mod /, snippet.id);
  }
});

test('the automation action step is labeled action: perform action', () => {
  const step = NOSTRODOMUS_SNIPPET_CATALOG.find(snippet => snippet.id === 'snip.sequence.service');
  assert.equal(step.label, 'action: perform action');
  assert.deepEqual(NOSTRODOMUS_SNIPPET_CATALOG.filter(snippet => /service call/i.test(snippet.label)).map(snippet => snippet.id), []);
});
