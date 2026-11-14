// installCodeMirrorSourceClassSyntax runs on every style apply. It wrote its version marker to
// the editor, to .cm-content and to the host on every call, including the calls that then skip
// the pass. Setting an attribute to the value it already has still produces a mutation record,
// and CodeMirror observes the attributes of .cm-content.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSourceClassLifecycle } from '../../src/syntax/sourceClassLifecycle.js';

function countingDataset(writes, label) {
  return new Proxy({}, {
    set(target, key, value) {
      writes.push(`${label}.${String(key)}`);
      target[key] = value;
      return true;
    },
  });
}

function fixture(version = 'test') {
  const writes = [];
  const style = { textContent: '' };
  const state = {};
  let passes = 0;
  const content = { dataset: countingDataset(writes, 'content') };
  const editor = {
    dataset: countingDataset(writes, 'editor'),
    querySelector: () => content,
    querySelectorAll: () => [],
    parts: { cm: {}, view: { state: { config: {} } }, tags: {}, root: {}, content, host: { dataset: countingDataset(writes, 'host') } },
  };
  const runtime = createSourceClassLifecycle({
    CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID: 'test-style',
    VERSION: version,
    activeCodeboxStyleEditor: () => null,
    codeMirrorSourceClassParts: (target) => target.parts,
    codeboxEditorCacheKey: () => 'editor-key',
    effectiveStyleSettings: () => ({}),
    ensureStyleElementAtEnd: () => style,
    recordPerformanceEvent: () => {},
    resolveSyntaxTintSettings: () => ({ presetKey: 'one', themeOpacity: 1 }),
    state,
    nostrodomusWalkOpenRoots: () => {},
    api: {
      installCodeMirrorNativeHighlightSyntax: () => ({ installed: false, reason: 'missing-native-codemirror-api' }),
      suppressSourceClassNativeProbeForNativeFallback: () => true,
      editorUsesCodeMirrorSourceClassSyntax: () => false,
      editorUsesCodeMirrorNativeHighlightSyntax: () => false,
      buildCodeMirrorSourceClassSyntaxCss: () => ({ css: '/* sheet */', classMap: [{ label: 'string' }] }),
      applyCodeMirrorSmartSyntaxClasses: () => { passes += 1; return { lines: 0, spans: 0, changed: 0 }; },
      // The observer is attached to this editor from the first install on.
      installSourceClassSmartSyntaxObserver: () => {
        state.sourceClassSmartSyntaxObserver = { disconnect() {} };
        state.sourceClassSmartSyntaxEditorKey = 'editor-key';
        state.sourceClassSmartSyntaxContent = content;
        return true;
      },
      promoteSourceClassFallbackForNativeUnavailable: () => null,
    },
  });
  return { runtime, editor, content, writes, state, passes: () => passes };
}

test('the markers are written once and not again while they hold the current version', () => {
  const fx = fixture();
  assert.equal(fx.runtime.installCodeMirrorSourceClassSyntax(fx.editor, {}, 'first').installed, true);
  assert.deepEqual(fx.writes, [
    'editor.nostrodomusSourceClassSyntax',
    'content.nostrodomusSourceClassSyntax',
    'host.nostrodomusSourceClassSyntax',
  ]);
  assert.equal(fx.editor.dataset.nostrodomusSourceClassSyntax, 'test');
  assert.equal(fx.content.dataset.nostrodomusSourceClassSyntax, 'test');
  assert.equal(fx.editor.parts.host.dataset.nostrodomusSourceClassSyntax, 'test');

  fx.writes.length = 0;
  // The skip path: nothing changed and the observer is attached.
  const skipped = fx.runtime.installCodeMirrorSourceClassSyntax(fx.editor, {}, 'pointer');
  assert.equal(skipped.skipped, true);
  // A reason that forces the pass to run again.
  const passesBefore = fx.passes();
  const forced = fx.runtime.installCodeMirrorSourceClassSyntax(fx.editor, {}, 'settings-change');
  assert.notEqual(forced.skipped, true);
  assert.equal(fx.passes(), passesBefore + 1);
  assert.deepEqual(fx.writes, [], 'no marker is written again');
});

test('a marker that is missing or holds another version is written', () => {
  const fx = fixture();
  fx.runtime.installCodeMirrorSourceClassSyntax(fx.editor, {}, 'first');
  // CodeMirror resets the attributes of .cm-content when it updates them.
  delete fx.content.dataset.nostrodomusSourceClassSyntax;
  fx.editor.parts.host.dataset.nostrodomusSourceClassSyntax = 'older';
  fx.writes.length = 0;
  const result = fx.runtime.installCodeMirrorSourceClassSyntax(fx.editor, {}, 'pointer');
  assert.notEqual(result.skipped, true, 'a lost marker makes the install run the pass');
  assert.deepEqual(fx.writes, ['content.nostrodomusSourceClassSyntax', 'host.nostrodomusSourceClassSyntax']);
  assert.equal(fx.content.dataset.nostrodomusSourceClassSyntax, 'test');
  assert.equal(fx.editor.parts.host.dataset.nostrodomusSourceClassSyntax, 'test');
});
