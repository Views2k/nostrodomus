import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasSnippetPlaceholders, parseSnippetTemplate } from '../../src/completion/snippets.js';

describe('completion snippets module', () => {
  it('parses numbered and braced placeholders in stable order', () => {
    const parsed = parseSnippetTemplate('service: ${1:light.turn_on}\ntarget:\n  entity_id: $2');
    assert.equal(parsed.text, 'service: light.turn_on\ntarget:\n  entity_id: ');
    assert.deepEqual(parsed.placeholders.map((p) => p.index), [1, 2]);
    assert.deepEqual(parsed.placeholders[0], { index: 1, start: 9, end: 22 });
  });

  it('detects snippet placeholders without matching normal YAML dollars', () => {
    assert.equal(hasSnippetPlaceholders('action: ${1:call-service}'), true);
    assert.equal(hasSnippetPlaceholders('entity_id: $2'), true);
    assert.equal(hasSnippetPlaceholders('price: $ value'), false);
  });

  it('keeps balanced braces in a placeholder default (card_mod CSS / Jinja) without truncating (bug hunt)', () => {
    // Previously the [^}]* default stopped at the first inner `}`, so a card_mod CSS block default
    // lost its closing brace and the rest leaked into the document as literal text.
    const css = parseSnippetTemplate('style: |\n  ${1:.card { color: red; }}');
    assert.equal(css.text, 'style: |\n  .card { color: red; }', 'CSS block default kept whole');
    assert.equal(css.text.slice(css.placeholders[0].start, css.placeholders[0].end), '.card { color: red; }');

    const jinja = parseSnippetTemplate("value: ${1:{{ states('sensor.x') }}}");
    assert.equal(jinja.text, "value: {{ states('sensor.x') }}", 'Jinja expression default kept whole');
    assert.equal(jinja.text.slice(jinja.placeholders[0].start, jinja.placeholders[0].end), "{{ states('sensor.x') }}");

    // A plain (brace-free) default is unaffected.
    const plain = parseSnippetTemplate('x: ${1:plain}');
    assert.equal(plain.text, 'x: plain');
  });
});
