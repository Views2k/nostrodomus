// Scrollbar CSS byte-identity golden baseline.
//
// The built-in scrollbar module must produce v17's injected scrollbar stylesheets byte for byte:
// the same variable names, the same !important, the same whitespace. This test reads the two CSS
// template strings from the frozen v17 file, freezes their SHA256, and checks that
// src/companion/companionStyleRuntime.js produces exactly those bytes. If it fails, fix the
// module, not the pin.
//
// The two stylesheets:
//   codebox     — id "nostrodomus-editor-v17-2-learned-style" (injectCodeCss): the styled
//                 --nostrodomus-codebox-scrollbar-* scrollbar (::-webkit-scrollbar* +
//                 scrollbar-color) and the codebox chrome it ships with.
//   dialog-root — id "nostrodomus-editor-v17-2-learned-style-dialog-root" (injectStyle):
//                 native scrollbar suppression on .element-editor/.element-preview.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readCompanion,
  sha256,
  V17_PATH,
  extractCodeboxCss,
  extractDialogRootCss,
  companionModuleExists,
  companionModuleUrl,
} from './_fixtures/companionSource.mjs';

// Golden hashes — computed from the frozen v17 source. These are the contract.
// src/companion and the v17 reference use the same --nostrodomus-codebox-scrollbar-*
// custom property names; `dialogRoot` carries no custom properties.
const GOLDEN = Object.freeze({
  codebox: '8401665b6934167a22f4ba29e1abe7668367f31641202a71bbab09987236c1fa',
  dialogRoot: 'a658116bcab71a68277c7112a7932ef13993f69adad6d2baf420cf521857fb01',
});

const SCROLLBAR_MODULE = 'companionStyleRuntime.js';

test('v17 codebox CSS template hashes to the frozen golden value', () => {
  const css = extractCodeboxCss(readCompanion(V17_PATH));
  // Sentinels guard against the extractor grabbing the wrong region.
  assert.ok(css.includes('--nostrodomus-codebox-scrollbar-thumb'), 'codebox css must carry the scrollbar thumb variable');
  assert.ok(css.includes('::-webkit-scrollbar-thumb'), 'codebox css must carry the webkit scrollbar thumb rule');
  assert.equal(sha256(css), GOLDEN.codebox);
});

test('v17 dialog-root CSS template hashes to the frozen golden value', () => {
  const css = extractDialogRootCss(readCompanion(V17_PATH));
  assert.ok(css.includes('.element-editor'), 'dialog-root css must target the editor pane');
  assert.ok(css.includes('scrollbar-width: none'), 'dialog-root css must suppress native scrollbars');
  assert.equal(sha256(css), GOLDEN.dialogRoot);
});

// --- Built-in module byte identity ---
// src/companion/companionStyleRuntime.js must export a pure `buildCompanionScrollbarCss()` that
// returns { codebox: string, dialogRoot: string } with the golden hashes above.
test('the built-in scrollbar module produces both stylesheets byte for byte', async () => {
  assert.ok(companionModuleExists(SCROLLBAR_MODULE), `src/companion/${SCROLLBAR_MODULE} is missing`);
  const mod = await import(companionModuleUrl(SCROLLBAR_MODULE));
  assert.equal(typeof mod.buildCompanionScrollbarCss, 'function', 'module must export buildCompanionScrollbarCss()');
  const built = mod.buildCompanionScrollbarCss();
  assert.equal(sha256(built.codebox), GOLDEN.codebox, 'codebox CSS must be byte-identical to v17');
  assert.equal(sha256(built.dialogRoot), GOLDEN.dialogRoot, 'dialog-root CSS must be byte-identical to v17');
});
