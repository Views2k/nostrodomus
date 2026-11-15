import { completionKeyAction, keyClearsEscapeSuppression } from './keymap.js';
import { clearCompletionPopupA11y, scrollCompletionSelectionIntoView, updateCompletionPopupSelection } from './popupRuntime.js';
import { currentSnippetChoiceRows, snippetSessionHasCaret } from './insertion.js';
import { recentAcceptKey } from './scoring.js';

// Nostrodomus completion session runtime.
// Owns the completion compute/open/refresh/event lifecycle.
// Keep DOM access injected through callbacks so the integration shell stays separate.

function callOptional(fn, ...args) {
  if (typeof fn !== 'function') return undefined;
  return fn(...args);
}

function defaultNow() {
  return Date.now();
}

// The token compute() puts in the completion cache key: the same text gets the same token, any
// other text a new one. The text is compared with the previous one instead of hashed, because
// while typing every refresh has a new text and a hash would never be reused.
let tokenText = null;
let tokenSerial = 0;
export function documentIdentityToken(doc = '') {
  const text = String(doc || '');
  if (text !== tokenText) {
    tokenText = text;
    tokenSerial += 1;
  }
  return `${text.length}:s${tokenSerial}`;
}

export function completionLiveUpdateTriggerIsTyping(triggerKind = 'typing') {
  const kind = String(triggerKind || 'typing');
  return kind === 'typing' || kind === 'keepopen' || kind === 'editor-dispatch' || kind.includes('typing') || kind.includes('repeat-pressure');
}

export function createCompletionRuntime(deps = {}) {
  const {
    state,
    documentRef,
    cancelAnimationFrame: cancelFrame = globalThis.cancelAnimationFrame,
    requestAnimationFrame: requestFrame = globalThis.requestAnimationFrame,
    clearTimeout: clearTimer = globalThis.clearTimeout,
    setTimeout: setTimer = globalThis.setTimeout,
    now = defaultNow,
    renderCompletionPopup,
    ensureOverlay,
    placeAtCursor,
    popupIsOpen,
    closePopup,
    measurePerformanceEvent,
    getDoc,
    getPos,
    detectContext,
    runtimeSnapshot,
    scoreItems,
    updateContextInspectorPanel,
    updateSuggestionQualityPanel,
    recordRuntimeError,
    recordRuntimeErrorOnce,
    isViewAllowed,
    loadLibrary,
    logDebug,
    openSettings,
    preserveScrollDuring,
    editorDispatchRepeatPressureActive,
    recordPerformanceEvent,
    closeSettings,
    clearSnippetSession,
    moveSnippetPlaceholder,
    insertItem,
    isScopedEditorEvent,
    isNostrodomusUiEvent,
    rememberView,
    pathHasEditorSurface,
    pageMayHaveEditor,
    scheduleCodeboxStyleReapply,
    observerLifecycleCloseDryRunListenerProbe,
  } = deps;

  if (!state || typeof state !== 'object') {
    throw new Error('createCompletionRuntime requires a mutable state object');
  }

  const safeCancelFrame = id => {
    try { if (id && typeof cancelFrame === 'function') cancelFrame(id); } catch { /* injected delegate */ }
  };

  const safeRequestFrame = fn => {
    if (typeof requestFrame === 'function') return requestFrame(fn);
    return setTimer(fn, 0);
  };

  const safeClearTimer = id => {
    try { if (id && typeof clearTimer === 'function') clearTimer(id); } catch { /* injected delegate */ }
  };

  function overlayVisible(value) {
    if (state.overlay?.style) state.overlay.style.display = value;
    // Hidden without going through close(): the editor must not go on announcing an expanded list.
    if (value === 'none') clearCompletionPopupA11y(state);
  }

  function close() {
    return callOptional(closePopup);
  }

  function isOpen() {
    return !!callOptional(popupIsOpen);
  }

  function render() {
    return renderWithPlacement(placeAtCursor);
  }

  function renderWithPlacement(place) {
    return renderCompletionPopup(state, {
      documentRef,
      ensureOverlay,
      insertItem: insertClickedItem,
      measurePerformanceEvent,
      openSettings,
      preserveScrollDuring,
      placeAtCursor: place,
      runtimeSnapshot,
    });
  }

  function updateSelection(previousSelected) {
    return updateCompletionPopupSelection(state, previousSelected, {
      documentRef,
      ensureOverlay,
      insertItem: insertClickedItem,
      measurePerformanceEvent,
      openSettings,
      preserveScrollDuring,
      placeAtCursor,
      runtimeSnapshot,
    });
  }

  // Renders the list and makes sure it is shown and placed once. The render places a list in a
  // box that is already visible. A box that was hidden has no size until it is shown, and the
  // render of the idle pane does not place at all; both are placed here.
  function renderAndShow() {
    let placed = false;
    renderWithPlacement(() => { placed = true; placeAtCursor(); });
    const box = ensureOverlay();
    if (box.style.display !== 'block') {
      box.style.display = 'block';
      placed = false;
      // The render ran while the box was hidden and its rows had no size.
      scrollCompletionSelectionIntoView(state);
    }
    if (!placed) placeAtCursor();
  }

  function snippetChoiceContext(rows) {
    const session = state.snippetSession;
    const current = session?.placeholders?.[session.index];
    const from = Number(session?.from || 0) + Number(current?.start || 0);
    const wordTo = Number(session?.from || 0) + Number(current?.end || current?.start || 0);
    return Object.assign({}, state.context || {}, {
      shouldSuggest: true,
      suppressPopup: false,
      triggerKind: 'snippet-choice',
      lang: rows?.[0]?.lang || state.context?.lang || 'yaml',
      prefix: '',
      from,
      to: from,
      wordTo,
      yamlRole: 'value',
      valueKind: null,
      snippetChoice: true,
    });
  }

  function showSnippetChoicePopup() {
    const rows = currentSnippetChoiceRows(state.snippetSession);
    if (!rows.length) return false;
    state.context = snippetChoiceContext(rows);
    state.items = rows;
    state.selected = 0;
    state.lastExplicitOpen = true;
    renderAndShow();
    return true;
  }

  function acceptSnippetChoice(item) {
    const session = state.snippetSession;
    const current = session?.placeholders?.[session.index];
    const view = session?.view || state.view;
    if (!current || !view?.dispatch) return false;
    const insert = String(item?.insert || item?.label || '');
    const base = Number(session.from || 0);
    const from = base + current.start;
    const to = base + current.end;
    try {
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from, head: from + insert.length },
        scrollIntoView: true,
      });
    } catch (err) {
      recordRuntimeError('completion:snippet-choice-accept', err, { phase: 'acceptSnippetChoice', label: item?.label || '' });
      return false;
    }
    const delta = insert.length - (current.end - current.start);
    current.end = current.start + insert.length;
    for (const placeholder of session.placeholders || []) {
      if (placeholder === current) continue;
      if (placeholder.start > current.start) {
        placeholder.start += delta;
        placeholder.end += delta;
      }
    }
    for (const placeholder of session.allPlaceholders || []) {
      if (placeholder.index === current.index && placeholder.start === current.start) placeholder.end = current.end;
      else if (placeholder.start > current.start) {
        placeholder.start += delta;
        placeholder.end += delta;
      }
    }
    if (session.finalCursor && session.finalCursor.start > current.start) {
      session.finalCursor.start += delta;
      session.finalCursor.end += delta;
    }
    close();
    return true;
  }

  // A click on a row. Like Enter and Tab, it first brings a stale list up to date (a deferred
  // live update, a caret that moved since the last compute); inserted with the old context, the
  // row would replace the old range and leave the characters typed since. The clicked row is
  // inserted when the current document still offers it; otherwise the click only refreshes the
  // list.
  function insertClickedItem(item) {
    if (!item || !completionStateIsStale()) return insertItem(item);
    const clickedKey = recentAcceptKey(item);
    flushPendingLiveUpdate();
    const current = isOpen() && Array.isArray(state.items)
      ? state.items.find(row => recentAcceptKey(row) === clickedKey)
      : null;
    return current ? insertItem(current) : false;
  }

  function compute(triggerKind = 'typing') {
    return measurePerformanceEvent('compute', triggerKind, () => {
      try {
        const doc = getDoc();
        const pos = getPos();
        const previousSelectedItem = Array.isArray(state.items) ? state.items[state.selected] : null;
        const previousSelectedKey = previousSelectedItem ? recentAcceptKey(previousSelectedItem) : '';
        const previousTier = Number(previousSelectedItem?.matchTier ?? 99);
        const ctx = detectContext(doc, pos, triggerKind);
        // A list opened with the shortcut stays an explicit session while it is open: in manual
        // trigger mode, typing to narrow it must not empty it.
        ctx.explicitSession = triggerKind === 'explicit' || (!!state.lastExplicitOpen && isOpen());
        ctx.documentText = doc;
        ctx.documentWordToken = documentIdentityToken(doc);
        const items = scoreItems(ctx);

        let nextSelected = Math.min(state.selected, Math.max(0, items.length - 1));
        if (previousSelectedKey && items.length) {
          const retainedIndex = items.findIndex(item => recentAcceptKey(item) === previousSelectedKey);
          const topTier = Number(items[0]?.matchTier ?? 99);
          if (retainedIndex >= 0 && previousTier <= topTier) nextSelected = retainedIndex;
          else nextSelected = 0;
        }

        state.context = ctx;
        state.branchState = ctx.branchState || null;
        state.items = items;
        state.selected = nextSelected;
        state.diagnosticsLastComputeAt = now();
        updateContextInspectorPanel();
        updateSuggestionQualityPanel();
      } catch (err) {
        state.lastError = err instanceof Error ? err : new Error(String(err || 'completion compute failed'));
        recordRuntimeError('completion:compute', err, { phase: 'compute', triggerKind });
        state.context = Object.assign({}, state.context || {}, {
          shouldSuggest: false,
          suppressPopup: true,
          idleReason: 'runtime-error',
          triggerKind,
        });
        state.branchState = null;
        state.items = [];
        state.selected = 0;
        state.diagnosticsLastComputeAt = now();
        try { updateContextInspectorPanel(); } catch (panelErr) { recordRuntimeErrorOnce('completion:compute-context-panel', panelErr, { phase: 'computeFallback' }); }
        try { updateSuggestionQualityPanel(); } catch (panelErr) { recordRuntimeErrorOnce('completion:compute-quality-panel', panelErr, { phase: 'computeFallback' }); }
      }
    });
  }

  function refresh(triggerKind = 'typing') {
    if (!isViewAllowed(state.view)) {
      close();
      return;
    }

    // An accepted row that continues (a key that waits for its value, an action branch) opens
    // the list itself one frame later. The live update requested by the accept's own change
    // would compute and render the same list first. One update is skipped; insertItem clears
    // the mark when its open runs.
    if (state.continuationOpenPending && triggerKind !== 'explicit') {
      state.continuationOpenPending = false;
      return;
    }

    if (now() < (state.suppressUntil || 0)) {
      overlayVisible('none');
      return;
    }

    if (state.escapeSuppressUntilBoundary && triggerKind !== 'explicit') {
      overlayVisible('none');
      return;
    }

    const shouldStayArmed = isOpen() || state.settings.keepOpen || state.lastExplicitOpen;
    if (!shouldStayArmed) return;

    compute(triggerKind);
    if (state.context?.suppressPopup) {
      overlayVisible('none');
      state.lastExplicitOpen = false;
      return;
    }

    if (state.items.length) {
      renderAndShow();
      return;
    }

    if (state.lastExplicitOpen && state.settings.idlePaneText) {
      renderAndShow();
      return;
    }

    overlayVisible('none');
  }

  function scheduleCompletionRepeatPressureLiveUpdate(triggerKind = 'typing') {
    const current = now();
    state.completionRepeatPressureLiveUpdateQuieted = (state.completionRepeatPressureLiveUpdateQuieted || 0) + 1;
    state.lastCompletionRepeatPressureLiveUpdateQuieted = {
      at: new Date(current).toISOString(),
      triggerKind: String(triggerKind || 'typing').slice(0, 80),
      until: state.editorDispatchRepeatPressureUntil || 0,
    };

    safeClearTimer(state.completionRepeatPressureLiveUpdateTimer);

    const wait = Math.max(180, (state.editorDispatchRepeatPressureUntil || current) - current + 90);
    state.completionRepeatPressureLiveUpdateTimer = setTimer(() => {
      state.completionRepeatPressureLiveUpdateTimer = 0;
      if (editorDispatchRepeatPressureActive()) {
        scheduleCompletionRepeatPressureLiveUpdate(triggerKind);
        return;
      }

      const quieted = state.completionRepeatPressureLiveUpdateQuieted || 0;
      state.completionRepeatPressureLiveUpdateQuieted = 0;
      state.completionRepeatPressureLiveUpdateFlushes = (state.completionRepeatPressureLiveUpdateFlushes || 0) + 1;
      state.lastCompletionRepeatPressureLiveUpdateFlush = {
        at: new Date(now()).toISOString(),
        quieted,
        triggerKind: String(triggerKind || 'typing').slice(0, 80),
      };
      if (quieted) recordPerformanceEvent('completion-live-update-repeat-pressure-quieted', 0, `updates=${quieted}:trigger=${String(triggerKind || 'typing').slice(0, 80)}`);
      refresh('typing-repeat-pressure-quiet');
    }, wait);
  }

  // The popup state is stale when a deferred update is still queued or the cursor is no longer
  // where the last compute saw it.
  function completionStateIsStale() {
    // Snippet choice rows are not produced by compute. Their context is anchored at the
    // placeholder start while the selection head sits at the placeholder end, so the cursor
    // test below would always call them stale and replace them with ordinary suggestions.
    if (state.context?.snippetChoice) return false;
    if (state.completionRepeatPressureLiveUpdateTimer) return true;
    try {
      const computedAt = Number(state.context?.to);
      return Number.isFinite(computedAt) && getPos() !== computedAt;
    } catch {
      return false;
    }
  }

  function cancelPendingLiveUpdate() {
    safeCancelFrame(state.raf);
    state.raf = 0;
    safeClearTimer(state.completionRepeatPressureLiveUpdateTimer);
    state.completionRepeatPressureLiveUpdateTimer = 0;
  }

  function flushPendingLiveUpdate() {
    cancelPendingLiveUpdate();
    // compute() moves the selection back to the first row when the highlighted row ranks below
    // it. That suits a live update; here the user is accepting the row they highlighted, so
    // keep it when it is still in the refreshed list.
    const highlighted = state.selected > 0 && Array.isArray(state.items) ? state.items[state.selected] : null;
    const highlightedKey = highlighted ? recentAcceptKey(highlighted) : '';
    refresh(state.context?.triggerKind === 'explicit' ? 'explicit' : 'typing');
    if (highlightedKey && Array.isArray(state.items)) {
      const kept = state.items.findIndex(item => recentAcceptKey(item) === highlightedKey);
      if (kept >= 0) state.selected = kept;
    }
  }

  function requestLiveUpdate(triggerKind = 'typing') {
    if (editorDispatchRepeatPressureActive() && completionLiveUpdateTriggerIsTyping(triggerKind)) {
      safeCancelFrame(state.raf);
      state.raf = 0;
      scheduleCompletionRepeatPressureLiveUpdate(triggerKind);
      return;
    }

    safeCancelFrame(state.raf);
    state.raf = safeRequestFrame(() => refresh(triggerKind));
  }

  async function open(explicit = true) {
    await loadLibrary();
    if (explicit) state.escapeSuppressUntilBoundary = false;

    if (!isViewAllowed(state.view)) {
      logDebug('No scoped edit-card CodeMirror view. Click inside the card editor first.');
      close();
      return false;
    }

    state.lastExplicitOpen = explicit;
    compute(explicit ? 'explicit' : 'keepopen');
    if (state.context?.suppressPopup) {
      state.lastExplicitOpen = false;
      overlayVisible('none');
      return false;
    }

    if (state.items.length) {
      renderAndShow();
      return true;
    }

    if (explicit && state.settings.idlePaneText) {
      renderAndShow();
      return true;
    }

    overlayVisible('none');
    return false;
  }

  function toggle() {
    if (!isViewAllowed(state.view)) {
      close();
      return;
    }
    if (isOpen()) close();
    else open(true);
  }

  function applyKeyEventControl(ev, action = {}) {
    if (action.prevent) ev.preventDefault?.();
    if (action.stop) ev.stopPropagation?.();
  }

  // Whether an event inside editor scope comes from the code editor itself. Scope is dialog-wide
  // (any event in a card dialog that hosts a code editor), so the dialog's buttons, tabs and form
  // fields are in scope too; their keys and clicks must not drive the list. The event belongs to
  // the editor when its path carries the editor surface, or, for a key whose path was cut at a
  // shadow boundary, when the focused element is inside the bound editor.
  function eventFromEditor(ev) {
    const path = ev?.composedPath?.() || [];
    if (pathHasEditorSurface(path)) return true;
    try {
      const dom = state.view?.dom;
      let active = documentRef?.activeElement || null;
      let guard = 0;
      while (active?.shadowRoot?.activeElement && guard++ < 20) active = active.shadowRoot.activeElement;
      let node = active;
      guard = 0;
      while (dom && node && guard++ < 60) {
        if (node === dom) return true;
        node = node.parentElement || node.getRootNode?.()?.host || null;
      }
    } catch { /* detached node */ }
    return false;
  }

  // Whether a key event comes from the editor whose view is already bound and hooked: the
  // event path runs through that view's own element. Binding it again changes nothing; it only
  // repeats three active-dialog lookups and asks for a style apply for the same view.
  function eventFromBoundView(ev) {
    const view = state.view;
    const dom = view?.dom;
    if (!dom || state.hookedView !== view || dom.isConnected === false) return false;
    return (ev?.composedPath?.() || []).includes(dom);
  }

  // completionKeyAction reads viewAllowed for Ctrl+Space only, so the check (one more
  // active-dialog lookup and a layout read) is made for that key only.
  function viewAllowedForKey(ev) {
    const ctrlSpace = !!ev?.ctrlKey && (ev.code === 'Space' || ev.key === ' ');
    return ctrlSpace ? isViewAllowed(state.view) : true;
  }

  function onKeydown(ev) {
    if (!state.enabled) return;

    const inScope = isScopedEditorEvent(ev);
    const nostrodomusUi = isNostrodomusUiEvent(ev);
    const scoped = inScope && (nostrodomusUi || eventFromEditor(ev));
    if (!scoped && !nostrodomusUi) {
      if (isOpen()) close();
      return;
    }

    if (scoped && !eventFromBoundView(ev)) rememberView(ev);
    // The bound editor is not the style target: the target was dropped while the editor was
    // hidden, or it is another editor. A view that cannot be a style target is left out. Never true
    // in the steady state.
    else if (scoped && state.activeEditorCache && state.activeEditorCache.editor !== state.view?.dom && state.view?.dom !== state.codeboxStyleViewDomChecked) scheduleCodeboxStyleReapply('remember-view');

    // A key pressed while an input method is composing text (keyCode 229 covers browsers that
    // do not set isComposing on the first key) belongs to the input method: Enter confirms the
    // composed text, the arrow keys pick a candidate and Escape cancels it.
    if (ev.isComposing || ev.keyCode === 229) return;

    if (state.escapeSuppressUntilBoundary && scoped && keyClearsEscapeSuppression(ev?.key)) {
      state.escapeSuppressUntilBoundary = false;
    }

    // A panel Home Assistant removed together with the dialog that hosted it is not open: clear the
    // stale state and let this key through instead of swallowing it.
    const settingsPanelDetached = !!state.settingsPanel && state.settingsPanel.isConnected === false;
    if (settingsPanelDetached) closeSettings(false);

    if (ev.key === 'Escape' && !settingsPanelDetached && state.settingsPanel?.parentNode && !state.snippetSession) {
      ev.preventDefault?.();
      ev.stopPropagation?.();
      // The same call as every other close path; closeSettings(true) would also reset the stored
      // panel position.
      closeSettings(false);
      return;
    }

    // Keys pressed inside the settings panel belong to its controls, not to the list that may be
    // open behind it (Tab, Enter and the arrow keys would act on the list). The panel is mounted
    // inside the card dialog, where every key counts as editor scope, so this also holds for
    // scoped events.
    if (state.settingsPanel && (ev?.composedPath?.() || []).includes(state.settingsPanel)) return;

    // The caret left the snippet (click, arrow keys, typing elsewhere, a move to another
    // editor): Tab and Escape go back to the editor instead of jumping to the old placeholder
    // offsets.
    if (state.snippetSession && !snippetSessionHasCaret(state.snippetSession, state.view)) {
      clearSnippetSession();
      state.snippetSession = null;
    }

    let action = completionKeyAction(ev, state, {
      scoped,
      viewAllowed: viewAllowedForKey(ev),
      popupOpen: isOpen(),
    });

    // After a fast typing burst the live update is deferred, so state.items and state.context
    // still describe an older document, and accepting would replace the old range and leave
    // stray characters (`name:` typed fast would give `name: ame`). Bring the list up to date
    // first and decide again; if nothing matches any more the key goes to the editor untouched.
    if ((action.type === 'accept' || action.type === 'commit-typed') && completionStateIsStale()) {
      flushPendingLiveUpdate();
      action = completionKeyAction(ev, state, {
        scoped,
        viewAllowed: viewAllowedForKey(ev),
        popupOpen: isOpen(),
      });
    }

    if (action.type === 'none') return;

    applyKeyEventControl(ev, action);

    if (action.clearEscapeSuppression || action.type === 'clear-escape-suppression') {
      state.escapeSuppressUntilBoundary = false;
      if (action.type === 'clear-escape-suppression') return;
    }

    if (action.type === 'open-explicit') {
      open(true);
      return;
    }

    if (action.type === 'toggle-close') {
      close();
      return;
    }

    if (action.type === 'open-settings') {
      openSettings();
      return;
    }

    if (action.type === 'move-snippet') {
      moveSnippetPlaceholder(action.direction);
      // The dispatch of the selection move asks for a live update when the list is open or
      // keepOpen is on. That update would replace the choice list shown here for the new
      // placeholder.
      if (showSnippetChoicePopup()) cancelPendingLiveUpdate();
      return;
    }

    if (action.type === 'clear-snippet') {
      clearSnippetSession();
      // Escape also closes a list that is open (the choices of a placeholder, or suggestions
      // for the text typed into it), the same way Escape closes it outside a snippet.
      if (isOpen()) {
        state.escapeSuppressUntilBoundary = true;
        close();
      }
      return;
    }

    if (action.type === 'close-escape') {
      state.escapeSuppressUntilBoundary = !!action.suppressUntilBoundary;
      close();
      return;
    }

    if (action.type === 'dismiss-typed-delimiter') {
      close();
      return;
    }

    if (action.type === 'commit-typed') {
      const selectedItem = state.items[state.selected];
      if (selectedItem?.meta?.snippetChoice) {
        acceptSnippetChoice(selectedItem);
        return;
      }
      const rawInsert = String(selectedItem?.insert || selectedItem?.label || '');
      // A row whose text starts with a key and its colon (`size: normal`, a snippet that opens
      // with `tap_action:`) already has the colon the user typed; it is not added again at the
      // end (`size: normal:`).
      const hasKeyColon = action.char === ':' && /^\s*(?:-\s+)?[^\s:]+:(?:\s|$)/.test(rawInsert);
      const needsChar = action.char && !hasKeyColon && !rawInsert.trimEnd().endsWith(action.char);
      const item = needsChar ? { ...selectedItem, insert: rawInsert + action.char } : selectedItem;
      insertItem(item);
      return;
    }

    if (action.type === 'toggle-docs') {
      state.docsExpanded = !state.docsExpanded;
      render();
      return;
    }

    if (action.type === 'select') {
      const previousSelected = state.selected;
      state.selected = action.selected;
      if (!updateSelection(previousSelected)) render();
      return;
    }

    if (action.type === 'accept') {
      const selectedItem = state.items[state.selected];
      if (selectedItem?.meta?.snippetChoice) acceptSnippetChoice(selectedItem);
      else insertItem(selectedItem);
    }
  }

  // The style apply a pointerdown outside the editor asks for repaints an editor that lost focus,
  // finds an editor nothing has reported yet, and removes the styles of an editor that is gone.
  // On a page that cannot have an editor (pageMayHaveEditor: no known editor, no card dialog, no
  // editor panel) only the cleanup is left, and it is done once an apply asked for here has run
  // without an editor outside an editor-opening window (inside one the apply keeps the styles).
  // After that, pointerdowns ask for nothing until another apply runs or the page may have an
  // editor again, so a click on a dashboard does not build the style CSS each time.
  let idleApplyAsked = false;
  let idleApplyDone = null;
  function outsidePointerNeedsStyleApply(ev) {
    if (typeof pageMayHaveEditor !== 'function' || pageMayHaveEditor(ev)) {
      idleApplyAsked = false;
      idleApplyDone = null;
      return true;
    }
    const last = state.lastStyleApply || null;
    if (last && last === idleApplyDone) return false;
    if (idleApplyAsked && last && last.editorBound === false
      && String(last.reason || '').includes('outside-pointer-syntax-repaint')
      && Date.parse(last.at) >= (Number(state.editorSentinelLikelyOpeningUntil) || 0)) {
      idleApplyDone = last;
      return false;
    }
    idleApplyAsked = true;
    return true;
  }

  function onPointer(ev) {
    if (isNostrodomusUiEvent(ev)) return;

    if (!isScopedEditorEvent(ev)) {
      if (outsidePointerNeedsStyleApply(ev)) scheduleCodeboxStyleReapply('outside-pointer-syntax-repaint');
      if (isOpen()) close();
      return;
    }

    // A click on the dialog around the editor (a button, a tab, the preview) closes the list.
    if (!pathHasEditorSurface(ev?.composedPath?.() || [])) {
      if (isOpen()) close();
      return;
    }

    rememberView(ev);

    if (state.settings.keepOpen && isViewAllowed(state.view)) {
      safeRequestFrame(() => open(false));
    }
  }

  function onFocusIn(ev) {
    if (!isScopedEditorEvent(ev)) return;
    // Focus on another control of the dialog is not focus on the editor.
    if (!pathHasEditorSurface(ev?.composedPath?.() || [])) return;

    rememberView(ev);

    if ((state.settings.autoOpenOnFocus || state.settings.keepOpen) && isViewAllowed(state.view)) {
      safeRequestFrame(() => open(false));
    }
  }

  function onFocusOut(ev) {
    const path = ev?.composedPath?.() || [];
    if (pathHasEditorSurface(path) || state.activeEditorCache?.editor) {
      scheduleCodeboxStyleReapply('editor-focusout-syntax-repaint');
      observerLifecycleCloseDryRunListenerProbe('editor-focusout');
    }
  }

  return Object.freeze({
    render,
    compute,
    refresh,
    requestLiveUpdate,
    open,
    toggle,
    onKeydown,
    onPointer,
    onFocusIn,
    onFocusOut,
  });
}
