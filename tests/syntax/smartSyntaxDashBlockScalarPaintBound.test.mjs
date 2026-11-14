import test from 'node:test';
import assert from 'node:assert/strict';

import {
  smartSyntaxDocumentContextForVisibleLinesFromLines,
  smartSyntaxTokenKind,
  smartSyntaxUpdateBlockContext,
} from '../../src/syntax/smartSyntaxTokenizers.js';

// Paint-lane twin of the completion-side dash bound: the paint walkers bounded a
// `- style: |` block scalar at the whitespace lead (before the dash), so sibling keys
// of the same list item -- which the completion lane treats as YAML since the dash
// fix -- kept PAINTING as CSS. The bound is the key's column, and the dash counts as
// a list indicator only with trailing whitespace, mirroring the completion helper.
function docContext(docLines) {
  const domLines = docLines.map(text => ({ textContent: text }));
  return smartSyntaxDocumentContextForVisibleLinesFromLines(docLines, domLines);
}

const FIXTURE_A = ['cards:', '  - style: |', '      ha-card { color: red; }', '    entity: light.x'];

test('a sibling key below a dash style scalar closes the paint lane', () => {
  const { modes } = docContext(FIXTURE_A);
  assert.equal(modes[3].blockScalarKind, '', 'the sibling line must leave the CSS scalar');
  assert.equal(modes[3].lineKind, 'fg');
  assert.ok(modes[3].lineInfo, 'the sibling line must parse as a YAML key line');
});

test('the fallback walker uses the key column for dash openers', () => {
  const ctx = { blockComment: false, cssBlockDepth: 0, blockScalarKind: '', blockScalarIndent: null };
  smartSyntaxUpdateBlockContext(ctx, '  - style: |');
  assert.equal(ctx.blockScalarKind, 'css');
  assert.equal(ctx.blockScalarIndent, 4, 'the bound is the key column, not the dash lead');
  smartSyntaxUpdateBlockContext(ctx, '    entity: light.x');
  assert.equal(ctx.blockScalarKind, '');
  assert.equal(ctx.blockScalarIndent, null);
});

test('the sibling key paints as a key, not a CSS property', () => {
  const { modes } = docContext(FIXTURE_A);
  const kind = smartSyntaxTokenKind('entity', '    entity: light.x', modes[3].lineKind, 4, 10, modes[3].lineInfo);
  assert.equal(kind, 'key');
});

test('controls: scalar bodies, non-dash blocks, generic scalars, and dash-lookalike keys are unchanged', () => {
  const a = docContext(FIXTURE_A);
  assert.equal(a.modes[2].blockScalarKind, 'css', 'the CSS body itself stays CSS');
  assert.equal(a.modes[2].lineInfo, null);

  const b = docContext(['card_mod:', '  style: |', '    ha-card { color: red; }', '  secondary: Done']);
  assert.equal(b.modes[2].blockScalarKind, 'css');
  assert.equal(b.modes[3].blockScalarKind, '');
  assert.ok(b.modes[3].lineInfo);

  const e = docContext(['message: |', '  shopping', '  - sensor.hum']);
  assert.ok(e.modes.every(mode => mode.blockScalarKind !== 'css'), 'generic scalars never enter the CSS lane');

  // A key that merely BEGINS with a dash is not a list item: its scalar stays
  // bounded at the line lead, so indent-1 content remains inside.
  const f = docContext(['-style: |', ' .foo { color: red; }', '-next: 1']);
  assert.equal(f.modes[1].blockScalarKind, 'css');
  assert.equal(f.modes[2].blockScalarKind, '');

  // Deep dash-lookalike CONTENT inside the scalar stays CSS (indent beyond the bound).
  const c = docContext(['cards:', '  - style: |', '      - foo', '      - bar']);
  assert.equal(c.modes[2].blockScalarKind, 'css');
  assert.equal(c.modes[3].blockScalarKind, 'css');
});

test('exotic dash runs measure only the space/tab segment, matching the completion bound', () => {
  // A dash followed by a tab and a non-space/tab whitespace character (nbsp): only
  // the matched `-\t` run counts toward the bound, so the paint lane lands on the
  // same column as the completion lane's yamlKeyColumn for the same line.
  const ctx = { blockComment: false, cssBlockDepth: 0, blockScalarKind: '', blockScalarIndent: null };
  smartSyntaxUpdateBlockContext(ctx, '  -\t style: |');
  assert.equal(ctx.blockScalarKind, 'css');
  assert.equal(ctx.blockScalarIndent, 4);
});
