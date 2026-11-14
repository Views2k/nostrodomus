// Smoke spec (HARNESS P1 / RUN CHECKPOINT 1): the seeded dashboard loads,
// the stale-resource guard passes, the Nostrodomus version banner appears in the
// console, and the whole-session console policy is clean (the policy verdict
// is enforced by the nostrodomusConsole fixture at teardown). Plus the 2026.6
// built-in-overview compat canary (docs/COMPAT.md).

import { test, expect, openDashboard } from './session.mjs';
import { HOME_ASSISTANT } from './selectors.mjs';

test('ha boots: seeded dashboard renders fresh Nostrodomus with a clean console', async ({ page, nostrodomusConsole }) => {
  const stamp = await openDashboard(page);

  // The seeded dashboard actually rendered (entities card from seed.mjs).
  await expect(page.getByText('E2E Demo Entities').first()).toBeVisible({ timeout: 15000 });

  // The Nostrodomus version banner for THIS build appeared in the console
  // (`✦ NOSTRODOMUS   v<semver>   ready`, emitted once at install).
  const semver = /-v(\d+\.\d+\.\d+)-/.exec(stamp.internalVersion)?.[1];
  if (!semver) throw new Error(`cannot parse a semver out of the stamp internalVersion: ${stamp.internalVersion}`);
  await expect
    .poll(
      () =>
        nostrodomusConsole.messages.some(
          (message) => message.text.includes('NOSTRODOMUS') && message.text.includes(`v${semver}`),
        ),
      { timeout: 20000, message: `the Nostrodomus startup banner (v${semver}) never appeared in the console` },
    )
    .toBe(true);
});

// Compat canary (docs/COMPAT.md, observed manually on 2026-06-12): HA
// 2026.6's built-in dashboards (the '/home' Overview and friends) do not
// load custom Lovelace resources even though the resource is registered
// globally. Pin the observed behavior: if this test ever fails, HA changed
// the rule — update docs/COMPAT.md and rethink the product implication for
// users living on built-in dashboards either way.
test('compat canary: the 2026.6 built-in /home overview does not load Lovelace resources', async ({ page }) => {
  const nostrodomusRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('nostrodomus')) nostrodomusRequests.push(request.url());
  });

  await page.goto('/home');
  // The frontend app is up once the hass connection exists (same readiness
  // signal as the stale-resource guard's leg 2).
  await expect
    .poll(
      () =>
        page.evaluate((sel) => {
          const ha = document.querySelector(sel);
          return Boolean(ha && ha.hass && typeof ha.hass.callWS === 'function');
        }, HOME_ASSISTANT),
      { timeout: 30000, message: 'hass connection never became available on /home' },
    )
    .toBe(true);

  // Absence proof: observe-then-assert (the SMOKE.md companion-absence
  // pattern) — give the panel a settle window, then require zero requests.
  await page.waitForTimeout(5000);
  expect(
    nostrodomusRequests,
    `the built-in /home overview requested nostrodomus.js (${nostrodomusRequests.join(', ')}) — 2026.6 behavior changed; update docs/COMPAT.md`,
  ).toHaveLength(0);
});
