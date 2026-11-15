import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { installContextDiagnosticsRuntime } from '../../src/diagnostics/contextDiagnosticsRuntime.js';

function emptyDocument() {
  return { activeElement: null, querySelectorAll: () => [] };
}

// app.js installs the context diagnostics outside its boot closure, with no state. By
// then boot has put the public API object, which carries the runtime state, on the window.
test('the active-editor readout records its traversal in the runtime state of the installed API', () => {
  const state = { activeEditorReadoutTargetedTraversals: 0, activeEditorReadoutLegacyWildcardTraversals: 0, lastActiveEditorReadoutTraversal: null };
  const window = { __nostrodomus: { installed: true, state } };
  installContextDiagnosticsRuntime({ window, document: emptyDocument() });

  const readout = window.__nostrodomus.contextDiagnostics.readActiveEditor();
  assert.equal(readout.activeEditor.editorFound, false, 'no editor in an empty document');
  assert.equal(state.activeEditorReadoutTargetedTraversals, 1, 'the traversal counter moves');
  assert.equal(state.activeEditorReadoutTraversalMode, 'targeted');
  assert.equal(state.lastActiveEditorReadoutTraversal.mode, 'targeted');
  assert.equal(state.lastActiveEditorReadoutTraversal.visits, 1);

  window.__nostrodomus.contextDiagnostics.readActiveEditor();
  assert.equal(state.activeEditorReadoutTargetedTraversals, 2);
});

test('the state is looked up when a readout runs, so an API object installed later is found', () => {
  const window = {};
  installContextDiagnosticsRuntime({ window, document: emptyDocument() });
  const api = window.__nostrodomus;
  assert.doesNotThrow(() => api.contextDiagnostics.readActiveEditor(), 'no state yet: nothing to record, no error');

  api.state = { activeEditorReadoutTargetedTraversals: 0 };
  api.contextDiagnostics.readActiveEditor();
  assert.equal(api.state.activeEditorReadoutTargetedTraversals, 1);
});

test('a state passed to the installer is used first', () => {
  const passed = {};
  const window = { __nostrodomus: { state: {} } };
  installContextDiagnosticsRuntime({ window, document: emptyDocument(), state: passed });
  window.__nostrodomus.contextDiagnostics.readActiveEditor();
  assert.equal(passed.activeEditorReadoutTargetedTraversals, 1);
  assert.equal(window.__nostrodomus.state.activeEditorReadoutTargetedTraversals, undefined);
});

test('the installed diagnostics APIs are diagnostics only and do not drive autocomplete', () => {
  const window = {};
  installContextDiagnosticsRuntime({ window, document: emptyDocument() });
  for (const key of ['contextDiagnostics', 'embeddedLanguageDetector']) {
    const api = window.__nostrodomus[key];
    assert.equal(api.diagnosticsOnly, true, `${key} is diagnostics only`);
    assert.equal(api.drivesAutocomplete, false, `${key} does not drive autocomplete`);
  }
});

test('app.js installs the context diagnostics after boot has installed the API object', () => {
  const source = readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8');
  const boot = source.indexOf('await publicApiRuntime.boot();');
  const install = source.indexOf('installContextDiagnosticsRuntime({ window, document });');
  assert.ok(boot > 0 && install > boot, 'the install call follows the boot call');
  assert.equal(source.slice(0, boot).includes('await '), false, 'nothing is awaited before boot, so boot has run when the install call does');
  const api = readFileSync(new URL('../../src/core/publicApiRuntime.js', import.meta.url), 'utf8');
  assert.match(api, /async function boot\(\) \{\s+installPublicAliases\(\);/, 'boot installs the API object before anything else');
  assert.match(api, /api = \{\s+installed: true,\s+version: VERSION,\s+state,/, 'the API object carries the runtime state');
});
