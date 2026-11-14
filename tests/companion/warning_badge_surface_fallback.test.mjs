import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createScrollbarStyleRuntime } from '../../src/companion/scrollbarStyleRuntime.js';

// The warning badge stopped appearing in a custom-card edit dialog:
// the dialog IS present with its ha-alert inside, but visibleDialogSurface() filters it
// out (HA 2026.7 body/wa-dialog visibility), so activeEditDialog() returns null and the
// badge source no-ops. The badge source goes through activeEditorWarningSurface,
// which falls back to an edit-card candidate when the visible filter yields null. This
// test drives the real injector on the resolved fallback surface (not the removed lane)
// and pins the composition-root wiring.
function makeRoot(hostLocalName, { childHosts = [], alerts = [] } = {}) {
  const styles = [];
  const root = {
    host: { localName: hostLocalName },
    _styles: styles,
    querySelectorAll: (sel) => (sel === '*' ? childHosts.slice() : sel === 'ha-alert' ? alerts.slice() : []),
    querySelector: (sel) => (sel === 'ha-alert' ? alerts[0] || null : styles.find((s) => '#' + s.id === sel) || null),
    appendChild: (n) => { n._parent = root; styles.push(n); return n; },
  };
  return root;
}
const fakeDoc = { createElement: () => ({ id: '', textContent: '', remove() {} }) };
const hasStyle = (root, id) => root._styles.some((s) => s.id === id);

// A dialog surface exactly as a candidate would present it: hui-dialog-edit-card shadow
// containing the nested card-editor root that holds the ha-alert.
function makeCandidateSurface() {
  const alertShadow = makeRoot('ha-alert');
  const alertEl = { localName: 'ha-alert', shadowRoot: alertShadow };
  const rootB = makeRoot('hui-card-element-editor', { childHosts: [alertEl], alerts: [alertEl] });
  const rootA = makeRoot('hui-dialog-edit-card', { childHosts: [{ shadowRoot: rootB }] });
  return { surface: { shadowRoot: rootA }, rootB, alertShadow };
}

// The fix's resolution semantics: the visible dialog, else the most recent candidate.
const resolveSurface = (activeEditDialog, candidates) => activeEditDialog() || candidates().slice(-1)[0] || null;

test('the badge injects on the candidate fallback surface when activeEditDialog yields null', () => {
  const { surface, rootB, alertShadow } = makeCandidateSurface();
  const rt = createScrollbarStyleRuntime({ documentRef: fakeDoc, isActive: () => true, hideEditorWarnings: () => false });

  // Without the fallback: null surface -> nothing injected.
  assert.equal(rt.applyEditorWarningHide(resolveSurface(() => null, () => [])), false);

  // Fixed behaviour: fall back to the present candidate (which holds the alert) -> badge injects.
  const resolved = resolveSurface(() => null, () => [surface]);
  assert.equal(rt.applyEditorWarningHide(resolved), true);
  assert.ok(hasStyle(rootB, 'nostrodomus-editor-warning-badge-host'), 'HOST sheet injected on the fallback surface');
  assert.ok(hasStyle(alertShadow, 'nostrodomus-editor-warning-badge-shadow'), 'SHADOW sheet injected on the fallback surface');
});

test('the badge source is wired through activeEditorWarningSurface, which falls back to a candidate', () => {
  const mainLegacy = readFileSync(fileURLToPath(new URL('../../src/main.legacy.js', import.meta.url)), 'utf8');
  assert.match(
    mainLegacy,
    /applyEditorWarningHide\(activeEditorWarningSurface\(\)\)/,
    'the badge surface source must use activeEditorWarningSurface, not the strict activeEditDialog',
  );

  const activeEditor = readFileSync(fileURLToPath(new URL('../../src/editor/activeEditor.js', import.meta.url)), 'utf8');
  const body = activeEditor.match(/export function activeEditorWarningSurface\(\)\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';
  assert.ok(body, 'activeEditorWarningSurface must exist');
  assert.match(body, /activeEditDialog\(\)/, 'prefers the visible edit dialog');
  assert.match(body, /editCardDialogCandidates\(\)/, 'falls back to an edit-card candidate when the visible filter yields null');
});
