// Playwright config for the real-HA E2E harness (tools/e2e/README.md is the
// binding contract). Runs on the HOST (chromium only until launch) against
// the disposable instance on http://localhost:8124.
//
// retries: 0 is deliberate and binding — flaky-by-design is forbidden;
// stability comes from explicit waits on HA-ready signals, not retries.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.mjs',
  outputDir: '.playwright/output',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60000,
  reporter: [['list'], ['html', { outputFolder: '.playwright/report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:8124',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // HA's service worker installs on first visit in every fresh test
    // profile and reloads the page on activation (~4s after registration —
    // RUN CHECKPOINT 2 round 5: both traces show sw-modern.js fetch, a
    // ~1,400-request precache flood, then a spontaneous double document
    // reload that kills the open edit dialog). Humans never see this
    // (settled profiles); the harness blocks SWs outright — determinism,
    // and one less stale-asset vector alongside the stale-resource guard.
    serviceWorkers: 'block',
    // Every run records video so future reds carry the film natively.
    video: 'on',
  },
});
