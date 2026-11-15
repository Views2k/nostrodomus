import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreItems } from '../../src/completion/scoring.js';

// The incremental prefix filter reuses the previous result as its candidates. When that result hit
// the maxItems cap, the best row for the longer prefix may have been cut off and would never come
// back (the popup would go blank while typing), so the scorer recomputes from the providers when the
// previous result was at or over the cap.
function entityRows(n) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    rows.push({ id: `e${i}`, lang: 'yaml', type: 'entity', label: `sensor.room_${String(i).padStart(2, '0')}`, insert: `sensor.room_${i}`, source: 'ha-runtime-values', meta: {} });
  }
  rows.push({ id: 'sw', lang: 'yaml', type: 'entity', label: 'switch.wall', insert: 'switch.wall', source: 'ha-runtime-values', meta: {} });
  return rows;
}

test('narrowing past a truncated result recomputes and keeps the now-best match', () => {
  const settings = { enabledLangs: { yaml: true }, maxItems: 40 };
  const cands = entityRows(45); // 45 sensors outrank 1 switch → switch is sliced at the cap
  const ctx1 = { lang: 'yaml', yamlRole: 'value', yamlKey: 'entity', valueKind: 'entity', pathText: 'entities', scope: 'entities', shouldSuggest: true, triggerKind: 'typing', isTriggerChar: true, prefix: 's' };
  const step1 = scoreItems(ctx1, cands, { settings });
  assert.equal(step1.length, 40, 'first result is capped');
  assert.equal(step1.some(r => r.label === 'switch.wall'), false, 'switch.wall was sliced off at the cap');

  // Prefix extends s→sw; the live runtime passes previousContext/previousItems (the capped set).
  const ctx2 = { ...ctx1, prefix: 'sw' };
  const incremental = scoreItems(ctx2, { settings, previousContext: ctx1, previousItems: step1, providerCandidates: () => cands });
  assert.equal(incremental.some(r => r.label === 'switch.wall'), true, 'the now-best match reappears (recomputed, not lost)');
});

test('narrowing within a non-truncated result still reuses incrementally (optimization intact)', () => {
  const settings = { enabledLangs: { yaml: true }, maxItems: 40 };
  const cands = [
    { id: 'a', lang: 'yaml', type: 'entity', label: 'light.kitchen', insert: 'light.kitchen', source: 'ha-runtime-values', meta: {} },
    { id: 'b', lang: 'yaml', type: 'entity', label: 'light.living', insert: 'light.living', source: 'ha-runtime-values', meta: {} },
  ];
  const ctx1 = { lang: 'yaml', yamlRole: 'value', yamlKey: 'entity', valueKind: 'entity', pathText: 'entities', scope: 'entities', shouldSuggest: true, triggerKind: 'typing', isTriggerChar: true, prefix: 'li' };
  const step1 = scoreItems(ctx1, cands, { settings });
  assert.ok(step1.length < settings.maxItems, 'first result under the cap');
  const ctx2 = { ...ctx1, prefix: 'light.k' };
  let providerCalled = false;
  const incremental = scoreItems(ctx2, { settings, previousContext: ctx1, previousItems: step1, providerCandidates: () => { providerCalled = true; return cands; } });
  assert.equal(providerCalled, false, 'under the cap → incremental reuse, providers not re-run');
  assert.equal(incremental.some(r => r.label === 'light.kitchen'), true);
});

test('an empty previous result is never narrowed: the providers are asked again', () => {
  // With minChars 2 the one-character result is empty; that emptiness says nothing about what
  // matches the two-character prefix.
  const settings = { enabledLangs: { yaml: true }, maxItems: 40 };
  const cands = entityRows(3);
  const ctx1 = { lang: 'yaml', yamlRole: 'value', yamlKey: 'entity', valueKind: 'entity', pathText: 'entities', scope: 'entities', shouldSuggest: true, triggerKind: 'typing', prefix: 's' };
  const ctx2 = { ...ctx1, prefix: 'se' };
  let providerCalled = false;
  const rows = scoreItems(ctx2, { settings, previousContext: ctx1, previousItems: [], providerCandidates: () => { providerCalled = true; return cands; } });
  assert.equal(providerCalled, true);
  assert.equal(rows.some(r => r.label.startsWith('sensor.room_')), true);
});

test('when narrowing leaves nothing the providers are asked again', () => {
  // The previous rows held only sensors; the longer prefix matches a row that was not among them.
  const settings = { enabledLangs: { yaml: true }, maxItems: 40 };
  const sensors = entityRows(3).filter(r => r.label.startsWith('sensor.'));
  const all = entityRows(3);
  const ctx1 = { lang: 'yaml', yamlRole: 'value', yamlKey: 'entity', valueKind: 'entity', pathText: 'entities', scope: 'entities', shouldSuggest: true, triggerKind: 'typing', prefix: 's' };
  const previous = scoreItems(ctx1, sensors, { settings });
  assert.ok(previous.length > 0 && previous.length < 40);
  const ctx2 = { ...ctx1, prefix: 'sw' };
  const rows = scoreItems(ctx2, { settings, previousContext: ctx1, previousItems: previous, providerCandidates: () => all });
  assert.equal(rows.some(r => r.label === 'switch.wall'), true);
});
