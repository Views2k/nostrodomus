import test from 'node:test';
import assert from 'node:assert/strict';

import {
  completionKeyAction,
  completionNavigationIndex,
  keyClearsEscapeSuppression,
} from '../../src/completion/keymap.js';

test('completion keymap supports wrapped navigation and page/home/end jumps', () => {
  assert.equal(completionNavigationIndex(2, 3, 'ArrowDown'), 0);
  assert.equal(completionNavigationIndex(0, 3, 'ArrowUp'), 2);
  assert.equal(completionNavigationIndex(1, 10, 'PageDown', 5), 6);
  assert.equal(completionNavigationIndex(6, 10, 'PageUp', 5), 1);
  assert.equal(completionNavigationIndex(6, 10, 'Home'), 0);
  assert.equal(completionNavigationIndex(6, 10, 'End'), 9);
});

test('completion keymap toggles Ctrl+Space without blocking preview shortcut defaults', () => {
  const closedAction = completionKeyAction(
    { key: ' ', code: 'Space', ctrlKey: true },
    { items: [], settings: {} },
    { scoped: true, viewAllowed: true, popupOpen: false },
  );
  assert.deepEqual(closedAction, {
    type: 'open-explicit',
    prevent: false,
    stop: false,
    clearEscapeSuppression: true,
    allowPreviewShortcut: true,
  });

  const openAction = completionKeyAction(
    { key: ' ', code: 'Space', ctrlKey: true },
    { items: [], settings: {} },
    { scoped: true, viewAllowed: true, popupOpen: true },
  );
  assert.deepEqual(openAction, {
    type: 'toggle-close',
    prevent: false,
    stop: false,
    clearEscapeSuppression: true,
    allowPreviewShortcut: true,
  });
});

test('completion keymap gives snippet tabstops priority over popup acceptance', () => {
  const state = { snippetSession: { index: 0 }, items: [{ label: 'one' }], settings: {} };
  assert.deepEqual(
    completionKeyAction({ key: 'Tab', shiftKey: true }, state, { popupOpen: true }),
    { type: 'move-snippet', direction: -1, prevent: true, stop: true },
  );
  assert.deepEqual(
    completionKeyAction({ key: 'Escape' }, state, { popupOpen: true }),
    { type: 'clear-snippet', prevent: true, stop: true },
  );
});

test('completion keymap accepts Enter/Tab and dismisses typed delimiters without preventing text input', () => {
  const state = { selected: 0, items: [{ label: 'one' }], settings: {} };
  assert.equal(completionKeyAction({ key: 'Enter' }, state, { popupOpen: true }).type, 'accept');
  assert.equal(completionKeyAction({ key: 'Tab' }, state, { popupOpen: true }).type, 'accept');
  assert.deepEqual(completionKeyAction({ key: ':' }, state, { popupOpen: true }), {
    type: 'dismiss-typed-delimiter',
    prevent: false,
    stop: false,
  });
});

test('completion keymap tracks escape suppression until the next word boundary', () => {
  assert.equal(keyClearsEscapeSuppression('a'), false);
  assert.equal(keyClearsEscapeSuppression('.'), false);
  assert.equal(keyClearsEscapeSuppression(' '), true);
  assert.equal(keyClearsEscapeSuppression('Enter'), true);
});


test('completion key action respects enter/tab completion settings', () => {
  const state = {
    settings: { enterCompletes: false, tabCompletes: false },
    items: [{ label: 'one' }],
    selected: 0,
  };
  assert.equal(completionKeyAction({ key: 'Enter' }, state, { popupOpen: true }).type, 'none');
  assert.equal(completionKeyAction({ key: 'Tab' }, state, { popupOpen: true }).type, 'none');
  assert.equal(completionKeyAction({ key: 'Enter' }, { ...state, settings: { enterCompletes: true, tabCompletes: false } }, { popupOpen: true }).type, 'accept');
  assert.equal(completionKeyAction({ key: 'Tab' }, { ...state, settings: { enterCompletes: false, tabCompletes: true } }, { popupOpen: true }).type, 'accept');
});


test('completion keymap commits conservative YAML key colon only for prefix matches', () => {
  const base = { settings: { commitCharacters: true }, context: { lang: 'yaml', yamlRole: 'key', prefix: 'ent' }, selected: 0 };
  assert.deepEqual(
    completionKeyAction({ key: ':' }, { ...base, items: [{ label: 'entity:', matchTier: 1 }] }, { popupOpen: true }),
    { type: 'commit-typed', char: ':', prevent: true, stop: true },
  );
  assert.deepEqual(completionKeyAction({ key: ':' }, { ...base, items: [{ label: 'entity:', matchTier: 2 }] }, { popupOpen: true }), {
    type: 'dismiss-typed-delimiter', prevent: false, stop: false,
  });
  assert.deepEqual(completionKeyAction({ key: ':' }, { ...base, context: { lang: 'yaml', yamlRole: 'key', prefix: '' }, items: [{ label: 'entity:', matchTier: 0 }] }, { popupOpen: true }), {
    type: 'dismiss-typed-delimiter', prevent: false, stop: false,
  });
});

test('completion keymap toggles docs with Ctrl+Space only when details pane is active', () => {
  assert.deepEqual(
    completionKeyAction({ key: ' ', code: 'Space', ctrlKey: true }, { settings: { showDetailsPane: true }, items: [{ label: 'one' }] }, { scoped: true, viewAllowed: true, popupOpen: true }),
    { type: 'toggle-docs', prevent: true, stop: true, clearEscapeSuppression: true },
  );
});

test('Escape with the popup CLOSED in keepOpen mode passes through to the HA dialog', () => {
  // popup open → swallow (close the popup, not the dialog); popup closed → pass through (let the
  // dialog handle Escape) but still suppress keepOpen's re-open. Swallowing when closed was a hijack.
  const closed = completionKeyAction({ key: 'Escape' }, { settings: { keepOpen: true } }, { popupOpen: false, scoped: true });
  assert.equal(closed.prevent, false, 'a closed popup must not swallow Escape from the HA dialog');
  assert.equal(closed.stop, false);
  assert.equal(closed.suppressUntilBoundary, true, 'still suppress keepOpen re-open after Escape');
  const open = completionKeyAction({ key: 'Escape' }, { settings: { keepOpen: true } }, { popupOpen: true, scoped: true });
  assert.equal(open.prevent, true, 'an open popup still swallows Escape to close itself');
  assert.equal(open.stop, true);
});
