import test from 'node:test';
import assert from 'node:assert/strict';

import { createLoggingRuntime } from '../../src/core/loggingRuntime.js';

// The Copy and Log buttons fell back to a logger that prints only with debug logging on, and
// only once per session, while the button said "Logged".
test('output the user asked for is printed every time, without debug logging', () => {
  const printed = [];
  const original = console.info;
  console.info = (...args) => printed.push(args);
  try {
    const { logInfoOnce } = createLoggingRuntime({ W: {}, health: () => ({}), startupBadgeStatusFromHealth: () => ({}), debugModeEnabled: () => false });
    logInfoOnce('user:health', 'health', { ok: true });
    logInfoOnce('user:health', 'health', { ok: true });
    assert.equal(printed.length, 2);
    logInfoOnce('background-note', 'not requested');
    assert.equal(printed.length, 2, 'other notes stay behind the debug setting');
  } finally {
    console.info = original;
  }
});
