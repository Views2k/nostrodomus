// Completion feature flags.
//
// A default-OFF flag namespace that lives outside settings.style (the frozen stylesheet
// contract), so flipping a flag never touches the pinned settings CSS bytes. Every flag
// ships false, so the existing completion path is byte-identical until a flag is turned on.
//
// Pure: no DOM, window, storage, timers, or runtime state. It only reads the plain
// settings object handed in (typically state.settings) and fails dark to the defaults on
// missing/partial/hostile input — never throws.

export const DEFAULT_COMPLETION_SETTINGS = Object.freeze({
  // Master switch for the surface-aware resolver superset. When off, resolveContext
  // returns the legacy descriptor unchanged.
  engineV2: false,
  // Lazily fill detail/documentation for the highlighted item only.
  lazyResolve: false,
  // The Jinja/template completion lane (entity args inside states('…'), filters).
  jinjaLane: false,
  // The registry value lane: area_id:/device_id:/floor_id:/label_id: complete real
  // area/device/floor/label ids (sourced fail-dark into the same runtime snapshot). Requires engineV2.
  registryLane: false,
  // The deeper-schema value picker: a service-data field's enumerated values (select options,
  // boolean) complete at the value position (e.g. `effect: |`). Requires engineV2.
  schemaValues: false,
  // Surface-scope the providers so lovelace rows do not leak into automations/scripts and
  // automation rows do not leak into dashboards/cards (fail-open on an unrecognized surface). Requires engineV2.
  surfaceScope: false,
  // DP fuzzy contiguity scoring in place of the coarse subsequence score.
  dpRanking: false,
  // Persisted frequency+recency (frecency) accept boost.
  frecency: false,
  // Passive floating argument-hint tip for service-data / Jinja calls.
  signatureHelp: false,
});

/**
 * Merge a settings object's `completions` block over the defaults.
 * Only boolean overrides are honored; anything else falls back to the default.
 * @param {{completions?: Record<string, unknown>}|null|undefined} settings
 * @returns {Record<string, boolean>}
 */
export function completionSettings(settings) {
  const merged = { ...DEFAULT_COMPLETION_SETTINGS };
  const raw = settings && typeof settings === 'object' ? settings.completions : null;
  if (!raw || typeof raw !== 'object') return merged;
  for (const key of Object.keys(DEFAULT_COMPLETION_SETTINGS)) {
    if (typeof raw[key] === 'boolean') merged[key] = raw[key];
  }
  return merged;
}

/**
 * The master gate the live completion path checks before using the resolver superset.
 * @param {{completions?: Record<string, unknown>}|null|undefined} settings
 * @returns {boolean}
 */
export function engineV2Enabled(settings) {
  return completionSettings(settings).engineV2 === true;
}
