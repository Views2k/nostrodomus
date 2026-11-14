import test from 'node:test';
import assert from 'node:assert/strict';

import { activeTopLayerDialog } from '../../src/editor/activeEditor.js';

// With no dialog open, the search walked the home-assistant shadow tree once from its own root
// and again from the document, so every style pass read the whole app twice.
test('activeTopLayerDialog reads each shadow root once', () => {
  let reads = 0;
  const makeRoot = (children = []) => ({
    querySelectorAll: (selector) => {
      if (selector === '*') { reads += 1; return children; }
      return [];
    },
  });
  const leaves = Array.from({ length: 30 }, () => ({ shadowRoot: makeRoot() }));
  const homeShadow = makeRoot(leaves);
  const documentRef = makeRoot([{ shadowRoot: homeShadow }]);
  const found = activeTopLayerDialog({ documentRef, state: {}, activeEditDialog: () => null, homeRoot: () => homeShadow });
  assert.equal(found, null);
  assert.equal(reads, 32, 'document, home-assistant root and 30 leaves, once each');
});
