// ABSORB P0a — scrollbar CSS byte-identity golden baseline. FROZEN.
//
// The companion absorption order requires the absorbed scrollbar module (P2) to
// regenerate v17's injected scrollbar stylesheets BYTE-FOR-BYTE — same variable
// names, same !important, same whitespace. This test pins the two CSS template
// strings v17 emits, read verbatim from the FROZEN source file (never hand-copied),
// and freezes their SHA256. When src/companion/scrollbarStyleRuntime.js lands (P2),
// this same unmodified test additionally asserts the module reproduces those exact
// bytes. Do NOT modify this file during the ABSORB order — fix the module, not the pin.
//
// The two stylesheets (the order's "two injected stylesheets, style.id ~1184/~1377"):
//   CODEBOX     — id "nostrodomus-editor-v17-2-learned-style" (injectCodeCss): the styled
//                 --nostrodomus-codebox-scrollbar-* scrollbar (::-webkit-scrollbar* +
//                 scrollbar-color) and the codebox chrome it ships with.
//   DIALOG-ROOT — id "nostrodomus-editor-v17-2-learned-style-dialog-root" (injectStyle):
//                 native scrollbar suppression on .element-editor/.element-preview.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readCompanion,
  sha256,
  V17_PATH,
  extractCodeboxCss,
  extractDialogRootCss,
  absorbedModuleExists,
  absorbedModulePath,
} from './_fixtures/companionSource.mjs';

// Golden hashes — computed once from the frozen v17 source. These are the contract.
// Re-pinned for the Nostrodomus rename Stage 2 (Batch A): --nostrodomus-codebox-scrollbar-*
// → --nostrodomus-codebox-scrollbar-* in lockstep across src/companion AND the v17
// reference (D-FROZEN lockstep). Value-identical CSS; only the var names change.
// `codebox` re-pinned; `dialogRoot` is unchanged (it carries no custom properties).
const GOLDEN = Object.freeze({
  codebox: '8401665b6934167a22f4ba29e1abe7668367f31641202a71bbab09987236c1fa',
  dialogRoot: 'a658116bcab71a68277c7112a7932ef13993f69adad6d2baf420cf521857fb01',
});

const SCROLLBAR_MODULE = 'scrollbarStyleRuntime.js';

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

// --- Absorbed-module byte-identity ---
// CONTRACT for src/companion/scrollbarStyleRuntime.js: export a pure
// `buildCompanionScrollbarCss()` returning { codebox: string, dialogRoot: string }
// whose values hash IDENTICALLY to the golden values above.
test('absorbed scrollbar module regenerates both stylesheets byte-identically', async () => {
  assert.ok(absorbedModuleExists(SCROLLBAR_MODULE), `src/companion/${SCROLLBAR_MODULE} is missing — the absorb landed at v0.1.136 and this module is load-bearing; fix the move/rename, never skip`);
  const mod = await import(absorbedModulePath(SCROLLBAR_MODULE));
  assert.equal(typeof mod.buildCompanionScrollbarCss, 'function', 'module must export buildCompanionScrollbarCss()');
  const built = mod.buildCompanionScrollbarCss();
  assert.equal(sha256(built.codebox), GOLDEN.codebox, 'codebox CSS must be byte-identical to v17');
  assert.equal(sha256(built.dialogRoot), GOLDEN.dialogRoot, 'dialog-root CSS must be byte-identical to v17');
});
