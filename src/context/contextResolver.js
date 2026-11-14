// Surface-aware context resolver.
//
// The detector (runtimeContextAdapter) already builds a malformed-tolerant descriptor of the
// cursor's YAML context. This module adds the one thing that detector can't know from text
// alone: which editor surface the cursor lives in (a card editor vs Dev Tools Template vs an
// automation, and so on), plus a small set of LSP-shaped channels (region/jinjaPosition,
// replaceRange, signatureTarget).
//
// Contract (load-bearing):
//   * Pure: no DOM, window, storage, timers, or runtime state.
//   * When the engine flag is off (the default), resolveContext returns the base descriptor
//     by reference, unchanged, so the live completion path is byte-identical until the flag
//     is flipped.
//   * It only adds fields. It never mutates the legacy enum fields (lang/valueKind/yamlRole),
//     so the descriptor stays valid against contextDescriptorValidationErrors. `expectedKind`
//     is an alias of the existing `valueKind`, never a replacement.

export const RESOLVED_DESCRIPTOR_VERSION = 2;

// The eight HA editor surfaces the resolver targets, plus 'unknown'.
export const SURFACES = Object.freeze([
  'card-editor',
  'raw-dashboard',
  'devtools-template',
  'devtools-action',
  'automation',
  'script',
  'condition-field',
  'template-field',
  'unknown',
]);

// Maps an HA panel/host identifier (resolved from the DOM) to a surface. The keys are what the
// DOM-side wiring populates `hostInfo.panel` with; the values are the canonical surface ids above.
const PANEL_SURFACE_MAP = Object.freeze({
  'developer-tools-template': 'devtools-template',
  'developer-tools-action': 'devtools-action',
  'developer-tools-service': 'devtools-action',
  'tools-template': 'devtools-template',
  'tools-action': 'devtools-action',
  'config-automation': 'automation',
  'config-script': 'script',
  'lovelace-raw-config': 'raw-dashboard',
  'raw-dashboard': 'raw-dashboard',
});

/**
 * Resolve the editor surface from a host descriptor (populated by the DOM-side detection).
 * Fail-dark: no host info at all yields 'card-editor' (the only wired surface, and the safe
 * default); a host present but unrecognizable yields 'unknown'.
 * @param {{surface?: string, isCardDialog?: boolean, panel?: string}|null|undefined} hostInfo
 * @returns {string} one of SURFACES
 */
export function resolveSurface(hostInfo) {
  if (!hostInfo || typeof hostInfo !== 'object') return 'card-editor';
  const explicit = typeof hostInfo.surface === 'string' ? hostInfo.surface : '';
  if (SURFACES.includes(explicit)) return explicit;
  if (hostInfo.isCardDialog === true) return 'card-editor';
  const panel = typeof hostInfo.panel === 'string' ? hostInfo.panel.trim().toLowerCase() : '';
  if (panel) return PANEL_SURFACE_MAP[panel] || 'unknown';
  return 'unknown';
}

/**
 * The richer "expected kind" channel. Today it is a strict alias of the descriptor's existing
 * `valueKind`, so every context yields the identical string; it can widen later
 * (jinja-global/jinja-filter/area/device, and so on) without breaking the alias for the cases
 * that already have a valueKind.
 * @param {{valueKind?: unknown}|null|undefined} ctx
 * @returns {string}
 */
export function resolveExpectedKind(ctx) {
  const vk = ctx && typeof ctx === 'object' ? ctx.valueKind : '';
  return typeof vk === 'string' ? vk : '';
}

/**
 * Wrap the legacy descriptor with the surface-aware superset. A no-op (returns the input by
 * reference) unless engineEnabled is explicitly true.
 * @param {{baseDescriptor?: object, surface?: string, hostInfo?: object, engineEnabled?: boolean}} [opts]
 * @returns {object}
 */
export function resolveContext(opts = {}) {
  const { baseDescriptor, surface, hostInfo, engineEnabled } = opts;
  if (!baseDescriptor || typeof baseDescriptor !== 'object') return baseDescriptor;
  // Default path: byte-identical legacy descriptor (same reference, no allocation).
  if (engineEnabled !== true) return baseDescriptor;

  const resolvedSurface = SURFACES.includes(surface) ? surface : resolveSurface(hostInfo);
  const replaceTo = baseDescriptor.wordTo != null ? baseDescriptor.wordTo : baseDescriptor.to;
  return {
    ...baseDescriptor,
    // Added channels — never overwrite a legacy enum field.
    surface: resolvedSurface,
    expectedKind: resolveExpectedKind(baseDescriptor),
    language: baseDescriptor.lang,
    region: null,            // reserved for the embedded {{…}}/{%…%} region + jinjaPosition.
    replaceRange: { from: baseDescriptor.from, to: replaceTo },
    signatureTarget: null,   // reserved for the call/service whose args the cursor is inside.
  };
}
