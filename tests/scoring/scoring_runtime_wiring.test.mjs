import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/main.legacy.js', 'utf8');
const completionFactory = readFileSync('src/composition/mainLegacyCompletionRuntimeFactory.js', 'utf8');
const dist = readFileSync('dist/nostrodomus.js', 'utf8');
const scoring = readFileSync('src/completion/scoring.js', 'utf8');
const runtime = readFileSync('src/completion/scoringRuntime.js', 'utf8');

test('live runtime delegates scoreItems through scoring runtime owner', () => {
  assert.match(source, /createMainLegacyCompletionRuntimeGroup\(\{/);
  assert.match(completionFactory, /createScoringRuntime\(\{/);
  assert.match(completionFactory, /providerCandidates: scoring\.providerCandidates/);
  assert.match(completionFactory, /recordSuggestionQuality,/);
  assert.match(completionFactory, /createScoringRuntimeDelegates\(\(\) => scoringRuntime\)/);
  assert.match(completionFactory, /const \{ allowType, runtimeDomainPriority, contextualPenalty, hasFocusedContextProviderItems, itemMatchesYamlValueKind, focusKindTypeBoost, semanticItemRank, modeRank, shouldSuppressStaticForFocusedContext, scoreItems, camelMatch \} = createScoringRuntimeDelegates/);
  assert.match(runtime, /scoreItems\(ctx, \{/);
  assert.match(runtime, /cacheSalt: enabledProviderSalt\(ensureProviderSettings\(\)\)/);
});

test('scoring module keeps runtime parity for focused snippet and scalar handling', () => {
  assert.match(scoring, /source === SNIPPET_PROVIDER_ID && type === 'snippet'\) return 110/);
  assert.match(scoring, /source === SNIPPET_PROVIDER_ID && type === 'snippet'\) return 105/);
  assert.match(scoring, /if \(\['number', 'duration', 'string', 'scalar'\]\.includes\(kind\)\) return type === kind;/);
  assert.match(scoring, /opts\.cacheSalt \|\| ''/);
});

test('bundled runtime contains scoring owner and no live import for scoring', () => {
  assert.doesNotMatch(dist, /from ['"]\.\/completion\/scoring\.js['"]/);
  assert.ok(dist.includes('DEFAULT_SCORING_SETTINGS'), 'scoring module settings should be bundled');
  assert.ok(dist.includes('cacheSalt'), 'provider-settings cache salt should be bundled');
});


test('legacy completion ranking helper names route through the scoring runtime delegate bundle', () => {
  const bridge = readFileSync('src/composition/runtimeDelegateBridge.js', 'utf8');
  for (const helper of [
    'runtimeDomainPriority',
    'contextualPenalty',
    'hasFocusedContextProviderItems',
    'itemMatchesYamlValueKind',
    'focusKindTypeBoost',
    'semanticItemRank',
    'modeRank',
    'shouldSuppressStaticForFocusedContext',
    'camelMatch',
  ]) {
    assert.ok(bridge.includes(`"${helper}"`), `delegate bridge should own ${helper}`);
  }
  assert.doesNotMatch(source, /function scoreItems\(ctx\)/);
});
