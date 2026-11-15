// Surface scope: keeps rows that belong to one kind of editor out of the others.
//
// Pure: reads only ctx. A row is left out only when surface scoping is on
// (ctx.surfaceScopeEnabled === true), the surface was detected, and it is not in the pack's set.
// Scoping off, an undetected surface ('unknown' or missing) or an unknown pack allows the row.
// A surface in neither set (the Developer Tools editors) gets the rows of neither pack.
//
// A lovelace pack (card types, card-option keys, dashboard tap-action rows, button-card, style
// blocks) belongs on card and dashboard surfaces; an automation pack (triggers, automation action
// steps, the automation and script root keys) on automation and script surfaces. raw-dashboard is
// in both, because dashboard YAML also carries visibility conditions.

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
  if (!ctx || ctx.surfaceScopeEnabled !== true) return true; // scoping off
  const surface = ctx.surface;
  if (!surface || surface === 'unknown') return true; // unknown surface
  const set = PACK_SURFACES[pack];
  return set ? set.has(surface) : true; // unknown pack → allow
}
