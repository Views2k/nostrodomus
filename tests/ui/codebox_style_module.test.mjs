import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  codeboxStyleBuildRootCss,
  codeboxStyleReasonIsSourceClassSteadyState,
  codeboxStyleReasonNeedsSettle,
  codeboxStyleSettleReasonCoalesceDecision,
  codeboxStyleSourceClassSteadyStateSkipDecision,
  codeboxStyleReasonRequiresFullApply,
  codeboxStyleReasonRequiresSyntaxPaint,
  codeboxStyleSignature,
  codeboxStyleTokenMap,
  codeboxStyleTokensFromSettings,
  uiAccentVarsFromSettings,
} from '../../src/ui/codeboxStyle.js';

test('uiAccentVarsFromSettings derives brand/accent (border hue) + scrollbar (scrollbar hue) triplets', () => {
  const def = uiAccentVarsFromSettings({});
  assert.match(def.brand, /^\d+, \d+, \d+$/);
  assert.match(def.accent, /^\d+, \d+, \d+$/);
  assert.match(def.scrollbar, /^\d+, \d+, \d+$/);
  const [br, bg, bb] = def.brand.split(',').map((n) => Number(n));
  assert.ok(bb > br && bb > bg, 'default brand is blue-dominant (matches the default border)');
  const [ar, ag, ab] = def.accent.split(',').map((n) => Number(n));
  assert.ok(ar + ag + ab < br + bg + bb, 'accent is the deeper shade of brand');
  // tracks the border hue: a red border yields a red-dominant accent
  const red = uiAccentVarsFromSettings({ codeboxBorderHue: 0, codeboxBorderSaturation: 1 });
  const [rr, rg, rb] = red.brand.split(',').map((n) => Number(n));
  assert.ok(rr > rg && rr > rb, 'red border hue yields a red-dominant brand');
  // scrollbar tracks the codebox SCROLLBAR hue independently of the border hue
  const split = uiAccentVarsFromSettings({ codeboxBorderHue: 0, codeboxBorderSaturation: 1, scrollbarHue: 240, scrollbarSaturation: 1 });
  const [sbr, sbg, sbb] = split.brand.split(',').map((n) => Number(n));
  const [ssr, ssg, ssb] = split.scrollbar.split(',').map((n) => Number(n));
  assert.ok(sbr > sbg && sbr > sbb, 'border hue 0 -> red-dominant brand');
  assert.ok(ssb > ssr && ssb > ssg, 'scrollbar hue 240 -> blue-dominant scrollbar, independent of border');
  // hostile input never throws and stays a valid triplet
  const bad = uiAccentVarsFromSettings({ codeboxBorderHue: 'x', codeboxBorderSaturation: 'y' });
  assert.match(bad.brand, /^\d+, \d+, \d+$/);
});

test('codeboxStyleTokenMap preserves legacy CSS variable mapping', () => {
  const tokens = {
    scrollbarThumb: 'thumb',
    scrollbarTrack: 'track',
    frameBorder: 'border',
    frameGlow: 'glow',
    frameGlowSoft: 'glow-soft',
    frameGlowInner: 'inner',
    frameGlowInnerSoft: 'inner-soft',
    frameGlowOuter: 'outer',
    frameGlowOuterSoft: 'outer-soft',
    editorSurface: 'surface',
    thumbBorder: 'thumb-border',
    syntaxFilter: 'filter-token',
    ignored: 'ignored',
  };

  assert.deepEqual(codeboxStyleTokenMap(tokens), {
    '--nostrodomus-codebox-scrollbar-thumb': 'thumb',
    '--nostrodomus-codebox-scrollbar-track': 'track',
    '--nostrodomus-codebox-frame-border': 'border',
    '--nostrodomus-codebox-frame-glow': 'glow',
    '--nostrodomus-codebox-frame-glow-soft': 'glow-soft',
    '--nostrodomus-codebox-frame-glow-inner': 'inner',
    '--nostrodomus-codebox-frame-glow-inner-soft': 'inner-soft',
    '--nostrodomus-codebox-frame-glow-outer': 'outer',
    '--nostrodomus-codebox-frame-glow-outer-soft': 'outer-soft',
    '--nostrodomus-codebox-surface': 'surface',
    '--nostrodomus-codebox-scrollbar-thumb-border': 'thumb-border',
    '--nostrodomus-codebox-syntax-filter': 'filter-token',
  });
});


test('codeboxStyleBuildRootCss preserves legacy root CSS selectors and token interpolation', () => {
  const css = codeboxStyleBuildRootCss({
    scrollbarThumb: 'thumb-token',
    scrollbarTrack: 'track-token',
    frameBorder: 'border-token',
    frameGlow: 'glow-token',
    frameGlowSoft: 'glow-soft-token',
    frameGlowInner: 'inner-token',
    frameGlowInnerSoft: 'inner-soft-token',
    frameGlowOuter: 'outer-token',
    frameGlowOuterSoft: 'outer-soft-token',
    editorSurface: 'surface-token',
    size: { value: '17px' },
    syntaxFilter: 'hue-rotate(10deg) saturate(1.20)',
    thumbBorder: 'thumb-border-token',
    syntaxFg: '#abcdef',
  });

  assert.match(css, /ha-code-editor\[data-nostrodomus-codebox-frame-host="1"\]/);
  assert.match(css, /\[data-nostrodomus-codebox-unclip\]/);
  assert.match(css, /\.cm-editor\[data-nostrodomus-codebox-style="1"\] \.cm-scroller/);
  assert.match(css, /--nostrodomus-codebox-scrollbar-thumb: thumb-token;/);
  assert.match(css, /--nostrodomus-codebox-scrollbar-track: track-token;/);
  assert.match(css, /--nostrodomus-codebox-frame-border: border-token;/);
  assert.match(css, /--nostrodomus-codebox-frame-glow: glow-token;/);
  assert.match(css, /--nostrodomus-codebox-frame-glow-soft: glow-soft-token;/);
  assert.match(css, /--nostrodomus-codebox-frame-glow-inner: inner-token;/);
  assert.match(css, /--nostrodomus-codebox-frame-glow-inner-soft: inner-soft-token;/);
  assert.match(css, /--nostrodomus-codebox-frame-glow-outer: outer-token;/);
  assert.match(css, /--nostrodomus-codebox-frame-glow-outer-soft: outer-soft-token;/);
  assert.match(css, /--nostrodomus-codebox-surface: surface-token;/);
  assert.match(css, /--nostrodomus-codebox-syntax-fg: #abcdef;/);
  assert.match(css, /font-size: 17px !important;/);
  assert.match(css, /filter: var\(--nostrodomus-codebox-syntax-filter, hue-rotate\(10deg\) saturate\(1\.20\)\) !important;/);
  assert.match(css, /border: 2px solid var\(--nostrodomus-codebox-scrollbar-thumb-border, thumb-border-token\) !important;/);
  // UNIVERSAL FIX 1: the Dev Tools → Template Result pane (the whole ha-card.render-pane) mirrors the
  // codebox frame — border + glow + uniform frosted surface — with the codebox vars (re)defined on the
  // pane from the same tokens so it stays color-synced.
  assert.match(css, /ha-card\.render-pane\s*\{/);
  assert.match(css, /ha-card\.render-pane\s*\{[^}]*--nostrodomus-codebox-surface: surface-token;/);
  assert.match(css, /ha-card\.render-pane\s*\{[^}]*border: 1px solid var\(--nostrodomus-codebox-frame-border\) !important;/);
  assert.match(css, /ha-card\.render-pane\s*\{[^}]*backdrop-filter: var\(--nostrodomus-codebox-surface-blur\) !important;/);
  assert.match(css, /ha-card\.render-pane\s*\{[^}]*0 0 52px var\(--nostrodomus-codebox-frame-glow-outer-soft\) !important;/);
  // the v0.1.145 partial pre.rendered blur is gone (superseded by the full-pane frame)
  assert.doesNotMatch(css, /pre\.rendered\s*\{/);
});

test('Bug 2 regression: main + preview codebox-style apply paths both include syntaxFilter in their inline-var tokens', () => {
  const mainSrc = readFileSync(new URL('../../src/ui/codeboxStyleRuntime.js', import.meta.url), 'utf8');
  const previewSrc = readFileSync(new URL('../../src/ui/settingsInteractionRuntime.js', import.meta.url), 'utf8');
  // The inline --nostrodomus-codebox-syntax-filter var is emitted from the tokens object. If the main
  // apply path omits syntaxFilter it emits "none" and clobbers .cm-content's tint on reapply, while the
  // preview path (which includes it) still looks right. Both paths must include it so they agree.
  assert.match(mainSrc, /const tokens = \{[^}]*\beditorSurface\b[^}]*\bsyntaxFilter\b[^}]*\}/, 'main apply path tokens include syntaxFilter');
  assert.match(previewSrc, /const tokens = \{[^}]*\bsyntaxFilter\b[^}]*\}/, 'preview path tokens include syntaxFilter');
});

test('Bug 4 regression: applyingCodeboxStyle reset is guarded by try/finally and kept deferred', () => {
  const src = readFileSync(new URL('../../src/ui/codeboxStyleRuntime.js', import.meta.url), 'utf8');
  // The guard set true must be followed by a try, and the reset must live in a finally so a throw between
  // set and reset can never strand the flag true (which permanently gates the observer's reapply). The
  // reset must stay DEFERRED (setTimeout, not synchronous) — the defer holds the guard through the
  // synchronous mutation storm so the just-installed observers don't fire a re-entrant reapply.
  assert.match(src, /state\.applyingCodeboxStyle = true;\s*try \{/, 'guard set is wrapped in try');
  assert.match(src, /\} finally \{\s*setTimeout\(\(\) => \{ state\.applyingCodeboxStyle = false; \}, 0\);\s*\}/, 'reset is deferred inside finally');
});

test('codeboxStyleBuildRootCss drives the active-line wash from activeLineBackground (default wash; transparent hides it)', () => {
  const base = {
    scrollbarThumb: 't', scrollbarTrack: 't', frameBorder: 't', frameGlow: 't', frameGlowSoft: 't',
    frameGlowInner: 't', frameGlowInnerSoft: 't', frameGlowOuter: 't', frameGlowOuterSoft: 't',
    editorSurface: 't', size: { value: '16px' }, syntaxFilter: 'none', thumbBorder: 't',
  };
  // default param: the faint wash (so the pure function's legacy output is unchanged) + HA's native
  // focus borders left intact (no suppression emitted when shown)
  const shown = codeboxStyleBuildRootCss(base);
  assert.match(shown, /\.cm-activeLineGutter \{\s*background: rgba\(255, 255, 255, 0\.045\) !important;/);
  assert.doesNotMatch(shown, /border-top-color: transparent !important;/);
  assert.doesNotMatch(shown, /border-right-color: transparent !important;/);
  // hidden: transparent wash AND suppress the focus-border "90° line" (.cm-content top + .cm-gutters right)
  const hidden = codeboxStyleBuildRootCss({ ...base, activeLineBackground: 'transparent' });
  assert.match(hidden, /\.cm-activeLineGutter \{\s*background: transparent !important;/);
  assert.match(hidden, /\.cm-content \{\s*border-top-color: transparent !important;/);
  assert.match(hidden, /\.cm-gutters\.cm-gutters-before \{\s*border-right-color: transparent !important;/);
});

test('codeboxStyleBuildRootCss preserves default syntax foreground fallback token', () => {
  const css = codeboxStyleBuildRootCss({
    scrollbarThumb: 'thumb',
    scrollbarTrack: 'track',
    frameBorder: 'border',
    frameGlow: 'glow',
    frameGlowSoft: 'glow-soft',
    frameGlowInner: 'inner',
    frameGlowInnerSoft: 'inner-soft',
    frameGlowOuter: 'outer',
    frameGlowOuterSoft: 'outer-soft',
    editorSurface: 'surface',
    size: { value: '14px' },
    syntaxFilter: 'none',
    thumbBorder: 'thumb-border',
  });

  assert.match(css, /--nostrodomus-codebox-syntax-fg: #d4d4d4;/);
  assert.match(css, /var\(--nostrodomus-codebox-syntax-fg, #d4d4d4\)/);
});

test('codeboxStyleSignature preserves legacy stable JSON shape and defaults', () => {
  const signature = codeboxStyleSignature({
    settings: {
      scrollbarStyleEnabled: false,
      codeboxSurfaceEnabled: true,
      syntaxTintEnabled: false,
      syntaxTintPreset: 'dark-plus',
    },
    tokens: { surface: 'rgba(1,2,3,.4)' },
    size: { value: '15px' },
    syntaxFilter: 'filter-token',
    thumbBorder: 'thumb-border',
    frameEnabled: false,
    syntax: {
      active: true,
      hue: 210,
      saturation: 0.8,
      opacity: 0.9,
      themeOpacity: 0.7,
      themeSaturation: 1.1,
    },
  });

  assert.deepEqual(JSON.parse(signature), {
    size: '15px',
    frameEnabled: false,
    scrollbarStyleEnabled: false,
    codeboxSurfaceEnabled: true,
    syntaxTintEnabled: false,
    syntaxTintPreset: 'dark-plus',
    syntaxActive: true,
    syntaxHue: 210,
    syntaxSaturation: 0.8,
    syntaxOpacity: 0.9,
    syntaxThemeOpacity: 0.7,
    syntaxThemeSaturation: 1.1,
    syntaxFilter: 'filter-token',
    thumbBorder: 'thumb-border',
    tokens: { surface: 'rgba(1,2,3,.4)' },
  });
});

test('codeboxStyleSignature preserves v31 legacy truthy default behavior', () => {
  assert.deepEqual(JSON.parse(codeboxStyleSignature({})), {
    size: '',
    frameEnabled: true,
    scrollbarStyleEnabled: true,
    codeboxSurfaceEnabled: true,
    syntaxTintEnabled: true,
    syntaxTintPreset: '',
    syntaxActive: false,
  });
});

test('codeboxStyleReasonRequiresFullApply preserves legacy state and reason triggers', () => {
  assert.equal(codeboxStyleReasonRequiresFullApply('', { lastAppliedAt: 123, cacheInvalidated: false }), false);
  assert.equal(codeboxStyleReasonRequiresFullApply('', { lastAppliedAt: 0, cacheInvalidated: false }), true);
  assert.equal(codeboxStyleReasonRequiresFullApply('', { lastAppliedAt: 123, cacheInvalidated: true }), true);

  for (const reason of [
    'settings-open',
    'install-root-style',
    'style-root-scan',
    'editor-structural-mutation',
    'option-change',
    'range-change',
    'toggle-surface',
    'reset-style',
    'restore-defaults',
  ]) {
    assert.equal(codeboxStyleReasonRequiresFullApply(reason, { lastAppliedAt: 123, cacheInvalidated: false }), true, reason);
  }
});

test('codeboxStyleReasonRequiresSyntaxPaint preserves legacy dirty-editor reason triggers', () => {
  assert.equal(codeboxStyleReasonRequiresSyntaxPaint('', { lastAppliedAt: 123, cacheInvalidated: false }), false);
  assert.equal(codeboxStyleReasonRequiresSyntaxPaint('settings-open', { lastAppliedAt: 123, cacheInvalidated: false }), true);

  for (const reason of [
    'editor-dispatch',
    'syntax-owner-content-change-mutation',
    'remember-view',
    'visible-editor',
    'scroll-settle',
    'focusin',
    'pointer-up',
    'syntax-refresh',
    'content-change',
  ]) {
    assert.equal(codeboxStyleReasonRequiresSyntaxPaint(reason, { lastAppliedAt: 123, cacheInvalidated: false }), true, reason);
  }
});


test('codeboxStyleReasonIsSourceClassSteadyState preserves source-class skip reason matching', () => {
  assert.equal(codeboxStyleReasonIsSourceClassSteadyState(''), false);
  assert.equal(codeboxStyleReasonIsSourceClassSteadyState('typing'), false);
  assert.equal(codeboxStyleReasonIsSourceClassSteadyState(null), false);
  assert.equal(codeboxStyleReasonIsSourceClassSteadyState('EDITOR-DISPATCH'), true);

  for (const reason of [
    'editor-dispatch',
    'outside-pointer-syntax-repaint',
    'editor-focusout-syntax-repaint',
    'syntax-repaint',
    'remember-view',
  ]) {
    assert.equal(codeboxStyleReasonIsSourceClassSteadyState(reason), true, reason);
  }
});


test('codeboxStyleSourceClassSteadyStateSkipDecision preserves legacy skip guards', () => {
  const base = {
    reason: 'editor-dispatch',
    cacheInvalidated: false,
    lastAppliedAt: 123,
    hasEditor: true,
    sourceClassActive: true,
    lastEditorKey: 'editor-a',
    editorKey: 'editor-a',
  };

  assert.deepEqual(codeboxStyleSourceClassSteadyStateSkipDecision(base), {
    skip: true,
    reason: 'source-class-steady-state',
  });
  assert.equal(codeboxStyleSourceClassSteadyStateSkipDecision({ ...base, reason: 'typing' }).skip, false);
  assert.equal(codeboxStyleSourceClassSteadyStateSkipDecision({ ...base, cacheInvalidated: true }).skip, false);
  assert.equal(codeboxStyleSourceClassSteadyStateSkipDecision({ ...base, lastAppliedAt: 0 }).skip, false);
  assert.equal(codeboxStyleSourceClassSteadyStateSkipDecision({ ...base, hasEditor: false }).skip, false);
  assert.equal(codeboxStyleSourceClassSteadyStateSkipDecision({ ...base, sourceClassActive: false }).skip, false);
  assert.equal(codeboxStyleSourceClassSteadyStateSkipDecision({ ...base, editorKey: 'editor-b' }).skip, false);
  assert.equal(codeboxStyleSourceClassSteadyStateSkipDecision({ ...base, lastEditorKey: '', editorKey: 'editor-b' }).skip, true);
});


test('codeboxStyleSettleReasonCoalesceDecision preserves legacy settle coalescing guards', () => {
  assert.deepEqual(codeboxStyleSettleReasonCoalesceDecision({
    reason: 'style-range-change',
    activeTimerCount: 2,
    currentReason: 'style-range-change',
    currentCount: 3,
  }), {
    coalesce: true,
    reason: 'style-range-change',
    count: 3,
  });

  assert.deepEqual(codeboxStyleSettleReasonCoalesceDecision({
    reason: '',
    activeTimerCount: 1,
    currentReason: 'style-settle',
    currentCount: 0,
  }), {
    coalesce: true,
    reason: 'style-settle',
    count: 1,
  });

  assert.equal(codeboxStyleSettleReasonCoalesceDecision({
    reason: 'style-range-change',
    activeTimerCount: 0,
    currentReason: 'style-range-change',
    currentCount: 2,
  }).coalesce, false);
  assert.equal(codeboxStyleSettleReasonCoalesceDecision({
    reason: 'style-range-change',
    activeTimerCount: 1,
    currentReason: 'style-option-change',
    currentCount: 2,
  }).coalesce, false);
});

test('codeboxStyleReasonNeedsSettle preserves legacy bounded settle reasons', () => {
  assert.equal(codeboxStyleReasonNeedsSettle('typing'), false);
  assert.equal(codeboxStyleReasonNeedsSettle('mutation'), false);

  for (const reason of [
    'settings-open',
    'install-style',
    'option-change',
    'range-change',
    'toggle-style',
    'reset-style',
    'restore-style',
    'editor-sentinel-new',
    'editor-sentinel-mutation',
    'no-active-editor',
  ]) {
    assert.equal(codeboxStyleReasonNeedsSettle(reason), true, reason);
  }
});



test('codeboxStyleTokensFromSettings preserves legacy enabled token derivation', () => {
  const tokens = codeboxStyleTokensFromSettings({
    scrollbarStyleEnabled: true,
    codeboxFrameEnabled: true,
    codeboxSurfaceEnabled: true,
    scrollbarHue: 210,
    scrollbarSaturation: 1.1,
    scrollbarOpacity: 0.5,
    codeboxSurfaceHue: 200,
    codeboxSurfaceSaturation: 1.2,
    codeboxSurfaceOpacity: 0.4,
    codeboxBorderHue: 220,
    codeboxBorderSaturation: 1.3,
    codeboxBorderOpacity: 0.7,
    codeboxGlowHue: 190,
    codeboxGlowSaturation: 1.0,
    codeboxGlowOpacity: 0.6,
    codeboxGlowSize: -50,
  }, { defaultStyle: { codeboxGlowSize: -100 } });

  assert.deepEqual(tokens, {
    scrollbarThumb: 'hsla(210, 110%, 62%, 0.500)',
    scrollbarTrack: 'hsla(200, 50%, 10%, 0.168)',
    frameBorder: 'hsla(220, 130%, 65%, 0.700)',
    frameGlow: 'hsla(190, 100%, 64%, 0.600)',
    frameGlowSoft: 'hsla(190, 78%, 64%, 0.348)',
    frameGlowInner: 'hsla(190, 100%, 64%, 0.300)',
    frameGlowInnerSoft: 'hsla(190, 78%, 64%, 0.174)',
    frameGlowOuter: 'hsla(190, 100%, 64%, 0.000)',
    frameGlowOuterSoft: 'hsla(190, 78%, 64%, 0.000)',
    editorSurface: 'hsla(200, 60%, 8%, 0.400)',
    thumbBorder: 'hsla(200, 42%, 8%, 0.700)',
  });
});

test('codeboxStyleTokensFromSettings preserves disabled fallback tokens and default glow size', () => {
  const tokens = codeboxStyleTokensFromSettings({
    scrollbarStyleEnabled: false,
    codeboxFrameEnabled: false,
    codeboxSurfaceEnabled: false,
    codeboxGlowHue: 190,
    codeboxGlowSaturation: 1,
    codeboxGlowOpacity: 0.6,
  }, { defaultStyle: { codeboxGlowSize: 75 } });

  assert.equal(tokens.scrollbarThumb, 'auto');
  assert.equal(tokens.scrollbarTrack, 'rgba(255,255,255,.045)');
  assert.equal(tokens.frameBorder, 'rgba(255,255,255,.10)');
  assert.equal(tokens.frameGlow, 'rgba(0,0,0,0)');
  assert.equal(tokens.frameGlowInner, 'rgba(0,0,0,0)');
  assert.equal(tokens.frameGlowOuter, 'rgba(0,0,0,0)');
  assert.equal(tokens.editorSurface, 'transparent');
  assert.equal(tokens.thumbBorder, 'rgba(10,14,22,.86)');
});
