// Runtime owner for active editor cache and native fallback dedupe behavior.
//
// This module owns active editor cache keys, stable native-highlight fallback
// decisions, bridge/editor discovery, and no-editor backoff state. Dependencies
// are injected so it stays free of circular imports with the syntax/style
// runtimes.

export function createActiveEditorCacheRuntime(ctx = {}) {
  const {
    W = globalThis.window,
    VERSION = "0.0.0",
    state,
    getComputedStyle = globalThis.getComputedStyle?.bind?.(globalThis),
    codeboxFrameHostForEditor,
    activeEditDialog,
    composedContains,
    editorLikelyOpeningWithoutMountedCodebox,
    sourceClassSmartSyntaxObserverReady,
    shouldSkipStableEditorLifecycleForNativeFallback,
    shouldSkipRememberActiveEditorNativeHighlightInstall,
    recordPerformanceEvent,
    scheduleNativeHighlightForActiveEditor,
    editorUsesCodeMirrorSourceClassSyntax,
    replaceNativeAutocompleteEnabled = () => true,
    // Surface-wide native-autocomplete suppression: returns EVERY ha-code-editor host on the active
    // surface (not just the active editor), so HA's built-in entity/icon dropdown is turned off in
    // every codebox, re-applied as new ones mount. No-op default keeps the runtime concern-neutral.
    codeEditorHostsForNativeSuppression = () => [],
    // The companion layer (scrollbar/enlarge) must ride every editor-discovery path, not
    // just the editor sentinel. This is the convergence point all paths funnel through
    // (sentinel, initialSyntaxPaintGate, codeboxStyle discovery, companionReady), so
    // driving the companion here covers editors found by a non-sentinel path (which get
    // styling but would otherwise miss the companion). Idempotent / first-injector-wins,
    // so the overlap with the sentinel's own calls is a safe no-op.
    // No-op default keeps the runtime concern-neutral.
    applyCompanionEditorLayer = () => {},
  } = ctx;



  function haCodeEditorHostForEditor(editor) {
    if (!editor) return null;
    try {
      const root = editor.getRootNode?.();
      if (root?.host?.localName === 'ha-code-editor') return root.host;
    } catch { /* detached node */ }
    try {
      const closest = editor.closest?.('ha-code-editor');
      if (closest) return closest;
    } catch { /* detached node */ }
    let node = editor;
    for (let i = 0; node && i < 10; i += 1) {
      try { if (node.localName === 'ha-code-editor') return node; } catch { /* detached node */ }
      try {
        const root = node.getRootNode?.();
        if (root?.host?.localName === 'ha-code-editor') return root.host;
        node = node.parentElement || root?.host || null;
      } catch {
        node = node?.parentElement || null;
      }
    }
    return null;
  }

  function rememberNativeAutocompleteOriginal(host) {
    if (!host) return null;
    if (!state.nativeAutocompleteOriginals) state.nativeAutocompleteOriginals = new WeakMap();
    if (!state.nativeAutocompleteSuppressedHosts) state.nativeAutocompleteSuppressedHosts = new Set();
    let original = state.nativeAutocompleteOriginals.get(host);
    if (!original) {
      original = {
        hadAutocompleteEntities: 'autocompleteEntities' in host,
        autocompleteEntities: host.autocompleteEntities,
        hadAutocompleteIcons: 'autocompleteIcons' in host,
        autocompleteIcons: host.autocompleteIcons,
      };
      state.nativeAutocompleteOriginals.set(host, original);
    }
    state.nativeAutocompleteSuppressedHosts.add(host);
    return original;
  }

  function suppressNativeAutocompleteForEditor(editor, reason = 'active-editor') {
    const host = haCodeEditorHostForEditor(editor);
    if (!host) return false;
    if (!replaceNativeAutocompleteEnabled()) {
      restoreNativeAutocomplete('setting-disabled');
      return false;
    }
    rememberNativeAutocompleteOriginal(host);
    let changed = false;
    try { if (host.autocompleteEntities !== false) { host.autocompleteEntities = false; changed = true; } } catch { /* HA setter may throw */ }
    try { if (host.autocompleteIcons !== false) { host.autocompleteIcons = false; changed = true; } } catch { /* HA setter may throw */ }
    try { host.dataset.nostrodomusNativeAutocompleteSuppressed = '1'; } catch { /* detached node */ }
    state.lastNativeAutocompleteSuppression = {
      at: new Date().toISOString(),
      version: VERSION,
      reason,
      changed,
      host: host.localName || 'ha-code-editor',
    };
    if (changed) recordPerformanceEvent('native-autocomplete-suppressed', 0, reason);
    return true;
  }

  // Suppress HA's native autocomplete on every ha-code-editor host on the active surface, not just
  // the one active editor. Without this, the native entity dropdown stays visible in the other
  // codeboxes on a screen (panels with several editors, dialogs with nested ones), since the
  // per-editor suppression only runs for the single active editor. This rides the same discovery
  // convergence (rememberActiveCodeboxEditor), so it re-applies as new editors mount. Suppressed hosts
  // are tracked in the shared set, so restoreNativeAutocomplete already cleans them up. Fail-dark and
  // gated by the same setting; passing each host through suppressNativeAutocompleteForEditor reuses the
  // remember/guard/diagnostic path (haCodeEditorHostForEditor returns a host passed directly).
  // Drop hosts that have left the DOM (a closed editor dialog) from the suppression registries so a
  // long session that opens and closes many editors doesn't accumulate detached ha-code-editor hosts
  // (a leak: the Set/Map held them alive and grew unboundedly, since they were only cleared on a full
  // restore/uninstall). A detached host needs no property restore — it is gone — so pruning is safe.
  function pruneDetachedSuppressedHosts() {
    const suppressed = state.nativeAutocompleteSuppressedHosts;
    if (!suppressed || typeof suppressed.forEach !== 'function') return 0;
    let pruned = 0;
    for (const host of Array.from(suppressed)) {
      if (host && host.isConnected === false) {
        suppressed.delete(host);
        state.nativeAutocompleteOriginals?.delete?.(host);
        pruned += 1;
      }
    }
    return pruned;
  }

  function suppressNativeAutocompleteAcrossSurface(reason = 'surface-sweep') {
    if (!replaceNativeAutocompleteEnabled()) {
      restoreNativeAutocomplete('setting-disabled');
      return 0;
    }
    pruneDetachedSuppressedHosts();
    let hosts = [];
    try { hosts = codeEditorHostsForNativeSuppression() || []; } catch { hosts = []; }
    let count = 0;
    for (const host of hosts) {
      try { if (suppressNativeAutocompleteForEditor(host, reason)) count += 1; } catch { /* one hostile host never breaks the sweep */ }
    }
    return count;
  }

  function restoreNativeAutocomplete(reason = 'restore') {
    const hosts = Array.from(state.nativeAutocompleteSuppressedHosts || []);
    let restored = 0;
    for (const host of hosts) {
      const original = state.nativeAutocompleteOriginals?.get?.(host);
      if (!original) continue;
      try {
        if (original.hadAutocompleteEntities) host.autocompleteEntities = original.autocompleteEntities;
        else delete host.autocompleteEntities;
      } catch { /* HA setter may throw */ }
      try {
        if (original.hadAutocompleteIcons) host.autocompleteIcons = original.autocompleteIcons;
        else delete host.autocompleteIcons;
      } catch { /* HA setter may throw */ }
      try { delete host.dataset.nostrodomusNativeAutocompleteSuppressed; } catch { /* detached node */ }
      restored += 1;
    }
    state.nativeAutocompleteSuppressedHosts?.clear?.();
    state.lastNativeAutocompleteRestore = { at: new Date().toISOString(), version: VERSION, reason, restored };
    if (restored) recordPerformanceEvent('native-autocomplete-restored', 0, `${reason}:${restored}`);
    return restored;
  }

  function codeboxEditorCacheKey(editor) {
    if (!editor) return "no-editor";
    try {
      if (!editor.dataset.nostrodomusEditorCacheId) {
        editor.dataset.nostrodomusEditorCacheId = `editor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      const host = codeboxFrameHostForEditor(editor);
      if (host && !host.dataset.nostrodomusEditorCacheId) {
        host.dataset.nostrodomusEditorCacheId = `host-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      return `${editor.dataset.nostrodomusEditorCacheId}|${host?.dataset?.nostrodomusEditorCacheId || "no-host"}`;
    } catch {
      const rect = editor.getBoundingClientRect?.();
      return rect ? `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}` : "unknown-editor";
    }
  }

  function sourceClassFallbackObserverReadyForEditor(editor, content = null) {
    if (!editor?.querySelector) return false;
    const editorKey = codeboxEditorCacheKey(editor);
    const resolvedContent = content || editor.querySelector?.(".cm-content") || null;
    if (!resolvedContent) return false;
    return sourceClassSmartSyntaxObserverReady(state.sourceClassSmartSyntaxObserver, state.sourceClassSmartSyntaxEditorKey, state.sourceClassSmartSyntaxContent, editorKey, resolvedContent, state.codeMirrorSyntaxContentMode, state.codeMirrorSyntaxContentEditorKey, state.codeMirrorSyntaxContent, true);
  }

  function stableNativeFallbackLifecycleDecisionForEditor(editor, reason = "stable-editor-lifecycle", path = "stable-editor-lifecycle") {
    if (!editor?.querySelector) {
      return { skip: false, hasEditor: false, reason, path: "no-editor" };
    }
    const editorKey = codeboxEditorCacheKey(editor);
    const previous = state.lastNativeHighlightSourceClassFallbackOwnership || null;
    return shouldSkipStableEditorLifecycleForNativeFallback({
      hasEditor: true,
      editorKey,
      sourceClassActive: editorUsesCodeMirrorSourceClassSyntax(editor),
      sourceClassObserverReady: sourceClassFallbackObserverReadyForEditor(editor),
      previousOwnership: previous,
      nativeReason: previous?.nativeReason || "",
      missingNativeApi: previous?.missingNativeApi || [],
      reason,
      path,
    });
  }

  function suppressStableNativeFallbackEditorLifecycle(editor, decision = {}) {
    const result = {
      at: new Date().toISOString(),
      version: VERSION,
      reason: decision.reason || "stable-editor-lifecycle",
      editorKey: codeboxEditorCacheKey(editor),
      skipped: true,
      attempt: false,
      nativeUnavailable: decision.nativeUnavailable === true,
      nativeReason: decision.nativeReason || "",
      missingNativeApi: decision.missingNativeApi || [],
      sourceClassFallbackActive: true,
      sourceClassActive: decision.sourceClassActive === true,
      sourceClassObserverReady: decision.sourceClassObserverReady === true,
      previousMatches: decision.previousMatches === true,
      stableReason: decision.stableReason === true,
      path: decision.path || "native-unavailable-stable-editor-lifecycle-deduped",
    };
    state.lastNativeHighlightStableEditorLifecycleDedupe = result;
    state.nativeHighlightStableEditorLifecycleDedupedCount = (state.nativeHighlightStableEditorLifecycleDedupedCount || 0) + 1;
    recordPerformanceEvent("syntax.native-highlight.stable-editor-lifecycle-dedupe", 0, `${result.reason}:native=${result.nativeReason}`);
    return result;
  }

  function suppressRememberActiveEditorNativeHighlightInstall(editor, decision = {}) {
    const result = {
      at: new Date().toISOString(),
      version: VERSION,
      reason: decision.reason || "active-editor-cache-stable",
      editorKey: codeboxEditorCacheKey(editor),
      skipped: true,
      attempt: false,
      nativeUnavailable: decision.nativeUnavailable === true,
      nativeReason: decision.nativeReason || "",
      missingNativeApi: decision.missingNativeApi || [],
      sourceClassFallbackActive: true,
      sourceClassActive: decision.sourceClassActive === true,
      previousMatches: decision.previousMatches === true,
      path: decision.path || "native-unavailable-remember-active-editor-deduped",
    };
    state.lastNativeHighlightRememberActiveEditorInstallDedupe = result;
    state.nativeHighlightRememberActiveEditorInstallDedupedCount = (state.nativeHighlightRememberActiveEditorInstallDedupedCount || 0) + 1;
    recordPerformanceEvent("syntax.native-highlight.remember-active-editor-dedupe", 0, `${result.reason}:native=${result.nativeReason}`);
    return result;
  }

  function rememberActiveCodeboxEditor(editor, reason = "active-editor-cache-stable") {
    if (!editor?.querySelector || !state?.activeEditorCache) return "no-editor";
    const key = codeboxEditorCacheKey(editor);
    suppressNativeAutocompleteForEditor(editor, reason);
    // Beyond the active editor, turn native autocomplete off on every other codebox on the surface
    // too (fail-dark; idempotent — first-suppress-wins, repeat sweeps are cheap no-ops).
    try { suppressNativeAutocompleteAcrossSurface(`${reason}:surface`); } catch { /* fail-dark: sweep never breaks the cache */ }
    state.activeEditorCache.editor = editor;
    state.activeEditorCache.key = key;
    state.activeEditorCache.lastReason = reason;
    state.activeEditorCache.noEditorBackoffUntil = 0;
    state.activeEditorCache.dialogNoEditorSince = 0;
    state.activeEditorCache.lastNoEditorSkipReason = "";
    state.activeEditorCache.lastNoEditorMissReason = "";
    try {
      const stableLifecycleDecision = stableNativeFallbackLifecycleDecisionForEditor(editor, reason, "remember-active-editor-stable-lifecycle");
      if (stableLifecycleDecision.skip) {
        suppressStableNativeFallbackEditorLifecycle(editor, stableLifecycleDecision);
      } else {
        const skipRememberDecision = shouldSkipRememberActiveEditorNativeHighlightInstall({
          hasEditor: true,
          editorKey: key,
          sourceClassActive: editorUsesCodeMirrorSourceClassSyntax(editor),
          previousOwnership: state.lastNativeHighlightSourceClassFallbackOwnership || null,
          reason,
        });
        if (skipRememberDecision.skip) suppressRememberActiveEditorNativeHighlightInstall(editor, skipRememberDecision);
        else scheduleNativeHighlightForActiveEditor(editor, `active-editor-${reason}`);
      }
    } catch { /* mid-frame HA mutation */ }
    // Drive the companion layer on the same convergence the styling rides, so it
    // reaches editors discovered by any path (not only the sentinel). Fail-dark: the
    // companion layer never breaks the active-editor cache. Idempotent downstream.
    try { applyCompanionEditorLayer(editor); } catch { /* fail-dark: companion layer never breaks the cache */ }
    return key;
  }

  function styleEditorFromNode(node) {
    if (!node) return null;
    if (node.matches?.(".cm-editor")) return node;
    const closest = node.closest?.(".cm-editor");
    if (closest) return closest;
    const direct = node.querySelector?.(".cm-editor");
    if (direct) return direct;
    const shadow = node.shadowRoot?.querySelector?.(".cm-editor");
    if (shadow) return shadow;
    return null;
  }

  // A CodeMirror nested inside a visual-editor form field (ha-form / ha-selector, e.g. a
  // markdown card's template selector, a condition/action editor, any card-config field that
  // embeds an ha-code-editor) is not the dialog's main codebox. The persistence engine re-applies
  // on open to editors a click never reached, so without this guard those sub-field editors get
  // force-sized to calc(94vh - …) and overflow the card, covering the "Show code editor" toggle.
  // General by construction: a composed-ancestor walk that rejects any form-nested editor, not a
  // specific card type; the dialog's main code editor is never inside ha-form / ha-selector, so it
  // is never rejected.
  function editorInsideVisualFormField(editor) {
    let node = editor;
    let depth = 0;
    while (node && depth++ < 24) {
      try { if (node.matches?.("ha-form, ha-selector")) return true; } catch { /* detached */ }
      const root = node.getRootNode?.();
      node = (root && root.host) ? root.host : (node.parentElement || null);
    }
    return false;
  }

  function visibleStyleEditorCandidate(editor) {
    if (!editor?.querySelector) return false;
    if (!editor.querySelector(".cm-scroller") || !editor.querySelector(".cm-content")) return false;
    const rect = editor.getBoundingClientRect?.();
    // The 200x80 minimum separates the codebox from small embedded editors at discovery. The
    // remembered editor passed it already; on a phone-width screen the plugin's own sizing then
    // makes it narrower than 200px, and dropping it there re-ran discovery on every keystroke.
    // It stays the active editor while it is still laid out.
    const remembered = editor === state?.activeEditorCache?.editor;
    const minWidth = remembered ? 40 : 200;
    const minHeight = remembered ? 20 : 80;
    if (!rect || rect.width < minWidth || rect.height < minHeight) return false;
    const cs = getComputedStyle(editor);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    if (editorInsideVisualFormField(editor)) return false;
    return true;
  }

  function usableBridgeStyleEditorCandidate(detail = null, reason = "bridge-active-editor") {
    const source = detail || (() => { try { return W.__nostrodomusEditorBridgeV1?.active?.() || null; } catch { return null; } })();
    const editor = styleEditorFromNode(source?.cmEditor) ||
      styleEditorFromNode(source?.cmScroller) ||
      styleEditorFromNode(source?.cmContent) ||
      styleEditorFromNode(source?.codeEditor);
    if (!editor?.querySelector) return null;
    const scroller = source?.cmScroller || editor.querySelector?.(".cm-scroller");
    const content = source?.cmContent || editor.querySelector?.(".cm-content");
    if (!scroller || !content) return null;
    if (!editor.isConnected && !scroller.isConnected && !content.isConnected) return null;

    const dialog = source?.dialog || activeEditDialog();
    if (dialog && !(composedContains(dialog, editor) || composedContains(dialog, scroller) || composedContains(dialog, content) || composedContains(dialog, source?.codeEditor))) return null;

    const visibleNode = (node, minWidth = 20, minHeight = 8) => {
      try {
        const rect = node?.getBoundingClientRect?.();
        if (!rect || rect.width < minWidth || rect.height < minHeight) return false;
        const cs = getComputedStyle(node);
        return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0;
      } catch {
        return false;
      }
    };

    const usable = visibleStyleEditorCandidate(editor) ||
      visibleNode(editor, 40, 20) ||
      visibleNode(scroller, 40, 20) ||
      visibleNode(content, 40, 8);
    state.lastBridgeActiveEditorDiscovery = {
      at: new Date().toISOString(),
      version: VERSION,
      reason,
      usable,
      hasEditor: !!editor,
      hasScroller: !!scroller,
      hasContent: !!content,
      hasDialog: !!dialog,
      editorKey: codeboxEditorCacheKey(editor),
    };
    return usable ? editor : null;
  }

  // Nothing cleared state.view when its editor went away, so the last EditorView (and the DOM it
  // holds) stayed reachable and the two guards below never armed again.
  function releaseDetachedEditorView() {
    const view = state.view || state.hookedView;
    if (!view || view.dom?.isConnected !== false) return false;
    if (state.hookedView && state.originalDispatch) {
      try { state.hookedView.dispatch = state.originalDispatch; } catch { /* frozen view */ }
    }
    state.hookedView = null;
    state.originalDispatch = null;
    state.view = null;
    if (state.snippetSession) state.snippetSession = null;
    return true;
  }

  // An open card dialog may still be mounting its code editor, so the no-editor backoff waits. On
  // the visual tab there never is one: after DIALOG_NO_EDITOR_GRACE_MS without an editor the
  // dialog no longer holds the backoff off, or every style pass kept running the full discovery
  // walk for as long as the dialog stayed open. An editor that mounts later is reported by the
  // sentinel, which resets all of this.
  const DIALOG_NO_EDITOR_GRACE_MS = 4000;
  function dialogMayStillMountEditor(cache, now) {
    const open = !!activeEditDialog() || editorLikelyOpeningWithoutMountedCodebox();
    if (!open) {
      cache.dialogNoEditorSince = 0;
      return false;
    }
    if (!cache.dialogNoEditorSince) cache.dialogNoEditorSince = now;
    return now - cache.dialogNoEditorSince < DIALOG_NO_EDITOR_GRACE_MS;
  }

  function activeEditorNoEditorBackoffAllowed(reason = "discover-active-editor") {
    const cache = state.activeEditorCache;
    if (!cache) return false;
    releaseDetachedEditorView();
    if (cache.editor || state.view || state.hookedView) return false;
    if (dialogMayStillMountEditor(cache, Date.now())) return false;
    const now = Date.now();
    const until = Number(cache.noEditorBackoffUntil || 0);
    if (!until || now >= until) return false;
    cache.noEditorSkips += 1;
    cache.lastNoEditorSkipReason = reason;
    recordPerformanceEvent("active-editor-no-editor-backoff-skip", 0, reason);
    return true;
  }

  function rememberActiveEditorNoEditor(reason = "discover-active-editor") {
    const cache = state.activeEditorCache;
    if (!cache) return false;
    releaseDetachedEditorView();
    if (cache.editor || state.view || state.hookedView) return false;
    if (dialogMayStillMountEditor(cache, Date.now())) return false;
    const backoffMs = Number(cache.noEditorBackoffMs || 180);
    cache.lastNoEditorAt = Date.now();
    cache.noEditorBackoffUntil = cache.lastNoEditorAt + Math.max(40, Math.min(500, backoffMs));
    cache.lastNoEditorMissReason = reason;
    recordPerformanceEvent("active-editor-no-editor-backoff-start", 0, reason);
    return true;
  }


  return {
    codeboxEditorCacheKey,
    sourceClassFallbackObserverReadyForEditor,
    stableNativeFallbackLifecycleDecisionForEditor,
    suppressStableNativeFallbackEditorLifecycle,
    suppressRememberActiveEditorNativeHighlightInstall,
    rememberActiveCodeboxEditor,
    styleEditorFromNode,
    visibleStyleEditorCandidate,
    usableBridgeStyleEditorCandidate,
    activeEditorNoEditorBackoffAllowed,
    suppressNativeAutocompleteForEditor,
    suppressNativeAutocompleteAcrossSurface,
    restoreNativeAutocomplete,
    rememberActiveEditorNoEditor,
  };
}
