// What happens while the settings panel is used: the live preview of the Style sliders on the
// editor, deferred saves, the feedback timers of the panel's buttons, and keeping the open tab
// and the scroll positions through a change. Dependencies are injected; the document and window
// are the only browser objects it uses.

import { formatStyleRangeValue, styleRangeGroupTouchesSyntax } from './settingsRange.js';
import { uiAccentVarsFromSettings } from './codeboxStyle.js';
import { insideCardOwnEditor } from '../editor/cardOwnEditor.js';

export function createSettingsInteractionRuntime(ctx = {}) {
  const {
    state,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    requestAnimationFrame = globalThis.requestAnimationFrame?.bind?.(globalThis) || ((fn) => setTimeout(fn, 0)),
    cancelAnimationFrame = globalThis.cancelAnimationFrame?.bind?.(globalThis) || globalThis.clearTimeout,
    setTimeout = globalThis.setTimeout?.bind?.(globalThis),
    clearTimeout = globalThis.clearTimeout?.bind?.(globalThis),
    activeEditDialog = () => null,
    activeCodeboxStyleEditor = () => null,
    applyCodeboxStyleTokensToElement = () => false,
    codeboxEditorCacheKey = () => '',
    codeboxFrameHostForEditor = () => null,
    codeboxStyleSignature = () => '',
    codeboxStyleTokensFromSettings = () => ({}),
    effectiveStyleSettings = () => ({}),
    recordPerformanceEvent = () => {},
    recordRuntimeErrorOnce = () => {},
    measurePerformanceEvent = (name, detail, fn) => fn?.(),
    resolveSyntaxTintSettings = () => ({ active: false, hue: 0, filterBase: 0, saturation: 1 }),
    saveSettings = () => {},
    requestLiveUpdate = () => {},
    shouldRecordPerformanceTelemetry = () => false,
    stylePresetValue = (map, key, fallback) => map?.[key] || fallback,
    STYLE_TEXT_SIZE_PRESETS = {},
  } = ctx;

  function codeboxStyleTokenNamesForStyleRangeGroup(group = '') {
    const text = String(group || '');
    if (text.includes('scrollbar')) return ['--nostrodomus-codebox-scrollbar-thumb'];
    if (text.includes('codeboxBorder')) return ['--nostrodomus-codebox-frame-border'];
    if (text.includes('codeboxGlow')) {
      return [
        '--nostrodomus-codebox-frame-glow',
        '--nostrodomus-codebox-frame-glow-soft',
        '--nostrodomus-codebox-frame-glow-inner',
        '--nostrodomus-codebox-frame-glow-inner-soft',
        '--nostrodomus-codebox-frame-glow-outer',
        '--nostrodomus-codebox-frame-glow-outer-soft',
      ];
    }
    if (text.includes('codeboxSurface')) {
      return [
        '--nostrodomus-codebox-surface',
        '--nostrodomus-codebox-scrollbar-track',
        '--nostrodomus-codebox-scrollbar-thumb-border',
      ];
    }
    if (text.includes('syntax')) return ['--nostrodomus-codebox-syntax-filter'];
    return null;
  }

  function codeboxStyleTokenNamesForStyleRangeGroups(groups = []) {
    const list = Array.isArray(groups) ? groups : [];
    if (!list.length) return null;
    const names = new Set();
    for (const group of list) {
      const groupNames = codeboxStyleTokenNamesForStyleRangeGroup(group);
      if (!groupNames) return null;
      for (const name of groupNames) names.add(name);
    }
    return names.size ? names : null;
  }

  function isCodeMirrorInlineStyleTarget(el) {
    try { return !!el?.matches?.('.cm-editor, .cm-scroller, .cm-content'); } catch { return false; }
  }

  function stableCodeboxStyleTokenTargets(editor = null) {
    const targets = [];
    const seen = new Set();
    const add = (el) => {
      if (!el || seen.has(el) || !el.style) return;
      if (isCodeMirrorInlineStyleTarget(el)) return;
      seen.add(el);
      targets.push(el);
    };

    // Without an editor nothing is written: the codebox variables must not reach the document,
    // the body or the dashboard's cards.
    if (!editor) return targets;

    add(editor);
    add(editor.querySelector?.('.cm-editor'));
    add(editor.querySelector?.('.cm-scroller'));
    add(editor.querySelector?.('.cm-content'));
    const root = editor.getRootNode?.();
    add(root?.host);
    const frameHost = codeboxFrameHostForEditor(editor);
    add(frameHost);
    let node = root?.host || editor;
    for (let i = 0; node && i < 6; i += 1) {
      if (insideCardOwnEditor(node)) break; // the elements of a custom card's own editor are not written on
      add(node);
      node = node.parentElement || node.getRootNode?.()?.host || null;
    }

    return targets;
  }

  function applyCodeboxStyleTokensToStableRoots(tokens, editor = null) {
    for (const target of stableCodeboxStyleTokenTargets(editor)) {
      applyCodeboxStyleTokensToElement(target, tokens);
    }
  }

  function cachedStyleRangeLivePreviewEditor() {
    const editor = state.settingsRangeLivePreviewEditor || null;
    if (!editor?.querySelector || editor.isConnected === false) return null;
    return editor;
  }

  function markCodeboxLivePreviewStyleTarget(target) {
    if (!target?.dataset) return;
    try {
      if (target.matches?.('.cm-editor, .cm-scroller, .cm-content')) {
        target.dataset.nostrodomusCodeboxStyle = '1';
      }
      if (target.matches?.('ha-code-editor') || target.localName === 'ha-code-editor') {
        target.dataset.nostrodomusCodeboxFrameHost = '1';
        target.dataset.nostrodomusCodeboxFrameReady = '1';
        target.dataset.nostrodomusCodeboxFrameVisible = '1';
      }
    } catch { /* detached node */ }
  }

  function markCodeboxLivePreviewTargets(targets = []) {
    for (const target of targets) markCodeboxLivePreviewStyleTarget(target);
  }

  function codeboxLivePreviewTokenTargets(editor = null) {
    if (!editor?.querySelector) return [];
    const editorKey = codeboxEditorCacheKey(editor);
    const cached = Array.isArray(state.settingsRangeLivePreviewTokenTargets) ? state.settingsRangeLivePreviewTokenTargets : [];
    if (cached.length && state.settingsRangeLivePreviewEditorKey === editorKey) {
      state.settingsRangeLivePreviewTargetCacheHits = (state.settingsRangeLivePreviewTargetCacheHits || 0) + 1;
      recordPerformanceEvent('codebox-style-live-preview-target-cache-hit', 0, `targets=${cached.length}`);
      return cached;
    }
    const targets = stableCodeboxStyleTokenTargets(editor).filter(el => el?.style);
    markCodeboxLivePreviewTargets(targets);
    state.settingsRangeLivePreviewEditor = editor;
    state.settingsRangeLivePreviewEditorKey = editorKey;
    state.settingsRangeLivePreviewTokenTargets = targets;
    state.settingsRangeLivePreviewTargetCacheMisses = (state.settingsRangeLivePreviewTargetCacheMisses || 0) + 1;
    recordPerformanceEvent('codebox-style-live-preview-target-cache-miss', 0, `targets=${targets.length}`);
    return targets;
  }

  function primeStyleRangeLivePreviewSession(reason = 'style-range-live-preview-prime') {
    const cached = cachedStyleRangeLivePreviewEditor();
    if (cached) {
      state.settingsRangeLivePreviewEditorCacheHits = (state.settingsRangeLivePreviewEditorCacheHits || 0) + 1;
      recordPerformanceEvent('codebox-style-live-preview-editor-cache-hit', 0, reason);
      return cached;
    }
    const editor = activeCodeboxStyleEditor();
    if (!editor?.querySelector) return null;
    codeboxLivePreviewTokenTargets(editor);
    state.settingsRangeLivePreviewEditorCacheMisses = (state.settingsRangeLivePreviewEditorCacheMisses || 0) + 1;
    recordPerformanceEvent('codebox-style-live-preview-editor-cache-miss', 0, reason);
    return editor;
  }

  function clearStyleRangeLivePreviewCache(reason = 'style-range-preview-clear') {
    if (state.settingsRangeLivePreviewRaf) {
      cancelAnimationFrame(state.settingsRangeLivePreviewRaf);
      state.settingsRangeLivePreviewRaf = 0;
    }
    state.settingsRangeLivePreviewReasons?.clear?.();
    state.settingsRangeLivePreviewEditor = null;
    state.settingsRangeLivePreviewEditorKey = '';
    state.settingsRangeLivePreviewTokenTargets = [];
    state.lastStyleLivePreviewCacheClear = { at: new Date().toISOString(), reason };
  }

  function codeboxStyleLivePreviewSignatureForDiagnostics(settings, tokens, size, syntaxFilter, thumbBorder, frameEnabled, syntax) {
    return codeboxStyleSignature({ settings, tokens, size, syntaxFilter, thumbBorder, frameEnabled, syntax });
  }

  function applyCodeboxStyleLivePreview(reason = 'settings-style-live-preview', options = {}) {
    return measurePerformanceEvent('codebox-style-live-preview', reason, () => {
      const settings = effectiveStyleSettings();
      // The settings panel and the suggestion popup follow the codebox accent while a color bar
      // is dragged (inline tokens on their roots; see uiAccentVarsFromSettings).
      try {
        const accent = uiAccentVarsFromSettings(settings);
        for (const el of [state.settingsPanel, state.overlay]) {
          if (el?.style?.setProperty) {
            el.style.setProperty('--nostrodomus-brand-rgb', accent.brand);
            el.style.setProperty('--nostrodomus-accent-rgb', accent.accent);
            el.style.setProperty('--nostrodomus-scrollbar-rgb', accent.scrollbar);
          }
        }
      } catch { /* accent is decorative; never break live preview */ }
      const size = stylePresetValue(STYLE_TEXT_SIZE_PRESETS, settings.codeTextSize, 'normal');
      const frameEnabled = settings.codeboxFrameEnabled !== false;
      const { scrollbarThumb, scrollbarTrack, frameBorder, frameGlow, frameGlowSoft, frameGlowInner, frameGlowInnerSoft, frameGlowOuter, frameGlowOuterSoft, editorSurface, thumbBorder } = codeboxStyleTokensFromSettings(settings);
      const syntax = resolveSyntaxTintSettings(settings);
      const syntaxFilter = syntax.active
        ? `hue-rotate(${Math.round(syntax.hue - syntax.filterBase)}deg) saturate(${syntax.saturation.toFixed(2)})`
        : 'none';
      const tokens = { scrollbarThumb, scrollbarTrack, frameBorder, frameGlow, frameGlowSoft, frameGlowInner, frameGlowInnerSoft, frameGlowOuter, frameGlowOuterSoft, editorSurface, thumbBorder, syntaxFilter };
      const styleSignature = shouldRecordPerformanceTelemetry('codebox-style-live-preview-signature')
        ? codeboxStyleLivePreviewSignatureForDiagnostics(settings, tokens, size, syntaxFilter, thumbBorder, frameEnabled, syntax)
        : '';
      const editor = cachedStyleRangeLivePreviewEditor() || primeStyleRangeLivePreviewSession(reason);
      if (!editor?.querySelector) return false;

      const groups = Array.isArray(options?.groups) ? options.groups : [];
      const allowedTokenNames = codeboxStyleTokenNamesForStyleRangeGroups(groups);
      const scopedTokenCount = allowedTokenNames?.size || 0;
      const targets = codeboxLivePreviewTokenTargets(editor);
      let tokenTargetsChanged = 0;
      for (const target of targets) {
        if (applyCodeboxStyleTokensToElement(target, tokens, allowedTokenNames)) tokenTargetsChanged += 1;
      }

      if (options?.touchesSyntax) {
        state.settingsRangeLivePreviewSyntaxRefreshSkipped = (state.settingsRangeLivePreviewSyntaxRefreshSkipped || 0) + 1;
        recordPerformanceEvent('codebox-style-live-preview-syntax-repaint-skipped', 0, reason);
      }

      state.settingsRangeLivePreviewFastCount = (state.settingsRangeLivePreviewFastCount || 0) + 1;
      state.settingsRangeLivePreviewRootCssSkipped = (state.settingsRangeLivePreviewRootCssSkipped || 0) + 1;
      state.settingsRangeLivePreviewScopedTokenWrites = (state.settingsRangeLivePreviewScopedTokenWrites || 0) + scopedTokenCount;
      state.codeboxStyleCacheInvalidated = true;
      state.lastStyleLivePreview = {
        at: new Date().toISOString(),
        reason,
        fastPath: true,
        dragSession: true,
        rootCssRebuilt: false,
        rootStyleCount: 0,
        tokenTargets: targets.length,
        tokenTargetsChanged,
        scopedTokenCount,
        groups: groups.slice(0, 8),
        frameEnabled,
        touchesSyntax: !!options?.touchesSyntax,
        syntaxRepaintSkipped: !!options?.touchesSyntax,
        styleSignature,
        editorBound: true,
      };
      recordPerformanceEvent('codebox-style-live-preview-fast', 0, `${reason}:targets=${targets.length}:changed=${tokenTargetsChanged}:tokens=${scopedTokenCount || 'all'}`);
      recordPerformanceEvent('codebox-style-live-preview-root-css-skipped', 0, reason);
      if (scopedTokenCount) recordPerformanceEvent('codebox-style-live-preview-token-scope', 0, `tokens=${scopedTokenCount}`);
      return true;
    });
  }

  function scheduleTimer(setName, fn, delay, reason, scope) {
    const delayMs = Math.max(0, Math.round(Number(delay) || 0));
    const timer = setTimeout(() => {
      state[setName]?.delete?.(timer);
      try {
        if (typeof fn === 'function') fn();
      } catch (err) {
        recordRuntimeErrorOnce(scope, err, { phase: scope.split(':').at(-1) || scope, reason });
      }
    }, delayMs);
    state[setName]?.add?.(timer);
    return timer;
  }

  function clearTimerSet(setName, metricName, reason = 'timer-clear') {
    const timers = Array.from(state[setName] || []);
    for (const timer of timers) {
      try { clearTimeout(timer); } catch (err) { recordRuntimeErrorOnce(`${metricName}:timer-clear`, err, { phase: `clear-${metricName}`, reason }); }
    }
    state[setName]?.clear?.();
    if (timers.length) recordPerformanceEvent(`${metricName}.cleared`, 0, `${timers.length}:${reason}`);
    return timers.length;
  }

  function scheduleSettingsFeedbackReset(fn, delay = 1200, reason = 'settings-feedback-reset') {
    return scheduleTimer('settingsFeedbackTimers', fn, delay, reason, 'settings:feedback-reset');
  }

  function clearSettingsFeedbackTimers(reason = 'settings-feedback-clear') {
    return clearTimerSet('settingsFeedbackTimers', 'settingsFeedbackTimer', reason);
  }

  function scheduleSettingsInteractionRestore(fn, delay = 50, reason = 'settings-interaction-restore') {
    return scheduleTimer('settingsInteractionRestoreTimers', fn, delay, reason, 'settings:interaction-restore');
  }

  function clearSettingsInteractionRestoreTimers(reason = 'settings-interaction-restore-clear') {
    return clearTimerSet('settingsInteractionRestoreTimers', 'settingsInteractionRestoreTimer', reason);
  }

  function schedulePreservedScrollRestore(fn, delay = 50, reason = 'preserved-scroll-restore') {
    return scheduleTimer('preservedScrollRestoreTimers', fn, delay, reason, 'scroll:preserved-restore');
  }

  function clearPreservedScrollRestoreTimers(reason = 'preserved-scroll-restore-clear') {
    return clearTimerSet('preservedScrollRestoreTimers', 'preservedScrollRestoreTimer', reason);
  }

  function settingsBodyScrollTop() {
    const body = state.settingsPanel?.querySelector?.('.nostrodomus-settings-body');
    return body ? body.scrollTop : 0;
  }

  function restoreSettingsBodyScroll(top) {
    const body = state.settingsPanel?.querySelector?.('.nostrodomus-settings-body');
    if (body && Number.isFinite(top)) body.scrollTop = top;
  }

  function captureScrollSnapshot() {
    const items = [];
    const seen = new Set();
    const add = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      try {
        items.push({ el, top: el.scrollTop || 0, left: el.scrollLeft || 0 });
      } catch (err) { recordRuntimeErrorOnce('settings:scroll-snapshot-capture', err, { phase: 'captureScrollSnapshot' }); }
    };

    add(documentRef.scrollingElement || documentRef.documentElement);
    add(documentRef.documentElement);
    add(documentRef.body);
    add(activeEditDialog());

    const viewDom = state.view?.dom;
    let node = viewDom;
    let guard = 0;
    while (node && guard++ < 18) {
      add(node);
      node = node.parentElement || node.getRootNode?.()?.host || null;
    }

    return {
      x: windowRef.scrollX || 0,
      y: windowRef.scrollY || 0,
      items,
    };
  }

  function restoreScrollSnapshot(snapshot) {
    if (!snapshot) return;
    try { windowRef.scrollTo(snapshot.x || 0, snapshot.y || 0); } catch { /* detached node */ }
    for (const item of snapshot.items || []) {
      try {
        item.el.scrollTop = item.top;
        item.el.scrollLeft = item.left;
      } catch { /* detached node */ }
    }
  }

  function preserveScrollDuring(fn) {
    const snapshot = captureScrollSnapshot();
    let result;
    try {
      result = fn?.();
    } finally {
      restoreScrollSnapshot(snapshot);
      requestAnimationFrame(() => restoreScrollSnapshot(snapshot));
      schedulePreservedScrollRestore(() => restoreScrollSnapshot(snapshot), 50, 'preserve-scroll-during');
    }
    return result;
  }

  function captureSettingsInteractionSnapshot() {
    const panel = state.settingsPanel;
    const body = panel?.querySelector?.('.nostrodomus-settings-body') || null;
    const activeSection = panel?.querySelector?.('[data-section].active')?.dataset?.section || null;
    return {
      activeSection,
      top: body?.scrollTop || 0,
      left: body?.scrollLeft || 0,
    };
  }

  function restoreSettingsInteractionSnapshot(snapshot) {
    const panel = state.settingsPanel;
    if (!panel || !snapshot) return;

    if (snapshot.activeSection) {
      for (const tab of panel.querySelectorAll('[data-settings-tab]')) {
        tab.classList.toggle('active', tab.dataset.settingsTab === snapshot.activeSection);
      }
      for (const section of panel.querySelectorAll('[data-section]')) {
        section.classList.toggle('active', section.dataset.section === snapshot.activeSection);
      }
    }

    const body = panel.querySelector?.('.nostrodomus-settings-body');
    if (body) {
      body.scrollTop = snapshot.top || 0;
      body.scrollLeft = snapshot.left || 0;
    }
  }

  function preserveSettingsInteractionDuring(fn, after) {
    const snapshot = captureSettingsInteractionSnapshot();
    let result;
    try {
      result = fn?.();
      after?.(result);
    } finally {
      restoreSettingsInteractionSnapshot(snapshot);
      requestAnimationFrame(() => restoreSettingsInteractionSnapshot(snapshot));
      scheduleSettingsInteractionRestore(() => restoreSettingsInteractionSnapshot(snapshot), 50, 'settings-interaction-preserve');
    }
    return result;
  }

  function applySettingChangePreservingInteraction(reason, mutator, after) {
    return preserveSettingsInteractionDuring(() => {
      const result = mutator?.();
      saveSettings(reason || 'settings');
      requestLiveUpdate(reason || 'settings');
      return result;
    }, after);
  }

  function setSettingsPathValue(path, value) {
    if (!path) return false;
    const parts = String(path).split('.').filter(Boolean);
    if (!parts.length) return false;
    let target = state.settings;
    for (const part of parts.slice(0, -1)) {
      target[part] = target[part] && typeof target[part] === 'object' ? target[part] : {};
      target = target[part];
    }
    target[parts.at(-1)] = value;
    return true;
  }

  function scheduleSettingsSave(reason = 'settings-deferred-save', delay = 380) {
    if (state.settingsSaveTimer) {
      try { clearTimeout(state.settingsSaveTimer); } catch (err) { recordRuntimeErrorOnce('settings:deferred-save-timer-clear', err, { phase: 'scheduleSettingsSave' }); }
      state.settingsSaveTimer = 0;
    }
    state.settingsSavePendingReason = reason;
    state.settingsSaveTimer = setTimeout(() => {
      state.settingsSaveTimer = 0;
      const pendingReason = state.settingsSavePendingReason || reason;
      state.settingsSavePendingReason = '';
      saveSettings(pendingReason);
      state.lastDeferredSettingsSave = { at: new Date().toISOString(), reason: pendingReason };
    }, delay);
  }

  function flushSettingsSave(reason = 'settings-save-commit') {
    if (state.settingsSaveTimer) {
      try { clearTimeout(state.settingsSaveTimer); } catch (err) { recordRuntimeErrorOnce('settings:deferred-save-timer-clear', err, { phase: 'flushSettingsSave' }); }
      state.settingsSaveTimer = 0;
    }
    state.settingsSavePendingReason = '';
    saveSettings(reason);
    requestLiveUpdate(reason);
    state.lastDeferredSettingsSave = { at: new Date().toISOString(), reason, flushed: true };
  }

  function formatStyleRangeValueForInput(input, group, value) {
    const format = input?.dataset?.rangeFormat;
    return formatStyleRangeValue(format, group, value);
  }

  function updateStyleRangeValueLabel(panel, input, group, value) {
    const label = panel?.querySelector?.(`[data-range-value-for="${group}"]`);
    if (label) label.textContent = formatStyleRangeValueForInput(input, group, value);
  }

  function scheduleStyleRangeValueLabelUpdate(panel, input, group, value) {
    const cleanGroup = String(group || '');
    if (!cleanGroup) return false;
    state.settingsRangeValueLabelUpdates = state.settingsRangeValueLabelUpdates instanceof Map
      ? state.settingsRangeValueLabelUpdates
      : new Map();
    state.settingsRangeValueLabelUpdates.set(cleanGroup, { panel, input, group: cleanGroup, value });
    if (state.settingsRangeValueLabelRaf) return true;
    state.settingsRangeValueLabelRaf = requestAnimationFrame(() => {
      state.settingsRangeValueLabelRaf = 0;
      const updates = Array.from(state.settingsRangeValueLabelUpdates?.values?.() || []);
      state.settingsRangeValueLabelUpdates?.clear?.();
      let applied = 0;
      for (const item of updates) {
        if (!item?.input?.isConnected) continue;
        updateStyleRangeValueLabel(item.panel, item.input, item.group, item.value);
        applied += 1;
      }
      state.settingsRangeValueLabelFrameCount = (state.settingsRangeValueLabelFrameCount || 0) + 1;
      state.settingsRangeValueLabelFrameUpdates = (state.settingsRangeValueLabelFrameUpdates || 0) + applied;
      recordPerformanceEvent('style-range-label-raf', 0, `updates=${applied}`);
    });
    return true;
  }

  function scheduleStyleRangeLiveSave(reason = 'style-range-live') {
    if (state.settingsSaveTimer && state.settingsSavePendingReason === reason) {
      state.settingsRangeLiveSaveCoalesces = (state.settingsRangeLiveSaveCoalesces || 0) + 1;
      recordPerformanceEvent('style-range-live-save-coalesced', 0, reason);
      return true;
    }
    state.settingsRangeLiveSaveSchedules = (state.settingsRangeLiveSaveSchedules || 0) + 1;
    scheduleSettingsSave(reason, 900);
    recordPerformanceEvent('style-range-live-save-scheduled', 0, reason);
    return true;
  }

  function applyStyleRangeMutation(group, value) {
    if (!setSettingsPathValue(group, value)) return false;
    if (group === 'style.syntaxTintHue' || group === 'style.syntaxTintSaturation') {
      state.settings.style = state.settings.style && typeof state.settings.style === 'object' ? state.settings.style : {};
      state.settings.style.syntaxTintPreset = 'custom';
      state.settings.style.syntaxTintEnabled = true;
    }
    return true;
  }

  function scheduleStyleRangeLivePreview(group = 'style-range-live') {
    state.settingsRangeLivePreviewReasons?.add?.(String(group || 'style-range-live'));
    if (state.settingsRangeLivePreviewRaf) return true;
    state.settingsRangeLivePreviewRaf = requestAnimationFrame(() => {
      state.settingsRangeLivePreviewRaf = 0;
      const reasons = Array.from(state.settingsRangeLivePreviewReasons || []);
      state.settingsRangeLivePreviewReasons?.clear?.();
      const touchesSyntax = reasons.some(styleRangeGroupTouchesSyntax);
      applyCodeboxStyleLivePreview(touchesSyntax ? 'settings-syntax-live-preview' : 'settings-style-live-preview', { touchesSyntax, groups: reasons });
    });
    return true;
  }

  return {
    applyCodeboxStyleLivePreview,
    applyCodeboxStyleTokensToStableRoots,
    applySettingChangePreservingInteraction,
    applyStyleRangeMutation,
    cachedStyleRangeLivePreviewEditor,
    captureScrollSnapshot,
    captureSettingsInteractionSnapshot,
    clearPreservedScrollRestoreTimers,
    clearSettingsFeedbackTimers,
    clearSettingsInteractionRestoreTimers,
    clearStyleRangeLivePreviewCache,
    codeboxLivePreviewTokenTargets,
    codeboxStyleTokenNamesForStyleRangeGroup,
    codeboxStyleTokenNamesForStyleRangeGroups,
    flushSettingsSave,
    formatStyleRangeValueForInput,
    markCodeboxLivePreviewStyleTarget,
    markCodeboxLivePreviewTargets,
    preserveScrollDuring,
    preserveSettingsInteractionDuring,
    primeStyleRangeLivePreviewSession,
    restoreScrollSnapshot,
    restoreSettingsBodyScroll,
    restoreSettingsInteractionSnapshot,
    schedulePreservedScrollRestore,
    scheduleSettingsFeedbackReset,
    scheduleSettingsInteractionRestore,
    scheduleSettingsSave,
    scheduleStyleRangeLivePreview,
    scheduleStyleRangeLiveSave,
    scheduleStyleRangeValueLabelUpdate,
    settingsBodyScrollTop,
    setSettingsPathValue,
    stableCodeboxStyleTokenTargets,
    updateStyleRangeValueLabel,
  };
}
