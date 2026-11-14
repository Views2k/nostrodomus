// Runtime seam self-check.
//
// A cheap, post-editor-open probe that evaluates each HA-selector category
// from the registry against the live DOM and records which categories match.
// Its purpose is the treadmill: when HA renames a DOM seam, the registry
// selector stops matching, and instead of the feature silently erroring the
// probe records the miss so diagnostics can surface "this seam is degraded."
//
// Fail-dark law: this never throws and never logs. A probe error leaves the
// last status untouched. Critical seams (the editor surface itself) drive the
// coverage figure; optional seams are informational only.

import {
  CM_CONTENT,
  CM_EDITOR,
  CM_SCROLLER,
  HA_CODE_EDITOR,
  HA_DIALOG,
  HOME_ASSISTANT,
  HUI_DIALOG_EDIT_CARD,
} from "./haSelectors.js";

// Each category names a registry seam to probe. `critical: true` means the
// seam must match when an editor is open (its absence is a real degradation:
// the editor/completion features ride on it); optional seams are reported but
// do not lower coverage (they legitimately vary by HA layout / dialog state).
export const SELECTOR_SEAM_CATEGORIES = Object.freeze([
  { name: "edit-dialog", selector: HUI_DIALOG_EDIT_CARD, critical: true },
  { name: "code-editor", selector: HA_CODE_EDITOR, critical: true },
  { name: "cm-editor", selector: CM_EDITOR, critical: true },
  { name: "cm-content", selector: CM_CONTENT, critical: true },
  { name: "cm-scroller", selector: CM_SCROLLER, critical: false },
  { name: "ha-dialog", selector: HA_DIALOG, critical: false },
  // Diagnostics label uses the short alias ha-root rather than the host
  // element's own name, so the selector-registry static guard does not read a
  // bare host string in this file. The selector itself is the registry
  // constant; only the human-facing label differs.
  { name: "ha-root", selector: HOME_ASSISTANT, critical: false },
]);

/**
 * Bounded, shadow-piercing existence check. Returns true as soon as any open
 * shadow subtree under `root` matches `selector`. Depth-capped (cheap; this
 * runs once per editor open, not on the typing hotpath).
 */
export function selectorMatchesDeep(root, selector, maxDepth = 15) {
  if (!root || !selector) return false;
  const seen = new Set();
  const walk = (node, depth) => {
    if (!node || depth > maxDepth || seen.has(node)) return false;
    seen.add(node);
    try {
      if (node.querySelector?.(selector)) return true;
    } catch {
      /* hostile/closed root — treat as no match, never throw */
    }
    let hosts = [];
    try {
      hosts = Array.from(node.querySelectorAll?.("*") || []);
    } catch {
      hosts = [];
    }
    for (const el of hosts) {
      if (el.shadowRoot && walk(el.shadowRoot, depth + 1)) return true;
    }
    return false;
  };
  return walk(root, 0);
}

/**
 * The same check for several selectors in one walk: each root is read once, and the walk stops as
 * soon as every selector has matched. Returns the set of selectors that matched.
 */
export function selectorsMatchDeep(root, selectors, maxDepth = 15) {
  const found = new Set();
  const wanted = new Set((selectors || []).filter(Boolean));
  if (!root || !wanted.size) return found;
  const seen = new Set();
  const walk = (node, depth) => {
    if (!node || depth > maxDepth || seen.has(node) || found.size === wanted.size) return;
    seen.add(node);
    for (const selector of wanted) {
      if (found.has(selector)) continue;
      try {
        if (node.querySelector?.(selector)) found.add(selector);
      } catch {
        /* hostile/closed root — treat as no match, never throw */
      }
    }
    if (found.size === wanted.size) return;
    let hosts = [];
    try {
      hosts = node.querySelectorAll?.("*") || [];
    } catch {
      hosts = [];
    }
    for (const el of hosts) {
      if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      if (found.size === wanted.size) return;
    }
  };
  walk(root, 0);
  return found;
}

/**
 * Evaluate every seam category against the document. Returns a pure result —
 * the caller decides whether/how to persist it.
 */
export function evaluateSelectorSeams(deps = {}) {
  const documentRef = deps.document || (typeof document !== "undefined" ? document : null);
  const categories = {};
  let criticalTotal = 0;
  let criticalFound = 0;
  const missingCritical = [];

  const matches = selectorsMatchDeep(documentRef, SELECTOR_SEAM_CATEGORIES.map((category) => category.selector));
  for (const category of SELECTOR_SEAM_CATEGORIES) {
    const found = matches.has(category.selector);
    categories[category.name] = found;
    if (category.critical) {
      criticalTotal += 1;
      if (found) criticalFound += 1;
      else missingCritical.push(category.name);
    }
  }

  const coverage = criticalTotal === 0 ? 100 : Math.round((criticalFound / criticalTotal) * 100);
  return { categories, criticalTotal, criticalFound, coverage, missingCritical };
}

const SEAM_PROBE_DELAY_MS = 1500;
const SEAM_PROBE_MIN_INTERVAL_MS = 30000;

/**
 * Explicit-deps factory. `probe(reason)` runs the seam evaluation once and
 * writes it into `state.selectorSeamStatus`. Wrapped fail-dark.
 */
export function createSelectorSeamProbe(deps = {}) {
  const {
    state,
    document: documentRef = (typeof document !== "undefined" ? document : null),
    now = () => Date.now(),
    recordPerformanceEvent = () => {},
    recordRuntimeErrorOnce = () => {},
    setTimeout: setTimeoutRef = (fn, ms) => setTimeout(fn, ms),
    clearTimeout: clearTimeoutRef = (id) => clearTimeout(id),
  } = deps;

  function probe(reason = "editor-open") {
    if (!state?.selectorSeamStatus) return null;
    try {
      const result = evaluateSelectorSeams({ document: documentRef });
      const status = state.selectorSeamStatus;
      status.probeCount = (status.probeCount || 0) + 1;
      status.lastProbeAt = now();
      status.lastProbeReason = String(reason || "").slice(0, 64);
      status.criticalTotal = result.criticalTotal;
      status.criticalFound = result.criticalFound;
      status.coverage = result.coverage;
      status.missingCritical = result.missingCritical;
      status.categories = result.categories;
      recordPerformanceEvent("selector-seam-probe", 0, status.lastProbeReason);
      return result;
    } catch (err) {
      try { recordRuntimeErrorOnce("selector-seam:probe", err, { phase: "selectorSeamProbe", reason }); } catch { /* diagnostics must not throw */ }
      return null;
    }
  }

  // The self-check is diagnostics. Run from editor detection it walked the whole app, through the
  // dashboard behind the dialog, before the opened editor's first paint and again on every new
  // detection. probeLater runs it after the editor has settled, and not again within
  // SEAM_PROBE_MIN_INTERVAL_MS while the last result found every critical seam.
  let pendingTimer = 0;
  function probeLater(reason = "editor-open") {
    if (!state?.selectorSeamStatus || pendingTimer) return false;
    const status = state.selectorSeamStatus;
    const complete = status.probeCount > 0 && Array.isArray(status.missingCritical) && status.missingCritical.length === 0;
    if (complete && now() - (status.lastProbeAt || 0) < SEAM_PROBE_MIN_INTERVAL_MS) return false;
    pendingTimer = setTimeoutRef(() => {
      pendingTimer = 0;
      probe(reason);
    }, SEAM_PROBE_DELAY_MS);
    return true;
  }

  function cancel() {
    if (pendingTimer) clearTimeoutRef(pendingTimer);
    pendingTimer = 0;
  }

  return { probe, probeLater, cancel };
}
