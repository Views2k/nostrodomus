// Surface-wide editor-warning reconcile (warning badge and warning hide).
//
// The warning (ha-alert) lives in nested shadow roots inside the card-edit dialog
// (dialog → … → card-element-editor → ha-alert), which the old code-editor-only path never reached.
// applyEditorWarningHide deep-walks the surface and, per the toggle + companion-layer state, either:
//   • toggle OFF + layer ACTIVE → injects the corner-badge HOST sheet into the root that CONTAINS the
//     ha-alert and the badge SHADOW sheet into the ha-alert's OWN shadow root (the default look);
//   • toggle ON → injects the narrowed display:none HIDE sheet (sprayed, inert without an ha-alert);
//   • toggle OFF + layer INACTIVE → removes everything.
// This pins that logic deterministically (no browser) with a fake nested-shadow DOM mirroring the
// structure observed in Home Assistant, and guards the two glitch-fix invariants (narrow hide selector;
// out-of-flow badge).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createScrollbarStyleRuntime,
  WARNING_HIDE_CSS,
  WARNING_BADGE_HOST_CSS,
  WARNING_BADGE_SHADOW_CSS,
  badgeAccentFromBorderColor,
  editorWarningAlerts,
} from '../../src/companion/scrollbarStyleRuntime.js';

// A fake shadow/light root. `alerts` is what querySelector('ha-alert')/querySelectorAll('ha-alert')
// see directly in this root; `childHosts` is what the '*' walk descends into.
function makeRoot(hostLocalName, { childHosts = [], alerts = [] } = {}) {
  const styles = [];
  const root = {
    host: { localName: hostLocalName },
    _styles: styles,
    querySelectorAll: (sel) => {
      if (sel === '*') return childHosts.slice();
      if (sel === 'ha-alert') return alerts.slice();
      return [];
    },
    querySelector: (sel) => {
      if (sel === 'ha-alert') return alerts[0] || null;
      return styles.find((s) => '#' + s.id === sel) || null;
    },
    appendChild: (n) => { n._parent = root; styles.push(n); return n; },
  };
  return root;
}
const fakeDoc = {
  createElement: () => ({
    id: '', textContent: '',
    remove() { const p = this._parent; if (p) { const i = p._styles.indexOf(this); if (i >= 0) p._styles.splice(i, 1); } },
  }),
};

// dialog shadow (rootA) → nested card-editor shadow (rootB) → the ha-alert ELEMENT, whose own
// shadow root (alertShadow) is where HA renders the banner internals.
function makeSurface() {
  const alertShadow = makeRoot('ha-alert');
  const alertEl = { localName: 'ha-alert', shadowRoot: alertShadow };
  const rootB = makeRoot('hui-card-element-editor', { childHosts: [alertEl], alerts: [alertEl] });
  const rootA = makeRoot('hui-dialog-edit-card', { childHosts: [{ shadowRoot: rootB }] });
  return { surface: { shadowRoot: rootA }, rootA, rootB, alertShadow };
}
const hasStyle = (root, id) => root._styles.some((s) => s.id === id);
const hasHide = (root) => root._styles.some((s) => /ha-alert/.test(s.textContent) && /display:\s*none/i.test(s.textContent));

test('HIDE (toggle ON): the narrowed display:none sheet reaches the dialog AND the nested card-editor root', () => {
  const { surface, rootA, rootB } = makeSurface();
  const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => true });
  assert.equal(rt.applyEditorWarningHide(surface), true);
  assert.ok(hasHide(rootA), 'dialog shadow root gets the hide sheet');
  assert.ok(hasHide(rootB), 'the NESTED card-editor root (where the ha-alert lives) gets it too');
});

test('BADGE (default — toggle OFF, layer active): host sheet into the alert container, shadow sheet into the alert shadow; no hide sheet', () => {
  const { surface, rootA, rootB, alertShadow } = makeSurface();
  const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false });
  assert.equal(rt.applyEditorWarningHide(surface), true);
  assert.ok(hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'the root containing the ha-alert gets the badge HOST sheet');
  assert.ok(hasStyle(alertShadow, 'nostrodomus-editor-warning-badge-shadow'), "the ha-alert's own shadow gets the badge SHADOW sheet");
  assert.ok(!hasStyle(rootA, 'nostrodomus-editor-warning-badge-host'), 'a root WITHOUT an ha-alert child is not badged (no blast radius)');
  assert.ok(!hasHide(rootA) && !hasHide(rootB), 'no hide sheet anywhere while the toggle is off');
});

test('REGRESSION: a deeply-nested alert the deep-walk cannot reach STILL gets the badge SHADOW sheet (paired with HOST)', () => {
  // A custom card's validation alert (better-thermostat min_temp) is so
  // deeply nested that deepShadowRootsWithin's depth/root cap reaches its CONTAINER root (HOST sheet
  // lands, collapsing it to a 22px dot) but NOT the alert's OWN shadow (SHADOW sheet missing) → the
  // badge is HALF-applied: the internal content + icon stay unstyled and spill out ("removes the
  // symbol + text clips up and down"). Simulate that: the alert is queryable in its container (alerts)
  // but is NOT a walked child-host, so the walk never descends into its own shadow.
  const alertShadow = makeRoot('ha-alert');
  const alertEl = { localName: 'ha-alert', shadowRoot: alertShadow, style: { setProperty() {}, removeProperty() {} } };
  const rootB = makeRoot('hui-card-element-editor', { childHosts: [], alerts: [alertEl] });
  const rootA = makeRoot('hui-dialog-edit-card', { childHosts: [{ shadowRoot: rootB }] });
  const surface = { shadowRoot: rootA };

  const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false });
  assert.equal(rt.applyEditorWarningHide(surface), true);
  assert.ok(hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'HOST sheet lands on the alert container (the walk reaches it)');
  assert.ok(hasStyle(alertShadow, 'nostrodomus-editor-warning-badge-shadow'), "FIX: the alert's own shadow STILL gets the SHADOW sheet (paired with HOST, not via the capped walk)");
});

// A fake MutationObserver test seam: records instances + their observed target, and lets the test
// fire the callback with synthetic records (the headless runtime can't observe the plain-object roots).
function fakeMutationObserver() {
  const instances = [];
  class FakeMO {
    constructor(cb) { this.cb = cb; this.target = null; this.disconnected = false; instances.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  }
  FakeMO.instances = instances;
  return FakeMO;
}

test('RE-APPLY WATCHER: HA rebuilding the alert (drops our sheets) re-badges instantly via the container watcher', () => {
  // Typing makes HA REMOVE + re-ADD the ha-alert in the (stable) container shadow on every
  // keystroke, wiping our injected sheets → the alert flashes back to HA's full native yellow banner.
  const MO = fakeMutationObserver();
  const { surface, rootB, alertShadow } = makeSurface();
  const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false, MutationObserver: MO });
  assert.equal(rt.applyEditorWarningHide(surface), true);
  assert.ok(hasStyle(rootB, 'nostrodomus-editor-warning-badge-host') && hasStyle(alertShadow, 'nostrodomus-editor-warning-badge-shadow'), 'badge fully applied on first pass');

  const watcher = MO.instances.find((o) => o.target === rootB);
  assert.ok(watcher, 'a re-apply watcher is attached to the alert container root');

  // Simulate HA rebuilding: it wiped BOTH our sheets, then re-added a fresh ha-alert.
  rootB._styles.length = 0;
  alertShadow._styles.length = 0;
  assert.ok(!hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'sheets gone after HA rebuild (pre-watcher)');
  watcher.cb([{ addedNodes: [{ nodeType: 1, localName: 'ha-alert' }] }]);
  assert.ok(hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'HOST sheet re-injected the instant HA re-adds the alert');
  assert.ok(hasStyle(alertShadow, 'nostrodomus-editor-warning-badge-shadow'), 'SHADOW sheet re-injected too (no native-banner flash)');
});

test('RE-APPLY WATCHER observes the subtree (HA re-adds the alert BELOW a wrapper, not as a direct child)', () => {
  const MO = fakeMutationObserver();
  const { surface, rootB } = makeSurface();
  const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false, MutationObserver: MO });
  rt.applyEditorWarningHide(surface);
  const watcher = MO.instances.find((o) => o.target === rootB);
  assert.ok(watcher, 'watcher attached');
  // Must be subtree:true — a childList-only observe would miss a rebuilt alert added under a wrapper.
  assert.equal(watcher.options?.subtree, true, 'observes subtree, not just direct children');
  assert.equal(watcher.options?.childList, true);
});

test('RE-APPLY WATCHER retries the SHADOW sheet when the rebuilt alert has not attached its shadow yet', () => {
  // A freshly HA-rebuilt alert is a brand-new LitElement whose shadow root attaches a frame later, so it
  // is null at the instant the watcher fires. The HOST sheet still clamps it (safely clipped), and a
  // bounded retry re-pairs the SHADOW sheet once the shadow exists — so it returns to the proper dot.
  const MO = fakeMutationObserver();
  const frames = [];
  const fakeRaf = (fn) => { frames.push(fn); return frames.length; };
  // Container whose ha-alert has NO shadow yet at callback time.
  const lateShadow = makeRoot('ha-alert');
  const lateAlert = { localName: 'ha-alert', shadowRoot: null, style: { setProperty() {}, removeProperty() {} } };
  const rootB = makeRoot('hui-card-element-editor', { childHosts: [], alerts: [lateAlert] });
  const rootA = makeRoot('hui-dialog-edit-card', { childHosts: [{ shadowRoot: rootB }] });
  const surface = { shadowRoot: rootA };

  const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false, MutationObserver: MO, requestAnimationFrame: fakeRaf });
  rt.applyEditorWarningHide(surface);
  assert.ok(hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'HOST sheet lands immediately (clamps + clips the not-yet-styled alert)');
  assert.ok(!hasStyle(lateShadow, 'nostrodomus-editor-warning-badge-shadow'), 'SHADOW cannot land yet (alert shadow is null)');
  assert.ok(frames.length > 0, 'a retry was scheduled for the unattached shadow');

  // HA finishes attaching the alert's shadow; the retry fires.
  lateAlert.shadowRoot = lateShadow;
  frames.shift()();
  assert.ok(hasStyle(lateShadow, 'nostrodomus-editor-warning-badge-shadow'), 'SHADOW sheet re-paired on the retry once the shadow exists');
});

test('SAFETY NET + hover escape: the dot clips at rest, but the HOST sheet itself un-clips on hover', () => {
  // HOST clamps + clips to the 22px dot so a HOST-only (SHADOW-absent) frame is a benign clipped dot,
  // never the full-width yellow bar. CROSS-TREE CASCADE: for NORMAL declarations an outer-tree rule
  // (the HOST sheet's `ha-alert{overflow:hidden}`) beats an inner-tree rule (the SHADOW sheet's
  // `:host{overflow:visible}`) BEFORE specificity — so the flyout escape must NOT rely on the SHADOW
  // sheet. It lives in the HOST (outer) sheet as a :hover/:focus-within rule, which wins reliably and
  // works even when the SHADOW sheet is not (yet) paired.
  assert.match(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert\)\s*\{[^}]*overflow:\s*hidden/i, 'HOST clips the alert box to the dot at rest');
  assert.match(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert\):hover[\s\S]*?overflow:\s*visible/i, 'HOST sheet un-clips on hover/focus so the flyout escapes regardless of SHADOW pairing');
  assert.match(WARNING_BADGE_SHADOW_CSS, /:host\s*\{[^}]*overflow:\s*visible/i, 'SHADOW :host overflow:visible is a belt-and-suspenders inner-tree hint (cannot override the outer host overflow alone)');
});

test('RE-APPLY WATCHER loop guard: our own <style> re-injection (no ha-alert added) does NOT re-trigger', () => {
  const MO = fakeMutationObserver();
  const { surface, rootB } = makeSurface();
  const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false, MutationObserver: MO });
  rt.applyEditorWarningHide(surface);
  const watcher = MO.instances.find((o) => o.target === rootB);
  rootB._styles.length = 0;
  // A mutation whose added node is a <style> (what our own injection produces) — not an ha-alert.
  watcher.cb([{ addedNodes: [{ nodeType: 1, localName: 'style' }] }]);
  assert.ok(!hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'no re-badge fired for a non-alert mutation (no re-entrancy loop)');
});

test('toggle ON→OFF reconciles the hide away and swaps in the badge (no reload)', () => {
  const { surface, rootB, alertShadow } = makeSurface();
  let on = true;
  const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => on });
  rt.applyEditorWarningHide(surface);
  assert.ok(hasHide(rootB), 'hidden while on');
  on = false;
  rt.applyEditorWarningHide(surface);
  assert.ok(!hasHide(rootB), 'hide removed when toggled off');
  assert.ok(hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'badge takes over as the default');
  assert.ok(hasStyle(alertShadow, 'nostrodomus-editor-warning-badge-shadow'), 'badge shadow restyle applied');
});

test('companion layer INACTIVE + toggle off: nothing injected (native warnings left alone)', () => {
  const { surface, rootB, alertShadow } = makeSurface();
  const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => false, hideEditorWarnings: () => false });
  assert.equal(rt.applyEditorWarningHide(surface), false);
  assert.ok(!hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'no badge when the layer is inactive');
  assert.ok(!hasStyle(alertShadow, 'nostrodomus-editor-warning-badge-shadow'), 'no badge shadow when inactive');
  assert.ok(!hasHide(rootB), 'no hide when inactive + toggle off');
});

test('no surface (e.g. visual tab not in a card dialog) is a safe no-op', () => {
  const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => true });
  assert.equal(rt.applyEditorWarningHide(null), false);
});

// --- Glitch-fix invariants (the "codebox extends way down" regression) ---

test('GLITCH GUARD: the hide sheet no longer carries the container-collapsing selectors/props', () => {
  // The v0.1.162 hide matched the broad, unscoped [role="alert"] / .issue-type.warning and forced
  // height:0 / max-height:0 / overflow:hidden, which collapsed a structural [role="alert"] container
  // in the visual editor and re-extended the codebox. The narrowed sheet hides the ha-alert ELEMENT
  // only, with no collapse props.
  assert.doesNotMatch(WARNING_HIDE_CSS, /\[role="alert"\]/, 'must not match the broad [role="alert"] container');
  assert.doesNotMatch(WARNING_HIDE_CSS, /issue-type/, 'must not match the structural .issue-type container');
  assert.doesNotMatch(WARNING_HIDE_CSS, /height:\s*0|max-height:\s*0|overflow:\s*hidden/i, 'must not force the collapse props that flatten a container');
  assert.match(WARNING_HIDE_CSS, /ha-alert:not\(\.gui-editor ha-alert\)\s*\{[^}]*display:\s*none/i, 'hides the precise ha-alert host with display:none');
});

test('GLITCH GUARD: the badge takes ha-alert OUT of flow (position:absolute) so it cannot reflow the editor', () => {
  assert.match(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert\)\s*\{[^}]*position:\s*absolute/i, 'the ha-alert badge is absolutely positioned (out of normal flow)');
  assert.doesNotMatch(WARNING_BADGE_HOST_CSS, /!important/, 'the badge adds no !important (relies on outer-tree + :host specificity)');
});

// --- v0.1.165 native-dot redesign (small, border-color accent, smooth deterministic flyout) ---

test('PLACEMENT: the badge anchors TOP-LEFT (left, not right) so it clears HA top-right toolbar', () => {
  assert.match(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert\)\s*\{[^}]*left:\s*8px/i, 'badge is left-anchored (top-left)');
  assert.doesNotMatch(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert\)\s*\{[^}]*right:\s*\d/i, 'badge is no longer right-anchored over the toolbar');
});

test('SMALL + NATIVE: the badge is a small (22px) icon at top-left, NOT a 34px chip, NOT orange', () => {
  assert.match(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert\)\s*\{[^}]*width:\s*22px/i, 'icon footprint is small (22px)');
  assert.doesNotMatch(WARNING_BADGE_HOST_CSS, /--warning-color|#ffa726|--error-color|--info-color|--success-color/i, 'no orange/severity chip backgrounds anymore');
});

test('NO CIRCLE (v0.1.175): the chrome around the caution triangle is removed — transparent background, no border ring, no glow', () => {
  assert.match(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert\)\s*\{[^}]*background:\s*transparent/i, 'no surface behind the icon');
  assert.match(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert\)\s*\{[^}]*border:\s*0/i, 'no accent ring around the icon');
  assert.match(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert\)\s*\{[^}]*box-shadow:\s*none/i, 'no glow ring');
  assert.doesNotMatch(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert\)\s*\{[^}]*border-radius:\s*50%/i, 'no circle');
});

test('ICON COLOR: the bare caution-triangle icon still uses --nostrodomus-badge-accent (the live codebox border color), with a cyan fallback', () => {
  assert.match(WARNING_BADGE_HOST_CSS, /color:\s*var\(--nostrodomus-badge-accent/i, 'icon color flows from the accent');
  assert.match(WARNING_BADGE_HOST_CSS, /var\(--nostrodomus-badge-accent,\s*hsl/i, 'has a cyan hsl fallback when no live color is available');
});

test('NO ORANGE PSEUDO SQUARE: HA\'s .issue-type::after solid warning-color box is removed (the square is a pseudo-element, not an element background)', () => {
  assert.match(WARNING_BADGE_SHADOW_CSS, /:host\(\[alert-type\]\)\s+\.issue-type::before\s*,\s*:host\(\[alert-type\]\)\s+\.issue-type::after\s*\{[^}]*(content:\s*none|display:\s*none)/is, 'removes the .issue-type ::before/::after pseudo-element at raised specificity');
  assert.doesNotMatch(WARNING_BADGE_SHADOW_CSS, /!important/, 'still no !important');
});

test('SMOOTH OPEN: the flyout animates ONLY opacity/transform/visibility — never width/height (the glitchy/laggy cause)', () => {
  // Pull the .content rule block and check its transition + that the trigger no longer resizes on hover.
  const contentRule = WARNING_BADGE_SHADOW_CSS.match(/\.issue-type \.content\s*\{[^}]*\}/i)?.[0] || '';
  assert.match(contentRule, /position:\s*absolute/i, 'flyout is an absolutely-positioned panel (out of flow)');
  assert.match(contentRule, /transition:[^;]*opacity[^;]*transform/i, 'transitions opacity + transform (compositor-only)');
  assert.doesNotMatch(contentRule, /transition:[^;]*(width|height|max-width)/i, 'never transitions layout properties (width/height)');
  assert.doesNotMatch(WARNING_BADGE_HOST_CSS, /:hover[^{]*\{[^}]*width/i, 'the trigger dot does not resize on hover (constant hit-area → opens the same way every time)');
  assert.doesNotMatch(WARNING_BADGE_SHADOW_CSS, /!important/, 'flyout uses specificity, not !important');
});

test('badgeAccentFromBorderColor: derives a vivid solid accent from the codebox hsla border, null for non-hsl', () => {
  assert.equal(badgeAccentFromBorderColor('hsla(186, 92%, 65%, 0.420)'), 'hsl(186, 92%, 62%)', 'keeps hue+saturation, forces a legible lightness');
  assert.equal(badgeAccentFromBorderColor('hsl(198, 90%, 65%)'), 'hsl(198, 90%, 62%)');
  assert.equal(badgeAccentFromBorderColor('rgba(255,255,255,.10)'), null, 'non-hsl (frame disabled) → null → CSS fallback stands');
  assert.equal(badgeAccentFromBorderColor(''), null);
  assert.equal(badgeAccentFromBorderColor(undefined), null);
});


// The card preview is the card, not the editor. Its alerts (a missing entity, a markdown card's own
// ha-alert) were badged or hidden too, and a preview with many shadow roots used up the 80-root
// budget before the editor's alert was reached, so that one stayed Home Assistant's full banner.
test('the card preview is left out of the warning walk; the editor alert is reached behind a large preview', () => {
  const editorAlertShadow = makeRoot('ha-alert');
  const editorAlert = { localName: 'ha-alert', shadowRoot: editorAlertShadow };
  const editorRoot = makeRoot('hui-card-element-editor', { childHosts: [editorAlert], alerts: [editorAlert] });
  const inPreview = { closest: (sel) => (String(sel).includes('element-preview') ? {} : null) };
  const previewAlertShadows = [];
  const previewRows = Array.from({ length: 120 }, () => {
    const alertShadow = makeRoot('ha-alert');
    previewAlertShadows.push(alertShadow);
    const alertEl = { localName: 'ha-alert', shadowRoot: alertShadow, ...inPreview };
    return { shadowRoot: makeRoot('hui-warning', { childHosts: [alertEl], alerts: [alertEl] }), ...inPreview };
  });
  let previewReads = 0;
  for (const row of previewRows) {
    const read = row.shadowRoot.querySelectorAll;
    row.shadowRoot.querySelectorAll = (sel) => { previewReads += 1; return read(sel); };
  }
  // Document order in the dialog: the element editor, then the preview (explored first by the walk).
  const dialogRoot = makeRoot('hui-dialog-edit-card', { childHosts: [{ shadowRoot: editorRoot }, ...previewRows] });
  const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false });
  rt.applyEditorWarningHide({ shadowRoot: dialogRoot });
  assert.ok(editorAlertShadow._styles.length > 0, 'the editor alert is badged');
  assert.equal(previewAlertShadows.filter((root) => root._styles.length > 0).length, 0, 'no preview alert is restyled');
  assert.equal(previewReads, 0, 'the preview is not read');
});

// A custom card's visual editor (Bubble Card and many others) puts its own notes between its
// controls as ha-alert elements. Those are part of the card's editor, not editor warnings.
// Measured on Home Assistant 2026.11 before this rule: the note of a custom card editor was
// 22px by 22px and sat outside the editor.
//
// These fakes carry the positions the rule reads: the root an element is in, its parent chain
// and the card editor area (.gui-editor) of the element editor.
function placed(localName, { root, parent = null, classes = [], ...rest } = {}) {
  return {
    localName,
    parentElement: parent,
    classes,
    getRootNode: () => root,
    closest(selector) {
      if (selector !== '.gui-editor') return null;
      for (let n = this; n; n = n.parentElement) if ((n.classes || []).includes('gui-editor')) return n;
      return null;
    },
    ...rest,
  };
}
function rootOf(hostElement, options) {
  const root = makeRoot(hostElement.localName, options);
  root.host = hostElement;
  hostElement.shadowRoot = root;
  return root;
}

// dialog > element editor > [ .gui-editor > the card's editor (own shadow root, with a note) ] + Home Assistant's warning
function makeCardEditorSurface({ cardEditorName = 'my-card-editor' } = {}) {
  const dialogHost = placed('hui-dialog-edit-card', { root: {} });
  const elementEditorHost = placed('hui-card-element-editor', { root: null });
  const cardEditorHost = placed(cardEditorName, { root: null });
  const note = placed('ha-alert', { root: null, style: { setProperty() { note.accentSet = true; }, removeProperty() {} } });
  const warning = placed('ha-alert', { root: null, style: { setProperty() {}, removeProperty() {} } });

  const noteShadow = rootOf(note);
  const warningShadow = rootOf(warning);
  const cardEditorRoot = rootOf(cardEditorHost, { childHosts: [note], alerts: [note] });
  const elementEditorRoot = rootOf(elementEditorHost, { childHosts: [cardEditorHost, warning], alerts: [warning] });
  const dialogRoot = rootOf(dialogHost, { childHosts: [elementEditorHost] });

  const area = placed('div', { root: elementEditorRoot, classes: ['gui-editor'] });
  cardEditorHost.parentElement = area;
  cardEditorHost.getRootNode = () => elementEditorRoot;
  note.getRootNode = () => cardEditorRoot;
  warning.getRootNode = () => elementEditorRoot;
  elementEditorHost.getRootNode = () => dialogRoot;
  return { surface: dialogHost, dialogRoot, elementEditorRoot, cardEditorRoot, note, noteShadow, warningShadow };
}

test('a note in a card\'s own visual editor is not badged; the editor warning next to it is', () => {
  const { surface, cardEditorRoot, note, noteShadow, elementEditorRoot, warningShadow } = makeCardEditorSurface();
  const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false });
  rt.applyEditorWarningHide(surface);
  assert.equal(cardEditorRoot._styles.length, 0, 'nothing is injected into the card editor root');
  assert.equal(noteShadow._styles.length, 0, 'nothing is injected into the note');
  assert.notEqual(note.accentSet, true, 'no accent is written on the note');
  assert.ok(hasStyle(elementEditorRoot, 'nostrodomus-editor-warning-badge-host'), 'the editor warning is still badged');
  assert.ok(hasStyle(warningShadow, 'nostrodomus-editor-warning-badge-shadow'), 'the editor warning has its badge internals');
});

test('"Hide editor warnings" hides the editor warning and leaves the card\'s own note', () => {
  const { surface, cardEditorRoot, noteShadow, elementEditorRoot, dialogRoot } = makeCardEditorSurface();
  const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => true });
  rt.applyEditorWarningHide(surface);
  assert.ok(hasHide(elementEditorRoot), 'the element editor root gets the hide sheet');
  assert.ok(hasHide(dialogRoot), 'and the dialog root');
  assert.ok(!hasHide(cardEditorRoot), 'the card editor root does not');
  assert.equal(noteShadow._styles.length, 0, 'nothing is injected into the note');
});

// Home Assistant draws warnings in its own visual editors too (a condition that cannot be shown,
// a form error). Those are handled as before: the rule only leaves out a custom card's editor.
test('a warning inside one of Home Assistant\'s own visual editors is still badged and hidden', () => {
  for (const hide of [false, true]) {
    const { surface, cardEditorRoot, noteShadow } = makeCardEditorSurface({ cardEditorName: 'hui-conditional-card-editor' });
    const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => hide });
    rt.applyEditorWarningHide(surface);
    if (hide) {
      assert.ok(hasHide(cardEditorRoot), 'hidden with the setting on');
    } else {
      assert.ok(hasStyle(cardEditorRoot, 'nostrodomus-editor-warning-badge-host'), 'badged in its container');
      assert.ok(hasStyle(noteShadow, 'nostrodomus-editor-warning-badge-shadow'), 'with the badge internals');
    }
  }
});

// A card editor that draws without a shadow root: its note is in the element editor's own tree,
// under the card editor area, in the same root as Home Assistant's warning.
test('a card editor without a shadow root: its note is left alone, the warning in the same root is badged', () => {
  const dialogHost = placed('hui-dialog-edit-card', { root: {} });
  const elementEditorHost = placed('hui-card-element-editor', { root: null });
  const note = placed('ha-alert', { root: null, style: { setProperty() { note.accentSet = true; }, removeProperty() {} } });
  const warning = placed('ha-alert', { root: null, style: { setProperty() { warning.accentSet = true; }, removeProperty() {} } });
  const noteShadow = rootOf(note);
  const warningShadow = rootOf(warning);
  const elementEditorRoot = rootOf(elementEditorHost, { childHosts: [note, warning], alerts: [note, warning] });
  const dialogRoot = rootOf(dialogHost, { childHosts: [elementEditorHost] });
  const area = placed('div', { root: elementEditorRoot, classes: ['gui-editor'] });
  const cardEditor = placed('my-card-editor', { root: elementEditorRoot, parent: area });
  note.parentElement = cardEditor;
  note.getRootNode = () => elementEditorRoot;
  warning.getRootNode = () => elementEditorRoot;
  elementEditorHost.getRootNode = () => dialogRoot;

  assert.deepEqual(editorWarningAlerts(elementEditorRoot), [warning], 'only the warning is an editor warning');
  const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false });
  rt.applyEditorWarningHide(dialogHost);
  assert.ok(hasStyle(elementEditorRoot, 'nostrodomus-editor-warning-badge-host'), 'the root is badged for the warning');
  assert.ok(hasStyle(warningShadow, 'nostrodomus-editor-warning-badge-shadow'), 'the warning has its badge internals');
  assert.equal(noteShadow._styles.length, 0, 'nothing is injected into the note');
  assert.notEqual(note.accentSet, true, 'no accent is written on the note');

  // The badge and hide sheets are in that shared tree, so every selector of every rule leaves
  // the card editor area out.
  const selectors = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').split('}')
    .map((rule) => rule.split('{')[0].trim()).filter(Boolean)
    .flatMap((list) => list.split(',').map((s) => s.trim()).filter((s) => !/^\.gui-editor/.test(s) && !/\*\)$/.test(s)));
  for (const selector of [...selectors(WARNING_BADGE_HOST_CSS), ...selectors(WARNING_HIDE_CSS)]) {
    assert.match(selector, /:not\(\.gui-editor/, `"${selector}" leaves out the card editor area`);
  }
});

// With the setting on, the companion apply for the main editor and the warning reconcile agree
// about which roots hold the hide sheet, so a pass does not add a sheet that the other removes.
test('"Hide editor warnings": the nested roots of the companion apply keep their sheet through the reconcile', () => {
  const { surface, elementEditorRoot } = makeSurfaceForHide();
  const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => true });
  rt.applyEditorWarningHide(surface);
  const before = elementEditorRoot._styles.length;
  rt.applyEditorWarningHide(surface);
  assert.equal(elementEditorRoot._styles.length, before, 'a second reconcile changes nothing');
  assert.ok(hasHide(elementEditorRoot));
});
function makeSurfaceForHide() {
  const { surface, rootB } = makeSurface();
  return { surface, elementEditorRoot: rootB };
}
