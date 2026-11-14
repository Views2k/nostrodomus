import test from 'node:test';
import assert from 'node:assert/strict';

import { createActiveEditorCacheRuntime } from '../../src/editor/activeEditorCacheRuntime.js';

test('active editor cache runtime owns stable editor cache keys', () => {
  const host = { dataset: {} };
  const editor = {
    dataset: {},
    getBoundingClientRect: () => ({ left: 1, top: 2, width: 300, height: 120 }),
  };
  const runtime = createActiveEditorCacheRuntime({
    state: {},
    codeboxFrameHostForEditor: () => host,
  });

  const key = runtime.codeboxEditorCacheKey(editor);
  assert.match(key, /^editor-/);
  assert.match(key, /\|host-/);
  assert.equal(runtime.codeboxEditorCacheKey(editor), key);
});

test('active editor cache runtime remembers active codebox editor and schedules native highlight', () => {
  const calls = [];
  const state = {
    activeEditorCache: {
      editor: null,
      key: '',
      lastReason: '',
      noEditorBackoffUntil: 0,
      lastNoEditorSkipReason: 'old',
      lastNoEditorMissReason: 'old',
    },
    lastNativeHighlightSourceClassFallbackOwnership: null,
  };
  const editor = {
    dataset: {},
    querySelector: () => ({}),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 220, height: 80 }),
  };
  const runtime = createActiveEditorCacheRuntime({
    VERSION: 'test-version',
    state,
    codeboxFrameHostForEditor: () => null,
    sourceClassSmartSyntaxObserverReady: () => false,
    shouldSkipStableEditorLifecycleForNativeFallback: () => ({ skip: false }),
    shouldSkipRememberActiveEditorNativeHighlightInstall: () => ({ skip: false }),
    editorUsesCodeMirrorSourceClassSyntax: () => false,
    scheduleNativeHighlightForActiveEditor: (...args) => calls.push(['native', ...args]),
    recordPerformanceEvent: (...args) => calls.push(['perf', ...args]),
  });

  const key = runtime.rememberActiveCodeboxEditor(editor, 'unit-test');
  assert.equal(state.activeEditorCache.editor, editor);
  assert.equal(state.activeEditorCache.key, key);
  assert.equal(state.activeEditorCache.lastReason, 'unit-test');
  assert.equal(state.activeEditorCache.noEditorBackoffUntil, 0);
  assert.equal(state.activeEditorCache.lastNoEditorSkipReason, '');
  assert.equal(state.activeEditorCache.lastNoEditorMissReason, '');
  assert.equal(calls[0][0], 'native');
  assert.equal(calls[0][1], editor);
  assert.equal(calls[0][2], 'active-editor-unit-test');
});

// ABSORB CHECKPOINT A+B reopen regression: the companion layer (scrollbar/enlarge) must
// be driven from the editor-cache convergence — the point EVERY discovery path funnels
// through — not only the editor sentinel. The CHECKPOINT B feel-check failed because a
// real button-card editor was discovered via initialSyntaxPaintGate (a NON-sentinel
// path), so the sentinel never fired and no companion applied. This pins the fix.
test('active editor cache runtime drives the companion layer on the convergence path (non-sentinel discovery)', () => {
  const companionEditors = [];
  const state = {
    activeEditorCache: {
      editor: null, key: '', lastReason: '', noEditorBackoffUntil: 0,
      lastNoEditorSkipReason: '', lastNoEditorMissReason: '',
    },
    lastNativeHighlightSourceClassFallbackOwnership: null,
  };
  const editor = {
    dataset: {},
    querySelector: () => ({}),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 220, height: 80 }),
  };
  const runtime = createActiveEditorCacheRuntime({
    VERSION: 'test-version',
    state,
    codeboxFrameHostForEditor: () => null,
    sourceClassSmartSyntaxObserverReady: () => false,
    shouldSkipStableEditorLifecycleForNativeFallback: () => ({ skip: false }),
    shouldSkipRememberActiveEditorNativeHighlightInstall: () => ({ skip: false }),
    editorUsesCodeMirrorSourceClassSyntax: () => false,
    scheduleNativeHighlightForActiveEditor: () => {},
    recordPerformanceEvent: () => {},
    applyCompanionEditorLayer: (e) => companionEditors.push(e),
  });

  // The 'initial-syntax-paint-gate-microtask' reason mirrors the real failing case.
  runtime.rememberActiveCodeboxEditor(editor, 'initial-syntax-paint-gate-microtask');
  assert.equal(companionEditors.length, 1, 'companion driven exactly once per remembered editor');
  assert.equal(companionEditors[0], editor, 'companion driven with the remembered editor');
});

test('active editor cache runtime companion drive is fail-dark and skips non-editors', () => {
  let companionCalls = 0;
  const state = {
    activeEditorCache: {
      editor: null, key: '', lastReason: '', noEditorBackoffUntil: 0,
      lastNoEditorSkipReason: '', lastNoEditorMissReason: '',
    },
    lastNativeHighlightSourceClassFallbackOwnership: null,
  };
  const runtime = createActiveEditorCacheRuntime({
    VERSION: 'test-version',
    state,
    codeboxFrameHostForEditor: () => null,
    sourceClassSmartSyntaxObserverReady: () => false,
    shouldSkipStableEditorLifecycleForNativeFallback: () => ({ skip: false }),
    shouldSkipRememberActiveEditorNativeHighlightInstall: () => ({ skip: false }),
    editorUsesCodeMirrorSourceClassSyntax: () => false,
    scheduleNativeHighlightForActiveEditor: () => {},
    recordPerformanceEvent: () => {},
    applyCompanionEditorLayer: () => { companionCalls += 1; throw new Error('companion boom'); },
  });

  const editor = {
    dataset: {},
    querySelector: () => ({}),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 220, height: 80 }),
  };
  // A throwing companion hook must NOT break the cache write (fail-dark): the editor is
  // still cached and the cache key still returned.
  const key = runtime.rememberActiveCodeboxEditor(editor, 'unit-faildark');
  assert.equal(state.activeEditorCache.editor, editor);
  assert.match(key, /^editor-/);
  assert.equal(companionCalls, 1);

  // A non-editor takes the early 'no-editor' return BEFORE the companion drive.
  companionCalls = 0;
  assert.equal(runtime.rememberActiveCodeboxEditor(null, 'unit-noeditor'), 'no-editor');
  assert.equal(companionCalls, 0);
});

test('active editor cache runtime owns no-editor backoff guard', () => {
  const calls = [];
  let now = 2000;
  const state = {
    view: null,
    hookedView: null,
    activeEditorCache: {
      editor: null,
      noEditorBackoffMs: 180,
      noEditorBackoffUntil: 0,
      noEditorSkips: 0,
      lastNoEditorSkipReason: '',
      lastNoEditorMissReason: '',
    },
  };
  const runtime = createActiveEditorCacheRuntime({
    state,
    activeEditDialog: () => null,
    editorLikelyOpeningWithoutMountedCodebox: () => false,
    recordPerformanceEvent: (...args) => calls.push(args),
  });

  const originalNow = Date.now;
  Date.now = () => now;
  try {
    assert.equal(runtime.rememberActiveEditorNoEditor('unit-miss'), true);
    assert.equal(state.activeEditorCache.lastNoEditorAt, 2000);
    assert.equal(state.activeEditorCache.lastNoEditorMissReason, 'unit-miss');
    assert.equal(runtime.activeEditorNoEditorBackoffAllowed('unit-skip'), true);
    assert.equal(state.activeEditorCache.noEditorSkips, 1);
    now = state.activeEditorCache.noEditorBackoffUntil + 1;
    assert.equal(runtime.activeEditorNoEditorBackoffAllowed('expired'), false);
  } finally {
    Date.now = originalNow;
  }
});

// ABSORB v17-persistence regression: the persistence engine re-applies on open to editors a
// click never reached, widening discovery's blast radius. A CodeMirror nested in a visual-editor
// form field (ha-form / ha-selector — markdown template selector, condition/action editors, any
// card-config field) is NOT the dialog's main codebox; treating it as one force-sizes it to
// calc(94vh - …) and overflows the card. This pins the GENERAL guard (any form ancestor, not a
// card-type pattern) — it must hold for card types not yet opened.
test('visibleStyleEditorCandidate rejects any CodeMirror nested in ha-form/ha-selector, accepts the main editor', () => {
  const runtime = createActiveEditorCacheRuntime({
    state: {},
    codeboxFrameHostForEditor: () => null,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
  });
  const base = () => ({
    querySelector: () => ({}), // .cm-scroller / .cm-content present
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 300 }),
  });
  // Main code editor: no form-field ancestor -> a valid codebox candidate.
  assert.equal(runtime.visibleStyleEditorCandidate(base()), true, 'main editor is a candidate');

  // Nested in ha-form -> rejected.
  const formAncestor = { matches: (sel) => /ha-form|ha-selector/.test(sel), getRootNode: () => ({}), parentElement: null };
  const formEditor = { ...base(), matches: () => false, getRootNode: () => ({}), parentElement: formAncestor };
  assert.equal(runtime.visibleStyleEditorCandidate(formEditor), false, 'ha-form-nested CM is NOT a codebox candidate');

  // Nested in ha-selector (e.g. ha-selector-template) -> rejected (general, not markdown-specific).
  const selectorAncestor = { matches: (sel) => sel.includes('ha-selector'), getRootNode: () => ({}), parentElement: null };
  const selectorEditor = { ...base(), matches: () => false, getRootNode: () => ({}), parentElement: selectorAncestor };
  assert.equal(runtime.visibleStyleEditorCandidate(selectorEditor), false, 'ha-selector-nested CM is NOT a codebox candidate');
});

test('suppressNativeAutocompleteAcrossSurface turns native off on EVERY codebox host on the surface', () => {
  // Owner bug: HA's native entity dropdown stayed visible in the other codeboxes on a screen, since
  // suppression only ran for the single active editor. The surface sweep turns it off on all of them.
  const mkHost = () => ({ localName: 'ha-code-editor', dataset: {}, autocompleteEntities: true, autocompleteIcons: true });
  const hosts = [mkHost(), mkHost(), mkHost()];
  const state = {};
  const runtime = createActiveEditorCacheRuntime({
    state,
    codeEditorHostsForNativeSuppression: () => hosts,
    recordPerformanceEvent: () => {},
  });

  const count = runtime.suppressNativeAutocompleteAcrossSurface('test-sweep');
  assert.equal(count, 3, 'all three hosts suppressed');
  for (const h of hosts) {
    assert.equal(h.autocompleteEntities, false);
    assert.equal(h.autocompleteIcons, false);
    assert.equal(h.dataset.nostrodomusNativeAutocompleteSuppressed, '1');
  }

  // Restore reverts every swept host (they are tracked in the shared suppressed-hosts set).
  runtime.restoreNativeAutocomplete('test-restore');
  for (const h of hosts) {
    assert.equal(h.autocompleteEntities, true, 'native restored');
    assert.equal(h.autocompleteIcons, true);
  }
});

test('surface sweep respects the replaceNativeAutocomplete setting (off => no suppression)', () => {
  const host = { localName: 'ha-code-editor', dataset: {}, autocompleteEntities: true, autocompleteIcons: true };
  const runtime = createActiveEditorCacheRuntime({
    state: {},
    codeEditorHostsForNativeSuppression: () => [host],
    replaceNativeAutocompleteEnabled: () => false,
    recordPerformanceEvent: () => {},
  });
  assert.equal(runtime.suppressNativeAutocompleteAcrossSurface('test'), 0, 'setting off => sweep is a no-op');
  assert.equal(host.autocompleteEntities, true, 'native left intact when the setting is off');
});

test('surface sweep fail-darks on a hostile host enumerator and a throwing host', () => {
  // A throwing enumerator degrades to zero, never throws.
  const throwingRuntime = createActiveEditorCacheRuntime({
    state: {},
    codeEditorHostsForNativeSuppression: () => { throw new Error('hostile enumerator'); },
    recordPerformanceEvent: () => {},
  });
  assert.equal(throwingRuntime.suppressNativeAutocompleteAcrossSurface('test'), 0);

  // A host whose setter throws degrades that host only; healthy siblings still suppress.
  const healthy = { localName: 'ha-code-editor', dataset: {}, autocompleteEntities: true, autocompleteIcons: true };
  const hostile = { localName: 'ha-code-editor', dataset: {}, set autocompleteEntities(_v) { throw new Error('boom'); }, get autocompleteEntities() { return true; }, autocompleteIcons: true };
  const runtime = createActiveEditorCacheRuntime({
    state: {},
    codeEditorHostsForNativeSuppression: () => [hostile, healthy],
    recordPerformanceEvent: () => {},
  });
  // never throws; the healthy host is still suppressed
  runtime.suppressNativeAutocompleteAcrossSurface('test');
  assert.equal(healthy.autocompleteEntities, false, 'healthy sibling suppressed despite a throwing host');
});


// On a phone-width screen the plugin's own sizing makes the codebox narrower than the 200px
// discovery minimum. The remembered editor was then rejected on every check, so every keystroke
// re-ran discovery.
test('the remembered editor stays a candidate when it becomes narrower than the discovery minimum', () => {
  const previous = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
  try {
    let width = 320;
    const make = () => ({
      dataset: {},
      querySelector: () => ({}),
      getBoundingClientRect: () => ({ left: 0, top: 0, width, height: 240 }),
    });
    const editor = make();
    const other = make();
    const state = { activeEditorCache: { editor: null } };
    const runtime = createActiveEditorCacheRuntime({ state });
    assert.equal(runtime.visibleStyleEditorCandidate(editor), true, 'found at full width');
    state.activeEditorCache.editor = editor;
    width = 150;
    assert.equal(runtime.visibleStyleEditorCandidate(editor), true, 'the remembered editor is kept at 150px');
    assert.equal(runtime.visibleStyleEditorCandidate(other), false, 'another 150px editor is not discovered');
    width = 0;
    assert.equal(runtime.visibleStyleEditorCandidate(editor), false, 'a collapsed editor is dropped');
  } finally {
    globalThis.getComputedStyle = previous;
  }
});

// On the visual tab the open dialog never mounts a code editor. The backoff was held off for as
// long as the dialog stayed open, so every style pass ran the full discovery walk.
test('an open dialog holds the no-editor backoff off only for its opening grace period', () => {
  const realNow = Date.now;
  let clock = 1_000_000;
  Date.now = () => clock;
  try {
    const state = { activeEditorCache: { editor: null, noEditorBackoffUntil: 0, noEditorSkips: 0 } };
    const runtime = createActiveEditorCacheRuntime({
      state,
      activeEditDialog: () => ({}),
      editorLikelyOpeningWithoutMountedCodebox: () => true,
      recordPerformanceEvent: () => {},
    });
    assert.equal(runtime.rememberActiveEditorNoEditor('visual-tab'), false, 'no backoff while the dialog may still mount an editor');
    clock += 3000;
    assert.equal(runtime.rememberActiveEditorNoEditor('visual-tab'), false);
    clock += 1500;
    assert.equal(runtime.rememberActiveEditorNoEditor('visual-tab'), true, 'after the grace period the backoff starts');
    assert.equal(runtime.activeEditorNoEditorBackoffAllowed('style-pass'), true, 'and discovery is skipped while it runs');
    clock += 1000;
    assert.equal(runtime.activeEditorNoEditorBackoffAllowed('style-pass'), false, 'until it expires');
  } finally {
    Date.now = realNow;
  }
});