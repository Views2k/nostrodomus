import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The companion settle engine booted BEFORE the __nostrodomus installed guard, so a
// cache-busted duplicate resource load stood up a SECOND full engine (home-root
// subtree MutationObserver + 7 capture-phase document listeners + a window focus
// listener + the settle ladder) and then bailed at the guard -- the duplicate engine
// was orphaned forever (its cleanup lives in a closure the duplicate never wires into
// a publicApiRuntime). Same duplicate-load class as the picker-listener fix; same
// source-shape test boundary (main.legacy.js is a side-effect composition root).
const source = readFileSync(fileURLToPath(new URL('../../src/main.legacy.js', import.meta.url)), 'utf8');

test('settle-engine boot happens after the installed guard', () => {
  const guardIndex = source.indexOf('W.__nostrodomus?.installed');
  const bootIndex = source.indexOf("companionSettleRuntime.boot('install')");
  assert.ok(guardIndex > 0, 'installed guard must exist');
  assert.ok(bootIndex > 0, 'settle boot call must exist');
  assert.ok(guardIndex < bootIndex, 'a duplicate load must bail at the guard BEFORE booting a second settle engine');
});

test('settle-engine boot stays a single fail-dark call site', () => {
  assert.equal(source.split('companionSettleRuntime.boot(').length - 1, 1, 'exactly one boot call site');
  assert.ok(
    source.includes("try { companionSettleRuntime.boot('install'); } catch"),
    'the fail-dark wrapper must be retained'
  );
});
