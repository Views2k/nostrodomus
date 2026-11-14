import test from 'node:test';
import assert from 'node:assert/strict';

import { createCodeboxPreflight } from '../../src/ui/codebox/codeboxPreflight.js';

// installCodeboxPreflightStyle writes the preflight <style> node into
// document.head AND into each ha-code-editor shadow root, but removeCodeboxPreflightStyle
// removed only the document copy (document.getElementById), orphaning the shadow-root
// copies on uninstall. Removal walks the same roots and removes every copy.
const ID = 'nostrodomus-codebox-preflight-style-v1';

function styleNode() {
  const n = { id: ID, removed: false, remove() { n.removed = true; } };
  return n;
}

function makeRoot(node, { haHosts = [] } = {}) {
  return {
    getElementById: (i) => (node && node.id === i && !node.removed ? node : null),
    querySelector: (sel) => (node && sel === `#${ID}` && !node.removed ? node : null),
    querySelectorAll: (sel) => (sel === 'ha-code-editor' ? haHosts : []),
  };
}

function buildRuntime(mockDoc) {
  return createCodeboxPreflight({
    document: mockDoc,
    state: {},
    cancelAnimationFrame: () => {},
    clearTimeout: () => {},
    activeEditDialog: () => null,
    activeCodeboxStyleEditor: () => null,
  });
}

test('removeCodeboxPreflightStyle removes the node from shadow roots too (1B-iii)', () => {
  const docCopy = styleNode();
  const shadowCopy = styleNode();
  const haHost = { shadowRoot: makeRoot(shadowCopy) };
  const mockDoc = makeRoot(docCopy, { haHosts: [haHost] });

  buildRuntime(mockDoc).removeCodeboxPreflightStyle('uninstall');

  assert.equal(docCopy.removed, true, 'document copy must be removed');
  assert.equal(shadowCopy.removed, true, 'ha-code-editor shadow-root copy must be removed');
});
