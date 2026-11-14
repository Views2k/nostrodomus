// Suggestion quality diagnostics runtime owner.
//
// This module owns the redacted suggestion-quality payload and score/update
// recording path used by completion scoring, diagnostics, and the Settings
// Context panel. Keep it browser-network-free and DOM-free.

export function createSuggestionQualityRuntime(deps = {}) {
  const state = deps.state || {};
  const version = deps.version || '';
  const projectVersion = deps.projectVersion || '';
  const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString();
  const providerSummary = typeof deps.providerSummary === 'function' ? deps.providerSummary : () => ({});
  const contextRouteLabel = typeof deps.contextRouteLabel === 'function' ? deps.contextRouteLabel : () => '';
  const itemDetail = typeof deps.itemDetail === 'function' ? deps.itemDetail : item => String(item?.detail || '');
  const updateSuggestionQualityPanel = typeof deps.updateSuggestionQualityPanel === 'function'
    ? deps.updateSuggestionQualityPanel
    : () => {};
  // Whether anything can show the payload now (the Settings panel is open). A recording asks the
  // panel to redraw only then.
  const payloadWanted = typeof deps.payloadWanted === 'function' ? deps.payloadWanted : () => true;

  // What the last scoring pass reported about its list (cache hit, number of candidates).
  let lastPass = null;

  function suggestionQualityPayload(ctx = state.context, items = state.items, passOptions = undefined) {
    // Without options of its own, a payload for the list of the last scoring pass uses that
    // pass's options.
    const recorded = passOptions || (lastPass && lastPass.items === items ? lastPass.options : {});
    const list = Array.isArray(items) ? items : [];
    const scores = list.map(item => Number(item?.score || 0)).filter(Number.isFinite);
    const labels = new Map();
    const providers = new Map();
    const types = new Map();

    for (const item of list) {
      const label = String(item?.label || '').toLowerCase();
      if (label) labels.set(label, (labels.get(label) || 0) + 1);
      const provider = String(item?.source || item?.provider || 'unknown');
      providers.set(provider, (providers.get(provider) || 0) + 1);
      const type = String(item?.type || 'unknown');
      types.set(type, (types.get(type) || 0) + 1);
    }

    const duplicateLabels = Array.from(labels.entries())
      .filter(([, count]) => count > 1)
      .map(([label, count]) => ({ label, count }));
    const topScore = scores.length ? Math.max(...scores) : 0;
    const lowScore = scores.length ? Math.min(...scores) : 0;
    const topItem = list[0] || null;
    const selectedItem = list[state.selected] || topItem || null;

    return {
      exportedAt: now(),
      redacted: true,
      version,
      projectVersion,
      cacheHit: recorded.cacheHit === true,
      candidateInputCount: Number(recorded.candidateInputCount || 0),
      suggestionCount: list.length,
      topScore,
      lowScore,
      scoreSpread: topScore - lowScore,
      duplicateLabelCount: duplicateLabels.length,
      duplicateLabels: duplicateLabels.slice(0, 8),
      providerMix: Object.fromEntries(providers),
      typeMix: Object.fromEntries(types),
      providerSummary: providerSummary(),
      context: {
        language: ctx?.lang || '',
        yamlPath: Array.isArray(ctx?.yamlPath) ? ctx.yamlPath.join('.') : '',
        focusKind: ctx?.focusKind || '',
        valueKind: ctx?.valueKind || '',
        prefixLength: String(ctx?.prefix || '').length,
        shouldSuggest: !!ctx?.shouldSuggest,
        route: contextRouteLabel(ctx),
      },
      topSuggestion: topItem ? {
        label: topItem.label || '',
        type: topItem.type || '',
        source: topItem.source || topItem.provider || '',
        score: Number(topItem.score || 0),
        detail: itemDetail(topItem),
      } : null,
      selectedSuggestion: selectedItem ? {
        label: selectedItem.label || '',
        type: selectedItem.type || '',
        source: selectedItem.source || selectedItem.provider || '',
        score: Number(selectedItem.score || 0),
        detail: itemDetail(selectedItem),
      } : null,
      emptyReason: list.length ? '' : (ctx?.idleReason || 'No suggestions passed provider, type, value-kind, and score filters.'),
    };
  }

  // Called by every scoring pass, before the caller has stored the new list and its selected row.
  // Building the payload here did the work of a diagnostics export on every keystroke, and the
  // payload named the row at the selected index of the previous list. Only what the pass knows
  // is kept. Every reader falls back to suggestionQualityPayload(state.context, state.items)
  // when there is no stored payload, which builds it from the stored list when it is needed.
  function recordSuggestionQuality(ctx, items, options = {}) {
    lastPass = { items, options };
    state.suggestionQuality = null;
    if (payloadWanted()) updateSuggestionQualityPanel();
    return null;
  }

  return {
    suggestionQualityPayload,
    recordSuggestionQuality,
  };
}
