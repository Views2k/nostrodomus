import assert from 'node:assert/strict';
import { installRuntimeCoordinator, readRuntimeCoordinatorSnapshot, RUNTIME_COORDINATOR_VERSION } from '../../src/core/runtimeCoordinator.js';

function fakeRoot() {
  let t = 100;
  return {
    performance: { now: () => t },
    advance(ms) { t += ms; },
  };
}

{
  const root = fakeRoot();
  const coordinator = installRuntimeCoordinator(root, { id: 'main', role: 'completion-runtime', version: 'v1' });
  assert.equal(coordinator.version, RUNTIME_COORDINATOR_VERSION);
  assert.equal(readRuntimeCoordinatorSnapshot(root).runtimes.length, 1);

  const same = installRuntimeCoordinator(root, { id: 'picker', role: 'picker-companion-runtime', version: 'v2' });
  assert.equal(same, coordinator, 'subsequent installs reuse the same browser coordinator');
  assert.deepEqual(readRuntimeCoordinatorSnapshot(root).runtimes.map(r => r.id).sort(), ['main', 'picker']);

  coordinator.markQuiet('editor-input', 420, 'repeat-pressure', 'main');
  assert.equal(coordinator.isQuiet('editor-input'), true);
  assert.equal(coordinator.remaining('editor-input'), 420);
  root.advance(500);
  assert.equal(coordinator.isQuiet('editor-input'), false);
}

{
  const root = fakeRoot();
  const coordinator = installRuntimeCoordinator(root, { id: 'v17', role: 'editor-layout-runtime' });
  coordinator.markQuiet('editor-input', 100, 'short', 'v17');
  root.advance(50);
  coordinator.markQuiet('editor-input', 200, 'longer', 'picker');
  const snapshot = coordinator.snapshot();
  assert.equal(snapshot.quietWindows['editor-input'].active, true);
  assert.equal(snapshot.quietWindows['editor-input'].source, 'picker');
  assert.equal(snapshot.quietWindows['editor-input'].remainingMs, 200);

  coordinator.noteSuppression('picker-work', 'deferred', 'picker');
  assert.equal(coordinator.snapshot().lastSuppression.channel, 'picker-work');
}
