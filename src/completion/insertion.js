// Nostrodomus completion insertion helpers.
// Prepares accepted-completion YAML insertion text and branch continuation decisions.
//
// Keep this module browser-global-free and state-free. Editor dispatch, popup
// rendering, Settings, provider ranking, and Home Assistant runtime ownership
// live elsewhere.

import * as snippets from './snippets.js';

export function parseSnippetTemplate(template) {
  return snippets.parseSnippetTemplate(template);
}

export function hasSnippetPlaceholders(value) {
  return snippets.hasSnippetPlaceholders(value);
}

export const YAML_ACTION_BRANCHES = Object.freeze({
  'call-service': Object.freeze({ keys: Object.freeze(['service', 'target', 'data', 'confirmation']), required: Object.freeze(['service']), terminal: false }),
  'perform-action': Object.freeze({ keys: Object.freeze(['perform_action', 'target', 'data', 'confirmation']), required: Object.freeze(['perform_action']), terminal: false }),
  navigate: Object.freeze({ keys: Object.freeze(['navigation_path', 'confirmation']), required: Object.freeze(['navigation_path']), terminal: false }),
  url: Object.freeze({ keys: Object.freeze(['url_path', 'confirmation']), required: Object.freeze(['url_path']), terminal: false }),
  'fire-dom-event': Object.freeze({ keys: Object.freeze(['browser_mod', 'confirmation']), required: Object.freeze([]), terminal: false }),
  toggle: Object.freeze({ keys: Object.freeze(['confirmation']), required: Object.freeze([]), terminal: true }),
  'more-info': Object.freeze({ keys: Object.freeze(['entity', 'confirmation']), required: Object.freeze([]), terminal: true }),
  none: Object.freeze({ keys: Object.freeze([]), required: Object.freeze([]), terminal: true }),
});

export function leadingWhitespace(line) {
  return String(line || '').match(/^\s*/)?.[0] || '';
}

// The indentation of the first key on a line. A list dash counts as indentation: in `  - key:`
// the key starts in column 4, and its siblings and its block are measured from there.
function keyIndentOfLine(line) {
  const match = /^([ \t]*)((?:-[ \t]+)*)/.exec(String(line || ''));
  return match[1] + ' '.repeat(match[2].length);
}

export function indentLinesAfterFirst(text, indent) {
  return String(text || '').replace(/\n/g, '\n' + String(indent || ''));
}

export function itemKeyName(item) {
  return String(item?.label || item?.insert || '').replace(/:$/, '').trim();
}

export function isActionParentContext(ctx) {
  const pathText = Array.isArray(ctx?.yamlPath) ? ctx.yamlPath.join('.').toLowerCase() : '';
  return pathText.includes('tap_action') || pathText.includes('hold_action') || pathText.includes('double_tap_action') || !!ctx?.branchState;
}

export function itemNeedsYamlValue(ctx, item) {
  if (!ctx || ctx.lang !== 'yaml' || item?.type !== 'key') return false;
  const key = itemKeyName(item);
  return ['action', 'service', 'entity', 'entity_id', 'navigation_path', 'url_path', 'icon', 'type', 'theme'].includes(key);
}

export function itemOpensYamlBlock(ctx, item) {
  if (!ctx || ctx.lang !== 'yaml' || item?.type !== 'key') return false;
  const key = itemKeyName(item);
  // state: is a block only in a button-card (its state list and the styles target). In a condition,
  // a trigger or an entity row it takes a value on the same line.
  if (key === 'state') return ['button-card', 'styles'].includes(String(item?.meta?.contextKind || ''));
  return ['tap_action', 'hold_action', 'double_tap_action', 'target', 'data', 'confirmation', 'browser_mod', 'content', 'styles', 'custom_fields', 'variables'].includes(key);
}

export function branchableValueAccepted(ctx, item, actionBranches = YAML_ACTION_BRANCHES) {
  if (!ctx || ctx.lang !== 'yaml' || !ctx.valueKind) return false;
  const key = String(ctx.yamlKey || '').toLowerCase();
  const value = String(item?.insert || item?.label || '').trim();
  if (key === 'action') {
    return (!!actionBranches[value] && !actionBranches[value].terminal) || ['call-service', 'perform-action', 'navigate', 'url', 'fire-dom-event'].includes(value);
  }
  if (key === 'service' && isActionParentContext(ctx)) return true;
  return false;
}

export function continuationForAcceptedItem(ctx, item, options = {}) {
  if (!ctx || ctx.lang !== 'yaml') return null;

  // options.keyLine is the line the accepted key ends up on when that is not the cursor line (a
  // row inserted as the first line of a block).
  const lineIndent = keyIndentOfLine(options.keyLine ?? (ctx.line || ctx.beforeCursor || ''));
  const valueKey = String(ctx.yamlKey || '').toLowerCase();

  if (branchableValueAccepted(ctx, item, options.actionBranches || YAML_ACTION_BRANCHES)) {
    return { append: '\n' + lineIndent, open: true, reason: `${valueKey || 'value'}-branch` };
  }

  if (itemNeedsYamlValue(ctx, item)) {
    return { append: '', open: true, reason: `${itemKeyName(item)}-value` };
  }

  if (itemOpensYamlBlock(ctx, item)) {
    const childIndent = lineIndent + '  ';
    return { append: '\n' + childIndent, open: true, reason: `${itemKeyName(item)}-block` };
  }

  return null;
}

// Keys whose value is a list of cards, triggers, conditions or action steps. A row accepted right
// after their colon becomes a list item; as a plain child it would make the value a mapping.
// `default` is left out: under `choose` it is a list of steps, but a blueprint input and many
// integration options use the same key for a plain value.
const LIST_VALUED_BLOCK_KEYS = new Set(['cards', 'triggers', 'conditions', 'actions', 'sequence', 'then', 'else', 'choose', 'parallel', 'if']);
// then, else and if hold steps in automations and scripts. Inside a catalog card they are that
// card's own keys (custom:auto-entities takes one card under else), so they stay mappings there.
const STEP_BRANCH_KEYS = new Set(['then', 'else', 'if']);
function blockKeyHoldsList(ctx) {
  const key = String(ctx?.yamlKey || '').toLowerCase();
  if (!LIST_VALUED_BLOCK_KEYS.has(key)) return false;
  return !(STEP_BRANCH_KEYS.has(key) && ctx?.catalogSurfaceId);
}

export function prepareInsertText(rawInsert, ctx, item) {
  let insert = String(rawInsert || '');
  const lineIndent = keyIndentOfLine(ctx?.line || '');
  const cursorIndent = leadingWhitespace(ctx?.beforeCursor || '');

  // The list dash is already typed. A snippet that starts with its own "- " already indents its
  // other lines for the item; any other snippet needs the two columns of the dash added.
  const asListItem = (baseIndent, lead) => {
    const pad = baseIndent + (/^\s*-\s/.test(insert) ? '' : '  ');
    const lines = insert.replace(/^\s*-\s*/, '').split('\n');
    return lead + lines.map((line, index) => index === 0 ? line : pad + line).join('\n');
  };
  if (ctx?.lang === 'yaml' && ctx?.yamlRole === 'list-key' && item?.type === 'snippet') {
    // `  - |` and `  -|`: only a dash typed without its space still needs one.
    const match = String(ctx.beforeCursor || '').match(/^(\s*)-(\s*)$/);
    if (match) return asListItem(match[1] || '', match[2] ? '' : ' ');
  }
  if (ctx?.lang === 'yaml' && ctx?.yamlRole === 'key' && item?.type === 'snippet') {
    // `  - tri|`: a filter prefix typed after the dash.
    const match = String(ctx.beforeCursor || '').match(/^(\s*)-\s+\S*$/);
    if (match) return asListItem(match[1] || '', '');
  }
  if (ctx?.lang === 'yaml' && ctx?.yamlRole === 'list-key' && /^\s*-$/.test(String(ctx.beforeCursor || ''))) {
    insert = ' ' + insert;
  }

  if (ctx?.blockValueKind && ctx?.afterKeyColon) {
    const childIndent = lineIndent + '  ';
    if (blockKeyHoldsList(ctx)) {
      // The row becomes the first item of the list. A row that starts with its own "- " already
      // indents its other lines for the item; any other row gets the dash and two more columns.
      const listItem = /^\s*-\s/.test(insert) ? insert : '- ' + insert.replace(/\n/g, '\n  ');
      return '\n' + childIndent + listItem.replace(/\n/g, '\n' + childIndent);
    }
    // A list-item snippet keeps its own dash: under a sequence key (triggers:, actions:,
    // conditions:) the text without it would be a mapping, which Home Assistant rejects.
    if (item?.type !== 'snippet') insert = insert.replace(/^\s*-\s*/, '');
    return '\n' + childIndent + insert.replace(/\n/g, '\n' + childIndent);
  }

  if (ctx?.lang === 'yaml' && ctx?.valueKind && ctx?.afterKeyColon && !/^\s/.test(insert)) {
    // The separating space is only missing when the replaced range starts right at the key's
    // colon (`entity:|`). After `entity: |` or `icon: mdi:|` it is already there.
    const beforeCursor = String(ctx.beforeCursor || '');
    const replaced = Math.max(0, (Number(ctx.to) - Number(ctx.from)) || 0);
    const lead = /:$/.test(beforeCursor.slice(0, Math.max(0, beforeCursor.length - replaced))) ? ' ' : '';
    if (item?.type === 'snippet' && insert.includes('\n')) {
      const lines = insert.split('\n');
      return lead + lines[0] + '\n' + lines.slice(1).map(line => lineIndent + line).join('\n');
    }
    return lead + insert;
  }

  // 'key' is the role while a filter prefix is being typed (`    per|`): the other lines of a
  // snippet still have to follow the indentation of the line it is inserted on.
  if (ctx?.lang === 'yaml' && (ctx.yamlRole === 'blank' || ctx.yamlRole === 'list-key' || ctx.yamlRole === 'key') && cursorIndent) {
    return indentLinesAfterFirst(insert, cursorIndent);
  }

  return insert;
}

export function clearSnippetSession(runtimeState) {
  if (runtimeState && typeof runtimeState === 'object') runtimeState.snippetSession = null;
  return null;
}

function defaultLooksLikeView(view) {
  return !!view && typeof view.dispatch === 'function';
}

function snippetPlaceholderSelection(from, parsed, index = 0) {
  const placeholder = parsed?.placeholders?.[index];
  if (!placeholder) return null;
  const base = Number(from) || 0;
  return {
    anchor: base + placeholder.start,
    head: base + placeholder.end,
  };
}

// A snippet session over a parsed template inserted at `from`. The placeholder objects are
// copies: the session moves them as the text changes.
function newSnippetSession(view, from, parsed, index) {
  return {
    view,
    from,
    index,
    placeholders: parsed.placeholders.map(placeholder => ({ ...placeholder })),
    allPlaceholders: (parsed.allPlaceholders || parsed.placeholders || []).map(placeholder => ({ ...placeholder })),
    finalCursor: parsed.finalCursor ? { ...parsed.finalCursor } : null,
    choices: (parsed.choices || []).map(choice => ({ ...choice, choices: Array.isArray(choice.choices) ? choice.choices.slice() : [] })),
  };
}

// Starts a session for a snippet whose insert already selected the first placeholder.
function createSnippetSession(runtimeState, view, from, parsed, index = 0) {
  if (!runtimeState || !parsed?.placeholders?.length || !defaultLooksLikeView(view)) {
    clearSnippetSession(runtimeState);
    return false;
  }
  runtimeState.snippetSession = newSnippetSession(view, from, parsed, index);
  return true;
}

export function selectSnippetPlaceholder(session, index, options = {}) {
  const looksLikeView = options.looksLikeView || defaultLooksLikeView;
  const runtimeErrorRecorder = typeof options.recordRuntimeError === 'function' ? options.recordRuntimeError : null;
  const clearSession = typeof options.clearSession === 'function' ? options.clearSession : null;
  if (!session || !looksLikeView(session.view)) return false;

  const placeholder = session.placeholders?.[index];
  if (!placeholder) return false;

  session.index = index;

  try {
    session.view.dispatch({
      selection: {
        anchor: session.from + placeholder.start,
        head: session.from + placeholder.end,
      },
      scrollIntoView: true,
    });
  } catch (err) {
    runtimeErrorRecorder?.('completion:snippet-placeholder-select', err, { phase: 'selectSnippetPlaceholder', index });
    clearSession?.();
    return false;
  }

  return true;
}

export function startSnippetSession(runtimeState, view, from, parsed, options = {}) {
  const looksLikeView = options.looksLikeView || defaultLooksLikeView;
  if (!runtimeState || !parsed?.placeholders?.length || !looksLikeView(view)) {
    clearSnippetSession(runtimeState);
    return false;
  }

  runtimeState.snippetSession = newSnippetSession(view, from, parsed, 0);

  return selectSnippetPlaceholder(runtimeState.snippetSession, 0, {
    looksLikeView,
    recordRuntimeError: options.recordRuntimeError,
    clearSession: () => clearSnippetSession(runtimeState),
  });
}

function snippetDocText(view) {
  const doc = view?.state?.doc;
  if (doc && typeof doc.sliceString === 'function') return doc.sliceString(0, doc.length);
  return String(doc || '');
}

// Copies the text of the current placeholder into its mirrors (the other stops with the same
// index, `$1` after `${1:Room}`).
function replicateSnippetMirrors(session, options = {}) {
  if (!session || !session.allPlaceholders?.length) return false;
  const current = session.placeholders?.[session.index];
  if (!current) return false;
  const mirrors = session.allPlaceholders.filter(placeholder => placeholder.index === current.index && placeholder.start !== current.start);
  if (!mirrors.length) return false;
  const view = session.view;
  const doc = snippetDocText(view);
  const base = Number(session.from) || 0;
  const typed = doc.slice(base + current.start, base + current.end);
  const changes = mirrors
    .slice()
    .sort((a, b) => b.start - a.start)
    .map(placeholder => ({ from: base + placeholder.start, to: base + placeholder.end, insert: typed }));
  if (!changes.length) return false;
  try {
    // This function shifts the placeholders itself (below). On a hooked view the dispatch also
    // runs updateSnippetSessionAfterDispatch, which models one edit at the selection and would
    // shift them a second time for this multi-range edit; the flag makes it skip.
    session.replicatingMirrors = true;
    view.dispatch({ changes });
  } catch (err) {
    options.recordRuntimeError?.('completion:snippet-mirror-replicate', err, { phase: 'replicateSnippetMirrors', index: current.index });
    options.clearSession?.();
    return false;
  } finally {
    session.replicatingMirrors = false;
  }
  const deltaByStart = new Map();
  for (const change of changes.slice().sort((a, b) => a.from - b.from)) {
    deltaByStart.set(change.from - base, String(change.insert || '').length - (change.to - change.from));
  }
  for (const placeholder of session.allPlaceholders) {
    let delta = 0;
    for (const [start, changeDelta] of deltaByStart.entries()) {
      if (placeholder.start > start) delta += changeDelta;
      else if (placeholder.start === start && placeholder.index === current.index) placeholder.end = placeholder.start + typed.length;
    }
    if (delta) {
      placeholder.start += delta;
      placeholder.end += delta;
    }
  }
  for (const placeholder of session.placeholders) {
    const updated = session.allPlaceholders.find(p => p.index === placeholder.index && p.start === placeholder.start);
    if (updated) placeholder.end = updated.end;
  }
  if (session.finalCursor) {
    let delta = 0;
    for (const [start, changeDelta] of deltaByStart.entries()) if (session.finalCursor.start > start) delta += changeDelta;
    session.finalCursor.start += delta;
    session.finalCursor.end += delta;
  }
  return true;
}

export function currentSnippetChoiceRows(session) {
  const current = session?.placeholders?.[session.index];
  if (!current || !Array.isArray(current.choices) || !current.choices.length) return [];
  return current.choices.map((choice, index) => Object.freeze({
    id: `snippet.choice.${current.index}.${index}`,
    lang: 'yaml',
    type: 'value',
    label: String(choice),
    insert: String(choice),
    source: 'snippet-choice',
    meta: Object.freeze({ snippetChoice: true, placeholderIndex: current.index }),
  }));
}

// The session owns Tab and Escape only while the selection is still inside the range its
// placeholders span. An unreadable selection keeps the session.
// activeView is the editor the key was pressed in, when known: the selection of the session's own
// editor does not move when the user goes on to another editor, so a session there has no caret.
export function snippetSessionHasCaret(session, activeView = null) {
  if (!session) return false;
  if (activeView && session.view && session.view !== activeView) return false;
  const main = session.view?.state?.selection?.main;
  const head = Number(main?.head);
  if (!main || !Number.isFinite(head)) return true;
  const anchor = Number.isFinite(Number(main.anchor)) ? Number(main.anchor) : head;
  const spans = [...(session.allPlaceholders || []), ...(session.placeholders || [])];
  if (session.finalCursor) spans.push(session.finalCursor);
  if (!spans.length) return true;
  const base = Number(session.from) || 0;
  const min = base + Math.min(...spans.map(span => span.start));
  const max = base + Math.max(...spans.map(span => span.end));
  return Math.min(anchor, head) >= min && Math.max(anchor, head) <= max;
}

export function moveSnippetPlaceholder(runtimeState, direction = 1, options = {}) {
  const looksLikeView = options.looksLikeView || defaultLooksLikeView;
  const runtimeErrorRecorder = typeof options.recordRuntimeError === 'function' ? options.recordRuntimeError : null;
  const session = runtimeState?.snippetSession;
  if (!session || !looksLikeView(session.view)) return false;

  if (direction > 0) replicateSnippetMirrors(session, {
    recordRuntimeError: options.recordRuntimeError,
    clearSession: () => clearSnippetSession(runtimeState),
  });

  const next = session.index + direction;
  if (next >= 0 && next < session.placeholders.length) {
    return selectSnippetPlaceholder(session, next, {
      looksLikeView,
      recordRuntimeError: options.recordRuntimeError,
      clearSession: () => clearSnippetSession(runtimeState),
    });
  }

  // Shift+Tab at the first placeholder stays there; only Tab past the last one ends the session.
  if (next < 0) {
    return selectSnippetPlaceholder(session, 0, {
      looksLikeView,
      recordRuntimeError: options.recordRuntimeError,
      clearSession: () => clearSnippetSession(runtimeState),
    });
  }

  const last = session.placeholders[session.placeholders.length - 1];
  // The caret goes to the snippet's $0 when it has one, otherwise to the end of the last
  // placeholder's text.
  const final = session.finalCursor;
  const end = session.from + (final ? (final.start ?? final.end ?? 0) : (last?.end ?? 0));
  const view = session.view;
  clearSnippetSession(runtimeState);

  try {
    view.dispatch({
      selection: { anchor: end },
      scrollIntoView: true,
    });
  } catch (err) {
    runtimeErrorRecorder?.('completion:snippet-placeholder-exit', err, { phase: 'moveSnippetPlaceholder', direction });
    clearSnippetSession(runtimeState);
    return false;
  }

  return true;
}

export function updateSnippetSessionAfterDispatch(runtimeState, view, oldDocLength, oldSelection, options = {}) {
  const session = runtimeState?.snippetSession;
  if (!session || session.view !== view || !oldSelection) return false;
  // Mirror replication already shifts every placeholder itself; its dispatch must not also run this
  // single-edit bookkeeping, or the mirror edit is counted twice (see replicateSnippetMirrors).
  if (session.replicatingMirrors) return false;

  const getDocLength = options.getDocLength || (() => view?.state?.doc?.length ?? String(view?.state?.doc || '').length ?? 0);
  const newDocLength = getDocLength(view);
  const delta = newDocLength - oldDocLength;
  if (!delta) return false;

  const oldFrom = oldSelection.from;
  const oldTo = oldSelection.to;
  const localFrom = oldFrom - session.from;
  const localTo = oldTo - session.from;
  const current = session.placeholders[session.index];
  if (!current) return false;

  // The current placeholder against the edit [localFrom, localTo]: an insertion before it moves
  // it and one at or inside it grows it; a deletion or replacement before it moves it, one that
  // overlaps it changes its end, and one at or after its end leaves it alone.
  const curStart = current.start;
  const trackSpan = (span) => {
    if (localFrom === localTo) {
      if (localFrom < span.start) { span.start += delta; span.end += delta; }
      else if (localFrom <= span.end) { span.end += delta; }
    } else if (localTo <= span.start) {
      span.start += delta; span.end += delta;
    } else if (localFrom < span.end) {
      span.end = Math.max(span.start, span.end + delta);
    }
  };
  trackSpan(current);

  for (const placeholder of session.placeholders) {
    if (placeholder === current) continue;
    if (placeholder.start >= localTo) {
      placeholder.start += delta;
      placeholder.end += delta;
    }
  }
  for (const placeholder of session.allPlaceholders || []) {
    if (placeholder.index === current.index && placeholder.start === curStart) trackSpan(placeholder);
    else if (placeholder.start >= localTo) {
      placeholder.start += delta;
      placeholder.end += delta;
    }
  }
  if (session.finalCursor && session.finalCursor.start >= localTo) {
    session.finalCursor.start += delta;
    session.finalCursor.end += delta;
  }
  return true;
}

export function insertItem(runtimeState, item, options = {}) {
  const looksLikeView = options.looksLikeView || defaultLooksLikeView;
  const runtimeErrorRecorder = typeof options.recordRuntimeError === 'function' ? options.recordRuntimeError : null;
  const closeCompletion = typeof options.closeCompletion === 'function' ? options.closeCompletion : () => {};
  const openCompletion = typeof options.openCompletion === 'function' ? options.openCompletion : async () => {};
  const isViewAllowed = typeof options.isViewAllowed === 'function' ? options.isViewAllowed : looksLikeView;
  const scheduleFrame = typeof options.scheduleFrame === 'function' ? options.scheduleFrame : fn => fn();
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const suppressMs = Number.isFinite(options.suppressMs) ? options.suppressMs : 260;
  const maxContinuationAttempts = Number.isFinite(options.maxContinuationAttempts) ? options.maxContinuationAttempts : 3;
  const recentAcceptedRecorder = typeof options.recordRecentAcceptedCompletion === 'function' ? options.recordRecentAcceptedCompletion : null;
  const acceptMode = String(options.acceptMode || runtimeState?.settings?.acceptMode || 'replace');

  const view = runtimeState?.view;
  const ctx = runtimeState?.context;

  if (!item || !ctx || !looksLikeView(view)) return false;

  let replaceTo = acceptMode === 'insert' ? ctx.to : (Number.isFinite(Number(ctx.wordTo)) ? Number(ctx.wordTo) : ctx.to);
  const yamlKeyRow = item.type === 'key' && ctx.lang === 'yaml';
  const afterWord = String(ctx.afterCursor || '').slice(Math.max(0, replaceTo - ctx.to));
  // A key row that carries a value (`size: normal`, `icon: mdi:`) on a line that already has
  // its colon. With a value on the line the accept renames the key and the value stays, so the
  // row counts as "size: ". With nothing after the colon the row replaces the colon as well.
  let keyInsert = item.insert;
  const keyWithValue = yamlKeyRow ? /^([^\s:]+:)[ \t]+\S/.exec(String(item.insert || '')) : null;
  const colonOnLine = keyWithValue ? /^[ \t]*:(.*)$/.exec(afterWord) : null;
  if (colonOnLine && colonOnLine[1].trim()) keyInsert = keyWithValue[1] + ' ';
  else if (colonOnLine) replaceTo += colonOnLine[0].length;

  // Renaming a key that already has its colon (`entit|y: light.x`): the row brings its own
  // "entity: ", so the existing colon joins the replaced range instead of being left behind.
  const keyTail = yamlKeyRow ? /^[^\s:]+:([ \t]?)$/.exec(String(keyInsert || '')) : null;
  const existingColon = keyTail
    ? (keyTail[1] ? /^[ \t]*:[ \t]?/ : /^[ \t]*:/).exec(afterWord)
    : null;
  if (existingColon) replaceTo += existingColon[0].length;

  const rawPrepared = prepareInsertText(keyInsert, ctx, item);
  // A row inserted as the first line of a block (`browser_mod:|` plus `data:`) sits on a line of
  // its own; what it opens is indented from there, not from the cursor line.
  const ownLine = item.type === 'key' && /^\n[^\n]*$/.test(rawPrepared);
  const continuation = continuationForAcceptedItem(ctx, item, ownLine ? { keyLine: rawPrepared.slice(1) } : {});
  const rawInsert = rawPrepared + (existingColon ? '' : (continuation?.append || ''));
  const isSnippet = item.type === 'snippet';
  const parsed = isSnippet ? parseSnippetTemplate(rawInsert) : null;
  const insertText = isSnippet ? parsed.text : rawInsert;
  const shouldContinue = !!continuation?.open;

  runtimeState.suppressUntil = shouldContinue ? 0 : now() + suppressMs;
  runtimeState.lastExplicitOpen = shouldContinue;

  const shouldStartSnippetSession = item.type === 'snippet' && hasSnippetPlaceholders(rawInsert);
  const selection = shouldStartSnippetSession
    ? snippetPlaceholderSelection(ctx.from, parsed, 0) || { anchor: ctx.from + insertText.length }
    : { anchor: ctx.from + insertText.length };

  // A value completed inside the active placeholder (`action: ${1:light.turn_on}`, typed `sw`,
  // accepted `switch.turn_on`) is part of filling in the snippet, so the session survives it.
  // Checked before the dispatch because the dispatch hook moves the placeholder bounds.
  const activeSession = runtimeState.snippetSession;
  const activePlaceholder = activeSession?.view === view ? activeSession.placeholders?.[activeSession.index] : null;
  const keepSnippetSession = !!activePlaceholder && !shouldStartSnippetSession && !insertText.includes('\n')
    && ctx.from >= activeSession.from + activePlaceholder.start
    && replaceTo <= activeSession.from + activePlaceholder.end;

  try {
    view.dispatch({
      changes: { from: ctx.from, to: replaceTo, insert: insertText },
      selection,
      scrollIntoView: true,
      // CodeMirror's history joins a change without a user event to the typing before it, so one
      // undo would remove the accepted text and the typed prefix together. This is the event
      // CodeMirror's own completion uses; the history starts a new undo step for it.
      userEvent: 'input.complete',
    });
  } catch (err) {
    runtimeState.lastError = err instanceof Error ? err : new Error(String(err || 'completion insert failed'));
    runtimeErrorRecorder?.('completion:insert-dispatch', err, {
      phase: 'insertItem',
      label: item?.label || '',
      type: item?.type || '',
      source: item?.source || '',
    });
    clearSnippetSession(runtimeState);
    closeCompletion('insert-dispatch-error');
    return false;
  }

  try {
    recentAcceptedRecorder?.(item);
  } catch (err) {
    runtimeErrorRecorder?.('completion:recent-accepted-record', err, { phase: 'insertItem', label: item?.label || '' });
  }

  try {
    if (shouldStartSnippetSession) {
      createSnippetSession(runtimeState, view, ctx.from, parsed, 0);
    } else if (!keepSnippetSession) {
      clearSnippetSession(runtimeState);
    }
  } catch (err) {
    runtimeErrorRecorder?.('completion:insert-snippet-session', err, { phase: 'insertItem', label: item?.label || '' });
    clearSnippetSession(runtimeState);
  }

  if (shouldContinue) {
    // The open below computes and renders the list for the new cursor position. The live update
    // that the accept's own change requested would do the same work one frame earlier, so the
    // completion runtime skips that one update while this is set.
    runtimeState.continuationOpenPending = true;
    // The editor text and caret the last attempt computed for. An attempt that found no rows
    // gives the same answer until one of them changes, so it is repeated only after a change.
    let computedDoc;
    let computedHead;
    const reopenContinuation = (attempt = 0) => {
      scheduleFrame(async () => {
        runtimeState.continuationOpenPending = false;
        if (!runtimeState?.enabled || !isViewAllowed(runtimeState?.view)) return;

        const viewState = runtimeState.view?.state;
        const doc = viewState?.doc;
        const head = viewState?.selection?.main?.head;
        const unchanged = attempt > 0 && doc === computedDoc && head === computedHead;
        computedDoc = doc;
        computedHead = head;

        if (!unchanged) {
          runtimeState.lastExplicitOpen = true;

          try {
            await openCompletion(true);
          } catch (err) {
            runtimeErrorRecorder?.('completion:continuation-open', err, { phase: 'insertItem', attempt });
            closeCompletion('continuation-open-error');
            return;
          }
        }

        if (runtimeState?.items?.length || attempt >= maxContinuationAttempts) return;
        reopenContinuation(attempt + 1);
      });
    };

    scheduleFrame(() => reopenContinuation(0));
  } else {
    closeCompletion('completion-accepted');
  }

  return true;
}
