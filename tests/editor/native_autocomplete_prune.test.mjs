import test from 'node:test';
import assert from 'node:assert/strict';

import { createActiveEditorCacheRuntime } from '../../src/editor/activeEditorCacheRuntime.js';

// With native-autocomplete replacement on, each editor-discovery sweep added
// every ha-code-editor host to nativeAutocompleteSuppressedHosts / nativeAutocompleteOriginals, but
// hosts were only removed on a full restore/uninstall. A long session that opened and closed many
// editor dialogs therefore accumulated detached hosts (a leak — the Set/Map held them alive). The
// surface sweep now prunes hosts that have left the DOM.

test('the surface sweep prunes detached ha-code-editor hosts from the suppression registries', () => {
  const state = {
    nativeAutocompleteSuppressedHosts: new Set(),
    nativeAutocompleteOriginals: new Map(),
  };
  const host = (isConnected) => ({ isConnected, localName: 'ha-code-editor', dataset: {} });
  const live = host(true);
  const closed1 = host(false);
  const closed2 = host(false);
  for (const h of [live, closed1, closed2]) {
    state.nativeAutocompleteSuppressedHosts.add(h);
    state.nativeAutocompleteOriginals.set(h, { hadAutocompleteEntities: false, hadAutocompleteIcons: false });
  }

  const runtime = createActiveEditorCacheRuntime({
    state,
    recordPerformanceEvent: () => {},
    replaceNativeAutocompleteEnabled: () => true,
    codeEditorHostsForNativeSuppression: () => [], // no new hosts this sweep; exercise the prune path
  });

  runtime.suppressNativeAutocompleteAcrossSurface('unit-sweep');

  assert.equal(state.nativeAutocompleteSuppressedHosts.size, 1, 'only the live host remains');
  assert.equal(state.nativeAutocompleteSuppressedHosts.has(live), true);
  assert.equal(state.nativeAutocompleteSuppressedHosts.has(closed1), false, 'detached host pruned');
  assert.equal(state.nativeAutocompleteSuppressedHosts.has(closed2), false, 'detached host pruned');
  assert.equal(state.nativeAutocompleteOriginals.has(live), true);
  assert.equal(state.nativeAutocompleteOriginals.has(closed1), false, 'detached original pruned');
  assert.equal(state.nativeAutocompleteOriginals.size, 1);
});

test('the prune only removes hosts with isConnected === false (unknown and true are kept)', () => {
  const state = { nativeAutocompleteSuppressedHosts: new Set(), nativeAutocompleteOriginals: new Map() };
  const live = { isConnected: true, localName: 'ha-code-editor', dataset: {} };
  const unknown = { localName: 'ha-code-editor', dataset: {} }; // no isConnected -> not pruned
  for (const h of [live, unknown]) {
    state.nativeAutocompleteSuppressedHosts.add(h);
    state.nativeAutocompleteOriginals.set(h, {});
  }
  const runtime = createActiveEditorCacheRuntime({
    state, recordPerformanceEvent: () => {}, replaceNativeAutocompleteEnabled: () => true,
    codeEditorHostsForNativeSuppression: () => [],
  });
  runtime.suppressNativeAutocompleteAcrossSurface('unit-sweep');
  assert.equal(state.nativeAutocompleteSuppressedHosts.size, 2, 'live + unknown-connectivity hosts kept');
});
