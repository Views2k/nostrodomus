// One syntax pass is scheduled at a time. A request that arrived while a pass was waiting was
// folded into it, but the waiting pass painted only the editor of the first request: a request
// for a second editor in the same frame was lost.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeState } from '../../src/core/state.js';
import { createSyntaxRuntime } from '../../src/syntax/syntaxRuntime.js';

function fakeEditor(texts) {
  const lines = texts.map((text) => ({ textContent: text, textNode: { nodeValue: text, isConnected: true }, dataset: {} }));
  const content = { isConnected: true, querySelectorAll: (selector) => (selector === '.cm-line' ? lines : []) };
  const editor = { dataset: {}, querySelector: (selector) => (selector === '.cm-content' ? content : null), querySelectorAll: () => [], getRootNode: () => ({ querySelector: () => null }) };
  return { editor, content, lines };
}

function fixture() {
  class FakeHighlight { constructor(...ranges) { this.ranges = ranges; } }
  const store = new Map();
  const highlights = { set: (name, value) => store.set(name, value), delete: (name) => store.delete(name), get: (name) => store.get(name), values: () => store.values() };
  const state = createRuntimeState({ version: 'test' });
  // A long time since the last pass, so a request is not held back by the minimum interval.
  state.sourceClassSmartSyntaxLastRunAt = -100000;
  const runtime = createSyntaxRuntime({
    state,
    VERSION: 'nostrodomus-test',
    W: { NodeFilter: {}, CSS: { highlights }, Highlight: FakeHighlight },
    DARKPLUS_SYNTAX_COLORS: { fg: '#ffffff', dim: '#999999' },
    DARKPLUS_MAX_LINES_PER_PASS: 50,
    DARKPLUS_MAX_SPANS_PER_PASS: 200,
    CODEMIRROR_SOURCE_CLASS_SYNTAX_STYLE_ID: 'nostrodomus-test-source-class',
    SYNTAX_RECOVERY_DEFAULT_DELAYS: [48, 180],
    STYLE_SYNTAX_KIND_ORDER: ['fg', 'key', 'string', 'punct', 'filter', 'comment'],
    syntaxRecoveryDelaysForStageA3: (_reason, delays) => delays,
    activeCodeboxStyleEditor: () => null,
    activeEditDialog: () => null,
    activeTopLayerDialog: () => null,
    applyTextColorPreset: () => false,
    codeboxEditorCacheKey: () => 'editor-key',
    codeMirrorSourceClassParts: () => null,
    cssEscapeSelectorPart: (value) => String(value),
    effectiveStyleSettings: () => ({}),
    ensureStyleElementAtEnd: () => null,
    recordPerformanceEvent: () => {},
    rememberActiveCodeboxEditor: () => {},
    resolveSyntaxTintSettings: () => ({ presetKey: 'test', palette: {}, themeOpacity: 1, themeSaturation: 1 }),
    nostrodomusPerfMode: () => false,
    styleEditorFromNode: () => null,
    nostrodomusWalkOpenRoots: () => {},
    visibleStyleEditorCandidate: () => true,
    syntaxColorWithOpacity: (color) => color,
  });
  const highlightedNodes = () => {
    const nodes = new Set();
    for (const highlight of store.values()) for (const range of highlight.ranges) nodes.add(range.startContainer);
    return nodes;
  };
  return { state, runtime, highlightedNodes };
}

function withFrames(run) {
  const names = ['document', 'StaticRange', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = Object.fromEntries(names.map((name) => [name, globalThis[name]]));
  const frames = new Map();
  let nextFrame = 1;
  globalThis.document = {
    createTreeWalker: (line) => { let done = false; return { nextNode: () => (done ? null : ((done = true), line.textNode)) }; },
    createRange: () => ({ setStart() {}, setEnd() {} }),
  };
  globalThis.StaticRange = class { constructor(init) { Object.assign(this, init); } };
  globalThis.requestAnimationFrame = (callback) => { frames.set(nextFrame, callback); return nextFrame++; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  const runFrame = () => { const pending = Array.from(frames.values()); frames.clear(); for (const callback of pending) callback(); return pending.length; };
  try { run({ runFrame, pendingFrames: () => frames.size }); } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete globalThis[name];
      else globalThis[name] = previous[name];
    }
  }
}

test('a request for a second editor while a pass is waiting is painted by that pass', () => {
  withFrames(({ runFrame, pendingFrames }) => {
    const fx = fixture();
    const first = fakeEditor(['entity: light.kitchen']);
    const second = fakeEditor(['name: Hall', 'icon: mdi:lamp']);
    assert.equal(fx.runtime.scheduleSourceClassSmartSyntax(first.editor, 'style-reapply-skip-pointer'), true);
    assert.equal(fx.runtime.scheduleSourceClassSmartSyntax(second.editor, 'style-reapply-skip-pointer'), true);
    assert.equal(fx.runtime.scheduleSourceClassSmartSyntax(first.editor, 'style-reapply-skip-keydown'), true);
    assert.equal(pendingFrames(), 1, 'still one scheduled pass');
    assert.equal(fx.highlightedNodes().size, 0, 'nothing is painted before the frame');

    assert.equal(runFrame(), 1);
    const nodes = fx.highlightedNodes();
    assert.ok(nodes.has(first.lines[0].textNode), 'the editor of the first request is painted');
    for (const line of second.lines) assert.ok(nodes.has(line.textNode), 'the editor of the second request is painted');
    assert.equal(fx.state.sourceClassSmartSyntaxPendingReason, '');
    assert.equal(pendingFrames(), 0);
  });
});

test('a pass paints each requested editor once and does not carry editors over to the next pass', () => {
  withFrames(({ runFrame }) => {
    const fx = fixture();
    const first = fakeEditor(['entity: light.kitchen']);
    const second = fakeEditor(['name: Hall']);
    let walks = 0;
    const createTreeWalker = globalThis.document.createTreeWalker;
    globalThis.document.createTreeWalker = (line) => { walks += 1; return createTreeWalker(line); };

    fx.runtime.scheduleSourceClassSmartSyntax(first.editor, 'style-reapply-skip-pointer');
    fx.runtime.scheduleSourceClassSmartSyntax(first.editor, 'style-reapply-skip-keydown');
    runFrame();
    assert.equal(walks, 1, 'two requests for one editor are one pass over its line');

    fx.state.sourceClassSmartSyntaxLastRunAt = -100000;
    walks = 0;
    fx.runtime.scheduleSourceClassSmartSyntax(second.editor, 'style-reapply-skip-pointer');
    runFrame();
    assert.equal(walks, 1, 'only the editor of the new request is painted');
    assert.ok(fx.highlightedNodes().has(second.lines[0].textNode));
  });
});

test('a canceled pass forgets its editors', () => {
  withFrames(({ runFrame, pendingFrames }) => {
    const fx = fixture();
    const first = fakeEditor(['entity: light.kitchen']);
    const second = fakeEditor(['name: Hall']);
    fx.runtime.scheduleSourceClassSmartSyntax(first.editor, 'style-reapply-skip-pointer');
    fx.runtime.disconnectSourceClassSmartSyntaxObserver('test');
    assert.equal(pendingFrames(), 0, 'the scheduled pass is canceled');

    fx.state.sourceClassSmartSyntaxLastRunAt = -100000;
    fx.runtime.scheduleSourceClassSmartSyntax(second.editor, 'style-reapply-skip-pointer');
    runFrame();
    const nodes = fx.highlightedNodes();
    assert.ok(nodes.has(second.lines[0].textNode));
    assert.equal(nodes.has(first.lines[0].textNode), false, 'the editor of the canceled request is not painted later');
  });
});
