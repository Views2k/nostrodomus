import test from 'node:test';
import assert from 'node:assert/strict';

import { createSourceClassLifecycle } from '../../src/syntax/sourceClassLifecycle.js';

// Every style apply (each click in the dialog, each settle pass) rebuilt the source-class sheet,
// which asks CodeMirror for the class of about thirty tags. The sheet depends only on the editor
// configuration and the syntax settings, so the last result is kept per view.

function lifecycle() {
  let builds = 0;
  let syntax = { presetKey: 'one', themeOpacity: 1 };
  const style = { textContent: '' };
  const runtime = createSourceClassLifecycle({
    CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID: 'test-style',
    VERSION: 'test',
    activeCodeboxStyleEditor: () => null,
    codeMirrorSourceClassParts: (editor) => editor.parts,
    codeboxEditorCacheKey: () => 'editor-key',
    effectiveStyleSettings: () => ({}),
    ensureStyleElementAtEnd: () => style,
    recordPerformanceEvent: () => {},
    resolveSyntaxTintSettings: () => ({ ...syntax }),
    state: {},
    nostrodomusWalkOpenRoots: () => {},
    api: {
      installCodeMirrorNativeHighlightSyntax: () => ({ installed: false, reason: 'missing-native-codemirror-api' }),
      suppressSourceClassNativeProbeForNativeFallback: () => true,
      editorUsesCodeMirrorSourceClassSyntax: () => false,
      editorUsesCodeMirrorNativeHighlightSyntax: () => false,
      buildCodeMirrorSourceClassSyntaxCss: (_parts, tint) => { builds += 1; return { css: `/* ${tint.presetKey} ${builds} */`, classMap: [{ label: 'string' }] }; },
      applyCodeMirrorSmartSyntaxClasses: () => ({ lines: 0, spans: 0, changed: 0 }),
      installSourceClassSmartSyntaxObserver: () => true,
      promoteSourceClassFallbackForNativeUnavailable: () => null,
    },
  });
  return { runtime, style, builds: () => builds, setSyntax: (next) => { syntax = next; } };
}

function editorWith(view) {
  const content = { dataset: {} };
  return {
    dataset: {},
    querySelector: () => content,
    querySelectorAll: () => [],
    parts: { cm: {}, view, tags: {}, root: {}, content, host: { dataset: {} } },
  };
}

test('the sheet is built once for the same editor configuration and syntax settings', () => {
  const { runtime, style, builds, setSyntax } = lifecycle();
  const config = {};
  const view = { state: { config } };
  const editor = editorWith(view);

  assert.equal(runtime.installCodeMirrorSourceClassSyntax(editor, {}, 'first').installed, true);
  assert.equal(builds(), 1);
  const css = style.textContent;
  runtime.installCodeMirrorSourceClassSyntax(editor, {}, 'pointer');
  runtime.installCodeMirrorSourceClassSyntax(editor, {}, 'settle');
  assert.equal(builds(), 1, 'later applies reuse the sheet');
  assert.equal(style.textContent, css);

  // A transaction replaces the state; the configuration object stays the same.
  view.state = { config };
  runtime.installCodeMirrorSourceClassSyntax(editor, {}, 'after-edit');
  assert.equal(builds(), 1);

  setSyntax({ presetKey: 'two', themeOpacity: 1 });
  runtime.installCodeMirrorSourceClassSyntax(editor, {}, 'preset-change');
  assert.equal(builds(), 2, 'new syntax settings build a new sheet');
  assert.ok(style.textContent.includes('two'));

  view.state = { config: {} };
  runtime.installCodeMirrorSourceClassSyntax(editor, {}, 'reconfigured');
  assert.equal(builds(), 3, 'a reconfigured editor builds a new sheet');
});

test('an editor whose state exposes no configuration object builds the sheet every time', () => {
  const { runtime, builds } = lifecycle();
  const editor = editorWith({ state: {} });
  runtime.installCodeMirrorSourceClassSyntax(editor, {}, 'first');
  runtime.installCodeMirrorSourceClassSyntax(editor, {}, 'second');
  assert.equal(builds(), 2);
});
