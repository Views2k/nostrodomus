// ABSORB P0 — shared companion source-truth helper (NOT a test; not run by the
// runner, which only executes *.test.mjs). Used by the frozen golden baselines
// to read the FROZEN companion files as text and extract regions verbatim, so
// nothing is hand-copied. The companion files are byte-frozen (D-FROZEN-REFERENCE),
// so these extractions are stable forever.

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
// _fixtures -> companion -> tests -> repo root
export const REPO_ROOT = join(HERE, '..', '..', '..');

export const V17_PATH = join(REPO_ROOT, 'reference/companions', 'nostrodomus_editor_v17_2_learned_reapply.js');
export const PICKER_PATH = join(REPO_ROOT, 'reference/companions', 'nostrodomus-picker-safe.js');

export function readCompanion(path) {
  return readFileSync(path, 'utf8');
}

export function sha256(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

// Extract the source text between a pair of backticks that follow `anchor`.
// `openBacktickIndex` selects which backtick after the anchor OPENS the template
// (the next backtick CLOSES it). The CSS bodies contain no backticks, so this is
// unambiguous. Used to lift the verbatim template-literal bodies out of source.
export function extractBacktickTemplate(text, anchor, openBacktickIndex = 0) {
  const at = text.indexOf(anchor);
  if (at < 0) throw new Error(`companionSource: anchor not found: ${JSON.stringify(anchor)}`);
  const backticks = [];
  for (let i = at + anchor.length; i < text.length; i++) {
    if (text[i] === '`') {
      backticks.push(i);
      if (backticks.length >= openBacktickIndex + 2) break;
    }
  }
  const open = backticks[openBacktickIndex];
  const close = backticks[openBacktickIndex + 1];
  if (open == null || close == null) {
    throw new Error(`companionSource: could not bound template after anchor ${JSON.stringify(anchor)}`);
  }
  return text.slice(open + 1, close);
}

// Extract a top-level function declaration verbatim, including signature, by
// brace-matching from the function body's opening brace. The `declaration` must
// end with the body's opening `{` so a `= {}` default param in the signature
// cannot be mistaken for the body brace. Used to lift the coordinator installer
// verbatim for the faithfulness guard.
export function extractFunctionSource(text, declaration) {
  if (!declaration.trimEnd().endsWith('{')) {
    throw new Error('companionSource: declaration must end with the body-opening "{"');
  }
  const start = text.indexOf(declaration);
  if (start < 0) throw new Error(`companionSource: declaration not found: ${JSON.stringify(declaration)}`);
  const braceOpen = start + declaration.length - 1; // the body "{" at the end of the declaration
  let depth = 0;
  for (let i = braceOpen; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`companionSource: unbalanced braces for ${JSON.stringify(declaration)}`);
}

// --- The two scrollbar-product CSS templates (ABSORB P0a) ---
// v17 injects its styling through two functions: injectStyle (generic, ~L1184)
// and injectCodeCss (~L1377). The scrollbar product is carried by:
//   1. CODEBOX  (id "nostrodomus-editor-v17-2-learned-style", injectCodeCss): the
//      styled --nostrodomus-codebox-scrollbar-* scrollbar (::-webkit-scrollbar* +
//      scrollbar-color), plus the codebox chrome it ships with.
//   2. DIALOG-ROOT (id "...-dialog-root", injectStyle): native scrollbar
//      suppression on .element-editor/.element-preview panes (scrollbar-width:
//      none + ::-webkit-scrollbar { display:none }) alongside dialog sizing.
// These are the two element IDs the P2 scrollbar module reproduces byte-identically.
export const CODEBOX_CSS_ANCHOR = 'const css = ';
export const DIALOG_ROOT_CSS_ANCHOR = '${STYLE_ID}-dialog-root';

export function extractCodeboxCss(v17Text) {
  return extractBacktickTemplate(v17Text, CODEBOX_CSS_ANCHOR, 0);
}

export function extractDialogRootCss(v17Text) {
  // anchor backtick #0 closes the id arg, #1 opens the css arg, #2 closes it.
  return extractBacktickTemplate(v17Text, DIALOG_ROOT_CSS_ANCHOR, 1);
}

export const INSTALLER_DECLARATION = 'function __nostrodomusInstallRuntimeCoordinatorV1(descriptor = {}) {';

export function extractInstallerSource(text) {
  return extractFunctionSource(text, INSTALLER_DECLARATION);
}

// Resolve an absorbed module path under src/companion (present only after the
// phase that authors it). Lets the frozen baselines also verify the real module
// when it exists, while skipping cleanly in P0.
export function absorbedModulePath(relName) {
  return join(REPO_ROOT, 'src', 'companion', relName);
}

export function absorbedModuleExists(relName) {
  return existsSync(absorbedModulePath(relName));
}
