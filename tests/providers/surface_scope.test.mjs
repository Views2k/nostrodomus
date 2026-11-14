import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceAllows, LOVELACE_SURFACES, AUTOMATION_SURFACES } from '../../src/providers/surfaceScope.js';
import { scopeContextRows, lovelaceContextProvider } from '../../src/providers/lovelaceContextProvider.js';

const ALL_SURFACES = ['card-editor', 'raw-dashboard', 'devtools-template', 'devtools-action', 'automation', 'script', 'condition-field', 'template-field', 'unknown'];

test('surfaceAllows: gate OFF (or absent) always allows — byte-identical default', () => {
  for (const surface of ALL_SURFACES) {
    assert.equal(surfaceAllows({ surface }, 'lovelace'), true, `gate absent, ${surface}`);
    assert.equal(surfaceAllows({ surface, surfaceScopeEnabled: false }, 'automation'), true, `gate false, ${surface}`);
  }
  assert.equal(surfaceAllows(null, 'lovelace'), true);
});

test('surfaceAllows: gate ON — lovelace pack allowed only on card/dashboard surfaces', () => {
  const on = (surface) => surfaceAllows({ surface, surfaceScopeEnabled: true }, 'lovelace');
  for (const s of LOVELACE_SURFACES) assert.equal(on(s), true, `lovelace allowed on ${s}`);
  assert.equal(on('automation'), false, 'lovelace suppressed on automation');
  assert.equal(on('script'), false, 'lovelace suppressed on script');
  assert.equal(on('devtools-template'), false, 'lovelace suppressed on devtools-template');
});

test('surfaceAllows: gate ON — automation pack allowed only on automation/script/raw-dashboard', () => {
  const on = (surface) => surfaceAllows({ surface, surfaceScopeEnabled: true }, 'automation');
  for (const s of AUTOMATION_SURFACES) assert.equal(on(s), true, `automation allowed on ${s}`);
  assert.equal(on('card-editor'), false, 'automation suppressed on card-editor');
  assert.equal(on('devtools-action'), false, 'automation suppressed on devtools-action');
});

test('surfaceAllows: gate ON — FAIL-OPEN on unknown/absent surface (never over-suppress)', () => {
  assert.equal(surfaceAllows({ surface: 'unknown', surfaceScopeEnabled: true }, 'lovelace'), true);
  assert.equal(surfaceAllows({ surfaceScopeEnabled: true }, 'automation'), true, 'no surface → allow');
  assert.equal(surfaceAllows({ surface: 'card-editor', surfaceScopeEnabled: true }, 'mystery-pack'), true, 'unknown pack → allow');
});

// --- per-row contextKind filtering in the lovelace provider ---
const ROW = (contextKind) => ({ label: contextKind, meta: { contextKind } });
const MIXED = [ROW('lovelace'), ROW('cards'), ROW('action'), ROW('trigger'), ROW('automation-action'), ROW('ha-root'), ROW('condition'), ROW('target'), ROW('data')];

test('scopeContextRows: OFF leaves every row (byte-identical)', () => {
  assert.deepEqual(scopeContextRows(MIXED, { surface: 'automation' }), MIXED);
  assert.deepEqual(scopeContextRows(MIXED, { surface: 'card-editor', surfaceScopeEnabled: false }), MIXED);
});

test('scopeContextRows: ON on a CARD surface drops automation-only kinds, keeps lovelace + shared', () => {
  const kept = scopeContextRows(MIXED, { surface: 'card-editor', surfaceScopeEnabled: true }).map(r => r.meta.contextKind);
  assert.deepEqual(kept, ['lovelace', 'cards', 'action', 'condition', 'target', 'data']);
  assert.ok(!kept.includes('trigger') && !kept.includes('automation-action') && !kept.includes('ha-root'));
});

test('scopeContextRows: ON on an AUTOMATION surface drops lovelace-only kinds, keeps automation + shared (incl. condition)', () => {
  const kept = scopeContextRows(MIXED, { surface: 'automation', surfaceScopeEnabled: true }).map(r => r.meta.contextKind);
  assert.deepEqual(kept, ['trigger', 'automation-action', 'ha-root', 'condition', 'target', 'data']);
  assert.ok(kept.includes('condition'), 'condition is shared (dashboard visibility) — never dropped');
});

test('scopeContextRows: ON on an UNKNOWN surface keeps everything (fail-open)', () => {
  assert.equal(scopeContextRows(MIXED, { surface: 'unknown', surfaceScopeEnabled: true }).length, MIXED.length);
});

// --- end-to-end through the provider: a fallback (no key) yields mixed rows, then scoped ---
function ctxFallback(extra = {}) {
  return { lang: 'yaml', yamlRole: 'blank', yamlKey: '', yamlPath: [], focusKind: '', ...extra };
}

test('provider provide(): default-OFF returns the full mixed fallback set; ON scopes it by surface', () => {
  const provider = lovelaceContextProvider();
  const off = provider.provide(ctxFallback({ surface: 'automation' })).map(r => r.meta?.contextKind);
  assert.ok(off.includes('lovelace') && off.includes('ha-root'), 'OFF: both card vocab + root keys present (unchanged)');

  const onAuto = provider.provide(ctxFallback({ surface: 'automation', surfaceScopeEnabled: true })).map(r => r.meta?.contextKind);
  assert.ok(onAuto.includes('ha-root'), 'automation surface keeps root keys');
  assert.ok(!onAuto.includes('lovelace') && !onAuto.includes('cards'), 'automation surface drops card vocab');
});
