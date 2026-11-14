// Nostrodomus pure performance diagnostics helpers.
// Diagnostics-only performance metric math. Keep this module pure:
// no DOM access, storage access, timers, observers, Home Assistant reads,
// runtime state mutation, or logging.

export function roundPerformanceMetric(value, places = 3) {
  const factor = 10 ** places;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * factor) / factor;
}

export function diagnosticEventMetric(events, name) {
  const event = events?.[name] || {};
  return {
    count: event.count || 0,
    perMinute: roundPerformanceMetric(event.perMinute || 0, 2),
    totalMs: roundPerformanceMetric(event.totalMs || 0, 3),
    avgMs: roundPerformanceMetric(event.avgMs || 0, 3),
    maxMs: roundPerformanceMetric(event.maxMs || 0, 3),
    lastMs: roundPerformanceMetric(event.lastMs || 0, 3),
    lastDetail: event.lastDetail || "",
  };
}

export function performanceBudgetRules() {
  const minAvgSamples = 3;
  return {
    "codebox-style-apply": { maxPerMinute: 120, maxAvgMs: 12, maxMs: 75, minAvgSamples, owner: "Style pipeline" },
    "codebox-frame-sync": { maxPerMinute: 180, maxAvgMs: 6, maxMs: 35, minAvgSamples, owner: "External frame" },
    "style-root-scan": { maxPerMinute: 30, maxAvgMs: 12, maxMs: 45, minAvgSamples, owner: "Root registry" },
    "context-inspector-refresh": { maxPerMinute: 35, maxAvgMs: 8, maxMs: 40, minAvgSamples, owner: "Diagnostics" },
    "suggestion-quality-refresh": { maxPerMinute: 35, maxAvgMs: 8, maxMs: 40, minAvgSamples, owner: "Diagnostics" },
    compute: { maxPerMinute: 90, maxAvgMs: 8, maxMs: 50, minAvgSamples, owner: "Completion engine" },
    "popup-render": { maxPerMinute: 90, maxAvgMs: 10, maxMs: 45, minAvgSamples, owner: "Completion popup" },
    "diagnostics-refresh": { maxPerMinute: 40, maxAvgMs: 10, maxMs: 45, minAvgSamples, owner: "Diagnostics scheduler" },
    "observer-callback": { maxPerMinute: 5000, maxAvgMs: 1, maxMs: 5, minAvgSamples, owner: "Scoped observers" },
  };
}

export function evaluatePerformanceBudgets(snapshot = {}) {
  const rules = performanceBudgetRules();
  const events = snapshot?.events || {};
  const results = {};
  const warnings = [];

  for (const [name, rule] of Object.entries(rules)) {
    const event = events[name] || {};
    const perMinute = Number(event.perMinute || 0);
    const avgMs = Number(event.avgMs || 0);
    const maxMs = Number(event.maxMs || 0);
    const issues = [];
    const count = Number(event.count || 0);
    const minAvgSamples = Number(rule.minAvgSamples || 1);
    if (rule.maxPerMinute && perMinute > rule.maxPerMinute) issues.push(`rate ${roundPerformanceMetric(perMinute, 2)}/min > ${rule.maxPerMinute}/min`);
    if (rule.maxAvgMs && avgMs > rule.maxAvgMs && count >= minAvgSamples) issues.push(`avg ${roundPerformanceMetric(avgMs, 2)}ms > ${rule.maxAvgMs}ms`);
    if (rule.maxMs && maxMs > rule.maxMs) issues.push(`max ${roundPerformanceMetric(maxMs, 2)}ms > ${rule.maxMs}ms`);
    results[name] = {
      ok: issues.length === 0,
      owner: rule.owner,
      budgets: { maxPerMinute: rule.maxPerMinute, maxAvgMs: rule.maxAvgMs, maxMs: rule.maxMs, minAvgSamples: rule.minAvgSamples || 1 },
      observed: {
        count,
        perMinute: roundPerformanceMetric(perMinute, 2),
        avgMs: roundPerformanceMetric(avgMs, 3),
        maxMs: roundPerformanceMetric(maxMs, 3),
        totalMs: roundPerformanceMetric(event.totalMs || 0, 3),
      },
      issues,
    };
    for (const issue of issues) warnings.push(`${name}: ${issue}`);
  }

  const mutation = events["style-root-mutation"] || {};
  const mutationPerMinute = Number(mutation.perMinute || 0);
  const mutationAvgMs = Number(mutation.avgMs || 0);
  const mutationNoise = {
    count: mutation.count || 0,
    perMinute: roundPerformanceMetric(mutationPerMinute, 2),
    avgMs: roundPerformanceMetric(mutationAvgMs, 3),
    lastDetail: mutation.lastDetail || "",
    ignoredRecords: /ignored records/i.test(String(mutation.lastDetail || "")),
    note: mutationAvgMs === 0 ? "filtered-cheap-noise" : "measurable-mutation-cost",
  };
  if (mutationAvgMs > 0.5) warnings.push(`style-root-mutation: avg ${roundPerformanceMetric(mutationAvgMs, 2)}ms > 0.5ms`);

  return {
    ok: warnings.length === 0,
    checkedAt: new Date().toISOString(),
    warnings,
    results,
    mutationNoise,
  };
}
