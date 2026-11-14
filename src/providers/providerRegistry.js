// Nostrodomus provider registry module
// Executable provider contract reference. Keep this module pure: no DOM, no host globals, no storage, no network.

export const DEFAULT_PROVIDER_LIMITS = Object.freeze({
  maxRowsPerPack: 2000,
  defaultProviderTimeoutMs: 8,
  maxProviderTimeoutMs: 120,
  maxProviderMalformedDiagnostics: 5,
});

export function createProviderRegistry(options = {}) {
  const registryState = options.state || {
    settings: { triggerMode: "auto", enabledLangs: {} },
    providers: [],
    providerStats: {},
  };
  if (!registryState.settings) registryState.settings = { triggerMode: "auto", enabledLangs: {} };
  if (!registryState.settings.enabledLangs) registryState.settings.enabledLangs = {};
  if (!Array.isArray(registryState.providers)) registryState.providers = [];
  if (!registryState.providerStats || typeof registryState.providerStats !== "object") registryState.providerStats = {};

  const deps = { ...options, state: registryState };
  return {
    state: registryState,
    registerProvider(provider) { return registerProvider(provider, registryState); },
    providerCandidates(ctx) { return providerCandidates(ctx, registryState, deps); },
    providerSummary() { return providerSummary(registryState, deps); },
    clearProviders() {
      registryState.providers = [];
      registryState.providerStats = {};
    },
  };
}

function fallbackRecordRuntimeError() { return null; }

function runtimeNowMs(deps = {}) {
  const now = deps.now || deps.performanceNow;
  if (typeof now === "function") {
    const value = Number(now());
    if (Number.isFinite(value)) return value;
  }
  return Date.now();
}

export function providerDiagnosticId(provider) {
  const raw = String(provider?.id || "unknown").trim() || "unknown";
  return raw.replace(/[^a-z0-9_.:-]+/gi, "-").slice(0, 96) || "unknown";
}

export function providerTimeoutBudgetMs(provider, limits = DEFAULT_PROVIDER_LIMITS) {
  const candidates = [provider?.timeoutMs, provider?.meta?.timeoutMs, provider?.capabilities?.timeoutMs];
  for (const raw of candidates) {
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) {
      return Math.max(1, Math.min(limits.maxProviderTimeoutMs, value));
    }
  }
  return limits.defaultProviderTimeoutMs;
}

// eslint-disable-next-line no-unused-vars -- the signature (provider/index included) is pinned source+dist by test_provider_contract_static.py
export function validateProviderRow(row, provider = null, index = 0) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { ok: false, reason: "row-not-object" };
  }

  const missing = [];
  if (!row.id || typeof row.id !== "string") missing.push("id");
  if (!row.lang || typeof row.lang !== "string") missing.push("lang");
  if (!row.type || typeof row.type !== "string") missing.push("type");
  if (!row.label || typeof row.label !== "string") missing.push("label");
  if (row.insert == null || typeof row.insert !== "string") missing.push("insert");
  if (missing.length) return { ok: false, reason: `missing:${missing.join(",")}` };

  if (row.aliases != null && !Array.isArray(row.aliases)) return { ok: false, reason: "aliases-not-array" };
  if (row.meta != null && (typeof row.meta !== "object" || Array.isArray(row.meta))) return { ok: false, reason: "meta-not-object" };

  return { ok: true, row };
}

export function validateProviderRows(provider, rows, stats = null, deps = {}) {
  const limits = deps.limits || DEFAULT_PROVIDER_LIMITS;
  const recordOnce = deps.recordRuntimeErrorOnce || deps.recordRuntimeError || fallbackRecordRuntimeError;
  const providerId = providerDiagnosticId(provider);

  if (!Array.isArray(rows)) {
    if (stats) stats.lastMalformedRows = 1;
    recordOnce(`provider:${providerId}:rows`, new Error("provider returned non-array rows"), {
      phase: "providerRows",
      providerId,
      returnedType: rows == null ? String(rows) : typeof rows,
    });
    return [];
  }

  const limit = Math.min(rows.length, limits.maxRowsPerPack);
  const out = [];
  let malformed = 0;

  for (let i = 0; i < limit; i += 1) {
    const result = validateProviderRow(rows[i]);
    if (result.ok) {
      out.push(result.row);
      continue;
    }

    malformed += 1;
    if (malformed <= limits.maxProviderMalformedDiagnostics) {
      recordOnce(`provider:${providerId}:row`, new Error(`malformed provider row: ${result.reason}`), {
        phase: "providerRows",
        providerId,
        rowIndex: i,
        reason: result.reason,
      });
    }
  }

  if (rows.length > limit) {
    recordOnce(`provider:${providerId}:row-limit`, new Error("provider row limit exceeded"), {
      phase: "providerRows",
      providerId,
      limit,
      returned: rows.length,
    });
  }

  if (stats) stats.lastMalformedRows = malformed;
  return out;
}

export function registerProvider(provider, registryState) {
  if (!registryState || typeof registryState !== "object") throw new TypeError("registryState is required");
  if (!provider || !provider.id || typeof provider.provide !== "function") return false;
  if (!Array.isArray(registryState.providers)) registryState.providers = [];
  if (!registryState.providerStats || typeof registryState.providerStats !== "object") registryState.providerStats = {};

  const providerId = providerDiagnosticId(provider);
  registryState.providers = registryState.providers.filter(p => providerDiagnosticId(p) !== providerId);
  registryState.providers.push(provider);
  registryState.providerStats[providerId] = { calls: 0, lastCount: 0, lastMs: 0 };
  return true;
}

export function providerCandidates(ctx, registryState, deps = {}) {
  if (!registryState || typeof registryState !== "object") throw new TypeError("registryState is required");
  const settings = registryState.settings || deps.settings || {};
  const enabledLangs = settings.enabledLangs || {};
  const record = deps.recordRuntimeError || fallbackRecordRuntimeError;
  const recordOnce = deps.recordRuntimeErrorOnce || record;
  const providerEnabled = deps.providerEnabled || (() => true);
  const limits = deps.limits || DEFAULT_PROVIDER_LIMITS;

  if (!ctx?.shouldSuggest || (settings.triggerMode === "manual" && ctx.triggerKind !== "explicit" && !ctx.explicitSession)) return [];
  if (enabledLangs && Object.prototype.hasOwnProperty.call(enabledLangs, ctx.lang) && !enabledLangs[ctx.lang]) return [];

  if (!Array.isArray(registryState.providers)) registryState.providers = [];
  if (!registryState.providerStats || typeof registryState.providerStats !== "object") registryState.providerStats = {};

  const out = [];
  for (const provider of registryState.providers) {
    const providerId = providerDiagnosticId(provider);
    const stats = registryState.providerStats[providerId] || (registryState.providerStats[providerId] = { calls: 0, lastCount: 0, lastMs: 0 });
    stats.skipped = false;

    if (!providerEnabled(providerId, provider)) {
      stats.lastCount = 0;
      stats.lastMs = 0;
      stats.skipped = true;
      continue;
    }

    let canHandle = true;
    try {
      canHandle = provider.canHandle ? !!provider.canHandle(ctx) : true;
    } catch (err) {
      stats.error = String(err?.message || err);
      stats.lastErrorAt = Date.now();
      stats.canHandleErrors = (stats.canHandleErrors || 0) + 1;
      stats.lastCount = 0;
      stats.lastMs = 0;
      record(`provider:${providerId}:canHandle`, err, {
        phase: "providerCanHandle",
        providerId,
        providerLabel: provider?.label || "",
      });
      continue;
    }

    if (!canHandle) {
      stats.lastCount = 0;
      stats.lastMs = 0;
      continue;
    }

    const budgetMs = providerTimeoutBudgetMs(provider, limits);
    let rowsRaw = [];
    const t0 = runtimeNowMs(deps);
    try {
      rowsRaw = provider.provide(ctx) || [];
    } catch (err) {
      const elapsed = Math.round((runtimeNowMs(deps) - t0) * 100) / 100;
      stats.calls += 1;
      stats.error = String(err?.message || err);
      stats.lastErrorAt = Date.now();
      stats.provideErrors = (stats.provideErrors || 0) + 1;
      stats.lastCount = 0;
      stats.lastMs = elapsed;
      record(`provider:${providerId}:provide`, err, {
        phase: "providerProvide",
        providerId,
        providerLabel: provider?.label || "",
        elapsedMs: elapsed,
      });
      continue;
    }

    const elapsed = Math.round((runtimeNowMs(deps) - t0) * 100) / 100;
    stats.calls += 1;
    stats.lastMs = elapsed;
    stats.timeoutMs = budgetMs;
    // provide() returned without throwing: the provider has recovered, so clear any stale error
    // string left from a prior failure — otherwise diagnostics showed the old error forever.
    stats.error = "";

    // provide() is synchronous: by the time the budget can be checked the work is done and the
    // time is spent. Dropping the rows then only emptied the list (on a large instance the
    // entity provider rebuilds its snapshot inside this call every 2.5s and went over the 8ms
    // budget, so the popup showed no entities for that keystroke). The rows are kept and the
    // slow call is recorded for diagnostics.
    if (elapsed > budgetMs) {
      stats.slowCalls = (stats.slowCalls || 0) + 1;
      stats.lastSlowAt = Date.now();
      recordOnce(`provider:${providerId}:timeout`, new Error(`provider exceeded ${budgetMs}ms budget`), {
        phase: "providerTimeout",
        providerId,
        providerLabel: provider?.label || "",
        elapsedMs: elapsed,
        budgetMs,
      });
    }

    const rows = validateProviderRows(provider, rowsRaw, stats, { ...deps, limits, recordRuntimeError: record, recordRuntimeErrorOnce: recordOnce });
    stats.lastCount = rows.length;
    out.push(...rows);
  }

  return out;
}


export function providerCandidatesLegacy(ctx, registryState, deps = {}) {
  if (!registryState || typeof registryState !== "object") throw new TypeError("registryState is required");
  const settings = registryState.settings || deps.settings || {};
  const enabledLangs = settings.enabledLangs || {};
  const recordOnce = deps.recordRuntimeErrorOnce || deps.recordRuntimeError || fallbackRecordRuntimeError;
  const providerEnabled = deps.providerEnabled || (() => true);
  const limits = deps.limits || DEFAULT_PROVIDER_LIMITS;

  if (!ctx?.shouldSuggest || (settings.triggerMode === "manual" && ctx.triggerKind !== "explicit" && !ctx.explicitSession)) return [];
  if (enabledLangs && Object.prototype.hasOwnProperty.call(enabledLangs, ctx.lang) && !enabledLangs[ctx.lang]) return [];

  if (!Array.isArray(registryState.providers)) registryState.providers = [];
  if (!registryState.providerStats || typeof registryState.providerStats !== "object") registryState.providerStats = {};

  const out = [];
  for (const provider of registryState.providers || []) {
    const providerId = providerDiagnosticId(provider);
    const stats = registryState.providerStats[providerId] || (registryState.providerStats[providerId] = { calls: 0, lastCount: 0, lastMs: 0 });
    stats.skipped = false;

    if (!providerEnabled(providerId, provider)) {
      stats.lastCount = 0;
      stats.lastMs = 0;
      stats.skipped = true;
      continue;
    }

    let canHandle = true;
    try {
      canHandle = provider.canHandle ? !!provider.canHandle(ctx) : true;
    } catch (err) {
      stats.error = String(err?.message || err);
      stats.lastErrorAt = Date.now();
      stats.canHandleErrors = (stats.canHandleErrors || 0) + 1;
      stats.lastCount = 0;
      stats.lastMs = 0;
      recordOnce(`provider:${providerId}:canHandle`, err, {
        phase: "providerCanHandle",
        providerId,
        providerLabel: provider?.label || "",
      });
      continue;
    }

    if (!canHandle) {
      stats.lastCount = 0;
      stats.lastMs = 0;
      continue;
    }

    const budgetMs = providerTimeoutBudgetMs(provider, limits);
    let rowsRaw = [];
    const t0 = runtimeNowMs(deps);
    try {
      rowsRaw = provider.provide(ctx) || [];
    } catch (err) {
      const elapsed = Math.round((runtimeNowMs(deps) - t0) * 100) / 100;
      stats.calls += 1;
      stats.error = String(err?.message || err);
      stats.lastErrorAt = Date.now();
      stats.provideErrors = (stats.provideErrors || 0) + 1;
      stats.lastCount = 0;
      stats.lastMs = elapsed;
      recordOnce(`provider:${providerId}:provide`, err, {
        phase: "providerProvide",
        providerId,
        providerLabel: provider?.label || "",
        elapsedMs: elapsed,
      });
      continue;
    }

    const elapsed = Math.round((runtimeNowMs(deps) - t0) * 100) / 100;
    stats.calls += 1;
    stats.lastMs = elapsed;
    stats.timeoutMs = budgetMs;
    // provide() returned without throwing: the provider has recovered, so clear any stale error
    // string left from a prior failure — otherwise diagnostics showed the old error forever.
    stats.error = "";

    // provide() is synchronous: by the time the budget can be checked the work is done and the
    // time is spent. Dropping the rows then only emptied the list (on a large instance the
    // entity provider rebuilds its snapshot inside this call every 2.5s and went over the 8ms
    // budget, so the popup showed no entities for that keystroke). The rows are kept and the
    // slow call is recorded for diagnostics.
    if (elapsed > budgetMs) {
      stats.slowCalls = (stats.slowCalls || 0) + 1;
      stats.lastSlowAt = Date.now();
      recordOnce(`provider:${providerId}:timeout`, new Error(`provider exceeded ${budgetMs}ms budget`), {
        phase: "providerTimeout",
        providerId,
        providerLabel: provider?.label || "",
        elapsedMs: elapsed,
        budgetMs,
      });
    }

    const rows = validateProviderRows(provider, rowsRaw, stats, { ...deps, limits, recordRuntimeError: recordOnce, recordRuntimeErrorOnce: recordOnce });
    stats.lastCount = rows.length;
    out.push(...rows);
  }

  return out;
}

export function providerSummary(registryState, deps = {}) {
  if (!registryState || typeof registryState !== "object") throw new TypeError("registryState is required");
  const providerEnabled = deps.providerEnabled || (() => true);
  const meta = deps.providerMeta || {};
  return (registryState.providers || []).map((provider, index) => {
    const providerId = providerDiagnosticId(provider);
    const stats = registryState.providerStats?.[providerId] || {};
    const info = meta[providerId] || {};
    return {
      id: providerId,
      label: info.label || provider.label || providerId,
      description: info.description || provider.label || "Provider",
      order: index + 1,
      enabled: providerEnabled(providerId, provider) !== false,
      calls: stats.calls || 0,
      lastCount: stats.lastCount || 0,
      lastMs: stats.lastMs || 0,
      skipped: stats.skipped === true,
      error: stats.error || "",
      lastErrorAt: stats.lastErrorAt || 0,
      timeoutMs: stats.timeoutMs || 0,
      timeoutDrops: stats.timeoutDrops || 0,
      slowCalls: stats.slowCalls || 0,
      malformedRows: stats.lastMalformedRows || 0,
    };
  });
}
