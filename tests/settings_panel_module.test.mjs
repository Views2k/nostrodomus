import assert from 'node:assert/strict';
import { appendSettingsChildren, clampSettingsPosition, clampSettingsSize, createSettingsElement, settingsTitle } from '../src/ui/settingsPanel.js';

function fakeDocument() {
  return {
    created: [],
    createElement(tag) {
      const node = {
        tagName: String(tag).toUpperCase(),
        className: '',
        id: '',
        textContent: '',
        dataset: {},
        style: { cssText: '' },
        attrs: {},
        children: [],
        setAttribute(name, value) { this.attrs[name] = value; },
        appendChild(child) { this.children.push(child); return child; },
      };
      this.created.push(node);
      return node;
    },
    createTextNode(text) {
      return { nodeType: 3, textContent: String(text) };
    },
  };
}

{
  const doc = fakeDocument();
  const child = doc.createElement('span');
  child.textContent = 'child';
  const node = createSettingsElement('label', {
    className: 'nostrodomus-checkbox-row',
    id: 'x',
    text: 'Label',
    htmlFor: 'input-a',
    attrs: { role: 'button', hidden: false, active: true, skip: null },
    dataset: { k: 'provider', empty: null },
    style: 'display:block;color:red',
  }, ['prefix', null, false, child], doc);

  assert.equal(node.tagName, 'LABEL');
  assert.equal(node.className, 'nostrodomus-checkbox-row');
  assert.equal(node.id, 'x');
  assert.equal(node.textContent, 'Label');
  assert.equal(node.htmlFor, 'input-a');
  assert.deepEqual(node.attrs, { role: 'button', active: '' });
  assert.deepEqual(node.dataset, { k: 'provider' });
  assert.equal(node.style.cssText, 'display:block;color:red');
  assert.equal(node.children.length, 2);
  assert.deepEqual(node.children[0], { nodeType: 3, textContent: 'prefix' });
  assert.equal(node.children[1], child);
}

{
  const doc = fakeDocument();
  const parent = doc.createElement('div');
  const child = doc.createElement('b');
  const returned = appendSettingsChildren(parent, ['a', undefined, false, child], doc);
  assert.equal(returned, parent);
  assert.equal(parent.children.length, 2);
  assert.equal(parent.children[0].textContent, 'a');
  assert.equal(parent.children[1], child);
}

{
  const doc = fakeDocument();
  const title = settingsTitle('Providers', doc);
  assert.equal(title.tagName, 'H3');
  assert.equal(title.className, 'nostrodomus-section-title');
  assert.equal(title.textContent, 'Providers');
}



{
  const viewport = { innerWidth: 1200, innerHeight: 900 };
  assert.deepEqual(clampSettingsPosition({ x: 900.6, y: 860.2 }, viewport), { x: 752, y: 740 });
  assert.deepEqual(clampSettingsPosition({ x: -20, y: 4 }, viewport), { x: 8, y: 8 });
  assert.deepEqual(clampSettingsPosition(null, viewport), { x: 696, y: 72 });
}

{
  const viewport = { innerWidth: 1200, innerHeight: 900 };
  assert.deepEqual(clampSettingsSize({ w: 500.4, h: 650.7 }, viewport), { w: 500, h: 651 });
  assert.deepEqual(clampSettingsSize({ w: 100, h: 100 }, viewport), { w: 380, h: 360 });
  assert.deepEqual(clampSettingsSize({ w: 2000, h: 2000 }, viewport), { w: 1184, h: 884 });
  assert.deepEqual(clampSettingsSize(null, viewport), { w: 440, h: 684 });
}

console.log('settings panel module tests OK');
