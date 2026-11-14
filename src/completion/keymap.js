// Nostrodomus completion keymap helpers.
// Owns the pure autocomplete keyboard contract used by completionRuntime.
// Keep this module browser-global-free: no DOM, storage, timers, network, or editor dispatch.

const COMPLETION_PAGE_JUMP = 5;

function completionWordKey(key = '') {
  return /^[A-Za-z0-9_$.-]$/.test(String(key || ''));
}

export function keyClearsEscapeSuppression(key = '') {
  const value = String(key || '');
  if (!value) return false;
  if (value === 'Backspace' || value === 'Delete') return false;
  if (value === 'Enter' || value === 'Tab' || value === 'Escape') return true;
  if (value.length !== 1) return false;
  return !completionWordKey(value);
}

export function completionNavigationIndex(selected = 0, count = 0, key = '', pageJump = COMPLETION_PAGE_JUMP) {
  const total = Math.max(0, Number(count) || 0);
  if (!total) return 0;
  const current = Math.max(0, Math.min(total - 1, Number(selected) || 0));
  const jump = Math.max(1, Number(pageJump) || COMPLETION_PAGE_JUMP);

  if (key === 'ArrowDown') return (current + 1) % total;
  if (key === 'ArrowUp') return (current - 1 + total) % total;
  if (key === 'PageDown') return Math.min(total - 1, current + jump);
  if (key === 'PageUp') return Math.max(0, current - jump);
  if (key === 'Home') return 0;
  if (key === 'End') return total - 1;
  return current;
}


function completionCommitCharacterAction(key = '', state = {}) {
  const settings = state?.settings || {};
  if (settings.commitCharacters === false) return null;
  const ctx = state?.context || {};
  const item = Array.isArray(state?.items) ? state.items[Number(state?.selected) || 0] : null;
  if (!item) return null;
  const prefix = String(ctx.prefix || '');
  if (!prefix) return null;
  if (key !== ':') return null;
  const yamlRole = String(ctx.yamlRole || '').toLowerCase();
  if (!(ctx.lang === 'yaml' && (yamlRole === 'key' || yamlRole === 'blank' || yamlRole === 'list-key'))) return null;
  if (Number(item.matchTier ?? 99) > 1) return null;
  // The typed text is already a complete key of the list (`condition` while `conditions:` ranks
  // first): the colon finishes what was typed instead of replacing it with the selected row.
  const keyName = (row) => String(row?.label || '').replace(/:\s*$/, '');
  if (keyName(item) !== prefix && state.items.some((row) => keyName(row) === prefix)) return null;
  return { type: 'commit-typed', char: key, prevent: true, stop: true };
}

export function completionKeyAction(event = {}, state = {}, options = {}) {
  const key = String(event?.key || '');
  const code = String(event?.code || '');
  const ctrlSpace = !!event?.ctrlKey && (code === 'Space' || key === ' ');
  const scoped = options.scoped !== false;
  const viewAllowed = options.viewAllowed !== false;
  const popupOpen = !!options.popupOpen;
  const settings = state?.settings || {};
  const items = Array.isArray(state?.items) ? state.items : [];
  const selected = Number(state?.selected) || 0;
  const hasSnippetSession = !!state?.snippetSession;

  if (ctrlSpace) {
    if (!scoped || !viewAllowed) return { type: 'none' };
    if (popupOpen && state?.items?.length && state?.settings?.showDetailsPane) return { type: 'toggle-docs', prevent: true, stop: true, clearEscapeSuppression: true };
    if (popupOpen) return { type: 'toggle-close', prevent: false, stop: false, clearEscapeSuppression: true, allowPreviewShortcut: true };
    return { type: 'open-explicit', prevent: false, stop: false, clearEscapeSuppression: true, allowPreviewShortcut: true };
  }

  if (hasSnippetSession) {
    if (key === 'Tab') return { type: 'move-snippet', direction: event?.shiftKey ? -1 : 1, prevent: true, stop: true };
    if (key === 'Escape') return { type: 'clear-snippet', prevent: true, stop: true };
  }

  // Ctrl+, opens Settings while the list is open: the keyboard counterpart of the gear in the
  // list header. Not with Alt (AltGr on some layouts) or Meta (Cmd+, belongs to the browser), and
  // not with the list closed, so the key means nothing new anywhere else.
  if (popupOpen && scoped && key === ',' && event?.ctrlKey && !event?.altKey && !event?.metaKey) {
    return { type: 'open-settings', prevent: true, stop: true };
  }

  if (!popupOpen && !settings.keepOpen) {
    if (state?.escapeSuppressUntilBoundary && keyClearsEscapeSuppression(key)) return { type: 'clear-escape-suppression' };
    return { type: 'none' };
  }

  if (state?.escapeSuppressUntilBoundary && keyClearsEscapeSuppression(key)) {
    return { type: 'clear-escape-suppression' };
  }

  if (state?.escapeSuppressUntilBoundary && scoped && !popupOpen) return { type: 'none' };

  if (key === 'Escape') {
    // Popup OPEN: Escape closes it and must not also reach the HA dialog (prevent+stop). Popup already
    // CLOSED (only reachable here in keepOpen mode): Escape must pass THROUGH to the dialog — swallowing
    // it was a keyboard hijack that ate the first Escape and left the dialog open — while still
    // suppressing keepOpen's re-open so the popup doesn't pop back on the next keystroke.
    return popupOpen
      ? { type: 'close-escape', prevent: true, stop: true, suppressUntilBoundary: true }
      : { type: 'close-escape', prevent: false, stop: false, suppressUntilBoundary: true };
  }

  // A colon inside a value is part of the value (mdi:lightbulb, custom:button-card): the list
  // stays and the live update narrows it.
  if (popupOpen && key === ':' && String(state?.context?.yamlRole || '').toLowerCase() === 'value') return { type: 'none' };

  if (popupOpen && (key === ':' || key === ' ')) {
    const commit = completionCommitCharacterAction(key, state);
    if (commit) return commit;
    return { type: 'dismiss-typed-delimiter', prevent: false, stop: false };
  }

  // Keys with a modifier belong to the editor: Shift+arrows extend the selection, Ctrl+Home/End
  // jump in the document, Shift+Tab outdents, Ctrl/Shift+Enter insert a line.
  if (event?.ctrlKey || event?.altKey || event?.metaKey || event?.shiftKey) return { type: 'none' };

  if (popupOpen && items.length) {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(key)) {
      return {
        type: 'select',
        selected: completionNavigationIndex(selected, items.length, key, options.pageJump),
        prevent: true,
        stop: true,
      };
    }

    if (key === 'Enter' && settings.enterCompletes !== false) return { type: 'accept', prevent: true, stop: true };
    if (key === 'Tab' && settings.tabCompletes !== false) return { type: 'accept', prevent: true, stop: true };
  }

  return { type: 'none' };
}
