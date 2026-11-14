import test from 'node:test';
import assert from 'node:assert/strict';

import {
  overlayRoot,
  nostrodomusCodeEditorOverlayRoot,
  nostrodomusFindActiveCodeEditorRoot,
  nostrodomusWalkOpenRoots,
} from '../../src/editor/overlayRoot.js';

function makeElement({ className = '', width = 0, height = 0, display = 'block', visibility = 'visible', opacity = '1' } = {}) {
  return {
    className,
    display,
    visibility,
    opacity,
    children: [],
    shadowRoot: null,
    dataset: {},
    style: {
      values: {},
      setProperty(name, value, priority) { this.values[name] = { value, priority }; },
    },
    getBoundingClientRect() { return { width, height }; },
    querySelector(selector) {
      if (selector === '#nostrodomus-cm-root-overlay-host') {
        return this.children.find(child => child.id === 'nostrodomus-cm-root-overlay-host') || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '*') return this.children;
      if (selector === '.cm-content, .cm-editor, .cm-scroller') {
        return this.children.filter(child => /(^|\s)(cm-content|cm-editor|cm-scroller)(\s|$)/.test(String(child.className || '')));
      }
      if (String(selector || '').includes('ha-code-editor')) {
        const parts = String(selector || '').split(',').map(part => part.trim()).filter(Boolean);
        return this.children.filter(child => parts.some(part => {
          if (part.startsWith('.')) return String(child.className || '').split(/\s+/).includes(part.slice(1));
          return String(child.localName || child.tagName || child.className || '').toLowerCase() === part.toLowerCase();
        }));
      }
      return [];
    },
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
  };
}

function makeDocument(root) {
  return {
    body: root,
    createElement(tag) { return makeElement({ className: tag }); },
    querySelectorAll(selector) { return root.querySelectorAll(selector); },
    querySelector(selector) { return root.querySelector(selector); },
    appendChild(child) { return root.appendChild(child); },
  };
}

test('overlay root walks open shadow roots and reports callback/query errors', () => {
  const child = makeElement();
  const shadowRoot = makeElement();
  child.shadowRoot = shadowRoot;
  const root = makeElement();
  root.appendChild(child);
  const visited = [];
  const errors = [];
  nostrodomusWalkOpenRoots(root, candidate => {
    visited.push(candidate);
    if (candidate === shadowRoot) throw new Error('callback fail');
  }, new Set(), { recordRuntimeErrorOnce: (...args) => errors.push(args) });
  assert.deepEqual(visited, [root, shadowRoot]);
  assert.equal(errors[0][0], 'editor:walk-open-root-callback');
});

test('overlay root selects the best visible CodeMirror root by class score and area', () => {
  const root = makeElement();
  const editorRoot = makeElement();
  const scroller = makeElement({ className: 'cm-scroller', width: 900, height: 400 });
  const content = makeElement({ className: 'cm-content', width: 320, height: 100 });
  root.appendChild(scroller);
  editorRoot.appendChild(content);
  const shell = makeElement();
  shell.shadowRoot = editorRoot;
  root.appendChild(shell);
  const doc = makeDocument(root);
  const selected = nostrodomusFindActiveCodeEditorRoot({
    documentRef: doc,
    getComputedStyleRef: el => ({ display: el.display, visibility: el.visibility, opacity: el.opacity }),
  });
  assert.equal(selected, editorRoot);
});

test('overlay root creates and reuses the fixed pointer-transparent host', () => {
  const root = makeElement();
  const content = makeElement({ className: 'cm-content', width: 500, height: 220 });
  root.appendChild(content);
  const doc = makeDocument(root);
  const options = {
    documentRef: doc,
    getComputedStyleRef: el => ({ display: el.display, visibility: el.visibility, opacity: el.opacity }),
  };
  const first = nostrodomusCodeEditorOverlayRoot(options);
  const second = overlayRoot(options);
  assert.equal(second, first);
  assert.equal(first.id, 'nostrodomus-cm-root-overlay-host');
  assert.equal(first.dataset.nostrodomusPurpose, 'cm-root-completions-overlay');
  assert.deepEqual(first.style.values['pointer-events'], { value: 'none', priority: 'important' });
  assert.deepEqual(first.style.values['z-index'], { value: '2147483647', priority: 'important' });
});

test('overlay root falls back to document body when no active CodeMirror root is visible', () => {
  const root = makeElement();
  const doc = makeDocument(root);
  const host = overlayRoot({
    documentRef: doc,
    getComputedStyleRef: el => ({ display: el.display, visibility: el.visibility, opacity: el.opacity }),
  });
  assert.equal(root.children.includes(host), true);
});


test('overlay root supports targeted traversal with legacy wildcard fallback option', () => {
  const root = makeElement();
  const ignored = makeElement({ className: 'random-host' });
  ignored.shadowRoot = makeElement();
  const codeEditor = makeElement({ className: 'ha-code-editor' });
  codeEditor.localName = 'ha-code-editor';
  codeEditor.shadowRoot = makeElement();
  root.appendChild(ignored);
  root.appendChild(codeEditor);

  const targetedSeen = [];
  const summaries = [];
  nostrodomusWalkOpenRoots(root, candidate => targetedSeen.push(candidate), new Set(), {
    targetedTraversal: true,
    onTraversal: summary => summaries.push(summary),
  });
  assert.equal(targetedSeen.includes(codeEditor.shadowRoot), true);
  assert.equal(targetedSeen.includes(ignored.shadowRoot), false);
  assert.equal(summaries[0].mode, 'targeted');

  const legacySeen = [];
  nostrodomusWalkOpenRoots(root, candidate => legacySeen.push(candidate), new Set(), { targetedTraversal: false });
  assert.equal(legacySeen.includes(ignored.shadowRoot), true);
});

test('universalEditorHosts targeted traversal descends through non-card-dialog editor panel hosts', () => {
  // UNIVERSAL: the base targeted selector stops short of the
  // Dev Tools / raw-config / automation / script panel hosts.
  // With universalEditorHosts on, the bounded walk must descend through them.
  const root = makeElement();
  const panel = makeElement({ className: 'ha-automation-editor' });
  panel.localName = 'ha-automation-editor';
  panel.shadowRoot = makeElement();
  root.appendChild(panel);

  const baseSeen = [];
  nostrodomusWalkOpenRoots(root, candidate => baseSeen.push(candidate), new Set(), { targetedTraversal: true });
  assert.equal(baseSeen.includes(panel.shadowRoot), false, 'base selector must NOT reach the panel host (the gap)');

  const universalSeen = [];
  nostrodomusWalkOpenRoots(root, candidate => universalSeen.push(candidate), new Set(), {
    targetedTraversal: true,
    universalEditorHosts: true,
  });
  assert.equal(universalSeen.includes(panel.shadowRoot), true, 'universal selector must descend into the panel host');
});

test('base targeted traversal descends THROUGH a stack-card editor to reach the nested sub-card codebox (apply-on-open fix)', () => {
  // Shadow-host chain on a stack card: hui-dialog-edit-card > hui-card-element-editor >
  // hui-stack-card-editor > hui-card-element-editor > ha-yaml-editor > ha-code-editor. Without
  // hui-stack-card-editor in the allowlist the bounded walk dead-ends at the stack editor, so the sub-card
  // codebox is found (and styled) only after a click. It is a card-dialog host → in the BASE selector
  // (works regardless of the universalCodebox kill switch).
  const root = makeElement();
  const stackEditor = makeElement({ className: 'hui-stack-card-editor' });
  stackEditor.localName = 'hui-stack-card-editor';
  stackEditor.shadowRoot = makeElement();
  const codeEditor = makeElement({ className: 'ha-code-editor' });
  codeEditor.localName = 'ha-code-editor';
  codeEditor.shadowRoot = makeElement();
  stackEditor.shadowRoot.appendChild(codeEditor);
  root.appendChild(stackEditor);

  const baseSeen = [];
  nostrodomusWalkOpenRoots(root, candidate => baseSeen.push(candidate), new Set(), { targetedTraversal: true });
  assert.equal(baseSeen.includes(stackEditor.shadowRoot), true, 'base targeted walk descends into the stack-card editor host');
  assert.equal(baseSeen.includes(codeEditor.shadowRoot), true, 'and reaches the nested sub-card ha-code-editor on open (no click)');
});
