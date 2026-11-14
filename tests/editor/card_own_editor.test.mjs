// A custom card's own visual editor is left alone (src/editor/cardOwnEditor.js).
//
// The rule is positional: an element is inside a card's own editor when the nearest element
// editor above it holds it under the card editor area and the editor element there is not one of
// Home Assistant's. These tests build the shapes Home Assistant produces and check the answer,
// then pin that every place that picks an editor asks the rule.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { insideCardOwnEditor, nestedInCardOwnEditor, isElementEditorHostName, CARD_EDITOR_AREA_SELECTOR } from '../../src/editor/cardOwnEditor.js';

const DOCUMENT = {}; // a root without a host
const shadowRootOf = (host) => ({ host });
function el(localName, { root = DOCUMENT, parent = null, classes = [] } = {}) {
  return {
    localName,
    parentElement: parent,
    classes,
    getRootNode() { return root; },
    closest(selector) {
      assert.equal(selector, CARD_EDITOR_AREA_SELECTOR);
      for (let n = this; n; n = n.parentElement) if (n.classes.includes('gui-editor')) return n;
      return null;
    },
  };
}

// hui-dialog-edit-card > hui-card-element-editor, with either area in its shadow root.
function elementEditor(name = 'hui-card-element-editor', where = {}) {
  const host = el(name, where);
  const root = shadowRootOf(host);
  const wrapper = el('div', { root, classes: ['wrapper'] });
  return {
    host,
    root,
    guiArea: () => el('div', { root, parent: wrapper, classes: ['gui-editor'] }),
    yamlArea: () => el('div', { root, parent: wrapper, classes: ['yaml-editor'] }),
  };
}
function yamlEditorIn(area, root) {
  const yaml = el('ha-yaml-editor', { root, parent: area });
  return el('ha-code-editor', { root: shadowRootOf(yaml) });
}

test('the dialog\'s YAML editor is Home Assistant\'s', () => {
  const ee = elementEditor();
  assert.equal(insideCardOwnEditor(yamlEditorIn(ee.yamlArea(), ee.root)), false);
});

test('a code box in a custom card editor that draws in a shadow root is the card\'s', () => {
  const ee = elementEditor();
  const cardEditor = el('bubble-card-editor', { root: ee.root, parent: ee.guiArea() });
  const cardRoot = shadowRootOf(cardEditor);
  const section = el('ha-expansion-panel', { root: cardRoot });
  const code = el('ha-code-editor', { root: cardRoot, parent: section });
  assert.equal(insideCardOwnEditor(code), true);
  assert.equal(insideCardOwnEditor(el('input', { root: cardRoot })), true, 'and so is any control of that editor');
  // Deeper: an element of a component the card editor uses.
  const inner = el('div', { root: shadowRootOf(section) });
  assert.equal(insideCardOwnEditor(inner), true);
});

test('a code box in a custom card editor that draws without a shadow root is the card\'s', () => {
  const ee = elementEditor();
  const cardEditor = el('my-card-editor', { root: ee.root, parent: ee.guiArea() });
  const row = el('div', { root: ee.root, parent: cardEditor });
  assert.equal(insideCardOwnEditor(el('ha-code-editor', { root: ee.root, parent: row })), true);
  assert.equal(insideCardOwnEditor(el('ha-alert', { root: ee.root, parent: cardEditor })), true);
});

test('Home Assistant\'s own visual editors are not a custom card\'s', () => {
  const ee = elementEditor();
  const haEditor = el('hui-markdown-card-editor', { root: ee.root, parent: ee.guiArea() });
  const form = el('ha-form', { root: shadowRootOf(haEditor) });
  assert.equal(insideCardOwnEditor(el('ha-code-editor', { root: shadowRootOf(form) })), false);
});

test('the nearest element editor decides', () => {
  // A stack card: Home Assistant's stack editor holds a nested element editor for one card.
  const outer = elementEditor();
  const stack = el('hui-stack-card-editor', { root: outer.root, parent: outer.guiArea() });
  const nested = elementEditor('hui-card-element-editor', { root: shadowRootOf(stack) });
  assert.equal(insideCardOwnEditor(yamlEditorIn(nested.yamlArea(), nested.root)), false, 'the nested YAML editor is Home Assistant\'s');
  const nestedCustom = el('mushroom-light-card-editor', { root: nested.root, parent: nested.guiArea() });
  assert.equal(insideCardOwnEditor(el('ha-code-editor', { root: shadowRootOf(nestedCustom) })), true, 'a custom card nested in the stack keeps its own editor');

  // A custom card whose editor nests Home Assistant's element editor for a sub-card.
  const top = elementEditor();
  const custom = el('swipe-card-editor', { root: top.root, parent: top.guiArea() });
  const sub = elementEditor('hui-card-element-editor', { root: shadowRootOf(custom) });
  const subYaml = yamlEditorIn(sub.yamlArea(), sub.root);
  assert.equal(insideCardOwnEditor(subYaml), false, 'the YAML editor of the sub-card is Home Assistant\'s');
  assert.equal(nestedInCardOwnEditor(subYaml), true, 'and it is known to sit inside a custom card\'s editor');
  assert.equal(insideCardOwnEditor(sub.host), true, 'the element editor host itself is part of the custom card\'s layout');

  // The same question for Home Assistant's own nesting and for the dialog's main editor.
  assert.equal(nestedInCardOwnEditor(yamlEditorIn(nested.yamlArea(), nested.root)), false, 'a stack card\'s nested YAML editor is not');
  const main = elementEditor();
  assert.equal(nestedInCardOwnEditor(yamlEditorIn(main.yamlArea(), main.root)), false, 'the main YAML editor is not');
});

// Home Assistant puts more than the editor element into the card editor area: the Config,
// Visibility and Layout tab row, the loading placeholder, and the editors of the other tabs.
test('what Home Assistant itself puts in the card editor area is Home Assistant\'s', () => {
  const ee = elementEditor();
  const area = ee.guiArea();
  assert.equal(insideCardOwnEditor(area), false, 'the area itself');
  const tabs = el('ha-tab-group', { root: ee.root, parent: area });
  assert.equal(insideCardOwnEditor(tabs), false, 'the tab row');
  assert.equal(insideCardOwnEditor(el('ha-tab-group-tab', { root: ee.root, parent: tabs })), false, 'a tab');
  assert.equal(insideCardOwnEditor(el('ha-fade-in', { root: ee.root, parent: area })), false, 'the loading placeholder');
  assert.equal(insideCardOwnEditor(el('div', { root: ee.root, parent: area })), false, 'a plain wrapper');
  const layout = el('hui-card-layout-editor', { root: ee.root, parent: area });
  const layoutYaml = el('ha-yaml-editor', { root: shadowRootOf(layout) });
  assert.equal(insideCardOwnEditor(el('ha-code-editor', { root: shadowRootOf(layoutYaml) })), false, 'the YAML editor of the Layout tab');
  // A custom editor inside a plain wrapper is still found.
  const wrapper = el('div', { root: ee.root, parent: area });
  const custom = el('my-card-editor', { root: ee.root, parent: wrapper });
  assert.equal(insideCardOwnEditor(el('input', { root: shadowRootOf(custom) })), true, 'a custom editor in a wrapper');
});

test('an editor outside any element editor is not a custom card\'s', () => {
  const panel = el('ha-automation-editor');
  const yaml = el('ha-yaml-editor', { root: shadowRootOf(panel) });
  assert.equal(insideCardOwnEditor(el('ha-code-editor', { root: shadowRootOf(yaml) })), false);
  const layout = el('hui-card-layout-editor', { root: shadowRootOf(el('hui-dialog-edit-card')) });
  assert.equal(insideCardOwnEditor(el('ha-yaml-editor', { root: shadowRootOf(layout) })), false);
  assert.equal(insideCardOwnEditor(null), false);
  assert.equal(insideCardOwnEditor({}), false);
  assert.equal(insideCardOwnEditor({ getRootNode() { throw new Error('detached'); } }), false);
});

test('element editor names', () => {
  for (const name of ['hui-card-element-editor', 'hui-row-element-editor', 'hui-headerfooter-element-editor', 'hui-card-feature-element-editor', 'hui-heading-badge-element-editor']) {
    assert.equal(isElementEditorHostName(name), true, name);
  }
  for (const name of ['hui-entities-card-editor', 'hui-stack-card-editor', 'bubble-card-editor', 'my-element-editor', 'hui-element-editor-x', '', null, undefined]) {
    assert.equal(isElementEditorHostName(name), false, String(name));
  }
});

// The call sites that pick an editor, admit an event or a view, size, style, walk for warnings,
// scan at start-up, or switch off Home Assistant's built-in suggestions ask the rule. This pins
// that the calls stay in those functions; the browser test shows what they achieve.
test('the rule is asked at the known call sites', () => {
  const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
  // From the start of a function to the next line that closes a function at the same indent.
  const body = (source, start) => {
    const at = source.indexOf(start);
    assert.ok(at >= 0, `"${start}" exists`);
    const indent = source.slice(source.lastIndexOf('\n', at) + 1, at).match(/^\s*/)[0];
    const end = source.indexOf(`\n${indent}}`, at);
    return source.slice(at, end < 0 ? undefined : end);
  };

  const cache = read('src/editor/activeEditorCacheRuntime.js');
  assert.match(body(cache, 'function suppressNativeAutocompleteForEditor'), /insideCardOwnEditor\(host\)/, 'built-in suggestions are not switched off');
  assert.match(body(cache, 'function visibleStyleEditorCandidate'), /insideCardOwnEditor\(editor\)/, 'not a codebox candidate');
  assert.match(body(cache, 'function usableBridgeStyleEditorCandidate'), /insideCardOwnEditor\(editor\)/, 'not a candidate through the bridge either');

  const active = read('src/editor/activeEditor.js');
  assert.match(body(active, 'export function dialogCodeEditorElement'), /insideCardOwnEditor\(ed\)/, 'not the dialog\'s code editor');
  assert.match(body(active, 'export function isScopedEditorEvent'), /insideCardOwnEditor\(path\[0\] \|\| ev\?\.target\)/, 'its keys and clicks are not in scope');
  assert.match(body(active, 'export function isViewAllowed'), /insideCardOwnEditor\(candidateView\.dom\)/, 'its view is not bound');

  const enlarge = read('src/companion/codeboxEnlargeRuntime.js');
  assert.match(enlarge, /const isMainCodebox = [^;]*!insideCardOwnEditor\(editor\)[^;]*!nestedInCardOwnEditor\(editor\);/, 'never sized as the main codebox');

  const sheets = read('src/companion/scrollbarStyleRuntime.js');
  assert.match(body(sheets, 'function applyForEditor(editor)'), /if \(insideCardOwnEditor\(editor\)\) return glassRemoved;/, 'no sheets for it or for the dialog on its account');
  assert.match(body(sheets, 'function applyForEditor(editor)'), /const mainCodebox = [^;]*!nestedInCardOwnEditor\(editor\);/, 'a YAML editor nested in a custom card editor is not sized as the main codebox');
  assert.match(body(sheets, 'function deepShadowRootsWithin'), /insideCardOwnEditor\(el\)/, 'the warning walk does not enter it');
  assert.match(body(sheets, 'function nestedEditorRootsForDialog'), /insideCardOwnEditor\(el\)/, 'no hide sheet in its code boxes');
  assert.match(body(sheets, 'export function editorWarningAlerts'), /insideCardOwnEditor\(alert\)/, 'its notes are not editor warnings');

  assert.match(body(read('src/syntax/sourceClassLifecycle.js'), 'function refreshSourceClassSyntaxForOpenEditors'), /insideCardOwnEditor\(editor\)/, 'the syntax refresh for open editors skips it');
  assert.match(body(read('src/syntax/initialSyntaxPaintGate.js'), 'function scheduleInitialSyntaxPaintGate'), /insideCardOwnEditor\(content\)/, 'the first-paint gate skips it');
  const preflight = read('src/ui/codebox/codeboxPreflight.js');
  assert.equal((preflight.match(/insideCardOwnEditor\(/g) || []).length, 3, 'the start-up scan skips it at its three tagging points');
  assert.match(read('src/ui/codebox/codeboxUnclip.js'), /if \(insideCardOwnEditor\(parent\)\) break;/, 'the unclip walk stops at a custom card\'s elements');
  assert.match(read('src/ui/settingsInteractionRuntime.js'), /if \(insideCardOwnEditor\(node\)\) break;/, 'the live-preview targets stop there too');
});
