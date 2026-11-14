// startup-clean.spec — fresh dashboard load: no pageerror,
// no unexpected console error (both enforced by the session console fixture),
// the public API handle is installed, and the runtime-error diagnostics
// surface is clean (a crash while the bundle boots fails this).

import { test, expect, openDashboard } from './session.mjs';

test('startup clean: runtime installs with a clean diagnostics surface', async ({ page }, testInfo) => {
  const stamp = await openDashboard(page);

  // The public API handle exists and is the running build.
  const handle = await page.evaluate(() => {
    const api = window.__nostrodomus;
    return api ? { installed: api.installed === true, version: String(api.version || '') } : null;
  });
  expect(handle, 'window.__nostrodomus is missing — the runtime never installed').not.toBeNull();
  expect(handle.installed, 'window.__nostrodomus.installed is not true').toBe(true);
  expect(
    handle.version,
    `installed version ${handle.version} is not the seeded build ${stamp.internalVersion}`,
  ).toBe(stamp.internalVersion);

  // The diagnostics runtime-error surface is reachable and clean: ok flag
  // true and zero recorded errors on a fresh boot. The full readout rides in
  // the report either way, so a red here is immediately diagnosable.
  const readout = await page.evaluate(() => {
    const api = window.__nostrodomus;
    return typeof api?.runtimeErrors === 'function' ? api.runtimeErrors() : null;
  });
  await testInfo.attach('runtime-errors.json', {
    body: JSON.stringify(readout, null, 2),
    contentType: 'application/json',
  });
  expect(readout, '__nostrodomus.runtimeErrors() is not callable').not.toBeNull();
  expect(readout.ok, 'runtimeErrors.ok is not true').toBe(true);
  expect(
    readout.stats?.total ?? -1,
    `fresh boot recorded ${readout.stats?.total} runtime error(s): ${JSON.stringify(readout.items)}`,
  ).toBe(0);
});
