// The sheet applied before the full codebox style showed a dark surface with light text on
// every theme. It now takes the adjusted colors when there are any.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createCodeboxPreflight } from '../../src/ui/codebox/codeboxPreflight.js';

function preflight(preflightColors) {
  return createCodeboxPreflight({
    document: {},
    DARKPLUS_SYNTAX_COLORS: { fg: '#d4d4d4' },
    state: {},
    recordPerformanceEvent: () => {},
    nostrodomusPerfMode: () => 'on',
    activeEditDialog: () => null,
    codeboxEditorCacheKey: () => 'editor',
    ensureStableStyleElement: () => ({ style: null }),
    installCodeboxKeyboardContainment: () => {},
    installInitialSyntaxPaintGate: () => {},
    primeInitialSyntaxPaintGateForEditor: () => {},
    activeCodeboxStyleEditor: () => null,
    ...(preflightColors ? { preflightColors } : {}),
  });
}

test('without colors the preflight CSS is the fixed dark one', () => {
  const css = preflight().codeboxPreflightCss('shadow');
  assert.match(css, /--nostrodomus-codebox-surface: rgba\(0, 0, 0, 0\.35\);/);
  assert.match(css, /--nostrodomus-codebox-syntax-fg: #d4d4d4;/);
});

// Installs the sheet for an editor and returns the CSS texts that were written.
function writtenBy(preflightColors) {
  const written = [];
  const style = { get textContent() { return written[written.length - 1] || ''; }, set textContent(value) { written.push(value); } };
  const runtime = createCodeboxPreflight({
    document: { querySelectorAll: () => [] },
    DARKPLUS_SYNTAX_COLORS: { fg: '#d4d4d4' },
    state: {},
    recordPerformanceEvent: () => {},
    nostrodomusPerfMode: () => 'on',
    activeEditDialog: () => null,
    codeboxEditorCacheKey: () => 'editor',
    ensureStableStyleElement: () => ({ style, changed: false }),
    installCodeboxKeyboardContainment: () => {},
    installInitialSyntaxPaintGate: () => {},
    primeInitialSyntaxPaintGateForEditor: () => {},
    activeCodeboxStyleEditor: () => null,
    ...(preflightColors ? { preflightColors } : {}),
  });
  const editor = { querySelector: () => null, getRootNode: () => ({}), getAttribute: () => '1', closest: () => null };
  runtime.primeCodeboxPreflightForEditor(editor, 'test');
  return { written, runtime, editor };
}

test('with colors only the surface and the text color change', () => {
  const plain = writtenBy(null).written[0];
  assert.equal(plain, preflight().codeboxPreflightCss('document'), 'no colors: the frozen sheet is installed');
  assert.equal(writtenBy(() => ({})).written[0], plain, 'incomplete colors count as none');
  const adjusted = writtenBy(() => ({ surface: 'hsla(210, 36%, 94%, 0.920)', syntaxFg: '#4f3c17' })).written[0];
  assert.match(adjusted, /--nostrodomus-codebox-surface: hsla\(210, 36%, 94%, 0\.920\);/);
  assert.match(adjusted, /--nostrodomus-codebox-syntax-fg: #4f3c17;/);
  const normalize = (css) => css
    .replace(/--nostrodomus-codebox-surface: [^;]+;/, '')
    .replace(/--nostrodomus-codebox-syntax-fg: [^;]+;/, '');
  assert.equal(normalize(adjusted), normalize(plain));
});

test('both install paths write the sheet with the same colors', () => {
  const written = [];
  const style = { get textContent() { return written[written.length - 1] || ''; }, set textContent(value) { written.push(value); } };
  const runtime = createCodeboxPreflight({
    document: { querySelectorAll: () => [] },
    DARKPLUS_SYNTAX_COLORS: { fg: '#d4d4d4' },
    state: {},
    recordPerformanceEvent: () => {},
    nostrodomusPerfMode: () => 'on',
    activeEditDialog: () => null,
    codeboxEditorCacheKey: () => 'editor',
    ensureStableStyleElement: () => ({ style, changed: false }),
    installCodeboxKeyboardContainment: () => {},
    installInitialSyntaxPaintGate: () => {},
    primeInitialSyntaxPaintGateForEditor: () => {},
    activeCodeboxStyleEditor: () => null,
    preflightColors: () => ({ surface: 'light-surface', syntaxFg: 'dark-text' }),
  });
  const editor = { querySelector: () => null, getRootNode: () => ({}), getAttribute: () => '1', closest: () => null };
  runtime.primeCodeboxPreflightForEditor(editor, 'test');
  const afterPrime = written.length;
  assert.ok(afterPrime >= 1);
  assert.ok(written.every((css) => css.includes('light-surface') && css.includes('dark-text')));
  runtime.primeCodeboxPreflightForEditor(editor, 'test');
  assert.equal(written.length, afterPrime, 'an unchanged sheet is not written again');
});
