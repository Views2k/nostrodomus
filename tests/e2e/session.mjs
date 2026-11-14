// Shared spec session for the E2E suite: frontend auth via localStorage
// hassTokens seeding, whole-session console capture with the binding failure
// policy, and the STALE-RESOURCE GUARD that runs before any other assertion
// (tools/e2e/README.md is the binding contract).

import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { attachConsoleCapture, consoleFailures } from './console-capture.mjs';
import { CONSOLE_ALLOWLIST } from './console-allowlist.mjs';
import { HA_ONBOARDING, HOME_ASSISTANT, HUI_ROOT } from './selectors.mjs';

const ORIGIN = 'http://localhost:8124';
const STATE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'tools',
  'e2e',
  process.env.HA_STATE || '.ha-state',
);

function readStateJson(name) {
  const path = join(STATE_DIR, name);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`cannot read ${path} — run \`npm run e2e:up\` (bootstrap + seed) before the suite.`);
  }
}

export function readStamp() {
  return readStateJson('resource-stamp.json');
}

export const test = base.extend({
  // Frontend auth: an origin-guarded init script writes the bootstrap tokens
  // into localStorage before any document on the HA origin runs, so specs
  // never depend on the login form's DOM (design rationale in the README).
  hassAuth: [
    async ({ context }, use) => {
      const tokens = readStateJson('hass-tokens.json');
      await context.addInitScript(
        ([origin, value]) => {
          try {
            if (window.location.origin === origin) window.localStorage.setItem('hassTokens', value);
          } catch {
            /* about:blank and friends have no storage — ignore */
          }
        },
        [ORIGIN, JSON.stringify(tokens)],
      );
      await use(tokens);
    },
    { auto: true },
  ],

  // Test-side navigation log (round-5 lesson: in-page instrumentation dies
  // with the page; this listener lives in the runner and survives reloads).
  // Every main-frame navigation is timestamped and attached to the report —
  // a spontaneous entry between commanded goto() calls is a reload smoking
  // gun, like the service-worker activation reload this caught.
  navigationLog: [
    async ({ page }, use, testInfo) => {
      const log = [];
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) log.push({ at: new Date().toISOString(), url: frame.url() });
      });
      await use(log);
      await testInfo.attach('navigation-log.json', {
        body: JSON.stringify(log, null, 2),
        contentType: 'application/json',
      });
    },
    { auto: true },
  ],

  // Whole-session console capture; the policy verdict lands at teardown so a
  // late console.error still fails the test that produced it.
  nostrodomusConsole: [
    async ({ page }, use, testInfo) => {
      const capture = attachConsoleCapture(page);
      await use(capture);
      await testInfo.attach('console-capture.json', {
        body: JSON.stringify(capture, null, 2),
        contentType: 'application/json',
      });
      const failures = consoleFailures(capture, CONSOLE_ALLOWLIST);
      if (failures.length > 0) {
        throw new Error(`console policy violations (${failures.length}):\n- ${failures.join('\n- ')}`);
      }
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Navigate to the seeded dashboard and run the stale-resource guard before
 * returning. Every spec starts here; any stale URL is an immediate, loud
 * failure — a real-browser test silently exercising old JS is worse than no
 * test.
 */
export async function openDashboard(page) {
  const stamp = readStamp();
  const nostrodomusRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('nostrodomus')) nostrodomusRequests.push(request.url());
  });

  // Navigate to the seeded dashboard by the explicit URL recorded in the
  // stamp (the OWNED storage-mode dashboard seed.mjs creates). Never rely on
  // '/' (HA 2026.6 made the built-in '/home' overview the default landing
  // panel) and never on the legacy default-Lovelace slot (removed in 2026.6;
  // saving to it is a silent no-op and '/lovelace/*' is not routed — see
  // docs/COMPAT.md).
  if (!stamp.dashboardPath) {
    throw new Error(
      'resource-stamp.json has no dashboardPath — the stamp predates the owned-dashboard seed. Re-run `npm run e2e:up`.',
    );
  }
  await page.goto(stamp.dashboardPath);
  try {
    await page.locator(HUI_ROOT).waitFor({ state: 'attached', timeout: 30000 });
  } catch (error) {
    if (page.url().includes('/auth/')) {
      throw new Error('frontend auth seeding failed — the instance rejected hassTokens and showed the login form. Re-run `npm run e2e:up`.', { cause: error });
    }
    if ((await page.locator(HA_ONBOARDING).count()) > 0) {
      throw new Error('the instance is not onboarded — run `npm run e2e:up` first.', { cause: error });
    }
    throw error;
  }

  // Guard leg 1: the page must have requested EXACTLY the stamped URL.
  await expect
    .poll(() => nostrodomusRequests.length, {
      timeout: 15000,
      message: 'nostrodomus.js was never requested by the page — is the Lovelace resource registered?',
    })
    .toBeGreaterThan(0);
  const expectedSuffix = `?v=${stamp.internalVersion}-${stamp.nonce}`;
  for (const url of nostrodomusRequests) {
    if (!url.endsWith(expectedSuffix)) {
      throw new Error(
        `STALE RESOURCE: the page loaded ${url} but the seed stamp is ${stamp.url} — the suite would be testing old JS. Re-run \`npm run e2e:up\`.`,
      );
    }
  }

  // Guard leg 2: the registered Lovelace resource must equal the stamp.
  await expect
    .poll(
      () =>
        page.evaluate((sel) => {
          const ha = document.querySelector(sel);
          return Boolean(ha && ha.hass && typeof ha.hass.callWS === 'function');
        }, HOME_ASSISTANT),
      { timeout: 15000, message: 'hass connection never became available for the resource check' },
    )
    .toBe(true);
  const resources = await page.evaluate(async (sel) => {
    const ha = document.querySelector(sel);
    return await ha.hass.callWS({ type: 'lovelace/resources' });
  }, HOME_ASSISTANT);
  const registered = (resources || [])
    .map((resource) => String(resource.url))
    .filter((url) => url.split('?')[0].endsWith('nostrodomus.js'));
  if (registered.length !== 1 || registered[0] !== stamp.url) {
    throw new Error(
      `STALE RESOURCE: registered Lovelace resource(s) [${registered.join(', ') || 'none'}] do not match the seed stamp ${stamp.url}. Re-run \`npm run e2e:up\`.`,
    );
  }

  return stamp;
}
