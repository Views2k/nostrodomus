import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The companion settle engine boots after the __nostrodomus installed guard. Booted before it, a
// cache-busted duplicate load of the resource would start a second full engine (home-root subtree
// MutationObserver, 7 capture-phase document listeners, a window focus listener and the settle
// ladder) and then stop at the guard, leaving that engine running with no cleanup (its cleanup is
// in a closure the duplicate never hands to a publicApiRuntime). app.js is a composition
// root with side effects, so the test reads its source, as the picker listener test does.
const source = readFileSync(fileURLToPath(new URL('../../src/app.js', import.meta.url)), 'utf8');

test('settle-engine boot happens after the installed guard', () => {
  const guardIndex = source.indexOf('W.__nostrodomus?.installed');
  const bootIndex = source.indexOf("companionSettleRuntime.boot('install')");
  assert.ok(guardIndex > 0, 'installed guard must exist');
  assert.ok(bootIndex > 0, 'settle boot call must exist');
  assert.ok(guardIndex < bootIndex, 'a duplicate load must bail at the guard before booting a second settle engine');
});

test('settle-engine boot is a single call site inside a try/catch', () => {
  assert.equal(source.split('companionSettleRuntime.boot(').length - 1, 1, 'exactly one boot call site');
  assert.ok(
    source.includes("try { companionSettleRuntime.boot('install'); } catch"),
    'the boot call must stay inside its try/catch, so a failing boot does not stop the install'
  );
});
