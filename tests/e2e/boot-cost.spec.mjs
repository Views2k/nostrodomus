// boot-cost.spec (HARNESS P4) — the kept staged-boot win, validated.
//
// RUN CHECKPOINT 4 measured a phase-A/B install split as NOT worth the boot-path
// complexity: it deferred ~0 ongoing observers and one style node (the runtime
// is already lazy about per-editor work). The decision (c-slim) kept ONLY the
// completion-library deferral: a dashboard that never opens an editor never
// builds the ~184-entry index or registers providers (the real memory cost),
// and `open()` loads it lazily on first use.
//
// This spec proves both halves on an editor-less dashboard: the index is
// deferred, and triggering the public open() loads it on demand. Observers /
// style nodes / listeners are reported to confirm the runtime stays minimal.

import { test, expect, openDashboard } from './session.mjs';

const readOngoingCost = (page) =>
  page.evaluate(() => {
    const st = window.__nostrodomus?.state;
    if (!st) return null;
    const mapSize = (x) => (x && typeof x.size === 'number' ? x.size : 0);
    const arrLen = (x) => (Array.isArray(x) ? x.length : 0);

    let styleNodes = 0;
    const seen = new Set();
    const walk = (root, depth) => {
      if (!root || depth > 25) return;
      try {
        for (const s of root.querySelectorAll?.('style') || []) {
          const id = String(s.id || '');
          if (id.includes('nostrodomus') || s.dataset?.nostrodomusPurpose || s.dataset?.nostrodomus) styleNodes += 1;
        }
      } catch { /* closed root */ }
      try {
        for (const el of root.querySelectorAll?.('*') || []) {
          if (el.shadowRoot && !seen.has(el.shadowRoot)) { seen.add(el.shadowRoot); walk(el.shadowRoot, depth + 1); }
        }
      } catch { /* closed root */ }
    };
    try { walk(document, 0); } catch { /* detached */ }

    const observers =
      mapSize(st.editorSentinelObservers) + mapSize(st.styleRootObservers) +
      mapSize(st.initialSyntaxGateObservers) + mapSize(st.codeboxSlotUnclipObservers) +
      (st.styleRootObserver ? 1 : 0) + (st.styleMutationObserver ? 1 : 0) +
      (st.codeMirrorSyntaxContentObserver ? 1 : 0) + (st.syntaxOwnerObserver ? 1 : 0) +
      (st.sourceClassSmartSyntaxObserver ? 1 : 0);
    const indexKeyCount = st.index?.byLang
      ? Object.values(st.index.byLang).reduce((n, rows) => n + (Array.isArray(rows) ? rows.length : 0), 0)
      : 0;

    return {
      observers,
      sentinelObservers: mapSize(st.editorSentinelObservers),
      persistentListeners: arrLen(st.persistentListeners),
      styleNodes,
      libraryLoaded: !!st.library,
      indexBuilt: !!st.index,
      indexKeyCount,
      providerCount: arrLen(st.providers),
    };
  });

const SETTLE_MS = 1500; // > the sentinel settle probes (60/180/420ms) + margin

test('ongoing cost: an editor-less dashboard defers the completion index until first use', async ({ page }, testInfo) => {
  await openDashboard(page);
  await page.waitForTimeout(SETTLE_MS);

  // Deferred: no completion library/index/providers held in memory, and the
  // runtime stays at its minimal editor-less footprint.
  const deferred = await readOngoingCost(page);
  expect(deferred, 'ongoing-cost readout missing').not.toBeNull();
  expect(deferred.libraryLoaded, 'completion library must be deferred on an editor-less dashboard').toBe(false);
  expect(deferred.indexBuilt, 'completion index must be deferred').toBe(false);
  expect(deferred.indexKeyCount, 'no index keys held in memory when deferred').toBe(0);
  expect(deferred.providerCount, 'no providers registered when deferred').toBe(0);

  // The lazy load happens on first use: the public open() awaits loadLibrary()
  // then bails (no view). After it, the full index/providers are present.
  await page.evaluate(() => window.__nostrodomus?.open?.());
  await page.waitForFunction(() => !!window.__nostrodomus?.state?.library, { timeout: 10000 });
  const loaded = await readOngoingCost(page);
  expect(loaded.libraryLoaded, 'open() must load the completion library on demand').toBe(true);
  expect(loaded.indexKeyCount, 'the index builds on first use').toBeGreaterThan(0);
  expect(loaded.providerCount, 'providers register on first use').toBeGreaterThan(0);

  await testInfo.attach('ongoing-cost.json', { body: JSON.stringify({ deferred, loaded }, null, 2), contentType: 'application/json' });
  const fmt = (o) => `observers=${o.observers} styleNodes=${o.styleNodes} listeners=${o.persistentListeners} indexKeys=${o.indexKeyCount} providers=${o.providerCount} libraryLoaded=${o.libraryLoaded}`;
  const lines = [
    `[ongoing-cost] editor-less (deferred): ${fmt(deferred)}`,
    `[ongoing-cost] after open() (loaded):  ${fmt(loaded)}`,
    `[ongoing-cost] deferred until first editor: indexKeys ${loaded.indexKeyCount}, providers ${loaded.providerCount}, styleNodes ${loaded.styleNodes - deferred.styleNodes}`,
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
  testInfo.annotations.push({ type: 'ongoing-cost', description: lines.join(' | ') });
});
