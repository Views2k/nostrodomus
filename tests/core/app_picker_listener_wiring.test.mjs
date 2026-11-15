import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The two capture-phase companion-picker listeners were
// raw-attached to the document before the __nostrodomus installed guard, so uninstall
// (which only sweeps the persistent-listener registry) could never remove them and a
// duplicate resource load stacked a second permanent pair. app.js is a
// side-effect composition root that cannot be re-run per test, so these are
// source-shape assertions (precedent: tests/snippets/snippet_runtime_wiring.test.mjs).
const source = readFileSync(fileURLToPath(new URL('../../src/app.js', import.meta.url)), 'utf8');

test('picker listeners are not raw-attached to the document', () => {
  assert.ok(
    !source.includes('W.document?.addEventListener?.("pointerdown", companionPickerApply, true)'),
    'raw pointerdown attach must be gone (uninstall cannot remove it)'
  );
  assert.ok(
    !source.includes('W.document?.addEventListener?.("focusin", companionPickerApply, true)'),
    'raw focusin attach must be gone (uninstall cannot remove it)'
  );
});

test('picker listeners ride the persistent-listener registry', () => {
  assert.ok(
    source.includes('addPersistentListener(W.document, "pointerdown", companionPickerApply, true, "companion-picker-pointerdown")'),
    'pointerdown must attach via addPersistentListener'
  );
  assert.ok(
    source.includes('addPersistentListener(W.document, "focusin", companionPickerApply, true, "companion-picker-focusin")'),
    'focusin must attach via addPersistentListener'
  );
});

test('picker listeners attach after the installed guard and after the registry exists', () => {
  const attachIndex = source.indexOf('"companion-picker-pointerdown"');
  const guardIndex = source.indexOf('W.__nostrodomus?.installed');
  const registryIndex = source.indexOf('persistentListenersRuntime = createPersistentListenersRuntime(');
  assert.ok(attachIndex > 0, 'attach site must exist');
  assert.ok(guardIndex > 0, 'installed guard must exist');
  assert.ok(registryIndex > 0, 'registry creation must exist');
  assert.ok(guardIndex < attachIndex, 'a duplicate load must bail at the guard before attaching the pair');
  assert.ok(registryIndex < attachIndex, 'attaching before the registry exists silently no-ops (delegate fallback)');
});
