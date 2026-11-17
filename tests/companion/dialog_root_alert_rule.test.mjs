// The dialog root sheet without the alert rule of the standalone editor layout script.
//
// DIALOG_ROOT_CSS stays byte for byte the sheet of the standalone script (see
// scrollbar_css_byte_identity.test.mjs). Its last rule hid every ha-alert, [role="alert"],
// .issue-type.warning, .warning and .error in the card editor dialog's shadow root, whatever the
// settings said; on Home Assistant 2026.6 and later that only reached the card preview. The
// sheet injected under DIALOG_ROOT_STYLE_ID is DIALOG_ROOT_CSS without that rule, with every
// other byte the same.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCompanionScrollbarCss,
  createCompanionStyleRuntime,
  DIALOG_ROOT_ALERT_RULE_PATTERN,
  DIALOG_ROOT_LAYOUT_CSS,
  DIALOG_ROOT_STYLE_ID,
  withoutDialogRootAlertRule,
} from '../../src/companion/companionStyleRuntime.js';

const DIALOG_ROOT_CSS = buildCompanionScrollbarCss().dialogRoot;

function fakeRoot() {
  const root = {
    children: [],
    querySelector(sel) {
      const id = sel.startsWith('#') ? sel.slice(1) : sel;
      return root.children.find((c) => c.id === id) || null;
    },
    appendChild(el) {
      el._parent = root;
      root.children.push(el);
      return el;
    },
  };
  return root;
}

function fakeDocument() {
  return {
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        id: '',
        textContent: '',
        remove() {
          const p = this._parent;
          if (p) {
            const i = p.children.indexOf(this);
            if (i >= 0) p.children.splice(i, 1);
          }
        },
      };
    },
  };
}

test('the alert rule is found once in the standalone sheet and is its last rule', () => {
  const all = DIALOG_ROOT_CSS.match(new RegExp(DIALOG_ROOT_ALERT_RULE_PATTERN.source, 'g')) || [];
  assert.equal(all.length, 1);
  const match = DIALOG_ROOT_ALERT_RULE_PATTERN.exec(DIALOG_ROOT_CSS);
  assert.match(match[0], /display: none !important;/);
  assert.match(match[0], /pointer-events: none !important;/);
  assert.equal(DIALOG_ROOT_CSS.slice(match.index + match[0].length).trim(), '', 'nothing follows the rule');
});

test('the injected dialog sheet is the standalone sheet without that rule, every other byte the same', () => {
  const match = DIALOG_ROOT_ALERT_RULE_PATTERN.exec(DIALOG_ROOT_CSS);
  const expected = DIALOG_ROOT_CSS.slice(0, match.index) + '\n' + DIALOG_ROOT_CSS.slice(match.index + match[0].length);
  assert.equal(DIALOG_ROOT_LAYOUT_CSS, expected);
  assert.equal(DIALOG_ROOT_LAYOUT_CSS.length, DIALOG_ROOT_CSS.length - match[0].length + 1);
  assert.ok(DIALOG_ROOT_CSS.startsWith(DIALOG_ROOT_LAYOUT_CSS.slice(0, match.index)));
});

test('the injected dialog sheet hides no alert, warning or error, and keeps the dialog layout', () => {
  for (const text of ['ha-alert', 'role="alert"', 'issue-type', '.warning', '.error', 'visibility: hidden', 'opacity: 0']) {
    assert.equal(DIALOG_ROOT_LAYOUT_CSS.includes(text), false, `must not contain ${text}`);
  }
  for (const text of [':host', '.element-editor', '.element-preview', 'scrollbar-width: none', '::-webkit-scrollbar']) {
    assert.ok(DIALOG_ROOT_LAYOUT_CSS.includes(text), `keeps ${text}`);
  }
  const rules = (css) => css.split('}').length;
  assert.equal(rules(DIALOG_ROOT_LAYOUT_CSS), rules(DIALOG_ROOT_CSS) - 1, 'exactly one rule fewer');
});

test('a sheet without the rule comes back unchanged', () => {
  assert.equal(withoutDialogRootAlertRule('.a { color: red; }'), '.a { color: red; }');
  assert.equal(withoutDialogRootAlertRule(''), '');
  assert.equal(withoutDialogRootAlertRule(null), '');
});

for (const hideWarnings of [false, true]) {
  test(`the card dialog gets the sheet without the alert rule (Hide editor warnings ${hideWarnings ? 'on' : 'off'})`, () => {
    const rt = createCompanionStyleRuntime({
      documentRef: fakeDocument(),
      isActive: () => true,
      hideEditorWarnings: () => hideWarnings,
    });
    const dialogRoot = fakeRoot();
    rt.applyToRoots({ codeRoot: fakeRoot(), dialogRoot, waDialogRoot: fakeRoot() });
    const sheet = dialogRoot.querySelector(`#${DIALOG_ROOT_STYLE_ID}`);
    assert.ok(sheet, 'the dialog root sheet is injected');
    assert.equal(sheet.textContent, DIALOG_ROOT_LAYOUT_CSS);
    const anyAlertRule = dialogRoot.children.some((c) => /ha-alert|\[role="alert"\]|\.error\b/.test(c.textContent));
    assert.equal(anyAlertRule, false, 'no sheet in the dialog root hides alerts');
  });
}
