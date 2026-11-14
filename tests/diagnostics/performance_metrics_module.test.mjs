import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  diagnosticEventMetric,
  evaluatePerformanceBudgets,
  performanceBudgetRules,
  roundPerformanceMetric,
} from '../../src/diagnostics/performanceMetrics.js';

test('performance metric helpers preserve legacy rounding and event shape', () => {
  assert.equal(roundPerformanceMetric(1.23456, 3), 1.235);
  assert.equal(roundPerformanceMetric(Number.NaN, 3), 0);
  assert.deepEqual(diagnosticEventMetric({ compute: { count: 2, perMinute: 12.345, totalMs: 8.7654, avgMs: 4.3827, maxMs: 5.5555, lastMs: 1.1111, lastDetail: 'typed' } }, 'compute'), {
    count: 2,
    perMinute: 12.35,
    totalMs: 8.765,
    avgMs: 4.383,
    maxMs: 5.556,
    lastMs: 1.111,
    lastDetail: 'typed',
  });
});

test('performance budget evaluation preserves warning and mutation-noise semantics', () => {
  const rules = performanceBudgetRules();
  assert.equal(rules.compute.owner, 'Completion engine');
  assert.equal(rules['observer-callback'].maxPerMinute, 5000);

  const result = evaluatePerformanceBudgets({
    events: {
      compute: { count: 4, perMinute: 91, avgMs: 8.2, maxMs: 55, totalMs: 32.8 },
      'style-root-mutation': { count: 10, perMinute: 44.444, avgMs: 0, lastDetail: 'ignored records: 10' },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.results.compute.ok, false);
  assert.deepEqual(result.results.compute.issues, [
    'rate 91/min > 90/min',
    'avg 8.2ms > 8ms',
    'max 55ms > 50ms',
  ]);
  assert.equal(result.mutationNoise.ignoredRecords, true);
  assert.equal(result.mutationNoise.avgMs, 0);
});


test('performance budget average warnings require enough samples', () => {
  const result = evaluatePerformanceBudgets({
    events: {
      compute: { count: 1, perMinute: 1, avgMs: 15, maxMs: 15, totalMs: 15 },
      'codebox-style-apply': { count: 2, perMinute: 2, avgMs: 20, maxMs: 20, totalMs: 40 },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.results.compute.issues, []);
  assert.equal(result.results.compute.budgets.minAvgSamples, 3);
  assert.deepEqual(result.results['codebox-style-apply'].issues, []);
});

test('the completion-compute diagnostics metric reads the writer event key (compute)', () => {
  // The compute timing is recorded under the bare event key 'compute' (completionRuntime.js); the
  // diagnostics reader must source 'completion.compute.ms' from that SAME key, not from a
  // non-existent 'completion-compute' (which read empty and blanked the diagnostics row).
  const writer = readFileSync(new URL('../../src/completion/completionRuntime.js', import.meta.url), 'utf8');
  const reader = readFileSync(new URL('../../src/diagnostics/performanceTelemetryRuntime.js', import.meta.url), 'utf8');
  assert.match(writer, /measurePerformanceEvent\(\s*'compute'/, 'writer records under event key compute');
  assert.match(reader, /'completion\.compute\.ms':\s*diagnosticEventMetric\(telemetry\.events,\s*'compute'\)/, 'reader sources completion.compute.ms from event key compute');
  assert.doesNotMatch(reader, /diagnosticEventMetric\(telemetry\.events,\s*'completion-compute'\)/, 'reader must not use the mismatched completion-compute key');
});
