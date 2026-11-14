import test from 'node:test';
import assert from 'node:assert/strict';

import { completionKeyAction } from '../../src/completion/keymap.js';

const open = { popupOpen: true, scoped: true, viewAllowed: true };
const rows = (...labels) => labels.map((label, i) => ({ label, matchTier: i === 0 ? 0 : 1 }));

test('a colon inside a value keeps the list open', () => {
  const state = { settings: {}, items: rows('mdi:lightbulb', 'mdi:lamp'), selected: 0, context: { lang: 'yaml', yamlRole: 'value', prefix: 'mdi' } };
  assert.equal(completionKeyAction({ key: ':' }, state, open).type, 'none');
  // In a key position the colon still ends the key.
  const keyState = { settings: { commitCharacters: false }, items: rows('name:'), selected: 0, context: { lang: 'yaml', yamlRole: 'key', prefix: 'na' } };
  assert.equal(completionKeyAction({ key: ':' }, keyState, open).type, 'dismiss-typed-delimiter');
});

test('a colon after an exactly typed key does not replace it with a longer key that ranks first', () => {
  const state = { settings: {}, items: rows('conditions:', 'condition:'), selected: 0, context: { lang: 'yaml', yamlRole: 'key', prefix: 'condition' } };
  assert.equal(completionKeyAction({ key: ':' }, state, open).type, 'dismiss-typed-delimiter');
  // A partly typed key is still completed by the colon.
  const partial = { settings: {}, items: rows('conditions:', 'condition:'), selected: 0, context: { lang: 'yaml', yamlRole: 'key', prefix: 'cond' } };
  assert.equal(completionKeyAction({ key: ':' }, partial, open).type, 'commit-typed');
  // The selected row is the exact key: commit as before.
  const exactSelected = { settings: {}, items: rows('condition:', 'conditions:'), selected: 0, context: { lang: 'yaml', yamlRole: 'key', prefix: 'condition' } };
  assert.equal(completionKeyAction({ key: ':' }, exactSelected, open).type, 'commit-typed');
});

test('keys with a modifier go to the editor, not to the list', () => {
  const state = { settings: {}, items: rows('name:', 'icon:'), selected: 0, context: { lang: 'yaml', yamlRole: 'key', prefix: 'n' } };
  for (const event of [
    { key: 'Home', ctrlKey: true }, { key: 'End', ctrlKey: true }, { key: 'ArrowDown', shiftKey: true },
    { key: 'ArrowUp', altKey: true }, { key: 'Tab', shiftKey: true }, { key: 'Enter', ctrlKey: true }, { key: 'Enter', shiftKey: true },
    { key: 'ArrowDown', metaKey: true },
  ]) {
    assert.equal(completionKeyAction(event, state, open).type, 'none', JSON.stringify(event));
  }
  assert.equal(completionKeyAction({ key: 'ArrowDown' }, state, open).type, 'select');
  assert.equal(completionKeyAction({ key: 'Enter' }, state, open).type, 'accept');
  assert.equal(completionKeyAction({ key: 'Tab' }, state, open).type, 'accept');
  // Ctrl+Space and the snippet Shift+Tab keep working.
  assert.equal(completionKeyAction({ key: ' ', code: 'Space', ctrlKey: true }, state, open).type, 'toggle-close');
  assert.equal(completionKeyAction({ key: 'Tab', shiftKey: true }, { ...state, snippetSession: {} }, open).type, 'move-snippet');
});
