// Editor warning badge and "Hide editor warnings" across the card edit dialog.
//
// The warning (ha-alert) lives in nested shadow roots inside the dialog
// (dialog → … → card-element-editor → ha-alert). applyEditorWarningHide walks them and, depending
// on the setting and the companion layer:
//   • setting off, layer active: adds the badge host sheet to the root that contains the ha-alert
//     and the badge shadow sheet to the ha-alert's own shadow root (the default look);
//   • setting on: adds the display:none hide sheet (it has no effect where there is no ha-alert);
//   • setting off, layer inactive: removes everything.
// The fakes below mirror the nested shadow structure Home Assistant renders.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCompanionStyleRuntime,
  WARNING_HIDE_CSS,
  WARNING_BADGE_HOST_CSS,
  WARNING_BADGE_SHADOW_CSS,
  badgeAccentFromBorderColor,
  editorWarningAlerts,
} from '../../src/companion/companionStyleRuntime.js';

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

// dialog shadow (rootA) → nested card-editor shadow (rootB) → the ha-alert element, whose own
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

test('with the setting on, the display:none sheet reaches the dialog and the nested card editor root', () => {
  const { surface, rootA, rootB } = makeSurface();
  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => true });
  assert.equal(rt.applyEditorWarningHide(surface), true);
  assert.ok(hasHide(rootA), 'dialog shadow root gets the hide sheet');
  assert.ok(hasHide(rootB), 'the nested card-editor root (where the ha-alert lives) gets it too');
});

test('with the setting off and the layer active, the alert container gets the host sheet and the alert shadow the shadow sheet', () => {
  const { surface, rootA, rootB, alertShadow } = makeSurface();
  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false });
  assert.equal(rt.applyEditorWarningHide(surface), true);
  assert.ok(hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'the root containing the ha-alert gets the badge host sheet');
  assert.ok(hasStyle(alertShadow, 'nostrodomus-editor-warning-badge-shadow'), "the ha-alert's own shadow gets the badge shadow sheet");
  assert.ok(!hasStyle(rootA, 'nostrodomus-editor-warning-badge-host'), 'a root without an ha-alert child is not badged');
  assert.ok(!hasHide(rootA) && !hasHide(rootB), 'no hide sheet anywhere while the toggle is off');
});

test('an alert nested deeper than the walk reaches gets the shadow sheet together with the host sheet', () => {
  // A custom card's validation alert (better-thermostat min_temp) can sit deeper than the
  // depth and root cap of deepShadowRootsWithin. The walk reaches its container, which gets the
  // host sheet and shrinks the alert to a 22px dot; without the shadow sheet the alert's content
  // and icon would spill out of it. Here the alert is found in its container but is not a walked
  // child host, so the walk never enters its shadow root.
  const alertShadow = makeRoot('ha-alert');
  const alertEl = { localName: 'ha-alert', shadowRoot: alertShadow, style: { setProperty() {}, removeProperty() {} } };
  const rootB = makeRoot('hui-card-element-editor', { childHosts: [], alerts: [alertEl] });
  const rootA = makeRoot('hui-dialog-edit-card', { childHosts: [{ shadowRoot: rootB }] });
  const surface = { shadowRoot: rootA };

  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false });
  assert.equal(rt.applyEditorWarningHide(surface), true);
  assert.ok(hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'the host sheet lands on the alert container (the walk reaches it)');
  assert.ok(hasStyle(alertShadow, 'nostrodomus-editor-warning-badge-shadow'), "the alert's own shadow gets the shadow sheet with the host sheet, not through the capped walk");
});

// A fake MutationObserver that records each instance and its target, so a test can call the
// callback with its own records (plain-object roots cannot be observed).
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

test('when Home Assistant rebuilds the alert, the container watcher badges it again at once', () => {
  // While the user types, Home Assistant removes and re-adds the ha-alert in its container on every
  // keystroke, which drops our sheets; without the watcher the full yellow banner would flash back.
  const MO = fakeMutationObserver();
  const { surface, rootB, alertShadow } = makeSurface();
  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false, MutationObserver: MO });
  assert.equal(rt.applyEditorWarningHide(surface), true);
  assert.ok(hasStyle(rootB, 'nostrodomus-editor-warning-badge-host') && hasStyle(alertShadow, 'nostrodomus-editor-warning-badge-shadow'), 'badge fully applied on first pass');

  const watcher = MO.instances.find((o) => o.target === rootB);
  assert.ok(watcher, 'a re-apply watcher is attached to the alert container root');

  // Simulate HA rebuilding: it wipes both our sheets, then re-adds a fresh ha-alert.
  rootB._styles.length = 0;
  alertShadow._styles.length = 0;
  assert.ok(!hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'sheets gone after the rebuild, before the watcher runs');
  watcher.cb([{ addedNodes: [{ nodeType: 1, localName: 'ha-alert' }] }]);
  assert.ok(hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'the host sheet is injected again as soon as HA re-adds the alert');
  assert.ok(hasStyle(alertShadow, 'nostrodomus-editor-warning-badge-shadow'), 'the shadow sheet too (no native banner flash)');
});

test('the container watcher observes the subtree, because the alert is re-added below a wrapper', () => {
  const MO = fakeMutationObserver();
  const { surface, rootB } = makeSurface();
  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false, MutationObserver: MO });
  rt.applyEditorWarningHide(surface);
  const watcher = MO.instances.find((o) => o.target === rootB);
  assert.ok(watcher, 'watcher attached');
  // Must be subtree:true — a childList-only observe would miss a rebuilt alert added under a wrapper.
  assert.equal(watcher.options?.subtree, true, 'observes subtree, not just direct children');
  assert.equal(watcher.options?.childList, true);
});

test('the container watcher retries the shadow sheet when the rebuilt alert has no shadow root yet', () => {
  // A rebuilt alert is a new LitElement whose shadow root attaches a frame later, so it is null when
  // the watcher fires. The host sheet already clips it, and a bounded retry adds the shadow sheet once
  // the shadow root exists.
  const MO = fakeMutationObserver();
  const frames = [];
  const fakeRaf = (fn) => { frames.push(fn); return frames.length; };
  // Container whose ha-alert has no shadow root yet at callback time.
  const lateShadow = makeRoot('ha-alert');
  const lateAlert = { localName: 'ha-alert', shadowRoot: null, style: { setProperty() {}, removeProperty() {} } };
  const rootB = makeRoot('hui-card-element-editor', { childHosts: [], alerts: [lateAlert] });
  const rootA = makeRoot('hui-dialog-edit-card', { childHosts: [{ shadowRoot: rootB }] });
  const surface = { shadowRoot: rootA };

  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false, MutationObserver: MO, requestAnimationFrame: fakeRaf });
  rt.applyEditorWarningHide(surface);
  assert.ok(hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'the host sheet lands at once (clamps and clips the alert that is not styled yet)');
  assert.ok(!hasStyle(lateShadow, 'nostrodomus-editor-warning-badge-shadow'), 'the shadow sheet cannot land yet (alert shadow is null)');
  assert.ok(frames.length > 0, 'a retry was scheduled for the unattached shadow');

  // HA finishes attaching the alert's shadow; the retry fires.
  lateAlert.shadowRoot = lateShadow;
  frames.shift()();
  assert.ok(hasStyle(lateShadow, 'nostrodomus-editor-warning-badge-shadow'), 'the shadow sheet is added on the retry once the shadow root exists');
});

test('the dot is clipped at rest and the host sheet itself unclips it on hover', () => {
  // The host sheet clips the alert to the 22px dot, so a frame without the shadow sheet shows a
  // clipped dot, never the full-width yellow bar. For normal declarations an outer-tree rule (the host
  // sheet's `ha-alert{overflow:hidden}`) wins over an inner-tree rule (the shadow sheet's
  // `:host{overflow:visible}`) before specificity is compared, so the flyout must be unclipped by a
  // :hover/:focus-within rule in the host sheet.
  assert.match(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert, \.element-preview ha-alert\)\s*\{[^}]*overflow:\s*hidden/i, 'the host sheet clips the alert box to the dot at rest');
  assert.match(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert, \.element-preview ha-alert\):hover[\s\S]*?overflow:\s*visible/i, 'the host sheet unclips on hover and focus, so the flyout opens with or without the shadow sheet');
  assert.match(WARNING_BADGE_SHADOW_CSS, /:host\s*\{[^}]*overflow:\s*visible/i, 'the shadow sheet also sets :host overflow:visible (it cannot override the outer rule on its own)');
});

test('the container watcher ignores our own <style> insertions, so it cannot loop', () => {
  const MO = fakeMutationObserver();
  const { surface, rootB } = makeSurface();
  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false, MutationObserver: MO });
  rt.applyEditorWarningHide(surface);
  const watcher = MO.instances.find((o) => o.target === rootB);
  rootB._styles.length = 0;
  // A mutation whose added node is a <style> (what our own injection produces) — not an ha-alert.
  watcher.cb([{ addedNodes: [{ nodeType: 1, localName: 'style' }] }]);
  assert.ok(!hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'no re-badge fired for a non-alert mutation (no re-entrancy loop)');
});

test('turning the toggle off removes the hide and shows the badge, without a reload', () => {
  const { surface, rootB, alertShadow } = makeSurface();
  let on = true;
  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => on });
  rt.applyEditorWarningHide(surface);
  assert.ok(hasHide(rootB), 'hidden while on');
  on = false;
  rt.applyEditorWarningHide(surface);
  assert.ok(!hasHide(rootB), 'hide removed when toggled off');
  assert.ok(hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'badge takes over as the default');
  assert.ok(hasStyle(alertShadow, 'nostrodomus-editor-warning-badge-shadow'), 'badge shadow restyle applied');
});

test('with the companion layer inactive and the setting off, nothing is added and the warnings stay as they are', () => {
  const { surface, rootB, alertShadow } = makeSurface();
  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => false, hideEditorWarnings: () => false });
  assert.equal(rt.applyEditorWarningHide(surface), false);
  assert.ok(!hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'no badge when the layer is inactive');
  assert.ok(!hasStyle(alertShadow, 'nostrodomus-editor-warning-badge-shadow'), 'no badge shadow when inactive');
  assert.ok(!hasHide(rootB), 'no hide when inactive + toggle off');
});

test('no surface (e.g. visual tab not in a card dialog) is a safe no-op', () => {
  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => true });
  assert.equal(rt.applyEditorWarningHide(null), false);
});

// --- The warning sheets must not change the editor layout ---

test('the hide sheet hides only the ha-alert element and collapses no container', () => {
  // A broad [role="alert"] or .issue-type.warning selector with height:0, max-height:0 or
  // overflow:hidden collapses a structural [role="alert"] container in the visual editor, and the
  // codebox then grows far down the dialog.
  assert.doesNotMatch(WARNING_HIDE_CSS, /\[role="alert"\]/, 'must not match the broad [role="alert"] container');
  assert.doesNotMatch(WARNING_HIDE_CSS, /issue-type/, 'must not match the structural .issue-type container');
  assert.doesNotMatch(WARNING_HIDE_CSS, /height:\s*0|max-height:\s*0|overflow:\s*hidden/i, 'must not force the collapse props that flatten a container');
  assert.match(WARNING_HIDE_CSS, /ha-alert:not\(\.gui-editor ha-alert, \.element-preview ha-alert\)\s*\{[^}]*display:\s*none/i, 'hides the precise ha-alert host with display:none');
});

test('the badge takes the ha-alert out of the flow (position:absolute), so it cannot move the editor', () => {
  assert.match(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert, \.element-preview ha-alert\)\s*\{[^}]*position:\s*absolute/i, 'the ha-alert badge is absolutely positioned (out of normal flow)');
  assert.doesNotMatch(WARNING_BADGE_HOST_CSS, /!important/, 'the badge adds no !important (relies on outer-tree + :host specificity)');
});

// --- The badge: a small icon in the border color with a smooth flyout ---

test('the badge sits at the top left, clear of the toolbar at the top right', () => {
  assert.match(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert, \.element-preview ha-alert\)\s*\{[^}]*left:\s*8px/i, 'badge is left-anchored (top-left)');
  assert.doesNotMatch(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert, \.element-preview ha-alert\)\s*\{[^}]*right:\s*\d/i, 'badge is not right-anchored over the toolbar');
});

test('the badge is a 22px icon with no severity color behind it', () => {
  assert.match(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert, \.element-preview ha-alert\)\s*\{[^}]*width:\s*22px/i, 'icon footprint is small (22px)');
  assert.doesNotMatch(WARNING_BADGE_HOST_CSS, /--warning-color|#ffa726|--error-color|--info-color|--success-color/i, 'no orange or severity chip background');
});

test('the caution triangle has no surface, ring, glow or circle around it', () => {
  assert.match(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert, \.element-preview ha-alert\)\s*\{[^}]*background:\s*transparent/i, 'no surface behind the icon');
  assert.match(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert, \.element-preview ha-alert\)\s*\{[^}]*border:\s*0/i, 'no accent ring around the icon');
  assert.match(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert, \.element-preview ha-alert\)\s*\{[^}]*box-shadow:\s*none/i, 'no glow ring');
  assert.doesNotMatch(WARNING_BADGE_HOST_CSS, /ha-alert:not\(\.gui-editor ha-alert, \.element-preview ha-alert\)\s*\{[^}]*border-radius:\s*50%/i, 'no circle');
});

test('the caution triangle uses --nostrodomus-badge-accent (the codebox border color) with a cyan fallback', () => {
  assert.match(WARNING_BADGE_HOST_CSS, /color:\s*var\(--nostrodomus-badge-accent/i, 'icon color flows from the accent');
  assert.match(WARNING_BADGE_HOST_CSS, /var\(--nostrodomus-badge-accent,\s*hsl/i, 'has a cyan hsl fallback when no live color is available');
});

test('Home Assistant\'s orange square, drawn by the .issue-type pseudo-elements, is removed', () => {
  assert.match(WARNING_BADGE_SHADOW_CSS, /:host\(\[alert-type\]\)\s+\.issue-type::before\s*,\s*:host\(\[alert-type\]\)\s+\.issue-type::after\s*\{[^}]*(content:\s*none|display:\s*none)/is, 'removes the .issue-type ::before/::after pseudo-element at raised specificity');
  assert.doesNotMatch(WARNING_BADGE_SHADOW_CSS, /!important/, 'no !important');
});

test('the flyout animates only opacity, transform and visibility, never its width or height', () => {
  // Animating the size of the flyout made it open unevenly. The trigger dot keeps its size on hover.
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


// The card preview is the card, not the editor: its alerts (a missing entity, a markdown card's own
// ha-alert) are not badged or hidden, and a preview with many shadow roots must not use up the
// 80-root budget before the walk reaches the editor's alert.
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
  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false });
  rt.applyEditorWarningHide({ shadowRoot: dialogRoot });
  assert.ok(editorAlertShadow._styles.length > 0, 'the editor alert is badged');
  assert.equal(previewAlertShadows.filter((root) => root._styles.length > 0).length, 0, 'no preview alert is restyled');
  assert.equal(previewReads, 0, 'the preview is not read');
});

// Home Assistant renders the previewed card into hui-card's light tree, so a card that draws
// without a shadow root has its ha-alert directly in the dialog's shadow root. That alert is the
// card's: it is not an editor warning, it is not badged, and the sheets leave it out.
test('an ha-alert of a card drawn without a shadow root, in the preview of the dialog root, is the card\'s', () => {
  const previewAlert = { localName: 'ha-alert', shadowRoot: null, closest: (sel) => (String(sel).includes('element-preview') ? {} : null) };
  const dialogRoot = makeRoot('hui-dialog-edit-card', { alerts: [previewAlert] });
  assert.deepEqual(editorWarningAlerts(dialogRoot), [], 'not an editor warning');

  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false });
  rt.applyEditorWarningHide({ shadowRoot: dialogRoot });
  assert.equal(hasStyle(dialogRoot, 'nostrodomus-editor-warning-badge-host'), false, 'the dialog root is not badged for it');

  // Every selector of the hide and badge sheets that matches an ha-alert, or the parent of one,
  // leaves the preview out.
  for (const [name, css] of [['hide', WARNING_HIDE_CSS], ['badge host', WARNING_BADGE_HOST_CSS]]) {
    const selectors = css.split('}').map((block) => block.split('{')[0]).flatMap((s) => s.split(/,(?![^(]*\))/)).map((s) => s.trim()).filter((s) => /ha-alert/.test(s));
    assert.ok(selectors.length > 0, `${name} sheet has ha-alert selectors`);
    for (const selector of selectors) {
      assert.match(selector, /\.element-preview/, `${name} sheet selector leaves the preview out: ${selector}`);
    }
  }
});

// A custom card's visual editor (Bubble Card and many others) puts its own notes between its
// controls as ha-alert elements. Those are part of the card's editor, not editor warnings; badged,
// such a note shrinks to a 22px dot outside the editor (measured on Home Assistant 2026.11).
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
  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false });
  rt.applyEditorWarningHide(surface);
  assert.equal(cardEditorRoot._styles.length, 0, 'nothing is injected into the card editor root');
  assert.equal(noteShadow._styles.length, 0, 'nothing is injected into the note');
  assert.notEqual(note.accentSet, true, 'no accent is written on the note');
  assert.ok(hasStyle(elementEditorRoot, 'nostrodomus-editor-warning-badge-host'), 'the editor warning is still badged');
  assert.ok(hasStyle(warningShadow, 'nostrodomus-editor-warning-badge-shadow'), 'the editor warning has its badge internals');
});

test('"Hide editor warnings" hides the editor warning and leaves the card\'s own note', () => {
  const { surface, cardEditorRoot, noteShadow, elementEditorRoot, dialogRoot } = makeCardEditorSurface();
  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => true });
  rt.applyEditorWarningHide(surface);
  assert.ok(hasHide(elementEditorRoot), 'the element editor root gets the hide sheet');
  assert.ok(hasHide(dialogRoot), 'and the dialog root');
  assert.ok(!hasHide(cardEditorRoot), 'the card editor root does not');
  assert.equal(noteShadow._styles.length, 0, 'nothing is injected into the note');
});

// Home Assistant draws warnings in its own visual editors too (a condition that cannot be shown,
// a form error). Those are badged and hidden; only a custom card's editor is left out.
test('a warning inside one of Home Assistant\'s own visual editors is badged and hidden', () => {
  for (const hide of [false, true]) {
    const { surface, cardEditorRoot, noteShadow } = makeCardEditorSurface({ cardEditorName: 'hui-conditional-card-editor' });
    const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => hide });
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
  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false });
  rt.applyEditorWarningHide(dialogHost);
  assert.ok(hasStyle(elementEditorRoot, 'nostrodomus-editor-warning-badge-host'), 'the root is badged for the warning');
  assert.ok(hasStyle(warningShadow, 'nostrodomus-editor-warning-badge-shadow'), 'the warning has its badge internals');
  assert.equal(noteShadow._styles.length, 0, 'nothing is injected into the note');
  assert.notEqual(note.accentSet, true, 'no accent is written on the note');

  // The badge and hide sheets are in that shared tree, so every selector of every rule leaves
  // the card editor area out.
  const selectors = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').split('}')
    .map((rule) => rule.split('{')[0].trim()).filter(Boolean)
    .flatMap((list) => list.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean));
  for (const selector of [...selectors(WARNING_BADGE_HOST_CSS), ...selectors(WARNING_HIDE_CSS)]) {
    assert.match(selector, /:not\(\.gui-editor/, `"${selector}" leaves out the card editor area`);
  }
});

// With the setting on, the companion apply for the main editor and the warning reconcile agree
// about which roots hold the hide sheet, so a pass does not add a sheet that the other removes.
test('"Hide editor warnings": the nested roots of the companion apply keep their sheet through the reconcile', () => {
  const { surface, elementEditorRoot } = makeSurfaceForHide();
  const rt = createCompanionStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => true });
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
