import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCodeboxEnlargeRuntime,
  FIT_DIALOG_INSET_PX,
  FIT_FLUSH_CLEARANCE_PX,
  FIT_FOOTER_GAP_PX,
  FIT_MIN_HEIGHT_PX,
  SIMPLE_CM_HEIGHT,
} from '../../src/companion/codeboxEnlargeRuntime.js';

// Measured fit: the card dialog's main codebox ends just above the dialog footer, wherever the
// editor actually starts. Numbers below are the live 2026.11 measurements that showed the old
// viewport formulas running off the screen.

function sink(writes, tag, rect) {
  return {
    style: { setProperty: (key, value) => writes.push([tag, key, value]) },
    getBoundingClientRect: () => rect(),
  };
}

function buildDialog({ editorTop, footerTop, footerHeight = 68, dialogBottom = 0, editorWidth = 1184 }) {
  const writes = [];
  const layout = { editorTop, footerTop, footerHeight, dialogBottom, editorWidth };
  const rect = (top, bottom, width = 100) => ({ top, bottom, width, height: bottom - top });
  const footer = { getBoundingClientRect: () => rect(layout.footerTop, layout.footerTop + layout.footerHeight) };
  const haDialog = { getBoundingClientRect: () => rect(40, layout.dialogBottom), shadowRoot: null };
  const dialog = {
    matches: (selector) => selector === 'hui-dialog-edit-card',
    getBoundingClientRect: () => rect(40, layout.dialogBottom),
    shadowRoot: {
      querySelector: (selector) => (selector === 'ha-dialog-footer' ? (layout.footerHeight > 0 ? footer : null)
        : selector === 'ha-dialog' ? haDialog : null),
      querySelectorAll: () => [],
    },
  };
  const wrapper = sink(writes, 'wrapper', () => rect(layout.editorTop, layout.editorTop + 500, layout.editorWidth));
  const cmEditor = sink(writes, 'cm', () => rect(0, 0));
  const cmScroller = sink(writes, 'scroller', () => rect(0, 0));
  const yamlHost = { matches: (selector) => selector === 'ha-yaml-editor', getRootNode: () => ({ host: dialog }) };
  const editor = {
    shadowRoot: {
      host: wrapper,
      querySelector: (selector) => (selector === '.cm-editor' ? cmEditor : selector === '.cm-scroller' ? cmScroller : null),
    },
    matches: () => false,
    getRootNode: () => ({ host: yamlHost }),
  };
  return { writes, layout, editor };
}

function runtime(innerHeight) {
  return createCodeboxEnlargeRuntime({ isActive: () => true, visible: () => true, globalRef: { innerHeight } });
}

const heightOf = (writes, tag) => writes.filter(([t, key]) => t === tag && key === 'height').map(([, , value]) => value).pop();

test('a stack sub-card editor that starts low ends above the footer, not below the window', () => {
  // Live: 927px window, editor top 352, dialog bottom 911. The old 94vh - 198px gave 673px
  // (bottom 1025). The footer row starts at 843 in that dialog.
  const { writes, editor } = buildDialog({ editorTop: 352, footerTop: 843, dialogBottom: 911 });
  const out = runtime(927).applyForEditor(editor);

  const expected = 843 - FIT_FOOTER_GAP_PX - 352;
  assert.equal(out.measured, true);
  assert.equal(heightOf(writes, 'wrapper'), `${expected}px`);
  assert.equal(heightOf(writes, 'cm'), `${expected - FIT_FLUSH_CLEARANCE_PX}px`);
  assert.equal(heightOf(writes, 'scroller'), `${expected - FIT_FLUSH_CLEARANCE_PX}px`);
  assert.ok(352 + expected < 911, 'the box ends inside the dialog');
});

test('a tab-less editor at 1358px keeps the height it already had (no visible change)', () => {
  // Live: editor top 116, footer top 1265, old SIMPLE height 94vh - 150px = 1127px (bottom 1243).
  const { writes, editor } = buildDialog({ editorTop: 116, footerTop: 1265, dialogBottom: 1317 });
  runtime(1358).applyForEditor(editor);
  assert.equal(heightOf(writes, 'wrapper'), '1127px');
});

test('an unchanged fit writes nothing; a moved editor top is re-fitted once', () => {
  const { writes, layout, editor } = buildDialog({ editorTop: 116, footerTop: 1265, dialogBottom: 1317 });
  const rt = runtime(1358);
  rt.applyForEditor(editor);
  const afterFirst = writes.length;

  for (let i = 0; i < 5; i += 1) rt.refitForEditor(editor);
  assert.equal(writes.length, afterFirst, 'repeat fits with the same geometry must not write');

  layout.editorTop = 351; // the option-tab row rendered above the editor
  rt.refitForEditor(editor);
  assert.equal(heightOf(writes, 'wrapper'), `${1265 - FIT_FOOTER_GAP_PX - 351}px`);
  const afterMove = writes.length;
  rt.refitForEditor(editor);
  assert.equal(writes.length, afterMove);
});

test('without a footer the box stops inside the dialog edge, and never below the window', () => {
  const noFooter = buildDialog({ editorTop: 300, footerTop: 0, footerHeight: 0, dialogBottom: 900 });
  runtime(2000).applyForEditor(noFooter.editor);
  assert.equal(heightOf(noFooter.writes, 'wrapper'), `${900 - FIT_DIALOG_INSET_PX - 300}px`);

  const tallDialog = buildDialog({ editorTop: 300, footerTop: 1500, dialogBottom: 1600 });
  runtime(1000).applyForEditor(tallDialog.editor);
  assert.equal(heightOf(tallDialog.writes, 'wrapper'), `${1000 - FIT_DIALOG_INSET_PX - 300}px`);
});

test('a very low editor top still gets a usable minimum height', () => {
  const { writes, editor } = buildDialog({ editorTop: 800, footerTop: 843, dialogBottom: 911 });
  runtime(927).applyForEditor(editor);
  assert.equal(heightOf(writes, 'wrapper'), `${FIT_MIN_HEIGHT_PX}px`);
});

test('before layout is measurable the viewport formula is used, then replaced by the fit', () => {
  const { writes, layout, editor } = buildDialog({ editorTop: 116, footerTop: 1265, dialogBottom: 1317, editorWidth: 0 });
  const rt = runtime(1358);
  const first = rt.applyForEditor(editor);
  assert.equal(first.measured, undefined);
  assert.equal(heightOf(writes, 'cm'), SIMPLE_CM_HEIGHT);

  layout.editorWidth = 1184; // the dialog finished opening
  const second = rt.refitForEditor(editor);
  assert.equal(second.measured, true);
  assert.equal(heightOf(writes, 'wrapper'), '1127px');
});

test('a size change of the element editor re-fits the codebox; teardown stops watching and clears the heights', () => {
  const { writes, layout, editor } = buildDialog({ editorTop: 116, footerTop: 1265, dialogBottom: 1317 });
  // Put a hui-card-element-editor between the yaml editor and the dialog, as in the real chain.
  const yamlHost = editor.getRootNode().host;
  const dialog = yamlHost.getRootNode().host;
  const elementEditor = { matches: (selector) => selector === 'hui-card-element-editor', getRootNode: () => ({ host: dialog }) };
  yamlHost.getRootNode = () => ({ host: elementEditor });
  const removed = [];
  for (const el of [editor.shadowRoot.host, editor.shadowRoot.querySelector('.cm-editor'), editor.shadowRoot.querySelector('.cm-scroller')]) {
    el.style.removeProperty = (key) => removed.push(key);
  }

  const observers = [];
  class FakeResizeObserver {
    constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
  }
  const rt = createCodeboxEnlargeRuntime({
    isActive: () => true,
    visible: () => true,
    globalRef: { innerHeight: 1358 },
    ResizeObserver: FakeResizeObserver,
    requestAnimationFrame: (run) => { run(); return 0; },
  });

  rt.applyForEditor(editor);
  assert.equal(observers.length, 1, 'one watcher is created');
  assert.deepEqual(observers[0].targets, [elementEditor], 'it observes the element editor, not the codebox');
  rt.applyForEditor(editor);
  assert.equal(observers.length, 1, 'a repeat apply does not create another watcher');

  layout.editorTop = 351; // a tab row rendered above the codebox and resized the element editor
  observers[0].callback([]);
  assert.equal(heightOf(writes, 'wrapper'), `${1265 - FIT_FOOTER_GAP_PX - 351}px`);

  rt.teardown();
  assert.equal(observers[0].disconnected, true);
  assert.equal(removed.filter((key) => key === 'height').length, 3, 'inline heights are removed from all three elements');
});
