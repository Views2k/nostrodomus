// Nostrodomus completion insertion runtime glue.
//
// Keep low-level insertion/snippet transforms in ./insertion.js. This owner
// module owns live runtime error handling and callback wiring for accepted rows.

import {
  clearSnippetSession,
  insertItem,
  moveSnippetPlaceholder,
  updateSnippetSessionAfterDispatch,
} from './insertion.js';
import * as scoring from './scoring.js';

function noop() {}

export function createCompletionInsertionRuntime(options = {}) {
  const state = options.state || {};
  const looksLikeView = typeof options.looksLikeView === 'function' ? options.looksLikeView : view => !!view?.dispatch;
  const recordRuntimeError = typeof options.recordRuntimeError === 'function' ? options.recordRuntimeError : noop;
  const closeCompletion = typeof options.closeCompletion === 'function' ? options.closeCompletion : noop;
  const openCompletion = typeof options.openCompletion === 'function' ? options.openCompletion : async () => {};
  const isViewAllowed = typeof options.isViewAllowed === 'function' ? options.isViewAllowed : looksLikeView;
  const getDocLength = typeof options.getDocLength === 'function' ? options.getDocLength : () => 0;
  const scheduleFrame = typeof options.scheduleFrame === 'function' ? options.scheduleFrame : fn => fn();
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const recordRecentAcceptedCompletion = typeof options.recordRecentAcceptedCompletion === 'function'
    ? options.recordRecentAcceptedCompletion
    : scoring.recordRecentAcceptedCompletion;
  const suppressMs = Number.isFinite(options.suppressMs) ? options.suppressMs : 260;
  const maxContinuationAttempts = Number.isFinite(options.maxContinuationAttempts) ? options.maxContinuationAttempts : 3;

  return {
    clearSnippetSession() {
      return clearSnippetSession(state);
    },

    moveSnippetPlaceholder(direction = 1) {
      try {
        return moveSnippetPlaceholder(state, direction, {
          looksLikeView,
          recordRuntimeError,
        });
      } catch (err) {
        recordRuntimeError('completion:snippet-placeholder-move', err, { phase: 'moveSnippetPlaceholder', direction });
        clearSnippetSession(state);
        return false;
      }
    },

    updateSnippetSessionAfterDispatch(view, oldDocLength, oldSel) {
      try {
        return updateSnippetSessionAfterDispatch(state, view, oldDocLength, oldSel, {
          getDocLength,
        });
      } catch (err) {
        recordRuntimeError('completion:snippet-session-update', err, { phase: 'updateSnippetSessionAfterDispatch' });
        clearSnippetSession(state);
        return false;
      }
    },

    insertItem(item) {
      return insertItem(state, item, {
        looksLikeView,
        recordRuntimeError,
        closeCompletion,
        openCompletion,
        isViewAllowed,
        scheduleFrame,
        now,
        recordRecentAcceptedCompletion,
        suppressMs,
        maxContinuationAttempts,
      });
    },
  };
}

export default createCompletionInsertionRuntime;
