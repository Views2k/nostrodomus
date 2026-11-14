import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceClassBridgeRuntime } from '../../src/syntax/sourceClassBridgeRuntime.js';

test('cssEscapeSelectorPart uses native CSS escape when available and fallback otherwise', () => {
  const nativeRuntime = createSourceClassBridgeRuntime({ W: { CSS: { escape: value => `native:${value}` } } });
  assert.equal(nativeRuntime.cssEscapeSelectorPart('a.b'), 'native:a.b');

  const fallbackRuntime = createSourceClassBridgeRuntime({ W: {} });
  assert.equal(fallbackRuntime.cssEscapeSelectorPart('a.b#c'), 'a\\.b\\#c');
});

test('bridgeActiveForStyleEditor accepts bridge surfaces that resolve to the same editor', () => {
  const editor = { querySelector() {} };
  const cmContent = { node: 'cm-content' };
  const active = { cmEditor: {}, cmScroller: {}, cmContent, codeEditor: {} };
  const runtime = createSourceClassBridgeRuntime({
    W: { __nostrodomusEditorBridgeV1: { active: () => active } },
    styleEditorFromNode: node => (node === cmContent ? editor : null),
    composedContains: () => false,
  });

  assert.equal(runtime.bridgeActiveForStyleEditor(editor), active);
});

test('bridgeActiveForStyleEditor rejects unrelated active bridge editor', () => {
  const editor = { querySelector() {} };
  const otherEditor = { querySelector() {} };
  const active = { cmContent: {}, codeEditor: {} };
  const runtime = createSourceClassBridgeRuntime({
    W: { __nostrodomusEditorBridgeV1: { active: () => active } },
    styleEditorFromNode: () => otherEditor,
    composedContains: () => false,
  });

  assert.equal(runtime.bridgeActiveForStyleEditor(editor), null);
});

test('codeMirrorSourceClassParts resolves root host CodeMirror and content', () => {
  const tags = { keyword: 'keyword' };
  const view = { state: {}, dispatch() {} };
  const cm = { tags };
  const content = { className: 'cm-content' };
  const host = { _loadedCodeMirror: cm, view };
  const root = { host };
  const editor = {
    getRootNode: () => root,
    closest: () => null,
    querySelector: selector => (selector === '.cm-content' ? content : null),
  };

  const runtime = createSourceClassBridgeRuntime({ W: {} });
  assert.deepEqual(runtime.codeMirrorSourceClassParts(editor), { root, host, cm, view, tags, content });
});

test('codeMirrorSourceClassParts falls back to active bridge code editor and content', () => {
  const tags = { string: 'string' };
  const view = { state: {}, dispatch() {} };
  const cm = { tags };
  const cmContent = { className: 'cm-content' };
  const codeEditor = { _loadedCodeMirror: cm, editorView: view };
  const active = { cmContent, codeEditor };
  const root = {};
  const editor = {
    getRootNode: () => root,
    closest: () => null,
    querySelector: () => null,
  };

  const runtime = createSourceClassBridgeRuntime({
    W: { __nostrodomusEditorBridgeV1: { active: () => active } },
    styleEditorFromNode: node => (node === cmContent ? editor : null),
    composedContains: () => false,
  });

  assert.deepEqual(runtime.codeMirrorSourceClassParts(editor), { root, host: codeEditor, cm, view, tags, content: cmContent });
});
