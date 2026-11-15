// Selector self-check.
//
// After an editor opens, checks which Home Assistant selectors from the registry match the page
// and records the result in state.selectorSeamStatus. When a Home Assistant release renames an
// element the registry relies on, its selector stops matching and diagnostics show which one.
//
// It never throws; an error is recorded as a runtime error and leaves the last status as it was.
// The critical selectors (the editor surface itself) make up the coverage figure; the others are
// reported only.

import {
  CM_CONTENT,
  CM_EDITOR,
  CM_SCROLLER,
  HA_CODE_EDITOR,
  HA_DIALOG,
  HOME_ASSISTANT,
  HUI_DIALOG_EDIT_CARD,
} from "./haSelectors.js";

// `critical: true` means the selector must match while an editor is open: the editor and
// completion features depend on it. The others are reported but do not lower the coverage, because
// they vary with the Home Assistant layout and the dialog state.
export const SELECTOR_SEAM_CATEGORIES = Object.freeze([
  { name: "edit-dialog", selector: HUI_DIALOG_EDIT_CARD, critical: true },
  { name: "code-editor", selector: HA_CODE_EDITOR, critical: true },
  { name: "cm-editor", selector: CM_EDITOR, critical: true },
  { name: "cm-content", selector: CM_CONTENT, critical: true },
  { name: "cm-scroller", selector: CM_SCROLLER, critical: false },
  { name: "ha-dialog", selector: HA_DIALOG, critical: false },
  // Labeled ha-root: the registry guard (tests/test_ha_selector_registry_static.py) allows the
  // element name itself only in haSelectors.js.
  { name: "ha-root", selector: HOME_ASSISTANT, critical: false },
]);

/**
 * Which of `selectors` match anywhere under `root`, through open shadow roots, in one walk: each
 * root is read once, the walk is depth-capped, and it stops as soon as every selector has matched.
 * Returns the set of selectors that matched.
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
        /* a root that cannot be queried counts as no match */
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
 * Checks every category against the document and returns the result without storing it.
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
 * `probe(reason)` runs the check once and writes it into `state.selectorSeamStatus`; an error is
 * recorded and the status is left as it was. `probeLater` schedules a run, and `cancel` drops it.
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

  // The check walks the whole app, the dashboard behind the dialog included, so it does not run
  // during editor detection. probeLater runs it once the editor has settled, and not again within
  // SEAM_PROBE_MIN_INTERVAL_MS while the last result found every critical selector.
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
