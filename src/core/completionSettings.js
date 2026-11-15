// The settings.completions block: the experimental completion options of the settings panel,
// all off by default. With every option off, completion works as without this block.
//
// Pure: no DOM, window, storage, timers or runtime state. It reads only the settings object it is
// given (usually state.settings), falls back to the defaults for anything missing or of the wrong
// type, and never throws.

export const DEFAULT_COMPLETION_SETTINGS = Object.freeze({
  // The surface-aware context resolver (Developer Tools, automations, scripts, dashboards). When
  // off, resolveContext returns the context it was given unchanged. The options marked "needs
  // engineV2" do nothing without it.
  engineV2: false,
  // Detail and documentation filled in for the highlighted row only, when it is highlighted.
  lazyResolve: false,
  // Template completion: entity ids inside states('…') and similar calls, and filters. Needs engineV2.
  jinjaLane: false,
  // Real area, device, floor and label ids at area_id:, device_id:, floor_id: and label_id:, from
  // the same Home Assistant data snapshot as the entities. Needs engineV2.
  registryLane: false,
  // A service field's allowed values (select options, booleans) at its value position, as in
  // `effect: |`. Needs engineV2.
  schemaValues: false,
  // Keeps dashboard rows out of automations and scripts and automation rows out of dashboards and
  // cards. An editor whose surface is not recognized gets every row. Needs engineV2.
  surfaceScope: false,
  // Fuzzy ranking that favors contiguous matches, in place of the plain subsequence score.
  dpRanking: false,
  // A ranking boost for rows accepted often and recently, kept across reloads.
  frecency: false,
  // An argument hint for the service call or template function at the cursor.
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
 * Whether the surface-aware context resolver is on.
 * @param {{completions?: Record<string, unknown>}|null|undefined} settings
 * @returns {boolean}
 */
export function engineV2Enabled(settings) {
  return completionSettings(settings).engineV2 === true;
}
