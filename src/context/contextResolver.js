// Surface-aware context resolver.
//
// The detector (runtimeContextAdapter) already builds a malformed-tolerant descriptor of the
// cursor's YAML context. This module adds the one thing that detector can't know from text
// alone: which editor surface the cursor lives in (a card editor vs Dev Tools Template vs an
// automation, and so on), plus a small set of LSP-shaped channels (region/jinjaPosition,
// replaceRange, signatureTarget).
//
// Rules:
//   * Pure: no DOM, window, storage, timers, or runtime state.
//   * With the engineV2 flag off (the default), resolveContext returns the base descriptor
//     itself, unchanged.
//   * It only adds fields and never changes lang, valueKind or yamlRole, so the descriptor
//     stays valid against contextDescriptorValidationErrors. `expectedKind` is a copy of
//     `valueKind`, not a replacement.

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
 * No host info gives 'card-editor', the default surface; a host that is not recognized gives
 * 'unknown'.
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
 * The "expected kind" channel. It is the descriptor's `valueKind` (or '' when that is not a
 * string).
 * @param {{valueKind?: unknown}|null|undefined} ctx
 * @returns {string}
 */
export function resolveExpectedKind(ctx) {
  const vk = ctx && typeof ctx === 'object' ? ctx.valueKind : '';
  return typeof vk === 'string' ? vk : '';
}

/**
 * Adds the surface-aware fields to the base descriptor. Returns the input itself unless
 * engineEnabled is true.
 * @param {{baseDescriptor?: object, surface?: string, hostInfo?: object, engineEnabled?: boolean}} [opts]
 * @returns {object}
 */
export function resolveContext(opts = {}) {
  const { baseDescriptor, surface, hostInfo, engineEnabled } = opts;
  if (!baseDescriptor || typeof baseDescriptor !== 'object') return baseDescriptor;
  if (engineEnabled !== true) return baseDescriptor;

  const resolvedSurface = SURFACES.includes(surface) ? surface : resolveSurface(hostInfo);
  const replaceTo = baseDescriptor.wordTo != null ? baseDescriptor.wordTo : baseDescriptor.to;
  return {
    ...baseDescriptor,
    // Added fields only; the base fields stay as they are.
    surface: resolvedSurface,
    expectedKind: resolveExpectedKind(baseDescriptor),
    language: baseDescriptor.lang,
    region: null,            // reserved for the embedded {{…}}/{%…%} region + jinjaPosition.
    replaceRange: { from: baseDescriptor.from, to: replaceTo },
    signatureTarget: null,   // reserved for the call/service whose args the cursor is inside.
  };
}
