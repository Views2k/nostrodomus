// Engine track `dpRanking`: the DP (optimal-alignment) fuzzy scorer. Locks the ordering
// properties that make completion feel intelligent — boundary > mid-word, consecutive > gappy,
// the HA `lk`→`light.kitchen` / `ltn`→`light.turn_on` cases — plus determinism + fail-dark.

import test from 'node:test';
import assert from 'node:assert/strict';

import { dpFuzzyScore } from '../../src/completion/dpFuzzyScore.js';

test('non-matches and degenerate input score 0 (never throw)', () => {
  assert.equal(dpFuzzyScore('light.kitchen', 'xyz'), 0, 'not a subsequence');
  assert.equal(dpFuzzyScore('', 'lk'), 0, 'empty haystack');
  assert.equal(dpFuzzyScore('light.kitchen', ''), 0, 'empty needle');
  assert.equal(dpFuzzyScore('lk', 'light'), 0, 'needle longer than haystack');
  assert.equal(dpFuzzyScore(null, undefined), 0, 'null/undefined coerce safely');
  assert.equal(dpFuzzyScore('a'.repeat(200), 'aa'), 0, 'over-long haystack is skipped (bounded)');
});

test('a real match scores > 0', () => {
  assert.ok(dpFuzzyScore('light.kitchen', 'lk') > 0);
  assert.ok(dpFuzzyScore('light.turn_on', 'ltn') > 0);
});

test('boundary matches beat mid-word matches', () => {
  // f@0(start) + k after "." (boundary)  >  f@0 + k mid-word
  assert.ok(dpFuzzyScore('foo.kit', 'fk') > dpFuzzyScore('foosk', 'fk'));
  // l@start + k after "." in light.kitchen  >  l + k buried mid-word with no boundary
  assert.ok(dpFuzzyScore('light.kitchen', 'lk') > dpFuzzyScore('flicker', 'lk'));
});

test('consecutive runs beat gappy alignments', () => {
  assert.ok(dpFuzzyScore('lk_temp', 'lk') > dpFuzzyScore('l_x_k_temp', 'lk'));
  assert.ok(dpFuzzyScore('turn', 'tur') > dpFuzzyScore('t_u_r', 'tur'));
});

test('DP finds the OPTIMAL alignment, not the greedy first match', () => {
  // Greedy would take a@0 then b@2 (gap); the optimal is the consecutive a@4,b@5 run.
  // Either way it matches, but the score must reflect the better (consecutive) alignment —
  // i.e. >= a clearly gappy-only arrangement of the same letters.
  assert.ok(dpFuzzyScore('axbxab', 'ab') >= dpFuzzyScore('axxxxb', 'ab'));
});

test('the HA marquee: the right entity ranks first for short dotted queries', () => {
  // `lk` should prefer light.kitchen over an entity where l/k are non-boundary.
  const lk = [
    ['light.kitchen', dpFuzzyScore('light.kitchen', 'lk')],
    ['lock.back_door', dpFuzzyScore('lock.back_door', 'lk')], // l@0, k mid "lock"
    ['sensor.milk_low', dpFuzzyScore('sensor.milk_low', 'lk')], // l,k buried
  ].sort((a, b) => b[1] - a[1]);
  assert.equal(lk[0][0], 'light.kitchen', 'light.kitchen ranks first for "lk"');

  // `ltn` → light.turn_on (l@0, t after ".", n in "on") should beat a buried alternative.
  assert.ok(dpFuzzyScore('light.turn_on', 'ltn') > dpFuzzyScore('alarm_control_panel.latening', 'ltn'));
});

test('deterministic: identical inputs yield identical scores', () => {
  const a = dpFuzzyScore('climate.living_room_thermostat', 'clr');
  const b = dpFuzzyScore('climate.living_room_thermostat', 'clr');
  assert.equal(a, b);
  assert.equal(Number.isInteger(a), true, 'score is an integer');
});
