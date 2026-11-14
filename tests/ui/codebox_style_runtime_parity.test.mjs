// UI_DECOMP P0c — codebox style runtime parity + style-builder snapshots.
//
// Frozen snapshots captured against the pre-decomposition runtime (v0.1.71):
// 1. createCodeboxStyleRuntime's exact public return surface (keys + typeof).
// 2. SHA-256 of codeboxPreflightCss for both root kinds (CSS byte-identity).
// 3. The owned property-level application set: codeboxStyleTokenMap's exact
//    CSS custom-property membership (the property-ownership set behind
//    applyCodeboxStyleTokensToElement) and the STABLE_CODEBOX_STYLE_NODE_IDS
//    membership wherever that set is declared in src/ui (load-bearing for
//    stable-style-node churn protection).
// This test must not be modified during the UI_DECOMP order.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCodeboxStyleRuntime } from '../../src/ui/codeboxStyleRuntime.js';
import { codeboxStyleTokenMap } from '../../src/ui/codeboxStyle.js';
import { DARKPLUS_SYNTAX_COLORS } from '../../src/ui/settingsStyle.js';

const EXPECTED_SURFACE = Object.freeze([
  'activeCodeboxStyleEditor',
  'allowCodeboxFrameOverflow',
  'appendCodeboxPreflightPendingReason',
  'applyCodeboxSlotDialogBodyUnclip',
  'applyCodeboxStyleSettings',
  'attachCodeboxSlotUnclipObserver',
  'attachStyleRootObserver',
  'cancelStyleRangeCommitReapply',
  'cleanupCodeboxSlotUnclip',
  'clearCodeboxStyleSettleReasonState',
  'clearCodeboxStyleSettleTimers',
  'codeboxPreflightCss',
  'codeboxPreflightObserverLabel',
  'codeboxPreflightScanRootLabel',
  'codeboxPreflightScopedObserverEnabled',
  'codeboxPreflightScopedObserverTargets',
  'codeboxPreflightShadowHosts',
  'codeboxPreflightTargetedScanEnabled',
  'codeboxPreflightTargetedScanRoots',
  'codeboxPreflightTargetedShadowTraversalEnabled',
  'codeboxStyleCanUsePassiveStableFastPath',
  'codeboxStyleReasonIsPassiveEditorSettle',
  'disconnectCodeboxPreflightObserver',
  'flushCodeboxStyleReapply',
  'forceCodeboxUnclipTarget',
  'installCodeboxPreflightObserver',
  'installCodeboxPreflightStyle',
  'isCodeboxSlotUnclipTarget',
  'labelCodeboxUnclipTarget',
  'mutationRecordIsNostrodomusStableStyleNode',
  'mutationRecordsContainEditorSurface',
  'nodeLooksLikeEditorSurface',
  'primeCodeboxPreflightForEditor',
  'rememberCodeboxUnclipOriginal',
  'removeCodeboxPreflightStyle',
  'restoreCodeboxUnclipTarget',
  'runCodeboxPreflightMutationScan',
  'scheduleCodeboxPreflightMutationScan',
  'scheduleCodeboxStyleReapply',
  'scheduleStyleRangeCommitReapply',
  'setImportantIfNeeded',
  'shouldCoalesceCodeboxStyleSettleReason',
]);

// Re-pinned for the Nostrodomus rename Stage 2. NOT the UI_DECOMP order: this is the
// separate, owner-approved identity rename. Batch A: --nostrodomus-codebox-* →
// --nostrodomus-codebox-* (CSS custom properties). Batch B: the data-attribute
// selectors in the preflight CSS, data-nostrodomus-assist-* → data-nostrodomus-* (drop
// "assist"). Both are pure token substitution — value-identical (same selectors/
// values), only the names change; re-pinned under the owner visual order + live
// feel-check. OWNED_TOKEN_PROPERTIES below renamed in lockstep; the runtime API
// surface above is unchanged.
const FROZEN_PREFLIGHT_DOCUMENT_SHA256 = 'ae952efb66c4a4fc89fcec8a7a80cbbf16ecd79ffb574f4998ebd90715411148';
const FROZEN_PREFLIGHT_SHADOW_SHA256 = '149423742df2bba2d2d1231ed7475e263b9e17c495a6087364d8c44493f51664';

const OWNED_TOKEN_PROPERTIES = Object.freeze([
  '--nostrodomus-codebox-frame-border',
  '--nostrodomus-codebox-frame-glow',
  '--nostrodomus-codebox-frame-glow-inner',
  '--nostrodomus-codebox-frame-glow-inner-soft',
  '--nostrodomus-codebox-frame-glow-outer',
  '--nostrodomus-codebox-frame-glow-outer-soft',
  '--nostrodomus-codebox-frame-glow-soft',
  '--nostrodomus-codebox-scrollbar-thumb',
  '--nostrodomus-codebox-scrollbar-thumb-border',
  '--nostrodomus-codebox-scrollbar-track',
  '--nostrodomus-codebox-surface',
  '--nostrodomus-codebox-syntax-filter',
]);

const STABLE_CODEBOX_STYLE_NODE_IDS = Object.freeze([
  'nostrodomus-codebox-preflight-style-v1',
  'nostrodomus-codebox-root-style-v1',
]);

function makeRuntime() {
  return createCodeboxStyleRuntime({
    window: { innerWidth: 1200, innerHeight: 900 },
    document: { createElement: () => ({ style: {}, dataset: {} }) },
    state: {},
    recordRuntimeErrorOnce: () => {},
    DARKPLUS_SYNTAX_COLORS,
  });
}

test('codebox style runtime exposes the exact frozen public surface', () => {
  const runtime = makeRuntime();
  assert.deepEqual(Object.keys(runtime).sort(), [...EXPECTED_SURFACE]);
  for (const key of EXPECTED_SURFACE) {
    assert.equal(typeof runtime[key], 'function', `runtime.${key} must remain a function`);
  }
});

test('codeboxPreflightCss stays byte-identical for both root kinds', () => {
  const runtime = makeRuntime();
  const documentCss = runtime.codeboxPreflightCss('document');
  const shadowCss = runtime.codeboxPreflightCss('shadow');
  assert.equal(createHash('sha256').update(documentCss, 'utf8').digest('hex'), FROZEN_PREFLIGHT_DOCUMENT_SHA256, 'preflight CSS (document root) changed — CSS content must stay byte-identical');
  assert.equal(createHash('sha256').update(shadowCss, 'utf8').digest('hex'), FROZEN_PREFLIGHT_SHADOW_SHA256, 'preflight CSS (shadow root) changed — CSS content must stay byte-identical');
});

test('codebox style token map owns exactly the frozen property set', () => {
  const tokens = {
    scrollbarThumb: 'a', scrollbarTrack: 'b', frameBorder: 'c', frameGlow: 'd',
    frameGlowSoft: 'e', frameGlowInner: 'f', frameGlowInnerSoft: 'g',
    frameGlowOuter: 'h', frameGlowOuterSoft: 'i', editorSurface: 'j',
    thumbBorder: 'k', syntaxFilter: 'l',
  };
  assert.deepEqual(Object.keys(codeboxStyleTokenMap(tokens)).sort(), [...OWNED_TOKEN_PROPERTIES]);
});

test('every STABLE_CODEBOX_STYLE_NODE_IDS declaration in src/ui keeps its exact membership', () => {
  const uiDir = join(dirname(fileURLToPath(import.meta.url)), '../../src/ui');
  const declarationPattern = /STABLE_CODEBOX_STYLE_NODE_IDS = new Set\(\[(?<body>[^\]]*)\]/g;
  let declarations = 0;
  for (const entry of readdirSync(uiDir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const text = readFileSync(join(entry.parentPath, entry.name), 'utf8');
    for (const match of text.matchAll(declarationPattern)) {
      declarations += 1;
      const ids = [...match.groups.body.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
      assert.deepEqual(ids, [...STABLE_CODEBOX_STYLE_NODE_IDS], `${entry.name} STABLE_CODEBOX_STYLE_NODE_IDS membership changed`);
    }
  }
  assert.ok(declarations >= 1, 'STABLE_CODEBOX_STYLE_NODE_IDS declaration must exist in src/ui');
});
