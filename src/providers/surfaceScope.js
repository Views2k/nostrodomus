// Surface scope: stop completion rows leaking across the wrong editor surface.
//
// Pure: reads only ctx, no DOM/settings/host. Fail-open by contract: a row is suppressed only when
// all of: the gate is on (ctx.surfaceScopeEnabled === true), the surface is recognized, and the
// surface is not in the pack's allow-set. Gate off, or an unknown/absent surface, or an unknown pack
// allows the row. So a default install (flag off) is byte-identical, and rows are never over-suppressed
// on an unrecognized surface (only 7 of the 9 design surfaces are ever set live; condition-field/
// template-field never are, and fail-open covers them and any future host).
//
// Allow-sets: a lovelace pack (card types, card-option keys, dashboard tap-action rows, button-card,
// style blocks) belongs on card / dashboard surfaces; an automation pack (triggers, automation-action
// steps, the automation/script root keys) belongs on automation / script surfaces. raw-dashboard is in
// both, because dashboard YAML legitimately carries visibility conditions and the full card vocabulary.

export const LOVELACE_SURFACES = Object.freeze(['card-editor', 'raw-dashboard']);
export const AUTOMATION_SURFACES = Object.freeze(['automation', 'script', 'raw-dashboard']);

const PACK_SURFACES = {
  lovelace: new Set(LOVELACE_SURFACES),
  automation: new Set(AUTOMATION_SURFACES),
};

/**
 * @param {Record<string, any>|null|undefined} ctx the resolved completion context
 * @param {string} pack 'lovelace' | 'automation'
 * @returns {boolean} true = allow the row on this surface
 */
export function surfaceAllows(ctx, pack) {
  if (!ctx || ctx.surfaceScopeEnabled !== true) return true; // gate off → byte-identical
  const surface = ctx.surface;
  if (!surface || surface === 'unknown') return true; // fail-open on an unrecognized surface
  const set = PACK_SURFACES[pack];
  return set ? set.has(surface) : true; // unknown pack → allow
}
